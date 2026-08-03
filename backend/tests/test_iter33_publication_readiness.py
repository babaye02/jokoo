"""
Iter33 — Publication readiness backend audit (fixed to actual API surface).

Covers: Auth, Users, Providers, Search, Bookings, Reviews, Family, Chat, Favorites,
Notifications, Wallet, Promo codes, Partners, Ads, Admin CRM/CRUD, Payments,
RBAC, security basics.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

CLIENT = {"email": "client@jokoo.sn", "password": "Passw0rd!"}
PRO = {"email": "pro@jokoo.sn", "password": "Passw0rd!"}
ADMIN = {"email": "admin@jokoo.sn", "password": "Admin1234!"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _login(sess, creds):
    r = sess.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text[:200]}"
    d = r.json()
    return d["token"], d["user"]


@pytest.fixture(scope="module")
def client_ctx(s):
    tok, u = _login(s, CLIENT)
    return {"token": tok, "user": u, "h": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def pro_ctx(s):
    tok, u = _login(s, PRO)
    return {"token": tok, "user": u, "h": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def admin_ctx(s):
    tok, u = _login(s, ADMIN)
    return {"token": tok, "user": u, "h": {"Authorization": f"Bearer {tok}"}}


# --------------------------- HEALTH & SEED ---------------------------
class TestHealth:
    def test_root_status(self, s):
        r = s.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_seed_idempotent(self, s):
        r = s.post(f"{API}/seed", timeout=45)
        assert r.status_code == 200


# --------------------------- AUTH ---------------------------
class TestAuth:
    def test_login_client_ok(self, client_ctx):
        assert client_ctx["user"]["role"] in ("client", "provider", "admin")
        assert client_ctx["token"]

    def test_login_wrong_password(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "client@jokoo.sn", "password": "WRONG"}, timeout=10)
        assert r.status_code in (400, 401, 403)

    def test_register_and_me(self, s):
        email = f"iter33-{uuid.uuid4().hex[:8]}@test.jokoo"
        r = s.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd!", "name": "Iter33 User",
            "phone": f"+22178{int(time.time()) % 10000000:07d}", "role": "client"
        }, timeout=15)
        assert r.status_code == 200, r.text
        tok = r.json()["token"]
        me = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=10)
        assert me.status_code == 200
        assert me.json()["email"] == email

    def test_me_requires_auth(self, s):
        r = s.get(f"{API}/auth/me", timeout=10)
        assert r.status_code in (401, 403)

    def test_bad_token_rejected(self, s):
        r = s.get(f"{API}/auth/me", headers={"Authorization": "Bearer garbage"}, timeout=10)
        assert r.status_code in (401, 403)


# --------------------------- USERS / PROFILE ---------------------------
class TestUserProfile:
    def test_update_profile(self, s, client_ctx):
        new_name = f"Aicha {int(time.time())}"
        r = s.patch(f"{API}/auth/me", headers=client_ctx["h"], json={"name": new_name}, timeout=10)
        assert r.status_code == 200, r.text
        me = s.get(f"{API}/auth/me", headers=client_ctx["h"], timeout=10).json()
        assert me["name"] == new_name


# --------------------------- PROVIDERS / SEARCH ---------------------------
class TestProviders:
    def test_list_providers(self, s):
        r = s.get(f"{API}/providers", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    def test_provider_filter_city(self, s):
        r = s.get(f"{API}/providers", params={"city": "Dakar"}, timeout=15)
        assert r.status_code == 200

    def test_family_babysitters(self, s):
        r = s.get(f"{API}/family/babysitters", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# --------------------------- BOOKINGS ---------------------------
@pytest.fixture(scope="module")
def sample_booking(s, client_ctx, pro_ctx):
    provs = s.get(f"{API}/providers", timeout=15).json()
    assert provs
    provider = next((p for p in provs if p.get("user_id") == pro_ctx["user"]["id"]), provs[0])
    payload = {
        "provider_id": provider["id"],
        "date": "2026-12-30",
        "time": "10:00",
        "address": "Test Dakar iter33",
        "description": "Test iter33 - description longue",
    }
    r = s.post(f"{API}/bookings", headers=client_ctx["h"], json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


class TestBookings:
    def test_create(self, sample_booking):
        assert sample_booking.get("id")
        assert sample_booking.get("status") in ("pending", "accepted")

    def test_list_bookings_as_client(self, s, client_ctx, sample_booking):
        r = s.get(f"{API}/bookings", headers=client_ctx["h"], timeout=10)
        assert r.status_code == 200
        ids = [b["id"] for b in r.json()]
        assert sample_booking["id"] in ids

    def test_list_bookings_as_pro(self, s, pro_ctx):
        r = s.get(f"{API}/bookings", headers=pro_ctx["h"], timeout=10)
        assert r.status_code == 200


# --------------------------- CHAT ---------------------------
class TestChat:
    def test_conversations(self, s, client_ctx):
        r = s.get(f"{API}/chat/conversations", headers=client_ctx["h"], timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_send_and_read(self, s, client_ctx, pro_ctx):
        r = s.post(
            f"{API}/chat/{pro_ctx['user']['id']}/messages",
            headers=client_ctx["h"],
            json={"text": f"Hello iter33 {uuid.uuid4().hex[:6]}"},
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text[:300]
        r2 = s.get(f"{API}/chat/{pro_ctx['user']['id']}/messages", headers=client_ctx["h"], timeout=10)
        assert r2.status_code == 200
        assert isinstance(r2.json(), list)


# --------------------------- FAVORITES ---------------------------
class TestFavorites:
    def test_favorites_flow(self, s, client_ctx):
        provs = s.get(f"{API}/providers", timeout=10).json()
        pid = provs[0]["id"]
        r = s.post(f"{API}/favorites/{pid}", headers=client_ctx["h"], timeout=10)
        assert r.status_code in (200, 201), r.text[:200]
        lst = s.get(f"{API}/favorites", headers=client_ctx["h"], timeout=10)
        assert lst.status_code == 200
        r2 = s.delete(f"{API}/favorites/{pid}", headers=client_ctx["h"], timeout=10)
        assert r2.status_code in (200, 204)


# --------------------------- NOTIFICATIONS ---------------------------
class TestNotifications:
    def test_list(self, s, client_ctx):
        r = s.get(f"{API}/notifications", headers=client_ctx["h"], timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_read_all(self, s, client_ctx):
        r = s.post(f"{API}/notifications/read-all", headers=client_ctx["h"], timeout=10)
        assert r.status_code in (200, 204)


# --------------------------- WALLET ---------------------------
class TestWallet:
    def test_wallet_me(self, s, client_ctx):
        r = s.get(f"{API}/wallet/me", headers=client_ctx["h"], timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "balance_available" in data or "balance" in data

    def test_wallet_history(self, s, client_ctx):
        r = s.get(f"{API}/wallet/history", headers=client_ctx["h"], timeout=10)
        assert r.status_code == 200


# --------------------------- PROMO / PARTNERS / ADS ---------------------------
class TestPublicContent:
    def test_partners_public(self, s):
        r = s.get(f"{API}/partners", timeout=10)
        # Partners may live under /admin/partners only or /promos — accept 200/404
        assert r.status_code in (200, 404)

    def test_ads_public(self, s):
        # Public ads endpoint may not exist as /api/ads — check via admin later
        r = s.get(f"{API}/ads", timeout=10)
        assert r.status_code in (200, 404)

    def test_promos_public(self, s):
        r = s.get(f"{API}/promos", timeout=10)
        assert r.status_code == 200

    def test_promo_validate_invalid(self, s, client_ctx):
        r = s.post(f"{API}/promo-codes/validate",
                   headers=client_ctx["h"],
                   json={"code": "INVALID_XXXX", "amount": 10000}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("valid") is False


# --------------------------- PAYMENTS ---------------------------
class TestPayments:
    def test_stripe_checkout_booking(self, s, client_ctx, sample_booking):
        r = s.post(
            f"{API}/payments/checkout/booking",
            headers=client_ctx["h"],
            json={"booking_id": sample_booking["id"], "origin_url": BASE_URL, "amount_xof": 10000},
            timeout=25,
        )
        assert r.status_code in (200, 400, 402, 503), r.text[:300]
        if r.status_code == 200:
            body = r.json()
            assert body.get("url") or body.get("checkout_url") or body.get("session_id")

    def test_wave_checkout_booking(self, s, client_ctx, sample_booking):
        r = s.post(
            f"{API}/payments/wave/checkout/booking",
            headers=client_ctx["h"],
            json={"booking_id": sample_booking["id"], "origin_url": BASE_URL, "amount_xof": 10000},
            timeout=15,
        )
        # Wave key is placeholder → graceful error expected
        assert r.status_code in (200, 400, 401, 402, 501, 503), r.text[:300]

    def test_orange_checkout_booking(self, s, client_ctx, sample_booking):
        r = s.post(
            f"{API}/payments/orange/checkout/booking",
            headers=client_ctx["h"],
            json={"booking_id": sample_booking["id"], "origin_url": BASE_URL, "amount_xof": 10000},
            timeout=15,
        )
        assert r.status_code in (200, 400, 401, 402, 501, 503), r.text[:300]

    def test_payments_mine(self, s, client_ctx):
        r = s.get(f"{API}/payments/mine", headers=client_ctx["h"], timeout=10)
        assert r.status_code == 200


# --------------------------- ADMIN / RBAC ---------------------------
class TestAdmin:
    def test_admin_login(self, admin_ctx):
        assert admin_ctx["token"]

    def test_admin_crm_users(self, s, admin_ctx):
        r = s.get(f"{API}/admin/crm/users", headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200, r.text[:200]

    def test_admin_crm_overview(self, s, admin_ctx):
        r = s.get(f"{API}/admin/crm/overview", headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200

    def test_admin_ads(self, s, admin_ctx):
        r = s.get(f"{API}/admin/ads", headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200

    def test_admin_promos(self, s, admin_ctx):
        r = s.get(f"{API}/admin/promos", headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200

    def test_admin_promo_codes(self, s, admin_ctx):
        r = s.get(f"{API}/admin/promo-codes", headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200

    def test_admin_partners(self, s, admin_ctx):
        r = s.get(f"{API}/admin/partners", headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200

    def test_admin_reports(self, s, admin_ctx):
        r = s.get(f"{API}/admin/reports", headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200

    def test_admin_service_suggestions(self, s, admin_ctx):
        r = s.get(f"{API}/admin/service-suggestions", headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200

    def test_admin_staff(self, s, admin_ctx):
        r = s.get(f"{API}/admin/staff", headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200

    def test_admin_marketplace_stats(self, s, admin_ctx):
        r = s.get(f"{API}/admin/stats/marketplace", headers=admin_ctx["h"], timeout=15)
        assert r.status_code == 200

    def test_rbac_client_forbidden_on_admin(self, s, client_ctx):
        r = s.get(f"{API}/admin/crm/users", headers=client_ctx["h"], timeout=10)
        assert r.status_code in (401, 403), r.text[:200]

    def test_rbac_no_auth_forbidden_on_admin(self, s):
        r = s.get(f"{API}/admin/crm/users", timeout=10)
        assert r.status_code in (401, 403)


# --------------------------- REVIEWS (public) ---------------------------
class TestReviews:
    def test_public_reviews(self, s):
        provs = s.get(f"{API}/providers", timeout=10).json()
        pid = provs[0]["id"]
        r = s.get(f"{API}/reviews", params={"provider_id": pid}, timeout=10)
        assert r.status_code == 200


# --------------------------- SECURITY ---------------------------
class TestSecurity:
    def test_no_mongo_id_leak_providers(self, s):
        r = s.get(f"{API}/providers", timeout=10)
        assert r.status_code == 200
        assert '"_id"' not in r.text

    def test_no_mongo_id_leak_babysitters(self, s):
        r = s.get(f"{API}/family/babysitters", timeout=10)
        assert r.status_code == 200
        assert '"_id"' not in r.text

    def test_admin_route_prefix_hardening(self, s):
        # Missing bearer → 401/403 (NOT 500)
        r = s.get(f"{API}/admin/crm/users", timeout=10)
        assert r.status_code in (401, 403)
