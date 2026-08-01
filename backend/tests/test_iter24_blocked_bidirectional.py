"""Iter24 — Filtre bidirectionnel des utilisateurs bloqués (P1 backend).

Vérifie que les helpers `_blocked_ids` / `_is_pair_blocked` (server.py ~L3179+) filtrent
correctement dans les 2 sens sur les 13 endpoints listés dans la review request :

  1. GET  /api/providers
  2. GET  /api/providers/{id}                 → 404
  3. POST /api/bookings                       → 403
  4. GET  /api/rides                          (list, driver bloqué disparaît)
  5. GET  /api/rides/{rid}                    → 404
  6. POST /api/rides/{rid}/book               → 403
  7. POST /api/rides/{rid}/parcel             → 403
  8. GET  /api/family/babysitters
  9. GET  /api/family/babysitters/{bid}       → 404
 10. POST /api/family/bookings                → 403
 11. GET  /api/chat/{peer_id}/messages        → []  (pas d'erreur)
 12. POST /api/chat/{peer_id}/messages        → 403
 13. GET  /api/chat/conversations             (peer bloqué disparaît)

`unblock` → tout redevient visible immédiatement.
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

# Comptes seed (voir /app/memory/test_credentials.md)
CLIENT_EMAIL, CLIENT_PWD = "client@jokoo.sn", "Passw0rd!"
PRO_EMAIL, PRO_PWD = "pro@jokoo.sn", "Passw0rd!"
DRIVER_EMAIL, DRIVER_PWD = "chauffeur@jokoo.sn", "Driver1234!"
SITTER_EMAIL, SITTER_PWD = "aisha.family@jokoo.sn", "Family1234!"
THIRD_EMAIL, THIRD_PWD = "moussa.family@jokoo.sn", "Family1234!"


def _hdr(t: str) -> dict:
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _login(session, email, password):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login {email}: {r.status_code} {r.text}"
    j = r.json()
    return j["token"], j["user"]


# ---------- Fixtures partagées ----------
@pytest.fixture(scope="module")
def session():
    return requests.Session()


@pytest.fixture(scope="module", autouse=True)
def seed(session):
    r = session.post(f"{API}/seed", timeout=30)
    assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def auths(session):
    """Retourne un dict avec token+user pour chacun des 5 comptes."""
    out = {}
    for label, email, pwd in [
        ("client", CLIENT_EMAIL, CLIENT_PWD),
        ("pro", PRO_EMAIL, PRO_PWD),
        ("driver", DRIVER_EMAIL, DRIVER_PWD),
        ("sitter", SITTER_EMAIL, SITTER_PWD),
        ("third", THIRD_EMAIL, THIRD_PWD),
    ]:
        t, u = _login(session, email, pwd)
        out[label] = {"token": t, "user": u, "uid": u["id"]}
    return out


@pytest.fixture(scope="module")
def sitter_profile(session, auths):
    """Récupère la fiche babysitter d'Aïsha."""
    r = session.get(f"{API}/family/babysitters", headers=_hdr(auths["client"]["token"]), timeout=15)
    assert r.status_code == 200
    items = r.json()
    aisha = next((b for b in items if b.get("user_id") == auths["sitter"]["uid"]), None)
    assert aisha, "Fiche baby-sitter d'Aïsha introuvable"
    return aisha


@pytest.fixture(scope="module")
def driver_ride(session, auths):
    """Un trajet actif publié par chauffeur@jokoo.sn qui accepte les colis longue distance."""
    r = session.get(f"{API}/rides", headers=_hdr(auths["client"]["token"]), timeout=15)
    assert r.status_code == 200
    rides = r.json()
    driver_id = auths["driver"]["uid"]
    parcel_ride = next(
        (rr for rr in rides
         if rr.get("driver_id") == driver_id and rr.get("accepts_parcels")
         and rr.get("distance_type") == "long" and rr.get("status") == "active"
         and (rr.get("seats_available") or 0) > 0),
        None,
    )
    any_ride = next((rr for rr in rides if rr.get("driver_id") == driver_id
                     and rr.get("status") == "active"
                     and (rr.get("seats_available") or 0) > 0), None)
    return {"parcel": parcel_ride, "any": any_ride}


# ---------- Helpers block / unblock ----------
def _block(session, blocker_token, target_uid):
    r = session.post(f"{API}/users/{target_uid}/block", headers=_hdr(blocker_token), timeout=10)
    assert r.status_code == 200, r.text
    return r


def _unblock(session, blocker_token, target_uid):
    r = session.delete(f"{API}/users/{target_uid}/block", headers=_hdr(blocker_token), timeout=10)
    assert r.status_code == 200, r.text
    return r


def _cleanup_all_blocks(session, auths):
    """Nettoie tous les blocages entre nos 5 comptes de test."""
    for a in auths.values():
        r = session.get(f"{API}/users/me/blocked", headers=_hdr(a["token"]), timeout=10)
        if r.status_code == 200:
            for row in r.json():
                session.delete(f"{API}/users/{row['blocked_id']}/block", headers=_hdr(a["token"]), timeout=10)


# ---------- 1. GET /api/providers ----------
class TestProvidersList:
    def test_baseline_visible(self, session, auths):
        _cleanup_all_blocks(session, auths)
        r = session.get(f"{API}/providers?limit=200", headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 200
        ids = {p["id"] for p in r.json()}
        assert auths["pro"]["uid"] in ids, "Le prestataire pro@ doit être visible avant block"

    def test_client_blocks_pro__pro_hidden_for_client(self, session, auths):
        _block(session, auths["client"]["token"], auths["pro"]["uid"])
        r = session.get(f"{API}/providers?limit=200", headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 200
        ids = {p["id"] for p in r.json()}
        assert auths["pro"]["uid"] not in ids, "pro doit disparaître de /providers pour A (client bloqueur)"

    def test_client_blocks_pro__pro_side_still_lists_self(self, session, auths):
        # Sens inverse (côté B) : B est toujours prestataire et se voit lui-même dans la liste.
        # Le filtre bidirectionnel exclut les *providers* dont l'id est bloqué par ou avec B.
        # Ici B lui-même n'est pas dans son propre set _blocked_ids (le helper filtre a==b),
        # donc B doit continuer à voir sa propre fiche. Test que la requête réussit sans crash.
        r = session.get(f"{API}/providers?limit=200", headers=_hdr(auths["pro"]["token"]), timeout=15)
        assert r.status_code == 200
        ids = {p["id"] for p in r.json()}
        # pro doit se voir lui-même (a==b exclu du filtre)
        assert auths["pro"]["uid"] in ids

    def test_third_party_still_sees_pro(self, session, auths):
        r = session.get(f"{API}/providers?limit=200", headers=_hdr(auths["third"]["token"]), timeout=15)
        assert r.status_code == 200
        ids = {p["id"] for p in r.json()}
        assert auths["pro"]["uid"] in ids, "Un tiers (moussa) doit voir pro"

    def test_unblock_restores_visibility(self, session, auths):
        _unblock(session, auths["client"]["token"], auths["pro"]["uid"])
        r = session.get(f"{API}/providers?limit=200", headers=_hdr(auths["client"]["token"]), timeout=15)
        ids = {p["id"] for p in r.json()}
        assert auths["pro"]["uid"] in ids, "pro doit réapparaître après unblock"

    def test_reverse_direction_pro_blocks_client(self, session, auths):
        # B bloque A → même effet (filtre symétrique)
        _block(session, auths["pro"]["token"], auths["client"]["uid"])
        r = session.get(f"{API}/providers?limit=200", headers=_hdr(auths["client"]["token"]), timeout=15)
        ids = {p["id"] for p in r.json()}
        assert auths["pro"]["uid"] not in ids, "Sens inverse : pro absent de la liste vue par A"
        _unblock(session, auths["pro"]["token"], auths["client"]["uid"])


# ---------- 2. GET /api/providers/{id} ----------
class TestProviderDetail:
    def test_baseline_200(self, session, auths):
        _cleanup_all_blocks(session, auths)
        r = session.get(f"{API}/providers/{auths['pro']['uid']}",
                        headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 200

    def test_client_blocks_pro__detail_404(self, session, auths):
        _block(session, auths["client"]["token"], auths["pro"]["uid"])
        r = session.get(f"{API}/providers/{auths['pro']['uid']}",
                        headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 404

    def test_third_party_still_200(self, session, auths):
        r = session.get(f"{API}/providers/{auths['pro']['uid']}",
                        headers=_hdr(auths["third"]["token"]), timeout=15)
        assert r.status_code == 200

    def test_reverse_pro_blocks_client__detail_404(self, session, auths):
        _unblock(session, auths["client"]["token"], auths["pro"]["uid"])
        _block(session, auths["pro"]["token"], auths["client"]["uid"])
        r = session.get(f"{API}/providers/{auths['pro']['uid']}",
                        headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 404, "Sens inverse : détail 404 aussi"
        _unblock(session, auths["pro"]["token"], auths["client"]["uid"])

    def test_unblock_detail_200(self, session, auths):
        _cleanup_all_blocks(session, auths)
        r = session.get(f"{API}/providers/{auths['pro']['uid']}",
                        headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 200


# ---------- 3. POST /api/bookings ----------
class TestCreateBookingBlocked:
    def _payload(self, provider_id):
        return {
            "provider_id": provider_id,
            "date": "2026-12-15",
            "time": "10:00",
            "address": "Test 1234, Dakar",
            "description": "TEST_iter24 booking",
        }

    def test_baseline_creates(self, session, auths):
        _cleanup_all_blocks(session, auths)
        r = session.post(f"{API}/bookings", json=self._payload(auths["pro"]["uid"]),
                         headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 200, f"Baseline booking échouée: {r.status_code} {r.text}"

    def test_blocked_returns_403(self, session, auths):
        _block(session, auths["client"]["token"], auths["pro"]["uid"])
        r = session.post(f"{API}/bookings", json=self._payload(auths["pro"]["uid"]),
                         headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 403, f"Attendu 403, obtenu {r.status_code} {r.text}"

    def test_reverse_blocked_returns_403(self, session, auths):
        _unblock(session, auths["client"]["token"], auths["pro"]["uid"])
        _block(session, auths["pro"]["token"], auths["client"]["uid"])
        r = session.post(f"{API}/bookings", json=self._payload(auths["pro"]["uid"]),
                         headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 403
        _unblock(session, auths["pro"]["token"], auths["client"]["uid"])


# ---------- 4. GET /api/rides ----------
class TestRidesList:
    def test_baseline_driver_visible(self, session, auths, driver_ride):
        _cleanup_all_blocks(session, auths)
        assert driver_ride["any"], "Aucun trajet actif chauffeur en seed"
        r = session.get(f"{API}/rides", headers=_hdr(auths["client"]["token"]), timeout=15)
        driver_ids = {rr.get("driver_id") for rr in r.json()}
        assert auths["driver"]["uid"] in driver_ids

    def test_blocked_driver_hidden(self, session, auths):
        _block(session, auths["client"]["token"], auths["driver"]["uid"])
        r = session.get(f"{API}/rides", headers=_hdr(auths["client"]["token"]), timeout=15)
        driver_ids = {rr.get("driver_id") for rr in r.json()}
        assert auths["driver"]["uid"] not in driver_ids

    def test_third_party_still_sees_driver_rides(self, session, auths):
        r = session.get(f"{API}/rides", headers=_hdr(auths["third"]["token"]), timeout=15)
        driver_ids = {rr.get("driver_id") for rr in r.json()}
        assert auths["driver"]["uid"] in driver_ids

    def test_reverse_driver_blocks_client(self, session, auths):
        _unblock(session, auths["client"]["token"], auths["driver"]["uid"])
        _block(session, auths["driver"]["token"], auths["client"]["uid"])
        r = session.get(f"{API}/rides", headers=_hdr(auths["client"]["token"]), timeout=15)
        driver_ids = {rr.get("driver_id") for rr in r.json()}
        assert auths["driver"]["uid"] not in driver_ids, "Sens inverse : driver caché aussi"
        _unblock(session, auths["driver"]["token"], auths["client"]["uid"])


# ---------- 5. GET /api/rides/{rid} ----------
class TestRideDetail:
    def test_baseline_200(self, session, auths, driver_ride):
        _cleanup_all_blocks(session, auths)
        rid = driver_ride["any"]["id"]
        r = session.get(f"{API}/rides/{rid}", headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 200

    def test_blocked_returns_404(self, session, auths, driver_ride):
        rid = driver_ride["any"]["id"]
        _block(session, auths["client"]["token"], auths["driver"]["uid"])
        r = session.get(f"{API}/rides/{rid}", headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 404

    def test_reverse_blocked_404(self, session, auths, driver_ride):
        rid = driver_ride["any"]["id"]
        _unblock(session, auths["client"]["token"], auths["driver"]["uid"])
        _block(session, auths["driver"]["token"], auths["client"]["uid"])
        r = session.get(f"{API}/rides/{rid}", headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 404
        _unblock(session, auths["driver"]["token"], auths["client"]["uid"])


# ---------- 6. POST /api/rides/{rid}/book ----------
class TestRideBook:
    def test_blocked_returns_403(self, session, auths, driver_ride):
        _cleanup_all_blocks(session, auths)
        rid = driver_ride["any"]["id"]
        _block(session, auths["client"]["token"], auths["driver"]["uid"])
        r = session.post(f"{API}/rides/{rid}/book", json={"seats": 1, "note": "TEST_iter24"},
                         headers=_hdr(auths["client"]["token"]), timeout=15)
        # Ordre du check : status "active" d'abord (404 si _is_pair_blocked déclenché après)
        # Ici l'ordre backend : status → own ride → is_pair_blocked → seats. Donc 403 attendu.
        assert r.status_code == 403, f"Attendu 403, obtenu {r.status_code} {r.text}"

    def test_reverse_blocked_403(self, session, auths, driver_ride):
        rid = driver_ride["any"]["id"]
        _unblock(session, auths["client"]["token"], auths["driver"]["uid"])
        _block(session, auths["driver"]["token"], auths["client"]["uid"])
        r = session.post(f"{API}/rides/{rid}/book", json={"seats": 1, "note": "TEST_iter24"},
                         headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 403
        _unblock(session, auths["driver"]["token"], auths["client"]["uid"])


# ---------- 7. POST /api/rides/{rid}/parcel ----------
class TestRideParcel:
    def test_blocked_returns_403(self, session, auths, driver_ride):
        _cleanup_all_blocks(session, auths)
        if not driver_ride["parcel"]:
            pytest.skip("Aucun trajet longue distance avec colis en seed")
        rid = driver_ride["parcel"]["id"]
        _block(session, auths["client"]["token"], auths["driver"]["uid"])
        payload = {
            "recipient_name": "TEST Dest",
            "recipient_phone": "+221771234567",
            "description": "Enveloppe A4",
            "weight_kg": 1,
            "payment_mode": "cash",
            "pickup_address": "Rue Test 12, Dakar",
            "dropoff_address": "Rue Test 34, Thies",
        }
        r = session.post(f"{API}/rides/{rid}/parcel", json=payload,
                         headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 403, f"Attendu 403, obtenu {r.status_code} {r.text}"

    def test_reverse_blocked_403(self, session, auths, driver_ride):
        if not driver_ride["parcel"]:
            pytest.skip("Aucun trajet colis en seed")
        rid = driver_ride["parcel"]["id"]
        _unblock(session, auths["client"]["token"], auths["driver"]["uid"])
        _block(session, auths["driver"]["token"], auths["client"]["uid"])
        payload = {
            "recipient_name": "TEST Dest",
            "recipient_phone": "+221771234567",
            "description": "Enveloppe",
            "weight_kg": 1,
            "payment_mode": "cash",
            "pickup_address": "Rue Test 12, Dakar",
            "dropoff_address": "Rue Test 34, Thies",
        }
        r = session.post(f"{API}/rides/{rid}/parcel", json=payload,
                         headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 403
        _unblock(session, auths["driver"]["token"], auths["client"]["uid"])


# ---------- 8. GET /api/family/babysitters ----------
class TestBabysittersList:
    def test_baseline_visible(self, session, auths, sitter_profile):
        _cleanup_all_blocks(session, auths)
        r = session.get(f"{API}/family/babysitters", headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 200
        ids = {b["id"] for b in r.json()}
        assert sitter_profile["id"] in ids

    def test_blocked_sitter_hidden(self, session, auths, sitter_profile):
        _block(session, auths["client"]["token"], auths["sitter"]["uid"])
        r = session.get(f"{API}/family/babysitters", headers=_hdr(auths["client"]["token"]), timeout=15)
        ids = {b["id"] for b in r.json()}
        assert sitter_profile["id"] not in ids

    def test_reverse_sitter_blocks_client(self, session, auths, sitter_profile):
        _unblock(session, auths["client"]["token"], auths["sitter"]["uid"])
        _block(session, auths["sitter"]["token"], auths["client"]["uid"])
        r = session.get(f"{API}/family/babysitters", headers=_hdr(auths["client"]["token"]), timeout=15)
        ids = {b["id"] for b in r.json()}
        assert sitter_profile["id"] not in ids, "Sens inverse : sitter caché aussi"
        _unblock(session, auths["sitter"]["token"], auths["client"]["uid"])


# ---------- 9. GET /api/family/babysitters/{bid} ----------
class TestBabysitterDetail:
    def test_baseline_200(self, session, auths, sitter_profile):
        _cleanup_all_blocks(session, auths)
        r = session.get(f"{API}/family/babysitters/{sitter_profile['id']}",
                        headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 200

    def test_blocked_404(self, session, auths, sitter_profile):
        _block(session, auths["client"]["token"], auths["sitter"]["uid"])
        r = session.get(f"{API}/family/babysitters/{sitter_profile['id']}",
                        headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 404

    def test_reverse_404(self, session, auths, sitter_profile):
        _unblock(session, auths["client"]["token"], auths["sitter"]["uid"])
        _block(session, auths["sitter"]["token"], auths["client"]["uid"])
        r = session.get(f"{API}/family/babysitters/{sitter_profile['id']}",
                        headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 404
        _unblock(session, auths["sitter"]["token"], auths["client"]["uid"])


# ---------- 10. POST /api/family/bookings ----------
class TestFamilyBookingBlocked:
    def _payload(self, sitter_id):
        return {
            "babysitter_id": sitter_id,
            "service_type": "babysitting",
            "address": "Cité TEST_iter24",
            "city": "Dakar",
            "date": "2026-12-20",
            "time_start": "14:00",
            "time_end": "17:00",
            "kids": [{"name": "TEST", "age": 5}],
            "language_focus": "fr",
            "emergency_contact": {"name": "Contact Test", "phone": "+221771000000"},
        }

    def test_blocked_returns_403(self, session, auths, sitter_profile):
        _cleanup_all_blocks(session, auths)
        _block(session, auths["client"]["token"], auths["sitter"]["uid"])
        r = session.post(f"{API}/family/bookings", json=self._payload(sitter_profile["id"]),
                         headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 403, f"Attendu 403, obtenu {r.status_code} {r.text}"

    def test_reverse_blocked_403(self, session, auths, sitter_profile):
        _unblock(session, auths["client"]["token"], auths["sitter"]["uid"])
        _block(session, auths["sitter"]["token"], auths["client"]["uid"])
        r = session.post(f"{API}/family/bookings", json=self._payload(sitter_profile["id"]),
                         headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 403
        _unblock(session, auths["sitter"]["token"], auths["client"]["uid"])


# ---------- 11 & 12 & 13 : Chat ----------
class TestChatBlocked:
    def test_11_get_messages_blocked_returns_empty(self, session, auths):
        _cleanup_all_blocks(session, auths)
        # Envoi préalable d'un message pour créer conversation
        r = session.post(f"{API}/chat/{auths['pro']['uid']}/messages",
                         json={"text": f"TEST_iter24_{uuid.uuid4().hex[:8]}"},
                         headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 200, f"Setup message échoué: {r.status_code} {r.text}"

        # Block par client
        _block(session, auths["client"]["token"], auths["pro"]["uid"])
        r = session.get(f"{API}/chat/{auths['pro']['uid']}/messages",
                        headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 200, "Doit renvoyer 200 (pas d'erreur)"
        assert r.json() == [], f"Doit renvoyer [] pour peer bloqué, obtenu: {r.json()}"

    def test_11_reverse_get_messages_empty(self, session, auths):
        # Côté B (pro) : doit aussi voir [] car client l'a bloqué (symétrique)
        r = session.get(f"{API}/chat/{auths['client']['uid']}/messages",
                        headers=_hdr(auths["pro"]["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json() == [], "Sens inverse : pro voit aussi [] pour client"

    def test_12_send_message_blocked_returns_403(self, session, auths):
        r = session.post(f"{API}/chat/{auths['pro']['uid']}/messages",
                         json={"text": "TEST doit échouer"},
                         headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 403, f"Attendu 403, obtenu {r.status_code} {r.text}"

    def test_12_reverse_send_message_403(self, session, auths):
        # pro tente d'envoyer à client → doit être 403 aussi (filtre symétrique)
        r = session.post(f"{API}/chat/{auths['client']['uid']}/messages",
                         json={"text": "TEST doit échouer"},
                         headers=_hdr(auths["pro"]["token"]), timeout=15)
        assert r.status_code == 403

    def test_13_conversations_hides_blocked_peer_client_side(self, session, auths):
        r = session.get(f"{API}/chat/conversations",
                        headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 200
        peers = {c["peer_id"] for c in r.json()}
        assert auths["pro"]["uid"] not in peers, "Conversation avec pro doit disparaître (client)"

    def test_13_conversations_hides_blocked_peer_pro_side(self, session, auths):
        # Sens inverse
        r = session.get(f"{API}/chat/conversations",
                        headers=_hdr(auths["pro"]["token"]), timeout=15)
        assert r.status_code == 200
        peers = {c["peer_id"] for c in r.json()}
        assert auths["client"]["uid"] not in peers, "Conversation avec client doit disparaître (pro)"

    def test_unblock_restores_chat(self, session, auths):
        _unblock(session, auths["client"]["token"], auths["pro"]["uid"])
        # Messages redevient visible (non vide car le premier a été envoyé plus haut)
        r = session.get(f"{API}/chat/{auths['pro']['uid']}/messages",
                        headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 1, "Conversation restaurée avec au moins 1 message"
        # Conversation revient dans la liste
        r = session.get(f"{API}/chat/conversations",
                        headers=_hdr(auths["client"]["token"]), timeout=15)
        peers = {c["peer_id"] for c in r.json()}
        assert auths["pro"]["uid"] in peers

    def test_reverse_pro_blocks_client_chat(self, session, auths):
        # B bloque A → même effet sur les 3 endpoints chat
        _block(session, auths["pro"]["token"], auths["client"]["uid"])

        # 11 - GET messages côté A : []
        r = session.get(f"{API}/chat/{auths['pro']['uid']}/messages",
                        headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 200 and r.json() == []

        # 12 - POST côté A : 403
        r = session.post(f"{API}/chat/{auths['pro']['uid']}/messages",
                         json={"text": "TEST"},
                         headers=_hdr(auths["client"]["token"]), timeout=15)
        assert r.status_code == 403

        # 13 - conversations côté A : peer pro absent
        r = session.get(f"{API}/chat/conversations",
                        headers=_hdr(auths["client"]["token"]), timeout=15)
        peers = {c["peer_id"] for c in r.json()}
        assert auths["pro"]["uid"] not in peers

        _unblock(session, auths["pro"]["token"], auths["client"]["uid"])


# ---------- Nettoyage final ----------
class TestZFinalCleanup:
    def test_cleanup(self, session, auths):
        _cleanup_all_blocks(session, auths)
        # Vérifie l'état vide
        for label in ("client", "pro", "driver", "sitter"):
            r = session.get(f"{API}/users/me/blocked", headers=_hdr(auths[label]["token"]), timeout=10)
            assert r.status_code == 200
            assert r.json() == [], f"Blocked list de {label} non vide: {r.json()}"
