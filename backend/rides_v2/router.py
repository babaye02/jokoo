"""
rides_v2.router — Endpoints FastAPI de la marketplace covoiturage v2
=====================================================================

Monté par server.py sous `/api`. Deux routers :
- Public/User (`/mobility/requests/*`, `/mobility/offers/*`, `/mobility/stats`)
- Admin (`/admin/mobility/*`) — Phase 3 dans un fichier séparé.

Matching + notifications sont déclenchés automatiquement à la création.
"""

from __future__ import annotations
import logging
from typing import Any, Callable, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from . import matching, notify, service
from .cities import all_cities_for_autocomplete, resolve_city, city_display
from .expiration import sweep_expired
from .models import (
    RideOfferDecisionIn,
    RideOfferIn,
    RideRequestIn,
    RideRequestUpdate,
)

log = logging.getLogger("rides_v2.router")


def build_mobility_router(
    db: Any,
    current_user: Callable,
    optional_user: Callable,
    driver_info_lookup: Optional[Callable] = None,
    user_info_lookup: Optional[Callable] = None,
) -> APIRouter:
    """
    Args:
      db                   : Motor database
      current_user         : FastAPI dep -> authenticated user dict
      optional_user        : FastAPI dep -> user or None
      driver_info_lookup   : async (user_id) -> dict(name, avatar, rating, completed_rides, verified)
      user_info_lookup     : async (user_id) -> dict(name, avatar, role)
    """
    router = APIRouter(prefix="/mobility", tags=["mobility-v2"])

    async def _driver_info(user: dict) -> dict:
        if driver_info_lookup:
            try:
                info = await driver_info_lookup(user["id"])
                if info:
                    return info
            except Exception as e:
                log.warning("driver_info_lookup failed: %s", e)
        return {
            "name": user.get("name") or "",
            "avatar": user.get("avatar") or "",
            "rating": user.get("rating"),
            "completed_rides": 0,
            "verified": False,
        }

    async def _passenger_info(user: dict) -> dict:
        if user_info_lookup:
            try:
                info = await user_info_lookup(user["id"])
                if info:
                    return info
            except Exception as e:
                log.warning("user_info_lookup failed: %s", e)
        return {
            "name": user.get("name") or "",
            "avatar": user.get("avatar") or "",
            "role": user.get("role") or "client",
        }

    # ─── Cities autocomplete ─────────────────────────────────────────

    @router.get("/cities")
    async def list_cities():
        """Villes canoniques + variantes pour autocomplete côté client."""
        return {"cities": all_cities_for_autocomplete()}

    @router.get("/cities/resolve")
    async def resolve_city_endpoint(q: str = Query(..., min_length=1)):
        """Renvoie la ville canonique + label pour un texte donné."""
        canon = resolve_city(q)
        return {"input": q, "canonical": canon, "label": city_display(canon)}

    # ─── Statistiques marketplace ────────────────────────────────────

    @router.get("/stats")
    async def stats():
        s = await service.mobility_stats(db)
        hot = await service.hot_routes(db)
        return {**s, "hot_routes": [
            {**h, "from_label": city_display(h["from_city"]), "to_label": city_display(h["to_city"])}
            for h in hot
        ]}

    # ─── RIDE REQUESTS (Passenger) ───────────────────────────────────

    @router.post("/requests")
    async def create_request(body: RideRequestIn, user=Depends(current_user)):
        passenger_info = await _passenger_info(user)
        doc = await service.create_request(db, user["id"], body.model_dump(), passenger_info)
        # Match & notify drivers asynchronously (in-loop; low cardinality)
        try:
            matches = await matching.match_requests_for_ride  # placeholder to avoid IDE hint
            rides = await matching.match_rides_for_request(db, doc)
            if rides:
                await notify.notify_drivers_of_new_request(db, doc, rides)
        except Exception as e:
            log.warning("match_after_create_request failed: %s", e)
        # Ré-inclus le count de matches pour l'UI
        doc["matches_count"] = len(rides) if 'rides' in locals() and rides else 0
        return doc

    @router.get("/requests")
    async def list_requests(
        from_city: Optional[str] = None,
        to_city: Optional[str] = None,
        date: Optional[str] = None,
        status: Optional[str] = None,
        exclude_self: bool = True,
        limit: int = Query(50, ge=1, le=100),
        user=Depends(optional_user),
    ):
        # Lazy sweep : passe silencieusement les expirées avant retour
        try:
            await sweep_expired(db)
        except Exception:
            pass
        rows = await service.list_requests(
            db,
            from_city=from_city,
            to_city=to_city,
            date=date,
            status=status,
            limit=limit,
            exclude_passenger_id=(user["id"] if (exclude_self and user) else None),
        )
        return rows

    @router.get("/requests/mine")
    async def mine_requests(user=Depends(current_user)):
        return await service.list_mine_requests(db, user["id"])

    @router.get("/requests/{rid}")
    async def get_request(rid: str, user=Depends(optional_user)):
        doc = await service.get_request(db, rid)
        if not doc:
            raise HTTPException(404, "Request not found")
        # Attacher les offres si le user est passenger ou driver concerné (v1 : toujours attacher)
        offers = await service.list_offers_for_request(db, rid)
        return {**doc, "offers": offers}

    @router.patch("/requests/{rid}")
    async def update_request(rid: str, body: RideRequestUpdate, user=Depends(current_user)):
        try:
            payload = {k: v for k, v in body.model_dump().items() if v is not None}
            return await service.update_request(db, rid, user["id"], payload)
        except ValueError as e:
            raise HTTPException(400, str(e))

    @router.post("/requests/{rid}/republish")
    async def republish_request(rid: str, user=Depends(current_user)):
        try:
            doc = await service.republish_request(db, rid, user["id"])
            # Re-run matching à la republication
            try:
                rides = await matching.match_rides_for_request(db, doc)
                if rides:
                    await notify.notify_drivers_of_new_request(db, doc, rides)
            except Exception as e:
                log.warning("republish match failed: %s", e)
            return doc
        except ValueError as e:
            raise HTTPException(400, str(e))

    @router.delete("/requests/{rid}")
    async def delete_request(rid: str, user=Depends(current_user)):
        try:
            await service.delete_request(db, rid, user["id"])
            return {"status": "deleted"}
        except ValueError as e:
            raise HTTPException(400, str(e))

    # ─── OFFERS (Driver → Request) ───────────────────────────────────

    @router.post("/requests/{rid}/offers")
    async def create_offer(rid: str, body: RideOfferIn, user=Depends(current_user)):
        driver_info = await _driver_info(user)
        try:
            offer, request_doc = await service.create_offer(db, rid, user["id"], driver_info, body.model_dump())
            # Notif passager
            try:
                await notify.notify_passenger_new_offer(db, request_doc, offer, driver_info.get("name") or "")
            except Exception as e:
                log.warning("notify_passenger_new_offer failed: %s", e)
            return offer
        except ValueError as e:
            raise HTTPException(400, str(e))

    @router.get("/requests/{rid}/offers")
    async def list_offers(rid: str, user=Depends(current_user)):
        return await service.list_offers_for_request(db, rid)

    @router.post("/offers/{oid}/decision")
    async def decide_offer(oid: str, body: RideOfferDecisionIn, user=Depends(current_user)):
        try:
            offer = await service.decide_offer(db, oid, user["id"], body.action, body.message)
            try:
                await notify.notify_driver_offer_decision(db, offer, accepted=(body.action == "accept"))
            except Exception as e:
                log.warning("notify_driver_offer_decision failed: %s", e)
            return offer
        except ValueError as e:
            raise HTTPException(400, str(e))

    @router.post("/offers/{oid}/withdraw")
    async def withdraw_offer(oid: str, user=Depends(current_user)):
        try:
            return await service.withdraw_offer(db, oid, user["id"])
        except ValueError as e:
            raise HTTPException(400, str(e))

    @router.get("/offers/sent")
    async def offers_sent(user=Depends(current_user)):
        return await service.list_offers_sent(db, user["id"])

    @router.get("/offers/received")
    async def offers_received(user=Depends(current_user)):
        return await service.list_offers_received(db, user["id"])

    @router.get("/offers/{oid}")
    async def get_offer(oid: str, user=Depends(current_user)):
        doc = await service.get_offer(db, oid)
        if not doc:
            raise HTTPException(404, "Offer not found")
        if doc["passenger_id"] != user["id"] and doc["driver_id"] != user["id"]:
            raise HTTPException(403, "Not allowed")
        return doc

    # ─── Rides — matching helper endpoints ───────────────────────────
    # Ces endpoints sont utilisés par le UI conducteur pour :
    # - voir la liste des demandes matchables (avant de proposer)
    # - obtenir des demandes correspondantes pour un axe donné

    @router.get("/rides/{ride_id}/matches")
    async def rides_matches(ride_id: str, user=Depends(current_user)):
        ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
        if not ride:
            raise HTTPException(404, "Ride not found")
        results = await matching.match_requests_for_ride(db, ride)
        return results

    @router.get("/requests/{rid}/rides")
    async def request_matching_rides(rid: str, user=Depends(current_user)):
        req = await service.get_request(db, rid)
        if not req:
            raise HTTPException(404, "Request not found")
        results = await matching.match_rides_for_request(db, req)
        return results

    return router
