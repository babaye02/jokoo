"""
Backend tests for Mobility / Covoiturage (rides) endpoints.
Iteration 2 — tests only the new /api/rides/* endpoints.
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://jokoo-mobile-dev.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@jokoo.sn"
ADMIN_PASSWORD = "Admin1234!"
DRIVER_EMAIL = "chauffeur@jokoo.sn"
DRIVER_PASSWORD = "Driver1234!"

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


# ---------- helpers ----------
def _login(session: requests.Session, email: str, password: str) -> dict:
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed {email}: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    return data


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def seed_ran(session):
    r = session.post(f"{API}/seed", timeout=60)
    assert r.status_code == 200, f"Seed failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def driver_auth(session, seed_ran):
    d = _login(session, DRIVER_EMAIL, DRIVER_PASSWORD)
    return d


@pytest.fixture(scope="session")
def admin_auth(session, seed_ran):
    d = _login(session, ADMIN_EMAIL, ADMIN_PASSWORD)
    return d


@pytest.fixture(scope="session")
def created_rides():
    # Track ids so we don't leak endless data
    return []


# ---------- Seed idempotency ----------
class TestSeedIdempotency:
    def test_seed_runs_twice(self, session):
        r1 = session.post(f"{API}/seed", timeout=60)
        assert r1.status_code == 200
        r2 = session.post(f"{API}/seed", timeout=60)
        assert r2.status_code == 200

    def test_driver_credentials_preserved(self, session):
        # after re-seed the demo driver must still be able to log in
        _login(session, DRIVER_EMAIL, DRIVER_PASSWORD)


# ---------- POST /rides ----------
class TestCreateRide:
    def test_requires_auth(self, session):
        r = session.post(f"{API}/rides", json={}, timeout=15)
        assert r.status_code in (401, 403)

    def test_create_basic_ride(self, session, driver_auth, created_rides):
        payload = {
            "from_city": "Dakar", "from_address": "Plateau",
            "to_city": "Thiès",
            "stops": [{"city": "Rufisque"}],
            "date": "2026-07-15", "time": "08:00",
            "seats_total": 3, "price_xof": 2000,
            "distance_type": "long",
            "recurrence": "none", "recurrence_days": [],
            "vehicle_model": "Peugeot", "notes": "Test ride",
        }
        r = session.post(f"{API}/rides", json=payload, headers=_auth_header(driver_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["seats_total"] == 3
        assert data["seats_available"] == 3, "seats_available must equal seats_total on creation"
        assert data["status"] == "active"
        assert data["driver_id"] == driver_auth["user"]["id"]
        assert data["from_city"] == "Dakar"
        assert data["to_city"] == "Thiès"
        assert data["distance_type"] == "long"
        assert "id" in data
        assert "_id" not in data
        created_rides.append(data["id"])

    def test_create_ride_persists_via_get(self, session, driver_auth, created_rides):
        rid = created_rides[0]
        r = session.get(f"{API}/rides/{rid}", timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == rid


# ---------- GET /rides (search) ----------
class TestSearchRides:
    def test_search_no_filter_returns_list(self, session):
        r = session.get(f"{API}/rides", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_search_by_from_city_case_insensitive(self, session):
        r = session.get(f"{API}/rides", params={"from_city": "dakar"}, timeout=15)
        assert r.status_code == 200
        rides = r.json()
        assert len(rides) > 0
        for ride in rides:
            assert "dakar" in ride["from_city"].lower()

    def test_search_by_date_prefix(self, session, driver_auth, created_rides):
        r = session.get(f"{API}/rides", params={"date": "2026-07-15"}, timeout=15)
        assert r.status_code == 200
        rides = r.json()
        # Must contain the ride we just created
        assert any(rd["id"] == created_rides[0] for rd in rides), "Search by date didn't return created ride"
        for ride in rides:
            # A ride is included if date startswith prefix OR it's a weekly recurrence matching
            assert (ride["date"].startswith("2026-07-15")
                    or (ride.get("recurrence") == "weekly"))

    def test_search_distance_type_filter(self, session):
        r_long = session.get(f"{API}/rides", params={"distance_type": "long"}, timeout=15)
        r_short = session.get(f"{API}/rides", params={"distance_type": "short"}, timeout=15)
        assert r_long.status_code == 200 and r_short.status_code == 200
        for ride in r_long.json():
            assert ride["distance_type"] == "long"
        for ride in r_short.json():
            assert ride["distance_type"] == "short"

    def test_search_weekly_recurrence_matches_next_monday(self, session, driver_auth, created_rides):
        # Create a weekly recurring ride on Mondays only
        payload = {
            "from_city": "Dakar", "to_city": "Saint-Louis",
            "date": "2026-01-05",  # base date (a Monday)
            "time": "09:00",
            "seats_total": 2, "price_xof": 5000,
            "distance_type": "long",
            "recurrence": "weekly",
            "recurrence_days": ["mon"],
            "vehicle_model": "Test-Weekly",
        }
        r = session.post(f"{API}/rides", json=payload, headers=_auth_header(driver_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        weekly_id = r.json()["id"]
        created_rides.append(weekly_id)

        # Find next Monday from today
        today = datetime.now(timezone.utc).date()
        # weekday(): Mon=0
        days_ahead = (0 - today.weekday()) % 7
        if days_ahead == 0:
            days_ahead = 7
        next_monday = (today + timedelta(days=days_ahead)).isoformat()

        r = session.get(f"{API}/rides", params={"date": next_monday, "to_city": "Saint-Louis"}, timeout=15)
        assert r.status_code == 200
        rides = r.json()
        assert any(rd["id"] == weekly_id for rd in rides), (
            f"Weekly Monday ride not returned for {next_monday}. Got: {[r['id'] for r in rides]}"
        )

    def test_search_weekly_ride_not_returned_on_wrong_weekday(self, session, created_rides):
        # Pick a Wednesday relative to today; weekly ride is Monday-only
        today = datetime.now(timezone.utc).date()
        days_ahead = (2 - today.weekday()) % 7
        if days_ahead == 0:
            days_ahead = 7
        next_wed = (today + timedelta(days=days_ahead)).isoformat()
        r = session.get(f"{API}/rides", params={"date": next_wed, "to_city": "Saint-Louis"}, timeout=15)
        assert r.status_code == 200
        # None of the returned rides should be our Monday-only recurring ride
        # (unless base ISO date matches — extremely unlikely)
        weekly_id = created_rides[-1]
        for rd in r.json():
            if rd["id"] == weekly_id:
                assert rd["date"].startswith(next_wed), "Monday-only weekly ride returned on non-Monday query"


# ---------- GET /rides/{id} ----------
class TestGetRide:
    def test_404_unknown(self, session):
        r = session.get(f"{API}/rides/does-not-exist-xyz", timeout=15)
        assert r.status_code == 404

    def test_get_ok(self, session, created_rides):
        r = session.get(f"{API}/rides/{created_rides[0]}", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == created_rides[0]
        assert "_id" not in body
        assert body["seats_total"] > 0


# ---------- GET /rides/mine ----------
class TestMyRides:
    def test_requires_auth(self, session):
        r = session.get(f"{API}/rides/mine", timeout=15)
        assert r.status_code in (401, 403)

    def test_only_current_user_rides(self, session, driver_auth, created_rides):
        r = session.get(f"{API}/rides/mine", headers=_auth_header(driver_auth["token"]), timeout=15)
        assert r.status_code == 200
        rides = r.json()
        assert isinstance(rides, list)
        assert len(rides) >= len(created_rides)
        for rd in rides:
            assert rd["driver_id"] == driver_auth["user"]["id"]

    def test_admin_does_not_see_driver_rides(self, session, admin_auth, driver_auth, created_rides):
        r = session.get(f"{API}/rides/mine", headers=_auth_header(admin_auth["token"]), timeout=15)
        assert r.status_code == 200
        for rd in r.json():
            assert rd["driver_id"] != driver_auth["user"]["id"]


# ---------- PATCH /rides/{id} ----------
class TestUpdateRide:
    def test_non_driver_forbidden(self, session, admin_auth, created_rides):
        r = session.patch(
            f"{API}/rides/{created_rides[0]}",
            json={"notes": "hacked"},
            headers=_auth_header(admin_auth["token"]),
            timeout=15,
        )
        assert r.status_code == 403

    def test_driver_can_update_seats_total(self, session, driver_auth, created_rides):
        rid = created_rides[0]
        # Bump seats_total from 3 -> 5, no bookings yet so seats_available should become 5
        r = session.patch(
            f"{API}/rides/{rid}",
            json={"seats_total": 5},
            headers=_auth_header(driver_auth["token"]),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # Verify persisted
        g = session.get(f"{API}/rides/{rid}", timeout=15)
        assert g.status_code == 200
        body = g.json()
        assert body["seats_total"] == 5
        assert body["seats_available"] == 5

    def test_cancel_status_notifies_passengers(self, session, driver_auth, admin_auth):
        # Create an additional ride, book it as admin, then cancel as driver
        payload = {
            "from_city": "Dakar", "to_city": "Mbour",
            "date": "2026-08-01", "time": "07:00",
            "seats_total": 2, "price_xof": 3000,
            "distance_type": "long",
        }
        r = session.post(f"{API}/rides", json=payload, headers=_auth_header(driver_auth["token"]), timeout=15)
        assert r.status_code == 200
        rid = r.json()["id"]

        # book 1 seat as admin (any non-driver user works)
        r = session.post(
            f"{API}/rides/{rid}/book",
            json={"seats": 1, "note": "for cancel test"},
            headers=_auth_header(admin_auth["token"]),
            timeout=15,
        )
        assert r.status_code == 200, r.text

        # cancel by driver
        r = session.patch(
            f"{API}/rides/{rid}",
            json={"status": "cancelled"},
            headers=_auth_header(driver_auth["token"]),
            timeout=15,
        )
        assert r.status_code == 200

        # confirm status persisted
        g = session.get(f"{API}/rides/{rid}", timeout=15)
        assert g.status_code == 200
        assert g.json()["status"] == "cancelled"

        # admin (passenger) should now have a "ride_cancelled" notification
        n = session.get(f"{API}/notifications", headers=_auth_header(admin_auth["token"]), timeout=15)
        assert n.status_code == 200
        types = [x.get("type") for x in n.json()]
        assert "ride_cancelled" in types, f"Notification not created; got types={types}"


# ---------- DELETE /rides/{id} ----------
class TestDeleteRide:
    def test_delete_soft_cancels(self, session, driver_auth, created_rides):
        # Create a new ride to delete
        payload = {
            "from_city": "Dakar", "to_city": "Kaolack",
            "date": "2026-09-10", "time": "06:00",
            "seats_total": 2, "price_xof": 4000,
        }
        r = session.post(f"{API}/rides", json=payload, headers=_auth_header(driver_auth["token"]), timeout=15)
        assert r.status_code == 200
        rid = r.json()["id"]
        created_rides.append(rid)

        r = session.delete(f"{API}/rides/{rid}", headers=_auth_header(driver_auth["token"]), timeout=15)
        assert r.status_code == 200

        g = session.get(f"{API}/rides/{rid}", timeout=15)
        assert g.status_code == 200
        assert g.json()["status"] == "cancelled"

    def test_delete_forbidden_for_non_driver(self, session, admin_auth, created_rides):
        r = session.delete(
            f"{API}/rides/{created_rides[0]}",
            headers=_auth_header(admin_auth["token"]),
            timeout=15,
        )
        assert r.status_code == 403


# ---------- POST /rides/{id}/book ----------
class TestBookRide:
    @pytest.fixture(scope="class")
    def bookable_ride_id(self, session, driver_auth):
        payload = {
            "from_city": "Dakar", "to_city": "Louga",
            "date": "2026-10-05", "time": "09:00",
            "seats_total": 2, "price_xof": 6000,
            "distance_type": "long",
        }
        r = session.post(f"{API}/rides", json=payload, headers=_auth_header(driver_auth["token"]), timeout=15)
        assert r.status_code == 200
        return r.json()["id"]

    def test_driver_cannot_book_own_ride(self, session, driver_auth, bookable_ride_id):
        r = session.post(
            f"{API}/rides/{bookable_ride_id}/book",
            json={"seats": 1},
            headers=_auth_header(driver_auth["token"]),
            timeout=15,
        )
        assert r.status_code == 400

    def test_passenger_books_successfully(self, session, admin_auth, bookable_ride_id):
        before = session.get(f"{API}/rides/{bookable_ride_id}", timeout=15).json()
        avail_before = before["seats_available"]

        r = session.post(
            f"{API}/rides/{bookable_ride_id}/book",
            json={"seats": 1},
            headers=_auth_header(admin_auth["token"]),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        booking = r.json()
        assert booking["ride_id"] == bookable_ride_id
        assert booking["seats"] == 1
        assert booking["status"] == "confirmed"
        assert booking["price_xof"] == before["price_xof"] * 1
        assert "_id" not in booking

        after = session.get(f"{API}/rides/{bookable_ride_id}", timeout=15).json()
        assert after["seats_available"] == avail_before - 1

        # stash booking id for later tests
        pytest.LAST_BOOKING_ID = booking["id"]

    def test_book_exceeds_available_seats(self, session, admin_auth, bookable_ride_id):
        ride = session.get(f"{API}/rides/{bookable_ride_id}", timeout=15).json()
        r = session.post(
            f"{API}/rides/{bookable_ride_id}/book",
            json={"seats": ride["seats_available"] + 5},
            headers=_auth_header(admin_auth["token"]),
            timeout=15,
        )
        assert r.status_code == 400

    def test_book_unknown_ride_returns_404(self, session, admin_auth):
        r = session.post(
            f"{API}/rides/does-not-exist/book",
            json={"seats": 1},
            headers=_auth_header(admin_auth["token"]),
            timeout=15,
        )
        assert r.status_code == 404

    def test_book_cancelled_ride_returns_404(self, session, driver_auth, admin_auth):
        payload = {
            "from_city": "Dakar", "to_city": "Ziguinchor",
            "date": "2026-11-01", "time": "05:00",
            "seats_total": 2, "price_xof": 12000,
        }
        r = session.post(f"{API}/rides", json=payload, headers=_auth_header(driver_auth["token"]), timeout=15)
        rid = r.json()["id"]
        # cancel via delete
        session.delete(f"{API}/rides/{rid}", headers=_auth_header(driver_auth["token"]), timeout=15)
        r = session.post(
            f"{API}/rides/{rid}/book",
            json={"seats": 1},
            headers=_auth_header(admin_auth["token"]),
            timeout=15,
        )
        assert r.status_code == 404


# ---------- GET /rides/bookings/mine ----------
class TestBookingsMine:
    def test_bookings_mine_contains_ride_object(self, session, admin_auth):
        r = session.get(f"{API}/rides/bookings/mine", headers=_auth_header(admin_auth["token"]), timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        # Look for a confirmed booking with a ride payload
        found = False
        for b in items:
            if b.get("ride"):
                ride = b["ride"]
                for k in ("from_city", "to_city", "date", "time", "driver_name"):
                    assert k in ride, f"Missing {k} in bookings/mine.ride"
                found = True
                break
        assert found, "No booking with a .ride subdocument found"


# ---------- GET /rides/bookings/received ----------
class TestBookingsReceived:
    def test_driver_sees_bookings_on_own_rides(self, session, driver_auth):
        r = session.get(f"{API}/rides/bookings/received", headers=_auth_header(driver_auth["token"]), timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # All returned bookings must reference rides owned by the driver
        my_rides = session.get(
            f"{API}/rides/mine", headers=_auth_header(driver_auth["token"]), timeout=15
        ).json()
        my_ids = {r["id"] for r in my_rides}
        for b in items:
            assert b["ride_id"] in my_ids

    def test_non_driver_gets_empty_or_only_own_rides(self, session, admin_auth):
        r = session.get(f"{API}/rides/bookings/received", headers=_auth_header(admin_auth["token"]), timeout=15)
        assert r.status_code == 200
        # Admin has no rides published, so should be empty list
        for b in r.json():
            # if any item present, ride must belong to admin
            my = session.get(f"{API}/rides/mine", headers=_auth_header(admin_auth["token"]), timeout=15).json()
            assert b["ride_id"] in {r["id"] for r in my}


# ---------- PATCH /rides/bookings/{bid} ----------
class TestUpdateBooking:
    def test_passenger_cancels_and_seats_restored(self, session, driver_auth, admin_auth):
        # Create ride + book as admin
        payload = {
            "from_city": "Dakar", "to_city": "Tambacounda",
            "date": "2026-12-01", "time": "05:30",
            "seats_total": 3, "price_xof": 8000,
        }
        r = session.post(f"{API}/rides", json=payload, headers=_auth_header(driver_auth["token"]), timeout=15)
        rid = r.json()["id"]

        r = session.post(
            f"{API}/rides/{rid}/book",
            json={"seats": 2},
            headers=_auth_header(admin_auth["token"]),
            timeout=15,
        )
        assert r.status_code == 200
        bid = r.json()["id"]

        # Confirm seats_available dropped by 2 (3 - 2 = 1)
        assert session.get(f"{API}/rides/{rid}", timeout=15).json()["seats_available"] == 1

        # Cancel as passenger
        r = session.patch(
            f"{API}/rides/bookings/{bid}",
            json={"status": "cancelled"},
            headers=_auth_header(admin_auth["token"]),
            timeout=15,
        )
        assert r.status_code == 200

        # Seats should be restored to 3
        after = session.get(f"{API}/rides/{rid}", timeout=15).json()
        assert after["seats_available"] == 3, f"seats not restored: {after['seats_available']}"

    def test_driver_can_cancel_booking(self, session, driver_auth, admin_auth):
        payload = {
            "from_city": "Dakar", "to_city": "Diourbel",
            "date": "2026-12-15", "time": "06:00",
            "seats_total": 2, "price_xof": 5000,
        }
        r = session.post(f"{API}/rides", json=payload, headers=_auth_header(driver_auth["token"]), timeout=15)
        rid = r.json()["id"]

        r = session.post(
            f"{API}/rides/{rid}/book",
            json={"seats": 1},
            headers=_auth_header(admin_auth["token"]),
            timeout=15,
        )
        bid = r.json()["id"]

        r = session.patch(
            f"{API}/rides/bookings/{bid}",
            json={"status": "cancelled"},
            headers=_auth_header(driver_auth["token"]),
            timeout=15,
        )
        assert r.status_code == 200

        # seats restored
        assert session.get(f"{API}/rides/{rid}", timeout=15).json()["seats_available"] == 2

    def test_third_party_cannot_cancel(self, session, driver_auth, admin_auth):
        # We need a third user. Register a fresh one.
        import uuid as _uuid
        email = f"tester_{_uuid.uuid4().hex[:8]}@jokoo.sn"
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "T", "role": "client"}, timeout=15)
        assert r.status_code == 200, r.text
        third_token = r.json()["token"]

        # Create ride + booking (driver + admin)
        payload = {"from_city": "Dakar", "to_city": "Fatick", "date": "2026-12-20", "time": "07:00", "seats_total": 2, "price_xof": 3000}
        r = session.post(f"{API}/rides", json=payload, headers=_auth_header(driver_auth["token"]), timeout=15)
        rid = r.json()["id"]
        r = session.post(f"{API}/rides/{rid}/book", json={"seats": 1}, headers=_auth_header(admin_auth["token"]), timeout=15)
        bid = r.json()["id"]

        r = session.patch(
            f"{API}/rides/bookings/{bid}",
            json={"status": "cancelled"},
            headers=_auth_header(third_token),
            timeout=15,
        )
        assert r.status_code == 403
