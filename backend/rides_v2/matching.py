"""
rides_v2.matching — Moteur de matching pour la marketplace covoiturage
======================================================================

V1 : city-based (normalisation + aliasing quartiers → ville-mère).
V2 (futur) : radius km via géocodage. Ajouter simplement `coords_lat/lng` sur
les demandes/trajets et étendre `score_match` en gardant la même API publique.

API :
- match_rides_for_request(db, request) -> [ride_dict]
- match_requests_for_ride(db, ride)    -> [request_dict]
- score_match(ride, request)           -> float in [0, 1]
- is_time_compatible(a, b, ...)        -> bool

Les résultats sont triés par score décroissant.
"""

from __future__ import annotations
from datetime import datetime, timedelta
from typing import Any, Optional

from .cities import resolve_city, city_matches
from .constants import (
    DEFAULT_TIME_WINDOW_MIN,
    MAX_MATCHES_PER_TRIGGER,
    REQUEST_STATUS_OPEN,
)


# ─── Time helpers ────────────────────────────────────────────────────

def _parse_hm(v: Optional[str]) -> Optional[tuple[int, int]]:
    if not v:
        return None
    try:
        h, m = v.split(":")
        return int(h), int(m)
    except Exception:
        return None


def _to_minutes(hm: tuple[int, int]) -> int:
    return hm[0] * 60 + hm[1]


def is_time_compatible(
    ride_time: Optional[str],
    request_time_from: Optional[str],
    request_time_to: Optional[str] = None,
    window_min: int = DEFAULT_TIME_WINDOW_MIN,
) -> bool:
    """
    Vrai si l'heure du trajet tombe dans la fenêtre passager, avec tolérance `window_min`.
    Si l'un des deux est manquant → considéré comme compatible (bienveillance).
    """
    r = _parse_hm(ride_time)
    p_from = _parse_hm(request_time_from)
    if not r or not p_from:
        return True
    r_min = _to_minutes(r)
    p_from_min = _to_minutes(p_from)
    p_to = _parse_hm(request_time_to)
    p_to_min = _to_minutes(p_to) if p_to else p_from_min + window_min
    # tolerance des deux côtés
    lo = p_from_min - window_min
    hi = p_to_min + window_min
    return lo <= r_min <= hi


def _date_matches(ride: dict, request: dict) -> bool:
    r_date = (ride.get("date") or "")[:10]
    p_date = (request.get("date") or "")[:10]
    if r_date and p_date:
        if r_date == p_date:
            return True
        # Compat weekly recurrence : si le trajet est récurrent hebdo,
        # vérifier le jour de la semaine correspondant à la date demande.
        if ride.get("recurrence") == "weekly":
            days = ride.get("recurrence_days") or []
            try:
                dt = datetime.strptime(p_date, "%Y-%m-%d")
                weekday = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][dt.weekday()]
                return weekday in days
            except Exception:
                return False
    # Si l'un manque, on considère compat (le UI filtrera au besoin)
    return True


def score_match(ride: dict, request: dict) -> float:
    """
    Score entre 0 et 1 :
      0.5   villes canoniques identiques (départ ET arrivée)
      +0.15 même date exacte
      +0.15 fenêtre horaire respectée
      +0.10 places suffisantes
      +0.05 budget respecté (si passager en a un)
      +0.05 conducteur vérifié Jokoo
    """
    score = 0.0
    # 1) villes
    ok_from = city_matches(ride.get("from_city"), request.get("from_city"))
    ok_to = city_matches(ride.get("to_city"), request.get("to_city"))
    if not (ok_from and ok_to):
        return 0.0
    score += 0.5

    # 2) date
    r_date = (ride.get("date") or "")[:10]
    p_date = (request.get("date") or "")[:10]
    if r_date and p_date and r_date == p_date:
        score += 0.15
    elif ride.get("recurrence") == "weekly":
        # bonus léger, car fenêtre glissante
        score += 0.08

    # 3) horaire
    if is_time_compatible(ride.get("time"), request.get("time_from"), request.get("time_to")):
        score += 0.15

    # 4) sièges
    seats_ok = int(ride.get("seats_available", 0)) >= int(request.get("seats", 1) or 1)
    if seats_ok:
        score += 0.10

    # 5) budget
    budget = request.get("budget_xof")
    price = ride.get("price_xof")
    if budget is None:
        # pas de contrainte
        score += 0.025
    elif isinstance(budget, (int, float)) and isinstance(price, (int, float)):
        if price <= budget:
            score += 0.05
        elif price <= budget * 1.15:
            # tolérance légère
            score += 0.02

    # 6) trajet vérifié Jokoo
    if ride.get("verified"):
        score += 0.05

    return min(score, 1.0)


# ─── Matching queries ───────────────────────────────────────────────

async def match_rides_for_request(
    db: Any,
    request: dict,
    *,
    limit: int = MAX_MATCHES_PER_TRIGGER,
    min_score: float = 0.7,
) -> list[dict]:
    """
    Retourne les trajets actifs compatibles avec une demande passager,
    triés par score décroissant.
    """
    from_c = resolve_city(request.get("from_city"))
    to_c = resolve_city(request.get("to_city"))
    if not from_c or not to_c:
        return []

    # Pré-filtrage MongoDB : status actif + villes canoniques normalisées
    # On matche via `from_city_norm` et `to_city_norm` qu'on maintient sur les rides
    # à la création. Fallback (rides legacy) : regex insensible sur les champs bruts.
    q = {
        "status": "active",
        "$and": [
            {"$or": [{"from_city_norm": from_c}, {"from_city": {"$regex": f"^{from_c}$", "$options": "i"}}]},
            {"$or": [{"to_city_norm": to_c}, {"to_city": {"$regex": f"^{to_c}$", "$options": "i"}}]},
        ],
    }
    # Exclure le passager lui-même s'il est aussi conducteur
    if request.get("passenger_id"):
        q["driver_id"] = {"$ne": request["passenger_id"]}
    # Places suffisantes
    q["seats_available"] = {"$gte": int(request.get("seats", 1) or 1)}

    cursor = db.rides.find(q, {"_id": 0}).sort([("date", 1), ("time", 1)]).limit(200)
    rides = await cursor.to_list(200)
    scored = []
    for r in rides:
        if not _date_matches(r, request):
            continue
        s = score_match(r, request)
        if s >= min_score:
            scored.append((s, r))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [r for _, r in scored[:limit]]


async def match_requests_for_ride(
    db: Any,
    ride: dict,
    *,
    limit: int = MAX_MATCHES_PER_TRIGGER,
    min_score: float = 0.7,
) -> list[dict]:
    """
    Retourne les demandes passager compatibles avec un trajet, triées par score.
    """
    from_c = resolve_city(ride.get("from_city"))
    to_c = resolve_city(ride.get("to_city"))
    if not from_c or not to_c:
        return []

    q = {
        "status": REQUEST_STATUS_OPEN,
        "$and": [
            {"$or": [{"from_city_norm": from_c}, {"from_city": {"$regex": f"^{from_c}$", "$options": "i"}}]},
            {"$or": [{"to_city_norm": to_c}, {"to_city": {"$regex": f"^{to_c}$", "$options": "i"}}]},
        ],
    }
    # Exclure le conducteur lui-même
    if ride.get("driver_id"):
        q["passenger_id"] = {"$ne": ride["driver_id"]}
    # Places demandées <= places disponibles
    q["seats"] = {"$lte": int(ride.get("seats_available", 0) or 0)}

    cursor = db.ride_requests.find(q, {"_id": 0}).sort("created_at", -1).limit(200)
    requests = await cursor.to_list(200)
    scored = []
    for req in requests:
        if not _date_matches(ride, req):
            continue
        s = score_match(ride, req)
        if s >= min_score:
            scored.append((s, req))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [r for _, r in scored[:limit]]
