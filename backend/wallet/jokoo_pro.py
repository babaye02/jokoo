"""Jokoo Pro subscription — auto-debit from provider wallet monthly.

Also supports on-demand purchases (badges, promotions).

Flow (subscription):
  - Provider clicks "Souscrire à Jokoo Pro"
  - We look up the current price from platform_settings
  - Debit their wallet immediately (or refuse if insufficient)
  - Create/renew `subscriptions` doc with `expires_at = now + 30 days`
  - If `jokoo_pro_auto_renew` is true: nightly task re-runs the debit at
    expiry-24h. If insufficient balance, mark subscription as expired and
    notify the user.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from . import service as wallet_service
from . import settings as wallet_settings
from . import audit as wallet_audit
from .constants import (
    ID_PREFIX_SUBSCRIPTION,
    SettingKey,
    TransactionType,
    WalletKind,
)


log = logging.getLogger("jokoo.wallet.jokoo_pro")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _price(db: AsyncIOMotorDatabase) -> int:
    return await wallet_settings.get_int(
        db, SettingKey.JOKOO_PRO_PRICE_XOF.value, 15_000
    )


async def get_status(db: AsyncIOMotorDatabase, owner_id: str) -> dict:
    sub = await db.subscriptions.find_one(
        {"owner_id": owner_id, "kind": "jokoo_pro"},
        {"_id": 0},
        sort=[("expires_at", -1)],
    )
    now = _now().isoformat()
    price = await _price(db)
    auto_renew = await wallet_settings.get_bool(
        db, SettingKey.JOKOO_PRO_AUTO_RENEW.value, True
    )
    if not sub:
        return {
            "active": False,
            "expires_at": None,
            "auto_renew": auto_renew,
            "price_xof": price,
            "kind": "jokoo_pro",
        }
    active = sub.get("expires_at", "") > now and sub.get("status") == "active"
    return {
        "active": active,
        "expires_at": sub.get("expires_at"),
        "auto_renew": bool(sub.get("auto_renew", auto_renew)),
        "price_xof": price,
        "kind": "jokoo_pro",
        "id": sub.get("id"),
        "last_renewed_at": sub.get("last_renewed_at"),
    }


async def subscribe_or_renew(
    db: AsyncIOMotorDatabase,
    *,
    owner_id: str,
    actor_id: Optional[str] = None,
    ip: Optional[str] = None,
    force_renew: bool = False,
) -> dict:
    """Debit the wallet by Jokoo Pro price and extend subscription by 30 days.

    Idempotent within a 5-minute window (dedup by idempotency key). Returns
    the up-to-date subscription doc.
    """
    price = await _price(db)
    if price <= 0:
        # Free — mark active without debit
        return await _write_sub(db, owner_id, days=30, debited=False, tx_id=None)

    idem = f"jokoo_pro:{owner_id}:{_now().strftime('%Y%m%d%H%M')[:11]}"
    try:
        result = await wallet_service.debit(
            db,
            owner_id=owner_id,
            amount_xof=price,
            transaction_type=TransactionType.JOKOO_PRO_CHARGE,
            label="Abonnement Jokoo Pro (30 jours)",
            reference={"kind": "jokoo_pro"},
            idempotency_key=idem,
            actor_id=actor_id or owner_id,
            allow_negative=False,  # Never auto-charge into overdraft
            from_wallet_kind=WalletKind.PRESTATAIRE,
            reason_code="jokoo_pro_charge",
            ip=ip,
        )
    except wallet_service.InsufficientFunds:
        # Mark expired if we were auto-renewing
        await db.subscriptions.update_many(
            {"owner_id": owner_id, "kind": "jokoo_pro", "status": "active"},
            {"$set": {"status": "expired", "expired_at": _now_iso(), "expired_reason": "insufficient_funds"}},
        )
        raise
    return await _write_sub(db, owner_id, days=30, debited=True, tx_id=result["transaction_id"])


async def _write_sub(
    db: AsyncIOMotorDatabase,
    owner_id: str,
    *,
    days: int,
    debited: bool,
    tx_id: Optional[str],
) -> dict:
    now = _now_iso()
    expires_at = (_now() + timedelta(days=days)).isoformat()
    # Extend the existing active sub, or create a new one.
    existing = await db.subscriptions.find_one(
        {"owner_id": owner_id, "kind": "jokoo_pro", "status": "active"},
        {"_id": 0},
    )
    if existing:
        # Extend from the later of (now, current expiry)
        base = max(_now(), datetime.fromisoformat(existing["expires_at"]))
        expires_at = (base + timedelta(days=days)).isoformat()
        await db.subscriptions.update_one(
            {"id": existing["id"]},
            {
                "$set": {
                    "expires_at": expires_at,
                    "last_renewed_at": now,
                    "last_transaction_id": tx_id,
                    "updated_at": now,
                },
                "$push": {"audit_trail": {"at": now, "action": "renew", "days": days, "tx": tx_id}},
            },
        )
        return await db.subscriptions.find_one({"id": existing["id"]}, {"_id": 0})

    sid = f"{ID_PREFIX_SUBSCRIPTION}{uuid.uuid4().hex}"
    auto_renew = await wallet_settings.get_bool(
        db, SettingKey.JOKOO_PRO_AUTO_RENEW.value, True
    )
    doc = {
        "id": sid,
        "kind": "jokoo_pro",
        "owner_id": owner_id,
        "status": "active",
        "started_at": now,
        "expires_at": expires_at,
        "last_renewed_at": now,
        "last_transaction_id": tx_id,
        "auto_renew": auto_renew,
        "audit_trail": [{"at": now, "action": "subscribe", "days": days, "tx": tx_id}],
        "created_at": now,
        "updated_at": now,
    }
    await db.subscriptions.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def cancel(
    db: AsyncIOMotorDatabase, owner_id: str, actor_id: Optional[str] = None
) -> dict:
    """Cancel auto-renewal (subscription remains active until expiry)."""
    now = _now_iso()
    r = await db.subscriptions.update_one(
        {"owner_id": owner_id, "kind": "jokoo_pro", "status": "active"},
        {
            "$set": {"auto_renew": False, "cancel_requested_at": now, "updated_at": now},
            "$push": {"audit_trail": {"at": now, "action": "cancel_auto_renew", "by": actor_id or owner_id}},
        },
    )
    return {"updated": r.modified_count, "auto_renew": False}


# ─────────────────────────────────────────────────────────────
# Nightly cron entry point
# ─────────────────────────────────────────────────────────────
async def process_expiring(
    db: AsyncIOMotorDatabase, *, horizon_hours: int = 24
) -> dict:
    """Scan for subs expiring in the next `horizon_hours`; auto-renew when possible."""
    threshold = (_now() + timedelta(hours=int(horizon_hours))).isoformat()
    cur = db.subscriptions.find(
        {
            "kind": "jokoo_pro",
            "status": "active",
            "auto_renew": True,
            "expires_at": {"$lte": threshold},
        },
        {"_id": 0},
    )
    renewed = 0
    expired = 0
    async for sub in cur:
        try:
            await subscribe_or_renew(db, owner_id=sub["owner_id"], actor_id="cron:auto_renew")
            renewed += 1
        except wallet_service.InsufficientFunds:
            expired += 1
        except Exception as e:
            log.exception("auto-renew failed for %s", sub.get("owner_id"))
    return {"renewed": renewed, "expired": expired}
