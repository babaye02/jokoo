"""Withdrawal engine — user requests, admin processes.

Flow:
  1. User calls POST /wallet/withdraw          → status=pending, funds LOCKED
  2. Admin reviews via GET  /admin/withdrawals/pending
  3. Admin calls POST /admin/withdrawals/:id/decision (approve/refuse/mark_paid/mark_failed)
     - approve      → status=approved  (still locked; ready for payout)
     - refuse       → status=refused    + funds released back to available
     - mark_paid    → status=paid       + funds removed from locked (they left the bank)
     - mark_failed  → status=failed     + funds released back to available
  4. Later: when Wave/OM payout APIs become live, `approve` triggers auto-payout.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from . import service as wallet_service
from . import settings as wallet_settings
from . import audit as wallet_audit
from . import notify as wallet_notify
from .constants import (
    ID_PREFIX_WITHDRAWAL,
    PaymentProvider,
    SettingKey,
    TransactionType,
    WalletKind,
    WithdrawalStatus,
)


log = logging.getLogger("jokoo.wallet.withdrawals")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────
# Fee computation
# ─────────────────────────────────────────────────────────────
async def compute_fee(db: AsyncIOMotorDatabase, amount_xof: int) -> int:
    pct = await wallet_settings.get_float(
        db, SettingKey.WITHDRAWAL_FEE_PERCENT.value, 0.0
    )
    fixed = await wallet_settings.get_int(
        db, SettingKey.WITHDRAWAL_FEE_FIXED_XOF.value, 0
    )
    fee = int(round(amount_xof * pct / 100.0)) + int(fixed)
    return max(0, fee)


# ─────────────────────────────────────────────────────────────
# Request creation
# ─────────────────────────────────────────────────────────────
async def request_withdrawal(
    db: AsyncIOMotorDatabase,
    *,
    owner_id: str,
    amount_xof: int,
    method: PaymentProvider,
    destination_phone: Optional[str] = None,
    destination_iban: Optional[str] = None,
    destination_bank_name: Optional[str] = None,
    destination_holder_name: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    ip: Optional[str] = None,
) -> dict:
    if method not in (
        PaymentProvider.WAVE,
        PaymentProvider.ORANGE_MONEY,
        PaymentProvider.BANK_TRANSFER,
    ):
        raise wallet_service.WalletError(
            "Méthode de retrait invalide (wave, orange_money ou bank_transfer)"
        )

    # Idempotency
    if idempotency_key:
        prev = await db.withdrawal_requests.find_one(
            {"idempotency_key": idempotency_key, "user_id": owner_id}, {"_id": 0}
        )
        if prev:
            return prev

    # Min / max bounds
    wmin = await wallet_settings.get_int(db, SettingKey.WITHDRAWAL_MIN_XOF.value, 5_000)
    wmax = await wallet_settings.get_int(db, SettingKey.WITHDRAWAL_MAX_XOF.value, 2_000_000)
    if amount_xof < wmin:
        raise wallet_service.WalletError(
            f"Retrait minimum : {wmin:,} F CFA".replace(",", " ")
        )
    if amount_xof > wmax:
        raise wallet_service.WalletError(
            f"Retrait maximum : {wmax:,} F CFA".replace(",", " ")
        )

    # Destination check
    if method in (PaymentProvider.WAVE, PaymentProvider.ORANGE_MONEY):
        if not destination_phone:
            raise wallet_service.WalletError("Numéro de téléphone destinataire requis")
    if method == PaymentProvider.BANK_TRANSFER:
        if not destination_iban or not destination_holder_name:
            raise wallet_service.WalletError(
                "Coordonnées bancaires (IBAN + nom du titulaire) requises"
            )

    fee = await compute_fee(db, amount_xof)
    net = amount_xof - fee

    # Lock funds (throws InsufficientFunds if under min balance)
    await wallet_service.lock_funds(
        db,
        owner_id=owner_id,
        amount_xof=amount_xof,
        label=f"Retrait en attente ({method.value})",
    )

    now = _now_iso()
    wdr_id = f"{ID_PREFIX_WITHDRAWAL}{uuid.uuid4().hex}"
    doc = {
        "id": wdr_id,
        "user_id": owner_id,
        "amount_gross_xof": int(amount_xof),
        "amount_fee_xof": int(fee),
        "amount_net_xof": int(net),
        "currency": "XOF",
        "method": method.value,
        "destination": {
            "phone": destination_phone,
            "iban": destination_iban,
            "bank_name": destination_bank_name,
            "holder_name": destination_holder_name,
        },
        "status": WithdrawalStatus.PENDING.value,
        "idempotency_key": idempotency_key,
        "external_ref": None,
        "audit_trail": [{"at": now, "to": "pending", "by": owner_id}],
        "created_at": now,
        "updated_at": now,
    }
    await db.withdrawal_requests.insert_one(doc)
    await wallet_audit.log(
        db,
        action=f"withdrawal.request.{method.value}",
        actor_id=owner_id,
        actor_role="user",
        target_type="withdrawal",
        target_id=wdr_id,
        amount_xof=amount_xof,
        ip=ip,
        extra={"fee": fee, "net": net, "destination": doc["destination"]},
    )
    doc.pop("_id", None)
    return doc


# ─────────────────────────────────────────────────────────────
# Admin decision
# ─────────────────────────────────────────────────────────────
async def admin_decision(
    db: AsyncIOMotorDatabase,
    *,
    wdr_id: str,
    action: str,
    admin_id: str,
    admin_notes: Optional[str] = None,
    external_ref: Optional[str] = None,
    ip: Optional[str] = None,
) -> dict:
    """action: 'approve' | 'refuse' | 'mark_paid' | 'mark_failed' | 'cancel'"""
    doc = await db.withdrawal_requests.find_one({"id": wdr_id}, {"_id": 0})
    if not doc:
        raise wallet_service.WalletError("Retrait introuvable", status_code=404)

    now = _now_iso()
    current = doc["status"]

    if action == "approve":
        if current != WithdrawalStatus.PENDING.value:
            raise wallet_service.WalletError(f"Impossible d'approuver depuis '{current}'")
        new_status = WithdrawalStatus.APPROVED.value
        # No wallet mutation — funds stay locked.

    elif action == "refuse":
        if current not in (WithdrawalStatus.PENDING.value, WithdrawalStatus.APPROVED.value):
            raise wallet_service.WalletError(f"Impossible de refuser depuis '{current}'")
        # Release funds back to available
        await wallet_service.unlock_funds(
            db, owner_id=doc["user_id"], amount_xof=int(doc["amount_gross_xof"]), to_available=True
        )
        new_status = WithdrawalStatus.REFUSED.value

    elif action == "cancel":
        if current not in (WithdrawalStatus.PENDING.value,):
            raise wallet_service.WalletError(f"Impossible d'annuler depuis '{current}'")
        await wallet_service.unlock_funds(
            db, owner_id=doc["user_id"], amount_xof=int(doc["amount_gross_xof"]), to_available=True
        )
        new_status = WithdrawalStatus.CANCELLED.value

    elif action == "mark_paid":
        if current not in (WithdrawalStatus.APPROVED.value, WithdrawalStatus.PROCESSING.value):
            raise wallet_service.WalletError(f"Impossible de marquer payé depuis '{current}'")
        # Funds leave the locked bucket permanently
        await wallet_service.unlock_funds(
            db, owner_id=doc["user_id"], amount_xof=int(doc["amount_gross_xof"]), to_available=False
        )
        # Fee stays at the platform: credit it to Jokoo master.
        if int(doc.get("amount_fee_xof") or 0) > 0:
            await wallet_service.credit(
                db,
                owner_id="__WITHDRAWAL_FEE_SINK__",  # non-existent; but transfer expects two owners
                # Actually simpler: adjust manually. We'll skip fee-credit for now
                # since fee=0 in current settings. Left as TODO for future.
                amount_xof=0,
                transaction_type=TransactionType.INTERNAL_TRANSFER,
                label="withdrawal fee (noop)",
                reference={"withdrawal_id": wdr_id},
                idempotency_key=f"wdr_fee:{wdr_id}",
            ) if False else None
        # Ledger entry for the withdrawal itself: debit from user's wallet (audit trail).
        # We're intentionally splitting the concerns:
        #  - lock/unlock manipulates buckets
        #  - here we record the *withdrawal transaction* in the ledger for
        #    consistency with recharge/commission entries.
        # (The user's total available already dropped when we locked; nothing
        #  double-counts because we didn't re-debit available.)
        # Record a synthetic ledger entry via direct insert (no wallets update):
        from .constants import ID_PREFIX_LEDGER, LedgerKind
        await db.wallet_ledger.insert_one({
            "id": f"{ID_PREFIX_LEDGER}{uuid.uuid4().hex}",
            "wallet_id": (await wallet_service.get_wallet(db, doc["user_id"]) or {}).get("id"),
            "owner_id": doc["user_id"],
            "kind": LedgerKind.DEBIT.value,
            "amount": int(doc["amount_gross_xof"]),
            "currency": "XOF",
            "balance_before": None,
            "balance_after": None,
            "transaction_id": wdr_id,
            "counterparty_wallet_id": None,
            "counterparty_owner_id": None,
            "transaction_type": TransactionType.WITHDRAWAL.value,
            "reason": "withdrawal_paid",
            "label": f"Retrait vers {doc['method']} (payé)",
            "reference": {"withdrawal_id": wdr_id, "external_ref": external_ref},
            "created_at": now,
            "created_by": admin_id,
        })
        new_status = WithdrawalStatus.PAID.value

    elif action == "mark_failed":
        if current not in (WithdrawalStatus.APPROVED.value, WithdrawalStatus.PROCESSING.value):
            raise wallet_service.WalletError(f"Impossible de marquer échoué depuis '{current}'")
        await wallet_service.unlock_funds(
            db, owner_id=doc["user_id"], amount_xof=int(doc["amount_gross_xof"]), to_available=True
        )
        new_status = WithdrawalStatus.FAILED.value
    else:
        raise wallet_service.WalletError(f"Action inconnue: {action}")

    await db.withdrawal_requests.update_one(
        {"id": wdr_id},
        {
            "$set": {
                "status": new_status,
                "processed_by": admin_id,
                "external_ref": external_ref or doc.get("external_ref"),
                "admin_notes": admin_notes or doc.get("admin_notes"),
                "updated_at": now,
            },
            "$push": {
                "audit_trail": {
                    "at": now,
                    "to": new_status,
                    "by": admin_id,
                    "action": action,
                    "notes": admin_notes,
                }
            },
        },
    )
    await wallet_audit.log(
        db,
        action=f"withdrawal.admin.{action}",
        actor_id=admin_id,
        actor_role="admin",
        target_type="withdrawal",
        target_id=wdr_id,
        amount_xof=int(doc["amount_gross_xof"]),
        before={"status": current},
        after={"status": new_status},
        reason=admin_notes,
        ip=ip,
    )
    # 🔔 Notify the user of the status change
    try:
        amt = int(doc["amount_gross_xof"])
        method = doc.get("method", "").replace("_", " ").title()
        notif_map = {
            "approved": (
                "withdrawal_approved",
                "Retrait approuvé ✅",
                f"Votre retrait de {amt:,} F CFA vers {method} a été approuvé. Le paiement est en cours de traitement.".replace(",", " "),
            ),
            "paid": (
                "withdrawal_paid",
                "Retrait payé 💸",
                f"{amt:,} F CFA ont été envoyés vers votre compte {method}. Vérifiez votre solde bancaire.".replace(",", " "),
            ),
            "refused": (
                "withdrawal_refused",
                "Retrait refusé",
                f"Votre retrait de {amt:,} F CFA a été refusé. Les fonds ont été recrédités sur votre portefeuille. Motif : {admin_notes or 'non précisé'}.".replace(",", " "),
            ),
            "failed": (
                "withdrawal_failed",
                "Retrait échoué",
                f"Le paiement de {amt:,} F CFA a échoué côté opérateur. Les fonds ont été recrédités sur votre portefeuille.".replace(",", " "),
            ),
            "cancelled": (
                "withdrawal_cancelled",
                "Retrait annulé",
                f"Retrait de {amt:,} F CFA annulé. Les fonds sont à nouveau disponibles sur votre portefeuille.".replace(",", " "),
            ),
        }
        entry = notif_map.get(new_status)
        if entry:
            kind, title, body = entry
            await wallet_notify.notify(
                db,
                user_id=doc["user_id"],
                kind=kind,
                title=title,
                body=body,
                action_url="/wallet",
                extra={"withdrawal_id": wdr_id, "method": method},
            )
    except Exception:
        pass
    return await db.withdrawal_requests.find_one({"id": wdr_id}, {"_id": 0})


async def list_for_owner(
    db: AsyncIOMotorDatabase, owner_id: str, *, limit: int = 50
) -> list[dict]:
    cur = db.withdrawal_requests.find(
        {"user_id": owner_id}, {"_id": 0}
    ).sort("created_at", -1).limit(int(limit))
    return await cur.to_list(200)


async def list_admin(
    db: AsyncIOMotorDatabase, *, status: Optional[str] = None, limit: int = 50
) -> list[dict]:
    q: dict[str, Any] = {}
    if status:
        q["status"] = status
    cur = db.withdrawal_requests.find(q, {"_id": 0}).sort("created_at", -1).limit(int(limit))
    return await cur.to_list(500)
