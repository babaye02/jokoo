"""Core wallet service — atomic ledger operations.

This module is the ONLY place in the codebase that mutates wallet balances.
Every other module (commission, withdrawal, refund, jokoo_pro) MUST route its
money movements through `transfer()` here.

Guarantees:
  - Optimistic concurrency via `version` field on `wallets`.
  - Automatic retries on CAS conflicts (up to CAS_MAX_RETRIES).
  - Idempotency via `idempotency_key`: duplicate calls return the previous
    result, no double-processing.
  - Double-entry: every debit has a matching credit; ledger balances to zero.
  - Immutable ledger (append-only).
  - Full audit trail via `wallet.audit.log`.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

from . import settings as wallet_settings
from . import audit as wallet_audit
from .constants import (
    CAS_BACKOFF_MS,
    CAS_MAX_RETRIES,
    DEFAULT_CURRENCY,
    ID_PREFIX_LEDGER,
    ID_PREFIX_TRANSACTION,
    ID_PREFIX_WALLET,
    JOKOO_MASTER_OWNER_ID,
    JOKOO_MASTER_ROLE,
    LEDGER_REASONS,
    LedgerKind,
    SettingKey,
    TransactionStatus,
    TransactionType,
    WalletKind,
    WalletStatus,
)


log = logging.getLogger("jokoo.wallet")


# ─────────────────────────────────────────────────────────────
# Custom exceptions
# ─────────────────────────────────────────────────────────────
class WalletError(Exception):
    """Base for all wallet errors — mapped to HTTP 4xx/5xx by the router."""
    status_code: int = 400
    code: str = "wallet_error"

    def __init__(self, message: str, *, code: str | None = None, status_code: int | None = None):
        super().__init__(message)
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code


class WalletNotFound(WalletError):
    status_code = 404
    code = "wallet_not_found"


class InsufficientFunds(WalletError):
    status_code = 402  # Payment Required
    code = "insufficient_funds"


class WalletFrozen(WalletError):
    status_code = 403
    code = "wallet_frozen"


class IdempotencyConflict(WalletError):
    """Same key used with different parameters — refuse to process."""
    status_code = 409
    code = "idempotency_conflict"


class CASExhausted(WalletError):
    status_code = 503
    code = "wallet_busy"


# ─────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_wallet_id() -> str:
    return f"{ID_PREFIX_WALLET}{uuid.uuid4().hex}"


def _new_ledger_id() -> str:
    return f"{ID_PREFIX_LEDGER}{uuid.uuid4().hex}"


def _new_txn_id() -> str:
    return f"{ID_PREFIX_TRANSACTION}{uuid.uuid4().hex}"


# ─────────────────────────────────────────────────────────────
# Wallet lifecycle
# ─────────────────────────────────────────────────────────────
async def ensure_wallet(
    db: AsyncIOMotorDatabase,
    owner_id: str,
    *,
    kind: WalletKind | str,
    currency: str = DEFAULT_CURRENCY,
) -> dict:
    """Idempotent: return existing wallet or create one with 0 balance.

    A user has EXACTLY ONE wallet (enforced by `owner_id` unique index).
    """
    if not owner_id:
        raise WalletError("owner_id requis")
    kind_str = kind.value if isinstance(kind, WalletKind) else str(kind)

    existing = await db.wallets_v2.find_one({"owner_id": owner_id}, {"_id": 0})
    if existing:
        return existing

    default_min = await wallet_settings.get_int(
        db, SettingKey.WALLET_DEFAULT_MIN_BALANCE_XOF.value, 0
    )
    now = _now_iso()
    doc = {
        "id": _new_wallet_id(),
        "owner_id": owner_id,
        "kind": kind_str,
        "currency": currency,
        "balance_available": 0,
        "balance_pending": 0,
        "balance_locked": 0,
        "min_balance": int(default_min),
        "status": WalletStatus.ACTIVE.value,
        "version": 1,
        "created_at": now,
        "updated_at": now,
        # Statistics (denormalized, best-effort)
        "stats": {
            "total_credited": 0,
            "total_debited": 0,
            "total_commissions_paid": 0,
            "total_recharged": 0,
            "total_withdrawn": 0,
        },
    }
    try:
        await db.wallets_v2.insert_one(doc)
    except Exception:
        # Race: someone else created it in parallel.
        existing = await db.wallets_v2.find_one({"owner_id": owner_id}, {"_id": 0})
        if existing:
            return existing
        raise
    doc.pop("_id", None)
    return doc


async def ensure_platform_wallet(db: AsyncIOMotorDatabase) -> dict:
    """Return the Jokoo master wallet, initializing it with an unlimited
    negative floor if needed.

    The platform wallet acts as the escrow float / counterparty for every
    recharge (credit user, debit platform). It MUST never be blocked by the
    per-user negative-balance cap. We give it a floor of −1 trillion XOF
    (effectively infinite for our scale).
    """
    PLATFORM_FLOOR = -1_000_000_000_000  # −10^12 XOF, effectively infinite
    existing = await db.wallets_v2.find_one({"owner_id": JOKOO_MASTER_OWNER_ID}, {"_id": 0})
    if existing:
        # Backfill the floor for older platform wallets created before this rule
        if int(existing.get("min_balance", 0)) > PLATFORM_FLOOR:
            await db.wallets_v2.update_one(
                {"owner_id": JOKOO_MASTER_OWNER_ID},
                {"$set": {"min_balance": PLATFORM_FLOOR, "updated_at": _now_iso()}, "$inc": {"version": 1}},
            )
            existing["min_balance"] = PLATFORM_FLOOR
        return existing
    w = await ensure_wallet(db, JOKOO_MASTER_OWNER_ID, kind=WalletKind.PLATFORM)
    # Enforce the unlimited floor on freshly created master wallet
    await db.wallets_v2.update_one(
        {"owner_id": JOKOO_MASTER_OWNER_ID},
        {"$set": {"min_balance": PLATFORM_FLOOR, "updated_at": _now_iso()}, "$inc": {"version": 1}},
    )
    w["min_balance"] = PLATFORM_FLOOR
    return w


async def get_wallet(db: AsyncIOMotorDatabase, owner_id: str) -> Optional[dict]:
    return await db.wallets_v2.find_one({"owner_id": owner_id}, {"_id": 0})


async def get_wallet_or_create(
    db: AsyncIOMotorDatabase, owner_id: str, kind: WalletKind | str
) -> dict:
    w = await get_wallet(db, owner_id)
    if w:
        return w
    return await ensure_wallet(db, owner_id, kind=kind)


# ─────────────────────────────────────────────────────────────
# Public snapshot (safe to return to client)
# ─────────────────────────────────────────────────────────────
async def public_snapshot(db: AsyncIOMotorDatabase, wallet: dict) -> dict:
    low_warn = await wallet_settings.get_int(
        db, SettingKey.LOW_BALANCE_WARN_XOF.value, 2000
    )
    balance = int(wallet.get("balance_available", 0))
    min_b = int(wallet.get("min_balance", 0))
    max_neg = await wallet_settings.get_int(
        db, SettingKey.WALLET_MAX_NEGATIVE_XOF.value, -50_000
    )
    # `can_receive_bookings` is true iff the provider isn't so deep in the red
    # that they can't cover a small commission.
    can_receive = balance > min(min_b, max_neg)
    stats = wallet.get("stats") or {}
    return {
        # ── v2 canonical fields ─────────────────────────
        "id": wallet["id"],
        "owner_id": wallet["owner_id"],
        "kind": wallet.get("kind"),
        "currency": wallet.get("currency", DEFAULT_CURRENCY),
        "balance_available_xof": balance,
        "balance_pending_xof": int(wallet.get("balance_pending", 0)),
        "balance_locked_xof": int(wallet.get("balance_locked", 0)),
        "min_balance_xof": min_b,
        "can_receive_bookings": can_receive,
        "low_balance_warning": balance <= low_warn,
        "status": wallet.get("status", WalletStatus.ACTIVE.value),
        "updated_at": wallet.get("updated_at"),
        "created_at": wallet.get("created_at"),
        # Stats (best-effort denormalized)
        "stats": {
            "total_credited_xof": int(stats.get("total_credited", 0)),
            "total_debited_xof": int(stats.get("total_debited", 0)),
            "total_commissions_paid_xof": int(stats.get("total_commissions_paid", 0)),
            "total_recharged_xof": int(stats.get("total_recharged", 0)),
            "total_withdrawn_xof": int(stats.get("total_withdrawn", 0)),
        },
        # ── Legacy field aliases (kept for old mobile builds) ───
        "user_id": wallet["owner_id"],
        "balance_available": float(balance),
        "balance_pending": float(wallet.get("balance_pending", 0)),
        "commission_due": max(0, -min(0, balance)),  # if negative balance → that's the debt
        "commission_paid": int(stats.get("total_commissions_paid", 0)),
        "gross_earnings": int(stats.get("total_credited", 0)),
        "is_blocked_debt": not can_receive,
    }


# ─────────────────────────────────────────────────────────────
# Idempotency
# ─────────────────────────────────────────────────────────────
async def _idempotent_lookup(
    db: AsyncIOMotorDatabase, idempotency_key: Optional[str], scope: str
) -> Optional[dict]:
    if not idempotency_key:
        return None
    doc = await db.wallet_idempotency.find_one(
        {"key": idempotency_key, "scope": scope}, {"_id": 0}
    )
    return doc


async def _idempotent_store(
    db: AsyncIOMotorDatabase,
    idempotency_key: Optional[str],
    scope: str,
    result: dict,
) -> None:
    if not idempotency_key:
        return
    now = _now_iso()
    try:
        await db.wallet_idempotency.insert_one({
            "key": idempotency_key,
            "scope": scope,
            "result": result,
            "created_at": now,
        })
    except Exception:
        # Duplicate key = concurrent race; the other caller stored it first.
        pass


# ─────────────────────────────────────────────────────────────
# THE CORE : atomic transfer between two wallets
# ─────────────────────────────────────────────────────────────
async def transfer(
    db: AsyncIOMotorDatabase,
    *,
    from_owner_id: str,
    to_owner_id: str,
    amount_xof: int,
    transaction_type: TransactionType,
    reason_code: Optional[str] = None,
    label: Optional[str] = None,
    reference: Optional[dict] = None,
    idempotency_key: Optional[str] = None,
    actor_id: Optional[str] = None,
    provider: Optional[str] = None,
    provider_ref: Optional[str] = None,
    allow_negative_from: bool = False,
    metadata: Optional[dict] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    initial_status: TransactionStatus = TransactionStatus.COMPLETED,
    from_wallet_kind: WalletKind | str = WalletKind.PRESTATAIRE,
    to_wallet_kind: WalletKind | str = WalletKind.CLIENT,
) -> dict:
    """Move `amount_xof` from `from_owner_id` to `to_owner_id`, atomically.

    Returns the completed `wallet_transactions` document. Raises WalletError on
    business failures (insufficient funds, frozen wallet, idempotency mismatch,
    concurrency exhaustion).

    Semantics:
      - Creates wallets on-demand if they don't exist.
      - Debits `from_wallet.balance_available` and credits `to_wallet.balance_available`.
      - Writes TWO ledger entries (one debit, one credit) linked by `transaction_id`.
      - Writes ONE `wallet_transactions` document tying everything together.
      - Writes ONE `wallet_audit_logs` entry with before/after snapshots.
      - If `idempotency_key` matches an earlier call: returns that call's result.
    """
    if amount_xof <= 0:
        raise WalletError("Le montant doit être strictement positif")
    if from_owner_id == to_owner_id:
        raise WalletError("Impossible de transférer un montant vers le même wallet")

    scope = f"transfer:{transaction_type.value}"
    prev = await _idempotent_lookup(db, idempotency_key, scope)
    if prev is not None:
        stored = prev.get("result") or {}
        # Sanity: refuse if same key used with different amount/direction
        if (
            stored.get("amount_xof") != amount_xof
            or stored.get("from_owner_id") != from_owner_id
            or stored.get("to_owner_id") != to_owner_id
        ):
            raise IdempotencyConflict(
                "La même idempotency_key a déjà été utilisée avec des paramètres différents."
            )
        return stored

    # Ensure wallets exist.
    from_w = await get_wallet_or_create(db, from_owner_id, from_wallet_kind)
    to_w = await get_wallet_or_create(db, to_owner_id, to_wallet_kind)

    # Frozen wallet gate — but always allow platform wallet as counterparty.
    for w in (from_w, to_w):
        if w.get("status") == WalletStatus.FROZEN.value and w["owner_id"] != JOKOO_MASTER_OWNER_ID:
            raise WalletFrozen(
                f"Wallet gelé : {w['owner_id']}. Contactez le support.",
                code="wallet_frozen",
            )

    tx_id = _new_txn_id()
    now = _now_iso()
    currency = from_w.get("currency", DEFAULT_CURRENCY)

    # Compute negative-balance ceiling
    min_b = int(from_w.get("min_balance", 0))
    if allow_negative_from:
        # For cash-commission scenarios where we WANT to permit going negative,
        # cap at the platform-wide max_negative setting.
        max_neg = await wallet_settings.get_int(
            db, SettingKey.WALLET_MAX_NEGATIVE_XOF.value, -50_000
        )
        floor = min(min_b, int(max_neg))
    else:
        floor = min_b

    # CAS loop
    for attempt in range(CAS_MAX_RETRIES):
        # Re-read wallets each attempt to see the freshest balances.
        from_w = await db.wallets_v2.find_one({"owner_id": from_owner_id}, {"_id": 0})
        to_w = await db.wallets_v2.find_one({"owner_id": to_owner_id}, {"_id": 0})
        if not from_w or not to_w:
            raise WalletNotFound("Wallet introuvable en cours de transfert")

        from_balance = int(from_w.get("balance_available", 0))
        if (from_balance - amount_xof) < floor:
            raise InsufficientFunds(
                f"Fonds insuffisants (solde: {from_balance:,} F, requis: {amount_xof:,} F, "
                f"plancher: {floor:,} F).".replace(",", " "),
            )

        from_ver = int(from_w.get("version", 1))
        to_ver = int(to_w.get("version", 1))
        new_from_balance = from_balance - amount_xof
        new_to_balance = int(to_w.get("balance_available", 0)) + amount_xof

        # Attempt CAS on FROM (single-doc atomic).
        r1 = await db.wallets_v2.update_one(
            {"owner_id": from_owner_id, "version": from_ver},
            {
                "$set": {
                    "balance_available": new_from_balance,
                    "updated_at": now,
                    "version": from_ver + 1,
                },
                "$inc": {"stats.total_debited": amount_xof},
            },
        )
        if r1.matched_count != 1:
            await asyncio.sleep((CAS_BACKOFF_MS * (2 ** attempt)) / 1000)
            continue

        # Attempt CAS on TO. If it fails, ROLLBACK the FROM change.
        r2 = await db.wallets_v2.update_one(
            {"owner_id": to_owner_id, "version": to_ver},
            {
                "$set": {
                    "balance_available": new_to_balance,
                    "updated_at": now,
                    "version": to_ver + 1,
                },
                "$inc": {"stats.total_credited": amount_xof},
            },
        )
        if r2.matched_count != 1:
            # Rollback FROM
            await db.wallets_v2.update_one(
                {"owner_id": from_owner_id},
                {
                    "$set": {"balance_available": from_balance, "updated_at": _now_iso()},
                    "$inc": {"version": 1, "stats.total_debited": -amount_xof},
                },
            )
            await asyncio.sleep((CAS_BACKOFF_MS * (2 ** attempt)) / 1000)
            continue

        # ── SUCCESS. Both wallets updated atomically.
        # Write immutable ledger entries + transaction record.
        ledger_debit = {
            "id": _new_ledger_id(),
            "wallet_id": from_w["id"],
            "owner_id": from_owner_id,
            "kind": LedgerKind.DEBIT.value,
            "amount": int(amount_xof),
            "currency": currency,
            "balance_before": from_balance,
            "balance_after": new_from_balance,
            "transaction_id": tx_id,
            "counterparty_wallet_id": to_w["id"],
            "counterparty_owner_id": to_owner_id,
            "transaction_type": transaction_type.value,
            "reason": reason_code or transaction_type.value,
            "label": label or LEDGER_REASONS.get(transaction_type, transaction_type.value),
            "reference": reference or {},
            "created_at": now,
            "created_by": actor_id or "system",
        }
        ledger_credit = {
            "id": _new_ledger_id(),
            "wallet_id": to_w["id"],
            "owner_id": to_owner_id,
            "kind": LedgerKind.CREDIT.value,
            "amount": int(amount_xof),
            "currency": currency,
            "balance_before": int(to_w.get("balance_available", 0)),
            "balance_after": new_to_balance,
            "transaction_id": tx_id,
            "counterparty_wallet_id": from_w["id"],
            "counterparty_owner_id": from_owner_id,
            "transaction_type": transaction_type.value,
            "reason": reason_code or transaction_type.value,
            "label": label or LEDGER_REASONS.get(transaction_type, transaction_type.value),
            "reference": reference or {},
            "created_at": now,
            "created_by": actor_id or "system",
        }
        await db.wallet_ledger.insert_many([ledger_debit, ledger_credit])

        txn = {
            "id": tx_id,
            "type": transaction_type.value,
            "status": initial_status.value,
            "amount": int(amount_xof),
            "currency": currency,
            "from_owner_id": from_owner_id,
            "to_owner_id": to_owner_id,
            "from_wallet_id": from_w["id"],
            "to_wallet_id": to_w["id"],
            "ledger_entry_ids": [ledger_debit["id"], ledger_credit["id"]],
            "provider": provider,
            "provider_ref": provider_ref,
            "reason": reason_code,
            "label": label or LEDGER_REASONS.get(transaction_type, transaction_type.value),
            "reference": reference or {},
            "idempotency_key": idempotency_key,
            "actor_id": actor_id,
            "metadata": metadata or {},
            "audit_trail": [
                {"at": now, "to": initial_status.value, "by": actor_id or "system"}
            ],
            "created_at": now,
            "updated_at": now,
        }
        await db.wallet_transactions_v2.insert_one(txn)

        # Post-hooks: bump specific stat counters.
        if transaction_type == TransactionType.RECHARGE:
            await db.wallets_v2.update_one(
                {"owner_id": to_owner_id},
                {"$inc": {"stats.total_recharged": amount_xof}},
            )
        elif transaction_type == TransactionType.WITHDRAWAL:
            await db.wallets_v2.update_one(
                {"owner_id": from_owner_id},
                {"$inc": {"stats.total_withdrawn": amount_xof}},
            )
        elif transaction_type == TransactionType.CASH_COMMISSION:
            await db.wallets_v2.update_one(
                {"owner_id": from_owner_id},
                {"$inc": {"stats.total_commissions_paid": amount_xof}},
            )

        # Audit trail (best-effort)
        await wallet_audit.log(
            db,
            action=f"wallet.transfer.{transaction_type.value}",
            actor_id=actor_id or "system",
            actor_role="system" if actor_id in (None, "system") else "user",
            target_type="wallet_transaction",
            target_id=tx_id,
            amount_xof=amount_xof,
            before={
                "from_balance": from_balance,
                "to_balance": int(to_w.get("balance_available", 0)),
            },
            after={
                "from_balance": new_from_balance,
                "to_balance": new_to_balance,
            },
            reason=reason_code,
            ip=ip,
            user_agent=user_agent,
            extra={"reference": reference or {}, "provider": provider},
        )

        # Persist idempotency result LAST (after success). Result must contain
        # the same fields we'd return to the caller so a replay is truthful.
        result = {
            "transaction_id": tx_id,
            "type": transaction_type.value,
            "status": initial_status.value,
            "amount_xof": int(amount_xof),
            "currency": currency,
            "from_owner_id": from_owner_id,
            "to_owner_id": to_owner_id,
            "reference": reference or {},
            "created_at": now,
            "from_balance_after": new_from_balance,
            "to_balance_after": new_to_balance,
        }
        await _idempotent_store(db, idempotency_key, scope, result)

        log.info(
            "wallet.transfer %s %d XOF %s → %s tx=%s",
            transaction_type.value,
            amount_xof,
            from_owner_id,
            to_owner_id,
            tx_id,
        )
        return result

    raise CASExhausted(
        "Serveur occupé (trop de tentatives concurrentes). Merci de réessayer."
    )


# ─────────────────────────────────────────────────────────────
# One-sided operations (credit or debit vs the Platform wallet)
# ─────────────────────────────────────────────────────────────
async def credit(
    db: AsyncIOMotorDatabase,
    *,
    owner_id: str,
    amount_xof: int,
    transaction_type: TransactionType,
    label: Optional[str] = None,
    reference: Optional[dict] = None,
    idempotency_key: Optional[str] = None,
    actor_id: Optional[str] = None,
    provider: Optional[str] = None,
    provider_ref: Optional[str] = None,
    to_wallet_kind: WalletKind = WalletKind.CLIENT,
    reason_code: Optional[str] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> dict:
    """Credit `owner_id` by `amount_xof`, debiting the platform master wallet."""
    await ensure_platform_wallet(db)
    return await transfer(
        db,
        from_owner_id=JOKOO_MASTER_OWNER_ID,
        to_owner_id=owner_id,
        amount_xof=amount_xof,
        transaction_type=transaction_type,
        label=label,
        reference=reference,
        idempotency_key=idempotency_key,
        actor_id=actor_id,
        provider=provider,
        provider_ref=provider_ref,
        allow_negative_from=True,  # Platform can go negative (it's the escrow float)
        from_wallet_kind=WalletKind.PLATFORM,
        to_wallet_kind=to_wallet_kind,
        reason_code=reason_code,
        ip=ip,
        user_agent=user_agent,
    )


async def debit(
    db: AsyncIOMotorDatabase,
    *,
    owner_id: str,
    amount_xof: int,
    transaction_type: TransactionType,
    label: Optional[str] = None,
    reference: Optional[dict] = None,
    idempotency_key: Optional[str] = None,
    actor_id: Optional[str] = None,
    allow_negative: bool = False,
    from_wallet_kind: WalletKind = WalletKind.PRESTATAIRE,
    provider: Optional[str] = None,
    reason_code: Optional[str] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> dict:
    """Debit `owner_id` by `amount_xof`, crediting the platform master wallet."""
    await ensure_platform_wallet(db)
    return await transfer(
        db,
        from_owner_id=owner_id,
        to_owner_id=JOKOO_MASTER_OWNER_ID,
        amount_xof=amount_xof,
        transaction_type=transaction_type,
        label=label,
        reference=reference,
        idempotency_key=idempotency_key,
        actor_id=actor_id,
        allow_negative_from=allow_negative,
        from_wallet_kind=from_wallet_kind,
        to_wallet_kind=WalletKind.PLATFORM,
        provider=provider,
        reason_code=reason_code,
        ip=ip,
        user_agent=user_agent,
    )


# ─────────────────────────────────────────────────────────────
# Locking (soft reservation — used by withdrawals & escrow)
# ─────────────────────────────────────────────────────────────
async def lock_funds(
    db: AsyncIOMotorDatabase,
    *,
    owner_id: str,
    amount_xof: int,
    label: str,
    reference: Optional[dict] = None,
) -> dict:
    """Move `amount_xof` from available → locked. No ledger entry (it's internal to the wallet).

    Used e.g. for withdrawal requests: the user's balance is 'reserved' so
    they can't spend it while the admin is processing the payout.
    """
    if amount_xof <= 0:
        raise WalletError("Le montant doit être positif")

    for attempt in range(CAS_MAX_RETRIES):
        w = await db.wallets_v2.find_one({"owner_id": owner_id}, {"_id": 0})
        if not w:
            raise WalletNotFound("Wallet introuvable")
        if w.get("status") == WalletStatus.FROZEN.value:
            raise WalletFrozen("Wallet gelé")
        avail = int(w.get("balance_available", 0))
        min_b = int(w.get("min_balance", 0))
        if (avail - amount_xof) < min_b:
            raise InsufficientFunds(
                f"Fonds insuffisants pour verrouiller {amount_xof:,} F".replace(",", " ")
            )
        ver = int(w.get("version", 1))
        r = await db.wallets_v2.update_one(
            {"owner_id": owner_id, "version": ver},
            {
                "$set": {
                    "balance_available": avail - amount_xof,
                    "balance_locked": int(w.get("balance_locked", 0)) + amount_xof,
                    "updated_at": _now_iso(),
                    "version": ver + 1,
                },
            },
        )
        if r.matched_count == 1:
            return {
                "owner_id": owner_id,
                "locked_added": amount_xof,
                "balance_available": avail - amount_xof,
                "balance_locked": int(w.get("balance_locked", 0)) + amount_xof,
                "label": label,
                "reference": reference or {},
            }
        await asyncio.sleep((CAS_BACKOFF_MS * (2 ** attempt)) / 1000)
    raise CASExhausted("Serveur occupé (lock)")


async def unlock_funds(
    db: AsyncIOMotorDatabase,
    *,
    owner_id: str,
    amount_xof: int,
    to_available: bool = True,
) -> dict:
    """Move funds out of the locked bucket.

    - `to_available=True`  → back to `balance_available` (cancellation / refusal).
    - `to_available=False` → out entirely (the withdrawal was paid; funds are gone).
    """
    if amount_xof <= 0:
        raise WalletError("Le montant doit être positif")
    for attempt in range(CAS_MAX_RETRIES):
        w = await db.wallets_v2.find_one({"owner_id": owner_id}, {"_id": 0})
        if not w:
            raise WalletNotFound("Wallet introuvable")
        locked = int(w.get("balance_locked", 0))
        if locked < amount_xof:
            raise WalletError(
                f"Impossible de déverrouiller {amount_xof:,} F (locked={locked:,} F)".replace(",", " ")
            )
        ver = int(w.get("version", 1))
        upd: dict = {
            "$set": {
                "balance_locked": locked - amount_xof,
                "updated_at": _now_iso(),
                "version": ver + 1,
            }
        }
        if to_available:
            upd["$set"]["balance_available"] = int(w.get("balance_available", 0)) + amount_xof
        r = await db.wallets_v2.update_one(
            {"owner_id": owner_id, "version": ver}, upd
        )
        if r.matched_count == 1:
            return {
                "owner_id": owner_id,
                "balance_locked": locked - amount_xof,
                "balance_available": int(w.get("balance_available", 0)) + (amount_xof if to_available else 0),
            }
        await asyncio.sleep((CAS_BACKOFF_MS * (2 ** attempt)) / 1000)
    raise CASExhausted("Serveur occupé (unlock)")


# ─────────────────────────────────────────────────────────────
# History
# ─────────────────────────────────────────────────────────────
async def list_ledger(
    db: AsyncIOMotorDatabase,
    owner_id: str,
    *,
    limit: int = 50,
    before: Optional[str] = None,
    kinds: Optional[list[str]] = None,
) -> Tuple[list[dict], Optional[str], bool]:
    """Return (items, next_cursor, has_more). Sorted DESC by `created_at`.

    `before` cursor is the ISO created_at of the last item on the previous page.
    """
    q: dict[str, Any] = {"owner_id": owner_id}
    if before:
        q["created_at"] = {"$lt": before}
    if kinds:
        q["transaction_type"] = {"$in": kinds}
    lim = max(1, min(int(limit or 50), 200))
    cur = db.wallet_ledger.find(q, {"_id": 0}).sort("created_at", -1).limit(lim + 1)
    items = await cur.to_list(lim + 1)
    has_more = len(items) > lim
    items = items[:lim]
    next_cursor = items[-1]["created_at"] if (has_more and items) else None
    return items, next_cursor, has_more


async def get_transaction(db: AsyncIOMotorDatabase, tx_id: str) -> Optional[dict]:
    return await db.wallet_transactions_v2.find_one({"id": tx_id}, {"_id": 0})


# ─────────────────────────────────────────────────────────────
# Freeze / unfreeze / set min balance (admin only)
# ─────────────────────────────────────────────────────────────
async def set_status(
    db: AsyncIOMotorDatabase,
    owner_id: str,
    status: WalletStatus,
    *,
    actor_id: str,
    reason: Optional[str] = None,
    ip: Optional[str] = None,
) -> dict:
    before = await get_wallet(db, owner_id)
    if not before:
        raise WalletNotFound("Wallet introuvable")
    now = _now_iso()
    await db.wallets_v2.update_one(
        {"owner_id": owner_id},
        {"$set": {"status": status.value, "updated_at": now}, "$inc": {"version": 1}},
    )
    await wallet_audit.log(
        db,
        action="wallet.set_status",
        actor_id=actor_id,
        actor_role="admin",
        target_type="wallet",
        target_id=before["id"],
        before={"status": before.get("status")},
        after={"status": status.value},
        reason=reason,
        ip=ip,
    )
    return {"owner_id": owner_id, "status": status.value}


async def set_min_balance(
    db: AsyncIOMotorDatabase,
    owner_id: str,
    min_balance_xof: int,
    *,
    actor_id: str,
    reason: Optional[str] = None,
    ip: Optional[str] = None,
) -> dict:
    """Admin only — override the negative-balance floor for a specific wallet.

    A more negative value = more headroom to accrue commission debt.
    """
    before = await get_wallet(db, owner_id)
    if not before:
        raise WalletNotFound("Wallet introuvable")
    max_neg = await wallet_settings.get_int(
        db, SettingKey.WALLET_MAX_NEGATIVE_XOF.value, -50_000
    )
    if int(min_balance_xof) < int(max_neg):
        raise WalletError(
            f"min_balance ({min_balance_xof}) < plafond global ({max_neg}). "
            "Modifiez d'abord le paramètre `wallet_max_negative_xof`."
        )
    now = _now_iso()
    await db.wallets_v2.update_one(
        {"owner_id": owner_id},
        {"$set": {"min_balance": int(min_balance_xof), "updated_at": now},
         "$inc": {"version": 1}},
    )
    await wallet_audit.log(
        db,
        action="wallet.set_min_balance",
        actor_id=actor_id,
        actor_role="admin",
        target_type="wallet",
        target_id=before["id"],
        before={"min_balance": before.get("min_balance")},
        after={"min_balance": int(min_balance_xof)},
        reason=reason,
        ip=ip,
    )
    return {"owner_id": owner_id, "min_balance": int(min_balance_xof)}
