"""Wallet + Payments v2 comprehensive backend tests.

Covers all 8 priorities of the review request:
1. Wallet snapshot & history
2. Recharge (payment intents)
3. Withdrawal
4. Cash commission
5. Jokoo Pro subscription
6. Admin operations
7. Refund
8. Security / edge cases
"""
from __future__ import annotations

import os
import uuid
import time
import pytest
import requests

BASE_URL = "http://localhost:8001/api"

CLIENT_EMAIL = "client@jokoo.sn"
CLIENT_PASSWORD = "Passw0rd!"
PRO_EMAIL = "pro@jokoo.sn"
PRO_PASSWORD = "Passw0rd!"
ADMIN_EMAIL = "admin@jokoo.sn"
ADMIN_PASSWORD = "Admin1234!"


# ─── Fixtures ────────────────────────────────────────────────
def _login(email: str, password: str) -> dict:
    r = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def client_auth():
    return _login(CLIENT_EMAIL, CLIENT_PASSWORD)


@pytest.fixture(scope="session")
def pro_auth():
    return _login(PRO_EMAIL, PRO_PASSWORD)


@pytest.fixture(scope="session")
def admin_auth():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


def _h(auth):
    return {"Authorization": f"Bearer {auth['token']}", "Content-Type": "application/json"}


# ═════════════════════════════════════════════════════════════
# PRIORITY 1 — Wallet snapshot & history
# ═════════════════════════════════════════════════════════════
class TestWalletSnapshotAndHistory:
    def test_get_client_wallet(self, client_auth):
        r = requests.get(f"{BASE_URL}/wallet/me", headers=_h(client_auth))
        assert r.status_code == 200, r.text
        w = r.json()
        assert "balance_available_xof" in w
        assert "owner_id" in w
        assert w["owner_id"] == client_auth["user"]["id"]
        assert w["kind"] in ("client", "prestataire")
        assert "currency" in w
        assert w["currency"] == "XOF"

    def test_get_pro_wallet_kind_prestataire(self, pro_auth):
        r = requests.get(f"{BASE_URL}/wallet/me", headers=_h(pro_auth))
        assert r.status_code == 200, r.text
        w = r.json()
        assert w["kind"] == "prestataire", f"Expected prestataire, got {w.get('kind')}"

    def test_get_history_paginated(self, client_auth):
        r = requests.get(f"{BASE_URL}/wallet/history?limit=10", headers=_h(client_auth))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "items" in d
        assert "has_more" in d
        assert isinstance(d["items"], list)

    def test_list_providers(self, client_auth):
        r = requests.get(f"{BASE_URL}/wallet/providers", headers=_h(client_auth))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "providers" in d
        assert d["currency"] == "XOF"
        assert d["recharge_min_xof"] >= 1000
        assert d["withdrawal_min_xof"] >= 1000


# ═════════════════════════════════════════════════════════════
# PRIORITY 2 — Recharge
# ═════════════════════════════════════════════════════════════
class TestRecharge:
    def test_recharge_valid(self, client_auth):
        r = requests.post(
            f"{BASE_URL}/wallet/recharge",
            headers=_h(client_auth),
            json={"amount_xof": 5000, "provider": "stripe"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "payment_intent_id" in d
        assert d["amount_xof"] == 5000
        assert d["provider"] == "stripe"

    def test_recharge_below_min(self, client_auth):
        r = requests.post(
            f"{BASE_URL}/wallet/recharge",
            headers=_h(client_auth),
            json={"amount_xof": 50, "provider": "stripe"},
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"

    def test_recharge_above_max(self, client_auth):
        # 999_999_999 exceeds the absolute limit (100_000_000) → 400 from pydantic
        r = requests.post(
            f"{BASE_URL}/wallet/recharge",
            headers=_h(client_auth),
            json={"amount_xof": 999999999, "provider": "stripe"},
        )
        assert r.status_code in (400, 422), f"Expected 400/422, got {r.status_code}: {r.text}"

    def test_recharge_idempotency(self, client_auth):
        idem = f"test-idem-{uuid.uuid4().hex[:12]}"
        r1 = requests.post(
            f"{BASE_URL}/wallet/recharge",
            headers=_h(client_auth),
            json={"amount_xof": 3000, "provider": "stripe", "idempotency_key": idem},
        )
        assert r1.status_code == 200, r1.text
        id1 = r1.json()["payment_intent_id"]

        r2 = requests.post(
            f"{BASE_URL}/wallet/recharge",
            headers=_h(client_auth),
            json={"amount_xof": 3000, "provider": "stripe", "idempotency_key": idem},
        )
        assert r2.status_code == 200, r2.text
        id2 = r2.json()["payment_intent_id"]
        assert id1 == id2, f"Idempotency failed: got two different intents {id1} vs {id2}"

    def test_admin_confirm_recharge_credits_wallet(self, client_auth, admin_auth):
        # Snapshot balance before
        wr = requests.get(f"{BASE_URL}/wallet/me", headers=_h(client_auth))
        before = wr.json()["balance_available_xof"]

        # Create recharge intent
        r = requests.post(
            f"{BASE_URL}/wallet/recharge",
            headers=_h(client_auth),
            json={"amount_xof": 5000, "provider": "stripe"},
        )
        assert r.status_code == 200, r.text
        intent_id = r.json()["payment_intent_id"]

        # Admin confirms
        rc = requests.post(
            f"{BASE_URL}/admin/wallet/payment-intents/{intent_id}/confirm",
            headers=_h(admin_auth),
            json={"provider_ref": f"TEST_STRIPE_{uuid.uuid4().hex[:8]}"},
        )
        assert rc.status_code == 200, f"Confirm failed: {rc.status_code} {rc.text}"

        # Snapshot after
        wr2 = requests.get(f"{BASE_URL}/wallet/me", headers=_h(client_auth))
        after = wr2.json()["balance_available_xof"]
        assert after == before + 5000, f"Expected +5000, got before={before} after={after}"

        # Verify credit shows up in history
        hist = requests.get(f"{BASE_URL}/wallet/history?limit=5", headers=_h(client_auth))
        assert hist.status_code == 200
        items = hist.json()["items"]
        assert len(items) > 0
        top = items[0]
        assert top["kind"] == "credit"
        assert top["amount_xof"] == 5000
        assert "Recharge" in (top.get("label") or "") or top.get("transaction_type") == "recharge"


# ═════════════════════════════════════════════════════════════
# PRIORITY 3 — Withdrawal
# ═════════════════════════════════════════════════════════════
def _topup_via_recharge(auth, admin_auth, amount_xof: int):
    """Fund a wallet using a stripe recharge intent confirmed by admin.
    This credits without draining the platform master wallet."""
    r = requests.post(
        f"{BASE_URL}/wallet/recharge",
        headers=_h(auth),
        json={"amount_xof": amount_xof, "provider": "stripe"},
    )
    assert r.status_code == 200, f"Recharge create failed: {r.text}"
    iid = r.json()["payment_intent_id"]
    rc = requests.post(
        f"{BASE_URL}/admin/wallet/payment-intents/{iid}/confirm",
        headers=_h(admin_auth),
        json={"provider_ref": f"TEST_TOPUP_{uuid.uuid4().hex[:6]}"},
    )
    assert rc.status_code == 200, f"Confirm failed: {rc.text}"


@pytest.fixture(scope="session")
def funded_pro(pro_auth, admin_auth):
    """Ensure pro has ~50k XOF before withdrawal tests."""
    r = requests.get(f"{BASE_URL}/wallet/me", headers=_h(pro_auth))
    bal = r.json()["balance_available_xof"]
    if bal < 50000:
        top = 80000 - bal  # generous
        _topup_via_recharge(pro_auth, admin_auth, top)
    return pro_auth


class TestWithdrawal:
    def test_withdraw_locks_funds(self, funded_pro):
        pro_auth = funded_pro
        w0 = requests.get(f"{BASE_URL}/wallet/me", headers=_h(pro_auth)).json()
        avail_before = w0["balance_available_xof"]
        locked_before = w0["balance_locked_xof"]

        r = requests.post(
            f"{BASE_URL}/wallet/withdraw",
            headers=_h(pro_auth),
            json={"amount_xof": 5000, "method": "wave", "destination_phone": "+221771234567"},
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "pending"
        wid = doc["id"]

        w1 = requests.get(f"{BASE_URL}/wallet/me", headers=_h(pro_auth)).json()
        assert w1["balance_available_xof"] == avail_before - 5000
        assert w1["balance_locked_xof"] == locked_before + 5000

        # Cancel to release funds for next tests
        rc = requests.post(
            f"{BASE_URL}/wallet/withdrawals/{wid}/cancel", headers=_h(pro_auth)
        )
        assert rc.status_code == 200, rc.text

    def test_withdraw_insufficient(self, funded_pro):
        # Use an amount > current balance but within [MIN..MAX] validation range
        w = requests.get(f"{BASE_URL}/wallet/me", headers=_h(funded_pro)).json()
        # Balance is typically < 200k → 500k is > balance but < 2M cap
        excessive = max(w["balance_available_xof"] + 100_000, 500_000)
        r = requests.post(
            f"{BASE_URL}/wallet/withdraw",
            headers=_h(funded_pro),
            json={"amount_xof": excessive, "method": "wave", "destination_phone": "+221771234567"},
        )
        assert r.status_code == 402, r.text

    def test_withdraw_below_min(self, funded_pro):
        r = requests.post(
            f"{BASE_URL}/wallet/withdraw",
            headers=_h(funded_pro),
            json={"amount_xof": 500, "method": "wave", "destination_phone": "+221771234567"},
        )
        assert r.status_code == 400, r.text

    def test_withdraw_wave_missing_phone(self, funded_pro):
        r = requests.post(
            f"{BASE_URL}/wallet/withdraw",
            headers=_h(funded_pro),
            json={"amount_xof": 5000, "method": "wave"},
        )
        assert r.status_code == 400, r.text

    def test_admin_approve_and_mark_paid(self, funded_pro, admin_auth):
        # Create withdrawal
        r = requests.post(
            f"{BASE_URL}/wallet/withdraw",
            headers=_h(funded_pro),
            json={"amount_xof": 5000, "method": "wave", "destination_phone": "+221771234567"},
        )
        assert r.status_code == 200, r.text
        wid = r.json()["id"]

        # Approve
        ra = requests.post(
            f"{BASE_URL}/admin/wallet/withdrawals/{wid}/decision",
            headers=_h(admin_auth),
            json={"action": "approve"},
        )
        assert ra.status_code == 200, ra.text
        assert ra.json()["status"] == "approved"

        # locked should still be locked
        w = requests.get(f"{BASE_URL}/wallet/me", headers=_h(funded_pro)).json()
        assert w["balance_locked_xof"] >= 5000

        # Mark paid
        rp = requests.post(
            f"{BASE_URL}/admin/wallet/withdrawals/{wid}/decision",
            headers=_h(admin_auth),
            json={"action": "mark_paid", "external_ref": "WAVE_TX_TEST_1"},
        )
        assert rp.status_code == 200, rp.text
        assert rp.json()["status"] == "paid"

    def test_admin_refuse_releases_funds(self, funded_pro, admin_auth):
        w0 = requests.get(f"{BASE_URL}/wallet/me", headers=_h(funded_pro)).json()
        avail_before = w0["balance_available_xof"]

        r = requests.post(
            f"{BASE_URL}/wallet/withdraw",
            headers=_h(funded_pro),
            json={"amount_xof": 5000, "method": "wave", "destination_phone": "+221771234567"},
        )
        assert r.status_code == 200, r.text
        wid = r.json()["id"]

        rr = requests.post(
            f"{BASE_URL}/admin/wallet/withdrawals/{wid}/decision",
            headers=_h(admin_auth),
            json={"action": "refuse", "admin_notes": "TEST_refuse"},
        )
        assert rr.status_code == 200, rr.text

        w1 = requests.get(f"{BASE_URL}/wallet/me", headers=_h(funded_pro)).json()
        assert w1["balance_available_xof"] == avail_before, "Funds should be released"

    def test_list_my_withdrawals(self, funded_pro):
        r = requests.get(f"{BASE_URL}/wallet/withdrawals/mine", headers=_h(funded_pro))
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


# ═════════════════════════════════════════════════════════════
# PRIORITY 4 — Cash commission
# ═════════════════════════════════════════════════════════════
class TestCashCommission:
    def _create_booking(self, admin_auth, pro_id: str, client_id: str) -> str:
        """Insert booking directly via mongo (avoid provider-profile requirement)."""
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo_url = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
        db_name = os.environ.get("DB_NAME") or "jokoo_db"
        bid = f"TEST_book_{uuid.uuid4().hex[:12]}"

        async def _insert():
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            await db.bookings.insert_one({
                "id": bid,
                "client_id": client_id,
                "client_name": "TEST client",
                "provider_id": pro_id,
                "provider_name": "TEST pro",
                "provider_service": "plumbing",
                "service_id": None,
                "service_name": None,
                "date": "2026-02-01",
                "time": "10:00",
                "address": "TEST address",
                "description": "TEST cash booking",
                "price": 10000,
                "price_type": "fixed",
                "estimated_price": 10000,
                "category_key": "plumbing",
                "status": "pending",
                "paid": False,
                "created_at": "2026-01-01T00:00:00Z",
            })
            client.close()

        asyncio.run(_insert())
        return bid

    def test_cash_payment_debits_commission(self, pro_auth, client_auth, admin_auth):
        pro_id = pro_auth["user"]["id"]
        client_id = client_auth["user"]["id"]

        bid = self._create_booking(admin_auth, pro_id, client_id)
        assert bid, "Missing booking id"

        # Ensure pro has enough funds (may already be topped up in earlier tests)
        w0 = requests.get(f"{BASE_URL}/wallet/me", headers=_h(pro_auth)).json()
        if w0["balance_available_xof"] < 2000:
            _topup_via_recharge(pro_auth, admin_auth, 10000)
            w0 = requests.get(f"{BASE_URL}/wallet/me", headers=_h(pro_auth)).json()

        bal_before = w0["balance_available_xof"]

        # Post cash payment
        r = requests.post(
            f"{BASE_URL}/bookings/{bid}/cash-payment",
            headers=_h(pro_auth),
            json={"amount": 10000, "category": "plumbing"},
        )
        assert r.status_code == 200, f"cash-payment failed: {r.status_code} {r.text}"
        d = r.json()
        assert d.get("commission_xof") == 1500, f"Expected commission=1500, got {d.get('commission_xof')}"
        assert d.get("transaction_id"), "Missing transaction_id"
        assert d.get("wallet_balance_after_xof") is not None

        # Verify balance decreased by 1500
        w1 = requests.get(f"{BASE_URL}/wallet/me", headers=_h(pro_auth)).json()
        assert w1["balance_available_xof"] == bal_before - 1500, \
            f"Expected {bal_before-1500}, got {w1['balance_available_xof']}"

        # Verify ledger entry
        h = requests.get(f"{BASE_URL}/wallet/history?limit=5", headers=_h(pro_auth)).json()
        top = h["items"][0]
        assert top["kind"] == "debit"
        assert top["amount_xof"] == 1500
        assert "Commission" in (top.get("label") or "")

        # Second call must reject
        r2 = requests.post(
            f"{BASE_URL}/bookings/{bid}/cash-payment",
            headers=_h(pro_auth),
            json={"amount": 10000, "category": "plumbing"},
        )
        assert r2.status_code == 400, f"Expected 400 for already paid, got {r2.status_code}"


# ═════════════════════════════════════════════════════════════
# PRIORITY 5 — Jokoo Pro subscription
# ═════════════════════════════════════════════════════════════
class TestJokooPro:
    def test_status_endpoint(self, pro_auth):
        r = requests.get(f"{BASE_URL}/wallet/jokoo-pro/status", headers=_h(pro_auth))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "active" in d

    def test_client_cannot_subscribe(self, client_auth):
        r = requests.post(f"{BASE_URL}/wallet/jokoo-pro/subscribe", headers=_h(client_auth))
        assert r.status_code == 403, r.text

    def test_pro_subscribe_flow(self, pro_auth, admin_auth):
        pro_id = pro_auth["user"]["id"]
        # Ensure pro has enough (15000 default)
        w0 = requests.get(f"{BASE_URL}/wallet/me", headers=_h(pro_auth)).json()
        if w0["balance_available_xof"] < 20000:
            _topup_via_recharge(pro_auth, admin_auth, 30000)

        r = requests.post(f"{BASE_URL}/wallet/jokoo-pro/subscribe", headers=_h(pro_auth))
        # Accept 200 (subscribe worked) or 400/409 (already active) as passing
        if r.status_code not in (200, 400, 409):
            pytest.fail(f"Unexpected status: {r.status_code} {r.text}")

        s = requests.get(f"{BASE_URL}/wallet/jokoo-pro/status", headers=_h(pro_auth)).json()
        assert s.get("active") is True or s.get("status") == "active"

    def test_pro_cancel(self, pro_auth):
        r = requests.post(f"{BASE_URL}/wallet/jokoo-pro/cancel", headers=_h(pro_auth))
        # 200 if active, 400/404 if not
        assert r.status_code in (200, 400, 404), r.text

        s = requests.get(f"{BASE_URL}/wallet/jokoo-pro/status", headers=_h(pro_auth)).json()
        # Status snapshot always available
        assert "active" in s


# ═════════════════════════════════════════════════════════════
# PRIORITY 6 — Admin operations
# ═════════════════════════════════════════════════════════════
class TestAdminOps:
    def test_bonus(self, admin_auth, client_auth):
        r = requests.post(
            f"{BASE_URL}/admin/wallet/bonus",
            headers=_h(admin_auth),
            json={"owner_id": client_auth["user"]["id"], "amount_xof": 3000,
                  "label": "TEST_bonus", "category": "cashback"},
        )
        assert r.status_code == 200, r.text

    def test_list_prestataire_wallets(self, admin_auth):
        r = requests.get(f"{BASE_URL}/admin/wallet/list?kind=prestataire", headers=_h(admin_auth))
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_get_wallet_and_ledger(self, admin_auth, client_auth):
        oid = client_auth["user"]["id"]
        r = requests.get(f"{BASE_URL}/admin/wallet/wallet/{oid}", headers=_h(admin_auth))
        assert r.status_code == 200, r.text
        assert "wallet" in r.json()
        assert "user" in r.json()

        rl = requests.get(f"{BASE_URL}/admin/wallet/wallet/{oid}/ledger", headers=_h(admin_auth))
        assert rl.status_code == 200, rl.text
        assert "items" in rl.json()

    def test_adjust_credit_and_debit(self, admin_auth, client_auth):
        oid = client_auth["user"]["id"]
        r1 = requests.post(
            f"{BASE_URL}/admin/wallet/wallet/{oid}/adjust",
            headers=_h(admin_auth),
            json={"owner_id": oid, "amount_xof": 1000, "reason": "TEST_correction+"},
        )
        assert r1.status_code == 200, r1.text

        r2 = requests.post(
            f"{BASE_URL}/admin/wallet/wallet/{oid}/adjust",
            headers=_h(admin_auth),
            json={"owner_id": oid, "amount_xof": -500, "reason": "TEST_correction-"},
        )
        assert r2.status_code == 200, r2.text

    def test_adjust_owner_id_mismatch(self, admin_auth, client_auth):
        oid = client_auth["user"]["id"]
        r = requests.post(
            f"{BASE_URL}/admin/wallet/wallet/{oid}/adjust",
            headers=_h(admin_auth),
            json={"owner_id": "DIFFERENT_ID", "amount_xof": 100, "reason": "TEST_mismatch"},
        )
        assert r.status_code == 400, r.text

    def test_freeze_and_unfreeze(self, admin_auth, client_auth):
        oid = client_auth["user"]["id"]
        r1 = requests.post(
            f"{BASE_URL}/admin/wallet/wallet/{oid}/status",
            headers=_h(admin_auth),
            json={"status": "frozen", "reason": "TEST_freeze"},
        )
        assert r1.status_code == 200, r1.text

        # Attempt debit on frozen wallet
        r2 = requests.post(
            f"{BASE_URL}/admin/wallet/wallet/{oid}/adjust",
            headers=_h(admin_auth),
            json={"owner_id": oid, "amount_xof": -100, "reason": "TEST_debit_frozen"},
        )
        # Must fail with 403 (or similar block)
        assert r2.status_code in (400, 402, 403, 409), \
            f"Expected debit to be blocked on frozen wallet, got {r2.status_code}"

        # Unfreeze
        r3 = requests.post(
            f"{BASE_URL}/admin/wallet/wallet/{oid}/status",
            headers=_h(admin_auth),
            json={"status": "active", "reason": "TEST_unfreeze"},
        )
        assert r3.status_code == 200, r3.text

    def test_set_min_balance(self, admin_auth, client_auth):
        oid = client_auth["user"]["id"]
        r = requests.post(
            f"{BASE_URL}/admin/wallet/wallet/{oid}/min-balance",
            headers=_h(admin_auth),
            json={"min_balance_xof": -10000, "reason": "TEST_min"},
        )
        assert r.status_code == 200, r.text

    def test_commission_rule_crud(self, admin_auth):
        # Upsert
        r = requests.post(
            f"{BASE_URL}/admin/wallet/commissions/rules",
            headers=_h(admin_auth),
            json={"category_key": "mobility.*", "commission_percent": 10},
        )
        assert r.status_code == 200, r.text

        # List
        rl = requests.get(f"{BASE_URL}/admin/wallet/commissions/rules", headers=_h(admin_auth))
        assert rl.status_code == 200
        keys = [x.get("category_key") for x in rl.json()]
        assert "mobility.*" in keys

        # Delete
        rd = requests.delete(
            f"{BASE_URL}/admin/wallet/commissions/rules/mobility.*", headers=_h(admin_auth)
        )
        assert rd.status_code == 200

    def test_settings(self, admin_auth):
        r = requests.post(
            f"{BASE_URL}/admin/wallet/settings",
            headers=_h(admin_auth),
            json={"key": "jokoo_pro_price_xof", "value": 20000},
        )
        assert r.status_code == 200, r.text

        # Snapshot
        rs = requests.get(f"{BASE_URL}/admin/wallet/settings", headers=_h(admin_auth))
        assert rs.status_code == 200

        # Reset to 15000 for other tests
        requests.post(
            f"{BASE_URL}/admin/wallet/settings",
            headers=_h(admin_auth),
            json={"key": "jokoo_pro_price_xof", "value": 15000},
        )

    def test_settings_invalid_key(self, admin_auth):
        r = requests.post(
            f"{BASE_URL}/admin/wallet/settings",
            headers=_h(admin_auth),
            json={"key": "hackme", "value": 1},
        )
        assert r.status_code == 400, r.text

    def test_dashboard(self, admin_auth):
        r = requests.get(f"{BASE_URL}/admin/wallet/dashboard", headers=_h(admin_auth))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "counts" in d
        assert "platform_wallet" in d
        assert "recent_transactions" in d

    def test_transactions_list(self, admin_auth):
        r = requests.get(f"{BASE_URL}/admin/wallet/transactions", headers=_h(admin_auth))
        assert r.status_code == 200

    def test_audit_list(self, admin_auth):
        r = requests.get(f"{BASE_URL}/admin/wallet/audit?limit=10", headers=_h(admin_auth))
        assert r.status_code == 200


# ═════════════════════════════════════════════════════════════
# PRIORITY 8 — Security & edge cases
# ═════════════════════════════════════════════════════════════
class TestSecurity:
    def test_no_token_unauthorized(self):
        for path in [
            "/wallet/me",
            "/wallet/history",
            "/wallet/recharge",
            "/wallet/withdraw",
            "/wallet/jokoo-pro/status",
            "/admin/wallet/dashboard",
        ]:
            method = "get" if path in ("/wallet/me", "/wallet/history",
                                       "/wallet/jokoo-pro/status",
                                       "/admin/wallet/dashboard") else "post"
            r = getattr(requests, method)(f"{BASE_URL}{path}", timeout=5)
            assert r.status_code in (401, 403), f"{path} expected 401/403, got {r.status_code}"

    def test_client_cannot_access_admin(self, client_auth):
        r = requests.get(f"{BASE_URL}/admin/wallet/dashboard", headers=_h(client_auth))
        assert r.status_code == 403, r.text

    def test_user_cannot_view_others_intent(self, client_auth, pro_auth):
        # Client creates an intent
        r = requests.post(
            f"{BASE_URL}/wallet/recharge",
            headers=_h(client_auth),
            json={"amount_xof": 2000, "provider": "stripe"},
        )
        assert r.status_code == 200
        iid = r.json()["payment_intent_id"]

        # Pro tries to fetch
        r2 = requests.get(f"{BASE_URL}/wallet/recharge/{iid}", headers=_h(pro_auth))
        assert r2.status_code in (403, 404), f"Expected 403/404, got {r2.status_code}"


# ═════════════════════════════════════════════════════════════
# PRIORITY 7 — Refund (basic — cash booking refund reverses commission)
# ═════════════════════════════════════════════════════════════
class TestRefund:
    def test_refund_cash_booking_reverses_commission(self, pro_auth, client_auth, admin_auth):
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo_url = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
        db_name = os.environ.get("DB_NAME") or "jokoo_db"
        pro_id = pro_auth["user"]["id"]
        client_id = client_auth["user"]["id"]
        bid = f"TEST_refund_{uuid.uuid4().hex[:10]}"

        async def _insert():
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            await db.bookings.insert_one({
                "id": bid,
                "client_id": client_id,
                "provider_id": pro_id,
                "provider_name": "TEST pro",
                "provider_service": "plumbing",
                "service_id": None,
                "service_name": None,
                "date": "2026-02-01",
                "time": "10:00",
                "address": "TEST",
                "description": "TEST refund",
                "price": 10000,
                "estimated_price": 10000,
                "category_key": "plumbing",
                "status": "pending",
                "paid": False,
                "created_at": "2026-01-01T00:00:00Z",
            })
            client.close()

        asyncio.run(_insert())

        # Ensure pro can afford commission
        w0 = requests.get(f"{BASE_URL}/wallet/me", headers=_h(pro_auth)).json()
        if w0["balance_available_xof"] < 5000:
            _topup_via_recharge(pro_auth, admin_auth, 10000)

        # 1) Pro records cash payment → commission 1500 debited
        r = requests.post(
            f"{BASE_URL}/bookings/{bid}/cash-payment",
            headers=_h(pro_auth),
            json={"amount": 10000, "category": "plumbing"},
        )
        assert r.status_code == 200, r.text

        w1 = requests.get(f"{BASE_URL}/wallet/me", headers=_h(pro_auth)).json()
        bal_after_commission = w1["balance_available_xof"]

        # 2) Admin issues refund
        rr = requests.post(
            f"{BASE_URL}/admin/wallet/refunds",
            headers=_h(admin_auth),
            json={"booking_id": bid, "reason": "cancelled_by_client"},
        )
        assert rr.status_code == 200, rr.text
        d = rr.json()
        assert d.get("status") == "completed", d

        # 3) Pro wallet should be credited back the 1500 (commission reversed)
        w2 = requests.get(f"{BASE_URL}/wallet/me", headers=_h(pro_auth)).json()
        assert w2["balance_available_xof"] == bal_after_commission + 1500, \
            f"Expected commission reversed. Got {w2['balance_available_xof']} vs {bal_after_commission}+1500"
