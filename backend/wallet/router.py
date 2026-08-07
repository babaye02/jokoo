"""FastAPI router — all Wallet API endpoints.

Mounted under `/api/wallet` and `/api/admin/wallet` by the main server.
"""

from __future__ import annotations

import functools
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from . import commission as wallet_commission
from . import jokoo_pro as wallet_jokoo_pro
from . import payment_intents as wallet_payments
from . import refunds as wallet_refunds
from . import service as wallet_service
from . import settings as wallet_settings
from . import audit as wallet_audit
from . import withdrawals as wallet_withdrawals
from .constants import (
    PaymentIntentPurpose,
    PaymentProvider,
    RefundReason,
    SettingKey,
    TransactionType,
    WalletKind,
    WalletStatus,
    JOKOO_MASTER_OWNER_ID,
)
from .models import (
    AdminAdjustIn,
    AdminCommissionRuleIn,
    AdminSettingIn,
    AdminWithdrawalDecisionIn,
    BonusIn,
    RechargeIn,
    RefundIn,
    WithdrawalIn,
)


# The router is created as a factory to inject `db` and auth dependencies from
# the main `server.py` where they already exist.
def build_router(
    db: AsyncIOMotorDatabase,
    *,
    current_user,
    require_admin,
):
    router = APIRouter(prefix="/wallet", tags=["wallet"])
    admin_router = APIRouter(prefix="/admin/wallet", tags=["wallet-admin"])

    # ─── Helpers ─────────────────────────────────────────────
    def _handle_wallet_errors(func):
        """Decorator that converts WalletError into HTTPException.

        Preserves the original function signature via functools.wraps so
        FastAPI can still introspect the route parameters.
        """
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except wallet_service.WalletError as e:
                raise HTTPException(
                    status_code=e.status_code,
                    detail={"code": e.code, "message": str(e)},
                )
        return wrapper

    def _kind_for_user(u: dict) -> WalletKind:
        # A user might have both roles; use active_role for wallet kind so we
        # don't create a second wallet on role switch.
        role = u.get("active_role") or u.get("role") or "client"
        if role == "prestataire":
            return WalletKind.PRESTATAIRE
        return WalletKind.CLIENT

    def _ip(request: Request) -> Optional[str]:
        try:
            return request.client.host if request.client else None
        except Exception:
            return None

    # ─────────────────────────────────────────────────────────
    # USER — Wallet snapshot
    # ─────────────────────────────────────────────────────────
    @router.get("/me")
    @_handle_wallet_errors
    async def get_my_wallet(user=Depends(current_user)):
        w = await wallet_service.get_wallet_or_create(db, user["id"], _kind_for_user(user))
        return await wallet_service.public_snapshot(db, w)

    # ─────────────────────────────────────────────────────────
    # USER — Ledger history
    # ─────────────────────────────────────────────────────────
    @router.get("/history")
    @_handle_wallet_errors
    async def get_history(
        limit: int = Query(50, ge=1, le=200),
        before: Optional[str] = None,
        kinds: Optional[str] = Query(None, description="Comma-separated transaction types"),
        user=Depends(current_user),
    ):
        kinds_list = [k.strip() for k in kinds.split(",")] if kinds else None
        items, cursor, has_more = await wallet_service.list_ledger(
            db, user["id"], limit=limit, before=before, kinds=kinds_list
        )
        # Public shape
        formatted = []
        for e in items:
            formatted.append({
                "id": e["id"],
                "at": e["created_at"],
                "kind": e["kind"],
                "amount_xof": e["amount"],
                "balance_after_xof": e.get("balance_after"),
                "reason": e.get("reason"),
                "transaction_type": e.get("transaction_type"),
                "label": e.get("label") or e.get("reason"),
                "reference": e.get("reference") or {},
            })
        return {"items": formatted, "cursor": cursor, "has_more": has_more}

    # ─────────────────────────────────────────────────────────
    # USER — Recharge (create payment intent)
    # ─────────────────────────────────────────────────────────
    @router.post("/recharge")
    @_handle_wallet_errors
    async def create_recharge(
        body: RechargeIn,
        request: Request,
        user=Depends(current_user),
    ):
        idem = body.idempotency_key or f"user:{user['id']}:recharge:{uuid.uuid4().hex[:12]}"
        intent = await wallet_payments.create(
            db,
            owner_id=user["id"],
            amount_xof=body.amount_xof,
            purpose=PaymentIntentPurpose.WALLET_RECHARGE,
            provider=body.provider,
            reference={"initiated_by": user["id"]},
            idempotency_key=idem,
            return_url=body.return_url,
            ip=_ip(request),
        )
        return {
            "payment_intent_id": intent["id"],
            "status": intent["status"],
            "provider": intent["provider"],
            "amount_xof": intent["amount"],
            "currency": intent["currency"],
            "checkout_url": intent.get("checkout_url"),
            "checkout_deep_link": intent.get("checkout_deep_link"),
            "provider_ref": intent.get("provider_intent_id"),
            "expires_at": intent.get("expires_at"),
            "manual_flow": intent.get("manual_flow", False),
            "instructions": intent.get("manual_flow_reason"),
        }

    @router.get("/recharge/{intent_id}")
    @_handle_wallet_errors
    async def get_recharge(intent_id: str, user=Depends(current_user)):
        pi = await wallet_payments.get(db, intent_id)
        if not pi:
            raise HTTPException(404, "Intent introuvable")
        if pi["owner_id"] != user["id"] and not user.get("is_admin"):
            raise HTTPException(403, "Accès refusé")
        return pi

    @router.post("/recharge/{intent_id}/check-status")
    @_handle_wallet_errors
    async def check_recharge_status(intent_id: str, request: Request, user=Depends(current_user)):
        """Poll the payment provider for the intent's current status.

        Called by the mobile app when returning from the Stripe checkout browser
        session. If the provider confirms success, we credit the wallet
        immediately (idempotent via the intent id).
        """
        pi = await wallet_payments.get(db, intent_id)
        if not pi:
            raise HTTPException(404, "Intent introuvable")
        if pi["owner_id"] != user["id"]:
            raise HTTPException(403, "Accès refusé")
        # Fast path: already succeeded
        if pi["status"] == "succeeded":
            return {"status": "succeeded", "intent": pi}
        # Query provider (Stripe only for now)
        if pi["provider"] in ("stripe", "apple_pay", "google_pay") and pi.get("provider_intent_id"):
            try:
                import os
                from emergentintegrations.payments.stripe.checkout import StripeCheckout
                stripe = StripeCheckout(api_key=os.getenv("STRIPE_API_KEY"))
                status_resp = await stripe.get_checkout_status(pi["provider_intent_id"])
                # payment_status: 'paid' means done
                if getattr(status_resp, "payment_status", "") == "paid":
                    await wallet_payments.confirm_success(
                        db,
                        intent_id=intent_id,
                        actor_id=user["id"],
                        actor_role="user",
                        provider_ref=pi["provider_intent_id"],
                    )
                    return {"status": "succeeded", "intent": await wallet_payments.get(db, intent_id)}
                elif getattr(status_resp, "status", "") == "expired":
                    await wallet_payments.confirm_failure(
                        db,
                        intent_id=intent_id,
                        actor_id=user["id"],
                        reason="stripe_session_expired",
                    )
                    return {"status": "expired", "intent": await wallet_payments.get(db, intent_id)}
            except Exception as e:
                # If Stripe check fails, still return the current DB state.
                return {"status": pi["status"], "error": str(e)[:200], "intent": pi}
        return {"status": pi["status"], "intent": pi}

    @router.get("/recharges/mine")
    @_handle_wallet_errors
    async def list_my_recharges(limit: int = 20, user=Depends(current_user)):
        return await wallet_payments.list_for_owner(db, user["id"], limit=limit)

    # ─────────────────────────────────────────────────────────
    # USER — Withdrawal
    # ─────────────────────────────────────────────────────────
    @router.post("/withdraw")
    @_handle_wallet_errors
    async def request_withdraw(
        body: WithdrawalIn,
        request: Request,
        user=Depends(current_user),
    ):
        idem = body.idempotency_key or f"user:{user['id']}:wdr:{uuid.uuid4().hex[:12]}"
        doc = await wallet_withdrawals.request_withdrawal(
            db,
            owner_id=user["id"],
            amount_xof=body.amount_xof,
            method=body.method,
            destination_phone=body.destination_phone,
            destination_iban=body.destination_iban,
            destination_bank_name=body.destination_bank_name,
            destination_holder_name=body.destination_holder_name,
            idempotency_key=idem,
            ip=_ip(request),
        )
        return doc

    @router.get("/withdrawals/mine")
    @_handle_wallet_errors
    async def list_my_withdrawals(limit: int = 50, user=Depends(current_user)):
        return await wallet_withdrawals.list_for_owner(db, user["id"], limit=limit)

    @router.post("/withdrawals/{wdr_id}/cancel")
    @_handle_wallet_errors
    async def cancel_my_withdrawal(
        wdr_id: str, request: Request, user=Depends(current_user)
    ):
        doc = await db.withdrawal_requests.find_one({"id": wdr_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Retrait introuvable")
        if doc["user_id"] != user["id"]:
            raise HTTPException(403, "Accès refusé")
        return await wallet_withdrawals.admin_decision(
            db,
            wdr_id=wdr_id,
            action="cancel",
            admin_id=user["id"],
            admin_notes="Annulé par l'utilisateur",
            ip=_ip(request),
        )

    # ─────────────────────────────────────────────────────────
    # USER — Jokoo Pro subscription
    # ─────────────────────────────────────────────────────────
    @router.get("/jokoo-pro/status")
    @_handle_wallet_errors
    async def jokoo_pro_status(user=Depends(current_user)):
        return await wallet_jokoo_pro.get_status(db, user["id"])

    @router.post("/jokoo-pro/subscribe")
    @_handle_wallet_errors
    async def jokoo_pro_subscribe(request: Request, user=Depends(current_user)):
        if user.get("active_role") != "prestataire" and user.get("role") != "prestataire":
            raise HTTPException(403, "Réservé aux prestataires")
        return await wallet_jokoo_pro.subscribe_or_renew(
            db, owner_id=user["id"], actor_id=user["id"], ip=_ip(request)
        )

    @router.post("/jokoo-pro/cancel")
    @_handle_wallet_errors
    async def jokoo_pro_cancel(user=Depends(current_user)):
        return await wallet_jokoo_pro.cancel(db, user["id"], actor_id=user["id"])

    # ─────────────────────────────────────────────────────────
    # USER — Refund lookup
    # ─────────────────────────────────────────────────────────
    @router.get("/refunds/mine")
    @_handle_wallet_errors
    async def list_my_refunds(limit: int = 50, user=Depends(current_user)):
        return await wallet_refunds.list_for_owner(db, user["id"], limit=limit)

    # ─────────────────────────────────────────────────────────
    # USER — Payment methods available (config for the client)
    # ─────────────────────────────────────────────────────────
    @router.get("/providers")
    async def list_providers(user=Depends(current_user)):
        out = []
        for p in [
            PaymentProvider.WAVE,
            PaymentProvider.ORANGE_MONEY,
            PaymentProvider.STRIPE,
            PaymentProvider.APPLE_PAY,
            PaymentProvider.GOOGLE_PAY,
            PaymentProvider.BANK_TRANSFER,
        ]:
            available, reason = wallet_payments.is_provider_available(p)
            out.append({
                "id": p.value,
                "available": available,
                "reason_if_unavailable": None if available else reason,
                "supports_recharge": p != PaymentProvider.BANK_TRANSFER or True,
                "supports_withdrawal": p in (
                    PaymentProvider.WAVE,
                    PaymentProvider.ORANGE_MONEY,
                    PaymentProvider.BANK_TRANSFER,
                ),
            })
        rmin = await wallet_settings.get_int(db, SettingKey.RECHARGE_MIN_XOF.value, 1000)
        rmax = await wallet_settings.get_int(db, SettingKey.RECHARGE_MAX_XOF.value, 2_000_000)
        wmin = await wallet_settings.get_int(db, SettingKey.WITHDRAWAL_MIN_XOF.value, 5000)
        wmax = await wallet_settings.get_int(db, SettingKey.WITHDRAWAL_MAX_XOF.value, 2_000_000)
        return {
            "providers": out,
            "currency": "XOF",
            "recharge_min_xof": rmin,
            "recharge_max_xof": rmax,
            "withdrawal_min_xof": wmin,
            "withdrawal_max_xof": wmax,
        }

    # ─────────────────────────────────────────────────────────
    # WEBHOOK — Recharge confirmation (used by Stripe / Wave / OM callbacks)
    # ─────────────────────────────────────────────────────────
    @router.post("/webhook/{provider}/{intent_id}/confirm")
    @_handle_wallet_errors
    async def webhook_confirm(
        provider: str,
        intent_id: str,
        request: Request,
    ):
        """Public webhook endpoint (called by payment providers).

        Idempotent: replaying the same success confirmation is a no-op.
        Security: the specific provider (Stripe/Wave/OM) SHOULD validate the
        signature of its payload before hitting this endpoint. For MVP we
        additionally require the intent to be in `processing` state — a random
        POST from the internet with a valid intent id cannot flip a `created`
        or already-`succeeded` intent.
        """
        body = {}
        try:
            body = await request.json()
        except Exception:
            pass
        provider_ref = body.get("provider_ref") if isinstance(body, dict) else None
        return await wallet_payments.confirm_success(
            db,
            intent_id=intent_id,
            actor_id=f"webhook:{provider}",
            actor_role="system",
            provider_ref=provider_ref,
            ip=_ip(request),
        )

    # ═════════════════════════════════════════════════════════
    # ADMIN endpoints
    # ═════════════════════════════════════════════════════════

    # Wallet listing + drill-down
    @admin_router.get("/list")
    async def admin_list_wallets(
        limit: int = Query(50, ge=1, le=500),
        kind: Optional[str] = None,
        status: Optional[str] = None,
        min_balance: Optional[int] = None,
        max_balance: Optional[int] = None,
        user=Depends(require_admin),
    ):
        q: dict = {}
        if kind:
            q["kind"] = kind
        if status:
            q["status"] = status
        bal: dict = {}
        if min_balance is not None:
            bal["$gte"] = int(min_balance)
        if max_balance is not None:
            bal["$lte"] = int(max_balance)
        if bal:
            q["balance_available"] = bal
        cur = db.wallets_v2.find(q, {"_id": 0}).sort("balance_available", -1).limit(limit)
        return await cur.to_list(500)

    @admin_router.get("/wallet/{owner_id}")
    async def admin_get_wallet(owner_id: str, user=Depends(require_admin)):
        w = await wallet_service.get_wallet(db, owner_id)
        if not w:
            raise HTTPException(404, "Wallet introuvable")
        u = None
        if owner_id != JOKOO_MASTER_OWNER_ID:
            u = await db.users.find_one({"id": owner_id}, {"_id": 0, "name": 1, "email": 1, "phone": 1, "role": 1})
        return {"wallet": w, "user": u}

    @admin_router.get("/wallet/{owner_id}/ledger")
    async def admin_get_ledger(
        owner_id: str,
        limit: int = 100,
        before: Optional[str] = None,
        user=Depends(require_admin),
    ):
        items, cursor, has_more = await wallet_service.list_ledger(
            db, owner_id, limit=limit, before=before
        )
        # Return in public formatted shape (aligned with GET /wallet/history)
        formatted = []
        for e in items:
            formatted.append({
                "id": e["id"],
                "at": e["created_at"],
                "kind": e["kind"],
                "amount_xof": e["amount"],
                "balance_after_xof": e.get("balance_after"),
                "reason": e.get("reason"),
                "transaction_type": e.get("transaction_type"),
                "label": e.get("label") or e.get("reason"),
                "reference": e.get("reference") or {},
            })
        return {"items": formatted, "cursor": cursor, "has_more": has_more}

    @admin_router.post("/wallet/{owner_id}/adjust")
    @_handle_wallet_errors
    async def admin_adjust(
        owner_id: str,
        body: AdminAdjustIn,
        request: Request,
        user=Depends(require_admin),
    ):
        if owner_id != body.owner_id:
            raise HTTPException(400, "owner_id mismatch")
        amt = abs(int(body.amount_xof))
        if body.amount_xof > 0:
            result = await wallet_service.credit(
                db,
                owner_id=owner_id,
                amount_xof=amt,
                transaction_type=TransactionType.MANUAL_ADJUST_CREDIT,
                label=f"Ajustement admin (+{amt:,} F)".replace(",", " "),
                reference={"reason": body.reason, "admin_id": user["id"]},
                idempotency_key=f"adjust:{owner_id}:{uuid.uuid4().hex[:16]}",
                actor_id=user["id"],
                reason_code="admin_adjust",
                to_wallet_kind=WalletKind.CLIENT,
                ip=_ip(request),
            )
        else:
            result = await wallet_service.debit(
                db,
                owner_id=owner_id,
                amount_xof=amt,
                transaction_type=TransactionType.MANUAL_ADJUST_DEBIT,
                label=f"Ajustement admin (−{amt:,} F)".replace(",", " "),
                reference={"reason": body.reason, "admin_id": user["id"]},
                idempotency_key=f"adjust:{owner_id}:{uuid.uuid4().hex[:16]}",
                actor_id=user["id"],
                allow_negative=True,
                reason_code="admin_adjust",
                from_wallet_kind=WalletKind.CLIENT,
                ip=_ip(request),
            )
        return result

    @admin_router.post("/wallet/{owner_id}/status")
    @_handle_wallet_errors
    async def admin_set_status(
        owner_id: str,
        body: dict,
        request: Request,
        user=Depends(require_admin),
    ):
        status = body.get("status")
        reason = body.get("reason")
        if status not in [s.value for s in WalletStatus]:
            raise HTTPException(400, "Statut invalide")
        return await wallet_service.set_status(
            db, owner_id, WalletStatus(status), actor_id=user["id"], reason=reason, ip=_ip(request)
        )

    @admin_router.post("/wallet/{owner_id}/min-balance")
    @_handle_wallet_errors
    async def admin_set_min_balance(
        owner_id: str,
        body: dict,
        request: Request,
        user=Depends(require_admin),
    ):
        min_b = int(body.get("min_balance_xof", 0))
        return await wallet_service.set_min_balance(
            db, owner_id, min_b, actor_id=user["id"], reason=body.get("reason"), ip=_ip(request)
        )

    @admin_router.post("/bonus")
    @_handle_wallet_errors
    async def admin_grant_bonus(
        body: BonusIn,
        request: Request,
        user=Depends(require_admin),
    ):
        return await wallet_service.credit(
            db,
            owner_id=body.owner_id,
            amount_xof=body.amount_xof,
            transaction_type=TransactionType.BONUS,
            label=body.label,
            reference={"category": body.category, "admin_id": user["id"], **(body.reference or {})},
            idempotency_key=f"bonus:{body.owner_id}:{uuid.uuid4().hex[:16]}",
            actor_id=user["id"],
            reason_code=f"bonus:{body.category}",
            ip=_ip(request),
        )

    # Commissions
    @admin_router.get("/commissions/rules")
    async def admin_list_rules(user=Depends(require_admin)):
        return await wallet_commission.list_rules(db)

    @admin_router.post("/commissions/rules")
    @_handle_wallet_errors
    async def admin_upsert_rule(
        body: AdminCommissionRuleIn,
        request: Request,
        user=Depends(require_admin),
    ):
        r = await wallet_commission.upsert_rule(
            db,
            category_key=body.category_key,
            commission_percent=body.commission_percent,
            min_commission_xof=body.min_commission_xof,
            max_commission_xof=body.max_commission_xof,
            active=body.active,
            notes=body.notes,
            actor_id=user["id"],
        )
        await wallet_audit.log(
            db,
            action="commission.upsert",
            actor_id=user["id"],
            actor_role="admin",
            target_type="commission_rule",
            target_id=r["id"],
            reason=body.notes,
            ip=_ip(request),
            extra=body.model_dump(),
        )
        return r

    @admin_router.delete("/commissions/rules/{category_key}")
    async def admin_delete_rule(category_key: str, user=Depends(require_admin)):
        await wallet_commission.delete_rule(db, category_key)
        return {"ok": True}

    # Platform settings
    @admin_router.get("/settings")
    async def admin_get_settings(user=Depends(require_admin)):
        return await wallet_settings.snapshot_all(db)

    @admin_router.post("/settings")
    @_handle_wallet_errors
    async def admin_set_setting(
        body: AdminSettingIn, request: Request, user=Depends(require_admin)
    ):
        # Basic key allow-list — refuse arbitrary keys
        if body.key not in [k.value for k in SettingKey]:
            raise HTTPException(400, f"Clé inconnue: {body.key}")
        r = await wallet_settings.set_value(db, body.key, body.value, updated_by=user["id"])
        await wallet_audit.log(
            db,
            action="settings.set",
            actor_id=user["id"],
            actor_role="admin",
            target_type="setting",
            target_id=body.key,
            after={"value": body.value},
            ip=_ip(request),
        )
        return r

    # Withdrawals administration
    @admin_router.get("/withdrawals")
    async def admin_list_withdrawals(
        status: Optional[str] = None, limit: int = 100, user=Depends(require_admin)
    ):
        return await wallet_withdrawals.list_admin(db, status=status, limit=limit)

    @admin_router.post("/withdrawals/{wdr_id}/decision")
    @_handle_wallet_errors
    async def admin_wdr_decision(
        wdr_id: str,
        body: AdminWithdrawalDecisionIn,
        request: Request,
        user=Depends(require_admin),
    ):
        return await wallet_withdrawals.admin_decision(
            db,
            wdr_id=wdr_id,
            action=body.action,
            admin_id=user["id"],
            admin_notes=body.admin_notes,
            external_ref=body.external_ref,
            ip=_ip(request),
        )

    # Refunds administration
    @admin_router.get("/refunds")
    async def admin_list_refunds(
        status: Optional[str] = None, limit: int = 100, user=Depends(require_admin)
    ):
        return await wallet_refunds.list_admin(db, status=status, limit=limit)

    @admin_router.post("/refunds")
    @_handle_wallet_errors
    async def admin_refund(
        body: RefundIn, request: Request, user=Depends(require_admin)
    ):
        return await wallet_refunds.refund_booking(
            db,
            booking_id=body.booking_id,
            reason=body.reason,
            amount_xof=body.amount_xof,
            reverse_commission=True,
            actor_id=user["id"],
            idempotency_key=body.idempotency_key,
            ip=_ip(request),
        )

    # Payment intents administration
    @admin_router.get("/payment-intents")
    async def admin_list_payment_intents(
        status: Optional[str] = None, provider: Optional[str] = None, limit: int = 100,
        user=Depends(require_admin),
    ):
        q: dict = {}
        if status:
            q["status"] = status
        if provider:
            q["provider"] = provider
        cur = db.payment_intents.find(q, {"_id": 0}).sort("created_at", -1).limit(int(limit))
        return await cur.to_list(500)

    @admin_router.post("/payment-intents/{intent_id}/confirm")
    @_handle_wallet_errors
    async def admin_confirm_intent(
        intent_id: str,
        body: dict,
        request: Request,
        user=Depends(require_admin),
    ):
        provider_ref = (body or {}).get("provider_ref")
        return await wallet_payments.confirm_success(
            db,
            intent_id=intent_id,
            actor_id=user["id"],
            actor_role="admin",
            provider_ref=provider_ref,
            ip=_ip(request),
        )

    @admin_router.post("/payment-intents/{intent_id}/fail")
    @_handle_wallet_errors
    async def admin_fail_intent(
        intent_id: str,
        body: dict,
        request: Request,
        user=Depends(require_admin),
    ):
        return await wallet_payments.confirm_failure(
            db,
            intent_id=intent_id,
            actor_id=user["id"],
            reason=(body or {}).get("reason", "admin_reject"),
            ip=_ip(request),
        )

    # Transactions & Audit
    @admin_router.get("/transactions")
    async def admin_list_transactions(
        type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        user=Depends(require_admin),
    ):
        q: dict = {}
        if type:
            q["type"] = type
        if status:
            q["status"] = status
        cur = db.wallet_transactions_v2.find(q, {"_id": 0}).sort("created_at", -1).limit(int(limit))
        return await cur.to_list(500)

    @admin_router.get("/audit")
    async def admin_list_audit(
        action: Optional[str] = None,
        target_type: Optional[str] = None,
        actor_id: Optional[str] = None,
        limit: int = 200,
        user=Depends(require_admin),
    ):
        q: dict = {}
        if action:
            q["action"] = action
        if target_type:
            q["target_type"] = target_type
        if actor_id:
            q["actor_id"] = actor_id
        cur = db.wallet_audit_logs.find(q, {"_id": 0}).sort("at", -1).limit(int(limit))
        return await cur.to_list(500)

    # Dashboard aggregates
    @admin_router.get("/dashboard")
    async def admin_dashboard(user=Depends(require_admin)):
        # Aggregate stats
        wallets_count = await db.wallets_v2.count_documents({})
        pending_wdr = await db.withdrawal_requests.count_documents({"status": "pending"})
        pending_refunds = await db.refund_requests.count_documents({"status": {"$in": ["pending", "processing"]}})
        active_pro = await db.subscriptions.count_documents(
            {"kind": "jokoo_pro", "status": "active"}
        )
        # Sum commissions collected (via ledger, into platform wallet)
        pipeline_platform_credits = [
            {"$match": {"owner_id": JOKOO_MASTER_OWNER_ID, "kind": "credit"}},
            {"$group": {"_id": "$transaction_type", "total": {"$sum": "$amount"}, "n": {"$sum": 1}}},
        ]
        platform_credits = await db.wallet_ledger.aggregate(pipeline_platform_credits).to_list(50)
        pipeline_platform_debits = [
            {"$match": {"owner_id": JOKOO_MASTER_OWNER_ID, "kind": "debit"}},
            {"$group": {"_id": "$transaction_type", "total": {"$sum": "$amount"}, "n": {"$sum": 1}}},
        ]
        platform_debits = await db.wallet_ledger.aggregate(pipeline_platform_debits).to_list(50)
        # Recent activity
        recent_tx = await db.wallet_transactions_v2.find(
            {}, {"_id": 0}
        ).sort("created_at", -1).limit(20).to_list(20)

        platform_wallet = await wallet_service.get_wallet(db, JOKOO_MASTER_OWNER_ID)

        return {
            "counts": {
                "wallets": wallets_count,
                "pending_withdrawals": pending_wdr,
                "pending_refunds": pending_refunds,
                "active_jokoo_pro": active_pro,
            },
            "platform_wallet": platform_wallet,
            "platform_credits_by_type": platform_credits,
            "platform_debits_by_type": platform_debits,
            "recent_transactions": recent_tx,
        }

    return router, admin_router
