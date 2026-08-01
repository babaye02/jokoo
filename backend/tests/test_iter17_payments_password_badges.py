"""Iteration 17 backend tests.

Covers:
- GET /api/payments/mine (auth + 401)
- POST /api/auth/change-password (wrong current -> 400, same -> 400, valid -> 200 + RESTORE)
- GET /api/chat/conversations returns `unread` field per conversation
- GET /api/notifications entries carry a `read` boolean
- Regression: bookings/rides/family/parcels core endpoints still healthy
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL") or os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://jokoo-mobile-dev.preview.emergentagent.com",
)
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

CLIENT_EMAIL = "client@jokoo.sn"
CLIENT_PWD = "Passw0rd!"
PRO_EMAIL = "pro@jokoo.sn"
PRO_PWD = "Passw0rd!"


def _login(session: requests.Session, email: str, password: str) -> str:
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"no token in response: {r.text}"
    return token


@pytest.fixture(scope="session")
def client_token() -> str:
    s = requests.Session()
    return _login(s, CLIENT_EMAIL, CLIENT_PWD)


@pytest.fixture(scope="session")
def pro_token() -> str:
    s = requests.Session()
    return _login(s, PRO_EMAIL, PRO_PWD)


@pytest.fixture()
def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- payments/mine ----------
class TestPaymentsMine:
    def test_payments_mine_requires_auth(self, session):
        r = session.get(f"{API}/payments/mine", timeout=20)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_payments_mine_returns_list(self, session, client_token):
        session.headers.update({"Authorization": f"Bearer {client_token}"})
        r = session.get(f"{API}/payments/mine", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list), f"expected list got {type(data)}"
        # Structure check for at least one item if present
        for p in data[:5]:
            assert "id" in p and "amount_xof" in p and "status" in p and "title" in p, p
            assert "_id" not in p


# ---------- change-password ----------
class TestChangePassword:
    def test_wrong_current_returns_400(self, session, client_token):
        session.headers.update({"Authorization": f"Bearer {client_token}"})
        r = session.post(
            f"{API}/auth/change-password",
            json={"current_password": "WRONG_PWD_zz", "new_password": "Temp1234!"},
            timeout=20,
        )
        assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text}"
        assert "actuel" in r.text.lower() or "incorrect" in r.text.lower()

    def test_same_password_returns_400(self, session, client_token):
        session.headers.update({"Authorization": f"Bearer {client_token}"})
        r = session.post(
            f"{API}/auth/change-password",
            json={"current_password": CLIENT_PWD, "new_password": CLIENT_PWD},
            timeout=20,
        )
        assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text}"

    def test_change_password_valid_and_restore(self, session, client_token):
        """CRITICAL: restores password to original before finishing."""
        temp_pwd = "Temp1234!"
        # Step 1: change to temp
        s1 = requests.Session()
        s1.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {client_token}"})
        r = s1.post(
            f"{API}/auth/change-password",
            json={"current_password": CLIENT_PWD, "new_password": temp_pwd},
            timeout=20,
        )
        assert r.status_code == 200, f"change to temp failed: {r.status_code} {r.text}"
        assert r.json().get("ok") is True

        # Step 2: verify login with new password
        s2 = requests.Session()
        rlogin = s2.post(f"{API}/auth/login", json={"email": CLIENT_EMAIL, "password": temp_pwd}, timeout=20)
        assert rlogin.status_code == 200, f"login with new pwd failed: {rlogin.text}"
        new_token = rlogin.json().get("access_token") or rlogin.json().get("token")
        assert new_token

        # Step 3: RESTORE original password
        s3 = requests.Session()
        s3.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {new_token}"})
        rrestore = s3.post(
            f"{API}/auth/change-password",
            json={"current_password": temp_pwd, "new_password": CLIENT_PWD},
            timeout=20,
        )
        assert rrestore.status_code == 200, f"RESTORE FAILED: {rrestore.status_code} {rrestore.text}"

        # Step 4: verify original still works (post-restore)
        s4 = requests.Session()
        rfinal = s4.post(f"{API}/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PWD}, timeout=20)
        assert rfinal.status_code == 200, f"original pwd broken after restore: {rfinal.text}"


# ---------- conversations unread & notifications read ----------
class TestUnreadBadges:
    def test_conversations_has_unread_field(self, session, client_token):
        session.headers.update({"Authorization": f"Bearer {client_token}"})
        r = session.get(f"{API}/chat/conversations", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        for c in data:
            assert "unread" in c, f"missing unread key: {c}"
            assert isinstance(c["unread"], int)

    def test_notifications_has_read_boolean(self, session, client_token):
        session.headers.update({"Authorization": f"Bearer {client_token}"})
        r = session.get(f"{API}/notifications", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        for n in data[:10]:
            assert "read" in n, f"notif missing 'read' key: {n}"
            assert isinstance(n["read"], bool)


# ---------- Regression on iter 15/16 endpoints ----------
class TestRegression:
    def test_rides_list(self, session):
        r = session.get(f"{API}/rides", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_family_babysitters_list(self, session):
        r = session.get(f"{API}/family/babysitters?limit=5", timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_bookings_mine(self, session, client_token):
        session.headers.update({"Authorization": f"Bearer {client_token}"})
        r = session.get(f"{API}/bookings", timeout=20)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_family_bookings_mine(self, session, client_token):
        session.headers.update({"Authorization": f"Bearer {client_token}"})
        r = session.get(f"{API}/family/bookings/mine", timeout=20)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)
