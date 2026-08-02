"""
Iteration 30 — Retest ciblé des fixes iter29.

Backend uniquement. http://localhost:8001/api

Fixes à valider :
  C1  POST /reviews refuse si booking.status != "completed"
  C2  PATCH /bookings/{bid} refuse les transitions depuis completed/refunded/rejected/cancelled
  C3  POST /providers/me upsert ne réinitialise plus rating/reviews_count/subscription_*
  C4  PATCH cancel sur cash-payé rollback commission_due + wallet_transactions type=refund
  M5  Cash-payment → notif payment_received côté client
  M6  DELETE /users/me purge push_tokens, notification_prefs, password_resets
  M7  Cash-payment set booking.paid = true
  B9  Après double confirm-completion, le confirmer (2e signataire) reçoit AUSSI booking_completed
"""

from __future__ import annotations

import asyncio
import os
import uuid
from typing import Any, Dict, List

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE = "http://localhost:8001/api"


# ------------------ helpers ------------------

def _rid() -> str:
    return uuid.uuid4().hex[:10]


def _headers_ip() -> Dict[str, str]:
    return {
        "X-Forwarded-For": f"10.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"
    }


def _reg(role: str = "client") -> Dict[str, Any]:
    email = f"iter30-{_rid()}@test.jokoo"
    payload = {
        "name": f"Iter30 {role[:3]} {_rid()[:4]}",
        "email": email,
        "phone": f"77{uuid.uuid4().int % 10000000:07d}",
        "password": "Passw0rd!",
        "role": role,
    }
    r = requests.post(f"{BASE}/auth/register", json=payload, headers=_headers_ip(), timeout=15)
    assert r.status_code == 200, f"register KO: {r.status_code} {r.text[:200]}"
    d = r.json()
    return {
        "token": d["token"],
        "user_id": d["user"]["id"],
        "email": email,
        "password": "Passw0rd!",
        "role": role,
    }


def _h(tok: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _upsert_provider(pro: Dict[str, Any], service: str = "Plomberie", description: str = "iter30") -> Dict[str, Any]:
    payload = {
        "service": service,
        "description": description,
        "price_type": "from",
        "price_amount": 5000,
        "city": "Dakar",
        "zones": ["Dakar"],
        "hours": "9h-18h",
    }
    r = requests.post(f"{BASE}/providers/me", json=payload, headers=_h(pro["token"]), timeout=10)
    assert r.status_code == 200, f"upsert KO: {r.status_code} {r.text[:200]}"
    return r.json()["provider"]


def _create_booking(client: Dict[str, Any], provider_id: str) -> Dict[str, Any]:
    r = requests.post(
        f"{BASE}/bookings",
        json={
            "provider_id": provider_id,
            "date": "2026-02-01",
            "time": "10:00",
            "address": "adresse iter30",
            "description": "retest iter30",
        },
        headers=_h(client["token"]),
        timeout=10,
    )
    assert r.status_code == 200, f"create booking KO: {r.status_code} {r.text[:200]}"
    return r.json()


def _complete_booking(client: Dict[str, Any], pro: Dict[str, Any], bid: str) -> None:
    r1 = requests.post(f"{BASE}/bookings/{bid}/confirm-completion", headers=_h(client["token"]), timeout=10)
    assert r1.status_code == 200
    r2 = requests.post(f"{BASE}/bookings/{bid}/confirm-completion", headers=_h(pro["token"]), timeout=10)
    assert r2.status_code == 200


def _get_notifs(tok: str) -> List[Dict[str, Any]]:
    r = requests.get(f"{BASE}/notifications", headers=_h(tok), timeout=10)
    return r.json() if r.status_code == 200 else []


def _get_booking(tok: str, bid: str) -> Dict[str, Any]:
    r = requests.get(f"{BASE}/bookings/{bid}", headers=_h(tok), timeout=10)
    return r.json() if r.status_code == 200 else {}


# ------------------ fixtures ------------------

@pytest.fixture(scope="module")
def created_users() -> List[Dict[str, Any]]:
    users: List[Dict[str, Any]] = []
    yield users
    # cleanup
    for u in users:
        try:
            requests.delete(f"{BASE}/users/me", headers=_h(u["token"]), timeout=10)
        except Exception:
            pass


# ============================================================================
# C1 — POST /reviews refuse si booking.status != completed
# ============================================================================

def test_c1_review_gating_pending_then_completed(created_users):
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro)
    booking = _create_booking(client, pro["user_id"])
    bid = booking["id"]

    # Booking en pending → review refusée 400
    r_pre = requests.post(
        f"{BASE}/reviews",
        json={"booking_id": bid, "rating": 5, "comment": "prématuré"},
        headers=_h(client["token"]),
        timeout=10,
    )
    assert r_pre.status_code == 400, f"C1 FAIL: attendu 400, reçu {r_pre.status_code} — {r_pre.text[:200]}"
    detail = r_pre.json().get("detail", "").lower()
    assert "termin" in detail or "completed" in detail, f"C1 message incorrect : {detail!r}"

    # Compléter (double confirm) puis review OK
    _complete_booking(client, pro, bid)
    r_ok = requests.post(
        f"{BASE}/reviews",
        json={"booking_id": bid, "rating": 5, "comment": "après completion"},
        headers=_h(client["token"]),
        timeout=10,
    )
    assert r_ok.status_code == 200, f"C1 review post-completion KO: {r_ok.status_code} {r_ok.text[:200]}"


# ============================================================================
# C2 — PATCH /bookings/{bid} refuse les transitions incohérentes
# ============================================================================

def test_c2_transitions_from_completed_blocked(created_users):
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro)
    b = _create_booking(client, pro["user_id"])
    bid = b["id"]
    _complete_booking(client, pro, bid)

    for target in ("cancelled", "pending", "accepted"):
        # Choix bon acteur pour ne pas être bloqué par le 403 avant le 400
        actor_tok = client["token"] if target == "cancelled" else pro["token"]
        r = requests.patch(f"{BASE}/bookings/{bid}", json={"status": target},
                           headers=_h(actor_tok), timeout=10)
        # "pending" n'est pas dans l'enum Pydantic BookingUpdate → 422 acceptable
        # (rejet au niveau schéma). Pour "cancelled"/"accepted" : 400 attendu (business rule).
        if target == "pending":
            assert r.status_code in (400, 422), (
                f"C2 completed→pending attendu 400/422, reçu {r.status_code} — {r.text[:200]}"
            )
        else:
            assert r.status_code == 400, (
                f"C2 completed→{target} attendu 400, reçu {r.status_code} — {r.text[:200]}"
            )
            assert "completed" in r.json().get("detail", "").lower()


def test_c2_transitions_from_rejected_blocked(created_users):
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro)
    b = _create_booking(client, pro["user_id"])
    bid = b["id"]
    # provider rejette
    r0 = requests.patch(f"{BASE}/bookings/{bid}", json={"status": "rejected"},
                       headers=_h(pro["token"]), timeout=10)
    assert r0.status_code == 200

    # depuis rejected, aucune sortie autorisée
    r = requests.patch(f"{BASE}/bookings/{bid}", json={"status": "cancelled"},
                      headers=_h(client["token"]), timeout=10)
    assert r.status_code == 400, f"C2 rejected→cancelled attendu 400, reçu {r.status_code}"


def test_c2_transitions_from_cancelled_blocked(created_users):
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro)
    b = _create_booking(client, pro["user_id"])
    bid = b["id"]
    r0 = requests.patch(f"{BASE}/bookings/{bid}", json={"status": "cancelled"},
                       headers=_h(client["token"]), timeout=10)
    assert r0.status_code == 200

    # depuis cancelled → autre chose = 400
    r = requests.patch(f"{BASE}/bookings/{bid}", json={"status": "accepted"},
                      headers=_h(pro["token"]), timeout=10)
    assert r.status_code == 400, f"C2 cancelled→accepted attendu 400, reçu {r.status_code}"
    assert "annul" in r.json().get("detail", "").lower()


def test_c2_valid_transitions_still_ok(created_users):
    # pending → accepted → completed
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro)
    b = _create_booking(client, pro["user_id"])
    bid = b["id"]
    r1 = requests.patch(f"{BASE}/bookings/{bid}", json={"status": "accepted"},
                        headers=_h(pro["token"]), timeout=10)
    assert r1.status_code == 200, f"pending→accepted KO: {r1.status_code} {r1.text[:200]}"

    # pending → cancelled sur un autre booking
    b2 = _create_booking(client, pro["user_id"])
    r2 = requests.patch(f"{BASE}/bookings/{b2['id']}", json={"status": "cancelled"},
                        headers=_h(client["token"]), timeout=10)
    assert r2.status_code == 200, f"pending→cancelled KO: {r2.status_code}"


# ============================================================================
# C3 — POST /providers/me préserve rating & reviews_count & subscription
# ============================================================================

def test_c3_upsert_preserves_rating_and_reviews(created_users):
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro, service="Plomberie", description="init")

    # Générer une review réelle (5★)
    b = _create_booking(client, pro["user_id"])
    _complete_booking(client, pro, b["id"])
    r_rev = requests.post(f"{BASE}/reviews",
                          json={"booking_id": b["id"], "rating": 5, "comment": "top"},
                          headers=_h(client["token"]), timeout=10)
    assert r_rev.status_code == 200

    # Booking + review supplémentaires pour reviews_count = 3
    for _ in range(2):
        c2 = _reg("client"); created_users.append(c2)
        bx = _create_booking(c2, pro["user_id"])
        _complete_booking(c2, pro, bx["id"])
        rrr = requests.post(f"{BASE}/reviews",
                            json={"booking_id": bx["id"], "rating": 5, "comment": "top"},
                            headers=_h(c2["token"]), timeout=10)
        assert rrr.status_code == 200

    p_before = requests.get(f"{BASE}/providers/{pro['user_id']}", timeout=10).json()
    assert p_before.get("rating") == 5.0, f"pré-check rating: {p_before.get('rating')}"
    assert p_before.get("reviews_count") == 3, f"pré-check reviews_count: {p_before.get('reviews_count')}"

    # POST /providers/me avec nouvelle description → doit NE PAS écraser rating/reviews_count
    r_upd = requests.post(f"{BASE}/providers/me", json={
        "service": "Plomberie",
        "description": "description mise à jour",
        "price_type": "from",
        "price_amount": 6500,
        "city": "Dakar",
        "zones": ["Dakar"],
        "hours": "9h-19h",
    }, headers=_h(pro["token"]), timeout=10)
    assert r_upd.status_code == 200, f"upsert KO: {r_upd.status_code} {r_upd.text[:200]}"

    p_after = requests.get(f"{BASE}/providers/{pro['user_id']}", timeout=10).json()
    assert p_after.get("rating") == 5.0, (
        f"C3 FAIL: rating écrasé → {p_after.get('rating')} (attendu 5.0)"
    )
    assert p_after.get("reviews_count") == 3, (
        f"C3 FAIL: reviews_count écrasé → {p_after.get('reviews_count')} (attendu 3)"
    )
    # Le champ description doit avoir été mis à jour
    assert "mise à jour" in (p_after.get("description") or "")


def test_c3_new_provider_initializes_to_zero(created_users):
    pro = _reg("prestataire"); created_users.append(pro)
    # 1er upsert : rating & reviews_count = 0
    _upsert_provider(pro, service="Ménage", description="nouveau")
    p = requests.get(f"{BASE}/providers/{pro['user_id']}", timeout=10).json()
    assert p.get("rating") == 0, f"nouveau provider rating attendu 0, reçu {p.get('rating')}"
    assert p.get("reviews_count") == 0
    assert p.get("subscription_active") is False


# ============================================================================
# C4 — Cancel booking cash-payé rollback commission_due + wallet_tx refund
# ============================================================================

def test_c4_cash_cancel_rollback_commission(created_users):
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro)
    b = _create_booking(client, pro["user_id"])
    bid = b["id"]

    # commission_due avant
    w0 = requests.get(f"{BASE}/wallet/me", headers=_h(pro["token"]), timeout=10).json()
    due_before = float(w0.get("commission_due") or 0)

    # cash-payment
    r_cash = requests.post(f"{BASE}/bookings/{bid}/cash-payment",
                           json={"amount": 20000, "category": "default"},
                           headers=_h(pro["token"]), timeout=10)
    assert r_cash.status_code == 200, r_cash.text[:200]
    commission_added = float(r_cash.json().get("commission") or 0)
    assert commission_added > 0

    w1 = requests.get(f"{BASE}/wallet/me", headers=_h(pro["token"]), timeout=10).json()
    due_after_pay = float(w1.get("commission_due") or 0)
    assert due_after_pay == pytest.approx(due_before + commission_added, abs=1)

    # Cancel côté client
    r_cancel = requests.patch(f"{BASE}/bookings/{bid}", json={"status": "cancelled"},
                              headers=_h(client["token"]), timeout=10)
    assert r_cancel.status_code == 200, f"cancel KO: {r_cancel.status_code} {r_cancel.text[:200]}"

    # Wallet : commission_due doit être revenu à due_before
    w2 = requests.get(f"{BASE}/wallet/me", headers=_h(pro["token"]), timeout=10).json()
    due_after_cancel = float(w2.get("commission_due") or 0)
    assert due_after_cancel == pytest.approx(due_before, abs=1), (
        f"C4 FAIL: commission_due après cancel = {due_after_cancel} (attendu ≈ {due_before})"
    )

    # wallet_transactions : doit contenir un doc type='refund', amount_xof=-commission_added, source_booking_id=bid
    r_tx = requests.get(f"{BASE}/wallet/history?limit=50", headers=_h(pro["token"]), timeout=10)
    assert r_tx.status_code == 200, f"wallet/history KO: {r_tx.status_code} {r_tx.text[:200]}"
    txs = r_tx.json()
    refund = next(
        (t for t in txs if t.get("type") == "refund" and t.get("source_booking_id") == bid),
        None,
    )
    assert refund is not None, f"C4 FAIL: aucune wallet_transactions type=refund pour bid={bid}. Types vus: {[t.get('type') for t in txs[:10]]}"
    assert float(refund.get("amount_xof") or 0) == pytest.approx(-commission_added, abs=1), (
        f"C4 FAIL: amount_xof {refund.get('amount_xof')} attendu ≈ {-commission_added}"
    )


# ============================================================================
# M5 — Cash-payment : notif payment_received côté client
# ============================================================================

def test_m5_cash_payment_notifies_client(created_users):
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro)
    b = _create_booking(client, pro["user_id"])
    bid = b["id"]

    r = requests.post(f"{BASE}/bookings/{bid}/cash-payment",
                     json={"amount": 15000, "category": "default"},
                     headers=_h(pro["token"]), timeout=10)
    assert r.status_code == 200

    notifs = _get_notifs(client["token"])
    match = [
        n for n in notifs
        if n.get("type") == "payment_received" and n.get("booking_id") == bid
    ]
    assert match, f"M5 FAIL: aucune notif payment_received chez client. Types reçus: {[n.get('type') for n in notifs]}"
    assert match[0].get("read") is False


# ============================================================================
# M6 — DELETE /users/me purge push_tokens, notification_prefs, password_resets
# ============================================================================

@pytest.mark.asyncio
async def test_m6_delete_purges_all_collections(created_users):
    user = _reg("client")
    uid = user["user_id"]
    tok = user["token"]

    # Register push token
    r_push = requests.post(f"{BASE}/notifications/register-token",
                          json={"token": f"ExponentPushToken[iter30-{_rid()}]", "platform": "ios"},
                          headers=_h(tok), timeout=10)
    assert r_push.status_code == 200

    # Set notification_prefs (via PATCH ou POST endpoint)
    # On tente d'abord PATCH /notifications/prefs
    r_prefs = requests.patch(f"{BASE}/notifications/prefs",
                            json={"booking": True, "message": False},
                            headers=_h(tok), timeout=10)
    # Peu importe le code exact — on veut juste qu'un doc soit inséré
    # Some endpoints support POST/PATCH indifféremment
    prefs_created = r_prefs.status_code in (200, 201, 204)

    # Password reset request : nécessite email
    r_forgot = requests.post(f"{BASE}/auth/forgot-password",
                            json={"email": user["email"]},
                            headers=_headers_ip(), timeout=10)
    assert r_forgot.status_code == 200

    # Connect to Mongo direct pour vérifier
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "jokoo_db")
    mc = AsyncIOMotorClient(mongo_url)
    db = mc[db_name]

    push_before = await db.push_tokens.count_documents({"user_id": uid})
    prefs_before = await db.notification_prefs.count_documents({"user_id": uid})
    resets_before = await db.password_resets.count_documents({"user_id": uid})

    assert push_before >= 1, f"M6 précondition: push_tokens attendu >=1, trouvé {push_before}"
    assert resets_before >= 1, f"M6 précondition: password_resets attendu >=1, trouvé {resets_before}"

    # DELETE compte
    r_del = requests.delete(f"{BASE}/users/me", headers=_h(tok), timeout=15)
    assert r_del.status_code == 200

    push_after = await db.push_tokens.count_documents({"user_id": uid})
    prefs_after = await db.notification_prefs.count_documents({"user_id": uid})
    resets_after = await db.password_resets.count_documents({"user_id": uid})

    mc.close()

    assert push_after == 0, f"M6 FAIL: push_tokens non purgés (reste {push_after})"
    assert prefs_after == 0, f"M6 FAIL: notification_prefs non purgées (reste {prefs_after})"
    assert resets_after == 0, f"M6 FAIL: password_resets non purgés (reste {resets_after})"


# ============================================================================
# M7 — cash-payment set booking.paid=true
# ============================================================================

def test_m7_cash_payment_sets_paid_true(created_users):
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro)
    b = _create_booking(client, pro["user_id"])
    bid = b["id"]

    r = requests.post(f"{BASE}/bookings/{bid}/cash-payment",
                     json={"amount": 5000, "category": "default"},
                     headers=_h(pro["token"]), timeout=10)
    assert r.status_code == 200

    booking = _get_booking(client["token"], bid)
    assert booking.get("paid") is True, f"M7 FAIL: booking.paid = {booking.get('paid')} (attendu True)"
    assert booking.get("paid_at") is not None
    assert booking.get("paid_method") == "cash"


# ============================================================================
# B9 — Après double confirm, LES DEUX parties reçoivent booking_completed
# ============================================================================

def test_b9_both_parties_receive_booking_completed(created_users):
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro)
    b = _create_booking(client, pro["user_id"])
    bid = b["id"]

    # Provider accepts d'abord (facultatif, mais réaliste)
    requests.patch(f"{BASE}/bookings/{bid}", json={"status": "accepted"},
                  headers=_h(pro["token"]), timeout=10)

    # 1er confirm : client
    r1 = requests.post(f"{BASE}/bookings/{bid}/confirm-completion",
                      headers=_h(client["token"]), timeout=10)
    assert r1.status_code == 200
    # Après le 1er confirm, provider doit avoir booking_completion_requested
    pro_n = _get_notifs(pro["token"])
    assert any(n["type"] == "booking_completion_requested" and n.get("booking_id") == bid for n in pro_n), (
        "B9 précondition: notif booking_completion_requested absente chez provider après 1er confirm"
    )

    # 2e confirm : provider (le confirmer)
    r2 = requests.post(f"{BASE}/bookings/{bid}/confirm-completion",
                      headers=_h(pro["token"]), timeout=10)
    assert r2.status_code == 200

    # Notifs finales : client ET provider doivent avoir booking_completed
    client_n = _get_notifs(client["token"])
    pro_n2 = _get_notifs(pro["token"])

    client_ok = any(n["type"] == "booking_completed" and n.get("booking_id") == bid for n in client_n)
    pro_ok = any(n["type"] == "booking_completed" and n.get("booking_id") == bid for n in pro_n2)

    assert client_ok, "B9 FAIL: le client (1er signataire) n'a pas de notif booking_completed"
    assert pro_ok, "B9 FAIL: le provider (2e signataire / confirmer) n'a pas de notif booking_completed"
