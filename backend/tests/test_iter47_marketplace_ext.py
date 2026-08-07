"""
Backend tests for Marketplace Covoiturage v2 — EXTENSION (Phase 2 EXT)
Focus: auto-booking on accept, losing offers auto-close, new notifications.

Points covered:
- decide_offer(accept) auto-creates ride_bookings + closes other pending offers
- Response shape { offer, booking, losing_offers_count }
- ride_requests transitions to status=booked with accepted_offer_id + booking_id
- Losing offers moved to status=withdrawn
- Notifications inserted: ride_offer_accepted, ride_offer_closed, ride_booking_created
- Double accept protection (HTTP 400 "Offer already decided")
- Republish restores status=open
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

# Mongo (used ONLY for read-side verification of DB state written by API)
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]

CLIENT_EMAIL = "client@jokoo.sn"
CLIENT_PW = "Passw0rd!"
PRO_EMAIL = "pro@jokoo.sn"
PRO_PW = "Passw0rd!"
ADMIN_EMAIL = "admin@jokoo.sn"
ADMIN_PW = "Admin1234!"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    uid = (data.get("user") or {}).get("id") or data.get("user_id")
    assert token
    return token, uid


@pytest.fixture(scope="module")
def client_auth():
    return _login(CLIENT_EMAIL, CLIENT_PW)


@pytest.fixture(scope="module")
def pro_auth():
    return _login(PRO_EMAIL, PRO_PW)


@pytest.fixture(scope="module")
def admin_auth():
    return _login(ADMIN_EMAIL, ADMIN_PW)


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ─── Extension: auto-booking, losing offers, notifs ─────────────────────

class TestAutoBookingExtension:
    request_id = None
    accepted_offer_id = None
    losing_offer_id = None
    booking_id = None
    accepted_driver_id = None
    losing_driver_id = None
    passenger_id = None

    def test_setup_request(self, client_auth):
        token, uid = client_auth
        TestAutoBookingExtension.passenger_id = uid
        body = {
            "from_city": "Plateau",
            "to_city": "Mbour",
            "date": "2026-12-15",
            "time_from": "09:00",
            "seats": 1,
            "budget_xof": 6000,
        }
        r = requests.post(f"{API}/mobility/requests", headers=_h(token), json=body, timeout=15)
        assert r.status_code == 200, r.text
        TestAutoBookingExtension.request_id = r.json()["id"]

    def test_offer_1_from_pro(self, pro_auth):
        token, uid = pro_auth
        TestAutoBookingExtension.accepted_driver_id = uid
        rid = TestAutoBookingExtension.request_id
        body = {
            "price_xof": 5000, "message": "Direct offer",
            "from_city": "Dakar", "to_city": "Mbour", "date": "2026-12-15",
            "time": "09:00", "seats_available": 3, "vehicle_model": "Toyota",
        }
        r = requests.post(f"{API}/mobility/requests/{rid}/offers", headers=_h(token), json=body, timeout=15)
        assert r.status_code == 200, r.text
        TestAutoBookingExtension.accepted_offer_id = r.json()["id"]

    def test_offer_2_from_admin(self, admin_auth):
        token, uid = admin_auth
        TestAutoBookingExtension.losing_driver_id = uid
        rid = TestAutoBookingExtension.request_id
        body = {
            "price_xof": 5800, "message": "Second offer",
            "from_city": "Dakar", "to_city": "Mbour", "date": "2026-12-15",
            "time": "09:15", "seats_available": 2, "vehicle_model": "Kia",
        }
        r = requests.post(f"{API}/mobility/requests/{rid}/offers", headers=_h(token), json=body, timeout=15)
        assert r.status_code == 200, r.text
        TestAutoBookingExtension.losing_offer_id = r.json()["id"]

    def test_accept_creates_booking_and_closes_losers(self, client_auth):
        token, _ = client_auth
        oid = TestAutoBookingExtension.accepted_offer_id
        r = requests.post(
            f"{API}/mobility/offers/{oid}/decision",
            headers=_h(token), json={"action": "accept"}, timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()

        # 1) Response shape
        assert "offer" in data, f"Missing 'offer' in response: {data}"
        assert "booking" in data, f"Missing 'booking' in response: {data}"
        assert "losing_offers_count" in data, f"Missing 'losing_offers_count' in response: {data}"

        offer = data["offer"]
        booking = data["booking"]
        assert offer["status"] == "accepted"
        assert booking is not None, "Booking must be created on accept"
        assert booking.get("price_xof") == 5000, f"Booking price should equal offer price (seats=1). Got: {booking}"
        assert booking.get("source") == "rides_v2_marketplace"
        assert booking.get("request_id") == TestAutoBookingExtension.request_id
        assert booking.get("offer_id") == TestAutoBookingExtension.accepted_offer_id
        assert booking.get("driver_id") == TestAutoBookingExtension.accepted_driver_id
        assert data["losing_offers_count"] == 1, f"Expected 1 losing offer, got {data['losing_offers_count']}"
        TestAutoBookingExtension.booking_id = booking["id"]

    def test_request_transitioned_to_booked(self, client_auth):
        token, _ = client_auth
        rid = TestAutoBookingExtension.request_id
        r = requests.get(f"{API}/mobility/requests/{rid}", headers=_h(token), timeout=10)
        assert r.status_code == 200
        doc = r.json()
        assert doc["status"] == "booked", f"Expected status=booked got {doc.get('status')}"
        assert doc.get("accepted_offer_id") == TestAutoBookingExtension.accepted_offer_id
        assert doc.get("booking_id") == TestAutoBookingExtension.booking_id

    def test_losing_offer_is_withdrawn(self, client_auth):
        token, _ = client_auth
        # Fetch the losing offer via listing (owner passenger can see all offers on their request)
        rid = TestAutoBookingExtension.request_id
        r = requests.get(f"{API}/mobility/requests/{rid}", headers=_h(token), timeout=10)
        assert r.status_code == 200
        offers = r.json().get("offers", [])
        losing = next((o for o in offers if o["id"] == TestAutoBookingExtension.losing_offer_id), None)
        assert losing is not None, f"Losing offer not visible on request. offers={offers}"
        assert losing["status"] == "withdrawn", f"Losing offer should be withdrawn, got: {losing['status']}"

    def test_booking_persisted_in_db(self):
        """Verify booking actually landed in db.ride_bookings."""
        bid = TestAutoBookingExtension.booking_id
        doc = _db.ride_bookings.find_one({"id": bid}, {"_id": 0})
        assert doc is not None, f"Booking {bid} not found in db.ride_bookings"
        assert doc["price_xof"] == 5000
        assert doc["source"] == "rides_v2_marketplace"
        assert doc["request_id"] == TestAutoBookingExtension.request_id
        assert doc["offer_id"] == TestAutoBookingExtension.accepted_offer_id
        assert doc["driver_id"] == TestAutoBookingExtension.accepted_driver_id
        assert doc["status"] == "confirmed"

    def test_notif_offer_accepted_for_driver(self):
        """db.notifications should have kind=ride_offer_accepted for accepted driver."""
        # Give the async in-app insert a moment
        time.sleep(0.5)
        cur = _db.notifications.find({
            "user_id": TestAutoBookingExtension.accepted_driver_id,
            "kind": "ride_offer_accepted",
            "meta.offer_id": TestAutoBookingExtension.accepted_offer_id,
        }, {"_id": 0})
        docs = list(cur)
        assert len(docs) >= 1, f"No ride_offer_accepted notif for driver {TestAutoBookingExtension.accepted_driver_id}"

    def test_notif_offer_closed_for_losing_driver(self):
        cur = _db.notifications.find({
            "user_id": TestAutoBookingExtension.losing_driver_id,
            "kind": "ride_offer_closed",
            "meta.offer_id": TestAutoBookingExtension.losing_offer_id,
        }, {"_id": 0})
        docs = list(cur)
        assert len(docs) >= 1, f"No ride_offer_closed notif for losing driver {TestAutoBookingExtension.losing_driver_id}"

    def test_notif_booking_created_for_passenger(self):
        cur = _db.notifications.find({
            "user_id": TestAutoBookingExtension.passenger_id,
            "kind": "ride_booking_created",
            "meta.booking_id": TestAutoBookingExtension.booking_id,
        }, {"_id": 0})
        docs = list(cur)
        assert len(docs) >= 1, f"No ride_booking_created notif for passenger {TestAutoBookingExtension.passenger_id}"

    def test_double_accept_protection(self, client_auth):
        token, _ = client_auth
        oid = TestAutoBookingExtension.accepted_offer_id
        r = requests.post(
            f"{API}/mobility/offers/{oid}/decision",
            headers=_h(token), json={"action": "accept"}, timeout=10,
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code} — {r.text}"
        assert "already" in r.text.lower(), r.text

    def test_accept_withdrawn_offer_also_fails(self, client_auth):
        """Idempotency: accepting the auto-closed losing offer must also 400."""
        token, _ = client_auth
        oid = TestAutoBookingExtension.losing_offer_id
        r = requests.post(
            f"{API}/mobility/offers/{oid}/decision",
            headers=_h(token), json={"action": "accept"}, timeout=10,
        )
        assert r.status_code == 400, f"Expected 400 on withdrawn offer, got {r.status_code} — {r.text}"
        assert "already" in r.text.lower(), r.text


# ─── Republish flow ─────────────────────────────────────────────────────

class TestRepublish:
    def test_republish_expired_request(self, client_auth):
        token, _ = client_auth
        # Create a request, force expire it via Mongo, then republish
        body = {
            "from_city": "Dakar", "to_city": "Thiès", "date": "2026-11-30",
            "time_from": "10:00", "seats": 1, "budget_xof": 4000,
        }
        r = requests.post(f"{API}/mobility/requests", headers=_h(token), json=body, timeout=15)
        assert r.status_code == 200
        rid = r.json()["id"]

        _db.ride_requests.update_one({"id": rid}, {"$set": {"status": "expired"}})
        r2 = requests.post(f"{API}/mobility/requests/{rid}/republish", headers=_h(token), timeout=10)
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "open"

        # Cleanup
        requests.delete(f"{API}/mobility/requests/{rid}", headers=_h(token), timeout=10)
