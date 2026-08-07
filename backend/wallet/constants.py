"""Enums, constants and canonical identifiers for the Wallet engine."""

from enum import Enum


# ─────────────────────────────────────────────────────────────
# Currency
# ─────────────────────────────────────────────────────────────
DEFAULT_CURRENCY = "XOF"  # West African CFA franc


# ─────────────────────────────────────────────────────────────
# Platform master wallet (Jokoo's own account)
# ─────────────────────────────────────────────────────────────
JOKOO_MASTER_OWNER_ID = "JOKOO_MASTER"
JOKOO_MASTER_ROLE = "platform"


# ─────────────────────────────────────────────────────────────
# Wallet kinds
# ─────────────────────────────────────────────────────────────
class WalletKind(str, Enum):
    CLIENT = "client"           # A client's wallet
    PRESTATAIRE = "prestataire" # A provider's wallet
    PLATFORM = "platform"       # Jokoo's own master wallet


class WalletStatus(str, Enum):
    ACTIVE = "active"
    FROZEN = "frozen"           # Cannot debit or credit (admin freeze / fraud)
    CLOSED = "closed"           # Owner deleted account; historical only


# ─────────────────────────────────────────────────────────────
# Ledger entry kinds (double-entry)
# ─────────────────────────────────────────────────────────────
class LedgerKind(str, Enum):
    CREDIT = "credit"           # Money added to wallet
    DEBIT = "debit"             # Money removed from wallet


# ─────────────────────────────────────────────────────────────
# Business transaction types (one per business event)
# ─────────────────────────────────────────────────────────────
class TransactionType(str, Enum):
    # Money flowing INTO wallet:
    RECHARGE            = "recharge"             # User adds funds
    ELECTRONIC_PAYMENT  = "electronic_payment"    # Client paid a booking online → provider credited
    REFUND              = "refund"                # Booking cancelled → client credited
    BONUS               = "bonus"                 # Cashback, referral, promo, coupon
    MANUAL_ADJUST_CREDIT = "manual_adjust_credit" # Admin correction (with audit)

    # Money flowing OUT OF wallet:
    CASH_COMMISSION     = "cash_commission"       # Client paid cash to provider → commission debited from provider wallet
    WITHDRAWAL          = "withdrawal"            # User withdraws to Wave/OM/bank
    JOKOO_PRO_CHARGE    = "jokoo_pro_charge"      # Subscription fee
    PROMOTION_FEE       = "promotion_fee"         # Sponsored profile / featured slot
    BADGE_FEE           = "badge_fee"             # Premium badge
    AD_FEE              = "ad_fee"                # Advertising
    MANUAL_ADJUST_DEBIT = "manual_adjust_debit"   # Admin correction (with audit)

    # Internal transfers:
    INTERNAL_TRANSFER   = "internal_transfer"     # e.g., escrow release


class TransactionStatus(str, Enum):
    PENDING     = "pending"      # Created but not yet processed
    PROCESSING  = "processing"   # In-flight with external provider
    COMPLETED   = "completed"    # Successful — money moved
    FAILED      = "failed"       # Cannot recover; no money moved
    CANCELLED   = "cancelled"    # User or admin cancelled before completion
    REVERSED    = "reversed"     # Post-completion reversal (chargeback / dispute)


# ─────────────────────────────────────────────────────────────
# Payment providers (recharge sources & withdrawal destinations)
# ─────────────────────────────────────────────────────────────
class PaymentProvider(str, Enum):
    CASH            = "cash"           # Physical cash — no processor involved
    WAVE            = "wave"           # Wave Mobile Money (Senegal)
    ORANGE_MONEY    = "orange_money"   # Orange Money (Sonatel Senegal)
    STRIPE          = "stripe"         # Card (Visa/Mastercard) via Stripe
    APPLE_PAY       = "apple_pay"      # Apple Pay via Stripe
    GOOGLE_PAY      = "google_pay"     # Google Pay via Stripe
    BANK_TRANSFER   = "bank_transfer"  # Manual bank transfer (offline reconciliation)
    INTERNAL        = "internal"       # Wallet-to-wallet transfer


# ─────────────────────────────────────────────────────────────
# Payment intent lifecycle
# ─────────────────────────────────────────────────────────────
class PaymentIntentStatus(str, Enum):
    CREATED     = "created"      # Client asked for a payment URL / QR
    PROCESSING  = "processing"   # Sent to provider, awaiting confirmation
    SUCCEEDED   = "succeeded"    # Provider confirmed → wallet credited
    FAILED      = "failed"       # Provider refused
    CANCELLED   = "cancelled"    # User cancelled
    EXPIRED     = "expired"      # Timed out


class PaymentIntentPurpose(str, Enum):
    WALLET_RECHARGE    = "wallet_recharge"
    BOOKING_PAYMENT    = "booking_payment"
    JOKOO_PRO          = "jokoo_pro"
    PROMOTION          = "promotion"


# ─────────────────────────────────────────────────────────────
# Withdrawal lifecycle
# ─────────────────────────────────────────────────────────────
class WithdrawalStatus(str, Enum):
    PENDING     = "pending"      # Requested by user, funds locked
    APPROVED    = "approved"     # Admin approved (manual step)
    PROCESSING  = "processing"   # Payout API called
    PAID        = "paid"         # User received the funds
    REFUSED     = "refused"      # Admin refused (KYC issue, etc.) — funds released back
    CANCELLED   = "cancelled"    # User cancelled before approval — funds released back
    FAILED      = "failed"       # External payout failed — funds released back


# ─────────────────────────────────────────────────────────────
# Refund lifecycle
# ─────────────────────────────────────────────────────────────
class RefundStatus(str, Enum):
    PENDING     = "pending"
    PROCESSING  = "processing"
    COMPLETED   = "completed"
    FAILED      = "failed"
    CANCELLED   = "cancelled"


class RefundReason(str, Enum):
    CANCELLED_BY_CLIENT     = "cancelled_by_client"
    CANCELLED_BY_PROVIDER   = "cancelled_by_provider"
    NO_SHOW_PROVIDER        = "no_show_provider"
    QUALITY_ISSUE           = "quality_issue"
    DUPLICATE_PAYMENT       = "duplicate_payment"
    FRAUD                   = "fraud"
    ADMIN_ADJUSTMENT        = "admin_adjustment"


# ─────────────────────────────────────────────────────────────
# Platform settings keys (admin-configurable)
# ─────────────────────────────────────────────────────────────
class SettingKey(str, Enum):
    COMMISSION_DEFAULT_PERCENT      = "commission_default_percent"
    RECHARGE_MIN_XOF                = "recharge_min_xof"
    RECHARGE_MAX_XOF                = "recharge_max_xof"
    WITHDRAWAL_MIN_XOF              = "withdrawal_min_xof"
    WITHDRAWAL_MAX_XOF              = "withdrawal_max_xof"
    WITHDRAWAL_FEE_PERCENT          = "withdrawal_fee_percent"
    WITHDRAWAL_FEE_FIXED_XOF        = "withdrawal_fee_fixed_xof"
    JOKOO_PRO_PRICE_XOF             = "jokoo_pro_price_xof"
    JOKOO_PRO_AUTO_RENEW            = "jokoo_pro_auto_renew"
    WALLET_DEFAULT_MIN_BALANCE_XOF  = "wallet_default_min_balance_xof"
    WALLET_MAX_NEGATIVE_XOF         = "wallet_max_negative_xof"
    LOW_BALANCE_WARN_XOF            = "low_balance_warn_xof"


# ─────────────────────────────────────────────────────────────
# Reason codes shown in ledger/history
# ─────────────────────────────────────────────────────────────
LEDGER_REASONS = {
    TransactionType.RECHARGE:             "Recharge",
    TransactionType.ELECTRONIC_PAYMENT:   "Paiement reçu",
    TransactionType.REFUND:               "Remboursement",
    TransactionType.BONUS:                "Bonus / Cashback",
    TransactionType.CASH_COMMISSION:      "Commission Jokoo (paiement cash)",
    TransactionType.WITHDRAWAL:           "Retrait",
    TransactionType.JOKOO_PRO_CHARGE:     "Abonnement Jokoo Pro",
    TransactionType.PROMOTION_FEE:        "Mise en avant",
    TransactionType.BADGE_FEE:            "Badge Premium",
    TransactionType.AD_FEE:               "Publicité",
    TransactionType.MANUAL_ADJUST_CREDIT: "Ajustement (crédit)",
    TransactionType.MANUAL_ADJUST_DEBIT:  "Ajustement (débit)",
    TransactionType.INTERNAL_TRANSFER:    "Transfert interne",
}


# ─────────────────────────────────────────────────────────────
# Default platform settings values (used when key not yet set in DB)
# ─────────────────────────────────────────────────────────────
DEFAULT_SETTINGS: dict = {
    SettingKey.COMMISSION_DEFAULT_PERCENT.value:     15,       # 15 %
    SettingKey.RECHARGE_MIN_XOF.value:               1_000,    # 1 000 F
    SettingKey.RECHARGE_MAX_XOF.value:               2_000_000,
    SettingKey.WITHDRAWAL_MIN_XOF.value:             5_000,    # 5 000 F
    SettingKey.WITHDRAWAL_MAX_XOF.value:             2_000_000,
    SettingKey.WITHDRAWAL_FEE_PERCENT.value:         0,        # 0 %
    SettingKey.WITHDRAWAL_FEE_FIXED_XOF.value:       0,
    SettingKey.JOKOO_PRO_PRICE_XOF.value:            15_000,   # 15 000 F/mois
    SettingKey.JOKOO_PRO_AUTO_RENEW.value:           True,
    SettingKey.WALLET_DEFAULT_MIN_BALANCE_XOF.value: 0,        # No negative balance by default
    SettingKey.WALLET_MAX_NEGATIVE_XOF.value:        -50_000,  # Admin can allow up to −50 000 F on specific wallets
    SettingKey.LOW_BALANCE_WARN_XOF.value:           2_000,    # Warn provider below 2 000 F
}


# ─────────────────────────────────────────────────────────────
# Idempotency window (dedup horizon for idempotency keys)
# ─────────────────────────────────────────────────────────────
IDEMPOTENCY_TTL_SECONDS = 24 * 3600  # 24 hours

# CAS retry policy
CAS_MAX_RETRIES = 8
CAS_BACKOFF_MS = 25  # initial backoff, doubles each retry


# ─────────────────────────────────────────────────────────────
# Prefix for our public opaque IDs
# ─────────────────────────────────────────────────────────────
ID_PREFIX_WALLET       = "wal_"
ID_PREFIX_LEDGER       = "led_"
ID_PREFIX_TRANSACTION  = "txn_"
ID_PREFIX_INTENT       = "pi_"
ID_PREFIX_WITHDRAWAL   = "wdr_"
ID_PREFIX_REFUND       = "ref_"
ID_PREFIX_COMMISSION   = "com_"
ID_PREFIX_AUDIT        = "aud_"
ID_PREFIX_SUBSCRIPTION = "sub_"
