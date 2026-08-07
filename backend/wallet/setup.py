"""One-shot startup: create MongoDB indexes for the wallet subsystem.

Idempotent — safe to call on every boot. Adds indexes only if missing.
"""

from __future__ import annotations

import logging
from motor.motor_asyncio import AsyncIOMotorDatabase

log = logging.getLogger("jokoo.wallet.setup")


async def create_indexes(db: AsyncIOMotorDatabase) -> None:
    """Idempotent index creation for all wallet-related collections."""

    # ── wallets: 1 wallet per owner (unique)
    await db.wallets_v2.create_index("owner_id", unique=True, name="ix_wallets_owner_uniq")
    await db.wallets_v2.create_index("id", unique=True, name="ix_wallets_id_uniq")
    await db.wallets_v2.create_index("kind", name="ix_wallets_kind")
    await db.wallets_v2.create_index("status", name="ix_wallets_status")
    await db.wallets_v2.create_index("balance_available", name="ix_wallets_bal")

    # ── wallet_ledger: fast lookup by owner+time
    await db.wallet_ledger.create_index("id", unique=True, name="ix_ledger_id_uniq")
    await db.wallet_ledger.create_index(
        [("owner_id", 1), ("created_at", -1)],
        name="ix_ledger_owner_time",
    )
    await db.wallet_ledger.create_index("transaction_id", name="ix_ledger_tx")
    await db.wallet_ledger.create_index("transaction_type", name="ix_ledger_type")
    await db.wallet_ledger.create_index("wallet_id", name="ix_ledger_wallet")

    # ── wallet_transactions
    await db.wallet_transactions_v2.create_index("id", unique=True, name="ix_tx_id_uniq")
    await db.wallet_transactions_v2.create_index("type", name="ix_tx_type")
    await db.wallet_transactions_v2.create_index("status", name="ix_tx_status")
    await db.wallet_transactions_v2.create_index([("from_owner_id", 1), ("created_at", -1)], name="ix_tx_from")
    await db.wallet_transactions_v2.create_index([("to_owner_id", 1), ("created_at", -1)], name="ix_tx_to")

    # ── wallet_idempotency (dedup keys)
    await db.wallet_idempotency.create_index(
        [("key", 1), ("scope", 1)], unique=True, name="ix_idem_key_scope_uniq"
    )
    # TTL on idempotency records (24h) — auto-clean
    await db.wallet_idempotency.create_index(
        "created_at",
        expireAfterSeconds=48 * 3600,
        name="ix_idem_ttl_48h",
    )

    # ── payment_intents
    await db.payment_intents.create_index("id", unique=True, name="ix_pi_id_uniq")
    await db.payment_intents.create_index("idempotency_key", name="ix_pi_idem")
    await db.payment_intents.create_index([("owner_id", 1), ("created_at", -1)], name="ix_pi_owner_time")
    await db.payment_intents.create_index("provider", name="ix_pi_provider")
    await db.payment_intents.create_index("status", name="ix_pi_status")
    await db.payment_intents.create_index("provider_intent_id", name="ix_pi_provider_ref")

    # ── withdrawal_requests
    await db.withdrawal_requests.create_index("id", unique=True, name="ix_wdr_id_uniq")
    await db.withdrawal_requests.create_index([("user_id", 1), ("created_at", -1)], name="ix_wdr_user_time")
    await db.withdrawal_requests.create_index("status", name="ix_wdr_status")

    # ── refund_requests
    await db.refund_requests.create_index("id", unique=True, name="ix_ref_id_uniq")
    await db.refund_requests.create_index("booking_id", name="ix_ref_booking")
    await db.refund_requests.create_index("status", name="ix_ref_status")
    await db.refund_requests.create_index("client_id", name="ix_ref_client")

    # ── commission_rules
    await db.commission_rules.create_index(
        "category_key", unique=True, name="ix_com_category_uniq"
    )

    # ── platform_settings (id = key)
    # No extra indexes needed; _id already covers.

    # ── subscriptions (Jokoo Pro)
    await db.subscriptions.create_index("id", unique=True, name="ix_sub_id_uniq")
    await db.subscriptions.create_index(
        [("owner_id", 1), ("kind", 1), ("status", 1)],
        name="ix_sub_owner_kind_status",
    )
    await db.subscriptions.create_index("expires_at", name="ix_sub_expires")

    # ── wallet_audit_logs
    await db.wallet_audit_logs.create_index("id", unique=True, name="ix_audit_id_uniq")
    await db.wallet_audit_logs.create_index([("at", -1)], name="ix_audit_time")
    await db.wallet_audit_logs.create_index("actor_id", name="ix_audit_actor")
    await db.wallet_audit_logs.create_index(
        [("target_type", 1), ("target_id", 1)], name="ix_audit_target"
    )
    await db.wallet_audit_logs.create_index("action", name="ix_audit_action")

    log.info("[wallet] indexes ok")
