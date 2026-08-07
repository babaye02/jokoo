"""Refunds — cancel a booking and reverse the money movement.

Two flavors of refund depending on how the booking was originally paid:

1. **Cash-paid booking** — There was no wallet credit for the client to
   refund. But if a commission was collected from the provider, we may
   reverse it (admin-decided per booking).

2. **Electronic booking** — The provider's wallet was credited when the
   client paid online. On refund, we debit the provider and credit the
   client's wallet (or refund the original payment method — for simplicity
   the wallet credit is used).

For MVP we implement wallet-based refunds. Real card refunds via Stripe are a
future stub.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from . import service as wallet_service
from . import audit as wallet_audit
from . import notify as wallet_notify
from .constants import (
    ID_PREFIX_REFUND,
    JOKOO_MASTER_OWNER_ID,
    RefundReason,
    RefundStatus,
    TransactionType,
    WalletKind,
)


log = logging.getLogger("jokoo.wallet.refunds")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def refund_booking(
    db: AsyncIOMotorDatabase,
    *,
    booking_id: str,
    reason: RefundReason,
    amount_xof: Optional[int] = None,
    reverse_commission: bool = True,
    actor_id: str = "system",
    idempotency_key: Optional[str] = None,
    ip: Optional[str] = None,
) -> dict:
    """Refund a booking. Amount defaults to the full booking price if not given.

    Returns the refund_requests document. Idempotent by `booking_id` +
    `idempotency_key`.
    """
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise wallet_service.WalletError("Réservation introuvable", status_code=404)

    client_id = booking.get("client_id")
    provider_user_id = booking.get("provider_user_id")
    if not provider_user_id:
        prov = await db.providers.find_one(
            {"id": booking.get("provider_id")}, {"_id": 0, "user_id": 1}
        )
        if prov:
            provider_user_id = prov.get("user_id")

    # Determine amount
    from .commission import _extract_booking_price
    booking_price = _extract_booking_price(booking)
    amt = int(amount_xof or booking_price)
    if amt <= 0:
        raise wallet_service.WalletError("Aucun montant à rembourser")

    # Idempotency
    idem = idempotency_key or f"refund:{booking_id}"
    existing = await db.refund_requests.find_one(
        {"idempotency_key": idem}, {"_id": 0}
    )
    if existing:
        return existing

    now = _now_iso()
    ref_id = f"{ID_PREFIX_REFUND}{uuid.uuid4().hex}"
    was_paid_electronically = (
        bool(booking.get("paid_at"))
        and (booking.get("paid_method") or "").lower() not in ("cash", "espèces", "especes")
    )

    refund_doc = {
        "id": ref_id,
        "booking_id": booking_id,
        "client_id": client_id,
        "provider_user_id": provider_user_id,
        "amount_xof": amt,
        "currency": "XOF",
        "reason": reason.value if isinstance(reason, RefundReason) else str(reason),
        "status": RefundStatus.PROCESSING.value,
        "reverse_commission": bool(reverse_commission),
        "idempotency_key": idem,
        "created_at": now,
        "updated_at": now,
        "audit_trail": [{"at": now, "to": "processing", "by": actor_id}],
        "was_paid_electronically": was_paid_electronically,
        "ledger_transactions": [],
    }
    await db.refund_requests.insert_one(refund_doc.copy())

    tx_ids: list[str] = []
    try:
        if was_paid_electronically and provider_user_id:
            # 1) Debit provider (they had been credited), credit client wallet.
            r1 = await wallet_service.transfer(
                db,
                from_owner_id=provider_user_id,
                to_owner_id=client_id,
                amount_xof=amt,
                transaction_type=TransactionType.REFUND,
                label=f"Remboursement — Réservation #{booking_id[:8]}",
                reference={"booking_id": booking_id, "refund_id": ref_id, "reason": refund_doc["reason"]},
                idempotency_key=f"refund_client:{ref_id}",
                actor_id=actor_id,
                allow_negative_from=True,  # provider may have already spent — go negative
                from_wallet_kind=WalletKind.PRESTATAIRE,
                to_wallet_kind=WalletKind.CLIENT,
                reason_code="refund",
                ip=ip,
            )
            tx_ids.append(r1["transaction_id"])
        else:
            # Cash booking: nothing to reverse on the money-transfer side
            # (the cash was exchanged off-platform between client and provider).
            # If the client wants a refund of the cash, that's a private matter
            # between the two parties. We do record a synthetic "acknowledged"
            # ledger note for audit purposes only, but no money moves.
            log.info(
                "refund cash booking=%s — no wallet transfer (cash exchanged off-platform)",
                booking_id,
            )

        # 2) Reverse commission collected (if any)
        if reverse_commission and provider_user_id:
            commission_txn_id = booking.get("commission_transaction_id")
            commission_amt = int(booking.get("commission_computed_xof") or 0)
            if commission_txn_id and commission_amt > 0:
                r2 = await wallet_service.credit(
                    db,
                    owner_id=provider_user_id,
                    amount_xof=commission_amt,
                    transaction_type=TransactionType.MANUAL_ADJUST_CREDIT,
                    label=f"Remboursement commission — Réservation #{booking_id[:8]}",
                    reference={"booking_id": booking_id, "refund_id": ref_id, "reversed_transaction": commission_txn_id},
                    idempotency_key=f"refund_commission:{ref_id}",
                    actor_id=actor_id,
                    to_wallet_kind=WalletKind.PRESTATAIRE,
                    reason_code="commission_reversal",
                    ip=ip,
                )
                tx_ids.append(r2["transaction_id"])
                await db.bookings.update_one(
                    {"id": booking_id},
                    {"$set": {
                        "commission_status": "refunded",
                        "commission_refunded_at": _now_iso(),
                    }},
                )

        # Success
        await db.refund_requests.update_one(
            {"id": ref_id},
            {
                "$set": {
                    "status": RefundStatus.COMPLETED.value,
                    "completed_at": _now_iso(),
                    "ledger_transactions": tx_ids,
                    "updated_at": _now_iso(),
                },
                "$push": {
                    "audit_trail": {"at": _now_iso(), "to": "completed", "by": actor_id}
                },
            },
        )
        # Update booking status
        await db.bookings.update_one(
            {"id": booking_id},
            {"$set": {
                "status": "cancelled",
                "cancelled_at": _now_iso(),
                "cancellation_reason": refund_doc["reason"],
                "refund_id": ref_id,
            }},
        )
    except Exception as e:
        log.exception("refund failed booking=%s", booking_id)
        await db.refund_requests.update_one(
            {"id": ref_id},
            {
                "$set": {
                    "status": RefundStatus.FAILED.value,
                    "failed_reason": str(e)[:500],
                    "updated_at": _now_iso(),
                },
                "$push": {
                    "audit_trail": {"at": _now_iso(), "to": "failed", "by": actor_id, "error": str(e)[:200]}
                },
            },
        )
        raise

    await wallet_audit.log(
        db,
        action="refund.completed",
        actor_id=actor_id,
        actor_role="admin" if actor_id != "system" else "system",
        target_type="refund",
        target_id=ref_id,
        amount_xof=amt,
        reason=refund_doc["reason"],
        ip=ip,
        extra={"booking_id": booking_id, "reverse_commission": bool(reverse_commission)},
    )
    # 🔔 Notify client + provider
    try:
        short = booking_id[:8]
        if client_id:
            await wallet_notify.notify(
                db,
                user_id=client_id,
                kind="refund_completed",
                title="Remboursement effectué 💵",
                body=(
                    f"{amt:,} F CFA ont été crédités sur votre portefeuille "
                    f"(réservation #{short})."
                ).replace(",", " "),
                action_url="/wallet",
                extra={"refund_id": ref_id, "booking_id": booking_id},
            )
        if provider_user_id and reverse_commission and booking.get("commission_computed_xof"):
            comm = int(booking.get("commission_computed_xof") or 0)
            await wallet_notify.notify(
                db,
                user_id=provider_user_id,
                kind="commission_reversed",
                title="Commission remboursée",
                body=(
                    f"La commission Jokoo de {comm:,} F CFA sur la réservation #{short} "
                    "vous a été recréditée (réservation annulée)."
                ).replace(",", " "),
                action_url="/wallet",
                extra={"refund_id": ref_id, "booking_id": booking_id},
            )
    except Exception:
        pass
    return await db.refund_requests.find_one({"id": ref_id}, {"_id": 0})


async def list_for_owner(
    db: AsyncIOMotorDatabase, owner_id: str, *, limit: int = 50
) -> list[dict]:
    cur = db.refund_requests.find(
        {"$or": [{"client_id": owner_id}, {"provider_user_id": owner_id}]},
        {"_id": 0},
    ).sort("created_at", -1).limit(int(limit))
    return await cur.to_list(200)


async def list_admin(
    db: AsyncIOMotorDatabase, *, status: Optional[str] = None, limit: int = 50
) -> list[dict]:
    q: dict = {}
    if status:
        q["status"] = status
    cur = db.refund_requests.find(q, {"_id": 0}).sort("created_at", -1).limit(int(limit))
    return await cur.to_list(500)
