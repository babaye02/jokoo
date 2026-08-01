"""Iter23 backend tests — 2 P0 fixes:

1) POST /api/reviews sans provider_id + notification review_received livrée au prestataire.
2) POST /api/family/bookings/{bid}/report + notification babysitting_report livrée au parent,
   avec GET /api/family/bookings/{bid}/report accessible parent/babysitter/admin (403 sinon,
   404 si carnet non soumis).

Aucune régression Auth/Rides/Legal/etc. n'est re-testée.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://jokoo-mobile-dev.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

CLIENT_EMAIL = "client@jokoo.sn"
CLIENT_PWD = "Passw0rd!"
PRO_EMAIL = "pro@jokoo.sn"
PRO_PWD = "Passw0rd!"
SITTER_EMAIL = "aisha.family@jokoo.sn"
SITTER_PWD = "Family1234!"
OTHER_SITTER_EMAIL = "moussa.family@jokoo.sn"
OTHER_SITTER_PWD = "Family1234!"
ADMIN_EMAIL = "admin@jokoo.sn"
ADMIN_PWD = "Admin1234!"


def _hdr(t: str) -> dict:
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _login(session, email, password):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login {email} failed: {r.status_code} {r.text}"
    j = r.json()
    return j["token"], j["user"]


@pytest.fixture(scope="module")
def session():
    return requests.Session()


@pytest.fixture(scope="module", autouse=True)
def seed(session):
    r = session.post(f"{API}/seed", timeout=30)
    assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def client_auth(session):
    t, u = _login(session, CLIENT_EMAIL, CLIENT_PWD)
    return {"token": t, "user": u}


@pytest.fixture(scope="module")
def pro_auth(session):
    t, u = _login(session, PRO_EMAIL, PRO_PWD)
    return {"token": t, "user": u}


@pytest.fixture(scope="module")
def sitter_auth(session):
    t, u = _login(session, SITTER_EMAIL, SITTER_PWD)
    return {"token": t, "user": u}


@pytest.fixture(scope="module")
def other_sitter_auth(session):
    t, u = _login(session, OTHER_SITTER_EMAIL, OTHER_SITTER_PWD)
    return {"token": t, "user": u}


@pytest.fixture(scope="module")
def admin_auth(session):
    t, u = _login(session, ADMIN_EMAIL, ADMIN_PWD)
    return {"token": t, "user": u}


# =========================================================
# FIX #1 — Reviews : notification review_received prestataire
# =========================================================
class TestReviewNotification:
    """Client crée booking sur pro@jokoo.sn → accepted → double confirm completion
    → POST /reviews sans provider_id → prestataire reçoit notif review_received."""

    _bid = None
    _review_id = None
    _pro_uid = None

    def test_00_ensure_provider_profile_and_create_booking(self, session, client_auth, pro_auth):
        pro_uid = pro_auth["user"]["id"]
        TestReviewNotification._pro_uid = pro_uid
        # Ensure provider profile exists (idempotent)
        provs = session.get(f"{API}/providers?limit=200", timeout=15).json()
        if not any(p["id"] == pro_uid for p in provs):
            up = session.post(
                f"{API}/providers/me",
                headers=_hdr(pro_auth["token"]),
                json={"service": "plombier", "description": "TEST_iter23 profile", "price_type": "quote", "city": "Dakar"},
                timeout=15,
            )
            assert up.status_code == 200, up.text

        payload = {
            "provider_id": pro_uid,
            "date": "2026-07-11",
            "time": "10:00",
            "address": "Dakar TEST_iter23",
            "description": "TEST_iter23 review notif",
        }
        r = session.post(f"{API}/bookings", headers=_hdr(client_auth["token"]), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        bid = r.json()["id"]
        TestReviewNotification._bid = bid

        r2 = session.patch(f"{API}/bookings/{bid}", headers=_hdr(pro_auth["token"]), json={"status": "accepted"}, timeout=15)
        assert r2.status_code == 200, r2.text

    def test_01_double_confirm_completion(self, session, client_auth, pro_auth):
        bid = TestReviewNotification._bid
        r1 = session.post(f"{API}/bookings/{bid}/confirm-completion", headers=_hdr(client_auth["token"]), timeout=15)
        assert r1.status_code == 200, r1.text
        r2 = session.post(f"{API}/bookings/{bid}/confirm-completion", headers=_hdr(pro_auth["token"]), timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("both_confirmed") is True
        assert r2.json().get("status") == "completed"

    def test_02_stranger_cannot_review(self, session, sitter_auth):
        """User non-client du booking → 403 (utilise aisha.family qui n'est pas client de ce booking)."""
        bid = TestReviewNotification._bid
        r = session.post(
            f"{API}/reviews",
            headers=_hdr(sitter_auth["token"]),
            json={"booking_id": bid, "rating": 4, "comment": "TEST_iter23 stranger"},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"

    def test_03_client_posts_review_without_provider_id(self, session, client_auth):
        """Client envoie booking_id sans provider_id — backend doit résoudre provider_id."""
        bid = TestReviewNotification._bid
        r = session.post(
            f"{API}/reviews",
            headers=_hdr(client_auth["token"]),
            json={"booking_id": bid, "rating": 5, "comment": "TEST_iter23 excellent service"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        rev = r.json()
        assert rev.get("id"), "review id missing"
        assert rev.get("provider_id") == TestReviewNotification._pro_uid, "provider_id not resolved from booking"
        assert rev.get("rating") == 5
        assert rev.get("booking_id") == bid
        assert "_id" not in rev, "MongoDB _id must not leak"
        TestReviewNotification._review_id = rev["id"]

    def test_04_booking_review_id_updated(self, session, client_auth):
        bid = TestReviewNotification._bid
        b = session.get(f"{API}/bookings/{bid}", headers=_hdr(client_auth["token"]), timeout=15).json()
        assert b.get("review_id") == TestReviewNotification._review_id

    def test_05_double_review_returns_400(self, session, client_auth):
        bid = TestReviewNotification._bid
        r = session.post(
            f"{API}/reviews",
            headers=_hdr(client_auth["token"]),
            json={"booking_id": bid, "rating": 3, "comment": "TEST_iter23 dupe"},
            timeout=15,
        )
        assert r.status_code == 400, r.text

    def test_06_provider_rating_recomputed(self, session):
        pro_uid = TestReviewNotification._pro_uid
        p = session.get(f"{API}/providers/{pro_uid}", timeout=15).json()
        assert p.get("reviews_count", 0) >= 1
        assert p.get("rating") is not None and float(p["rating"]) > 0

    def test_07_provider_receives_review_received_notification(self, session, pro_auth):
        """La notif type=review_received doit être présente dans /notifications du prestataire
        avec booking_id + review_id + read=false."""
        r = session.get(f"{API}/notifications", headers=_hdr(pro_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        notifs = r.json()
        assert isinstance(notifs, list) and notifs, "provider should have notifications"
        rid = TestReviewNotification._review_id
        bid = TestReviewNotification._bid
        match = [n for n in notifs if n.get("type") == "review_received" and n.get("review_id") == rid]
        assert match, f"review_received notif with review_id={rid} not found. Notif types: {[n.get('type') for n in notifs[:20]]}"
        n = match[0]
        assert n.get("user_id") == TestReviewNotification._pro_uid, "notif.user_id must equal provider_id"
        assert n.get("booking_id") == bid, "notif.booking_id must match"
        assert n.get("read") is False, "new notif must be unread"
        assert "_id" not in n, "MongoDB _id must not leak"


# =========================================================
# FIX #2 — Carnet de session Famille livré au parent
# =========================================================
class TestSessionReportNotification:
    """Parent crée family booking sur Aïsha → sitter confirmed → in_progress → sitter POST /report
    → parent reçoit babysitting_report + GET /report ACL."""

    _bid = None
    _report_id = None
    _parent_uid = None
    _sitter_uid = None
    _aisha_id = None

    def test_00_pick_aisha_and_create_booking(self, session, client_auth, sitter_auth):
        TestSessionReportNotification._parent_uid = client_auth["user"]["id"]
        TestSessionReportNotification._sitter_uid = sitter_auth["user"]["id"]
        r = session.get(f"{API}/family/babysitters?verified_only=true", timeout=15)
        assert r.status_code == 200
        aisha = next((b for b in r.json() if b["user_id"] == sitter_auth["user"]["id"]), None)
        assert aisha, "Aïsha babysitter profile not found for aisha.family@jokoo.sn"
        TestSessionReportNotification._aisha_id = aisha["id"]

        payload = {
            "babysitter_id": aisha["id"],
            "service_type": "babysitting",
            "address": "Sacré-Cœur 3, Villa TEST_iter23",
            "city": "Dakar",
            "date": "2026-08-14",
            "time_start": "18:00",
            "time_end": "22:00",
            "kids": [{"name": "TEST_iter23", "age": 5}],
            "emergency_contact": {"name": "Papa TEST", "phone": "+221770001234"},
            "notes": "TEST_iter23 session report",
        }
        r2 = session.post(f"{API}/family/bookings", json=payload, headers=_hdr(client_auth["token"]), timeout=15)
        assert r2.status_code == 200, r2.text
        b = r2.json()
        TestSessionReportNotification._bid = b["id"]
        assert b["status"] == "pending"

    def test_01_sitter_confirms_and_in_progress(self, session, sitter_auth):
        bid = TestSessionReportNotification._bid
        r1 = session.patch(f"{API}/family/bookings/{bid}", json={"status": "confirmed"}, headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r1.status_code == 200, r1.text
        r2 = session.patch(f"{API}/family/bookings/{bid}", json={"status": "in_progress"}, headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r2.status_code == 200, r2.text

    def test_02_get_report_before_submission_returns_404(self, session, client_auth):
        bid = TestSessionReportNotification._bid
        r = session.get(f"{API}/family/bookings/{bid}/report", headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"

    def test_03_parent_cannot_submit_report(self, session, client_auth):
        bid = TestSessionReportNotification._bid
        payload = {"activities": "Parent tente", "meals": "-", "mood": "happy", "notes": ""}
        r = session.post(f"{API}/family/bookings/{bid}/report", json=payload, headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 403, r.text

    def test_04_other_sitter_cannot_submit_report(self, session, other_sitter_auth):
        bid = TestSessionReportNotification._bid
        payload = {"activities": "Autre sitter tente", "mood": "happy"}
        r = session.post(f"{API}/family/bookings/{bid}/report", json=payload, headers=_hdr(other_sitter_auth["token"]), timeout=15)
        assert r.status_code == 403, r.text

    def test_05_sitter_submits_report_success(self, session, sitter_auth):
        bid = TestSessionReportNotification._bid
        payload = {
            "activities": "Lecture d'un conte en anglais et jeux éducatifs TEST_iter23.",
            "meals": "Goûter : fruits + biscuits.",
            "mood": "happy",
            "notes": "Séance très réussie.",
        }
        r = session.post(f"{API}/family/bookings/{bid}/report", json=payload, headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("id"), "report id missing"
        assert j.get("booking_id") == bid
        assert j.get("mood") == "happy"
        assert j.get("parent_id") == TestSessionReportNotification._parent_uid
        assert "_id" not in j
        TestSessionReportNotification._report_id = j["id"]

    def test_06_booking_marked_completed_paid_and_report_id_set(self, session, client_auth):
        bid = TestSessionReportNotification._bid
        b = session.get(f"{API}/family/bookings/{bid}", headers=_hdr(client_auth["token"]), timeout=15).json()
        assert b["status"] == "completed", b
        assert b["paid"] is True
        assert b.get("report_id") == TestSessionReportNotification._report_id

    def test_07_double_report_returns_400(self, session, sitter_auth):
        bid = TestSessionReportNotification._bid
        payload = {"activities": "TEST_iter23 dupe", "mood": "happy"}
        r = session.post(f"{API}/family/bookings/{bid}/report", json=payload, headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r.status_code == 400, r.text

    def test_08_parent_can_get_report(self, session, client_auth):
        bid = TestSessionReportNotification._bid
        r = session.get(f"{API}/family/bookings/{bid}/report", headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["id"] == TestSessionReportNotification._report_id
        assert r.json()["mood"] == "happy"

    def test_09_babysitter_can_get_report(self, session, sitter_auth):
        bid = TestSessionReportNotification._bid
        r = session.get(f"{API}/family/bookings/{bid}/report", headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["id"] == TestSessionReportNotification._report_id

    def test_10_admin_can_get_report(self, session, admin_auth):
        bid = TestSessionReportNotification._bid
        r = session.get(f"{API}/family/bookings/{bid}/report", headers=_hdr(admin_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text

    def test_11_third_party_cannot_get_report(self, session, other_sitter_auth):
        bid = TestSessionReportNotification._bid
        r = session.get(f"{API}/family/bookings/{bid}/report", headers=_hdr(other_sitter_auth["token"]), timeout=15)
        assert r.status_code == 403, r.text

    def test_12_report_not_found_on_bogus_id(self, session, client_auth):
        r = session.get(f"{API}/family/bookings/{uuid.uuid4()}/report", headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 404, r.text

    def test_13_parent_receives_babysitting_report_notification(self, session, client_auth):
        r = session.get(f"{API}/notifications", headers=_hdr(client_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        notifs = r.json()
        assert isinstance(notifs, list) and notifs
        bid = TestSessionReportNotification._bid
        match = [
            n for n in notifs
            if n.get("type") == "babysitting_report" and n.get("family_booking_id") == bid
        ]
        assert match, f"babysitting_report notif not found for bid={bid}. Types: {[n.get('type') for n in notifs[:20]]}"
        n = match[0]
        assert n.get("user_id") == TestSessionReportNotification._parent_uid
        assert n.get("read") is False
        assert "_id" not in n
