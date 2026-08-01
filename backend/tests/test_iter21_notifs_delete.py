"""Iter21 backend tests — review notif, family session notif enrichie, delete account E2E.

Guarantee: password 'Passw0rd!' is restored for client@jokoo.sn at the end (teardown).
NEVER delete the critical seeded accounts.
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
CLIENT_PWD = "Passw0rd!"
PROVIDER_EMAIL = "pro@jokoo.sn"
PROVIDER_PWD = "Passw0rd!"
SITTER_EMAIL = "aisha.family@jokoo.sn"
SITTER_PWD = "Family1234!"


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


@pytest.fixture(scope="module")
def sitter_token():
    return _login(SITTER_EMAIL, SITTER_PWD)


@pytest.fixture(scope="module", autouse=True)
def restore_client_password_teardown():
    yield
    try:
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PWD}, timeout=15)
        if r.status_code == 200:
            return
        fp = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": CLIENT_EMAIL}, timeout=15)
        tok = fp.json().get("dev_token")
        if tok:
            requests.post(f"{BASE_URL}/api/auth/reset-password", json={"token": tok, "new_password": CLIENT_PWD}, timeout=15)
    except Exception as e:
        print(f"[WARN teardown] {e}")


# =====================================================================
# 1. Notif review_received sent to provider after review is posted
# =====================================================================
class TestReviewNotifSentToProvider:
    _bid = None
    _pro_uid = None
    _review_id = None

    def test_setup_complete_booking(self, client_token, provider_token):
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(provider_token), timeout=15).json()
        pro_uid = me["id"]
        TestReviewNotifSentToProvider._pro_uid = pro_uid

        # ensure provider profile exists
        provs = requests.get(f"{BASE_URL}/api/providers?limit=100", timeout=15).json()
        if not any(p["id"] == pro_uid for p in provs):
            up = requests.post(
                f"{BASE_URL}/api/providers/me",
                headers=_auth(provider_token),
                json={"service": "plombier", "description": "TEST_iter21", "price_type": "quote", "city": "Dakar"},
                timeout=15,
            )
            assert up.status_code == 200, up.text

        # create booking
        payload = {
            "provider_id": pro_uid,
            "date": "2026-08-10",
            "time": "10:00",
            "address": "Dakar TEST_iter21",
            "description": "TEST_iter21 review notif",
        }
        r = requests.post(f"{BASE_URL}/api/bookings", headers=_auth(client_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        bid = r.json()["id"]
        TestReviewNotifSentToProvider._bid = bid

        # provider accepts
        r2 = requests.patch(f"{BASE_URL}/api/bookings/{bid}", headers=_auth(provider_token), json={"status": "accepted"}, timeout=15)
        assert r2.status_code == 200

        # both confirm completion
        c1 = requests.post(f"{BASE_URL}/api/bookings/{bid}/confirm-completion", headers=_auth(client_token), timeout=15)
        assert c1.status_code == 200
        c2 = requests.post(f"{BASE_URL}/api/bookings/{bid}/confirm-completion", headers=_auth(provider_token), timeout=15)
        assert c2.status_code == 200
        assert c2.json().get("status") == "completed"

    def test_post_review_creates_provider_notification(self, client_token, provider_token):
        bid = TestReviewNotifSentToProvider._bid
        assert bid

        # snapshot: how many review_received notifs currently exist
        n_before = requests.get(f"{BASE_URL}/api/notifications", headers=_auth(provider_token), timeout=15).json()
        cnt_before = sum(1 for n in n_before if n.get("type") == "review_received")

        # post the review
        r = requests.post(
            f"{BASE_URL}/api/reviews",
            headers=_auth(client_token),
            json={"booking_id": bid, "rating": 5, "comment": "TEST_iter21 Excellent"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        review = r.json()
        assert review["rating"] == 5
        TestReviewNotifSentToProvider._review_id = review["id"]

        # verify provider notification appeared
        time.sleep(0.3)  # small buffer
        n_after = requests.get(f"{BASE_URL}/api/notifications", headers=_auth(provider_token), timeout=15).json()
        review_notifs = [n for n in n_after if n.get("type") == "review_received"]
        assert len(review_notifs) == cnt_before + 1, f"expected {cnt_before + 1}, got {len(review_notifs)}"

        # inspect the newest
        review_notifs.sort(key=lambda n: n.get("created_at", ""), reverse=True)
        latest = review_notifs[0]
        assert latest.get("title") == "⭐ Nouvel avis 5/5", f"unexpected title: {latest.get('title')}"
        assert latest.get("booking_id") == bid
        assert latest.get("review_id") == review["id"]
        assert latest.get("user_id") == TestReviewNotifSentToProvider._pro_uid
        assert latest.get("read") is False


# =====================================================================
# 2. Notif babysitting_report includes family_booking_id + new body copy
# =====================================================================
class TestFamilySessionReportNotif:
    _fbid = None

    def test_setup_family_booking(self, client_token, sitter_token):
        # find aisha's babysitter profile
        babys = requests.get(f"{BASE_URL}/api/family/babysitters", timeout=15).json()
        sitter_me = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(sitter_token), timeout=15).json()
        aisha = next((b for b in babys if b["user_id"] == sitter_me["id"]), None)
        assert aisha, "aisha babysitter profile not found"

        payload = {
            "babysitter_id": aisha["id"],
            "service_type": "babysitting",
            "address": "TEST_iter21 addr",
            "city": "Dakar",
            "date": "2026-09-01",
            "time_start": "18:00",
            "time_end": "22:00",
            "kids": [{"name": "TEST_iter21_kid", "age": 5}],
            "emergency_contact": {"name": "Papa", "phone": "+221771111111"},
            "notes": "TEST_iter21",
        }
        r = requests.post(f"{BASE_URL}/api/family/bookings", headers=_auth(client_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        TestFamilySessionReportNotif._fbid = r.json()["id"]

    def test_report_submission_sends_enriched_notif_to_parent(self, client_token, sitter_token):
        fbid = TestFamilySessionReportNotif._fbid
        assert fbid

        # snapshot parent notifs
        before = requests.get(f"{BASE_URL}/api/notifications", headers=_auth(client_token), timeout=15).json()
        cnt_before = sum(1 for n in before if n.get("type") == "babysitting_report")

        # submit report as sitter
        r = requests.post(
            f"{BASE_URL}/api/family/bookings/{fbid}/report",
            headers=_auth(sitter_token),
            json={
                "activities": "TEST_iter21 activités test",
                "meals": "goûter",
                "mood": "happy",
                "notes": "RAS",
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("id")

        time.sleep(0.3)
        after = requests.get(f"{BASE_URL}/api/notifications", headers=_auth(client_token), timeout=15).json()
        report_notifs = [n for n in after if n.get("type") == "babysitting_report"]
        assert len(report_notifs) == cnt_before + 1

        report_notifs.sort(key=lambda n: n.get("created_at", ""), reverse=True)
        latest = report_notifs[0]
        assert latest.get("family_booking_id") == fbid, f"family_booking_id missing/wrong: {latest}"
        # body should contain the new copy
        assert "noter" in (latest.get("body") or "").lower(), f"body copy missing keyword: {latest.get('body')}"


# =====================================================================
# 3. Delete account E2E — create temp user, delete via API, re-login fails
# =====================================================================
class TestDeleteAccountE2E:
    _email = f"temp_delete_{int(time.time())}@example.com"
    _pwd = "Temp1234!"
    _token = None

    def test_register_temp_account(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "name": "TEST_iter21 Delete",
                "email": TestDeleteAccountE2E._email,
                "password": TestDeleteAccountE2E._pwd,
                "role": "client",
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("token")
        TestDeleteAccountE2E._token = j["token"]

    def test_delete_me(self):
        tok = TestDeleteAccountE2E._token
        assert tok
        r = requests.delete(f"{BASE_URL}/api/users/me", headers=_auth(tok), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_re_login_fails(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TestDeleteAccountE2E._email, "password": TestDeleteAccountE2E._pwd},
            timeout=15,
        )
        # deleted → 401 (invalid credentials) expected
        assert r.status_code in (401, 400, 404), f"expected auth failure, got {r.status_code} {r.text}"


# =====================================================================
# 4. Sanity regression — client login + POST /api/bookings still work
# =====================================================================
class TestRegressionSanity:
    def test_client_login_intact(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PWD}, timeout=15)
        assert r.status_code == 200, r.text

    def test_create_booking_still_works(self, client_token, provider_token):
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(provider_token), timeout=15).json()
        payload = {
            "provider_id": me["id"],
            "date": "2026-10-15",
            "time": "14:00",
            "address": "Dakar TEST_iter21_regression",
            "description": "TEST_iter21_regression",
        }
        r = requests.post(f"{BASE_URL}/api/bookings", headers=_auth(client_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("id")
