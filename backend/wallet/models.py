"""Pydantic models — request/response DTOs for the Wallet API.

DB documents use plain dicts (motor). Pydantic is only for input validation
and response shaping. Keep amounts as integers everywhere (minor units).
"""

from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict

from .constants import (
    DEFAULT_CURRENCY,
    PaymentProvider,
    PaymentIntentPurpose,
    WithdrawalStatus,
    RefundReason,
)


# ─────────────────────────────────────────────────────────────
# Money guardrails
# ─────────────────────────────────────────────────────────────
def _validate_positive_xof(v: int) -> int:
    if v is None:
        raise ValueError("Montant requis")
    if not isinstance(v, int):
        try:
            v = int(v)
        except Exception:
            raise ValueError("Le montant doit être un entier en F CFA")
    if v <= 0:
        raise ValueError("Le montant doit être strictement positif")
    if v > 100_000_000:
        raise ValueError("Le montant dépasse la limite absolue (100 000 000 F)")
    return v


# ─────────────────────────────────────────────────────────────
# Recharge (top-up)
# ─────────────────────────────────────────────────────────────
class RechargeIn(BaseModel):
    amount_xof: int = Field(..., description="Montant en F CFA (entier)")
    provider: PaymentProvider = Field(..., description="wave | orange_money | stripe | apple_pay | google_pay | bank_transfer")
    return_url: Optional[str] = Field(None, description="Deep link mobile pour retour post-paiement")
    idempotency_key: Optional[str] = Field(None, description="Clé d'idempotence (fournir un uuid côté client pour éviter les doubles clics)")

    _pos = field_validator("amount_xof")(_validate_positive_xof)


class RechargeOut(BaseModel):
    payment_intent_id: str
    status: str
    provider: str
    amount_xof: int
    currency: str = DEFAULT_CURRENCY
    checkout_url: Optional[str] = None
    checkout_deep_link: Optional[str] = None
    provider_ref: Optional[str] = None
    expires_at: Optional[str] = None
    instructions: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Withdrawal
# ─────────────────────────────────────────────────────────────
class WithdrawalIn(BaseModel):
    amount_xof: int = Field(..., description="Montant brut demandé en F CFA")
    method: PaymentProvider = Field(..., description="wave | orange_money | bank_transfer")
    destination_phone: Optional[str] = Field(None, description="Requis pour Wave / Orange Money")
    destination_iban: Optional[str] = Field(None, description="Requis pour bank_transfer")
    destination_bank_name: Optional[str] = None
    destination_holder_name: Optional[str] = Field(None, description="Nom du titulaire du compte")
    idempotency_key: Optional[str] = None

    _pos = field_validator("amount_xof")(_validate_positive_xof)


class WithdrawalOut(BaseModel):
    id: str
    status: WithdrawalStatus
    amount_gross_xof: int
    amount_fee_xof: int
    amount_net_xof: int
    method: str
    created_at: str


# ─────────────────────────────────────────────────────────────
# Refund
# ─────────────────────────────────────────────────────────────
class RefundIn(BaseModel):
    booking_id: str
    reason: RefundReason
    amount_xof: Optional[int] = Field(None, description="Si null, remboursement intégral")
    idempotency_key: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Wallet snapshot (public shape)
# ─────────────────────────────────────────────────────────────
class WalletSnapshot(BaseModel):
    id: str
    owner_id: str
    kind: str
    currency: str
    balance_available_xof: int
    balance_pending_xof: int
    balance_locked_xof: int
    min_balance_xof: int
    can_receive_bookings: bool
    low_balance_warning: bool
    status: str
    updated_at: str


# ─────────────────────────────────────────────────────────────
# Ledger entry (public shape)
# ─────────────────────────────────────────────────────────────
class LedgerEntry(BaseModel):
    id: str
    at: str
    kind: str  # credit | debit
    amount_xof: int
    balance_after_xof: int
    reason: str
    transaction_type: str
    label: str  # Human-readable French label
    reference: dict = Field(default_factory=dict)


class LedgerPage(BaseModel):
    items: list[LedgerEntry]
    cursor: Optional[str] = None
    has_more: bool = False


# ─────────────────────────────────────────────────────────────
# Admin
# ─────────────────────────────────────────────────────────────
class AdminAdjustIn(BaseModel):
    owner_id: str
    amount_xof: int = Field(..., description="Positif = crédit, négatif = débit")
    reason: str = Field(..., min_length=3, max_length=500, description="Justification (obligatoire, auditée)")

    @field_validator("amount_xof")
    @classmethod
    def _amt(cls, v: int) -> int:
        if v == 0:
            raise ValueError("Le montant doit être non-nul")
        if abs(v) > 100_000_000:
            raise ValueError("Le montant dépasse la limite absolue")
        return int(v)


class AdminCommissionRuleIn(BaseModel):
    category_key: str = Field(..., min_length=1, max_length=100, description="'*' pour la valeur par défaut ; 'plumbing', 'mobility.*', 'family.*'…")
    commission_percent: float = Field(..., ge=0, le=100)
    min_commission_xof: int = Field(0, ge=0)
    max_commission_xof: Optional[int] = Field(None, ge=0)
    active: bool = True
    notes: Optional[str] = None


class AdminSettingIn(BaseModel):
    key: str
    value: Any


class AdminWithdrawalDecisionIn(BaseModel):
    action: str = Field(..., description="'approve' | 'refuse' | 'mark_paid' | 'mark_failed'")
    external_ref: Optional[str] = None
    admin_notes: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Bonus / cashback / referral credit (system-issued)
# ─────────────────────────────────────────────────────────────
class BonusIn(BaseModel):
    owner_id: str
    amount_xof: int
    label: str = Field(..., max_length=200)
    category: str = Field("bonus", description="'cashback' | 'referral' | 'promo' | 'coupon' | 'bonus'")
    reference: dict = Field(default_factory=dict)

    _pos = field_validator("amount_xof")(_validate_positive_xof)


# Model configs — allow extra fields to be lenient during migrations
for _cls in [
    RechargeIn, RechargeOut, WithdrawalIn, WithdrawalOut, RefundIn,
    WalletSnapshot, LedgerEntry, LedgerPage,
    AdminAdjustIn, AdminCommissionRuleIn, AdminSettingIn,
    AdminWithdrawalDecisionIn, BonusIn,
]:
    _cls.model_config = ConfigDict(extra="ignore")
