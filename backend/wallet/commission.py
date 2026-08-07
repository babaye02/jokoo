"""Commission engine — per-category rules, resolved server-side.

- Rules stored in `commission_rules` collection (upsert by `category_key`).
- Fallback: `commission_default_percent` from platform_settings.
- Applies to all money movements Jokoo skims from: cash bookings, electronic
  bookings, promotion, jokoo_pro, etc. (each caller decides which rule to look up).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from . import service as wallet_service
from . import settings as wallet_settings
from .constants import (
    ID_PREFIX_COMMISSION,
    JOKOO_MASTER_OWNER_ID,
    SettingKey,
    TransactionType,
    WalletKind,
)


log = logging.getLogger("jokoo.wallet.commission")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────
# Rule lookup (with fallback chain)
# ─────────────────────────────────────────────────────────────
async def resolve_rule(
    db: AsyncIOMotorDatabase, category_key: Optional[str]
) -> dict:
    """Return the applicable commission rule for a category.

    Fallback chain:
      1. Exact match on `category_key`.
      2. `mobility.*` matches `mobility.carpool`, `mobility.parcel`.
      3. `family.*`   matches `family.babysitting`, `family.tutoring`.
      4. `*` (global override).
      5. Hard-coded from `commission_default_percent` platform setting.
    """
    key = (category_key or "").strip().lower()
    lookups: list[str] = []
    if key:
        lookups.append(key)
        if "." in key:
            prefix = key.split(".", 1)[0]
            lookups.append(f"{prefix}.*")
    lookups.append("*")

    rule = None
    for candidate in lookups:
        r = await db.commission_rules.find_one(
            {"category_key": candidate, "active": True}, {"_id": 0}
        )
        if r:
            rule = r
            break

    if not rule:
        pct = await wallet_settings.get_float(
            db, SettingKey.COMMISSION_DEFAULT_PERCENT.value, 15.0
        )
        rule = {
            "id": None,
            "category_key": key or "*",
            "commission_percent": pct,
            "min_commission_xof": 0,
            "max_commission_xof": None,
            "active": True,
            "source": "platform_default",
        }
    return rule


def compute_amount(rule: dict, base_amount_xof: int) -> int:
    """Given a rule and a base amount, return the commission in XOF (integer)."""
    if base_amount_xof <= 0:
        return 0
    pct = float(rule.get("commission_percent") or 0)
    raw = (float(base_amount_xof) * pct) / 100.0
    # Bankers rounding for fairness; XOF has no cents so integer.
    amt = int(round(raw))
    mn = int(rule.get("min_commission_xof") or 0)
    mx = rule.get("max_commission_xof")
    if amt < mn:
        amt = mn
    if mx is not None:
        try:
            mx = int(mx)
            if amt > mx:
                amt = mx
        except Exception:
            pass
    # Never take more than the base amount itself.
    if amt > base_amount_xof:
        amt = base_amount_xof
    return int(max(0, amt))


# ─────────────────────────────────────────────────────────────
# The Big One — Cash-paid booking → debit provider commission
# ─────────────────────────────────────────────────────────────
async def charge_cash_commission(
    db: AsyncIOMotorDatabase,
    *,
    booking: dict,
    actor_id: Optional[str] = None,
    ip: Optional[str] = None,
) -> dict:
    """The client paid the provider in cash. Jokoo automatically debits its
    commission from the provider's wallet.

    Idempotent per booking: calling twice returns the same result.
    """
    booking_id = booking.get("id") or booking.get("booking_id")
    if not booking_id:
        raise wallet_service.WalletError("Booking id manquant")

    provider_user_id = booking.get("provider_user_id") or booking.get("provider_id")
    if not provider_user_id:
        # Fall back: look up provider record
        prov_id = booking.get("provider_id")
        if prov_id:
            prov = await db.providers.find_one({"id": prov_id}, {"_id": 0, "user_id": 1})
            if prov:
                provider_user_id = prov.get("user_id")
    if not provider_user_id:
        raise wallet_service.WalletError("Prestataire introuvable pour la commission")

    # Amount owed by client to provider (cash exchanged off-platform)
    base_amount = _extract_booking_price(booking)
    if base_amount <= 0:
        return {
            "skipped": True,
            "reason": "no_price",
            "booking_id": booking_id,
        }

    # Resolve rule for this booking's category
    category_key = _extract_category_key(booking)
    rule = await resolve_rule(db, category_key)
    commission_xof = compute_amount(rule, base_amount)

    if commission_xof <= 0:
        return {
            "skipped": True,
            "reason": "zero_commission",
            "booking_id": booking_id,
            "base_amount_xof": base_amount,
            "rule": rule,
        }

    # Persist the resolved commission on the booking (for audit UI)
    now = _now_iso()
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "commission_computed_xof": commission_xof,
            "commission_rate_percent": rule["commission_percent"],
            "commission_category_key": rule["category_key"],
            "commission_computed_at": now,
        }},
    )

    # The actual money movement: debit provider, credit platform.
    # `allow_negative=True` because the provider may not have enough — they've
    # already received cash from the client and now owe Jokoo. The wallet
    # goes negative up to the platform-wide floor.
    idem = f"cash_commission:{booking_id}"
    try:
        result = await wallet_service.debit(
            db,
            owner_id=provider_user_id,
            amount_xof=commission_xof,
            transaction_type=TransactionType.CASH_COMMISSION,
            label=f"Commission Jokoo — Réservation #{booking_id[:8]}",
            reference={
                "booking_id": booking_id,
                "base_amount_xof": base_amount,
                "commission_rate_percent": rule["commission_percent"],
                "commission_category_key": rule["category_key"],
            },
            idempotency_key=idem,
            actor_id=actor_id or "system",
            allow_negative=True,
            from_wallet_kind=WalletKind.PRESTATAIRE,
            reason_code="cash_commission",
            provider="cash",
            ip=ip,
        )
        # Mark booking commission as paid (audit UI)
        await db.bookings.update_one(
            {"id": booking_id},
            {"$set": {
                "commission_status": "collected",
                "commission_transaction_id": result["transaction_id"],
                "commission_collected_at": now,
            }},
        )
        return {
            "collected": True,
            "commission_xof": commission_xof,
            "base_amount_xof": base_amount,
            "rate_percent": rule["commission_percent"],
            "transaction_id": result["transaction_id"],
            "provider_balance_after_xof": result["from_balance_after"],
            "booking_id": booking_id,
        }
    except wallet_service.InsufficientFunds as e:
        # Provider deeply in the red — flag the booking for admin follow-up.
        await db.bookings.update_one(
            {"id": booking_id},
            {"$set": {
                "commission_status": "insufficient_funds",
                "commission_last_error": str(e),
                "commission_last_attempt_at": now,
            }},
        )
        raise


# ─────────────────────────────────────────────────────────────
# Rules admin
# ─────────────────────────────────────────────────────────────
async def upsert_rule(
    db: AsyncIOMotorDatabase,
    *,
    category_key: str,
    commission_percent: float,
    min_commission_xof: int = 0,
    max_commission_xof: Optional[int] = None,
    active: bool = True,
    notes: Optional[str] = None,
    actor_id: str,
) -> dict:
    now = _now_iso()
    key = category_key.strip().lower()
    existing = await db.commission_rules.find_one({"category_key": key}, {"_id": 0})
    doc = {
        "id": existing["id"] if existing else f"{ID_PREFIX_COMMISSION}{uuid.uuid4().hex}",
        "category_key": key,
        "commission_percent": float(commission_percent),
        "min_commission_xof": int(min_commission_xof),
        "max_commission_xof": int(max_commission_xof) if max_commission_xof is not None else None,
        "active": bool(active),
        "notes": notes,
        "updated_at": now,
        "updated_by": actor_id,
    }
    if existing:
        await db.commission_rules.update_one({"category_key": key}, {"$set": doc})
    else:
        doc["created_at"] = now
        await db.commission_rules.insert_one(doc)
    # Motor mutates `doc` by injecting `_id: ObjectId(...)`. Strip it so FastAPI
    # can JSON-encode the response cleanly.
    doc.pop("_id", None)
    return doc


async def list_rules(db: AsyncIOMotorDatabase) -> list[dict]:
    cur = db.commission_rules.find({}, {"_id": 0}).sort("category_key", 1)
    return await cur.to_list(500)


async def delete_rule(db: AsyncIOMotorDatabase, category_key: str) -> None:
    await db.commission_rules.delete_one({"category_key": category_key.strip().lower()})


# ─────────────────────────────────────────────────────────────
# Booking helpers
# ─────────────────────────────────────────────────────────────
def _extract_booking_price(booking: dict) -> int:
    """Return the price we consider owed by the client for this booking (XOF int).

    Priority:
      1. `quote_amount` (accepted quote)  — the most authoritative once accepted
      2. `estimated_price`                 — the initial price shown at booking
      3. `price_xof`                       — some flows store it here
    """
    for key in ("quote_amount", "estimated_price", "price_xof", "amount_xof"):
        v = booking.get(key)
        if v is None:
            continue
        try:
            iv = int(v)
            if iv > 0:
                return iv
        except (TypeError, ValueError):
            continue
    return 0


def _extract_category_key(booking: dict) -> str:
    # Direct fields first
    for k in ("category_key", "service_key", "service"):
        v = booking.get(k)
        if v:
            return str(v).lower()
    # Mobility & family flags (existing modules)
    if booking.get("kind") == "carpool" or booking.get("carpool_id"):
        return "mobility.carpool"
    if booking.get("kind") == "parcel":
        return "mobility.parcel"
    if booking.get("family_profile_id") or booking.get("kind") == "family":
        return "family"
    return ""
