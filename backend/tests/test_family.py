"""Jokoo Family · Babysitting backend tests"""
import os
import uuid
import pytest
import requests

BACKEND_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001")
API = f"{BACKEND_URL.rstrip('/')}/api"


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    return s


@pytest.fixture(scope="session", autouse=True)
def seed(session):
    r = session.post(f"{API}/seed", timeout=30)
    assert r.status_code == 200, r.text


def _login(session, email, password):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.text}"
    data = r.json()
    return {"token": data["token"], "user": data["user"]}


@pytest.fixture(scope="session")
def parent_auth(session):
    return _login(session, "client@jokoo.sn", "Passw0rd!")


@pytest.fixture(scope="session")
def sitter_auth(session):
    return _login(session, "aisha.family@jokoo.sn", "Family1234!")


@pytest.fixture(scope="session")
def other_sitter_auth(session):
    return _login(session, "moussa.family@jokoo.sn", "Family1234!")


@pytest.fixture(scope="session")
def admin_auth(session):
    return _login(session, "admin@jokoo.sn", "Admin1234!")


@pytest.fixture(scope="session")
def a_babysitter(session):
    r = session.get(f"{API}/family/babysitters?verified_only=true", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    return data[0]


class TestBabysitterSearch:
    def test_default_list(self, session):
        r = session.get(f"{API}/family/babysitters", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 5

    def test_filter_language(self, session):
        r = session.get(f"{API}/family/babysitters?language=en", timeout=15)
        assert r.status_code == 200
        for b in r.json():
            assert any(l["code"] == "en" for l in b["languages"]), f"Sitter {b['name']} does not speak English"

    def test_filter_age_group(self, session):
        r = session.get(f"{API}/family/babysitters?age_group=0-2", timeout=15)
        assert r.status_code == 200
        for b in r.json():
            assert "0-2" in b["age_specialties"]

    def test_filter_psc1(self, session):
        r = session.get(f"{API}/family/babysitters?psc1=true", timeout=15)
        assert r.status_code == 200
        for b in r.json():
            assert b["psc1_certified"] is True

    def test_filter_tutoring(self, session):
        r = session.get(f"{API}/family/babysitters?offers_tutoring=true", timeout=15)
        assert r.status_code == 200
        for b in r.json():
            assert b["offers_tutoring"] is True

    def test_filter_verified(self, session):
        r = session.get(f"{API}/family/babysitters?verified_only=true", timeout=15)
        assert r.status_code == 200
        for b in r.json():
            assert b["student_card_verified"] is True

    def test_get_by_id_ok(self, session, a_babysitter):
        r = session.get(f"{API}/family/babysitters/{a_babysitter['id']}", timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == a_babysitter["id"]

    def test_get_by_id_404(self, session):
        r = session.get(f"{API}/family/babysitters/{uuid.uuid4()}", timeout=15)
        assert r.status_code == 404


class TestProfileUpsert:
    def test_create_profile_as_new_user(self, session):
        email = f"ps.family.{uuid.uuid4().hex[:8]}@jokoo.sn"
        r = session.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd!", "name": "Awa Étudiante", "role": "client"
        }, timeout=15)
        assert r.status_code == 200, r.text
        token = r.json()["token"]

        payload = {
            "bio": "Étudiante passionnée par les enfants et les langues.",
            "university": "UCAD Dakar", "level": "master", "field_of_study": "Anglais",
            "city": "Dakar",
            "languages": [{"code": "fr", "level": "native"}, {"code": "en", "level": "fluent"}],
            "age_specialties": ["3-5", "6-10"],
            "skills": ["languages", "stories"],
            "offers_babysitting": True, "offers_tutoring": True,
            "tutoring_subjects": ["Anglais"],
            "hourly_rate_xof": 3000, "psc1_certified": True,
        }
        r2 = session.post(f"{API}/family/profile", json=payload, headers=_hdr(token), timeout=15)
        assert r2.status_code == 200, r2.text
        p = r2.json()
        assert p["bio"].startswith("Étudiante")
        assert p["psc1_certified"] is True
        assert p["student_card_verified"] is False  # new profile

        # profile/me
        r3 = session.get(f"{API}/family/profile/me", headers=_hdr(token), timeout=15)
        assert r3.status_code == 200
        assert r3.json()["exists"] is True
        assert "rate_hint" in r3.json()

    def test_update_existing_profile(self, session, sitter_auth):
        # update Aïsha's bio
        payload = {
            "bio": "Nouvelle bio Aïsha — Master en anglais, immersion linguistique bilingue.",
            "university": "UCAD Dakar", "level": "master", "field_of_study": "Lettres modernes anglais",
            "city": "Dakar",
            "languages": [{"code": "fr", "level": "native"}, {"code": "en", "level": "fluent"}, {"code": "wo", "level": "native"}],
            "age_specialties": ["3-5", "6-10"],
            "skills": ["languages", "homework", "stories", "art"],
            "offers_babysitting": True, "offers_tutoring": True,
            "tutoring_subjects": ["Anglais", "Français"],
            "hourly_rate_xof": 3200, "psc1_certified": True,
        }
        r = session.post(f"{API}/family/profile", json=payload, headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["hourly_rate_xof"] == 3200

    def test_bio_min_length_validation(self, session, sitter_auth):
        payload = {
            "bio": "ok", "university": "X", "level": "licence",
            "city": "Dakar",
            "languages": [{"code": "fr", "level": "native"}],
            "age_specialties": ["3-5"],
            "hourly_rate_xof": 2500,
        }
        r = session.post(f"{API}/family/profile", json=payload, headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r.status_code == 422


class TestBooking:
    @pytest.fixture(scope="class")
    def booking_id(self, session, parent_auth, a_babysitter):
        payload = {
            "babysitter_id": a_babysitter["id"],
            "service_type": "babysitting",
            "address": "Sacré-Cœur 3, Villa 45",
            "city": "Dakar",
            "date": "2026-07-20",
            "time_start": "18:00",
            "time_end": "22:00",
            "kids": [{"name": "Aïcha", "age": 6, "special_needs": "timide"}],
            "language_focus": "en",
            "emergency_contact": {"name": "Papa", "phone": "+221771111111"},
            "notes": "Merci beaucoup",
        }
        r = session.post(f"{API}/family/bookings", json=payload, headers=_hdr(parent_auth["token"]), timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["duration_hours"] == 4.0
        assert b["total_xof"] == b["hourly_rate_xof"] * 4
        assert b["status"] == "pending"
        return b["id"]

    def test_create_booking_ok(self, booking_id):
        assert booking_id is not None

    def test_cannot_book_self(self, session, sitter_auth):
        # Aïsha tries to book Aïsha (her own babysitter profile)
        r = session.get(f"{API}/family/babysitters?verified_only=true", timeout=15)
        aisha = next(b for b in r.json() if b["user_id"] == sitter_auth["user"]["id"])
        payload = {
            "babysitter_id": aisha["id"],
            "service_type": "babysitting", "address": "Sacré-Cœur 3", "city": "Dakar",
            "date": "2026-07-25", "time_start": "18:00", "time_end": "22:00",
            "kids": [{"name": "K", "age": 4}],
            "emergency_contact": {"name": "Contact", "phone": "+221770000000"},
        }
        r2 = session.post(f"{API}/family/bookings", json=payload, headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r2.status_code == 400

    def test_tutoring_on_non_tutor_sitter(self, session, parent_auth):
        # Fatou Sarr does not offer tutoring
        r = session.get(f"{API}/family/babysitters", timeout=15)
        fatou = next(b for b in r.json() if b["name"] == "Fatou Sarr")
        payload = {
            "babysitter_id": fatou["id"],
            "service_type": "tutoring", "address": "X", "city": "Dakar",
            "date": "2026-07-25", "time_start": "18:00", "time_end": "22:00",
            "kids": [{"name": "K", "age": 8}],
            "emergency_contact": {"name": "Contact", "phone": "+221770000000"},
        }
        r2 = session.post(f"{API}/family/bookings", json=payload, headers=_hdr(parent_auth["token"]), timeout=15)
        assert r2.status_code == 400
        assert "tutorat" in r2.text.lower()

    def test_list_mine_as_parent(self, session, parent_auth, booking_id):
        r = session.get(f"{API}/family/bookings/mine", headers=_hdr(parent_auth["token"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert any(b["id"] == booking_id for b in data)

    def test_list_assigned_as_sitter(self, session, sitter_auth, booking_id):
        r = session.get(f"{API}/family/bookings/assigned", headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert any(b["id"] == booking_id for b in data)

    def test_get_by_id_parent_ok(self, session, parent_auth, booking_id):
        r = session.get(f"{API}/family/bookings/{booking_id}", headers=_hdr(parent_auth["token"]), timeout=15)
        assert r.status_code == 200

    def test_get_by_id_sitter_ok(self, session, sitter_auth, booking_id):
        r = session.get(f"{API}/family/bookings/{booking_id}", headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r.status_code == 200

    def test_get_by_id_third_party_forbidden(self, session, other_sitter_auth, booking_id):
        r = session.get(f"{API}/family/bookings/{booking_id}", headers=_hdr(other_sitter_auth["token"]), timeout=15)
        assert r.status_code == 403

    def test_status_transitions_and_report(self, session, parent_auth, sitter_auth):
        """Full flow on a dedicated booking: pending → confirmed → in_progress → completed (via report)."""
        # Create fresh booking
        r = session.get(f"{API}/family/babysitters?verified_only=true", timeout=15)
        aisha = next(b for b in r.json() if b["name"] == "Aïsha Mbaye")
        payload = {
            "babysitter_id": aisha["id"],
            "service_type": "babysitting", "address": "Adresse test", "city": "Dakar",
            "date": "2026-07-30", "time_start": "19:00", "time_end": "22:00",
            "kids": [{"name": "K", "age": 5}],
            "emergency_contact": {"name": "Papa", "phone": "+221770000099"},
        }
        r0 = session.post(f"{API}/family/bookings", json=payload, headers=_hdr(parent_auth["token"]), timeout=15)
        assert r0.status_code == 200
        bid = r0.json()["id"]

        # Parent tries to confirm → 403
        rx = session.patch(f"{API}/family/bookings/{bid}", json={"status": "confirmed"}, headers=_hdr(parent_auth["token"]), timeout=15)
        assert rx.status_code == 403

        # Sitter confirms
        r1 = session.patch(f"{API}/family/bookings/{bid}", json={"status": "confirmed"}, headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r1.status_code == 200

        # Sitter sends check-in photo (dummy base64)
        checkin = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        r_ck = session.patch(f"{API}/family/bookings/{bid}", json={"checkin_photo": checkin}, headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r_ck.status_code == 200

        # Parent cannot send check-in
        r_bad = session.patch(f"{API}/family/bookings/{bid}", json={"checkin_photo": checkin}, headers=_hdr(parent_auth["token"]), timeout=15)
        assert r_bad.status_code == 403

        # Sitter marks in_progress
        r2 = session.patch(f"{API}/family/bookings/{bid}", json={"status": "in_progress"}, headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r2.status_code == 200

        # SOS by parent
        r_sos = session.post(f"{API}/family/bookings/{bid}/sos", headers=_hdr(parent_auth["token"]), timeout=15)
        assert r_sos.status_code == 200
        assert r_sos.json().get("emergency_contact")

        # Sitter submits report → status auto → completed
        report_payload = {
            "activities": "Lecture d'un conte en anglais et dessin.",
            "meals": "Goûter à 20h : fruits + biscuits.",
            "mood": "happy",
            "notes": "Enfant très réceptif.",
        }
        r3 = session.post(f"{API}/family/bookings/{bid}/report", json=report_payload, headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r3.status_code == 200

        # Verify booking is now completed
        r4 = session.get(f"{API}/family/bookings/{bid}", headers=_hdr(parent_auth["token"]), timeout=15)
        assert r4.status_code == 200
        assert r4.json()["status"] == "completed"
        assert r4.json()["paid"] is True

        # Parent gets the report
        r5 = session.get(f"{API}/family/bookings/{bid}/report", headers=_hdr(parent_auth["token"]), timeout=15)
        assert r5.status_code == 200
        assert r5.json()["mood"] == "happy"

        # Can't submit twice
        r6 = session.post(f"{API}/family/bookings/{bid}/report", json=report_payload, headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r6.status_code == 400

        # Terminal state guard
        r7 = session.patch(f"{API}/family/bookings/{bid}", json={"status": "cancelled"}, headers=_hdr(sitter_auth["token"]), timeout=15)
        assert r7.status_code == 400

    def test_parent_can_cancel(self, session, parent_auth, sitter_auth):
        r = session.get(f"{API}/family/babysitters?verified_only=true", timeout=15)
        aisha = next(b for b in r.json() if b["name"] == "Aïsha Mbaye")
        payload = {
            "babysitter_id": aisha["id"],
            "service_type": "babysitting", "address": "X", "city": "Dakar",
            "date": "2026-08-05", "time_start": "18:00", "time_end": "20:00",
            "kids": [{"name": "K", "age": 5}],
            "emergency_contact": {"name": "P", "phone": "+221770000100"},
        }
        r0 = session.post(f"{API}/family/bookings", json=payload, headers=_hdr(parent_auth["token"]), timeout=15)
        assert r0.status_code == 200
        bid = r0.json()["id"]

        # parent cancels
        r1 = session.patch(f"{API}/family/bookings/{bid}", json={"status": "cancelled"}, headers=_hdr(parent_auth["token"]), timeout=15)
        assert r1.status_code == 200

        # parent trying to set confirmed → 403
        r2 = session.patch(f"{API}/family/bookings/{bid}", json={"status": "confirmed"}, headers=_hdr(parent_auth["token"]), timeout=15)
        assert r2.status_code in (400, 403)


class TestAdminVerify:
    def test_admin_can_verify(self, session, admin_auth):
        r = session.get(f"{API}/family/babysitters", timeout=15)
        b = r.json()[0]
        r2 = session.patch(f"{API}/admin/family/babysitters/{b['id']}/verify", json={"verified": True}, headers=_hdr(admin_auth["token"]), timeout=15)
        assert r2.status_code == 200

    def test_non_admin_cannot_verify(self, session, parent_auth):
        r = session.get(f"{API}/family/babysitters", timeout=15)
        b = r.json()[0]
        r2 = session.patch(f"{API}/admin/family/babysitters/{b['id']}/verify", json={"verified": True}, headers=_hdr(parent_auth["token"]), timeout=15)
        assert r2.status_code == 403
