"""
Jokoo Wallet & Payments Engine — Production-grade financial infrastructure.

Design principles (Uber / Airbnb / Fiverr-grade):

1. **Backend = single source of truth.** No amount, no fee, no commission is ever
   computed by the mobile app. Every value shown to the user comes from the
   backend, signed by JWT auth, and can be independently recomputed on demand.

2. **Immutable append-only ledger.** Every wallet mutation is a new entry in
   `wallet_ledger`. Balance is derived from the sum + snapshot (`balance_after`
   column). Nothing is ever deleted or updated in the ledger.

3. **Double-entry accounting.** Every debit has a matching credit on a
   counterparty wallet. The sum of all `credit − debit` across the whole ledger
   equals zero. Any discrepancy is a data-integrity red flag caught by the
   nightly reconciler.

4. **Optimistic concurrency + idempotency.**
   - Each `wallets` document has a monotonically increasing `version` field.
   - Every mutating call MUST include an `idempotency_key`. Duplicate keys
     return the previous result (no double debit / double credit).
   - Race conditions caught by CAS updates (`update_one({... version: X}, ...)`)
     with automatic retries.

5. **Money as integers.** All amounts stored as integer minor units of `XOF`
   (1 XOF = 1 unit — West Africa uses whole francs, no cents). This eliminates
   floating-point rounding drift.

6. **Explicit currency.** Every amount stored with `currency`. Multi-currency
   support future-proofed (fees table, FX table).

7. **Isolated modules.** Every business event is a separate module:
   commission, recharge, withdrawal, refund, jokoo_pro. All go through the
   central `wallet.service.transfer()` for actual money movement.

8. **Full audit trail.** Beyond the ledger, `audit_logs` records every mutating
   action with actor, IP, before/after snapshots — for forensic review and
   regulatory compliance.
"""

__all__ = [
    "constants",
    "models",
    "service",
    "settings",
    "commission",
    "payment_intents",
    "withdrawals",
    "refunds",
    "jokoo_pro",
    "router",
    "admin",
    "audit",
]
