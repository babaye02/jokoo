"""Iteration 35 — Sponsorisations Provider Payment System backend tests.

Covers:
- GET /api/sponsorships/prices (public)
- GET/PUT /api/admin/sponsorships/prices (admin only + validation)
- POST /api/sponsorships (prestataire creates pending doc)
- POST /api/sponsorships/{sid}/checkout (card/wave/orange)
- GET /api/sponsorships/mine, GET /api/admin/sponsorships
- PATCH /api/admin/sponsorships/{sid} (gift → activation + notification)
- Auto-expiration on GET /api/sponsorships/mine
"""
import os
import asyncio
import pytest
import requests
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = "https://868fd53e-1f85-41aa-80f4-13c6ad7575b7.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@jokoo.sn"
ADMIN_PASS = "Admin1234!"
PRO_EMAIL = "pro@jokoo.sn"
PRO_PASS = "Passw0rd!"

DEFAULT_PRICES = {7: 5000, 15: 10000, 30: 18000}


# ---------- helpers ----------
def _login(session: requests.Session, email: str, password: str) -> str:
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    tok = _login(s, ADMIN_EMAIL, ADMIN_PASS)
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def pro_client():
    s = requests.Session()
    tok = _login(s, PRO_EMAIL, PRO_PASS)
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def pro_user(pro_client):
    r = pro_client.get(f"{API}/auth/me", timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module", autouse=True)
def _reset_prices_after(admin_client):
    """Ensure prices are reset to defaults after this test module runs."""
    yield
    try:
        admin_client.put(
            f"{API}/admin/sponsorships/prices",
            json={"prices": {str(k): v for k, v in DEFAULT_PRICES.items()}},
            timeout=20,
        )
    except Exception:
        pass


# ---------- 1. Public prices ----------
class TestPublicPrices:
    def test_get_prices_default_shape(self):
        # First ensure defaults are set by admin (idempotent)
        r = requests.get(f"{API}/sponsorships/prices", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) >= 3
        by_days = {int(x["duration_days"]): int(x["amount_xof"]) for x in data}
        for d in (7, 15, 30):
            assert d in by_days, f"missing duration {d}"
            assert by_days[d] > 0

    def test_get_prices_no_auth_required(self):
        # Without any auth headers works
        r = requests.get(f"{API}/sponsorships/prices", timeout=20)
        assert r.status_code == 200


# ---------- 2 & 3. Admin prices ----------
class TestAdminPrices:
    def test_admin_get_prices(self, admin_client):
        r = admin_client.get(f"{API}/admin/sponsorships/prices", timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "prices" in j and "defaults" in j
        assert isinstance(j["prices"], dict)
        assert isinstance(j["defaults"], dict)
        # defaults should contain 7/15/30 keys (as int or str)
        default_keys = {str(k) for k in j["defaults"].keys()}
        assert {"7", "15", "30"}.issubset(default_keys)

    def test_admin_get_prices_forbidden_for_pro(self, pro_client):
        r = pro_client.get(f"{API}/admin/sponsorships/prices", timeout=20)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_admin_get_prices_forbidden_for_anon(self):
        r = requests.get(f"{API}/admin/sponsorships/prices", timeout=20)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_admin_update_prices_success_and_reflected(self, admin_client):
        new_prices = {"7": 6000, "15": 11000, "30": 20000}
        r = admin_client.put(
            f"{API}/admin/sponsorships/prices", json={"prices": new_prices}, timeout=20
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        # Public endpoint reflects new prices
        pub = requests.get(f"{API}/sponsorships/prices", timeout=20).json()
        by_days = {int(x["duration_days"]): int(x["amount_xof"]) for x in pub}
        assert by_days[7] == 6000
        assert by_days[15] == 11000
        assert by_days[30] == 20000

    def test_admin_update_prices_negative_amount_400(self, admin_client):
        r = admin_client.put(
            f"{API}/admin/sponsorships/prices",
            json={"prices": {"7": -100, "15": 11000, "30": 20000}},
            timeout=20,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"

    def test_admin_update_prices_invalid_days_400(self, admin_client):
        r = admin_client.put(
            f"{API}/admin/sponsorships/prices",
            json={"prices": {"99": 5000}},
            timeout=20,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"

    def test_admin_update_prices_non_admin_403(self, pro_client):
        r = pro_client.put(
            f"{API}/admin/sponsorships/prices",
            json={"prices": {"7": 5000}},
            timeout=20,
        )
        assert r.status_code == 403, r.text

    def test_admin_update_prices_empty_body_400(self, admin_client):
        r = admin_client.put(
            f"{API}/admin/sponsorships/prices", json={}, timeout=20
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"

    def test_admin_reset_prices_to_defaults(self, admin_client):
        r = admin_client.put(
            f"{API}/admin/sponsorships/prices",
            json={"prices": {str(k): v for k, v in DEFAULT_PRICES.items()}},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        pub = requests.get(f"{API}/sponsorships/prices", timeout=20).json()
        by_days = {int(x["duration_days"]): int(x["amount_xof"]) for x in pub}
        assert by_days == DEFAULT_PRICES


# ---------- 4-9. Sponsorship lifecycle ----------
class TestSponsorshipLifecycle:
    """Preserves state between tests via class attributes."""

    sponsorship_id: str = ""

    def test_create_sponsorship_pending(self, pro_client):
        r = pro_client.post(f"{API}/sponsorships", json={"duration_days": 7}, timeout=20)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "pending_payment"
        assert doc["duration_days"] == 7
        # amount should match current default (5000)
        assert doc["amount_xof"] == DEFAULT_PRICES[7]
        assert doc["paid"] is False
        assert "id" in doc
        TestSponsorshipLifecycle.sponsorship_id = doc["id"]

    def test_checkout_card_stripe_session(self, pro_client):
        sid = TestSponsorshipLifecycle.sponsorship_id
        assert sid, "no sponsorship id from previous test"
        r = pro_client.post(
            f"{API}/sponsorships/{sid}/checkout",
            json={"provider": "card"},
            timeout=30,
        )
        # Should be 200 with url + session_id, or 500 if Stripe key misconfigured
        if r.status_code != 200:
            pytest.fail(f"Stripe checkout failed: {r.status_code} {r.text}")
        j = r.json()
        assert "url" in j and j["url"].startswith("http")
        assert "session_id" in j and j["session_id"]

    def test_checkout_other_user_returns_404(self, admin_client):
        sid = TestSponsorshipLifecycle.sponsorship_id
        r = admin_client.post(
            f"{API}/sponsorships/{sid}/checkout",
            json={"provider": "card"},
            timeout=20,
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"

    def test_checkout_wave_expected_503_or_ok(self, pro_client):
        # Need a new pending doc (previous may still be pending since Stripe was not paid)
        sid = TestSponsorshipLifecycle.sponsorship_id
        r = pro_client.post(
            f"{API}/sponsorships/{sid}/checkout",
            json={"provider": "wave"},
            timeout=30,
        )
        # Wave unconfigured → 503 accepted; if configured → 200
        assert r.status_code in (200, 500, 503), f"unexpected {r.status_code} {r.text}"
        if r.status_code == 200:
            assert "url" in r.json()

    def test_checkout_orange_expected_503_or_ok(self, pro_client):
        sid = TestSponsorshipLifecycle.sponsorship_id
        r = pro_client.post(
            f"{API}/sponsorships/{sid}/checkout",
            json={"provider": "orange"},
            timeout=30,
        )
        assert r.status_code in (200, 500, 503), f"unexpected {r.status_code} {r.text}"

    def test_get_mine_includes_new_doc(self, pro_client):
        r = pro_client.get(f"{API}/sponsorships/mine", timeout=20)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        ids = {row["id"] for row in rows}
        assert TestSponsorshipLifecycle.sponsorship_id in ids

    def test_admin_list_full_history(self, admin_client):
        r = admin_client.get(f"{API}/admin/sponsorships", timeout=20)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        ids = {row["id"] for row in rows}
        assert TestSponsorshipLifecycle.sponsorship_id in ids

    def test_admin_list_forbidden_for_pro(self, pro_client):
        r = pro_client.get(f"{API}/admin/sponsorships", timeout=20)
        assert r.status_code == 403, r.text


# ---------- 10. Gift activation ----------
class TestGiftActivation:
    def test_gift_activates_and_notifies(self, pro_client, admin_client, pro_user):
        # Create fresh pending sponsorship (15 days for variety)
        r = pro_client.post(f"{API}/sponsorships", json={"duration_days": 15}, timeout=20)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]

        # Count notifications before
        before = pro_client.get(f"{API}/notifications", timeout=20)
        pre_count = len(before.json()) if before.status_code == 200 else 0

        # Admin gifts
        g = admin_client.patch(
            f"{API}/admin/sponsorships/{sid}", json={"status": "gift"}, timeout=20
        )
        assert g.status_code == 200, g.text
        assert g.json().get("ok") is True

        # Verify sponsorship active
        mine = pro_client.get(f"{API}/sponsorships/mine", timeout=20).json()
        row = next((x for x in mine if x["id"] == sid), None)
        assert row is not None, "gifted sponsorship not found in /mine"
        assert row["status"] == "active", f"expected active, got {row['status']}"
        assert row.get("paid") is True
        assert row.get("starts_at") and row.get("ends_at")
        assert row.get("payment_provider") == "admin_gift"

        # Provider has sponsored_until — check via listing all providers
        prov_list = requests.get(f"{API}/providers", timeout=20)
        if prov_list.status_code == 200:
            provs = prov_list.json()
            mine_p = next(
                (p for p in provs if p.get("id") == pro_user["id"]
                 or p.get("owner_id") == pro_user["id"]
                 or p.get("user_id") == pro_user["id"]),
                None,
            )
            # Not fatal if provider row not found via public list — main check is on sponsorship
            if mine_p:
                assert mine_p.get("sponsored_until"), "sponsored_until missing on provider"

        # Notification created for provider
        after = pro_client.get(f"{API}/notifications", timeout=20)
        if after.status_code == 200:
            notifs = after.json()
            assert len(notifs) >= pre_count + 1, "no new notification after gift"
            gift_notif = next(
                (n for n in notifs if n.get("type") in ("sponsorship_gifted", "sponsorship_active")),
                None,
            )
            assert gift_notif is not None, "sponsorship notification missing"


# ---------- 11. Auto-expiration ----------
class TestAutoExpiration:
    def test_stale_active_becomes_expired_on_list(self, pro_client, admin_client, pro_user):
        # Create and gift a sponsorship so it is active
        r = pro_client.post(f"{API}/sponsorships", json={"duration_days": 7}, timeout=20)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        g = admin_client.patch(
            f"{API}/admin/sponsorships/{sid}", json={"status": "gift"}, timeout=20
        )
        assert g.status_code == 200, g.text

        # Force ends_at into the past via DB
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "jokoo_db")

        async def _tamper():
            client = AsyncIOMotorClient(mongo_url)
            try:
                db = client[db_name]
                past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
                res = await db.sponsorships.update_one(
                    {"id": sid}, {"$set": {"ends_at": past}}
                )
                assert res.modified_count == 1
            finally:
                client.close()

        asyncio.get_event_loop().run_until_complete(_tamper())

        # GET /mine should trigger _expire_stale_sponsorships
        mine = pro_client.get(f"{API}/sponsorships/mine", timeout=20).json()
        row = next((x for x in mine if x["id"] == sid), None)
        assert row is not None
        assert row["status"] == "expired", f"expected expired, got {row['status']}"

        # Provider should lose sponsored_until — check via /auth/me or providers list
        prov_list = requests.get(f"{API}/providers", timeout=20)
        if prov_list.status_code == 200:
            provs = prov_list.json()
            mine_p = next(
                (p for p in provs if p.get("id") == pro_user["id"]
                 or p.get("owner_id") == pro_user["id"]
                 or p.get("user_id") == pro_user["id"]),
                None,
            )
            if mine_p is not None:
                assert not mine_p.get("sponsored_until"), \
                    f"sponsored_until should be cleared, got {mine_p.get('sponsored_until')}"
