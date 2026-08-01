"""Iteration 18 tests — notifications clickable + admin reports refactor."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://jokoo-mobile-dev.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def tokens():
    # Ensure seed exists
    requests.post(f"{API}/seed", timeout=60)
    return {
        "admin": _login("admin@jokoo.sn", "Admin1234!"),
        "support": _login("support@jokoo.sn", "Staff1234!"),
        "client": _login("client@jokoo.sn", "Passw0rd!"),
        "aisha": _login("aisha.family@jokoo.sn", "Family1234!"),
    }


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# ---------- Notifications ----------
class TestNotifRead:
    def test_notifs_and_mark_one_read(self, tokens):
        t = tokens["aisha"]
        r = requests.get(f"{API}/notifications", headers=_h(t), timeout=30)
        assert r.status_code == 200
        notifs = r.json()
        assert isinstance(notifs, list)
        if not notifs:
            pytest.skip("Aisha has no notifs — cannot exercise read endpoint")
        # find an unread one, else use first
        target = next((n for n in notifs if not n.get("read")), notifs[0])
        nid = target["id"]
        r2 = requests.post(f"{API}/notifications/{nid}/read", headers=_h(t), timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("ok") is True

        # Confirm read state persisted
        r3 = requests.get(f"{API}/notifications", headers=_h(t), timeout=30)
        assert r3.status_code == 200
        after = {n["id"]: n for n in r3.json()}
        assert after[nid]["read"] is True

    def test_read_one_requires_auth(self):
        r = requests.post(f"{API}/notifications/does-not-matter/read", timeout=30)
        assert r.status_code in (401, 403)


# ---------- Reports create ----------
class TestReportCreate:
    def test_create_report_has_history(self, tokens):
        payload = {"target_id": "some-user-id", "target_type": "user", "reason": "TEST_iter18 signalement"}
        r = requests.post(f"{API}/reports", headers=_h(tokens["client"]), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "open"
        assert doc["target_id"] == "some-user-id"
        assert isinstance(doc.get("history"), list) and len(doc["history"]) == 1
        assert doc["history"][0]["action"] == "created"
        # store id via pytest cache substitute
        TestReportCreate.created_id = doc["id"]


# ---------- Reports admin update ----------
class TestReportsAdmin:
    @classmethod
    def _create(cls, token) -> str:
        r = requests.post(f"{API}/reports", headers=_h(token),
                          json={"target_id": "u2", "target_type": "user", "reason": "TEST_iter18 admin flow"},
                          timeout=30)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_patch_empty_returns_400(self, tokens):
        rid = self._create(tokens["client"])
        r = requests.patch(f"{API}/admin/reports/{rid}", headers=_h(tokens["support"]), json={}, timeout=30)
        assert r.status_code == 400
        assert "Aucune modification" in r.text or "modification" in r.text.lower()

    def test_patch_invalid_status(self, tokens):
        rid = self._create(tokens["client"])
        r = requests.patch(f"{API}/admin/reports/{rid}", headers=_h(tokens["support"]),
                           json={"status": "invalid_xxx"}, timeout=30)
        assert r.status_code == 400

    def test_patch_status_investigating(self, tokens):
        rid = self._create(tokens["client"])
        r = requests.patch(f"{API}/admin/reports/{rid}", headers=_h(tokens["support"]),
                           json={"status": "investigating"}, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "investigating"
        assert len(doc["history"]) == 2
        assert doc["history"][-1]["action"] == "status_changed"
        assert doc["history"][-1]["by_name"] == "Ousmane Support" or "Ousmane" in doc["history"][-1]["by_name"]

    def test_patch_priority_urgent(self, tokens):
        rid = self._create(tokens["client"])
        r = requests.patch(f"{API}/admin/reports/{rid}", headers=_h(tokens["support"]),
                           json={"priority": "urgent"}, timeout=30)
        assert r.status_code == 200
        doc = r.json()
        assert doc["priority"] == "urgent"
        assert any(h["action"] == "priority_changed" for h in doc["history"])

    def test_patch_note_only(self, tokens):
        rid = self._create(tokens["client"])
        r = requests.patch(f"{API}/admin/reports/{rid}", headers=_h(tokens["support"]),
                           json={"note": "Contact effectué"}, timeout=30)
        assert r.status_code == 200
        doc = r.json()
        assert any(h["action"] == "note" and h.get("note") == "Contact effectué" for h in doc["history"])

    def test_patch_resolved_sets_resolver(self, tokens):
        rid = self._create(tokens["client"])
        r = requests.patch(f"{API}/admin/reports/{rid}", headers=_h(tokens["support"]),
                           json={"status": "resolved", "note": "Fermé"}, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "resolved"
        assert doc.get("resolved_by")
        assert doc.get("resolved_at")
        assert doc.get("resolved_by_name")

    def test_stats(self, tokens):
        r = requests.get(f"{API}/admin/reports/stats", headers=_h(tokens["support"]), timeout=30)
        assert r.status_code == 200
        data = r.json()
        for k in ("total", "open", "investigating", "resolved", "dismissed", "escalated"):
            assert k in data, f"missing {k} in stats"
            assert isinstance(data[k], int)

    def test_filter_open(self, tokens):
        r = requests.get(f"{API}/admin/reports", headers=_h(tokens["support"]),
                         params={"status_filter": "open"}, timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert all(i["status"] == "open" for i in items)

    def test_support_permission(self, tokens):
        # Client cannot access admin route
        r = requests.get(f"{API}/admin/reports", headers=_h(tokens["client"]), timeout=30)
        assert r.status_code == 403


# ---------- Babysitting notif has family_booking_id ----------
class TestBabysittingNotifRouting:
    def test_new_booking_creates_notif_with_family_booking_id(self, tokens):
        """A newly-created family booking must produce a babysitting_request notif with family_booking_id."""
        # Get Aisha's own babysitter profile (by user_id via /me)
        r = requests.get(f"{API}/family/profile/me", headers=_h(tokens["aisha"]), timeout=30)
        if r.status_code != 200 or not r.json().get("exists"):
            pytest.skip("Aisha has no babysitter profile — cannot test routing field")
        aisha_prof = r.json()["profile"]
        if aisha_prof.get("status") != "active":
            pytest.skip(f"Aisha babysitter status={aisha_prof.get('status')} — cannot book")

        payload = {
            "babysitter_id": aisha_prof["id"],
            "service_type": "babysitting",
            "address": "TEST_iter18 route",
            "city": "Dakar",
            "date": "2026-12-31",
            "time_start": "18:00",
            "time_end": "22:00",
            "kids": [{"name": "TEST_kid", "age": 5}],
            "emergency_contact": {"name": "TEST_contact", "phone": "+221770000000"},
        }
        r2 = requests.post(f"{API}/family/bookings", headers=_h(tokens["client"]), json=payload, timeout=30)
        assert r2.status_code == 200, r2.text
        bid = r2.json()["id"]

        # Verify Aisha received a notif with family_booking_id=bid
        r3 = requests.get(f"{API}/notifications", headers=_h(tokens["aisha"]), timeout=30)
        assert r3.status_code == 200
        matching = [n for n in r3.json() if n.get("family_booking_id") == bid]
        assert matching, f"No notif with family_booking_id={bid} found for Aisha"
        assert matching[0]["type"] == "babysitting_request"
