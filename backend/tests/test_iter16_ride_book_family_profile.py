"""Iteration 16 backend tests — ride booking + family profile persistence.

Focus:
- POST /api/rides/{ride_id}/book with authenticated client on a ride with seats_available > 0
- POST /api/family/profile with authenticated client, valid FamilyProfileIn payload
- Verify created profile appears via GET /api/family/babysitters?limit=200
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to public preview URL (from test_credentials.md) — never hardcode in prod
    BASE_URL = "https://jokoo-mobile-dev.preview.emergentagent.com"

CLIENT_EMAIL = "client@jokoo.sn"
CLIENT_PASSWORD = "Passw0rd!"
DRIVER_EMAIL = "chauffeur@jokoo.sn"
DRIVER_PASSWORD = "Driver1234!"


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _login(sess, email, password):
    r = sess.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def client_token(s):
    return _login(s, CLIENT_EMAIL, CLIENT_PASSWORD)


@pytest.fixture(scope="module")
def driver_token(s):
    return _login(s, DRIVER_EMAIL, DRIVER_PASSWORD)


def _auth_headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------- ride book flow ----------------
class TestRideBook:
    """POST /api/rides/{rid}/book — the flow behind iter16 covoiturage fix."""

    def test_book_ride_returns_200_and_persists(self, s, client_token, driver_token):
        # 1. Driver publishes a fresh ride (seats_available > 0)
        payload = {
            "from_city": "TEST_Dakar",
            "to_city": "TEST_Thies",
            "from_address": "Point A",
            "to_address": "Point B",
            "date": "2030-12-15",
            "time": "09:00",
            "seats_total": 3,
            "price_xof": 3000,
            "notes": "TEST_iter16",
            "distance_type": "short",
        }
        r = s.post(f"{BASE_URL}/api/rides", json=payload, headers=_auth_headers(driver_token), timeout=15)
        assert r.status_code == 200, f"ride create failed: {r.status_code} {r.text[:200]}"
        ride = r.json()
        rid = ride["id"]
        assert ride["seats_available"] >= 1

        # 2. Client books 1 seat
        rb = s.post(
            f"{BASE_URL}/api/rides/{rid}/book",
            json={"seats": 1},
            headers=_auth_headers(client_token),
            timeout=15,
        )
        assert rb.status_code == 200, f"book failed: {rb.status_code} {rb.text[:200]}"
        booking = rb.json()
        assert booking.get("ride_id") == rid or booking.get("id"), booking
        # numeric fields
        assert booking.get("seats") == 1
        assert booking.get("price_xof") == 3000

        # 3. Verify booking appears in the client's /rides/bookings/mine
        g = s.get(f"{BASE_URL}/api/rides/bookings/mine", headers=_auth_headers(client_token), timeout=15)
        assert g.status_code == 200
        ids = [b.get("id") for b in g.json()]
        assert booking.get("id") in ids, f"created booking not found in mine: {ids}"

        # 4. Verify seats_available decreased on the ride
        gr = s.get(f"{BASE_URL}/api/rides/{rid}", timeout=15)
        assert gr.status_code == 200
        assert gr.json()["seats_available"] == ride["seats_available"] - 1

    def test_book_ride_missing_auth_returns_401(self, s):
        r = s.post(f"{BASE_URL}/api/rides/does-not-matter/book", json={"seats": 1}, timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


# ---------------- family profile flow ----------------
class TestFamilyProfile:
    """POST /api/family/profile — iter16 profile-setup fix."""

    def test_upsert_family_profile_persists_and_appears_in_search(self, s, client_token):
        unique_bio = f"TEST_iter16 Etudiante bilingue - {uuid.uuid4().hex[:6]}. Baby-sitting + tutorat."
        payload = {
            "bio": unique_bio,
            "profile_type": "student",
            "university": "UCAD",
            "level": "licence",
            "field_of_study": "Education",
            "city": "Dakar",
            "languages": [{"code": "fr", "level": "native"}],
            "age_specialties": ["3-5", "6-10"],
            "skills": [],
            "services": ["babysitting"],
            "tutoring_subjects": [],
            "available_today": False,
            "night_care": False,
            "can_travel": False,
            "hourly_rate_xof": 2500,
            "psc1_certified": False,
        }
        r = s.post(f"{BASE_URL}/api/family/profile", json=payload, headers=_auth_headers(client_token), timeout=15)
        assert r.status_code == 200, f"profile POST failed: {r.status_code} {r.text[:300]}"
        prof = r.json()
        assert prof.get("bio") == unique_bio
        assert prof.get("city") == "Dakar"
        assert prof.get("hourly_rate_xof") == 2500
        assert prof.get("status") == "active"
        assert prof.get("profile_type") == "student"
        # id present + no _id leak
        assert prof.get("id")
        assert "_id" not in prof

        # GET /family/profile/me → exists=true
        me = s.get(f"{BASE_URL}/api/family/profile/me", headers=_auth_headers(client_token), timeout=15)
        assert me.status_code == 200
        assert me.json().get("exists") is True
        assert me.json()["profile"]["bio"] == unique_bio

        # GET /family/babysitters → profile appears (active=true)
        srch = s.get(f"{BASE_URL}/api/family/babysitters?limit=200", timeout=15)
        assert srch.status_code == 200
        items = srch.json()
        assert isinstance(items, list)
        matches = [b for b in items if b.get("bio") == unique_bio]
        assert len(matches) == 1, f"newly upserted profile not visible in babysitters search"

    def test_family_profile_requires_auth(self, s):
        r = s.post(f"{BASE_URL}/api/family/profile", json={}, timeout=15)
        assert r.status_code in (401, 403, 422), f"got {r.status_code}"


# ---------------- regression : parcel POST 200 ----------------
class TestParcelRegression:
    """iter15 regression — POST /rides/{rid}/parcel still returns 200."""

    def test_parcel_send_regression(self, s, client_token, driver_token):
        # publish a long-distance ride that accepts parcels
        payload = {
            "from_city": "TEST_Dakar",
            "to_city": "TEST_StLouis",
            "from_address": "Origin",
            "to_address": "Destination",
            "date": "2030-12-20",
            "time": "07:00",
            "seats_total": 4,
            "price_xof": 8000,
            "distance_type": "long",
            "accepts_parcels": True,
            "parcel_price_xof": 3000,
            "parcel_max_kg": 20,
        }
        r = s.post(f"{BASE_URL}/api/rides", json=payload, headers=_auth_headers(driver_token), timeout=15)
        assert r.status_code == 200
        rid = r.json()["id"]

        pl = {
            "pickup_address": "Rue Test A",
            "dropoff_address": "Rue Test B",
            "description": "TEST_iter16 colis",
            "weight_kg": 3,
            "recipient_name": "TEST Recipient",
            "recipient_phone": "+221770000000",
            "payment_mode": "app",
        }
        pr = s.post(f"{BASE_URL}/api/rides/{rid}/parcel", json=pl, headers=_auth_headers(client_token), timeout=15)
        assert pr.status_code == 200, f"parcel POST failed: {pr.status_code} {pr.text[:200]}"
        assert pr.json().get("id")
