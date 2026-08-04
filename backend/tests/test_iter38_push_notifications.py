"""Iteration 38 — Push notifications (SuprSend relay) — Backend audit.

Scope:
- POST /api/register-push
    * Validation Pydantic (422 si champs manquants)
    * Endpoint atteint (pas 404) même si EMERGENT_PUSH_KEY=placeholder
      -> renvoie 500 "EMERGENT_PUSH_KEY missing or invalid" OU 502.
- Non-régression :
    * POST /api/chat/{peer_id}/messages (client -> provider) doit rester 200.
    * PATCH /api/bookings/{bid} accept (provider) doit rester 200 + statut mis à jour.
    * PATCH /api/bookings/{bid} quote (provider) doit rester 200 + quote_amount stocké.
    * PATCH /api/admin/sponsorships/{sid} gift (admin) doit activer la sponso.
"""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = "https://868fd53e-1f85-41aa-80f4-13c6ad7575b7.preview.emergentagent.com"
API = f"{BASE_URL}/api"

CLIENT_EMAIL = "client@jokoo.sn"
CLIENT_PASS = "Passw0rd!"
PRO_EMAIL = "pro@jokoo.sn"
PRO_PASS = "Passw0rd!"
ADMIN_EMAIL = "admin@jokoo.sn"
ADMIN_PASS = "Admin1234!"


def _login(session: requests.Session, email: str, password: str) -> str:
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in {r.json()}"
    return tok


def _client(email: str, pw: str) -> requests.Session:
    s = requests.Session()
    tok = _login(s, email, pw)
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def client_sess():
    return _client(CLIENT_EMAIL, CLIENT_PASS)


@pytest.fixture(scope="module")
def pro_sess():
    return _client(PRO_EMAIL, PRO_PASS)


@pytest.fixture(scope="module")
def admin_sess():
    return _client(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def pro_user(pro_sess):
    r = pro_sess.get(f"{API}/auth/me", timeout=20)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def client_user(client_sess):
    r = client_sess.get(f"{API}/auth/me", timeout=20)
    assert r.status_code == 200
    return r.json()


# ─────────────────────────────────────────
# 1. /register-push — endpoint & validation
# ─────────────────────────────────────────
class TestRegisterPush:
    def test_endpoint_exists_valid_body(self):
        """Endpoint must exist (not 404). With EMERGENT_PUSH_KEY=placeholder,
        expected 500 (missing/invalid key) or 502 (provider unreachable)."""
        r = requests.post(
            f"{API}/register-push",
            json={
                "user_id": "test-user-iter38",
                "platform": "android",
                "device_token": "dev-token-xyz-123",
            },
            timeout=20,
        )
        assert r.status_code != 404, "register-push endpoint MISSING (404)"
        assert r.status_code != 405, "register-push endpoint wrong method"
        # Accepted outcomes in dev with placeholder:
        # 201 (unlikely with placeholder), 500 (placeholder key), 502 (upstream)
        assert r.status_code in (201, 500, 502), (
            f"unexpected status {r.status_code}: {r.text[:200]}"
        )
        if r.status_code == 500:
            # Expected message per server.py
            body = r.text.lower()
            assert "emergent_push_key" in body or "invalid" in body or "missing" in body, (
                f"500 without expected message: {r.text[:200]}"
            )

    def test_missing_platform_returns_422(self):
        r = requests.post(
            f"{API}/register-push",
            json={"user_id": "x", "device_token": "y"},
            timeout=20,
        )
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"

    def test_missing_device_token_returns_422(self):
        r = requests.post(
            f"{API}/register-push",
            json={"user_id": "x", "platform": "ios"},
            timeout=20,
        )
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"

    def test_missing_user_id_returns_422(self):
        r = requests.post(
            f"{API}/register-push",
            json={"platform": "ios", "device_token": "y"},
            timeout=20,
        )
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"

    def test_empty_body_returns_422(self):
        r = requests.post(f"{API}/register-push", json={}, timeout=20)
        assert r.status_code == 422


# ─────────────────────────────────────────
# 2. Non-régression chat (send_push try/except)
# ─────────────────────────────────────────
class TestChatNonRegression:
    def test_send_message_still_ok(self, client_sess, pro_user):
        """POST /chat/{provider_id}/messages doit répondre 200 même si push échoue."""
        text = f"iter38-push-audit ping {uuid.uuid4().hex[:6]}"
        r = client_sess.post(
            f"{API}/chat/{pro_user['id']}/messages",
            json={"text": text, "kind": "text"},
            timeout=20,
        )
        assert r.status_code == 200, f"chat send failed: {r.status_code} {r.text[:200]}"
        doc = r.json()
        assert doc.get("text"), f"empty text in response: {doc}"
        # persistance : GET messages doit voir notre message
        r2 = client_sess.get(f"{API}/chat/{pro_user['id']}/messages", timeout=20)
        assert r2.status_code == 200
        texts = [m.get("text") for m in r2.json()]
        assert text in texts, f"message NOT persisted; last texts: {texts[-3:]}"


# ─────────────────────────────────────────
# 3. Non-régression booking (accept + quote)
# ─────────────────────────────────────────
@pytest.fixture(scope="module")
def created_booking(client_sess, pro_user):
    payload = {
        "provider_id": pro_user["id"],
        "date": (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat(),
        "time": "14:00",
        "address": "Test address iter38",
        "description": "iter38 push non-regression booking",
    }
    r = client_sess.post(f"{API}/bookings", json=payload, timeout=20)
    assert r.status_code == 200, f"create booking failed: {r.status_code} {r.text[:200]}"
    doc = r.json()
    assert doc.get("id"), f"no id: {doc}"
    return doc


class TestBookingNonRegression:
    def test_booking_created(self, created_booking):
        assert created_booking["status"] == "pending"

    def test_booking_quote_amount(self, pro_sess, created_booking, client_sess):
        bid = created_booking["id"]
        r = pro_sess.patch(
            f"{API}/bookings/{bid}",
            json={"quote_amount": 15000},
            timeout=20,
        )
        assert r.status_code == 200, f"quote patch failed: {r.status_code} {r.text[:200]}"
        assert r.json().get("ok") is True
        # Verify persistence via GET /bookings/{bid}
        g = client_sess.get(f"{API}/bookings/{bid}", timeout=20)
        assert g.status_code == 200, f"GET booking failed: {g.status_code} {g.text[:200]}"
        found = g.json()
        assert float(found.get("quote_amount") or 0) == 15000.0, (
            f"quote_amount mismatch: {found.get('quote_amount')}"
        )

    def test_booking_accept(self, pro_sess, created_booking, client_sess):
        bid = created_booking["id"]
        r = pro_sess.patch(
            f"{API}/bookings/{bid}",
            json={"status": "accepted"},
            timeout=20,
        )
        assert r.status_code == 200, f"accept failed: {r.status_code} {r.text[:200]}"
        assert r.json().get("ok") is True
        g = client_sess.get(f"{API}/bookings/{bid}", timeout=20)
        assert g.status_code == 200
        found = g.json()
        assert found.get("status") == "accepted", f"status not persisted: {found.get('status')}"


# ─────────────────────────────────────────
# 4. Non-régression sponsorship admin gift
# ─────────────────────────────────────────
class TestSponsorshipAdminGiftNonRegression:
    _sid: str = ""

    def test_create_sponsorship_pending(self, pro_sess):
        r = pro_sess.post(f"{API}/sponsorships", json={"duration_days": 7}, timeout=20)
        assert r.status_code == 200, f"create sponsorship failed: {r.status_code} {r.text[:200]}"
        doc = r.json()
        assert doc.get("id")
        # backend uses "pending_payment" as pending status (see iter35 code)
        assert doc.get("status") in ("pending", "pending_payment"), (
            f"unexpected status {doc.get('status')}"
        )
        TestSponsorshipAdminGiftNonRegression._sid = doc["id"]

    def test_admin_gift_activates(self, admin_sess, pro_user, pro_sess):
        sid = TestSponsorshipAdminGiftNonRegression._sid
        assert sid, "no sponsorship id from previous test"
        r = admin_sess.patch(
            f"{API}/admin/sponsorships/{sid}",
            json={"status": "gift"},
            timeout=20,
        )
        assert r.status_code == 200, f"admin gift failed: {r.status_code} {r.text[:200]}"
        # Verify via GET /sponsorships/mine
        mine = pro_sess.get(f"{API}/sponsorships/mine", timeout=20)
        assert mine.status_code == 200
        found = next((s for s in mine.json() if s["id"] == sid), None)
        assert found is not None, "sponsorship not found in /mine"
        assert found.get("status") == "active", f"status not active: {found.get('status')}"
        assert found.get("ends_at"), "ends_at missing"

    def test_provider_has_sponsored_until(self, pro_sess, pro_user):
        # provider doc should now have sponsored_until set
        # Fetch via public /providers/{id}
        r = requests.get(f"{API}/providers/{pro_user['id']}", timeout=20)
        assert r.status_code == 200, f"provider fetch failed: {r.status_code}"
        prov = r.json()
        assert prov.get("sponsored_until"), (
            f"sponsored_until missing on provider: {list(prov.keys())}"
        )

    def test_internal_notification_created(self, pro_sess):
        # Admin gift path creates a `sponsorship_gifted` notification
        # (the `sponsorship_active` notif is created by the paid activation path via
        # `_activate_sponsorship`; the admin gift PATCH inlines the activation logic).
        r = pro_sess.get(f"{API}/notifications", timeout=20)
        assert r.status_code == 200
        types = [n.get("type") for n in r.json()]
        assert "sponsorship_gifted" in types or "sponsorship_active" in types, (
            f"no sponsorship activation notif in {types[:15]}"
        )
