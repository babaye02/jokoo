"""
Backend tests for Marketplace Covoiturage Bidirectionnelle v2 (Phase 1+2)
Covers: /api/mobility/* (cities, requests CRUD, offers flow, stats, matching).
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://jokoo-mobile-dev.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CLIENT_EMAIL = "client@jokoo.sn"
CLIENT_PW = "Passw0rd!"
PRO_EMAIL = "pro@jokoo.sn"
PRO_PW = "Passw0rd!"


# ─── Auth helpers ───────────────────────────────────────────────────

def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def client_token():
    return _login(CLIENT_EMAIL, CLIENT_PW)


@pytest.fixture(scope="module")
def pro_token():
    return _login(PRO_EMAIL, PRO_PW)


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ─── City resolution & aliasing ──────────────────────────────────────

class TestCities:
    def test_list_cities(self):
        r = requests.get(f"{API}/mobility/cities", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "cities" in data
        assert isinstance(data["cities"], list)
        assert len(data["cities"]) >= 30  # 54 canonical cities expected
        # Each has canonical, label, aliases
        c0 = data["cities"][0]
        assert "canonical" in c0 and "label" in c0 and "aliases" in c0

    @pytest.mark.parametrize("q,expected_canon", [
        ("Plateau", "dakar"),
        ("Mermoz", "dakar"),
        ("Almadies", "dakar"),
        ("Saint-Louis", "saint-louis"),
        ("Thiès", "thies"),
    ])
    def test_resolve_city(self, q, expected_canon):
        r = requests.get(f"{API}/mobility/cities/resolve", params={"q": q}, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["canonical"] == expected_canon, f"For {q}: expected {expected_canon}, got {data}"
        assert data["label"]  # has a display label


# ─── Ride Requests CRUD ──────────────────────────────────────────────

class TestRideRequestsCRUD:
    created_id = None

    def test_create_request(self, client_token):
        body = {
            "from_city": "Plateau",
            "to_city": "Thiès",
            "date": "2026-08-15",
            "time_from": "08:00",
            "seats": 2,
            "budget_xof": 3000,
        }
        r = requests.post(f"{API}/mobility/requests", headers=_h(client_token), json=body, timeout=15)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["from_city_norm"] == "dakar", f"Expected dakar, got {doc.get('from_city_norm')}"
        assert doc["to_city_norm"] == "thies"
        assert doc["status"] == "open"
        assert doc.get("expires_at")
        assert doc.get("id")
        TestRideRequestsCRUD.created_id = doc["id"]

    def test_list_requests_public(self):
        r = requests.get(f"{API}/mobility/requests", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_mine_requests(self, client_token):
        r = requests.get(f"{API}/mobility/requests/mine", headers=_h(client_token), timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        assert any(x["id"] == TestRideRequestsCRUD.created_id for x in arr)

    def test_get_request_with_offers(self, client_token):
        rid = TestRideRequestsCRUD.created_id
        r = requests.get(f"{API}/mobility/requests/{rid}", timeout=15)
        assert r.status_code == 200
        doc = r.json()
        assert "offers" in doc and isinstance(doc["offers"], list)

    def test_patch_request(self, client_token):
        rid = TestRideRequestsCRUD.created_id
        r = requests.patch(f"{API}/mobility/requests/{rid}", headers=_h(client_token),
                           json={"seats": 3, "notes": "updated"}, timeout=15)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["seats"] == 3
        assert doc["notes"] == "updated"

    def test_republish_request(self, client_token):
        rid = TestRideRequestsCRUD.created_id
        r = requests.post(f"{API}/mobility/requests/{rid}/republish", headers=_h(client_token), timeout=15)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "open"
        assert doc.get("expires_at")

    def test_delete_request(self, client_token):
        rid = TestRideRequestsCRUD.created_id
        r = requests.delete(f"{API}/mobility/requests/{rid}", headers=_h(client_token), timeout=15)
        assert r.status_code == 200
        # verify gone
        r2 = requests.get(f"{API}/mobility/requests/{rid}", timeout=10)
        assert r2.status_code == 404


# ─── Ride Offers full flow ───────────────────────────────────────────

class TestRideOffersFlow:
    request_id = None
    offer_id = None

    def test_setup_create_request(self, client_token):
        body = {
            "from_city": "Almadies",
            "to_city": "Saint-Louis",
            "date": "2026-08-25",
            "time_from": "08:00",
            "seats": 1,
            "budget_xof": 8000,
        }
        r = requests.post(f"{API}/mobility/requests", headers=_h(client_token), json=body, timeout=15)
        assert r.status_code == 200, r.text
        TestRideOffersFlow.request_id = r.json()["id"]

    def test_pro_create_offer(self, pro_token):
        rid = TestRideOffersFlow.request_id
        body = {
            "price_xof": 7500,
            "message": "OK",
            "from_city": "Dakar",
            "to_city": "Saint-Louis",
            "date": "2026-08-25",
            "time": "08:30",
            "seats_available": 3,
            "vehicle_model": "Toyota",
        }
        r = requests.post(f"{API}/mobility/requests/{rid}/offers", headers=_h(pro_token), json=body, timeout=15)
        assert r.status_code == 200, r.text
        offer = r.json()
        assert offer["status"] == "pending"
        assert offer["price_xof"] == 7500
        TestRideOffersFlow.offer_id = offer["id"]

    def test_request_marked_matched(self, client_token):
        rid = TestRideOffersFlow.request_id
        r = requests.get(f"{API}/mobility/requests/{rid}", timeout=10)
        doc = r.json()
        assert doc["offers_count"] == 1, f"Expected offers_count=1, got {doc.get('offers_count')}"
        assert doc["status"] == "matched"

    def test_offers_sent_driver(self, pro_token):
        r = requests.get(f"{API}/mobility/offers/sent", headers=_h(pro_token), timeout=10)
        assert r.status_code == 200
        arr = r.json()
        assert any(o["id"] == TestRideOffersFlow.offer_id for o in arr)

    def test_offers_received_passenger(self, client_token):
        r = requests.get(f"{API}/mobility/offers/received", headers=_h(client_token), timeout=10)
        assert r.status_code == 200
        arr = r.json()
        assert any(o["id"] == TestRideOffersFlow.offer_id for o in arr)

    def test_duplicate_offer_returns_existing(self, pro_token):
        """Same driver posting another pending offer on same request → returns cached, not duplicate."""
        rid = TestRideOffersFlow.request_id
        body = {
            "price_xof": 9999, "message": "dup", "from_city": "Dakar", "to_city": "Saint-Louis",
            "date": "2026-08-25", "time": "09:00", "seats_available": 2, "vehicle_model": "Test",
        }
        r = requests.post(f"{API}/mobility/requests/{rid}/offers", headers=_h(pro_token), json=body, timeout=15)
        assert r.status_code == 200, r.text
        offer = r.json()
        assert offer["id"] == TestRideOffersFlow.offer_id, "Should return existing pending offer (idempotent)"
        # price should NOT be updated
        assert offer["price_xof"] == 7500

    def test_own_request_forbidden(self, client_token):
        """Passenger cannot propose to own request."""
        rid = TestRideOffersFlow.request_id
        body = {
            "price_xof": 5000, "from_city": "Dakar", "to_city": "Saint-Louis",
            "date": "2026-08-25", "time": "09:00", "seats_available": 1, "vehicle_model": "X",
        }
        r = requests.post(f"{API}/mobility/requests/{rid}/offers", headers=_h(client_token), json=body, timeout=15)
        assert r.status_code == 400
        assert "own request" in r.text.lower()

    def test_passenger_cannot_withdraw(self, client_token):
        """Passenger cannot withdraw driver's offer."""
        oid = TestRideOffersFlow.offer_id
        r = requests.post(f"{API}/mobility/offers/{oid}/withdraw", headers=_h(client_token), timeout=10)
        assert r.status_code == 400

    def test_accept_offer(self, client_token):
        oid = TestRideOffersFlow.offer_id
        r = requests.post(f"{API}/mobility/offers/{oid}/decision", headers=_h(client_token),
                          json={"action": "accept"}, timeout=15)
        assert r.status_code == 200, r.text
        offer = r.json()
        assert offer["status"] == "accepted"
        # Request should be booked
        rid = TestRideOffersFlow.request_id
        r2 = requests.get(f"{API}/mobility/requests/{rid}", timeout=10)
        rd = r2.json()
        assert rd["status"] == "booked"
        assert rd["accepted_offer_id"] == oid

    def test_accept_again_fails(self, client_token):
        oid = TestRideOffersFlow.offer_id
        r = requests.post(f"{API}/mobility/offers/{oid}/decision", headers=_h(client_token),
                          json={"action": "accept"}, timeout=10)
        assert r.status_code == 400
        assert "already" in r.text.lower()


class TestWithdraw:
    def test_withdraw_flow(self, client_token, pro_token):
        # Create fresh request
        body = {
            "from_city": "Dakar", "to_city": "Mbour", "date": "2026-09-01",
            "time_from": "10:00", "seats": 1, "budget_xof": 3000,
        }
        r = requests.post(f"{API}/mobility/requests", headers=_h(client_token), json=body, timeout=15)
        assert r.status_code == 200
        rid = r.json()["id"]

        # Create offer as pro
        offer_body = {
            "price_xof": 2500, "from_city": "Dakar", "to_city": "Mbour",
            "date": "2026-09-01", "time": "10:15", "seats_available": 2, "vehicle_model": "Kia",
        }
        r2 = requests.post(f"{API}/mobility/requests/{rid}/offers", headers=_h(pro_token), json=offer_body, timeout=15)
        assert r2.status_code == 200, r2.text
        oid = r2.json()["id"]

        # Withdraw
        r3 = requests.post(f"{API}/mobility/offers/{oid}/withdraw", headers=_h(pro_token), timeout=10)
        assert r3.status_code == 200, r3.text
        assert r3.json()["status"] == "withdrawn"

        # Cleanup
        requests.delete(f"{API}/mobility/requests/{rid}", headers=_h(client_token), timeout=10)


# ─── Stats ───────────────────────────────────────────────────────────

class TestStats:
    def test_stats_shape(self):
        r = requests.get(f"{API}/mobility/stats", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ("requests_open", "requests_last_24h", "rides_active",
                    "offers_pending", "bookings_last_7d", "hot_routes"):
            assert key in data, f"Missing key {key} in stats"
        assert isinstance(data["hot_routes"], list)


# ─── Matching integration with /api/rides ────────────────────────────

class TestMatchingIntegration:
    def test_ride_normalization_and_match(self, client_token, pro_token):
        # Create open passenger request Dakar→Thiès
        body = {
            "from_city": "Plateau", "to_city": "Thiès", "date": "2026-08-15",
            "time_from": "09:00", "seats": 1, "budget_xof": 3000,
        }
        r = requests.post(f"{API}/mobility/requests", headers=_h(client_token), json=body, timeout=15)
        assert r.status_code == 200
        rid = r.json()["id"]

        # Create driver ride Dakar→Thiès
        ride_body = {
            "from_city": "Dakar", "to_city": "Thiès", "date": "2026-08-15",
            "time": "09:00", "seats_total": 3, "seats_available": 3, "price_xof": 2500,
            "vehicle_model": "Renault",
        }
        r2 = requests.post(f"{API}/rides", headers=_h(pro_token), json=ride_body, timeout=15)
        # Accept 200 or 201
        assert r2.status_code in (200, 201), f"POST /api/rides failed: {r2.status_code} {r2.text}"
        ride = r2.json()
        # Verify normalized fields are present
        assert ride.get("from_city_norm") == "dakar", f"ride.from_city_norm={ride.get('from_city_norm')}"
        assert ride.get("to_city_norm") == "thies", f"ride.to_city_norm={ride.get('to_city_norm')}"

        # Cleanup
        requests.delete(f"{API}/mobility/requests/{rid}", headers=_h(client_token), timeout=10)
