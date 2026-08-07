"""
admin_mobility — Dashboard admin Mobilité & trajets « Jokoo Vérifié » (anti-ghost)
==================================================================================

Monté par server.py sous `/api` via `build_admin_mobility_router(...)`, sur le même
patron que wallet / chat_voice / rides_v2.

Deux responsabilités (Spec Covoiturage #9 et #12) :

1. **Anti-ghost** : au lancement, la marketplace est vide. L'admin publie des trajets
   officiels « Jokoo Vérifié » sur des axes réels (Dakar↔Thiès, Dakar↔Saint-Louis, …)
   attribués au compte conducteur officiel `mobility@jokoo.sn` (créé automatiquement,
   idempotent). Ces trajets portent `jokoo_verified: True` + `is_ghost: True` et
   déclenchent le matching v2 comme n'importe quel trajet.

2. **Dashboard Mobilité** : demandes par ville, taux de matching / d'acceptation,
   axes les plus demandés, demandes sans conducteur, KPIs marketplace.

Endpoints :

GET    /api/admin/mobility/dashboard          (perm stats:read)
GET    /api/admin/mobility/ghost-rides        (perm mobility:manage)
POST   /api/admin/mobility/ghost-rides        (perm mobility:manage)
POST   /api/admin/mobility/ghost-rides/bulk   (perm mobility:manage)
DELETE /api/admin/mobility/ghost-rides/{rid}  (perm mobility:manage)
"""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from rides_v2 import matching as rv2_matching, notify as rv2_notify
from rides_v2.cities import resolve_city
from rides_v2.models import _validate_hhmm

log = logging.getLogger("admin_mobility")

GHOST_DRIVER_EMAIL = "mobility@jokoo.sn"
GHOST_DRIVER_NAME = "Jokoo Mobilité"
BULK_MAX_RIDES = 120


# ─── Schemas ─────────────────────────────────────────────────────────

class GhostRideIn(BaseModel):
    """Trajet officiel publié par l'admin."""
    from_city: str = Field(..., min_length=2, max_length=80)
    to_city: str = Field(..., min_length=2, max_length=80)
    date: str = Field(..., description="YYYY-MM-DD")
    time: str = Field(..., description="HH:MM")
    seats_total: int = Field(4, ge=1, le=8)
    price_xof: int = Field(..., ge=0, le=1_000_000)
    distance_type: Literal["short", "long"] = "long"
    vehicle_model: str = Field("Toyota Hiace", max_length=80)
    notes: str = Field("", max_length=500)
    accepts_parcels: bool = False
    parcel_price_xof: int = Field(0, ge=0, le=1_000_000)
    parcel_max_kg: int = Field(20, ge=0, le=200)

    @field_validator("date")
    @classmethod
    def _v_date(cls, v: str) -> str:
        try:
            datetime.strptime(v[:10], "%Y-%m-%d")
        except Exception:
            raise ValueError("date must be YYYY-MM-DD")
        return v[:10]

    @field_validator("time")
    @classmethod
    def _v_time(cls, v: str) -> str:
        return _validate_hhmm(v)


class GhostBulkRoute(BaseModel):
    from_city: str = Field(..., min_length=2, max_length=80)
    to_city: str = Field(..., min_length=2, max_length=80)
    price_xof: int = Field(..., ge=0, le=1_000_000)


class GhostBulkIn(BaseModel):
    """Publication en masse : routes × jours × horaires (cap BULK_MAX_RIDES)."""
    routes: List[GhostBulkRoute] = Field(..., min_length=1, max_length=12)
    days: int = Field(7, ge=1, le=14, description="Nombre de jours à partir de demain")
    times: List[str] = Field(default=["07:30", "16:00"], min_length=1, max_length=4)
    seats_total: int = Field(4, ge=1, le=8)
    vehicle_model: str = Field("Toyota Hiace", max_length=80)

    @field_validator("times")
    @classmethod
    def _v_times(cls, v: List[str]) -> List[str]:
        return [_validate_hhmm(t) for t in v]


# ─── Router factory ──────────────────────────────────────────────────

def build_admin_mobility_router(
    db: Any,
    require_perm: Callable,
    hash_password: Callable[[str], str],
    now_iso: Callable[[], str],
) -> APIRouter:
    router = APIRouter(tags=["admin-mobility"])
    dash_dep = require_perm("stats:read")
    manage_dep = require_perm("mobility:manage")

    # ---- Compte conducteur officiel (idempotent) ----
    async def _ensure_ghost_driver() -> dict:
        u = await db.users.find_one({"email": GHOST_DRIVER_EMAIL}, {"_id": 0, "password_hash": 0})
        if u:
            return u
        doc = {
            "id": str(uuid.uuid4()),
            "email": GHOST_DRIVER_EMAIL,
            # Mot de passe aléatoire jamais communiqué : ce compte ne sert
            # qu'à porter les trajets officiels (pas de login prévu).
            "password_hash": hash_password(secrets.token_urlsafe(24)),
            "name": GHOST_DRIVER_NAME,
            "role": "prestataire",
            "roles": ["prestataire"],
            "active_role": "prestataire",
            "phone": None,
            "city": "Dakar",
            "avatar": None,
            "active": True,
            "created_at": now_iso(),
        }
        await db.users.insert_one(doc)
        return {k: v for k, v in doc.items() if k not in ("_id", "password_hash")}

    async def _insert_ghost_ride(p: GhostRideIn, admin_id: str, driver: dict) -> dict:
        rid = str(uuid.uuid4())
        accepts_parcels = bool(p.accepts_parcels and p.distance_type == "long")
        doc = {
            "id": rid,
            "driver_id": driver["id"],
            "driver_name": GHOST_DRIVER_NAME,
            "driver_avatar": None,
            "driver_phone": None,
            "driver_city": "Dakar",
            "driver_rating": 5.0,
            "driver_reviews_count": 0,
            "driver_verified": True,
            "jokoo_verified": True,   # badge « Jokoo Vérifié » côté app
            "is_ghost": True,          # visible uniquement dans l'admin
            "created_by": admin_id,
            "from_city": p.from_city.strip(),
            "from_address": "",
            "to_city": p.to_city.strip(),
            "to_address": "",
            "stops": [],
            "date": p.date,
            "time": p.time,
            "seats_total": p.seats_total,
            "seats_available": p.seats_total,
            "price_xof": p.price_xof,
            "distance_type": p.distance_type,
            "recurrence": "none",
            "recurrence_days": [],
            "vehicle_model": p.vehicle_model or "",
            "vehicle_plate": "",
            "vehicle_color": "",
            "notes": p.notes or "",
            "accepts_parcels": accepts_parcels,
            "parcel_price_xof": int(p.parcel_price_xof) if accepts_parcels else 0,
            "parcel_max_kg": int(p.parcel_max_kg) if accepts_parcels else 0,
            "parcel_payment_mode": "app_or_cash",
            "status": "active",
            "from_city_norm": resolve_city(p.from_city),
            "to_city_norm": resolve_city(p.to_city),
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.rides.insert_one(doc)
        # Matching v2 : notifier les passagers dont la demande correspond.
        try:
            matched = await rv2_matching.match_requests_for_ride(db, doc)
            for req in matched:
                await rv2_notify.notify_passenger_of_new_ride(db, req, doc)
        except Exception as e:
            log.warning("[admin_mobility] post-create match failed: %s", e)
        return {k: v for k, v in doc.items() if k != "_id"}

    # ---- Anti-ghost : CRUD trajets officiels ----

    @router.post("/admin/mobility/ghost-rides")
    async def create_ghost_ride(body: GhostRideIn, user=Depends(manage_dep)):
        driver = await _ensure_ghost_driver()
        return await _insert_ghost_ride(body, user["id"], driver)

    @router.post("/admin/mobility/ghost-rides/bulk")
    async def bulk_ghost_rides(body: GhostBulkIn, user=Depends(manage_dep)):
        total = len(body.routes) * body.days * len(body.times)
        if total > BULK_MAX_RIDES:
            raise HTTPException(400, f"Trop de trajets d'un coup ({total} > {BULK_MAX_RIDES}). Réduisez routes/jours/horaires.")
        driver = await _ensure_ghost_driver()
        today = datetime.now(timezone.utc).date()
        created, skipped = 0, 0
        for d in range(1, body.days + 1):
            date = (today + timedelta(days=d)).isoformat()
            for route in body.routes:
                fn, tn = resolve_city(route.from_city), resolve_city(route.to_city)
                for t in body.times:
                    # Anti-doublon : un ghost actif identique existe déjà ?
                    dup = await db.rides.find_one({
                        "is_ghost": True, "status": "active",
                        "from_city_norm": fn, "to_city_norm": tn,
                        "date": date, "time": t,
                    }, {"_id": 1})
                    if dup:
                        skipped += 1
                        continue
                    p = GhostRideIn(
                        from_city=route.from_city, to_city=route.to_city,
                        date=date, time=t,
                        seats_total=body.seats_total, price_xof=route.price_xof,
                        vehicle_model=body.vehicle_model,
                    )
                    await _insert_ghost_ride(p, user["id"], driver)
                    created += 1
        return {"created": created, "skipped": skipped}

    @router.get("/admin/mobility/ghost-rides")
    async def list_ghost_rides(user=Depends(manage_dep)):
        rides = await db.rides.find({"is_ghost": True}, {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(300)
        ids = [r["id"] for r in rides]
        counts: dict = {}
        if ids:
            rows = await db.ride_bookings.aggregate([
                {"$match": {"ride_id": {"$in": ids}, "status": {"$in": ["pending", "confirmed"]}}},
                {"$group": {"_id": "$ride_id", "n": {"$sum": 1}}},
            ]).to_list(300)
            counts = {r["_id"]: r["n"] for r in rows}
        for r in rides:
            r["bookings_count"] = counts.get(r["id"], 0)
        return rides

    @router.delete("/admin/mobility/ghost-rides/{rid}")
    async def cancel_ghost_ride(rid: str, user=Depends(manage_dep)):
        ride = await db.rides.find_one({"id": rid, "is_ghost": True}, {"_id": 0})
        if not ride:
            raise HTTPException(404, "Trajet officiel introuvable")
        if ride.get("status") == "cancelled":
            return {"ok": True, "already": True}
        await db.rides.update_one({"id": rid}, {"$set": {"status": "cancelled", "updated_at": now_iso()}})
        # Annuler + prévenir les passagers déjà réservés
        bookings = await db.ride_bookings.find(
            {"ride_id": rid, "status": {"$in": ["pending", "confirmed"]}}, {"_id": 0}
        ).to_list(100)
        for b in bookings:
            await db.ride_bookings.update_one({"id": b["id"]}, {"$set": {"status": "cancelled"}})
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": b["passenger_id"],
                "type": "ride_cancelled",
                "title": "Trajet annulé",
                "body": f"Le trajet {ride.get('from_city')} → {ride.get('to_city')} du {ride.get('date')} a été annulé.",
                "ride_id": rid,
                "read": False,
                "created_at": now_iso(),
            })
        return {"ok": True, "cancelled_bookings": len(bookings)}

    # ---- Dashboard Mobilité ----

    @router.get("/admin/mobility/dashboard")
    async def mobility_dashboard(user=Depends(dash_dep)):
        now = datetime.now(timezone.utc)
        since_24h = (now - timedelta(hours=24)).isoformat()
        since_7d = (now - timedelta(days=7)).isoformat()
        since_30d = (now - timedelta(days=30)).isoformat()

        # KPIs volume
        requests_open = await db.ride_requests.count_documents({"status": {"$in": ["open", "matched"]}})
        requests_24h = await db.ride_requests.count_documents({"created_at": {"$gte": since_24h}})
        rides_active = await db.rides.count_documents({"status": "active"})
        ghost_active = await db.rides.count_documents({"status": "active", "is_ghost": True})
        offers_pending = await db.ride_offers.count_documents({"status": "pending"})
        booked_7d = await db.ride_requests.count_documents({"status": "booked", "updated_at": {"$gte": since_7d}})

        # Taux de matching 7 j : % des demandes créées qui ont reçu ≥ 1 offre.
        req_7d = await db.ride_requests.count_documents({"created_at": {"$gte": since_7d}})
        req_7d_matched = await db.ride_requests.count_documents({
            "created_at": {"$gte": since_7d}, "offers_count": {"$gte": 1},
        })
        match_rate = (req_7d_matched / req_7d) if req_7d else 0.0

        # Taux d'acceptation 7 j : % des offres envoyées qui ont été acceptées.
        offers_7d = await db.ride_offers.count_documents({"created_at": {"$gte": since_7d}})
        offers_acc_7d = await db.ride_offers.count_documents({
            "created_at": {"$gte": since_7d}, "status": "accepted",
        })
        accept_rate = (offers_acc_7d / offers_7d) if offers_7d else 0.0

        # Axes les plus demandés (demandes passagers, 30 j)
        top_request_routes = await db.ride_requests.aggregate([
            {"$match": {"created_at": {"$gte": since_30d}}},
            {"$group": {"_id": {"f": "$from_city_norm", "t": "$to_city_norm"}, "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 8},
        ]).to_list(8)

        # Offre côté conducteurs (trajets actifs par axe)
        top_ride_routes = await db.rides.aggregate([
            {"$match": {"status": "active"}},
            {"$group": {"_id": {"f": "$from_city_norm", "t": "$to_city_norm"}, "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 8},
        ]).to_list(8)

        # Demandes par ville de départ (30 j)
        requests_by_city = await db.ride_requests.aggregate([
            {"$match": {"created_at": {"$gte": since_30d}}},
            {"$group": {"_id": "$from_city_norm", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]).to_list(10)

        # Demandes sans conducteur (aucune offre reçue) — la cible de l'anti-ghost.
        unserved_q = {
            "status": "open",
            "$or": [{"offers_count": {"$exists": False}}, {"offers_count": 0}],
        }
        unserved_count = await db.ride_requests.count_documents(unserved_q)
        unserved = await db.ride_requests.find(unserved_q, {"_id": 0}).sort("date", 1).to_list(10)

        def _route_rows(rows):
            return [
                {"from_city": r["_id"].get("f"), "to_city": r["_id"].get("t"), "count": r["count"]}
                for r in rows if r.get("_id")
            ]

        return {
            "kpis": {
                "requests_open": requests_open,
                "requests_last_24h": requests_24h,
                "rides_active": rides_active,
                "ghost_rides_active": ghost_active,
                "offers_pending": offers_pending,
                "bookings_last_7d": booked_7d,
                "unserved_requests": unserved_count,
            },
            "matching": {
                "match_rate_7d": round(match_rate, 3),
                "accept_rate_7d": round(accept_rate, 3),
                "requests_7d": req_7d,
                "requests_with_offer_7d": req_7d_matched,
                "offers_7d": offers_7d,
                "offers_accepted_7d": offers_acc_7d,
            },
            "top_request_routes": _route_rows(top_request_routes),
            "top_ride_routes": _route_rows(top_ride_routes),
            "requests_by_city": [
                {"city": r["_id"], "count": r["count"]} for r in requests_by_city if r.get("_id")
            ],
            "unserved": [
                {
                    "id": r.get("id"),
                    "from_city": r.get("from_city"),
                    "to_city": r.get("to_city"),
                    "date": r.get("date"),
                    "time_from": r.get("time_from"),
                    "time_to": r.get("time_to"),
                    "seats": r.get("seats"),
                    "budget_xof": r.get("budget_xof"),
                    "passenger_name": r.get("passenger_name"),
                    "created_at": r.get("created_at"),
                }
                for r in unserved
            ],
        }

    return router
