"""Iter32 · Family reviews (parent → baby-sitter) — backend tests."""
import os
import uuid
import pytest
import requests

BACKEND_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001")
API = f"{BACKEND_URL.rstrip('/')}/api"


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def session():
    return requests.Session()


@pytest.fixture(scope="module", autouse=True)
def seed(session):
    r = session.post(f"{API}/seed", timeout=60)
    assert r.status_code == 200, r.text


def _login(session, email, password):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    d = r.json()
    return {"token": d["token"], "user": d["user"]}


def _register(session, email, password, name):
    r = session.post(f"{API}/auth/register",
                     json={"email": email, "password": password, "name": name, "role": "client"},
                     timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["token"], "user": d["user"]}


@pytest.fixture(scope="module")
def parent_auth(session):
    return _login(session, "client@jokoo.sn", "Passw0rd!")


@pytest.fixture(scope="module")
def sitter_auth(session):
    return _login(session, "aisha.family@jokoo.sn", "Family1234!")


@pytest.fixture(scope="module")
def sitter_babysitter(session, sitter_auth):
    r = session.get(f"{API}/family/babysitters?verified_only=true", timeout=15)
    assert r.status_code == 200
    aisha = next(b for b in r.json() if b["user_id"] == sitter_auth["user"]["id"])
    return aisha


def _make_booking(session, parent_token, sitter_id, offset=0):
    payload = {
        "babysitter_id": sitter_id,
        "service_type": "babysitting",
        "address": f"Sacré-Cœur 3, Villa {45 + offset}",
        "city": "Dakar",
        "date": "2026-08-15",
        "time_start": "18:00",
        "time_end": "22:00",
        "kids": [{"name": "Aïcha", "age": 6}],
        "emergency_contact": {"name": "Papa", "phone": "+221771111111"},
        "notes": f"iter32-{uuid.uuid4().hex[:6]}",
    }
    r = session.post(f"{API}/family/bookings", json=payload, headers=_hdr(parent_token), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _complete_booking(session, sitter_token, bid):
    """Transition pending → confirmed → in_progress → completed via sitter PATCH."""
    for st in ("confirmed", "in_progress", "completed"):
        r = session.patch(f"{API}/family/bookings/{bid}",
                          json={"status": st}, headers=_hdr(sitter_token), timeout=15)
        assert r.status_code == 200, f"Transition to {st} failed: {r.text}"


@pytest.fixture(scope="module")
def completed_booking(session, parent_auth, sitter_auth, sitter_babysitter):
    b = _make_booking(session, parent_auth["token"], sitter_babysitter["id"], offset=0)
    _complete_booking(session, sitter_auth["token"], b["id"])
    return b


@pytest.fixture(scope="module")
def confirmed_booking(session, parent_auth, sitter_auth, sitter_babysitter):
    b = _make_booking(session, parent_auth["token"], sitter_babysitter["id"], offset=1)
    r = session.patch(f"{API}/family/bookings/{b['id']}",
                      json={"status": "confirmed"}, headers=_hdr(sitter_auth["token"]), timeout=15)
    assert r.status_code == 200
    return b


# ------------- Tests -------------

class TestFamilyReviews:
    def test_1_invalid_booking_id_404(self, session, parent_auth):
        r = session.post(f"{API}/family/reviews",
                         json={"family_booking_id": str(uuid.uuid4()), "rating": 5, "comment": "x"},
                         headers=_hdr(parent_auth["token"]), timeout=15)
        assert r.status_code == 404, r.text

    def test_2_forbidden_for_sitter(self, session, sitter_auth, completed_booking):
        r = session.post(f"{API}/family/reviews",
                         json={"family_booking_id": completed_booking["id"], "rating": 5},
                         headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r.status_code == 403, r.text
        assert "parent" in r.json().get("detail", "").lower()

    def test_3_confirmed_only_400(self, session, parent_auth, confirmed_booking):
        r = session.post(f"{API}/family/reviews",
                         json={"family_booking_id": confirmed_booking["id"], "rating": 4},
                         headers=_hdr(parent_auth["token"]), timeout=15)
        assert r.status_code == 400, r.text
        assert "terminée" in r.json().get("detail", "").lower() or "termin" in r.json().get("detail", "").lower()

    def test_4_valid_post_review(self, session, parent_auth, completed_booking, sitter_auth, sitter_babysitter):
        r = session.post(f"{API}/family/reviews",
                         json={"family_booking_id": completed_booking["id"], "rating": 5,
                               "comment": "Super session !"},
                         headers=_hdr(parent_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["rating"] == 5
        assert d["comment"] == "Super session !"
        assert d["author_id"] == parent_auth["user"]["id"]
        assert d["babysitter_id"] == sitter_babysitter["id"]
        assert d["family_booking_id"] == completed_booking["id"]
        assert "id" in d
        pytest.review_id_iter32 = d["id"]

    def test_5_babysitter_rating_recomputed(self, session, sitter_babysitter):
        r = session.get(f"{API}/family/babysitters/{sitter_babysitter['id']}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["rating"] >= 1.0, f"rating not updated: {d.get('rating')}"
        assert d["reviews_count"] >= 1

    def test_6_notification_review_received(self, session, sitter_auth):
        r = session.get(f"{API}/notifications", headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r.status_code == 200
        types = [n.get("type") for n in r.json()]
        assert "review_received" in types, f"types found: {set(types)}"

    def test_7_duplicate_review_400(self, session, parent_auth, completed_booking):
        r = session.post(f"{API}/family/reviews",
                         json={"family_booking_id": completed_booking["id"], "rating": 4},
                         headers=_hdr(parent_auth["token"]), timeout=15)
        assert r.status_code == 400, r.text
        assert "déjà" in r.json().get("detail", "").lower() or "deja" in r.json().get("detail", "").lower()

    def test_8_rating_bounds_422(self, session, parent_auth, sitter_auth, sitter_babysitter):
        # Fresh booking to isolate rating bounds
        b = _make_booking(session, parent_auth["token"], sitter_babysitter["id"], offset=10)
        _complete_booking(session, sitter_auth["token"], b["id"])
        for bad in (0, 6, -1):
            r = session.post(f"{API}/family/reviews",
                             json={"family_booking_id": b["id"], "rating": bad},
                             headers=_hdr(parent_auth["token"]), timeout=15)
            assert r.status_code == 422, f"rating={bad} expected 422 got {r.status_code}: {r.text}"

    def test_9_empty_comment_accepted(self, session, parent_auth, sitter_auth, sitter_babysitter):
        b = _make_booking(session, parent_auth["token"], sitter_babysitter["id"], offset=20)
        _complete_booking(session, sitter_auth["token"], b["id"])
        r = session.post(f"{API}/family/reviews",
                         json={"family_booking_id": b["id"], "rating": 4, "comment": ""},
                         headers=_hdr(parent_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["comment"] == ""

    def test_10_public_list_reviews(self, session, sitter_babysitter):
        r = session.get(f"{API}/family/reviews?babysitter_id={sitter_babysitter['id']}", timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        assert len(arr) >= 1
        # created_at desc
        dates = [x.get("created_at", "") for x in arr]
        assert dates == sorted(dates, reverse=True), "not sorted desc"

    def test_11_eligibility_already_reviewed(self, session, parent_auth, completed_booking):
        r = session.get(f"{API}/family/bookings/{completed_booking['id']}/review-eligibility",
                        headers=_hdr(parent_auth["token"]), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["eligible"] is False
        assert d["reason"] == "already_reviewed"
        assert "existing_review_id" in d

    def test_12_self_review_guard(self, session):
        """Edge case : parent_id == babysitter_user_id.
        On force ce state via injection Mongo puis on appelle l'endpoint."""
        try:
            from pymongo import MongoClient
        except ImportError:
            pytest.skip("pymongo indisponible")
        client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = client[os.environ.get("DB_NAME", "jokoo_db")]
        # Nouveau user qui est à la fois parent et baby-sitter dans le doc
        email = f"iter32-self-{uuid.uuid4().hex[:8]}@test.jokoo"
        u = _register(session, email, "Passw0rd!", "SelfTester")
        prof = {
            "bio": "Étudiante testeuse iter32 avec bio suffisamment longue pour valider.",
            "university": "UCAD", "level": "licence", "field_of_study": "Info", "city": "Dakar",
            "languages": [{"code": "fr", "level": "native"}],
            "age_specialties": ["3-5"], "skills": ["stories"],
            "offers_babysitting": True, "offers_tutoring": False,
            "hourly_rate_xof": 2500, "psc1_certified": False,
        }
        r = session.post(f"{API}/family/profile", json=prof, headers=_hdr(u["token"]), timeout=15)
        assert r.status_code == 200, r.text
        sitter_doc = db.babysitters.find_one({"user_id": u["user"]["id"]})
        assert sitter_doc is not None
        # Injecter un booking self-review directement
        bid = str(uuid.uuid4())
        db.babysitting_bookings.insert_one({
            "id": bid,
            "parent_id": u["user"]["id"],
            "parent_name": u["user"]["name"],
            "babysitter_id": sitter_doc["id"],
            "babysitter_user_id": u["user"]["id"],
            "babysitter_name": sitter_doc.get("name"),
            "service_type": "babysitting",
            "address": "X", "city": "Dakar",
            "date": "2026-09-01", "time_start": "10:00", "time_end": "12:00",
            "duration_hours": 2.0, "kids": [],
            "emergency_contact": {"name": "n", "phone": "+221770000000"},
            "hourly_rate_xof": 2500, "total_xof": 5000,
            "status": "completed", "review_id": None, "paid": True,
            "created_at": "2026-01-01T00:00:00", "updated_at": "2026-01-01T00:00:00",
        })
        try:
            r = session.post(f"{API}/family/reviews",
                             json={"family_booking_id": bid, "rating": 5, "comment": "self"},
                             headers=_hdr(u["token"]), timeout=15)
            assert r.status_code == 400, r.text
            assert "propre" in r.json().get("detail", "").lower()
        finally:
            # cleanup
            db.babysitting_bookings.delete_one({"id": bid})
            db.babysitters.delete_one({"user_id": u["user"]["id"]})
            db.users.delete_one({"id": u["user"]["id"]})
            client.close()
