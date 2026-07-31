"""Backend regression tests for booking flows after "Missing bearer token" fix.

Covers:
 - Login (public)
 - POST /api/bookings without token -> 401 "Missing bearer token"
 - POST /api/bookings with token -> 200
 - POST /api/rides/{id}/book with token (never 401)
 - POST /api/family/bookings with token (never 401)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://jokoo-mobile-dev.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CLIENT_EMAIL = "client@jokoo.sn"
CLIENT_PASSWORD = "Passw0rd!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def client_token(session):
    r = session.post(f"{API}/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    return data["token"]


# ---------- Auth ----------
class TestAuth:
    def test_login_ok(self, client_token):
        assert isinstance(client_token, str) and len(client_token) > 20


# ---------- Bookings (classic) ----------
class TestBookings:
    def test_missing_bearer_token(self, session):
        # No Authorization header at all
        r = session.post(f"{API}/bookings", json={"provider_id": "x", "date": "2026-01-15", "time": "10:00", "address": "a", "description": "d"})
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
        body = r.json()
        detail = body.get("detail") or body.get("message") or ""
        assert "Missing bearer token" in detail or "bearer" in detail.lower(), f"Unexpected detail: {detail}"

    def test_create_booking_with_token(self, session, client_token):
        prov = session.get(f"{API}/providers?limit=5")
        assert prov.status_code == 200
        providers = prov.json()
        assert len(providers) >= 1, "No providers seeded"
        provider_id = providers[0]["id"]

        r = session.post(
            f"{API}/bookings",
            json={
                "provider_id": provider_id,
                "date": "2026-02-15",
                "time": "10:00",
                "address": "TEST_Point E, Dakar",
                "description": "TEST_Backend regression booking",
            },
            headers={"Authorization": f"Bearer {client_token}"},
        )
        assert r.status_code in (200, 201), f"POST /bookings failed: {r.status_code} {r.text}"
        b = r.json()
        assert "id" in b
        assert b.get("provider_id") == provider_id
        assert b.get("address") == "TEST_Point E, Dakar"


# ---------- Rides / Covoiturage ----------
class TestRides:
    def test_book_ride_never_returns_401(self, session, client_token):
        rides = session.get(f"{API}/rides")
        assert rides.status_code == 200, f"GET /rides failed: {rides.status_code}"
        rlist = rides.json()
        if not rlist:
            pytest.skip("No rides available to test")

        ride = next((r for r in rlist if r.get("status") == "active" and r.get("seats_available", 0) > 0), rlist[0])
        ride_id = ride["id"]

        r = session.post(
            f"{API}/rides/{ride_id}/book",
            json={"seats": 1, "note": "TEST_ride booking"},
            headers={"Authorization": f"Bearer {client_token}"},
        )
        # Must never be 401
        assert r.status_code != 401, f"Ride booking returned 401 (bearer token issue): {r.text}"
        # Accept 200/201 (success) or 400 (business validation like no seats)
        assert r.status_code in (200, 201, 400, 409), f"Unexpected status: {r.status_code} {r.text}"


# ---------- Family bookings ----------
class TestFamilyBookings:
    def test_family_booking_never_returns_401(self, session, client_token):
        bs = session.get(f"{API}/family/babysitters?limit=1")
        assert bs.status_code == 200, f"GET /family/babysitters failed: {bs.status_code}"
        blist = bs.json()
        if not blist:
            pytest.skip("No babysitters available")
        b = blist[0]
        payload = {
            "babysitter_id": b["id"],
            "service_type": "babysitting",
            "address": "TEST_Address Dakar",
            "city": b.get("city", "Dakar"),
            "date": "2026-02-20",
            "time_start": "18:00",
            "time_end": "22:00",
            "kids": [{"name": "TEST_Kid", "age": 5}],
            "emergency_contact": {"name": "TEST_Parent", "phone": "+221770000000"},
        }
        r = session.post(
            f"{API}/family/bookings",
            json=payload,
            headers={"Authorization": f"Bearer {client_token}"},
        )
        # Never 401
        assert r.status_code != 401, f"Family booking returned 401: {r.text}"
        # Accept success or validation failure but not auth failure
        assert r.status_code in (200, 201, 400, 422), f"Unexpected status: {r.status_code} {r.text}"


# ---------- Bearer token propagation on protected GET routes ----------
class TestProtectedGets:
    def test_auth_me_with_token(self, session, client_token):
        r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {client_token}"})
        assert r.status_code == 200
        u = r.json()
        assert u.get("email") == CLIENT_EMAIL

    def test_auth_me_without_token(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401
