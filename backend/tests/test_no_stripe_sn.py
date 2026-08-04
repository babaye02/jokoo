"""Iteration 37 — Audit version Sénégal SANS Stripe.

Verifies:
- /api/payments/config returns proper state (card disabled).
- All Stripe endpoints return 503 (not 500 nor 404) with French wording.
- Wave/Orange sponsorship checkout endpoints return 503 (no keys configured).
- Non-regression: auth, providers list, booking creation, dashboard, admin
  company-info remain functional.
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "BACKEND_URL_OVERRIDE",
    "https://868fd53e-1f85-41aa-80f4-13c6ad7575b7.preview.emergentagent.com",
).rstrip("/")

API = f"{BASE_URL}/api"

CLIENT_EMAIL = "client@jokoo.sn"
PRO_EMAIL = "pro@jokoo.sn"
ADMIN_EMAIL = "admin@jokoo.sn"


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, email, password):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login {email} failed: {r.status_code} {r.text}"
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    assert tok, f"No token in response: {body}"
    return tok


@pytest.fixture(scope="module")
def client_token(session):
    return _login(session, CLIENT_EMAIL, "Passw0rd!")


@pytest.fixture(scope="module")
def pro_token(session):
    return _login(session, PRO_EMAIL, "Passw0rd!")


@pytest.fixture(scope="module")
def admin_token(session):
    return _login(session, ADMIN_EMAIL, "Admin1234!")


def _h(token):
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# 1. GET /api/payments/config  (public)                                       #
# --------------------------------------------------------------------------- #
def test_payments_config_public_no_stripe(session):
    r = session.get(f"{API}/payments/config", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # Structural checks
    for k in ["card", "wave", "orange", "cash", "card_ready", "wave_ready", "orange_ready", "currency", "country"]:
        assert k in data, f"missing key {k}"
    # Values matching the SN-no-stripe requirement
    assert data["card"] is False, f"card must be False, got {data['card']}"
    assert data["card_ready"] is False, f"card_ready must be False, got {data['card_ready']}"
    assert data["wave"] is True
    assert data["orange"] is True
    assert data["cash"] is True
    assert data["currency"] == "XOF"
    assert data["country"] == "SN"
    # wave_ready/orange_ready must be booleans; empty keys => False
    assert isinstance(data["wave_ready"], bool)
    assert isinstance(data["orange_ready"], bool)


# --------------------------------------------------------------------------- #
# 2. POST /api/payments/checkout/booking  -> 503 propre                        #
# --------------------------------------------------------------------------- #
def _get_first_provider_with_fixed_price(session):
    r = session.get(f"{API}/providers?limit=20", timeout=15)
    assert r.status_code == 200, r.text
    providers = r.json()
    for p in providers:
        pid = p.get("id")
        rs = session.get(f"{API}/providers/{pid}/services", timeout=15)
        if rs.status_code != 200:
            continue
        for svc in rs.json():
            if svc.get("price_type") == "fixed" and svc.get("price_amount"):
                return pid, svc
    return None, None


@pytest.fixture(scope="module")
def booking_id(session, client_token):
    """Create a booking so we can hit /payments/checkout/booking."""
    pid, svc = _get_first_provider_with_fixed_price(session)
    if not pid:
        pytest.skip("No provider+fixed-service seed available")
    payload = {
        "provider_id": pid,
        "service_id": svc["id"],
        "date": "2026-02-15",
        "time": "14:00",
        "address": "TEST_no_stripe — 42 rue Test, Dakar",
        "description": "TEST_no_stripe booking",
    }
    r = session.post(f"{API}/bookings", json=payload, headers=_h(client_token), timeout=30)
    assert r.status_code in (200, 201), f"Booking creation failed: {r.status_code} {r.text}"
    return r.json()["id"]


def test_checkout_booking_returns_503_no_stripe(session, client_token, booking_id):
    payload = {"booking_id": booking_id, "amount_xof": 5000}
    r = session.post(
        f"{API}/payments/checkout/booking",
        json=payload,
        headers=_h(client_token),
        timeout=30,
    )
    assert r.status_code == 503, f"Expected 503 got {r.status_code}: {r.text}"
    # Must NOT be 500. Message should be French and mention alternatives
    body_text = r.text.lower()
    assert "carte" in body_text or "stripe" in body_text or "indisponible" in body_text
    assert "wave" in body_text and "orange" in body_text and ("espèce" in body_text or "espece" in body_text)


# --------------------------------------------------------------------------- #
# 3. POST /api/payments/checkout/subscription -> 503                          #
# --------------------------------------------------------------------------- #
def test_checkout_subscription_returns_503(session, pro_token):
    r = session.post(
        f"{API}/payments/checkout/subscription",
        json={},
        headers=_h(pro_token),
        timeout=30,
    )
    assert r.status_code == 503, f"Expected 503 got {r.status_code}: {r.text}"
    body_text = r.text.lower()
    assert "wave" in body_text and "orange" in body_text


# --------------------------------------------------------------------------- #
# 4. GET /api/payments/status/{sid}  -> 503 (Stripe désactivé)                #
# --------------------------------------------------------------------------- #
def test_payments_status_returns_503_stripe_disabled(session):
    fake_sid = "cs_test_" + uuid.uuid4().hex
    r = session.get(f"{API}/payments/status/{fake_sid}", timeout=15)
    # MUST be 503 (not 404 nor 500) because Stripe is disabled globally
    assert r.status_code == 503, f"Expected 503 got {r.status_code}: {r.text}"
    body_text = r.text.lower()
    assert "wave" in body_text or "orange" in body_text or "carte" in body_text


# --------------------------------------------------------------------------- #
# 5–7. Sponsorship checkout with provider=card|wave|orange                    #
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="module")
def sponsorship_id(session, pro_token):
    r = session.post(
        f"{API}/sponsorships",
        json={"duration_days": 7},
        headers=_h(pro_token),
        timeout=30,
    )
    assert r.status_code in (200, 201), f"Sponsorship create failed: {r.status_code} {r.text}"
    return r.json()["id"]


def test_sponsorship_checkout_card_returns_503(session, pro_token, sponsorship_id):
    r = session.post(
        f"{API}/sponsorships/{sponsorship_id}/checkout",
        json={"provider": "card"},
        headers=_h(pro_token),
        timeout=30,
    )
    assert r.status_code == 503, f"Expected 503 got {r.status_code}: {r.text}"
    body_text = r.text.lower()
    assert "wave" in body_text and "orange" in body_text


def test_sponsorship_checkout_wave_returns_503_no_key(session, pro_token, sponsorship_id):
    r = session.post(
        f"{API}/sponsorships/{sponsorship_id}/checkout",
        json={"provider": "wave"},
        headers=_h(pro_token),
        timeout=30,
    )
    assert r.status_code == 503, f"Expected 503 got {r.status_code}: {r.text}"
    body_text = r.text.lower()
    assert "wave" in body_text and "wave_api_key" in body_text


def test_sponsorship_checkout_orange_returns_503_no_key(session, pro_token, sponsorship_id):
    r = session.post(
        f"{API}/sponsorships/{sponsorship_id}/checkout",
        json={"provider": "orange"},
        headers=_h(pro_token),
        timeout=30,
    )
    assert r.status_code == 503, f"Expected 503 got {r.status_code}: {r.text}"
    body_text = r.text.lower()
    assert "orange" in body_text and "om_client_id" in body_text


# --------------------------------------------------------------------------- #
# 8. Non-regression: auth, providers, booking, dashboard, admin company-info  #
# --------------------------------------------------------------------------- #
def test_login_admin_ok(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "Admin1234!"}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("access_token") or body.get("token")


def test_login_client_ok(session):
    r = session.post(f"{API}/auth/login", json={"email": CLIENT_EMAIL, "password": "Passw0rd!"}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("access_token") or body.get("token")


def test_login_pro_ok(session):
    r = session.post(f"{API}/auth/login", json={"email": PRO_EMAIL, "password": "Passw0rd!"}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("access_token") or body.get("token")


def test_providers_list_ok(session):
    r = session.get(f"{API}/providers?limit=5", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1


def test_booking_created_persists(session, client_token, booking_id):
    # Use the module-scoped booking created earlier; verify it exists
    r = session.get(f"{API}/bookings/{booking_id}", headers=_h(client_token), timeout=15)
    assert r.status_code == 200, f"GET /bookings/{{id}} failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("id") == booking_id


def test_dashboard_pro_ok(session, pro_token):
    r = session.get(f"{API}/dashboard", headers=_h(pro_token), timeout=15)
    assert r.status_code == 200
    # sanity: response is a dict
    assert isinstance(r.json(), dict)


def test_admin_company_info_ok(session, admin_token):
    r = session.get(f"{API}/admin/company-info", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    data = r.json()
    # Structure: company_info key OR nested object with company data
    assert isinstance(data, dict)
    # Accept either wrapper or flat structure
    keys = set(data.keys())
    assert any(k in keys for k in ["company_info", "name", "email", "phone", "address"]), (
        f"Unexpected company-info structure: {list(keys)[:10]}"
    )
