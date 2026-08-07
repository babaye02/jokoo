"""Payment intents — recharge & booking payments.

A unified funnel for every payment provider we support:
  - Wave, Orange Money, Stripe (card / Apple Pay / Google Pay), bank_transfer.

Each intent goes through: created → processing → succeeded/failed/cancelled/expired.

For providers that are not yet API-integrated (Wave, OM as of 2026-06), the
intent is created in `created` state with `instructions` field explaining the
manual flow. The admin can then mark it succeeded via `/admin/payment_intents/:id/confirm`
after receiving the funds off-platform (bank transfer, USSD confirmation, etc).

When Wave / OM APIs are enabled (env keys present), the module will
automatically initiate the online payment and register webhooks.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from . import service as wallet_service
from . import settings as wallet_settings
from . import audit as wallet_audit
from . import notify as wallet_notify
from .constants import (
    DEFAULT_CURRENCY,
    ID_PREFIX_INTENT,
    PaymentIntentPurpose,
    PaymentIntentStatus,
    PaymentProvider,
    SettingKey,
    TransactionType,
    WalletKind,
)


log = logging.getLogger("jokoo.wallet.payments")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─────────────────────────────────────────────────────────────
# Provider availability
# ─────────────────────────────────────────────────────────────
def is_provider_available(provider: PaymentProvider) -> tuple[bool, str]:
    """Return (available, reason).

    A provider is considered API-ready iff its credentials are configured in
    the environment. If not, the intent will still be creatable but marked
    'manual' and require an admin to confirm receipt.
    """
    p = provider
    if p == PaymentProvider.CASH:
        return True, "cash is always available"
    if p == PaymentProvider.INTERNAL:
        return True, "internal wallet transfer"
    if p == PaymentProvider.WAVE:
        if os.getenv("WAVE_API_KEY"):
            return True, "wave configured"
        return False, "Wave n'est pas encore intégré via API — mode manuel."
    if p == PaymentProvider.ORANGE_MONEY:
        if os.getenv("OM_CLIENT_ID") and os.getenv("OM_CLIENT_SECRET"):
            return True, "orange money configured"
        return False, "Orange Money n'est pas encore intégré via API — mode manuel."
    if p in (PaymentProvider.STRIPE, PaymentProvider.APPLE_PAY, PaymentProvider.GOOGLE_PAY):
        if os.getenv("STRIPE_API_KEY"):
            return True, "stripe configured"
        return False, "Paiement carte non configuré (Stripe)."
    if p == PaymentProvider.BANK_TRANSFER:
        return False, "Virement bancaire = mode manuel (l'admin confirmera à réception)."
    return False, "provider inconnu"


# ─────────────────────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────────────────────
async def create(
    db: AsyncIOMotorDatabase,
    *,
    owner_id: str,
    amount_xof: int,
    purpose: PaymentIntentPurpose,
    provider: PaymentProvider,
    reference: Optional[dict] = None,
    idempotency_key: Optional[str] = None,
    return_url: Optional[str] = None,
    ip: Optional[str] = None,
) -> dict:
    """Create a new intent. May be `created` (manual flow) or `processing`
    (auto-initiated). Never immediately succeeded — success happens either via
    webhook or admin confirmation.
    """
    if amount_xof <= 0:
        raise wallet_service.WalletError("Montant invalide")

    # Bounds check against platform settings
    if purpose == PaymentIntentPurpose.WALLET_RECHARGE:
        rmin = await wallet_settings.get_int(db, SettingKey.RECHARGE_MIN_XOF.value, 1000)
        rmax = await wallet_settings.get_int(db, SettingKey.RECHARGE_MAX_XOF.value, 2_000_000)
        if amount_xof < rmin:
            raise wallet_service.WalletError(
                f"Recharge minimale : {rmin:,} F CFA".replace(",", " ")
            )
        if amount_xof > rmax:
            raise wallet_service.WalletError(
                f"Recharge maximale : {rmax:,} F CFA".replace(",", " ")
            )

    # Idempotency
    if idempotency_key:
        prev = await db.payment_intents.find_one(
            {"idempotency_key": idempotency_key}, {"_id": 0}
        )
        if prev:
            return prev

    available, reason = is_provider_available(provider)
    now = _now_iso()
    intent_id = f"{ID_PREFIX_INTENT}{uuid.uuid4().hex}"
    intent: dict[str, Any] = {
        "id": intent_id,
        "owner_id": owner_id,
        "amount": int(amount_xof),
        "currency": DEFAULT_CURRENCY,
        "purpose": purpose.value,
        "provider": provider.value,
        "status": PaymentIntentStatus.CREATED.value,
        "reference": reference or {},
        "idempotency_key": idempotency_key,
        "return_url": return_url,
        "created_at": now,
        "updated_at": now,
        "expires_at": (_now() + timedelta(hours=2)).isoformat(),
        "audit_trail": [{"at": now, "to": "created", "by": owner_id}],
        "manual_flow": not available,
        "manual_flow_reason": reason if not available else None,
        "provider_intent_id": None,
        "checkout_url": None,
        "checkout_deep_link": None,
        "confirmed_at": None,
        "failed_reason": None,
    }

    # Attempt provider auto-init (Stripe wired here; Wave/OM stubbed until keys are set)
    if available:
        try:
            if provider in (PaymentProvider.STRIPE, PaymentProvider.APPLE_PAY, PaymentProvider.GOOGLE_PAY):
                await _init_stripe(db, intent, return_url=return_url)
            elif provider == PaymentProvider.WAVE:
                await _init_wave(db, intent, return_url=return_url)
            elif provider == PaymentProvider.ORANGE_MONEY:
                await _init_om(db, intent, return_url=return_url)
            intent["status"] = PaymentIntentStatus.PROCESSING.value
            intent["audit_trail"].append({"at": _now_iso(), "to": "processing", "by": "system"})
        except Exception as e:
            log.exception("payment intent init failed provider=%s", provider.value)
            intent["failed_reason"] = f"init_error: {str(e)[:200]}"
            intent["status"] = PaymentIntentStatus.FAILED.value

    await db.payment_intents.insert_one(intent.copy())
    await wallet_audit.log(
        db,
        action=f"payment_intent.create.{provider.value}",
        actor_id=owner_id,
        actor_role="user",
        target_type="payment_intent",
        target_id=intent_id,
        amount_xof=amount_xof,
        reason=purpose.value,
        ip=ip,
    )
    intent.pop("_id", None)
    return intent


async def get(db: AsyncIOMotorDatabase, intent_id: str) -> Optional[dict]:
    return await db.payment_intents.find_one({"id": intent_id}, {"_id": 0})


async def list_for_owner(
    db: AsyncIOMotorDatabase,
    owner_id: str,
    *,
    limit: int = 20,
) -> list[dict]:
    cur = db.payment_intents.find(
        {"owner_id": owner_id}, {"_id": 0}
    ).sort("created_at", -1).limit(max(1, min(int(limit), 100)))
    return await cur.to_list(200)


# ─────────────────────────────────────────────────────────────
# Confirmation (webhook or admin manual)
# ─────────────────────────────────────────────────────────────
async def confirm_success(
    db: AsyncIOMotorDatabase,
    *,
    intent_id: str,
    actor_id: str,
    actor_role: str = "system",
    provider_ref: Optional[str] = None,
    ip: Optional[str] = None,
) -> dict:
    """The provider confirmed the payment. Credit the wallet.

    Idempotent: if the intent is already `succeeded`, returns the existing tx.
    """
    intent = await get(db, intent_id)
    if not intent:
        raise wallet_service.WalletError("Intent introuvable", status_code=404)
    if intent["status"] == PaymentIntentStatus.SUCCEEDED.value:
        return intent

    now = _now_iso()
    # Idempotent transfer
    if intent["purpose"] == PaymentIntentPurpose.WALLET_RECHARGE.value:
        result = await wallet_service.credit(
            db,
            owner_id=intent["owner_id"],
            amount_xof=int(intent["amount"]),
            transaction_type=TransactionType.RECHARGE,
            label=f"Recharge {intent['provider']}",
            reference={"payment_intent_id": intent_id, **(intent.get("reference") or {})},
            idempotency_key=f"recharge:{intent_id}",
            actor_id=intent["owner_id"],
            provider=intent["provider"],
            provider_ref=provider_ref,
            to_wallet_kind=WalletKind.CLIENT,
            reason_code="recharge",
            ip=ip,
        )
        tx_id = result["transaction_id"]
    elif intent["purpose"] == PaymentIntentPurpose.BOOKING_PAYMENT.value:
        booking_id = (intent.get("reference") or {}).get("booking_id")
        # Direct credit to provider — commission handled separately
        provider_user_id = (intent.get("reference") or {}).get("provider_user_id")
        if not provider_user_id:
            raise wallet_service.WalletError("provider_user_id manquant dans la référence")
        result = await wallet_service.credit(
            db,
            owner_id=provider_user_id,
            amount_xof=int(intent["amount"]),
            transaction_type=TransactionType.ELECTRONIC_PAYMENT,
            label=f"Paiement reçu — Réservation #{(booking_id or '')[:8]}",
            reference={"payment_intent_id": intent_id, "booking_id": booking_id},
            idempotency_key=f"booking_pay:{intent_id}",
            actor_id=actor_id,
            provider=intent["provider"],
            provider_ref=provider_ref,
            to_wallet_kind=WalletKind.PRESTATAIRE,
            reason_code="electronic_payment",
            ip=ip,
        )
        tx_id = result["transaction_id"]
    elif intent["purpose"] == PaymentIntentPurpose.JOKOO_PRO.value:
        # Just funds the wallet; jokoo_pro module will separately debit
        result = await wallet_service.credit(
            db,
            owner_id=intent["owner_id"],
            amount_xof=int(intent["amount"]),
            transaction_type=TransactionType.RECHARGE,
            label="Recharge (Jokoo Pro)",
            reference={"payment_intent_id": intent_id, "purpose": "jokoo_pro"},
            idempotency_key=f"recharge_pro:{intent_id}",
            actor_id=intent["owner_id"],
            provider=intent["provider"],
            provider_ref=provider_ref,
            to_wallet_kind=WalletKind.PRESTATAIRE,
            reason_code="recharge",
            ip=ip,
        )
        tx_id = result["transaction_id"]
    else:
        raise wallet_service.WalletError(
            f"Purpose non supporté: {intent['purpose']}"
        )

    await db.payment_intents.update_one(
        {"id": intent_id},
        {
            "$set": {
                "status": PaymentIntentStatus.SUCCEEDED.value,
                "confirmed_at": now,
                "updated_at": now,
                "provider_ref": provider_ref,
                "credited_transaction_id": tx_id,
            },
            "$push": {
                "audit_trail": {"at": now, "to": "succeeded", "by": actor_id or "system"}
            },
        },
    )
    await wallet_audit.log(
        db,
        action=f"payment_intent.succeeded.{intent['provider']}",
        actor_id=actor_id,
        actor_role=actor_role,
        target_type="payment_intent",
        target_id=intent_id,
        amount_xof=int(intent["amount"]),
        reason="succeeded",
        ip=ip,
    )
    # 🔔 Notify the owner (recharge succeeded)
    try:
        amt = int(intent["amount"])
        purpose = intent.get("purpose", "wallet_recharge")
        if purpose == PaymentIntentPurpose.WALLET_RECHARGE.value:
            title = "Recharge réussie 💰"
            body = f"{amt:,} F CFA ont été crédités sur votre portefeuille.".replace(",", " ")
        elif purpose == PaymentIntentPurpose.BOOKING_PAYMENT.value:
            title = "Paiement reçu 💵"
            body = f"Vous avez reçu {amt:,} F CFA pour votre prestation.".replace(",", " ")
        else:
            title = "Paiement confirmé"
            body = f"{amt:,} F CFA — {purpose}".replace(",", " ")
        await wallet_notify.notify(
            db,
            user_id=intent["owner_id"],
            kind="recharge_success" if purpose == PaymentIntentPurpose.WALLET_RECHARGE.value else "payment_received",
            title=title,
            body=body,
            action_url="/wallet",
            extra={"payment_intent_id": intent_id, "provider": intent["provider"]},
        )
    except Exception:
        pass
    return await get(db, intent_id)


async def confirm_failure(
    db: AsyncIOMotorDatabase,
    *,
    intent_id: str,
    actor_id: str,
    reason: str,
    ip: Optional[str] = None,
) -> dict:
    intent = await get(db, intent_id)
    if not intent:
        raise wallet_service.WalletError("Intent introuvable", status_code=404)
    if intent["status"] in (
        PaymentIntentStatus.FAILED.value,
        PaymentIntentStatus.CANCELLED.value,
        PaymentIntentStatus.EXPIRED.value,
    ):
        return intent
    now = _now_iso()
    await db.payment_intents.update_one(
        {"id": intent_id},
        {
            "$set": {
                "status": PaymentIntentStatus.FAILED.value,
                "failed_reason": reason[:500],
                "updated_at": now,
            },
            "$push": {
                "audit_trail": {"at": now, "to": "failed", "by": actor_id, "reason": reason[:200]}
            },
        },
    )
    await wallet_audit.log(
        db,
        action=f"payment_intent.failed.{intent['provider']}",
        actor_id=actor_id,
        actor_role="system",
        target_type="payment_intent",
        target_id=intent_id,
        reason=reason,
        ip=ip,
    )
    # 🔔 Notify the owner (recharge failed)
    try:
        amt = int(intent["amount"])
        await wallet_notify.notify(
            db,
            user_id=intent["owner_id"],
            kind="recharge_failed",
            title="Recharge échouée",
            body=(
                f"Votre recharge de {amt:,} F CFA via {intent['provider']} n'a pas abouti. "
                "Merci de réessayer ou contacter le support."
            ).replace(",", " "),
            action_url="/wallet",
            extra={"payment_intent_id": intent_id, "reason": reason[:100]},
        )
    except Exception:
        pass
    return await get(db, intent_id)


# ─────────────────────────────────────────────────────────────
# Provider-specific initializers
# ─────────────────────────────────────────────────────────────
async def _init_stripe(db: AsyncIOMotorDatabase, intent: dict, *, return_url: Optional[str]) -> None:
    """Wire up Stripe Checkout for card / Apple Pay / Google Pay recharges."""
    try:
        from emergentintegrations.payments.stripe.checkout import (
            StripeCheckout,
            CheckoutSessionRequest,
        )
        api_key = os.getenv("STRIPE_API_KEY")
        if not api_key:
            raise RuntimeError("STRIPE_API_KEY missing")
        stripe = StripeCheckout(api_key=api_key)
        success_url = return_url or "https://jokooservices.com/wallet/recharged"
        cancel_url = f"{success_url.split('?')[0]}?cancelled=1"
        req = CheckoutSessionRequest(
            amount=float(intent["amount"]),
            currency="xof",
            success_url=success_url + ("&" if "?" in success_url else "?") + "session_id={CHECKOUT_SESSION_ID}",
            cancel_url=cancel_url,
            metadata={
                "payment_intent_id": intent["id"],
                "owner_id": intent["owner_id"],
                "purpose": intent["purpose"],
            },
        )
        session = await stripe.create_checkout_session(req)
        intent["provider_intent_id"] = session.session_id
        intent["checkout_url"] = session.url
    except Exception as e:
        log.exception("stripe init failed")
        raise


async def _init_wave(db: AsyncIOMotorDatabase, intent: dict, *, return_url: Optional[str]) -> None:
    """Initiate a Wave Business checkout. Stubbed until env keys are configured."""
    if not os.getenv("WAVE_API_KEY"):
        raise RuntimeError("Wave API key not configured")
    # Real impl: POST to https://api.wave.com/v1/checkout/sessions
    # Fields: amount, currency, error_url, success_url, checkout_intent
    # Response: id, wave_launch_url
    # Webhook /api/payments/wave/webhook confirms success
    # For now, mark as manual — the mobile app can display a QR code / phone
    # number and the admin confirms once received.
    intent["checkout_deep_link"] = f"wave://payment?amount={intent['amount']}&ref={intent['id']}"
    intent["manual_flow"] = True
    intent["manual_flow_reason"] = "Wave API en cours d'intégration"


async def _init_om(db: AsyncIOMotorDatabase, intent: dict, *, return_url: Optional[str]) -> None:
    """Initiate an Orange Money web-checkout. Stubbed until env keys are set."""
    if not (os.getenv("OM_CLIENT_ID") and os.getenv("OM_CLIENT_SECRET")):
        raise RuntimeError("OM credentials not configured")
    # Real impl: OAuth2 → POST /omcoreapis/1.0.2/mp/pay → returns payment_url
    intent["checkout_deep_link"] = f"om://pay?amount={intent['amount']}&ref={intent['id']}"
    intent["manual_flow"] = True
    intent["manual_flow_reason"] = "Orange Money API en cours d'intégration"
