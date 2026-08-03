"""Iter 31 — audit du système de notation Jokoo.

Couvre les 15 cas backend (POST /reviews, GET /reviews, GET /bookings/{bid}/review-eligibility).
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

RUN_ID = uuid.uuid4().hex[:8]


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _register(role: str, tag: str) -> tuple[str, str]:
    """Register and return (token, user_id)."""
    email = f"iter31-{tag}-{RUN_ID}@test.jokoo"
    r = requests.post(f"{API}/auth/register", json={
        "email": email,
        "password": "Passw0rd!",
        "name": f"Iter31 {tag}",
        "role": role,
        "phone": "+221771234567",
        "city": "Dakar",
    }, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    return j["token"], j["user"]["id"]


@pytest.fixture(scope="module")
def ctx():
    """Setup: client A, prestataire B (avec profil), booking completed."""
    client_tok, client_id = _register("client", "clientA")
    prov_tok, prov_id = _register("prestataire", "provB")

    # Upsert du profil prestataire
    r = requests.post(f"{API}/providers/me", headers=_hdr(prov_tok), json={
        "service": "Plombier",
        "description": "Test iter31",
        "price_type": "fixed",
        "price_amount": 15000,
        "city": "Dakar",
        "zones": ["Plateau"],
    }, timeout=15)
    assert r.status_code == 200, r.text

    # Booking pending
    r = requests.post(f"{API}/bookings", headers=_hdr(client_tok), json={
        "provider_id": prov_id,
        "date": "2026-02-01",
        "time": "10:00",
        "address": "Test address",
        "description": "Test mission iter31",
    }, timeout=15)
    assert r.status_code == 200, r.text
    booking = r.json()
    bid = booking["id"]

    # Booking pending (2ème pour test not_completed) — laissé pending
    r2 = requests.post(f"{API}/bookings", headers=_hdr(client_tok), json={
        "provider_id": prov_id,
        "date": "2026-02-02",
        "time": "10:00",
        "address": "Addr2",
        "description": "Mission pending",
    }, timeout=15)
    assert r2.status_code == 200
    bid_pending = r2.json()["id"]

    # Accepter puis confirm-completion (client + provider)
    requests.patch(f"{API}/bookings/{bid}", headers=_hdr(prov_tok), json={"status": "accepted"}, timeout=15)
    requests.post(f"{API}/bookings/{bid}/confirm-completion", headers=_hdr(client_tok), timeout=15)
    r = requests.post(f"{API}/bookings/{bid}/confirm-completion", headers=_hdr(prov_tok), timeout=15)
    assert r.status_code == 200
    # Verify completed
    detail = requests.get(f"{API}/bookings/{bid}", headers=_hdr(client_tok), timeout=15).json()
    assert detail["status"] == "completed", f"Booking not completed: {detail}"

    return {
        "client_tok": client_tok,
        "client_id": client_id,
        "prov_tok": prov_tok,
        "prov_id": prov_id,
        "bid": bid,           # completed
        "bid_pending": bid_pending,
    }


# --- Test cases (2..15) ---

def test_02_missing_booking_id(ctx):
    r = requests.post(f"{API}/reviews", headers=_hdr(ctx["client_tok"]), json={
        "provider_id": ctx["prov_id"], "rating": 4, "comment": "test"
    }, timeout=15)
    assert r.status_code == 400
    assert "booking_id" in r.text.lower()


def test_03_booking_id_bogus(ctx):
    r = requests.post(f"{API}/reviews", headers=_hdr(ctx["client_tok"]), json={
        "booking_id": "nonexistent-" + uuid.uuid4().hex, "rating": 4
    }, timeout=15)
    assert r.status_code == 404


def test_04_provider_cannot_review(ctx):
    r = requests.post(f"{API}/reviews", headers=_hdr(ctx["prov_tok"]), json={
        "booking_id": ctx["bid"], "rating": 5
    }, timeout=15)
    assert r.status_code == 403


def test_05_pending_booking_rejected(ctx):
    r = requests.post(f"{API}/reviews", headers=_hdr(ctx["client_tok"]), json={
        "booking_id": ctx["bid_pending"], "rating": 4
    }, timeout=15)
    assert r.status_code == 400
    assert "terminée" in r.text.lower() or "termin" in r.text.lower()


def test_06_valid_review(ctx):
    r = requests.post(f"{API}/reviews", headers=_hdr(ctx["client_tok"]), json={
        "booking_id": ctx["bid"], "rating": 4, "comment": "Très bon travail iter31"
    }, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["rating"] == 4
    assert j["comment"] == "Très bon travail iter31"
    assert j["provider_id"] == ctx["prov_id"]
    assert j["booking_id"] == ctx["bid"]
    assert j["author_id"] == ctx["client_id"]
    assert "id" in j and "created_at" in j
    ctx["review_id"] = j["id"]


def test_07_provider_rating_recomputed(ctx):
    r = requests.get(f"{API}/providers/{ctx['prov_id']}", timeout=15)
    assert r.status_code == 200
    p = r.json()
    assert p["rating"] == 4.0, f"Rating attendu 4.0, obtenu {p['rating']}"
    assert p["reviews_count"] == 1, f"reviews_count attendu 1, obtenu {p['reviews_count']}"


def test_08_review_received_notification(ctx):
    time.sleep(0.5)
    r = requests.get(f"{API}/notifications", headers=_hdr(ctx["prov_tok"]), timeout=15)
    assert r.status_code == 200
    notifs = r.json()
    review_notifs = [n for n in notifs if n.get("type") == "review_received"]
    assert len(review_notifs) >= 1, f"Aucune notif review_received: {notifs[:3]}"
    n = review_notifs[0]
    assert n.get("booking_id") == ctx["bid"]


def test_09_double_review_rejected(ctx):
    r = requests.post(f"{API}/reviews", headers=_hdr(ctx["client_tok"]), json={
        "booking_id": ctx["bid"], "rating": 5, "comment": "double"
    }, timeout=15)
    assert r.status_code == 400
    assert "déjà" in r.text.lower() or "deja" in r.text.lower() or "already" in r.text.lower()


def test_10_rating_zero_rejected(ctx):
    # Need another completed booking for pydantic to be checked before other rules
    r = requests.post(f"{API}/reviews", headers=_hdr(ctx["client_tok"]), json={
        "booking_id": ctx["bid"], "rating": 0
    }, timeout=15)
    assert r.status_code == 422


def test_11_rating_six_rejected(ctx):
    r = requests.post(f"{API}/reviews", headers=_hdr(ctx["client_tok"]), json={
        "booking_id": ctx["bid"], "rating": 6
    }, timeout=15)
    assert r.status_code == 422


def test_12_empty_comment_allowed(ctx):
    """Créer un nouveau booking completed pour tester avis avec comment=''."""
    # Nouveau booking completed
    r = requests.post(f"{API}/bookings", headers=_hdr(ctx["client_tok"]), json={
        "provider_id": ctx["prov_id"],
        "date": "2026-02-05",
        "time": "10:00",
        "address": "Addr3",
        "description": "Mission empty comment",
    }, timeout=15)
    assert r.status_code == 200
    bid3 = r.json()["id"]
    requests.patch(f"{API}/bookings/{bid3}", headers=_hdr(ctx["prov_tok"]), json={"status": "accepted"}, timeout=15)
    requests.post(f"{API}/bookings/{bid3}/confirm-completion", headers=_hdr(ctx["client_tok"]), timeout=15)
    requests.post(f"{API}/bookings/{bid3}/confirm-completion", headers=_hdr(ctx["prov_tok"]), timeout=15)
    # Review sans commentaire
    r = requests.post(f"{API}/reviews", headers=_hdr(ctx["client_tok"]), json={
        "booking_id": bid3, "rating": 5, "comment": ""
    }, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["comment"] == ""
    ctx["bid3"] = bid3


def test_13_self_review_edge_case(ctx):
    """
    Un utilisateur qui est à la fois client et prestataire ne peut pas se noter.
    On simule via un booking où client_id == provider_id (edge case artificiel : on injecte en base).
    """
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio

    from dotenv import load_dotenv
    from pathlib import Path
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")

    async def _inject_self_booking():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        bid = str(uuid.uuid4())
        await db.bookings.insert_one({
            "id": bid,
            "client_id": ctx["prov_id"],
            "client_name": "Self",
            "provider_id": ctx["prov_id"],
            "provider_name": "Self",
            "provider_service": "Plombier",
            "date": "2026-02-10", "time": "10:00",
            "address": "self", "description": "self",
            "status": "completed", "price": 0, "price_type": "fixed",
            "created_at": "2026-01-01T00:00:00+00:00",
        })
        c.close()
        return bid

    bid_self = asyncio.get_event_loop().run_until_complete(_inject_self_booking())
    r = requests.post(f"{API}/reviews", headers=_hdr(ctx["prov_tok"]), json={
        "booking_id": bid_self, "rating": 5
    }, timeout=15)
    # Attendu : 400 self-review OR 403 (client_id == provider_id passed both filters)
    # Vu le code : b["client_id"] == user["id"] passe, status completed passe, review_id absent, puis provider_id == user["id"] → 400.
    assert r.status_code == 400, f"Attendu 400, obtenu {r.status_code}: {r.text}"
    assert "propre" in r.text.lower() or "self" in r.text.lower() or "noter" in r.text.lower()


def test_14_list_reviews_public(ctx):
    r = requests.get(f"{API}/reviews", params={"provider_id": ctx["prov_id"], "limit": 20}, timeout=15)
    assert r.status_code == 200, r.text
    reviews = r.json()
    assert isinstance(reviews, list)
    assert len(reviews) >= 2  # test_06 + test_12
    # Triés récent → ancien
    dates = [r_.get("created_at", "") for r_ in reviews]
    assert dates == sorted(dates, reverse=True), "Non trié desc"
    # Contient bien le premier avis publié
    ids = [r_["id"] for r_ in reviews]
    assert ctx.get("review_id") in ids


def test_15_eligibility_endpoint(ctx):
    # a) completed sans review → eligible=false already_reviewed (car test_06 a posté)
    r = requests.get(f"{API}/bookings/{ctx['bid']}/review-eligibility", headers=_hdr(ctx["client_tok"]), timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j["eligible"] is False
    assert j["reason"] == "already_reviewed"
    assert "existing_review_id" in j

    # b) pending → not_completed
    r = requests.get(f"{API}/bookings/{ctx['bid_pending']}/review-eligibility", headers=_hdr(ctx["client_tok"]), timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j["eligible"] is False
    assert j["reason"] == "not_completed"

    # c) not_owner : le prestataire regarde son propre booking
    r = requests.get(f"{API}/bookings/{ctx['bid']}/review-eligibility", headers=_hdr(ctx["prov_tok"]), timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j["eligible"] is False
    assert j["reason"] == "not_owner"

    # d) eligible=true : créer un booking completed sans review
    rb = requests.post(f"{API}/bookings", headers=_hdr(ctx["client_tok"]), json={
        "provider_id": ctx["prov_id"], "date": "2026-02-20", "time": "10:00",
        "address": "elig", "description": "elig",
    }, timeout=15)
    bid4 = rb.json()["id"]
    requests.patch(f"{API}/bookings/{bid4}", headers=_hdr(ctx["prov_tok"]), json={"status": "accepted"}, timeout=15)
    requests.post(f"{API}/bookings/{bid4}/confirm-completion", headers=_hdr(ctx["client_tok"]), timeout=15)
    requests.post(f"{API}/bookings/{bid4}/confirm-completion", headers=_hdr(ctx["prov_tok"]), timeout=15)
    r = requests.get(f"{API}/bookings/{bid4}/review-eligibility", headers=_hdr(ctx["client_tok"]), timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert j["eligible"] is True, f"Attendu eligible=true, obtenu {j}"
