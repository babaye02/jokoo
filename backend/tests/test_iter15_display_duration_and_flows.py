"""
Iteration 15 backend tests
==========================
Covers:
- POST /api/admin/ads with `display_duration_ms` persisted and returned.
- POST /api/admin/ads without `display_duration_ms` (legacy path) returns None.
- DELETE /api/admin/ads/{id} → 200 + ad no longer in list.
- POST /api/family/bookings authenticated → 200 or 400 (validation) — NEVER 401.
- POST /api/rides/{ride_id}/parcel authenticated → 200 or 400 — NEVER 401.
- DELETE /api/admin/promos & /api/admin/partners still work (regression check).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@jokoo.sn"
ADMIN_PASS = "Admin1234!"
CLIENT_EMAIL = "client@jokoo.sn"
CLIENT_PASS = "Passw0rd!"


# ---------- shared session helpers -----------------------------------------------
@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _login(session, email, password):
    r = session.post(
        f"{API}/auth/login", json={"email": email, "password": password}, timeout=20
    )
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(s):
    tok = _login(s, ADMIN_EMAIL, ADMIN_PASS)
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def client_headers(s):
    tok = _login(s, CLIENT_EMAIL, CLIENT_PASS)
    return {"Authorization": f"Bearer {tok}"}


# ---------- Ads : display_duration_ms & delete flow -----------------------------
class TestAdsDisplayDuration:
    created_ids = []

    def test_1_create_ad_with_duration_7000(self, s, admin_headers):
        payload = {
            "type": "banner",
            "title": f"TEST_ Ad duration 7000 {uuid.uuid4().hex[:5]}",
            "description": "iter15 duration",
            "media": [{"kind": "image", "url": "https://example.com/img.jpg"}],
            "placements": ["home"],
            "target_audience": "all",
            "display_duration_ms": 7000,
            "active": True,
        }
        r = s.post(f"{API}/admin/ads", json=payload, headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("display_duration_ms") == 7000
        assert "id" in data
        TestAdsDisplayDuration.created_ids.append(data["id"])

    def test_2_duration_persists_in_admin_list(self, s, admin_headers):
        r = s.get(f"{API}/admin/ads", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        found = next(
            (a for a in r.json() if a.get("id") in TestAdsDisplayDuration.created_ids),
            None,
        )
        assert found is not None, "ad with duration not present in admin list"
        assert found.get("display_duration_ms") == 7000

    def test_3_create_ad_without_duration_legacy(self, s, admin_headers):
        payload = {
            "type": "banner",
            "title": f"TEST_ Ad no-duration {uuid.uuid4().hex[:5]}",
            "description": "iter15 legacy",
            "media": [{"kind": "image", "url": "https://example.com/img2.jpg"}],
            "placements": ["home"],
            "active": True,
        }
        r = s.post(f"{API}/admin/ads", json=payload, headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # Legacy: absence = None
        assert data.get("display_duration_ms") in (None, 0) or "display_duration_ms" not in data
        TestAdsDisplayDuration.created_ids.append(data["id"])

    def test_4_delete_ad(self, s, admin_headers):
        # Delete first created ad, verify it disappears
        assert TestAdsDisplayDuration.created_ids, "no ad created"
        aid = TestAdsDisplayDuration.created_ids[0]
        r = s.delete(f"{API}/admin/ads/{aid}", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        # Verify absent in admin list
        r2 = s.get(f"{API}/admin/ads", headers=admin_headers, timeout=20)
        ids = [a.get("id") for a in r2.json()]
        assert aid not in ids

    def test_5_cleanup(self, s, admin_headers):
        # Delete remaining created ads (idempotent cleanup)
        for aid in TestAdsDisplayDuration.created_ids[1:]:
            s.delete(f"{API}/admin/ads/{aid}", headers=admin_headers, timeout=20)


# ---------- Family booking flow: never 401 when auth'd --------------------------
class TestFamilyBookingAuth:
    def test_family_bookings_never_401_when_auth(self, s, client_headers):
        # Get a babysitter to book
        rb = s.get(f"{API}/family/babysitters?limit=5", timeout=20)
        assert rb.status_code == 200
        sitters = rb.json()
        if not sitters:
            pytest.skip("no babysitter available")
        sitter = sitters[0]

        payload = {
            "babysitter_id": sitter["id"],
            "service_type": "babysitting",
            "address": "TEST_ 42 rue Test",
            "city": "Dakar",
            "date": "2026-09-01",
            "time_start": "10:00",
            "time_end": "13:00",
            "kids": [{"name": "TEST_kid", "age": 4}],
            "emergency_contact": {"name": "TEST_ EC", "phone": "770000001"},
            "notes": "TEST_ iter15",
        }
        r = s.post(
            f"{API}/family/bookings",
            json=payload,
            headers=client_headers,
            timeout=20,
        )
        # Must not be 401 — 200 (success) or 400 (validation) both acceptable
        assert r.status_code != 401, f"got 401 with auth: {r.text}"
        assert r.status_code in (200, 400), r.text

        # Cleanup if created
        if r.status_code == 200:
            bid = r.json().get("id")
            if bid:
                s.patch(
                    f"{API}/family/bookings/{bid}",
                    json={"status": "cancelled"},
                    headers=client_headers,
                    timeout=20,
                )


# ---------- Parcel flow: never 401 when auth'd -----------------------------------
class TestParcelAuth:
    def test_parcel_never_401_when_auth(self, s, client_headers):
        # Find a ride with accepts_parcels=true and parcel_max_kg>0
        r = s.get(f"{API}/rides?limit=20", timeout=20)
        assert r.status_code == 200
        rides = r.json()
        parcel_rides = [
            ride
            for ride in rides
            if ride.get("accepts_parcels") and (ride.get("parcel_max_kg") or 0) > 0
        ]
        if not parcel_rides:
            pytest.skip("no ride accepting parcels")
        ride = parcel_rides[0]

        payload = {
            "pickup_address": "TEST_ Point A Dakar",
            "dropoff_address": "TEST_ Point B Thies",
            "description": "TEST_ small package iter15",
            "weight_kg": 2.0,
            "recipient_name": "TEST_ Recipient",
            "recipient_phone": "770000002",
            "payment_mode": "app",
        }
        r2 = s.post(
            f"{API}/rides/{ride['id']}/parcel",
            json=payload,
            headers=client_headers,
            timeout=20,
        )
        assert r2.status_code != 401, f"got 401 with auth: {r2.text}"
        assert r2.status_code in (200, 400), r2.text


# ---------- Regression: Promos and Partners DELETE still works ------------------
class TestPromoPartnerDeleteRegression:
    def test_promo_delete_regression(self, s, admin_headers):
        slug = f"iter15-{uuid.uuid4().hex[:6]}"
        payload = {"slug": slug, "title": "TEST_ Iter15 promo delete", "active": True}
        r = s.post(f"{API}/admin/promos", json=payload, headers=admin_headers, timeout=20)
        assert r.status_code == 200
        pid = r.json()["id"]
        rd = s.delete(f"{API}/admin/promos/{pid}", headers=admin_headers, timeout=20)
        assert rd.status_code == 200
        # Verify gone from public list
        rl = s.get(f"{API}/promos", timeout=20)
        assert slug not in [p["slug"] for p in rl.json()]

    def test_partner_delete_regression(self, s, admin_headers):
        name = f"TEST_ Iter15 partner {uuid.uuid4().hex[:5]}"
        payload = {"name": name, "active": True}
        r = s.post(
            f"{API}/admin/partners", json=payload, headers=admin_headers, timeout=20
        )
        assert r.status_code == 200
        pid = r.json()["id"]
        rd = s.delete(
            f"{API}/admin/partners/{pid}", headers=admin_headers, timeout=20
        )
        assert rd.status_code == 200
