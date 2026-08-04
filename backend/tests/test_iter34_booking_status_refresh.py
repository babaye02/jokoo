"""
Iter34 — Backend regression for the reported bug:
  "quand le partenaire accepte la réservation, ça ne s'affiche pas côté client
   sur 'Mes réservations'"

Scope validated here (BACKEND ONLY — FE useFocusEffect is verified via playwright):
  1. Client login (dual role: active_role=client) → seed & pick provider
  2. Client POST /bookings → status=pending
  3. Client GET /bookings → contient le booking (pending)
  4. Provider login → PATCH /bookings/{id} {status:'accepted'} → 200 {ok:true}
  5. Client GET /bookings → booking status='accepted' (persistence + role filter)
  6. Repeat pour reject → 'rejected' visible côté client
  7. Repeat pour completed → 'completed' visible côté client
  8. Notifications: 'booking_accepted' pour le client (target correct)
"""
import os
import uuid
import datetime as dt

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback used only for local dev of the test itself
    BASE_URL = "https://jokoo-mobile-dev.preview.emergentagent.com"

CLIENT_EMAIL = "client@jokoo.sn"
CLIENT_PW = "Passw0rd!"
PROVIDER_EMAIL = "pro@jokoo.sn"
PROVIDER_PW = "Passw0rd!"
PROVIDER_ID_BAKARY = "cc9acb5d-eb02-4208-bf55-99af86bf942f"


# ---------- helpers ----------
def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _me(tok: str) -> dict:
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _ensure_seed():
    # idempotent seed
    try:
        requests.post(f"{BASE_URL}/api/seed", timeout=60)
    except Exception:
        pass


def _switch_to_client_if_needed(tok: str) -> dict:
    """Ensure client user has active_role=client (dual mode safeguard)."""
    u = _me(tok)
    active = u.get("active_role") or u.get("role")
    if active != "client":
        r = requests.post(f"{BASE_URL}/api/auth/switch-role", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200, r.text
        u = _me(tok)
    return u


def _switch_to_provider_if_needed(tok: str) -> dict:
    u = _me(tok)
    active = u.get("active_role") or u.get("role")
    if active != "prestataire":
        r = requests.post(f"{BASE_URL}/api/auth/switch-role", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200, r.text
        u = _me(tok)
    return u


def _pick_provider_id(tok: str) -> str:
    """Return provider id different from the client (Bakary Pro from seed by default)."""
    r = requests.get(f"{BASE_URL}/api/providers", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200, r.text
    lst = r.json()
    ids = [p["id"] for p in lst]
    if PROVIDER_ID_BAKARY in ids:
        return PROVIDER_ID_BAKARY
    return ids[0]


def _create_booking(client_tok: str, provider_id: str) -> str:
    date = (dt.date.today() + dt.timedelta(days=3)).isoformat()
    body = {
        "provider_id": provider_id,
        "date": date,
        "time": "14:00",
        "address": "TEST_iter34_addr",
        "description": f"TEST_iter34 refetch bug — {uuid.uuid4().hex[:8]}",
    }
    r = requests.post(f"{BASE_URL}/api/bookings", headers=_hdr(client_tok), json=body, timeout=20)
    assert r.status_code == 200, f"create booking failed: {r.status_code} {r.text}"
    data = r.json()
    assert "id" in data
    assert data.get("status") == "pending"
    assert data.get("client_id")  # client_id set from token
    assert data["provider_id"] == provider_id
    return data["id"]


def _list_client_bookings(client_tok: str) -> list:
    r = requests.get(f"{BASE_URL}/api/bookings", headers=_hdr(client_tok), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _find(bookings: list, bid: str) -> dict | None:
    for b in bookings:
        if b.get("id") == bid:
            return b
    return None


def _patch_status(provider_tok: str, bid: str, status: str) -> requests.Response:
    return requests.patch(
        f"{BASE_URL}/api/bookings/{bid}",
        headers=_hdr(provider_tok),
        json={"status": status},
        timeout=20,
    )


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def tokens():
    _ensure_seed()
    client_tok = _login(CLIENT_EMAIL, CLIENT_PW)
    provider_tok = _login(PROVIDER_EMAIL, PROVIDER_PW)
    _switch_to_client_if_needed(client_tok)
    _switch_to_provider_if_needed(provider_tok)
    return {"client": client_tok, "provider": provider_tok}


# ---------- tests ----------
class TestBookingListRefetchBug:
    """End-to-end backend verification for the reported bug."""

    def test_1_client_active_role_is_client(self, tokens):
        u = _me(tokens["client"])
        active = u.get("active_role") or u.get("role")
        assert active == "client", f"client user should be in client mode, got {active}"

    def test_2_provider_active_role_is_prestataire(self, tokens):
        u = _me(tokens["provider"])
        active = u.get("active_role") or u.get("role")
        assert active == "prestataire", active

    def test_3_client_creates_booking_pending(self, tokens):
        pid = _pick_provider_id(tokens["client"])
        bid = _create_booking(tokens["client"], pid)
        # Verify persistence via GET
        lst = _list_client_bookings(tokens["client"])
        b = _find(lst, bid)
        assert b is not None, "Booking not returned by GET /bookings for client"
        assert b["status"] == "pending"
        # store for other tests via pytest module cache
        pytest.bid_accept = bid

    def test_4_provider_accepts_then_client_sees_accepted(self, tokens):
        bid = pytest.bid_accept
        r = _patch_status(tokens["provider"], bid, "accepted")
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # BUG CORE CHECK: client re-fetches /bookings and MUST see status=accepted
        lst = _list_client_bookings(tokens["client"])
        b = _find(lst, bid)
        assert b is not None, "Accepted booking missing from client's GET /bookings"
        assert b["status"] == "accepted", f"expected accepted, got {b['status']}"

    def test_5_sort_desc_and_limit_ok(self, tokens):
        lst = _list_client_bookings(tokens["client"])
        assert isinstance(lst, list)
        assert len(lst) <= 200, "list_bookings should cap at 200"
        # Must be sorted by created_at DESC
        created = [b.get("created_at") for b in lst if b.get("created_at")]
        assert created == sorted(created, reverse=True), "bookings must be sorted created_at DESC"

    def test_6_reject_flow_visible_client_side(self, tokens):
        pid = _pick_provider_id(tokens["client"])
        bid = _create_booking(tokens["client"], pid)
        r = _patch_status(tokens["provider"], bid, "rejected")
        assert r.status_code == 200, r.text
        lst = _list_client_bookings(tokens["client"])
        b = _find(lst, bid)
        assert b is not None and b["status"] == "rejected"

    def test_7_accept_then_complete_visible_client_side(self, tokens):
        pid = _pick_provider_id(tokens["client"])
        bid = _create_booking(tokens["client"], pid)
        assert _patch_status(tokens["provider"], bid, "accepted").status_code == 200
        assert _patch_status(tokens["provider"], bid, "completed").status_code == 200
        lst = _list_client_bookings(tokens["client"])
        b = _find(lst, bid)
        assert b is not None and b["status"] == "completed"

    def test_8_role_filter_client_does_not_see_others_bookings(self, tokens):
        """Sanity: client only sees bookings where client_id == self.id."""
        client_id = _me(tokens["client"])["id"]
        lst = _list_client_bookings(tokens["client"])
        for b in lst:
            assert b.get("client_id") == client_id, f"Leaked booking: {b}"

    def test_9_provider_only_sees_provider_side_bookings(self, tokens):
        """Sanity: provider only sees bookings where provider_id == self.id."""
        pid = _me(tokens["provider"])["id"]
        r = requests.get(f"{BASE_URL}/api/bookings", headers=_hdr(tokens["provider"]), timeout=15)
        assert r.status_code == 200
        for b in r.json():
            assert b.get("provider_id") == pid

    def test_10_notification_created_for_client_on_accept(self, tokens):
        pid = _pick_provider_id(tokens["client"])
        bid = _create_booking(tokens["client"], pid)
        r = _patch_status(tokens["provider"], bid, "accepted")
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/notifications", headers=_hdr(tokens["client"]), timeout=15)
        assert r.status_code == 200
        notifs = r.json()
        found = [n for n in notifs if n.get("booking_id") == bid and n.get("type") == "booking_accepted"]
        assert found, "No booking_accepted notification for client"

    def test_11_no_mongo_id_leak(self, tokens):
        lst = _list_client_bookings(tokens["client"])
        for b in lst:
            assert "_id" not in b, "MongoDB _id leaked in /bookings response"

    def test_12_final_state_rejects_further_transitions(self, tokens):
        """State machine: once rejected/completed, further PATCH must be 400."""
        pid = _pick_provider_id(tokens["client"])
        bid = _create_booking(tokens["client"], pid)
        assert _patch_status(tokens["provider"], bid, "rejected").status_code == 200
        r = _patch_status(tokens["provider"], bid, "accepted")
        assert r.status_code == 400, f"Should reject transition from rejected, got {r.status_code}"
