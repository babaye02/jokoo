"""Jokoo backend API tests — exercises all critical endpoints via the public URL."""
import os
import uuid
import time
import pytest
import requests
from pathlib import Path

# load frontend env for the public base url
env_path = Path("/app/frontend/.env")
env_map = {}
for line in env_path.read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        env_map[k.strip()] = v.strip().strip('"').strip("'")

BASE_URL = env_map["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
CLIENT_EMAIL = "client@jokoo.sn"
PRO_EMAIL = "pro@jokoo.sn"
PASSWORD = "Passw0rd!"

_state = {}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login_or_register(session, email, name, role):
    r = session.post(f"{BASE_URL}/auth/login", json={"email": email, "password": PASSWORD})
    if r.status_code == 200:
        return r.json()
    r = session.post(f"{BASE_URL}/auth/register", json={
        "email": email, "password": PASSWORD, "name": name, "role": role,
        "phone": "+221770000000", "city": "Dakar",
    })
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()


# ---- health & seed ----
class TestHealthAndSeed:
    def test_root(self, session):
        r = session.get(f"{BASE_URL}/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_seed(self, session):
        r = session.post(f"{BASE_URL}/seed")
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["providers"] == 16

    def test_services_catalog(self, session):
        r = session.get(f"{BASE_URL}/services")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) == 12
        assert {"key", "label", "icon", "color"} <= set(data[0].keys())


# ---- auth ----
class TestAuth:
    def test_login_client(self, session):
        data = _login_or_register(session, CLIENT_EMAIL, "Client Demo", "client")
        assert "token" in data and "user" in data
        assert data["user"]["role"] == "client"
        _state["client_token"] = data["token"]
        _state["client_id"] = data["user"]["id"]

    def test_login_pro(self, session):
        data = _login_or_register(session, PRO_EMAIL, "Pro Demo", "prestataire")
        assert "token" in data and "user" in data
        assert data["user"]["role"] == "prestataire"
        _state["pro_token"] = data["token"]
        _state["pro_id"] = data["user"]["id"]

    def test_login_wrong_password(self, session):
        r = session.post(f"{BASE_URL}/auth/login", json={"email": CLIENT_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, session):
        r = session.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {_state['client_token']}"})
        assert r.status_code == 200
        assert r.json()["email"] == CLIENT_EMAIL

    def test_me_missing_token(self, session):
        r = session.get(f"{BASE_URL}/auth/me")
        assert r.status_code == 401

    def test_register_new_user(self, session):
        email = f"TEST_{uuid.uuid4().hex[:8]}@jokoo.sn"
        r = session.post(f"{BASE_URL}/auth/register", json={
            "email": email, "password": PASSWORD, "name": "TEST User", "role": "client", "city": "Dakar",
        })
        assert r.status_code == 200
        assert r.json()["user"]["email"] == email.lower()

    def test_register_duplicate(self, session):
        r = session.post(f"{BASE_URL}/auth/register", json={
            "email": CLIENT_EMAIL, "password": PASSWORD, "name": "Dup", "role": "client",
        })
        assert r.status_code == 400


# ---- providers ----
class TestProviders:
    def test_list_all(self, session):
        r = session.get(f"{BASE_URL}/providers")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 16
        _state["provider_id"] = items[0]["id"]

    def test_filter_service(self, session):
        r = session.get(f"{BASE_URL}/providers", params={"service": "plombier"})
        assert r.status_code == 200
        items = r.json()
        assert all(p["service_key"] == "plombier" for p in items)
        assert len(items) >= 2

    def test_filter_city(self, session):
        r = session.get(f"{BASE_URL}/providers", params={"city": "Thiès"})
        assert r.status_code == 200
        items = r.json()
        assert all("Thiès" in p["city"] for p in items)

    def test_search_q(self, session):
        r = session.get(f"{BASE_URL}/providers", params={"q": "Moussa"})
        assert r.status_code == 200
        assert any("Moussa" in p["name"] for p in r.json())

    def test_sort_rating(self, session):
        r = session.get(f"{BASE_URL}/providers", params={"sort": "rating"})
        ratings = [p.get("rating", 0) for p in r.json()]
        assert ratings == sorted(ratings, reverse=True)

    def test_sort_price(self, session):
        r = session.get(f"{BASE_URL}/providers", params={"sort": "price"})
        prices = [p.get("hourly_price", 0) for p in r.json()]
        assert prices == sorted(prices)

    def test_get_provider_details(self, session):
        pid = _state["provider_id"]
        r = session.get(f"{BASE_URL}/providers/{pid}")
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == pid
        assert "reviews" in data and isinstance(data["reviews"], list)
        assert len(data["reviews"]) >= 1

    def test_get_provider_404(self, session):
        r = session.get(f"{BASE_URL}/providers/nope-nope")
        assert r.status_code == 404

    def test_upsert_provider_profile(self, session):
        h = {"Authorization": f"Bearer {_state['pro_token']}"}
        payload = {
            "service": "plombier", "description": "Test pro", "hourly_price": 6000,
            "city": "Dakar", "zones": ["Dakar"], "hours": "Lun-Ven",
        }
        r = session.post(f"{BASE_URL}/providers/me", json=payload, headers=h)
        assert r.status_code == 200
        assert r.json()["provider"]["service"] == "Plombier"

    def test_upsert_provider_forbidden_client(self, session):
        h = {"Authorization": f"Bearer {_state['client_token']}"}
        r = session.post(f"{BASE_URL}/providers/me",
                         json={"service": "plombier", "city": "Dakar"}, headers=h)
        assert r.status_code == 403


# ---- booking flow ----
class TestBookings:
    def test_client_create_booking(self, session):
        # pick a seeded provider (not our pro user)
        provs = session.get(f"{BASE_URL}/providers").json()
        seeded = [p for p in provs if p.get("seeded")]
        target = seeded[0]
        _state["booking_provider_id"] = target["id"]
        h = {"Authorization": f"Bearer {_state['client_token']}"}
        payload = {
            "provider_id": target["id"], "date": "2026-02-01", "time": "14:00",
            "address": "Dakar Plateau", "description": "Test intervention", "estimated_price": 10000,
        }
        r = session.post(f"{BASE_URL}/bookings", json=payload, headers=h)
        assert r.status_code == 200
        _state["booking_id"] = r.json()["id"]
        assert r.json()["status"] == "pending"

    def test_booking_listed_by_client(self, session):
        h = {"Authorization": f"Bearer {_state['client_token']}"}
        r = session.get(f"{BASE_URL}/bookings", headers=h)
        assert r.status_code == 200
        ids = [b["id"] for b in r.json()]
        assert _state["booking_id"] in ids

    def test_client_creates_booking_for_pro_user(self, session):
        # need booking owned by our pro so pro can accept
        h = {"Authorization": f"Bearer {_state['client_token']}"}
        payload = {
            "provider_id": _state["pro_id"], "date": "2026-02-02", "time": "10:00",
            "address": "Dakar Almadies", "description": "Test pro accept",
            "estimated_price": 15000,
        }
        r = session.post(f"{BASE_URL}/bookings", json=payload, headers=h)
        assert r.status_code == 200
        _state["pro_booking_id"] = r.json()["id"]

    def test_pro_lists_booking(self, session):
        h = {"Authorization": f"Bearer {_state['pro_token']}"}
        r = session.get(f"{BASE_URL}/bookings", headers=h)
        assert r.status_code == 200
        ids = [b["id"] for b in r.json()]
        assert _state["pro_booking_id"] in ids

    def test_pro_accepts_booking(self, session):
        h = {"Authorization": f"Bearer {_state['pro_token']}"}
        r = session.patch(f"{BASE_URL}/bookings/{_state['pro_booking_id']}",
                          json={"status": "accepted"}, headers=h)
        assert r.status_code == 200

    def test_pro_completes_booking(self, session):
        h = {"Authorization": f"Bearer {_state['pro_token']}"}
        r = session.patch(f"{BASE_URL}/bookings/{_state['pro_booking_id']}",
                          json={"status": "completed"}, headers=h)
        assert r.status_code == 200

    def test_client_cannot_accept(self, session):
        h = {"Authorization": f"Bearer {_state['client_token']}"}
        r = session.patch(f"{BASE_URL}/bookings/{_state['pro_booking_id']}",
                          json={"status": "accepted"}, headers=h)
        assert r.status_code == 403


# ---- reviews ----
class TestReviews:
    def test_create_review(self, session):
        h = {"Authorization": f"Bearer {_state['client_token']}"}
        r = session.post(f"{BASE_URL}/reviews", json={
            "provider_id": _state["pro_id"], "booking_id": _state["pro_booking_id"],
            "rating": 5, "comment": "TEST — excellent",
        }, headers=h)
        assert r.status_code == 200

    def test_provider_rating_recomputed(self, session):
        r = session.get(f"{BASE_URL}/providers/{_state['pro_id']}")
        assert r.status_code == 200
        data = r.json()
        assert data["reviews_count"] >= 1
        assert data["rating"] > 0


# ---- favorites ----
class TestFavorites:
    def test_add_favorite(self, session):
        h = {"Authorization": f"Bearer {_state['client_token']}"}
        r = session.post(f"{BASE_URL}/favorites/{_state['booking_provider_id']}", headers=h)
        assert r.status_code == 200

    def test_list_favorites(self, session):
        h = {"Authorization": f"Bearer {_state['client_token']}"}
        r = session.get(f"{BASE_URL}/favorites", headers=h)
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert _state["booking_provider_id"] in ids

    def test_remove_favorite(self, session):
        h = {"Authorization": f"Bearer {_state['client_token']}"}
        r = session.delete(f"{BASE_URL}/favorites/{_state['booking_provider_id']}", headers=h)
        assert r.status_code == 200
        r2 = session.get(f"{BASE_URL}/favorites", headers=h)
        ids = [p["id"] for p in r2.json()]
        assert _state["booking_provider_id"] not in ids


# ---- chat ----
class TestChat:
    def test_send_message_client_to_pro(self, session):
        h = {"Authorization": f"Bearer {_state['client_token']}"}
        r = session.post(f"{BASE_URL}/chat/{_state['pro_id']}/messages",
                         json={"text": "Bonjour, dispo demain ?"}, headers=h)
        assert r.status_code == 200

    def test_pro_receives_message(self, session):
        h = {"Authorization": f"Bearer {_state['pro_token']}"}
        r = session.get(f"{BASE_URL}/chat/{_state['client_id']}/messages", headers=h)
        assert r.status_code == 200
        msgs = r.json()
        assert any("Bonjour" in m["text"] for m in msgs)

    def test_conversations(self, session):
        h = {"Authorization": f"Bearer {_state['client_token']}"}
        r = session.get(f"{BASE_URL}/chat/conversations", headers=h)
        assert r.status_code == 200
        convs = r.json()
        assert any(c["peer_id"] == _state["pro_id"] for c in convs)


# ---- notifications ----
class TestNotifications:
    def test_pro_has_notifications(self, session):
        h = {"Authorization": f"Bearer {_state['pro_token']}"}
        r = session.get(f"{BASE_URL}/notifications", headers=h)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_read_all(self, session):
        h = {"Authorization": f"Bearer {_state['pro_token']}"}
        r = session.post(f"{BASE_URL}/notifications/read-all", headers=h)
        assert r.status_code == 200
        r2 = session.get(f"{BASE_URL}/notifications", headers=h)
        assert all(n.get("read") for n in r2.json())


# ---- dashboard ----
class TestDashboard:
    def test_pro_dashboard(self, session):
        h = {"Authorization": f"Bearer {_state['pro_token']}"}
        r = session.get(f"{BASE_URL}/dashboard", headers=h)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_bookings", "pending", "accepted", "completed",
                  "revenue_xof", "rating", "subscription_active", "recent_bookings"):
            assert k in d, f"missing {k}"
        assert d["completed"] >= 1
        assert d["revenue_xof"] >= 15000

    def test_client_dashboard_forbidden(self, session):
        h = {"Authorization": f"Bearer {_state['client_token']}"}
        r = session.get(f"{BASE_URL}/dashboard", headers=h)
        assert r.status_code == 403


# ---- payments ----
class TestPayments:
    def test_booking_checkout(self, session):
        h = {"Authorization": f"Bearer {_state['client_token']}"}
        r = session.post(f"{BASE_URL}/payments/checkout/booking",
                         json={"booking_id": _state["booking_id"], "amount_xof": 10000},
                         headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("url", "").startswith("https://")
        assert "session_id" in data

    def test_subscription_checkout(self, session):
        h = {"Authorization": f"Bearer {_state['pro_token']}"}
        r = session.post(f"{BASE_URL}/payments/checkout/subscription",
                         json={"plan": "monthly"}, headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("url", "").startswith("https://")

    def test_sub_forbidden_client(self, session):
        h = {"Authorization": f"Bearer {_state['client_token']}"}
        r = session.post(f"{BASE_URL}/payments/checkout/subscription",
                         json={"plan": "monthly"}, headers=h)
        assert r.status_code == 403
