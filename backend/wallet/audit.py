"""Immutable audit trail — every mutating financial action is logged here.

Never modified after insert. Kept forever for regulatory / forensic review.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from .constants import ID_PREFIX_AUDIT


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def log(
    db: AsyncIOMotorDatabase,
    *,
    action: str,
    actor_id: str,
    actor_role: str = "user",
    target_type: str,
    target_id: Optional[str] = None,
    amount_xof: Optional[int] = None,
    before: Optional[dict] = None,
    after: Optional[dict] = None,
    reason: Optional[str] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    extra: Optional[dict] = None,
) -> str:
    """Insert an audit log entry. Returns the id."""
    aid = f"{ID_PREFIX_AUDIT}{uuid.uuid4().hex}"
    doc: dict[str, Any] = {
        "id": aid,
        "action": action,
        "actor_id": actor_id,
        "actor_role": actor_role,
        "target_type": target_type,
        "target_id": target_id,
        "amount_xof": amount_xof,
        "before": before or None,
        "after": after or None,
        "reason": reason,
        "ip": ip,
        "user_agent": user_agent,
        "extra": extra or None,
        "at": _now_iso(),
    }
    try:
        await db.wallet_audit_logs.insert_one(doc)
    except Exception:
        # Never fail a financial operation because audit log write failed.
        # A separate reconciler will detect the gap.
        pass
    return aid


async def list_for_target(
    db: AsyncIOMotorDatabase,
    target_type: str,
    target_id: str,
    limit: int = 100,
) -> list[dict]:
    cur = db.wallet_audit_logs.find(
        {"target_type": target_type, "target_id": target_id},
        {"_id": 0},
    ).sort("at", -1).limit(limit)
    return await cur.to_list(limit)
