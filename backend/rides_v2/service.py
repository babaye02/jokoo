"""
rides_v2.service — Service métier des demandes & offres passager/conducteur
============================================================================

Toutes les mutations MongoDB passent par ici. Le router se contente d'auth,
validation d'input et d'appeler ces fonctions.
"""

from __future__ import annotations
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from .cities import resolve_city
from .constants import (
    DEFAULT_REQUEST_TTL_HOURS,
    OFFER_STATUS_ACCEPTED,
    OFFER_STATUS_PENDING,
    OFFER_STATUS_REFUSED,
    OFFER_STATUS_WITHDRAWN,
    REQUEST_STATUS_BOOKED,
    REQUEST_STATUS_CANCELLED,
    REQUEST_STATUS_MATCHED,
    REQUEST_STATUS_OPEN,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_dt() -> datetime:
    return datetime.now(timezone.utc)


def _compute_expires_at(date: str, time_from: Optional[str]) -> str:
    """
    Retourne la date d'expiration :
    - min( date+time_from du trajet ,  now + 3 jours )
    - fallback : now + 24h
    """
    now = _now_dt()
    ttl_end = now + timedelta(hours=DEFAULT_REQUEST_TTL_HOURS)
    try:
        d = datetime.strptime(date[:10], "%Y-%m-%d")
        hh, mm = 23, 59
        if time_from:
            parts = time_from.split(":")
            hh = int(parts[0]) if len(parts) > 0 else hh
            mm = int(parts[1]) if len(parts) > 1 else mm
        # On garde une fenêtre après la date, jusqu'à minuit de ce jour +1
        trip_dt = datetime(d.year, d.month, d.day, hh, mm, tzinfo=timezone.utc) + timedelta(hours=6)
        return min(ttl_end, trip_dt).isoformat()
    except Exception:
        return (now + timedelta(hours=24)).isoformat()


# ─── Ride Requests ───────────────────────────────────────────────────

async def create_request(db: Any, passenger_id: str, payload: dict, passenger_info: dict) -> dict:
    rid = str(uuid.uuid4())
    from_c = resolve_city(payload["from_city"])
    to_c = resolve_city(payload["to_city"])
    if from_c == to_c and from_c != "":
        # Autorisé si quartiers différents dans la même ville-mère.
        # Ici on ne bloque pas mais on marque intra-ville.
        pass

    doc = {
        "id": rid,
        "passenger_id": passenger_id,
        "passenger_name": passenger_info.get("name") or "",
        "passenger_avatar": passenger_info.get("avatar") or "",
        "passenger_role": passenger_info.get("role") or "client",
        "from_city": payload["from_city"].strip(),
        "from_city_norm": from_c,
        "from_address": (payload.get("from_address") or "").strip(),
        "to_city": payload["to_city"].strip(),
        "to_city_norm": to_c,
        "to_address": (payload.get("to_address") or "").strip(),
        "date": payload["date"][:10],
        "time_from": payload["time_from"],
        "time_to": payload.get("time_to"),
        "seats": int(payload.get("seats", 1)),
        "budget_xof": int(payload["budget_xof"]) if payload.get("budget_xof") is not None else None,
        "notes": (payload.get("notes") or "").strip(),
        "status": REQUEST_STATUS_OPEN,
        "offers_count": 0,
        "matched_offer_ids": [],
        "accepted_offer_id": None,
        "expires_at": _compute_expires_at(payload["date"][:10], payload["time_from"]),
        "expiration_reminded": False,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.ride_requests.insert_one(doc)
    return _clean(doc)


async def update_request(db: Any, request_id: str, passenger_id: str, payload: dict) -> dict:
    doc = await db.ride_requests.find_one({"id": request_id, "passenger_id": passenger_id}, {"_id": 0})
    if not doc:
        raise ValueError("Request not found")
    if doc["status"] in (REQUEST_STATUS_CANCELLED, REQUEST_STATUS_BOOKED):
        raise ValueError("Request is not editable")
    updates: dict = {"updated_at": _now()}
    for key in ("from_address", "to_address", "notes"):
        if key in payload and payload[key] is not None:
            updates[key] = str(payload[key]).strip()
    for key in ("date", "time_from", "time_to"):
        if key in payload and payload[key]:
            updates[key] = payload[key]
    if "seats" in payload and payload["seats"] is not None:
        updates["seats"] = int(payload["seats"])
    if "budget_xof" in payload:
        updates["budget_xof"] = int(payload["budget_xof"]) if payload["budget_xof"] is not None else None
    for key in ("from_city", "to_city"):
        if key in payload and payload[key]:
            updates[key] = payload[key].strip()
            updates[key + "_norm"] = resolve_city(payload[key])
    if "status" in payload and payload["status"] == REQUEST_STATUS_CANCELLED:
        updates["status"] = REQUEST_STATUS_CANCELLED

    # Recompute expires_at if date/time_from changed
    if "date" in updates or "time_from" in updates:
        updates["expires_at"] = _compute_expires_at(
            updates.get("date", doc.get("date", "")),
            updates.get("time_from", doc.get("time_from")),
        )

    await db.ride_requests.update_one({"id": request_id}, {"$set": updates})
    doc.update(updates)
    return _clean(doc)


async def republish_request(db: Any, request_id: str, passenger_id: str) -> dict:
    """Réouvre une demande expirée ou annulée en la remettant en OPEN et en réinitialisant l'expiration."""
    doc = await db.ride_requests.find_one({"id": request_id, "passenger_id": passenger_id}, {"_id": 0})
    if not doc:
        raise ValueError("Request not found")
    if doc["status"] == REQUEST_STATUS_BOOKED:
        raise ValueError("Already booked")
    new_expires = _compute_expires_at(doc.get("date", "")[:10], doc.get("time_from"))
    updates = {
        "status": REQUEST_STATUS_OPEN,
        "expires_at": new_expires,
        "expiration_reminded": False,
        "updated_at": _now(),
    }
    await db.ride_requests.update_one({"id": request_id}, {"$set": updates})
    doc.update(updates)
    return _clean(doc)


async def delete_request(db: Any, request_id: str, passenger_id: str) -> None:
    doc = await db.ride_requests.find_one({"id": request_id, "passenger_id": passenger_id}, {"_id": 0})
    if not doc:
        raise ValueError("Request not found")
    if doc["status"] == REQUEST_STATUS_BOOKED:
        raise ValueError("Cannot delete a booked request")
    await db.ride_requests.delete_one({"id": request_id})


async def get_request(db: Any, request_id: str) -> Optional[dict]:
    doc = await db.ride_requests.find_one({"id": request_id}, {"_id": 0})
    return _clean(doc) if doc else None


async def list_requests(
    db: Any,
    *,
    from_city: Optional[str] = None,
    to_city: Optional[str] = None,
    date: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    exclude_passenger_id: Optional[str] = None,
) -> list[dict]:
    q: dict = {}
    if status:
        q["status"] = status
    else:
        q["status"] = {"$in": [REQUEST_STATUS_OPEN, REQUEST_STATUS_MATCHED]}
    if from_city:
        q["from_city_norm"] = resolve_city(from_city)
    if to_city:
        q["to_city_norm"] = resolve_city(to_city)
    if date:
        q["date"] = date[:10]
    if exclude_passenger_id:
        q["passenger_id"] = {"$ne": exclude_passenger_id}
    cursor = db.ride_requests.find(q, {"_id": 0}).sort([("date", 1), ("time_from", 1)]).limit(limit)
    return [_clean(d) for d in await cursor.to_list(limit)]


async def list_mine_requests(db: Any, passenger_id: str, limit: int = 100) -> list[dict]:
    cursor = db.ride_requests.find({"passenger_id": passenger_id}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return [_clean(d) for d in await cursor.to_list(limit)]


# ─── Ride Offers ─────────────────────────────────────────────────────

async def create_offer(
    db: Any,
    request_id: str,
    driver_id: str,
    driver_info: dict,
    payload: dict,
) -> tuple[dict, dict]:
    """
    Crée une offre d'un conducteur pour une demande.
    Retourne (offer_doc, request_doc_updated).
    """
    request_doc = await db.ride_requests.find_one({"id": request_id}, {"_id": 0})
    if not request_doc:
        raise ValueError("Request not found")
    if request_doc["status"] not in (REQUEST_STATUS_OPEN, REQUEST_STATUS_MATCHED):
        raise ValueError("Request is not open")
    if request_doc["passenger_id"] == driver_id:
        raise ValueError("Cannot propose to your own request")

    # Interdire les doublons pending du même conducteur pour la même demande
    existing = await db.ride_offers.find_one({
        "request_id": request_id,
        "driver_id": driver_id,
        "status": OFFER_STATUS_PENDING,
    }, {"_id": 0})
    if existing:
        return _clean(existing), _clean(request_doc)

    ride_doc = None
    if payload.get("ride_id"):
        ride_doc = await db.rides.find_one({"id": payload["ride_id"], "driver_id": driver_id}, {"_id": 0})
        if not ride_doc:
            raise ValueError("Ride not found or not owned")

    offer_id = str(uuid.uuid4())
    offer = {
        "id": offer_id,
        "request_id": request_id,
        "passenger_id": request_doc["passenger_id"],
        "driver_id": driver_id,
        "driver_name": driver_info.get("name") or "",
        "driver_avatar": driver_info.get("avatar") or "",
        "driver_rating": driver_info.get("rating"),
        "driver_completed_rides": driver_info.get("completed_rides", 0),
        "driver_verified": bool(driver_info.get("verified")),
        "ride_id": ride_doc["id"] if ride_doc else None,
        "ride_summary": _ride_summary(ride_doc) if ride_doc else _inline_ride_summary(payload),
        "price_xof": int(payload["price_xof"]),
        "message": (payload.get("message") or "").strip(),
        "status": OFFER_STATUS_PENDING,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.ride_offers.insert_one(offer)

    # Update request: incrementer offers_count, ajouter à matched_offer_ids, marquer 'matched'
    await db.ride_requests.update_one(
        {"id": request_id},
        {
            "$inc": {"offers_count": 1},
            "$push": {"matched_offer_ids": offer_id},
            "$set": {
                "status": REQUEST_STATUS_MATCHED,
                "updated_at": _now(),
            },
        },
    )
    request_doc = await db.ride_requests.find_one({"id": request_id}, {"_id": 0})
    return _clean(offer), _clean(request_doc)


async def decide_offer(
    db: Any,
    offer_id: str,
    passenger_id: str,
    action: str,
    message: Optional[str] = None,
) -> dict:
    offer = await db.ride_offers.find_one({"id": offer_id, "passenger_id": passenger_id}, {"_id": 0})
    if not offer:
        raise ValueError("Offer not found")
    if offer["status"] != OFFER_STATUS_PENDING:
        raise ValueError("Offer already decided")

    new_status = OFFER_STATUS_ACCEPTED if action == "accept" else OFFER_STATUS_REFUSED
    updates = {"status": new_status, "updated_at": _now()}
    if message:
        updates["passenger_message"] = message
    await db.ride_offers.update_one({"id": offer_id}, {"$set": updates})
    offer.update(updates)

    # Si accepté, marquer la demande comme booked (rien d'autre côté rides pour l'instant)
    if new_status == OFFER_STATUS_ACCEPTED:
        await db.ride_requests.update_one(
            {"id": offer["request_id"]},
            {"$set": {
                "status": REQUEST_STATUS_BOOKED,
                "accepted_offer_id": offer_id,
                "updated_at": _now(),
            }},
        )
        # Refuser toutes les autres offres pending pour cette demande
        await db.ride_offers.update_many(
            {
                "request_id": offer["request_id"],
                "status": OFFER_STATUS_PENDING,
                "id": {"$ne": offer_id},
            },
            {"$set": {"status": OFFER_STATUS_WITHDRAWN, "updated_at": _now()}},
        )
    return _clean(offer)


async def withdraw_offer(db: Any, offer_id: str, driver_id: str) -> dict:
    offer = await db.ride_offers.find_one({"id": offer_id, "driver_id": driver_id}, {"_id": 0})
    if not offer:
        raise ValueError("Offer not found")
    if offer["status"] != OFFER_STATUS_PENDING:
        raise ValueError("Only pending offers can be withdrawn")
    await db.ride_offers.update_one(
        {"id": offer_id},
        {"$set": {"status": OFFER_STATUS_WITHDRAWN, "updated_at": _now()}},
    )
    offer["status"] = OFFER_STATUS_WITHDRAWN
    return _clean(offer)


async def list_offers_for_request(db: Any, request_id: str) -> list[dict]:
    cursor = db.ride_offers.find({"request_id": request_id}, {"_id": 0}).sort("created_at", -1)
    return [_clean(d) for d in await cursor.to_list(200)]


async def list_offers_sent(db: Any, driver_id: str, limit: int = 100) -> list[dict]:
    cursor = db.ride_offers.find({"driver_id": driver_id}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return [_clean(d) for d in await cursor.to_list(limit)]


async def list_offers_received(db: Any, passenger_id: str, limit: int = 100) -> list[dict]:
    cursor = db.ride_offers.find({"passenger_id": passenger_id}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return [_clean(d) for d in await cursor.to_list(limit)]


async def get_offer(db: Any, offer_id: str) -> Optional[dict]:
    doc = await db.ride_offers.find_one({"id": offer_id}, {"_id": 0})
    return _clean(doc) if doc else None


# ─── Statistics & suggestions ────────────────────────────────────────

async def hot_routes(db: Any, days: int = 7, limit: int = 6) -> list[dict]:
    """Retourne les axes les plus demandés par les passagers récemment."""
    since = (_now_dt() - timedelta(days=days)).isoformat()
    pipeline = [
        {"$match": {
            "created_at": {"$gte": since},
            "status": {"$in": [REQUEST_STATUS_OPEN, REQUEST_STATUS_MATCHED, REQUEST_STATUS_BOOKED]},
        }},
        {"$group": {
            "_id": {"from": "$from_city_norm", "to": "$to_city_norm"},
            "count": {"$sum": 1},
            "next_date": {"$min": "$date"},
        }},
        {"$sort": {"count": -1}},
        {"$limit": limit},
    ]
    rows = await db.ride_requests.aggregate(pipeline).to_list(limit)
    out = []
    for r in rows:
        if not r.get("_id"):
            continue
        out.append({
            "from_city": r["_id"].get("from"),
            "to_city": r["_id"].get("to"),
            "count": r.get("count", 0),
            "next_date": r.get("next_date"),
        })
    return out


async def mobility_stats(db: Any) -> dict:
    """KPIs global marketplace pour la home mobility."""
    now = _now_dt()
    since_24h = (now - timedelta(hours=24)).isoformat()
    since_7d = (now - timedelta(days=7)).isoformat()
    r_open = await db.ride_requests.count_documents({"status": {"$in": [REQUEST_STATUS_OPEN, REQUEST_STATUS_MATCHED]}})
    r_24h = await db.ride_requests.count_documents({"created_at": {"$gte": since_24h}})
    rides_active = await db.rides.count_documents({"status": "active"})
    offers_pending = await db.ride_offers.count_documents({"status": OFFER_STATUS_PENDING})
    booked_7d = await db.ride_requests.count_documents({"status": REQUEST_STATUS_BOOKED, "updated_at": {"$gte": since_7d}})
    return {
        "requests_open": r_open,
        "requests_last_24h": r_24h,
        "rides_active": rides_active,
        "offers_pending": offers_pending,
        "bookings_last_7d": booked_7d,
    }


# ─── Helpers ─────────────────────────────────────────────────────────

def _clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


def _ride_summary(ride: dict) -> dict:
    """Réduction pour affichage dans une offre."""
    return {
        "id": ride.get("id"),
        "from_city": ride.get("from_city"),
        "to_city": ride.get("to_city"),
        "date": ride.get("date"),
        "time": ride.get("time"),
        "seats_available": ride.get("seats_available"),
        "vehicle_model": ride.get("vehicle_model"),
        "vehicle_color": ride.get("vehicle_color"),
        "vehicle_plate": ride.get("vehicle_plate"),
        "verified": bool(ride.get("verified")),
    }


def _inline_ride_summary(payload: dict) -> dict:
    """Résumé d'offre inline (conducteur sans trajet publié)."""
    return {
        "id": None,
        "from_city": payload.get("from_city"),
        "to_city": payload.get("to_city"),
        "date": payload.get("date"),
        "time": payload.get("time"),
        "seats_available": payload.get("seats_available"),
        "vehicle_model": payload.get("vehicle_model"),
    }


async def ensure_indexes(db: Any) -> None:
    """Crée les indexes MongoDB nécessaires (idempotent)."""
    await db.ride_requests.create_index("id", unique=True)
    await db.ride_requests.create_index([("status", 1), ("date", 1), ("time_from", 1)])
    await db.ride_requests.create_index([("from_city_norm", 1), ("to_city_norm", 1), ("date", 1)])
    await db.ride_requests.create_index("passenger_id")
    await db.ride_requests.create_index("expires_at")

    await db.ride_offers.create_index("id", unique=True)
    await db.ride_offers.create_index([("request_id", 1), ("status", 1)])
    await db.ride_offers.create_index("driver_id")
    await db.ride_offers.create_index("passenger_id")

    # rides — ajout d'un index sur les champs normalisés (existants ou non)
    try:
        await db.rides.create_index([("from_city_norm", 1), ("to_city_norm", 1), ("status", 1)])
    except Exception:
        pass


async def backfill_ride_norms(db: Any) -> int:
    """
    Migration idempotente : ajoute from_city_norm/to_city_norm aux rides existants
    qui n'en ont pas (legacy). Retourne le nombre de rides mis à jour.
    """
    from .cities import resolve_city as _resolve
    to_migrate = await db.rides.count_documents({"from_city_norm": {"$exists": False}})
    if to_migrate == 0:
        return 0
    migrated = 0
    async for r in db.rides.find({"from_city_norm": {"$exists": False}}, {"id": 1, "from_city": 1, "to_city": 1}):
        try:
            f_norm = _resolve(r.get("from_city", ""))
            t_norm = _resolve(r.get("to_city", ""))
            await db.rides.update_one({"id": r["id"]}, {"$set": {"from_city_norm": f_norm, "to_city_norm": t_norm}})
            migrated += 1
        except Exception:
            continue
    return migrated
