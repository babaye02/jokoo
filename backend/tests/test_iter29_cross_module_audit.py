"""
Iteration 29 — Audit transversal Jokoo (cross-module cascades).

Objectif : valider que chaque action se propage aux bons modules,
et détecter les incohérences (données zombie / orphelines / non-rollback).

Backend only. Utilise http://localhost:8001/api.
Comptes de test créés dynamiquement puis supprimés en fin.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional, Tuple

import pytest
import requests

BASE = "http://localhost:8001/api"

# Rapport structuré cumulé — écrit en fin de session dans /app/test_reports/iter29_report.json
REPORT: Dict[str, Any] = {
    "cascades": {},
    "critical": [],
    "major": [],
    "minor": [],
    "observations": [],
    "notif_types_analysis": {},
}


# --------------------- helpers ---------------------

def _rid() -> str:
    return uuid.uuid4().hex[:10]


def _reg(role: str = "client") -> Dict[str, Any]:
    """Enregistre un compte audit-<uuid>@test.jokoo unique."""
    email = f"audit-{_rid()}@test.jokoo"
    payload = {
        "name": f"Audit {role[:3]} {_rid()[:4]}",
        "email": email,
        "phone": f"77{uuid.uuid4().int % 10000000:07d}",
        "password": "Passw0rd!",
        "role": role,
    }
    headers = {"X-Forwarded-For": f"10.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"}
    r = requests.post(f"{BASE}/auth/register", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, f"register KO {r.status_code} {r.text[:200]}"
    data = r.json()
    return {
        "token": data["token"],
        "user_id": data["user"]["id"],
        "email": email,
        "password": "Passw0rd!",
        "name": payload["name"],
        "role": role,
    }


def _h(tok: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _cleanup(users: List[Dict[str, Any]]) -> None:
    for u in users:
        try:
            requests.delete(f"{BASE}/users/me", headers=_h(u["token"]), timeout=10)
        except Exception:
            pass


def _get_notifs(tok: str) -> List[Dict[str, Any]]:
    r = requests.get(f"{BASE}/notifications", headers=_h(tok), timeout=10)
    if r.status_code != 200:
        return []
    return r.json() or []


def _upsert_provider(pro: Dict[str, Any], service: str = "Plomberie", city: str = "Dakar") -> Dict[str, Any]:
    payload = {
        "service": service,
        "description": "Test provider iter29",
        "price_type": "from",
        "price_amount": 5000,
        "city": city,
        "zones": [city],
        "hours": "9h-18h",
    }
    r = requests.post(f"{BASE}/providers/me", json=payload, headers=_h(pro["token"]), timeout=10)
    assert r.status_code == 200, f"upsert provider KO: {r.status_code} {r.text[:200]}"
    return r.json()["provider"]


def _create_booking(client: Dict[str, Any], provider_id: str) -> Dict[str, Any]:
    payload = {
        "provider_id": provider_id,
        "date": "2026-01-15",
        "time": "10:00",
        "address": "Test address",
        "description": "audit iter29",
    }
    r = requests.post(f"{BASE}/bookings", json=payload, headers=_h(client["token"]), timeout=10)
    assert r.status_code == 200, f"create booking KO: {r.status_code} {r.text[:200]}"
    return r.json()


# --------------------- fixtures ---------------------

@pytest.fixture(scope="module")
def created_users() -> List[Dict[str, Any]]:
    users: List[Dict[str, Any]] = []
    yield users
    _cleanup(users)
    # Sauver le rapport structuré
    with open("/app/test_reports/iter29_report.json", "w") as f:
        json.dump(REPORT, f, indent=2, ensure_ascii=False)


# --------------------- Cascade 1 : Réservation créée ---------------------

def test_cascade_1_booking_created(created_users):
    """POST /bookings → visible client & provider, notif booking_new, admin counters incrémentés."""
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro)

    # snapshot admin (via admin@jokoo.sn)
    admin_login = requests.post(f"{BASE}/auth/login", json={"email": "admin@jokoo.sn", "password": "Admin1234!"}, timeout=10)
    admin_tok = admin_login.json()["token"] if admin_login.status_code == 200 else None
    before_count = None
    if admin_tok:
        r = requests.get(f"{BASE}/admin/stats/marketplace", headers=_h(admin_tok), timeout=10)
        if r.status_code == 200:
            before_count = r.json()

    booking = _create_booking(client, pro["user_id"])
    bid = booking["id"]

    # 1a - GET /bookings client
    r_c = requests.get(f"{BASE}/bookings", headers=_h(client["token"]), timeout=10)
    assert r_c.status_code == 200
    client_ok = any(b["id"] == bid for b in r_c.json())

    # 1b - GET /bookings provider
    r_p = requests.get(f"{BASE}/bookings", headers=_h(pro["token"]), timeout=10)
    provider_ok = any(b["id"] == bid for b in r_p.json())

    # 1c - notif booking_new pour provider
    notifs = _get_notifs(pro["token"])
    notif_ok = any(n["type"] == "booking_new" and n.get("booking_id") == bid and n["read"] is False for n in notifs)

    # 1d - admin stats
    after_ok = None
    if admin_tok:
        r2 = requests.get(f"{BASE}/admin/stats/marketplace", headers=_h(admin_tok), timeout=10)
        if r2.status_code == 200 and before_count:
            after_ok = r2.json() != before_count  # a bougé
        else:
            after_ok = None

    REPORT["cascades"]["1_booking_created"] = {
        "visible_client": client_ok,
        "visible_provider": provider_ok,
        "notif_booking_new_unread": notif_ok,
        "admin_marketplace_stats_changed": after_ok,
        "admin_endpoint_status": admin_login.status_code,
    }
    assert client_ok and provider_ok and notif_ok, "Cascade 1 KO"


# --------------------- Cascade 3 : Cash payment ---------------------

def test_cascade_3_cash_payment(created_users):
    """Cash payment: booking.paid_at, paid_method=cash, wallet commission_due, notif au prestataire (pas au client)."""
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro)
    booking = _create_booking(client, pro["user_id"])
    bid = booking["id"]

    # Cash payment 10 000 F CFA
    r = requests.post(f"{BASE}/bookings/{bid}/cash-payment",
                      json={"amount": 10000, "category": "default"},
                      headers=_h(pro["token"]), timeout=10)
    assert r.status_code == 200, r.text[:200]
    cash_resp = r.json()

    # Wallet reflète
    r_w = requests.get(f"{BASE}/wallet/me", headers=_h(pro["token"]), timeout=10)
    wallet_ok = r_w.status_code == 200 and r_w.json().get("commission_due", 0) > 0

    # Wallet transactions log
    r_t = requests.get(f"{BASE}/wallet/transactions?limit=20", headers=_h(pro["token"]), timeout=10)
    tx_ok = r_t.status_code == 200 and any(
        t.get("type") == "cash_commission_due" and t.get("booking_id") == bid for t in r_t.json()
    )

    # Booking bien marqué payé (paid_at + paid_method)
    bookings_pro = requests.get(f"{BASE}/bookings", headers=_h(pro["token"]), timeout=10).json()
    booking_after = next((b for b in bookings_pro if b["id"] == bid), {})
    booking_paid_flag = booking_after.get("paid_at") is not None and booking_after.get("paid_method") == "cash"
    booking_has_paid_true = booking_after.get("paid") is True  # champ initial "paid":False jamais mis à True → observation

    # Notif client
    client_notifs = _get_notifs(client["token"])
    client_notif_present = any(n.get("booking_id") == bid and "cash" in n.get("type", "").lower() for n in client_notifs)
    # Notif provider commission_due
    pro_notifs = _get_notifs(pro["token"])
    pro_notif_commission = any(n["type"] == "commission_due" for n in pro_notifs)

    REPORT["cascades"]["3_cash_payment"] = {
        "wallet_commission_due_incremented": wallet_ok,
        "wallet_transactions_logged": tx_ok,
        "booking_paid_at_set": booking_paid_flag,
        "booking_paid_flag_true": booking_has_paid_true,
        "notif_client_cash_recorded": client_notif_present,
        "notif_provider_commission_due": pro_notif_commission,
        "response": cash_resp,
    }

    # Contrat critique cash: doit poser paid_at + paid_method + notif provider
    assert booking_paid_flag, "paid_at ou paid_method absent"
    assert pro_notif_commission, "notif commission_due absente pour le prestataire"

    if not client_notif_present:
        REPORT["major"].append({
            "cascade": 3,
            "issue": "Aucune notification n'est envoyée au CLIENT après enregistrement d'un paiement cash par le prestataire.",
            "fichier": "/app/backend/server.py:1572-1640 (record_cash_payment)",
            "impact": "Le client ne sait pas que le prestataire a déclaré avoir reçu le paiement — pas de traçabilité côté client.",
            "proposed_fix": "Insérer une notification au client_id avec type 'payment_received' (booking_id, amount, method=cash) dans record_cash_payment."
        })
    if not booking_has_paid_true:
        REPORT["observations"].append({
            "cascade": 3,
            "note": "booking.paid initialisé à False n'est jamais mis à True lors du cash-payment. Le contrat d'écriture est 'paid_at' + 'paid_method' — l'ancien champ 'paid' reste False → double source de vérité (bug de cohérence UX si consommateurs frontend/admin lisent 'paid'). Recommander d'aligner : soit supprimer 'paid', soit le mettre à True dans record_cash_payment et record du webhook Stripe."
        })

    # Test blocage débit: pousser commission_due > seuil et vérifier POST /bookings 403
    # (seuil est COMMISSION_DEBT_THRESHOLD_FCFA = 15000 par défaut). Ici gross=10000 → commission ~1000-2000. Faire plusieurs cash-payments.
    is_blocked_initial = cash_resp.get("blocked", False)
    if not is_blocked_initial:
        # Ajouter plusieurs bookings + cash pour atteindre le seuil
        for _ in range(15):
            b2 = _create_booking(client, pro["user_id"])
            rr = requests.post(f"{BASE}/bookings/{b2['id']}/cash-payment",
                               json={"amount": 100000, "category": "default"},
                               headers=_h(pro["token"]), timeout=10)
            if rr.status_code == 200 and rr.json().get("blocked"):
                break
    # Tenter un nouveau booking après blocage éventuel
    other_client = _reg("client"); created_users.append(other_client)
    booking_when_blocked = requests.post(
        f"{BASE}/bookings",
        json={"provider_id": pro["user_id"], "date": "2026-02-01", "time": "12:00",
              "address": "z", "description": "post-block"},
        headers=_h(other_client["token"]), timeout=10)
    REPORT["cascades"]["3_cash_payment"]["booking_after_block_status"] = booking_when_blocked.status_code
    REPORT["cascades"]["3_cash_payment"]["booking_after_block_expected_403"] = (booking_when_blocked.status_code == 403)


# --------------------- Cascade 4 : Cancellation (+ rollback commission ?) ---------------------

def test_cascade_4_cancellation_rollback(created_users):
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro)
    booking = _create_booking(client, pro["user_id"])
    bid = booking["id"]

    # Cash payment d'abord
    requests.post(f"{BASE}/bookings/{bid}/cash-payment",
                  json={"amount": 20000, "category": "default"},
                  headers=_h(pro["token"]), timeout=10)
    w_before = requests.get(f"{BASE}/wallet/me", headers=_h(pro["token"]), timeout=10).json()

    # notif booking_new prestataire (avant cancel)
    pro_notifs_before = _get_notifs(pro["token"])
    booking_new_unread_before = [n for n in pro_notifs_before if n["type"] == "booking_new" and n.get("booking_id") == bid]

    # Cancel côté client
    r_c = requests.patch(f"{BASE}/bookings/{bid}", json={"status": "cancelled"}, headers=_h(client["token"]), timeout=10)
    cancel_status_code = r_c.status_code

    w_after = requests.get(f"{BASE}/wallet/me", headers=_h(pro["token"]), timeout=10).json()
    commission_rollback = w_after.get("commission_due", 0) < w_before.get("commission_due", 0)

    # Notif zombie: la notif booking_new est-elle remise à read=False ou reste comme avant ?
    pro_notifs_after = _get_notifs(pro["token"])
    booking_new_after = [n for n in pro_notifs_after if n["type"] == "booking_new" and n.get("booking_id") == bid]

    # Booking status effectif
    bookings_after = requests.get(f"{BASE}/bookings", headers=_h(pro["token"]), timeout=10).json()
    b_after = next((b for b in bookings_after if b["id"] == bid), {})

    # Notif booking_cancelled à l'autre partie
    cancel_notif_provider = any(n["type"] == "booking_cancelled" and n.get("booking_id") == bid for n in pro_notifs_after)

    REPORT["cascades"]["4_cancellation"] = {
        "cancel_status_code": cancel_status_code,
        "booking_status_final": b_after.get("status"),
        "commission_due_rolled_back": commission_rollback,
        "commission_due_before": w_before.get("commission_due"),
        "commission_due_after": w_after.get("commission_due"),
        "booking_new_notif_count_before": len(booking_new_unread_before),
        "booking_new_notif_count_after": len(booking_new_after),
        "cancel_notif_delivered_to_provider": cancel_notif_provider,
    }

    if not commission_rollback:
        REPORT["critical"].append({
            "cascade": 4,
            "issue": "Annulation d'un booking après cash-payment N'annule PAS la commission_due dans le wallet du prestataire.",
            "fichier": "/app/backend/server.py:1249-1303 (update_booking) — aucun rollback wallet quand status → cancelled",
            "impact": "Un prestataire peut voir sa dette de commission gonfler à cause de bookings annulés après cash-payment. À terme, is_blocked_debt=True pour rien.",
            "proposed_fix": "Dans update_booking, lorsque status devient 'cancelled' ET que booking.paid_method=='cash' ET commission_status=='due' : décrémenter wallets.commission_due de booking.commission et insérer une wallet_transaction de type 'cash_commission_reversed'. Recalculer is_blocked_debt."
        })

    # Ride cancellation seats restoration
    driver = _reg("prestataire"); created_users.append(driver)
    r_ride = requests.post(f"{BASE}/rides", json={
        "from_city": "Dakar", "to_city": "Thiès", "date": "2026-02-01",
        "time": "08:00", "seats_available": 3, "price_per_seat": 3000
    }, headers=_h(driver["token"]), timeout=10)
    ride_seats_result = {"created_status": r_ride.status_code}
    if r_ride.status_code == 200:
        ride = r_ride.json()
        rid = ride["id"]
        # book seat
        rider = _reg("client"); created_users.append(rider)
        rb = requests.post(f"{BASE}/rides/{rid}/book", json={"seats": 2},
                           headers=_h(rider["token"]), timeout=10)
        ride_seats_result["book_status"] = rb.status_code
        if rb.status_code == 200:
            booking_id = rb.json().get("id") or rb.json().get("booking_id")
            r_ride_after_book = requests.get(f"{BASE}/rides/{rid}", timeout=10)
            seats_after_book = r_ride_after_book.json().get("seats_available") if r_ride_after_book.status_code == 200 else None
            # cancel
            rc = requests.patch(f"{BASE}/rides/bookings/{booking_id}",
                                json={"status": "cancelled"}, headers=_h(rider["token"]), timeout=10)
            ride_seats_result["cancel_status"] = rc.status_code
            r_ride_after_cancel = requests.get(f"{BASE}/rides/{rid}", timeout=10)
            seats_after_cancel = r_ride_after_cancel.json().get("seats_available") if r_ride_after_cancel.status_code == 200 else None
            ride_seats_result["seats_after_book"] = seats_after_book
            ride_seats_result["seats_after_cancel"] = seats_after_cancel
            ride_seats_result["seats_restored"] = (
                seats_after_book is not None and seats_after_cancel is not None
                and seats_after_cancel > seats_after_book
            )
    REPORT["cascades"]["4_cancellation"]["ride"] = ride_seats_result


# --------------------- Cascade 5 : Complétion (double confirm) & review interdite avant ---------------------

def test_cascade_5_completion_and_review_gating(created_users):
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro)
    booking = _create_booking(client, pro["user_id"])
    bid = booking["id"]

    # Provider accepts
    requests.patch(f"{BASE}/bookings/{bid}", json={"status": "accepted"}, headers=_h(pro["token"]), timeout=10)

    # Try review BEFORE completion → doit être refusé (attente business)
    r_pre_review = requests.post(f"{BASE}/reviews",
                                 json={"booking_id": bid, "rating": 5, "comment": "avant"},
                                 headers=_h(client["token"]), timeout=10)
    review_before_status = r_pre_review.status_code
    review_before_id = r_pre_review.json().get("id") if r_pre_review.status_code == 200 else None

    # 1st confirm : client
    r1 = requests.post(f"{BASE}/bookings/{bid}/confirm-completion", headers=_h(client["token"]), timeout=10)
    after_first = requests.get(f"{BASE}/bookings", headers=_h(client["token"]), timeout=10).json()
    status_after_first = next((b for b in after_first if b["id"] == bid), {}).get("status")

    # 2nd confirm : provider
    r2 = requests.post(f"{BASE}/bookings/{bid}/confirm-completion", headers=_h(pro["token"]), timeout=10)
    after_second = requests.get(f"{BASE}/bookings", headers=_h(client["token"]), timeout=10).json()
    b_final = next((b for b in after_second if b["id"] == bid), {})

    # Notif booking_completed 2 parties
    client_notifs = _get_notifs(client["token"])
    pro_notifs = _get_notifs(pro["token"])
    notif_client_completed = any(n["type"] == "booking_completed" and n.get("booking_id") == bid for n in client_notifs)
    notif_pro_completed = any(n["type"] == "booking_completed" and n.get("booking_id") == bid for n in pro_notifs)

    # Cancel après completed → doit être refusé (attente business)
    r_cancel_after = requests.patch(f"{BASE}/bookings/{bid}", json={"status": "cancelled"}, headers=_h(client["token"]), timeout=10)

    REPORT["cascades"]["5_completion_review_gating"] = {
        "review_before_completion_status": review_before_status,
        "review_before_completion_created": review_before_id is not None,
        "status_after_first_confirm": status_after_first,
        "status_after_second_confirm": b_final.get("status"),
        "completed_at_set": b_final.get("completed_at") is not None,
        "notif_booking_completed_client": notif_client_completed,
        "notif_booking_completed_provider": notif_pro_completed,
        "cancel_after_completed_status": r_cancel_after.status_code,
    }

    if review_before_id is not None:
        REPORT["critical"].append({
            "cascade": 5,
            "issue": "Une review peut être créée AVANT que le booking soit 'completed' (statut pending/accepted suffit).",
            "fichier": "/app/backend/server.py:1307-1360 (create_review)",
            "impact": "Un client peut noter un prestataire sans jamais que la mission soit terminée → fraude possible (avis fake / chantage / dénigrement).",
            "proposed_fix": "Dans create_review, si booking_id est fourni : vérifier b['status'] == 'completed' avant d'accepter. Retourner 400 'La réservation doit être terminée avant de laisser un avis.' sinon."
        })

    if r_cancel_after.status_code in (200, 201):
        REPORT["critical"].append({
            "cascade": 5,
            "issue": "Un booking déjà 'completed' peut être remis en 'cancelled' via PATCH /bookings.",
            "fichier": "/app/backend/server.py:1249-1303 (update_booking)",
            "impact": "Corruption d'état : historique comptable rendu incohérent (mission facturée + annulée).",
            "proposed_fix": "Refuser toute transition depuis 'completed' vers autre statut. Ajouter une garde : if b['status']=='completed': raise 422."
        })


# --------------------- Cascade 6 : Review — provider rating recomputé ---------------------

def test_cascade_6_review_recompute(created_users):
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro)
    booking = _create_booking(client, pro["user_id"])
    bid = booking["id"]
    # completion bilatérale
    requests.post(f"{BASE}/bookings/{bid}/confirm-completion", headers=_h(client["token"]), timeout=10)
    requests.post(f"{BASE}/bookings/{bid}/confirm-completion", headers=_h(pro["token"]), timeout=10)

    # Review
    r = requests.post(f"{BASE}/reviews", json={"booking_id": bid, "rating": 4, "comment": "audit"}, headers=_h(client["token"]), timeout=10)
    review_ok = r.status_code == 200

    # provider rating
    r_p = requests.get(f"{BASE}/providers/{pro['user_id']}", timeout=10)
    provider = r_p.json() if r_p.status_code == 200 else {}
    rating_recomputed = provider.get("rating") == 4 and provider.get("reviews_count") == 1

    # Booking review_id set
    bookings_after = requests.get(f"{BASE}/bookings", headers=_h(client["token"]), timeout=10).json()
    booking_after = next((b for b in bookings_after if b["id"] == bid), {})
    review_id_set = booking_after.get("review_id") is not None

    # Double review sur même booking
    r2 = requests.post(f"{BASE}/reviews", json={"booking_id": bid, "rating": 3, "comment": "dup"}, headers=_h(client["token"]), timeout=10)
    dup_rejected = r2.status_code == 400

    # Notif review_received
    pro_notifs = _get_notifs(pro["token"])
    notif_review = any(n["type"] == "review_received" and n.get("booking_id") == bid for n in pro_notifs)

    REPORT["cascades"]["6_review_recompute"] = {
        "review_ok": review_ok,
        "provider_rating": provider.get("rating"),
        "provider_reviews_count": provider.get("reviews_count"),
        "rating_recomputed_correctly": rating_recomputed,
        "booking_review_id_set": review_id_set,
        "double_review_rejected_400": dup_rejected,
        "notif_review_received": notif_review,
    }

    assert review_ok
    assert rating_recomputed, f"Rating not recomputed correctly: {provider.get('rating')} / {provider.get('reviews_count')}"
    assert dup_rejected


# --------------------- Cascade 7 : Provider profile edit — bookings stale ? ---------------------

def test_cascade_7_provider_edit_stale_bookings(created_users):
    client = _reg("client"); created_users.append(client)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro, service="Plomberie", city="Dakar")
    booking = _create_booking(client, pro["user_id"])
    bid = booking["id"]
    provider_name_before = booking.get("provider_name")
    service_before = booking.get("provider_service")

    # Edit provider profile: service change
    requests.post(f"{BASE}/providers/me", json={
        "service": "Menuiserie", "description": "new desc",
        "price_type": "from", "price_amount": 8000,
        "city": "Thiès", "zones": ["Thiès"], "hours": "10h-19h"
    }, headers=_h(pro["token"]), timeout=10)

    # Re-fetch provider
    r_p = requests.get(f"{BASE}/providers/{pro['user_id']}", timeout=10)
    provider_after = r_p.json() if r_p.status_code == 200 else {}
    reflect_service = provider_after.get("service_key") == "menuiserie" or provider_after.get("service") == "Menuiserie"

    # Filtre nouveau service
    r_ls = requests.get(f"{BASE}/providers?service=menuiserie", timeout=10)
    filter_ok = r_ls.status_code == 200 and any(p["id"] == pro["user_id"] for p in r_ls.json())

    # Booking historique : provider_name / provider_service à jour ?
    bookings_after = requests.get(f"{BASE}/bookings", headers=_h(client["token"]), timeout=10).json()
    b_after = next((b for b in bookings_after if b["id"] == bid), {})
    booking_service_stale = b_after.get("provider_service") == service_before  # inchangé

    # rating écrasé ?
    rating_reset = provider_after.get("rating") == 0 and provider_after.get("reviews_count") == 0

    REPORT["cascades"]["7_provider_edit_stale_bookings"] = {
        "provider_after_service_key": provider_after.get("service_key"),
        "provider_reflects_edit": reflect_service,
        "filter_by_new_service_ok": filter_ok,
        "booking_provider_service_before": service_before,
        "booking_provider_service_after": b_after.get("provider_service"),
        "booking_stale": booking_service_stale,
        "provider_rating_reset_to_0": rating_reset,
    }

    if booking_service_stale:
        REPORT["major"].append({
            "cascade": 7,
            "issue": "Les bookings historiques stockent 'provider_name'/'provider_service' EN DUR à la création et ne sont pas mis à jour quand le prestataire édite son profil.",
            "fichier": "/app/backend/server.py:1103-1122 (create_booking) + upsert_my_provider",
            "impact": "UX : le client voit 'Plomberie' dans son historique alors que le prestataire fait maintenant 'Menuiserie'. Techniquement voulu (snapshot temporel), mais si le nom change (marque, activité), l'historique peut sembler cassé.",
            "proposed_fix": "Deux options : (a) accepter comme snapshot légitime et documenter, ou (b) résoudre dynamiquement provider_name/service à l'affichage via une jointure sur providers (au prix de perdre l'historique du nom exact au moment de la réservation)."
        })

    # Bug critique éventuel : rating écrasé par upsert
    # → seulement si un review avait été créé avant l'edit. Ajoutons un test express:
    pro2 = _reg("prestataire"); created_users.append(pro2)
    client2 = _reg("client"); created_users.append(client2)
    _upsert_provider(pro2, service="Plomberie", city="Dakar")
    b2 = _create_booking(client2, pro2["user_id"])
    requests.post(f"{BASE}/bookings/{b2['id']}/confirm-completion", headers=_h(client2["token"]), timeout=10)
    requests.post(f"{BASE}/bookings/{b2['id']}/confirm-completion", headers=_h(pro2["token"]), timeout=10)
    requests.post(f"{BASE}/reviews", json={"booking_id": b2["id"], "rating": 5, "comment": "top"}, headers=_h(client2["token"]), timeout=10)
    provider_before_edit = requests.get(f"{BASE}/providers/{pro2['user_id']}", timeout=10).json()
    rating_before = provider_before_edit.get("rating")
    count_before = provider_before_edit.get("reviews_count")

    # Now edit profile
    requests.post(f"{BASE}/providers/me", json={
        "service": "Plomberie", "description": "updated",
        "price_type": "from", "price_amount": 6000,
        "city": "Dakar", "zones": ["Dakar"], "hours": "9h-18h"
    }, headers=_h(pro2["token"]), timeout=10)
    provider_after_edit = requests.get(f"{BASE}/providers/{pro2['user_id']}", timeout=10).json()
    rating_after = provider_after_edit.get("rating")
    count_after = provider_after_edit.get("reviews_count")

    REPORT["cascades"]["7_provider_edit_stale_bookings"]["rating_before_edit"] = rating_before
    REPORT["cascades"]["7_provider_edit_stale_bookings"]["rating_after_edit"] = rating_after
    REPORT["cascades"]["7_provider_edit_stale_bookings"]["reviews_count_before_edit"] = count_before
    REPORT["cascades"]["7_provider_edit_stale_bookings"]["reviews_count_after_edit"] = count_after

    if rating_after != rating_before or count_after != count_before:
        REPORT["critical"].append({
            "cascade": 7,
            "issue": "L'upsert /providers/me RÉINITIALISE rating=0 et reviews_count=0 à CHAQUE édition de profil.",
            "fichier": "/app/backend/server.py:1049-1074 (upsert_my_provider) — le doc contient 'rating': 0, 'reviews_count': 0 systématiquement.",
            "impact": "CRITIQUE : chaque fois qu'un prestataire modifie son profil (photo, prix, description...), il perd toute son évaluation publique. Perte de confiance/réputation instantanée.",
            "proposed_fix": "Ne PAS écraser rating/reviews_count/subscription_active/subscription_until/verified en upsert. Utiliser un update_one avec $set n'incluant que les champs du body, ou récupérer d'abord le doc existant et préserver ces champs. Alternativement, retirer ces 4 champs du doc et laisser la logique reviews les gérer."
        })


# --------------------- Cascade 9 : DELETE /users/me — cascade cleanup ---------------------

def test_cascade_9_account_deletion_cleanup(created_users):
    """Créer user avec données, DELETE, vérifier purges/anonymisation."""
    user = _reg("client"); created_users.append(user)
    pro = _reg("prestataire"); created_users.append(pro)
    _upsert_provider(pro)
    # Créer données : booking, favorite, push_token, notif reçue (via booking_new inverse), message
    booking = _create_booking(user, pro["user_id"])
    bid = booking["id"]

    # Favorite
    fav_r = requests.post(f"{BASE}/favorites", json={"provider_id": pro["user_id"]}, headers=_h(user["token"]), timeout=10)
    # Push token
    push_r = requests.post(f"{BASE}/push/register",
                           json={"token": f"ExponentPushToken[test-{_rid()}]"},
                           headers=_h(user["token"]), timeout=10)
    # Send message user->pro
    msg_r = requests.post(f"{BASE}/messages",
                          json={"to_id": pro["user_id"], "text": "audit iter29 message"},
                          headers=_h(user["token"]), timeout=10)
    # Block user
    block_r = requests.post(f"{BASE}/users/{pro['user_id']}/block", headers=_h(user["token"]), timeout=10)

    old_token = user["token"]
    uid = user["user_id"]

    # DELETE
    d = requests.delete(f"{BASE}/users/me", headers=_h(old_token), timeout=15)
    delete_status = d.status_code

    # Verify token invalidated
    me_r = requests.get(f"{BASE}/auth/me", headers=_h(old_token), timeout=10)
    token_invalidated = me_r.status_code == 401

    # Vérifier depuis provider ce qu'il reste
    pro_bookings = requests.get(f"{BASE}/bookings", headers=_h(pro["token"]), timeout=10).json()
    b_anon = next((b for b in pro_bookings if b["id"] == bid), None)
    booking_anonymised = b_anon is not None and (b_anon.get("client_name") in ("[Compte supprimé]", "Utilisateur supprimé"))

    # push_tokens : indirect via re-register avec new user (can't inspect DB) → check server behavior. On lit la présence via un helper interne : impossible. On reste sur observation code.
    # Notifications : ont-elles été purgées ? L'endpoint /notifications utilise le user courant → user supprimé → 401. Impossible de vérifier autrement sans DB.
    # Messages : idem — anonymisées côté provider ?
    msgs_r = requests.get(f"{BASE}/messages/{uid}", headers=_h(pro["token"]), timeout=10)
    msg_anonymised = False
    if msgs_r.status_code == 200:
        msgs = msgs_r.json()
        msg_anonymised = any(m.get("from_name") == "[Compte supprimé]" for m in msgs)

    REPORT["cascades"]["9_account_deletion"] = {
        "delete_status": delete_status,
        "token_invalidated_401": token_invalidated,
        "booking_client_name_anonymised": booking_anonymised,
        "booking_client_name_actual": b_anon.get("client_name") if b_anon else None,
        "messages_anonymised": msg_anonymised,
        "favorites_creation_status": fav_r.status_code,
        "push_register_status": push_r.status_code,
        "message_send_status": msg_r.status_code,
        "block_status": block_r.status_code,
    }

    # Analyse code (déjà vue) : push_tokens N'EST PAS purgé dans DELETE /users/me → MAJOR
    REPORT["major"].append({
        "cascade": 9,
        "issue": "push_tokens NON PURGÉS lors de DELETE /users/me.",
        "fichier": "/app/backend/server.py:3161-3175 (delete_my_account)",
        "impact": "Un utilisateur supprimé continue de recevoir des push notifications sur son device tant que le token Expo n'expire pas naturellement. Fuite RGPD.",
        "proposed_fix": "Ajouter `await db.push_tokens.delete_many({\"user_id\": uid})` dans delete_my_account."
    })
    # Wallets / wallet_transactions non purgés → observation (peut être un choix comptable)
    REPORT["observations"].append({
        "cascade": 9,
        "note": "wallets, wallet_transactions, password_resets, sessions, contact_flags NON PURGÉS lors de DELETE /users/me. Choix acceptable pour la comptabilité, mais à documenter dans la politique de rétention."
    })
    if not booking_anonymised:
        REPORT["critical"].append({
            "cascade": 9,
            "issue": f"Booking non anonymisé après DELETE /users/me — client_name reste '{b_anon.get('client_name') if b_anon else 'N/A'}' au lieu de '[Compte supprimé]'.",
            "fichier": "/app/backend/server.py:3170-3171",
            "impact": "Fuite RGPD : le nom d'un utilisateur supprimé reste visible côté prestataire.",
            "proposed_fix": "Vérifier que l'update_many est bien exécuté avant le delete_one user."
        })


# --------------------- Cascade 10 : Analyse des types de notifications ---------------------

def test_cascade_10_notif_types_analysis(created_users):
    """Compare types émis backend vs types routés frontend."""
    # Types émis backend (grep server.py)
    emitted_backend = {
        "booking_new", "booking_completed", "booking_completion_requested",
        "booking_quote", "booking_accepted", "booking_rejected", "booking_cancelled",
        "review_received", "message",
        "cash_commission_due",   # inserted in wallet_transactions (not notification)
        "commission_due", "account_blocked", "commission_paid", "account_reactivated",
        "report_confirmed", "report_reopened", "report_awaiting_confirm",
        "ride_cancelled", "ride_booking",
        "parcel_request", "parcel_update",
        "babysitting_request", "babysitting_update", "babysitting_sos", "babysitting_report",
    }
    # Note: cash_commission_due est un wallet_transactions.type — pas notifications. Confirmé par lecture code.

    # Types mentionnés dans review_request comme attendus (frontend/spec)
    types_from_spec = [
        "booking_new", "booking_status", "booking_completed", "booking_completion_requested",
        "payment_received", "review_received", "message",
        "ride_new", "ride_cancelled",
        "parcel_new", "parcel_status",
        "babysitting_new", "babysitting_status", "babysitting_sos", "babysitting_report",
        "admin_action", "report_status", "wallet_debt_warning",
    ]

    # routing rules frontend (routeForNotif in notifications.tsx)
    def route(t: str) -> Optional[str]:
        if t.startswith("babysitting"):
            return "family/booking"
        if t == "review_received":
            return "booking/detail"
        if t.startswith("booking"):
            return "booking/detail"
        if t.startswith("ride"):
            return "rides"
        if t.startswith("parcel"):
            return "delivery/mine"
        if t == "message":
            return "chat/{peer_id}"
        if t.startswith("payment"):
            return "profile"
        return None

    emitted_not_routed = sorted([t for t in emitted_backend if route(t) is None])
    spec_never_emitted = sorted([t for t in types_from_spec if t not in emitted_backend])

    REPORT["notif_types_analysis"] = {
        "emitted_backend": sorted(list(emitted_backend)),
        "routed_by_prefix_frontend": [
            "booking* → /booking/detail",
            "ride* → /mobility/rides",
            "parcel* → /mobility/delivery/mine",
            "babysitting* → /family/booking",
            "review_received → /booking/detail",
            "message + peer_id → /chat/{peer_id}",
            "payment* → /profile",
        ],
        "emitted_but_not_routed_dead_click": emitted_not_routed,
        "spec_types_never_emitted": spec_never_emitted,
    }

    # Notifs émises mais pas cliquables → MAJOR par lot
    if emitted_not_routed:
        REPORT["major"].append({
            "cascade": 10,
            "issue": f"Types de notifications émis backend mais non routés par routeForNotif() → dead click côté mobile: {emitted_not_routed}",
            "fichier": "/app/frontend/app/(tabs)/notifications.tsx:45-76 (routeForNotif) + backend émetteurs correspondants",
            "impact": "L'utilisateur voit la notif mais taper dessus n'ouvre rien. UX cassée pour les alertes commission/compte bloqué/report.",
            "proposed_fix": (
                "Ajouter des routes explicites dans routeForNotif():\n"
                " - commission_due, cash_commission_due, commission_paid, account_blocked, account_reactivated → /(tabs)/wallet ou /(tabs)/profile\n"
                " - report_confirmed, report_reopened, report_awaiting_confirm → /admin/reports/{report_id} (ou /(tabs)/profile si non-admin)"
            )
        })
    if spec_never_emitted:
        REPORT["minor"].append({
            "cascade": 10,
            "issue": f"Types listés dans la spec ou attendus mais JAMAIS émis par le backend : {spec_never_emitted}",
            "impact": "Routes potentiellement mortes (routeForNotif ne recevra jamais ces types). Ex: 'payment_received' n'existe pas → la branche payment* du routeur ne se déclenche jamais.",
            "proposed_fix": (
                "Deux options : soit émettre ces notifications (recommandé pour payment_received sur webhook Stripe success + booking cash-payment côté client), "
                "soit retirer les branches mortes du routeur."
            )
        })
