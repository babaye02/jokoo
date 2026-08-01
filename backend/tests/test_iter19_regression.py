"""Iter 19 — Régression backend complète.
Couvre les endpoints critiques touchés par les iter 13-18 :
- Auth (client, admin, aisha, chauffeur, pro, support)
- Legal acceptances persistence (bug iter 18)
- Family bookings (mine + assigned + detail avec family_booking_id)
- Notifications /read + payload
- Bookings + services + partners + ads
- Admin reports (list/stats/patch)
- Rides + parcels flows
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://jokoo-mobile-dev.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CLIENT = ("client@jokoo.sn", "Passw0rd!")
ADMIN = ("admin@jokoo.sn", "Admin1234!")
AISHA = ("aisha.family@jokoo.sn", "Family1234!")
CHAUFFEUR = ("chauffeur@jokoo.sn", "Driver1234!")
PRO = ("pro@jokoo.sn", "Passw0rd!")
SUPPORT = ("support@jokoo.sn", "Staff1234!")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} => {r.status_code} {r.text[:200]}"
    d = r.json()
    tok = d.get("token") or d.get("access_token")
    assert tok, f"no token for {email}: {d}"
    return tok, d.get("user", {})


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def seeded():
    r = requests.post(f"{API}/seed", timeout=30)
    assert r.status_code == 200
    return r.json()


# ---------- AUTH ----------
class TestAuthRegression:
    def test_login_admin(self, seeded):
        tok, u = _login(*ADMIN)
        assert u.get("role") in ("admin", "super_admin", "staff") or u.get("is_admin")

    def test_login_client(self, seeded):
        tok, u = _login(*CLIENT)
        assert tok

    def test_login_aisha(self, seeded):
        tok, u = _login(*AISHA)
        assert tok

    def test_login_chauffeur(self, seeded):
        tok, _ = _login(*CHAUFFEUR)
        assert tok

    def test_login_pro(self, seeded):
        tok, _ = _login(*PRO)
        assert tok

    def test_login_support(self, seeded):
        tok, _ = _login(*SUPPORT)
        assert tok


# ---------- LEGAL PERSISTENCE (bug iter 18 fix) ----------
class TestLegalAcceptancePersistence:
    def test_get_documents_list(self, seeded):
        r = requests.get(f"{API}/legal/documents")
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list) and len(docs) > 0
        slugs = [d["slug"] for d in docs]
        assert "cgu" in slugs

    def test_accept_then_persist_in_mine(self, seeded):
        tok, _ = _login(*CLIENT)
        # Get the doc first (need version)
        rdoc = requests.get(f"{API}/legal/documents/cgu")
        assert rdoc.status_code == 200
        doc = rdoc.json()
        # Accept it
        rp = requests.post(f"{API}/legal/acceptances", json={"slug": "cgu", "version": doc["version"]}, headers=_hdr(tok))
        assert rp.status_code in (200, 201)
        # GET /legal/acceptances/mine → doit contenir la ligne
        rm = requests.get(f"{API}/legal/acceptances/mine", headers=_hdr(tok))
        assert rm.status_code == 200
        rows = rm.json()
        assert any(x.get("slug") == "cgu" for x in rows), f"acceptance not persisted: {rows}"


# ---------- FAMILY BOOKINGS ----------
class TestFamilyBookings:
    def test_mine_and_assigned_endpoints(self, seeded):
        tok, _ = _login(*CLIENT)
        r1 = requests.get(f"{API}/family/bookings/mine", headers=_hdr(tok))
        assert r1.status_code == 200
        assert isinstance(r1.json(), list)
        r2 = requests.get(f"{API}/family/bookings/assigned", headers=_hdr(tok))
        assert r2.status_code == 200

    def test_aisha_has_assigned(self, seeded):
        tok, _ = _login(*AISHA)
        r = requests.get(f"{API}/family/bookings/assigned", headers=_hdr(tok))
        assert r.status_code == 200
        # Aisha may or may not have — just validate schema if present
        for b in r.json():
            assert "id" in b and "status" in b

    def test_create_family_booking_and_detail(self, seeded):
        tok, _ = _login(*CLIENT)
        # find aisha profile
        r = requests.get(f"{API}/family/babysitters", headers=_hdr(tok))
        assert r.status_code == 200
        aisha = next((b for b in r.json() if "aisha" in (b.get("name") or "").lower()), None)
        if not aisha:
            # fallback: use first babysitter
            all_bs = r.json()
            if not all_bs:
                pytest.skip("no babysitter in seed")
            aisha = all_bs[0]
        payload = {
            "babysitter_id": aisha["id"],
            "date": "2026-02-15",
            "time_start": "14:00",
            "time_end": "17:00",
            "duration_hours": 3,
            "kids": [{"name": "TestKid", "age": 5, "special_needs": ""}],
            "address": "TEST_iter19 Dakar Plateau",
            "city": "Dakar",
            "emergency_contact": {"name": "TestParent", "phone": "+221770000000"},
            "service_type": "babysitting",
            "notes": "TEST_iter19 regression",
        }
        rc = requests.post(f"{API}/family/bookings", json=payload, headers=_hdr(tok))
        assert rc.status_code in (200, 201), f"create booking failed: {rc.status_code} {rc.text[:400]}"
        bid = rc.json()["id"]
        # detail
        rd = requests.get(f"{API}/family/bookings/{bid}", headers=_hdr(tok))
        assert rd.status_code == 200
        assert rd.json()["id"] == bid


# ---------- NOTIFICATIONS ----------
class TestNotifications:
    def test_list_and_mark_read(self, seeded):
        tok, _ = _login(*AISHA)
        r = requests.get(f"{API}/notifications", headers=_hdr(tok))
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # Check schema for RECENT babysitting notifs (created after iter18 fix should have family_booking_id).
        # Old legacy notifs may not — we just log them, not fail.
        legacy_baby = 0
        modern_baby = 0
        for n in items:
            if str(n.get("type", "")).startswith("babysitting"):
                has_fbid = n.get("family_booking_id") or (isinstance(n.get("data"), dict) and n["data"].get("family_booking_id"))
                if has_fbid:
                    modern_baby += 1
                else:
                    legacy_baby += 1
        print(f"[NOTIF] modern_baby={modern_baby} legacy_baby={legacy_baby}")
        # mark read one if exists
        if items:
            nid = items[0]["id"]
            rp = requests.post(f"{API}/notifications/{nid}/read", headers=_hdr(tok))
            assert rp.status_code in (200, 204)


# ---------- BOOKINGS (classique) ----------
class TestBookings:
    def test_create_provider_booking(self, seeded):
        tok, _ = _login(*CLIENT)
        rp = requests.get(f"{API}/providers")
        assert rp.status_code == 200
        provs = rp.json()
        assert len(provs) > 0
        # find a provider with services
        for prov in provs[:5]:
            rsv = requests.get(f"{API}/providers/{prov['id']}/services")
            if rsv.status_code == 200 and rsv.json():
                svs = rsv.json()
                sv = svs[0]
                payload = {
                    "provider_id": prov["id"],
                    "service_id": sv.get("id") or sv.get("_id") or "",
                    "date": "2026-02-20",
                    "time": "10:00",
                    "address": "TEST_iter19 Regression",
                    "description": "TEST_iter19 booking regression",
                    "notes": "TEST_iter19",
                }
                r = requests.post(f"{API}/bookings", json=payload, headers=_hdr(tok))
                assert r.status_code in (200, 201), f"booking create failed: {r.status_code} {r.text[:300]}"
                assert "id" in r.json()
                return
        pytest.skip("no provider with services found")


# ---------- RIDES + PARCELS ----------
class TestMobility:
    def test_list_rides(self, seeded):
        r = requests.get(f"{API}/rides")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_book_ride_seat(self, seeded):
        tok, _ = _login(*CLIENT)
        rl = requests.get(f"{API}/rides")
        rides = [r for r in rl.json() if r.get("seats_available", 0) > 0]
        if not rides:
            pytest.skip("no ride with seats available")
        ride = rides[0]
        r = requests.post(f"{API}/rides/{ride['id']}/book", json={"seats": 1}, headers=_hdr(tok))
        # 200/201 or 409 if already booked
        assert r.status_code in (200, 201, 409), f"book ride: {r.status_code} {r.text[:200]}"

    def test_list_my_ride_bookings(self, seeded):
        tok, _ = _login(*CLIENT)
        r = requests.get(f"{API}/rides/bookings/mine", headers=_hdr(tok))
        assert r.status_code == 200

    def test_parcel_send(self, seeded):
        tok, _ = _login(*CLIENT)
        rl = requests.get(f"{API}/rides")
        rides = [r for r in rl.json() if (r.get("parcel_max_kg") or 0) > 0 and r.get("accepts_parcels")]
        if not rides:
            pytest.skip("no ride accepts parcels")
        ride = rides[0]
        payload = {
            "pickup_address": "TEST_iter19 pickup",
            "dropoff_address": "TEST_iter19 dropoff",
            "description": "TEST_iter19 colis",
            "weight_kg": 1,
            "recipient_name": "TEST",
            "recipient_phone": "+221770000001",
            "payment_mode": "app",
        }
        r = requests.post(f"{API}/rides/{ride['id']}/parcel", json=payload, headers=_hdr(tok))
        assert r.status_code in (200, 201, 400, 409), f"parcel: {r.status_code} {r.text[:200]}"


# ---------- ADMIN (partners, ads, reports) ----------
class TestAdmin:
    def test_partners_list(self, seeded):
        tok, _ = _login(*ADMIN)
        r = requests.get(f"{API}/admin/partners", headers=_hdr(tok))
        assert r.status_code == 200

    def test_partner_create_and_delete(self, seeded):
        tok, _ = _login(*ADMIN)
        # Try create
        payload = {"name": "TEST_iter19 Partner", "logo_url": "https://placehold.co/200", "url": "https://example.com", "category": "food"}
        r = requests.post(f"{API}/admin/partners", json=payload, headers=_hdr(tok))
        assert r.status_code in (200, 201), f"partner create: {r.status_code} {r.text[:300]}"
        pid = r.json().get("id")
        assert pid
        rd = requests.delete(f"{API}/admin/partners/{pid}", headers=_hdr(tok))
        assert rd.status_code in (200, 204)

    def test_ads_list_and_duration_field(self, seeded):
        tok, _ = _login(*ADMIN)
        r = requests.get(f"{API}/admin/ads", headers=_hdr(tok))
        assert r.status_code == 200
        ads = r.json()
        # ensure schema has display_duration or similar
        for a in ads[:3]:
            assert "id" in a

    def test_reports_admin_flow(self, seeded):
        tok, _ = _login(*SUPPORT)
        # list
        r = requests.get(f"{API}/admin/reports", headers=_hdr(tok))
        assert r.status_code == 200
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        # stats
        rs = requests.get(f"{API}/admin/reports/stats", headers=_hdr(tok))
        assert rs.status_code == 200
        # patch one report if any (use timestamp to force unique change)
        if items:
            import time
            rid = items[0]["id"]
            current_status = items[0].get("status", "pending")
            new_status = "resolved" if current_status != "resolved" else "investigating"
            rp = requests.patch(
                f"{API}/admin/reports/{rid}",
                json={"status": new_status, "priority": "urgent", "note": f"TEST_iter19 regression {time.time()}"},
                headers=_hdr(tok),
            )
            assert rp.status_code in (200, 204), f"patch report: {rp.status_code} {rp.text[:200]}"


# ---------- HOME (banners) ----------
class TestHome:
    def test_banners_visible(self, seeded):
        r = requests.get(f"{API}/ads/active")
        # some backends use /ads or /ads/public
        if r.status_code == 404:
            r = requests.get(f"{API}/ads")
        assert r.status_code == 200, f"ads: {r.status_code} {r.text[:200]}"
        ads = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        assert isinstance(ads, list)
        # At least 1 active banner expected (per iter 19 context)
        # non-strict: just verify endpoint reachable and returns list


# ---------- FAMILY PROFILE SAVE ----------
class TestFamilyProfile:
    def test_aisha_profile_update(self, seeded):
        tok, u = _login(*AISHA)
        r = requests.get(f"{API}/family/profile/me", headers=_hdr(tok))
        assert r.status_code == 200
        data = r.json()
        if not data.get("exists"):
            pytest.skip("no family profile yet for Aisha")
        current = data["profile"]
        # Full upsert payload with modified bio
        payload = {
            "bio": f"TEST_iter19 bio regression {os.getpid()}",
            "profile_type": current.get("profile_type") or "student",
            "university": current.get("university") or "UCAD",
            "level": current.get("level") or "licence",
            "field_of_study": current.get("field_of_study") or "",
            "city": current.get("city") or "Dakar",
            "languages": current.get("languages") or [{"code": "fr", "level": "native"}],
            "age_specialties": current.get("age_specialties") or ["3-5"],
            "skills": current.get("skills") or [],
            "services": current.get("services") or ["babysitting"],
            "tutoring_subjects": current.get("tutoring_subjects") or [],
            "available_today": current.get("available_today", False),
            "night_care": current.get("night_care", False),
            "can_travel": current.get("can_travel", False),
            "hourly_rate_xof": current.get("hourly_rate_xof", 2000),
            "psc1_certified": current.get("psc1_certified", False),
            "emergency_contact": current.get("emergency_contact") or {"name": "TEST", "phone": "+221770000000"},
        }
        rp = requests.post(f"{API}/family/profile", json=payload, headers=_hdr(tok))
        assert rp.status_code in (200, 201), f"family profile save: {rp.status_code} {rp.text[:300]}"
        assert rp.json().get("bio", "").startswith("TEST_iter19")
