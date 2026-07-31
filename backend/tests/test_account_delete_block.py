"""Backend tests for Apple App Store audit fixes:
- DELETE /api/users/me (account deletion)
- POST/DELETE /api/users/{peer_id}/block (block/unblock)
- GET /api/users/me/blocked (blocked list)
- POST /api/reports (report user)
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://jokoo-mobile-dev.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@jokoo.sn"
ADMIN_PASSWORD = "Admin1234!"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_me(admin_headers):
    r = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def temp_user():
    """Create a disposable user for the DELETE /users/me test."""
    ts = int(time.time())
    email = f"delete-test-{ts}-{uuid.uuid4().hex[:6]}@test.com"
    password = "Passw0rd!"
    payload = {"name": "Test Delete", "email": email, "password": password, "role": "client"}
    r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    # If registration doesn't return token, login
    if not tok:
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
        assert r2.status_code == 200, r2.text
        tok = r2.json().get("token") or r2.json().get("access_token")
    assert tok
    return {"email": email, "password": password, "token": tok}


# ---------- Block / Unblock tests ----------
class TestBlockUser:
    """/api/users/{peer_id}/block POST/DELETE + /api/users/me/blocked GET"""

    # A stable seeded provider user id (Aminata Sy is a provider id, we need her user_id)
    # Use a random seeded user via /providers first
    @pytest.fixture(scope="class")
    def peer_id(self, admin_headers, admin_me):
        # Get any other user id (a provider row's user_id or a client)
        r = requests.get(f"{API}/providers", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        provs = r.json()
        for p in provs:
            uid = p.get("user_id") or p.get("id")
            if uid and uid != admin_me["id"]:
                return uid
        pytest.skip("No suitable peer user found")

    def test_block_self_returns_400(self, admin_headers, admin_me):
        r = requests.post(f"{API}/users/{admin_me['id']}/block", headers=admin_headers, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
        assert "soi-m" in r.text.lower() or "self" in r.text.lower() or "impossible" in r.text.lower()

    def test_block_peer(self, admin_headers, peer_id):
        r = requests.post(f"{API}/users/{peer_id}/block", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_blocked_list_contains_peer(self, admin_headers, peer_id):
        r = requests.get(f"{API}/users/me/blocked", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        assert any(it.get("blocked_id") == peer_id for it in items), f"peer {peer_id} not in blocked list: {items}"
        # Ensure MongoDB _id not leaked
        for it in items:
            assert "_id" not in it

    def test_unblock_peer(self, admin_headers, peer_id):
        r = requests.delete(f"{API}/users/{peer_id}/block", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        # Verify removed
        r2 = requests.get(f"{API}/users/me/blocked", headers=admin_headers, timeout=15)
        items = r2.json()
        assert not any(it.get("blocked_id") == peer_id for it in items)


# ---------- Report tests ----------
class TestReports:
    def test_create_report_user(self, admin_headers):
        target_id = str(uuid.uuid4())
        payload = {"target_id": target_id, "target_type": "user", "reason": "TEST_test-report"}
        r = requests.post(f"{API}/reports", headers=admin_headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("target_id") == target_id
        assert data.get("target_type") == "user"
        assert data.get("reason") == "TEST_test-report"
        assert data.get("status") == "open"
        assert "id" in data
        assert "_id" not in data


# ---------- Account deletion ----------
class TestDeleteAccount:
    def test_delete_me_then_relogin_fails(self, temp_user):
        headers = {"Authorization": f"Bearer {temp_user['token']}", "Content-Type": "application/json"}
        # Confirm we can hit auth/me first
        r0 = requests.get(f"{API}/auth/me", headers=headers, timeout=15)
        assert r0.status_code == 200, r0.text

        # DELETE
        r = requests.delete(f"{API}/users/me", headers=headers, timeout=30)
        assert r.status_code == 200, f"delete failed: {r.status_code} {r.text}"
        assert r.json().get("ok") is True

        # Re-login should fail
        r2 = requests.post(f"{API}/auth/login", json={"email": temp_user["email"], "password": temp_user["password"]}, timeout=15)
        assert r2.status_code in (401, 400, 404), f"expected auth failure after delete, got {r2.status_code} {r2.text}"

    def test_admin_still_exists(self, admin_headers):
        """Ensure DELETE /users/me for temp user did not touch admin."""
        r = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("email") == ADMIN_EMAIL
