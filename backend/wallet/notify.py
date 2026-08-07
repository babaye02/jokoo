"""Wallet notifications — thin wrapper around the main `send_push` + DB insert.

Every financial event (recharge confirmed, withdrawal paid, commission debited,
refund completed, jokoo pro renewed/expired) triggers an in-app notif AND a
mobile push (if the recipient has push tokens registered).

The push helper is injected from `server.py` at import time to avoid a
circular import.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase


log = logging.getLogger("jokoo.wallet.notify")


# Injected at import time from server.py to avoid circular imports.
_SEND_PUSH: Optional[Callable[..., Any]] = None


def bind_push(send_push: Callable[..., Any]) -> None:
    """Bind the real `send_push` implementation from server.py."""
    global _SEND_PUSH
    _SEND_PUSH = send_push


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def notify(
    db: AsyncIOMotorDatabase,
    *,
    user_id: str,
    kind: str,
    title: str,
    body: str,
    action_url: Optional[str] = None,
    extra: Optional[dict] = None,
) -> None:
    """Insert in-app notification + trigger push (best-effort, non-blocking)."""
    try:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": kind,
            "title": title,
            "body": body,
            "action_url": action_url,
            "extra": extra or {},
            "read": False,
            "created_at": _now_iso(),
        })
    except Exception as e:
        log.warning("notif insert failed for user=%s kind=%s: %s", user_id, kind, e)

    if _SEND_PUSH is None:
        return  # push not bound yet — safe no-op
    try:
        await _SEND_PUSH(
            recipients=[user_id],
            data={
                "title": title,
                "message": body,
                "action_url": action_url or "/wallet",
            },
        )
    except Exception as e:
        log.warning("push failed for user=%s kind=%s: %s", user_id, kind, e)
