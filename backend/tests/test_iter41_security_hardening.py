"""
Iteration 41 — Security hardening validation.

Covers:
  1. Basic auth (register/login/me) with tv claim in JWT
  2. Brute force lockout (5 attempts → 429)
  3. Password reset flow + old session revocation (tv increment)
  4. Admin reset password + old session revocation
  5. Rate limiter sanity
  6. datetime timezone-aware brute force check (legacy naive doc)
  7. CORS
  8. Admin endpoint auth guards

Run: pytest /app/backend/tests/test_iter41_security_hardening.py -v
"""
import os
import time
import uuid
import base64
import json
from datetime import datetime, timedelta

import jwt
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = "http://localhost:8001"

# --- Force serial execution so brute-force IP-based lockout tests don't interfere ---
# Also purge rate_limit collection before running.
def _purge_brute_force():
    import asyncio
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not (mongo_url and db_name):
        return

    async def _do():
        cli = AsyncIOMotorClient(mongo_url)
        # remove any IP-based lockout that could leak across tests
        await cli[db_name].rate_limit.delete_many({"_id": {"$regex": "^login:ip:"}})
        cli.close()
    try:
        asyncio.run(_do())
    except Exception:
        pass


@pytest.fixture(autouse=True)
def _clean_ip_lock_between_tests():
    """Purge IP-scoped brute-force counter before each test."""
    _purge_brute_force()
    yield
    _purge_brute_force()


async def _fetch_reset_token_from_db(user_email: str) -> str | None:
    """Fallback for envs where RESEND is configured and dev_token isn't returned."""
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not (mongo_url and db_name):
        return None
    cli = AsyncIOMotorClient(mongo_url)
    doc = await cli[db_name].password_resets.find_one(
        {"email": user_email.lower(), "used": False},
        sort=[("created_at", -1)],
    )
    cli.close()
    return doc["token"] if doc else None


def _get_reset_token(email: str) -> str:
    """Trigger forgot-password and return the token (from dev_token or Mongo)."""
    r = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": email})
    assert r.status_code == 200, f"forgot-password: {r.status_code} {r.text}"
    data = r.json()
    if data.get("dev_token"):
        return data["dev_token"]
    # Fallback: query Mongo
    import asyncio
    return asyncio.run(_fetch_reset_token_from_db(email))

# Test creds from /app/memory/test_credentials.md
ADMIN_EMAIL = "admin@jokoo.sn"
ADMIN_PASSWORD = "Admin1234!"
CLIENT_EMAIL = "client@jokoo.sn"
CLIENT_PASSWORD = "Passw0rd!"


# ------------ helpers ------------

def _decode_jwt_payload(token: str) -> dict:
    """Decode JWT payload WITHOUT signature verification (only for reading claims in tests)."""
    parts = token.split(".")
    assert len(parts) == 3, f"malformed JWT: {token[:40]}"
    padded = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
    raw = base64.urlsafe_b64decode(padded.encode("ascii"))
    return json.loads(raw)


def _login(email: str, password: str, session: requests.Session | None = None):
    s = session or requests
    return s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})


def _me(token: str, session: requests.Session | None = None):
    s = session or requests
    return s.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})


# ------------ fixtures ------------

@pytest.fixture
def admin_token():
    r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture
def client_token():
    # In case previous test triggered brute-force lockout, wait briefly then attempt
    r = _login(CLIENT_EMAIL, CLIENT_PASSWORD)
    if r.status_code == 429:
        pytest.skip("Client account temporarily locked by brute-force test; run test in isolation.")
    assert r.status_code == 200, f"client login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture
def fresh_user():
    """Register a fresh user and return {email, password, token, user_id}."""
    email = f"TEST_iter41_{uuid.uuid4().hex[:8]}@example.com"
    password = "InitPass123!"
    payload = {
        "email": email,
        "password": password,
        "name": "Iter41 Test User",
        "role": "client",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"no token in register response: {data}"
    user = data.get("user") or {}
    user_id = user.get("id") or data.get("user_id")
    yield {"email": email, "password": password, "token": token, "user_id": user_id}
    # cleanup: best-effort delete
    try:
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        if mongo_url and db_name and user_id:
            async def _cleanup():
                cli = AsyncIOMotorClient(mongo_url)
                await cli[db_name].users.delete_one({"id": user_id})
                await cli[db_name].password_resets.delete_many({"user_id": user_id})
                await cli[db_name].rate_limit.delete_many({"_id": {"$regex": email.lower()}})
                cli.close()
            asyncio.run(_cleanup())
    except Exception:
        pass


# ============ 1. BASIC AUTH ============

class TestBasicAuth:
    def test_register_returns_token_with_tv_zero(self, fresh_user):
        payload = _decode_jwt_payload(fresh_user["token"])
        assert "sub" in payload
        assert "exp" in payload
        assert payload.get("tv") == 0, f"new user should have tv=0, got {payload.get('tv')}"

    def test_login_success_returns_token_with_tv_claim(self, client_token):
        payload = _decode_jwt_payload(client_token)
        assert "tv" in payload, "tv claim missing from login token"
        assert isinstance(payload["tv"], int)
        assert payload["tv"] >= 0

    def test_login_wrong_password_returns_401(self):
        # Use a fresh identifier to not pollute brute-force counters for known users
        email = f"TEST_iter41_wrong_{uuid.uuid4().hex[:6]}@example.com"
        # register first so account exists
        requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "GoodPass1!", "name": "wrong-pwd", "role": "client",
        })
        r = _login(email, "WrongPass1!")
        assert r.status_code == 401

    def test_me_with_valid_token_returns_200(self, client_token):
        r = _me(client_token)
        assert r.status_code == 200
        data = r.json()
        assert data.get("email") == CLIENT_EMAIL

    def test_me_without_token_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_corrupted_token_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer notavalidjwt.at.all"})
        assert r.status_code == 401

    def test_me_with_malformed_bearer_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "not-a-bearer"})
        assert r.status_code == 401


# ============ 2. BRUTE FORCE LOCKOUT ============

class TestBruteForce:
    def test_five_failed_logins_lockout_429(self):
        # Use a unique freshly-registered account to isolate brute-force state
        email = f"TEST_iter41_bf_{uuid.uuid4().hex[:8]}@example.com"
        password = "InitPass1!"
        r0 = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": password, "name": "bf-test", "role": "client",
        })
        assert r0.status_code in (200, 201), f"register: {r0.status_code} {r0.text}"

        # Trigger 5 failures. Since BRUTE_MAX_ATTEMPTS=5, the LOCK is set at 5th failure,
        # so the 6th attempt should be blocked. Verify it becomes 429.
        statuses = []
        for i in range(6):
            r = _login(email, "BadPassword!!" + str(i))
            statuses.append(r.status_code)
        # Expect at least the 6th (index 5) to be 429
        assert 429 in statuses, f"expected a 429 lockout, got sequence: {statuses}"
        # Cleanup: unlock so subsequent tests don't inherit
        try:
            import asyncio
            mongo_url = os.environ.get("MONGO_URL")
            db_name = os.environ.get("DB_NAME")

            async def _clean():
                cli = AsyncIOMotorClient(mongo_url)
                await cli[db_name].users.delete_one({"email": email})
                await cli[db_name].rate_limit.delete_many({"_id": {"$regex": email}})
                cli.close()

            asyncio.run(_clean())
        except Exception:
            pass


# ============ 3. PASSWORD RESET + SESSION REVOCATION ============

class TestPasswordReset:
    def test_forgot_returns_dev_token(self, fresh_user):
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": fresh_user["email"]})
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        assert data.get("ok") is True
        # dev_token only returned when no email provider configured. In this env
        # RESEND is configured, so we verify the reset record exists in DB instead.
        if not data.get("dev_token"):
            import asyncio
            tok = asyncio.run(_fetch_reset_token_from_db(fresh_user["email"]))
            assert tok, "no dev_token AND no reset record found in DB"

    def test_reset_password_success_and_old_token_revoked(self, fresh_user):
        old_token = fresh_user["token"]
        # 1. Verify old token works before reset
        r0 = _me(old_token)
        assert r0.status_code == 200

        # 2. Request password reset
        dev_token = _get_reset_token(fresh_user["email"])
        assert dev_token, "reset token not found"

        # 3. Reset the password
        new_password = "NewSecret456!"
        r2 = requests.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"token": dev_token, "new_password": new_password},
        )
        assert r2.status_code == 200, f"{r2.status_code} {r2.text}"

        # 4. CRUCIAL: old token must now be 401 with "Session révoquée" message
        r3 = _me(old_token)
        assert r3.status_code == 401, f"expected 401 after reset, got {r3.status_code}"
        detail = r3.json().get("detail", "")
        assert "révoqu" in detail.lower() or "revok" in detail.lower(), (
            f"expected 'Session révoquée' in detail, got: {detail!r}"
        )

        # 5. Login with new password: token should have tv=1
        r4 = _login(fresh_user["email"], new_password)
        assert r4.status_code == 200, f"{r4.status_code} {r4.text}"
        new_token = r4.json()["token"]
        payload = _decode_jwt_payload(new_token)
        assert payload.get("tv") == 1, f"expected tv=1 after 1 reset, got {payload.get('tv')}"

        # 6. New token works
        r5 = _me(new_token)
        assert r5.status_code == 200

        # 7. Old dev_token is now used → cannot be used again
        r6 = requests.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"token": dev_token, "new_password": "AnotherPass789!"},
        )
        assert r6.status_code == 400

    def test_old_login_still_fails_after_reset(self, fresh_user):
        # Trigger reset
        dev_token = _get_reset_token(fresh_user["email"])
        assert dev_token
        new_pwd = "AnotherPwd789!"
        r2 = requests.post(
            f"{BASE_URL}/api/auth/reset-password",
            json={"token": dev_token, "new_password": new_pwd},
        )
        assert r2.status_code == 200
        # Old password must no longer work
        r3 = _login(fresh_user["email"], fresh_user["password"])
        assert r3.status_code == 401


# ============ 4. ADMIN RESET PASSWORD ============

class TestAdminResetPassword:
    def test_admin_reset_revokes_user_session(self, admin_token, fresh_user):
        old_token = fresh_user["token"]
        uid = fresh_user["user_id"]
        assert uid, "user_id required"

        # verify old token works
        assert _me(old_token).status_code == 200

        # Admin resets the user's password
        r = requests.post(
            f"{BASE_URL}/api/admin/users/{uid}/reset-password",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={},  # no new_password → server generates
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        assert data.get("ok") is True
        assert data.get("new_password"), "admin reset should return new_password"
        new_pwd = data["new_password"]

        # Old token should be revoked
        r2 = _me(old_token)
        assert r2.status_code == 401, f"expected 401 after admin reset, got {r2.status_code}"

        # User can login with new password
        r3 = _login(fresh_user["email"], new_pwd)
        assert r3.status_code == 200, f"{r3.status_code} {r3.text}"
        new_token = r3.json()["token"]
        payload = _decode_jwt_payload(new_token)
        assert payload.get("tv") == 1, f"expected tv=1 after admin reset, got {payload.get('tv')}"

        assert _me(new_token).status_code == 200


# ============ 5. RATE LIMITER (light sanity check) ============

class TestRateLimiter:
    def test_normal_traffic_not_blocked(self, client_token):
        """100 requests to /auth/me should NOT be rate limited (limit=6000/min)."""
        headers = {"Authorization": f"Bearer {client_token}"}
        codes = []
        for _ in range(100):
            r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
            codes.append(r.status_code)
        assert all(c == 200 for c in codes), f"unexpected non-200 in first 100 reqs: {set(codes)}"


# ============ 6. TIMEZONE-AWARE BRUTE FORCE (legacy naive doc compat) ============

class TestTimezoneAwareBruteForce:
    def test_legacy_naive_locked_until_does_not_crash(self):
        """Insert a legacy rate_limit doc with naive datetime and verify login doesn't crash with TypeError."""
        import asyncio
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        if not (mongo_url and db_name):
            pytest.skip("MONGO_URL/DB_NAME not set")

        email = f"TEST_iter41_tz_{uuid.uuid4().hex[:6]}@example.com"
        # Register user
        r0 = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "Pass1234!", "name": "tz-test", "role": "client",
        })
        assert r0.status_code in (200, 201)

        # Insert legacy naive rate-limit doc with EXPIRED naive locked_until
        async def _seed():
            cli = AsyncIOMotorClient(mongo_url)
            await cli[db_name].rate_limit.update_one(
                {"_id": f"login:email:{email.lower()}"},
                {"$set": {
                    "attempts": [datetime.utcnow() - timedelta(hours=2)],  # naive, expired
                    "locked_until": datetime.utcnow() - timedelta(minutes=5),  # naive, expired
                    "updated_at": datetime.utcnow(),
                }},
                upsert=True,
            )
            cli.close()

        asyncio.run(_seed())

        # Now attempt login — should NOT crash (500). Should return 200 (correct password).
        r = _login(email, "Pass1234!")
        assert r.status_code in (200, 401, 429), (
            f"login crashed with legacy naive doc: {r.status_code} {r.text}"
        )
        # Ideally 200 since password is correct and lock is expired
        assert r.status_code == 200, f"expected 200 with correct pwd + expired lock, got {r.status_code}: {r.text}"

        # Cleanup
        async def _clean():
            cli = AsyncIOMotorClient(mongo_url)
            await cli[db_name].users.delete_one({"email": email})
            await cli[db_name].rate_limit.delete_many({"_id": {"$regex": email}})
            cli.close()

        asyncio.run(_clean())


# ============ 7. CORS ============

class TestCORS:
    def test_cors_options_allowed_origin(self):
        r = requests.options(
            f"{BASE_URL}/api/auth/login",
            headers={
                "Origin": "https://jokooservices.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        # Should return CORS headers
        assert r.status_code in (200, 204), f"unexpected OPTIONS status: {r.status_code}"
        allow_origin = r.headers.get("access-control-allow-origin", "")
        assert allow_origin in ("*", "https://jokooservices.com"), (
            f"missing/incorrect Allow-Origin header for jokooservices.com: {allow_origin!r}"
        )

    def test_cors_options_disallowed_origin(self):
        r = requests.options(
            f"{BASE_URL}/api/auth/login",
            headers={
                "Origin": "https://evil-attacker.example.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        allow_origin = r.headers.get("access-control-allow-origin", "")
        # Must either not echo the malicious origin, or refuse
        assert allow_origin != "https://evil-attacker.example.com", (
            f"CORS wildcard/reflection accepts arbitrary origin! got: {allow_origin!r}"
        )


# ============ 8. ADMIN AUTH GUARDS ============

class TestAdminGuards:
    def test_admin_endpoint_without_auth_401(self):
        r = requests.get(f"{BASE_URL}/api/admin/stats/marketplace")
        assert r.status_code == 401

    def test_admin_endpoint_with_client_token_403(self, client_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/stats/marketplace",
            headers={"Authorization": f"Bearer {client_token}"},
        )
        assert r.status_code == 403, f"expected 403 for non-admin, got {r.status_code} {r.text}"

    def test_admin_reset_password_without_auth_401(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/users/some-uid/reset-password",
            json={},
        )
        assert r.status_code == 401

    def test_admin_reset_password_with_client_token_403(self, client_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/users/some-uid/reset-password",
            headers={"Authorization": f"Bearer {client_token}"},
            json={},
        )
        assert r.status_code == 403
