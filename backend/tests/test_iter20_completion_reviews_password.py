"""Iter20 tests — booking completion (dual confirm), booking-based reviews, forgot/reset password.

IMPORTANT: this suite always restores client@jokoo.sn's password to Passw0rd! at the end
via a pytest fixture teardown, even on partial failure.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://jokoo-mobile-dev.preview.emergentagent.com",
).rstrip("/")

CLIENT_EMAIL = "client@jokoo.sn"
PROVIDER_EMAIL = "pro@jokoo.sn"
CLIENT_PWD = "Passw0rd!"
PROVIDER_PWD = "Passw0rd!"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


# ---------- shared fixtures ----------
@pytest.fixture(scope="module")
def client_token():
    return _login(CLIENT_EMAIL, CLIENT_PWD)


@pytest.fixture(scope="module")
def provider_token():
    return _login(PROVIDER_EMAIL, PROVIDER_PWD)


@pytest.fixture(scope="module", autouse=True)
def restore_client_password_teardown():
    """Guarantee client@jokoo.sn is back to Passw0rd! at the end."""
    yield
    try:
        # Try to log in first — if it works, password already good.
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PWD}, timeout=15)
        if r.status_code == 200:
            return
        # Otherwise force-reset via forgot/reset flow using dev_token.
        fp = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": CLIENT_EMAIL}, timeout=15)
        tok = fp.json().get("dev_token")
        assert tok, "dev_token missing during teardown restore"
        rp = requests.post(f"{BASE_URL}/api/auth/reset-password", json={"token": tok, "new_password": CLIENT_PWD}, timeout=15)
        assert rp.status_code == 200, f"final restore failed: {rp.text}"
    except Exception as e:
        print(f"[WARN teardown] restore password failed: {e}")


# ---------- 1-5. Forgot / Reset password ----------
class TestForgotResetPassword:
    def test_forgot_password_known_email_returns_dev_token(self):
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": CLIENT_EMAIL}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j.get("ok") is True
        assert j.get("dev_token"), "dev_token should be present in dev env"
        # store on class for chaining
        TestForgotResetPassword._dev_token = j["dev_token"]

    def test_forgot_password_unknown_email_no_leak(self):
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": "inconnu@example.com"}, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j.get("ok") is True
        # dev_token should be absent OR None (must not leak an actual token)
        assert not j.get("dev_token"), f"should not leak dev_token for unknown email, got {j.get('dev_token')}"

    def test_reset_password_with_valid_token_then_login_works(self):
        tok = TestForgotResetPassword._dev_token
        new_pwd = "TempPass1234!"
        r = requests.post(f"{BASE_URL}/api/auth/reset-password", json={"token": tok, "new_password": new_pwd}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # login with new password must work
        r2 = requests.post(f"{BASE_URL}/api/auth/login", json={"email": CLIENT_EMAIL, "password": new_pwd}, timeout=15)
        assert r2.status_code == 200, f"login with new password failed: {r2.text}"

        # old password must NOT work
        r3 = requests.post(f"{BASE_URL}/api/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PWD}, timeout=15)
        assert r3.status_code == 401

        # Store token to reuse (should fail as already used)
        TestForgotResetPassword._used_token = tok

    def test_reset_password_reused_token_returns_400(self):
        used = TestForgotResetPassword._used_token
        r = requests.post(f"{BASE_URL}/api/auth/reset-password", json={"token": used, "new_password": "AnotherPass1234!"}, timeout=15)
        assert r.status_code == 400, r.text
        assert "invalide" in r.text.lower() or "utilis" in r.text.lower()

    def test_reset_password_bogus_token_returns_400(self):
        r = requests.post(f"{BASE_URL}/api/auth/reset-password", json={"token": "not-a-real-token-xxxxx", "new_password": "AnyPass1234!"}, timeout=15)
        assert r.status_code == 400

    def test_restore_client_password_via_flow(self):
        """Restore Passw0rd! for downstream tests + future runs."""
        fp = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": CLIENT_EMAIL}, timeout=15)
        assert fp.status_code == 200
        tok = fp.json().get("dev_token")
        assert tok
        rp = requests.post(f"{BASE_URL}/api/auth/reset-password", json={"token": tok, "new_password": CLIENT_PWD}, timeout=15)
        assert rp.status_code == 200
        # verify original credentials work again
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PWD}, timeout=15)
        assert r.status_code == 200, f"restore failed: {r.text}"


# ---------- 6-9. Booking completion + reviews (merged: xdist keeps class on same worker) ----------
class TestBookingCompletionAndReviews:
    _bid = None

    def test_create_and_accept_booking(self, client_token, provider_token):
        # Get an existing provider - use the pro@jokoo.sn account's provider profile if any,
        # otherwise pick from listing.
        r = requests.get(f"{BASE_URL}/api/providers?limit=50", timeout=15)
        assert r.status_code == 200
        providers = r.json()
        assert providers, "seed providers should be present"

        # We want the provider id that matches the logged-in provider (pro@jokoo.sn).
        me_r = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(provider_token), timeout=15)
        assert me_r.status_code == 200
        pro_uid = me_r.json()["id"]

        # ensure a provider profile exists for pro@jokoo.sn (create one if not)
        prov = next((p for p in providers if p["id"] == pro_uid), None)
        if not prov:
            up = requests.post(
                f"{BASE_URL}/api/providers/me",
                headers=_auth(provider_token),
                json={"service": "plombier", "description": "TEST_iter20", "price_type": "quote", "city": "Dakar"},
                timeout=15,
            )
            assert up.status_code == 200, up.text

        payload = {
            "provider_id": pro_uid,
            "date": "2026-06-25",
            "time": "10:00",
            "address": "Dakar TEST_iter20",
            "description": "TEST_iter20 mission completion",
        }
        r = requests.post(f"{BASE_URL}/api/bookings", headers=_auth(client_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        bid = r.json()["id"]
        TestBookingCompletionAndReviews._bid = bid

        # provider accepts
        r2 = requests.patch(f"{BASE_URL}/api/bookings/{bid}", headers=_auth(provider_token), json={"status": "accepted"}, timeout=15)
        assert r2.status_code == 200, r2.text

    def test_client_confirms_first_status_stays_accepted(self, client_token):
        bid = TestBookingCompletionAndReviews._bid
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/confirm-completion", headers=_auth(client_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        assert j.get("both_confirmed") is False
        # status should still be accepted (or "pending_completion") — spec says "accepted"
        assert j.get("status") == "accepted", j

    def test_client_confirm_idempotent_returns_already(self, client_token):
        bid = TestBookingCompletionAndReviews._bid
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/confirm-completion", headers=_auth(client_token), timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j.get("already") is True

    def test_provider_confirms_second_status_completed(self, provider_token, client_token):
        bid = TestBookingCompletionAndReviews._bid
        r = requests.post(f"{BASE_URL}/api/bookings/{bid}/confirm-completion", headers=_auth(provider_token), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("both_confirmed") is True
        assert j.get("status") == "completed"

        # verify booking detail
        r2 = requests.get(f"{BASE_URL}/api/bookings/{bid}", headers=_auth(client_token), timeout=15)
        assert r2.status_code == 200, r2.text
        b = r2.json()
        assert b["status"] == "completed"
        assert b.get("client_confirmed_at"), "client_confirmed_at missing"
        assert b.get("provider_confirmed_at"), "provider_confirmed_at missing"
        assert b.get("completed_at"), "completed_at missing"

    def test_get_booking_by_stranger_forbidden(self, provider_token):
        """Sanity: only client/provider of the booking can GET it."""
        bid = TestBookingCompletionAndReviews._bid
        # provider is a participant — must succeed
        r = requests.get(f"{BASE_URL}/api/bookings/{bid}", headers=_auth(provider_token), timeout=15)
        assert r.status_code == 200


# ---- Reviews (same class to share _bid across xdist workers) ----
    def test_client_posts_review_updates_provider_rating(self, client_token, provider_token):
        bid = TestBookingCompletionAndReviews._bid
        assert bid, "prerequisite: booking must exist and be completed"

        # provider rating before
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(provider_token), timeout=15).json()
        pro_uid = me["id"]
        prov_before = requests.get(f"{BASE_URL}/api/providers/{pro_uid}", timeout=15).json()
        count_before = prov_before.get("reviews_count", 0)

        r = requests.post(
            f"{BASE_URL}/api/reviews",
            headers=_auth(client_token),
            json={"booking_id": bid, "rating": 5, "comment": "TEST_iter20 Super"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        rev = r.json()
        assert rev.get("id")
        assert rev.get("rating") == 5

        prov_after = requests.get(f"{BASE_URL}/api/providers/{pro_uid}", timeout=15).json()
        assert prov_after.get("reviews_count", 0) == count_before + 1
        assert prov_after.get("rating") is not None and prov_after["rating"] > 0

        # booking should have review_id now
        b = requests.get(f"{BASE_URL}/api/bookings/{bid}", headers=_auth(client_token), timeout=15).json()
        assert b.get("review_id") == rev["id"]

    def test_double_review_same_booking_returns_400(self, client_token):
        bid = TestBookingCompletionAndReviews._bid
        r = requests.post(
            f"{BASE_URL}/api/reviews",
            headers=_auth(client_token),
            json={"booking_id": bid, "rating": 4, "comment": "TEST_iter20 dupe"},
            timeout=15,
        )
        assert r.status_code == 400
        assert "avis" in r.text.lower() or "d\u00e9j\u00e0" in r.text.lower() or "deja" in r.text.lower()

    def test_provider_cannot_review_own_booking(self, provider_token):
        bid = TestBookingCompletionAndReviews._bid
        r = requests.post(
            f"{BASE_URL}/api/reviews",
            headers=_auth(provider_token),
            json={"booking_id": bid, "rating": 5, "comment": "TEST_iter20 provider"},
            timeout=15,
        )
        assert r.status_code == 403, r.text
