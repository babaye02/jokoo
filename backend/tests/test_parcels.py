"""
Iteration 3 — Backend tests for Mobility · Livraison longue distance (parcels)
Focus: /api/rides/{rid}/parcel + /api/parcels/*
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

DRIVER_EMAIL = "chauffeur@jokoo.sn"
DRIVER_PASSWORD = "Driver1234!"
CLIENT_EMAIL = "client@jokoo.sn"
CLIENT_PASSWORD = "Passw0rd!"
ADMIN_EMAIL = "admin@jokoo.sn"
ADMIN_PASSWORD = "Admin1234!"


# ---------- helpers ----------
def _login(session: requests.Session, email: str, password: str) -> dict:
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed {email}: {r.status_code} {r.text}"
    return r.json()


def _hdr(token: str) -> dict:
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
    return _login(session, DRIVER_EMAIL, DRIVER_PASSWORD)


@pytest.fixture(scope="session")
def client_auth(session, seed_ran):
    return _login(session, CLIENT_EMAIL, CLIENT_PASSWORD)


@pytest.fixture(scope="session")
def admin_auth(session, seed_ran):
    return _login(session, ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def third_party_auth(session, seed_ran):
    """Register a fresh independent user (not sender, not driver)."""
    email = f"TEST_third_{uuid.uuid4().hex[:8]}@jokoo.sn"
    body = {"email": email, "password": "Passw0rd!", "name": "Third Party Test",
            "role": "client", "phone": "+221770000000"}
    r = session.post(f"{API}/auth/register", json=body, timeout=15)
    assert r.status_code == 200, f"Register 3rd party failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def seed_long_rides(session, driver_auth):
    """Fetch the 3 seeded long-distance rides accepting parcels for the driver."""
    r = session.get(f"{API}/rides/mine", headers=_hdr(driver_auth["token"]), timeout=15)
    assert r.status_code == 200
    rides = r.json()
    longs = [x for x in rides if x.get("distance_type") == "long" and x.get("accepts_parcels")]
    assert len(longs) >= 2, f"Expected seeded long-distance parcel rides, got {len(longs)}"
    return longs


# ==========================================================
# 1. Ride creation with parcel fields
# ==========================================================
class TestRideCreationParcelFields:
    def test_create_long_ride_persists_all_parcel_fields(self, session, driver_auth):
        payload = {
            "from_city": "Dakar", "to_city": "Ziguinchor",
            "date": "2026-08-10", "time": "08:00",
            "seats_total": 3, "price_xof": 10000,
            "distance_type": "long",
            "accepts_parcels": True,
            "parcel_price_xof": 3000,
            "parcel_max_kg": 20,
            "parcel_payment_mode": "app_or_cash",
        }
        r = session.post(f"{API}/rides", json=payload, headers=_hdr(driver_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["accepts_parcels"] is True
        assert d["parcel_price_xof"] == 3000
        assert d["parcel_max_kg"] == 20
        assert d["parcel_payment_mode"] == "app_or_cash"

        # verify via GET /rides
        g = session.get(f"{API}/rides", params={"from_city": "Dakar", "to_city": "Ziguinchor"}, timeout=15)
        assert g.status_code == 200
        got = [x for x in g.json() if x["id"] == d["id"]]
        assert got and got[0]["parcel_price_xof"] == 3000

    def test_short_ride_silent_guard_forces_parcels_false(self, session, driver_auth):
        payload = {
            "from_city": "Dakar", "to_city": "Rufisque",
            "date": "2026-08-11", "time": "09:00",
            "seats_total": 3, "price_xof": 2500,
            "distance_type": "short",
            "accepts_parcels": True,
            "parcel_price_xof": 3000,
            "parcel_max_kg": 20,
            "parcel_payment_mode": "app_or_cash",
        }
        r = session.post(f"{API}/rides", json=payload, headers=_hdr(driver_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["distance_type"] == "short"
        assert d["accepts_parcels"] is False, "Silent guard must force accepts_parcels=false on short rides"


# ==========================================================
# 2. GET /rides?accepts_parcels=true filter
# ==========================================================
class TestParcelSearchFilter:
    def test_accepts_parcels_filter_returns_only_long_parcel_rides(self, session):
        r = session.get(f"{API}/rides", params={"accepts_parcels": "true"}, timeout=15)
        assert r.status_code == 200
        rides = r.json()
        assert isinstance(rides, list)
        assert len(rides) >= 1, "Expected at least one long-distance parcel ride from seed"
        for x in rides:
            assert x.get("accepts_parcels") is True, x
            assert x.get("distance_type") == "long", x


# ==========================================================
# 3. POST /rides/{rid}/parcel — happy path + failures
# ==========================================================
class TestCreateParcel:
    def test_happy_path_creates_pending_parcel_with_notification(self, session, client_auth, driver_auth, seed_long_rides):
        ride = seed_long_rides[0]
        body = {
            "pickup_address": "Plateau, imm.5", "dropoff_address": "Boucotte",
            "description": "Documents", "weight_kg": 3,
            "recipient_name": "Awa Diallo", "recipient_phone": "+221771234567",
            "photo": None, "payment_mode": "app",
        }
        r = session.post(f"{API}/rides/{ride['id']}/parcel", json=body,
                         headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["status"] == "pending"
        assert p["price_xof"] == ride["parcel_price_xof"]
        assert p["driver_id"] == ride["driver_id"]
        assert p["sender_id"] == client_auth["user"]["id"]
        assert p["paid"] is False
        assert p["ride_id"] == ride["id"]

        # verify notification created for driver
        n = session.get(f"{API}/notifications", headers=_hdr(driver_auth["token"]), timeout=15)
        assert n.status_code == 200
        notifs = n.json()
        matches = [x for x in notifs if x.get("type") == "parcel_request" and x.get("peer_id") == client_auth["user"]["id"]]
        assert matches, "Driver notification 'parcel_request' not found"

        # store for further tests
        pytest.parcel_app_id = p["id"]

    def test_unknown_ride_returns_404(self, session, client_auth):
        body = {
            "pickup_address": "Adr A", "dropoff_address": "Adr B",
            "description": "Test", "weight_kg": 2,
            "recipient_name": "Ana", "recipient_phone": "+221770000001",
            "payment_mode": "app",
        }
        r = session.post(f"{API}/rides/{uuid.uuid4()}/parcel", json=body,
                         headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 404, r.text

    def test_ride_not_accepting_parcels_returns_400(self, session, client_auth, driver_auth):
        # create a short ride via driver (silent guard → accepts_parcels=false)
        payload = {"from_city": "Dakar", "to_city": "Pikine", "date": "2026-08-12",
                   "time": "10:00", "seats_total": 3, "price_xof": 2000,
                   "distance_type": "short", "accepts_parcels": True}
        r = session.post(f"{API}/rides", json=payload,
                         headers=_hdr(driver_auth["token"]), timeout=15)
        assert r.status_code == 200
        rid_short = r.json()["id"]
        assert r.json()["accepts_parcels"] is False

        body = {"pickup_address": "Adr A", "dropoff_address": "Adr B", "description": "Test",
                "weight_kg": 1, "recipient_name": "Ana", "recipient_phone": "+221770000001",
                "payment_mode": "app"}
        r2 = session.post(f"{API}/rides/{rid_short}/parcel", json=body,
                          headers=_hdr(client_auth["token"]), timeout=15)
        assert r2.status_code == 400, r2.text
        assert "colis" in r2.text.lower() or "longue" in r2.text.lower()

    def test_driver_cannot_send_on_own_ride(self, session, driver_auth, seed_long_rides):
        ride = seed_long_rides[0]
        body = {"pickup_address": "Adr A", "dropoff_address": "Adr B", "description": "Test",
                "weight_kg": 2, "recipient_name": "Awa", "recipient_phone": "+221770000002",
                "payment_mode": "app"}
        r = session.post(f"{API}/rides/{ride['id']}/parcel", json=body,
                         headers=_hdr(driver_auth["token"]), timeout=15)
        assert r.status_code == 400, r.text

    def test_weight_exceeds_max_returns_400(self, session, client_auth, seed_long_rides):
        ride = seed_long_rides[0]  # parcel_max_kg=15 (seed)
        body = {"pickup_address": "Adr A", "dropoff_address": "Adr B", "description": "Heavy",
                "weight_kg": ride["parcel_max_kg"] + 1,
                "recipient_name": "Awa", "recipient_phone": "+221770000003",
                "payment_mode": "app"}
        r = session.post(f"{API}/rides/{ride['id']}/parcel", json=body,
                         headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 400, r.text
        assert "poids" in r.text.lower() or "kg" in r.text.lower()

    def test_payment_mode_cash_on_app_only_ride(self, session, driver_auth, client_auth):
        # create ride with parcel_payment_mode="app_only"
        payload = {
            "from_city": "Dakar", "to_city": "Saint-Louis",
            "date": "2026-08-13", "time": "07:00",
            "seats_total": 3, "price_xof": 9000,
            "distance_type": "long", "accepts_parcels": True,
            "parcel_price_xof": 2000, "parcel_max_kg": 10,
            "parcel_payment_mode": "app_only",
        }
        r = session.post(f"{API}/rides", json=payload,
                         headers=_hdr(driver_auth["token"]), timeout=15)
        assert r.status_code == 200
        rid = r.json()["id"]
        assert r.json()["parcel_payment_mode"] == "app_only"

        body = {"pickup_address": "Adr A", "dropoff_address": "Adr B", "description": "Test",
                "weight_kg": 2, "recipient_name": "Ana", "recipient_phone": "+221770000004",
                "payment_mode": "cash"}
        r2 = session.post(f"{API}/rides/{rid}/parcel", json=body,
                          headers=_hdr(client_auth["token"]), timeout=15)
        assert r2.status_code == 400, r2.text
        assert "app" in r2.text.lower()

    def test_payment_mode_app_on_cash_only_ride(self, session, driver_auth, client_auth):
        payload = {
            "from_city": "Dakar", "to_city": "Kaolack",
            "date": "2026-08-14", "time": "07:00",
            "seats_total": 3, "price_xof": 8000,
            "distance_type": "long", "accepts_parcels": True,
            "parcel_price_xof": 1500, "parcel_max_kg": 8,
            "parcel_payment_mode": "cash_only",
        }
        r = session.post(f"{API}/rides", json=payload,
                         headers=_hdr(driver_auth["token"]), timeout=15)
        assert r.status_code == 200
        rid = r.json()["id"]
        assert r.json()["parcel_payment_mode"] == "cash_only"

        body = {"pickup_address": "Adr A", "dropoff_address": "Adr B", "description": "Test",
                "weight_kg": 2, "recipient_name": "Ana", "recipient_phone": "+221770000005",
                "payment_mode": "app"}
        r2 = session.post(f"{API}/rides/{rid}/parcel", json=body,
                          headers=_hdr(client_auth["token"]), timeout=15)
        assert r2.status_code == 400, r2.text
        assert "espèce" in r2.text.lower() or "cash" in r2.text.lower() or "espèces" in r2.text.lower()


# ==========================================================
# 4. GET /parcels/mine, /parcels/received, /parcels/{pid}
# ==========================================================
class TestParcelListing:
    @pytest.fixture(scope="class")
    def listing_parcel(self, session, client_auth, seed_long_rides):
        """Create a dedicated parcel for listing/permission tests (worker-safe)."""
        ride = seed_long_rides[0]
        body = {
            "pickup_address": "Plateau, imm.7", "dropoff_address": "Zig centre",
            "description": "Listing tests", "weight_kg": 2,
            "recipient_name": "Fatou Listing", "recipient_phone": "+221771111111",
            "payment_mode": "app",
        }
        r = session.post(f"{API}/rides/{ride['id']}/parcel", json=body,
                         headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        return r.json()

    def test_mine_returns_only_sender_parcels(self, session, client_auth, listing_parcel):
        r = session.get(f"{API}/parcels/mine", headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1, "Expected at least the parcel created by fixture"
        for p in data:
            assert p["sender_id"] == client_auth["user"]["id"]

    def test_received_returns_only_driver_parcels(self, session, driver_auth, listing_parcel):
        r = session.get(f"{API}/parcels/received", headers=_hdr(driver_auth["token"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        for p in data:
            assert p["driver_id"] == driver_auth["user"]["id"]

    def test_get_by_id_sender_ok(self, session, client_auth, listing_parcel):
        pid = listing_parcel["id"]
        r = session.get(f"{API}/parcels/{pid}", headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == pid

    def test_get_by_id_driver_ok(self, session, driver_auth, listing_parcel):
        pid = listing_parcel["id"]
        r = session.get(f"{API}/parcels/{pid}", headers=_hdr(driver_auth["token"]), timeout=15)
        assert r.status_code == 200

    def test_get_by_id_third_party_forbidden(self, session, third_party_auth, listing_parcel):
        pid = listing_parcel["id"]
        r = session.get(f"{API}/parcels/{pid}", headers=_hdr(third_party_auth["token"]), timeout=15)
        assert r.status_code == 403, r.text

    def test_get_by_id_admin_ok(self, session, admin_auth, listing_parcel):
        pid = listing_parcel["id"]
        r = session.get(f"{API}/parcels/{pid}", headers=_hdr(admin_auth["token"]), timeout=15)
        assert r.status_code == 200


# ==========================================================
# 5. PATCH transitions — driver happy path with cash parcel (paid=True on delivered)
# ==========================================================
class TestParcelTransitionsDriver:
    @pytest.fixture(scope="class")
    def cash_parcel(self, session, client_auth, seed_long_rides):
        """Create a parcel with payment_mode='cash' (ride uses app_or_cash so it's allowed)."""
        ride = seed_long_rides[1] if len(seed_long_rides) > 1 else seed_long_rides[0]
        body = {
            "pickup_address": "Ouakam", "dropoff_address": "Zig centre",
            "description": "Colis cash", "weight_kg": 2,
            "recipient_name": "Fatou", "recipient_phone": "+221770000010",
            "payment_mode": "cash",
        }
        r = session.post(f"{API}/rides/{ride['id']}/parcel", json=body,
                         headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        return r.json()

    def test_accepted(self, session, driver_auth, cash_parcel):
        r = session.patch(f"{API}/parcels/{cash_parcel['id']}",
                          json={"status": "accepted"},
                          headers=_hdr(driver_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text

        # verify via GET
        g = session.get(f"{API}/parcels/{cash_parcel['id']}",
                        headers=_hdr(driver_auth["token"]), timeout=15)
        assert g.json()["status"] == "accepted"

    def test_picked_up(self, session, driver_auth, cash_parcel):
        r = session.patch(f"{API}/parcels/{cash_parcel['id']}",
                          json={"status": "picked_up"},
                          headers=_hdr(driver_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        g = session.get(f"{API}/parcels/{cash_parcel['id']}",
                        headers=_hdr(driver_auth["token"]), timeout=15)
        assert g.json()["status"] == "picked_up"

    def test_delivered_cash_sets_paid_true(self, session, driver_auth, client_auth, cash_parcel):
        r = session.patch(f"{API}/parcels/{cash_parcel['id']}",
                          json={"status": "delivered"},
                          headers=_hdr(driver_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        g = session.get(f"{API}/parcels/{cash_parcel['id']}",
                        headers=_hdr(driver_auth["token"]), timeout=15)
        d = g.json()
        assert d["status"] == "delivered"
        assert d["paid"] is True, "Cash parcel must be marked paid on delivery"

        # sender got a notification for the delivered status
        n = session.get(f"{API}/notifications", headers=_hdr(client_auth["token"]), timeout=15)
        assert n.status_code == 200
        assert any(x.get("type") == "parcel_update" for x in n.json())

    def test_terminal_state_guard(self, session, driver_auth, cash_parcel):
        r = session.patch(f"{API}/parcels/{cash_parcel['id']}",
                          json={"status": "picked_up"},
                          headers=_hdr(driver_auth["token"]), timeout=15)
        assert r.status_code == 400, r.text


# ==========================================================
# 6. PATCH — sender rules
# ==========================================================
class TestParcelTransitionsSender:
    @pytest.fixture(scope="class")
    def pending_parcel(self, session, client_auth, seed_long_rides):
        # use the 3rd seeded ride if available, otherwise reuse
        ride = seed_long_rides[2] if len(seed_long_rides) > 2 else seed_long_rides[0]
        body = {
            "pickup_address": "Almadies", "dropoff_address": "Zig",
            "description": "Test sender", "weight_kg": 1,
            "recipient_name": "Moussa", "recipient_phone": "+221770000020",
            "payment_mode": "app",
        }
        r = session.post(f"{API}/rides/{ride['id']}/parcel", json=body,
                         headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        return r.json()

    def test_sender_cannot_accept(self, session, client_auth, pending_parcel):
        r = session.patch(f"{API}/parcels/{pending_parcel['id']}",
                          json={"status": "accepted"},
                          headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 403, r.text

    def test_sender_can_cancel_pending(self, session, client_auth, pending_parcel):
        r = session.patch(f"{API}/parcels/{pending_parcel['id']}",
                          json={"status": "cancelled"},
                          headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        g = session.get(f"{API}/parcels/{pending_parcel['id']}",
                        headers=_hdr(client_auth["token"]), timeout=15)
        assert g.json()["status"] == "cancelled"


# ==========================================================
# 7. PATCH — rejection path
# ==========================================================
class TestParcelRejection:
    @pytest.fixture(scope="class")
    def rejected_parcel(self, session, client_auth, driver_auth, seed_long_rides):
        ride = seed_long_rides[0]
        body = {
            "pickup_address": "Adr A", "dropoff_address": "Adr B",
            "description": "To reject", "weight_kg": 2,
            "recipient_name": "Rej", "recipient_phone": "+221770000030",
            "payment_mode": "app",
        }
        r = session.post(f"{API}/rides/{ride['id']}/parcel", json=body,
                         headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 200
        p = r.json()
        r2 = session.patch(f"{API}/parcels/{p['id']}",
                           json={"status": "rejected"},
                           headers=_hdr(driver_auth["token"]), timeout=15)
        assert r2.status_code == 200, r2.text
        return p

    def test_rejected_status_set(self, session, driver_auth, rejected_parcel):
        g = session.get(f"{API}/parcels/{rejected_parcel['id']}",
                        headers=_hdr(driver_auth["token"]), timeout=15)
        assert g.json()["status"] == "rejected"

    def test_further_transitions_blocked(self, session, driver_auth, rejected_parcel):
        r = session.patch(f"{API}/parcels/{rejected_parcel['id']}",
                          json={"status": "accepted"},
                          headers=_hdr(driver_auth["token"]), timeout=15)
        assert r.status_code == 400, r.text
