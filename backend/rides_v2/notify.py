"""
rides_v2.notify — Notifications matching (push + in-app)
=========================================================

Bind pattern (identique au wallet) : `bind_push()` reçoit une référence à la
fonction `send_push` de `push.py`. Le module publie aussi des notifs in-app
via la collection `notifications` déjà utilisée par le reste de l'app.
"""

from __future__ import annotations
import logging
import uuid
from typing import Any, Callable, Optional

from .constants import (
    NOTIF_CHANNEL_MOBILITY,
    NOTIF_KIND_BOOKING_CREATED,
    NOTIF_KIND_DEPARTURE_REMINDER,
    NOTIF_KIND_NEW_REQUEST_MATCH,
    NOTIF_KIND_NEW_RIDE_MATCH,
    NOTIF_KIND_NEW_OFFER,
    NOTIF_KIND_OFFER_ACCEPTED,
    NOTIF_KIND_OFFER_CLOSED,
    NOTIF_KIND_OFFER_REFUSED,
    NOTIF_KIND_REQUEST_EXPIRING,
    NOTIF_KIND_REQUEST_EXPIRED,
)
from .cities import city_display, resolve_city

log = logging.getLogger("rides_v2.notify")

_send_push_impl: Optional[Callable] = None


def bind_push(fn: Callable):
    """Called by server.py to wire the real send_push implementation."""
    global _send_push_impl
    _send_push_impl = fn


async def _push(recipients: list[str], data: dict, idempotency_key: Optional[str] = None) -> None:
    if not recipients:
        return
    try:
        if _send_push_impl:
            await _send_push_impl(recipients, data, idempotency_key)
    except Exception as e:
        log.warning("push failed: %s", e)


async def _inapp(db: Any, user_id: str, kind: str, title: str, message: str, meta: dict) -> None:
    """Insère une notification in-app."""
    try:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "kind": kind,
            "channel": NOTIF_CHANNEL_MOBILITY,
            "title": title,
            "message": message,
            "meta": meta,
            "read": False,
            "created_at": _now(),
        })
    except Exception as e:
        log.warning("in-app notif insert failed: %s", e)


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _route_display(from_c: Optional[str], to_c: Optional[str]) -> str:
    return f"{city_display(resolve_city(from_c) or (from_c or ''))} → {city_display(resolve_city(to_c) or (to_c or ''))}"


# ─── High-level notif triggers ───────────────────────────────────────

async def notify_drivers_of_new_request(db: Any, request: dict, drivers: list[dict]) -> int:
    """
    Prévient les conducteurs dont un trajet publié matche la demande fraîchement créée.
    `drivers` = liste de trajets matchés (chaque item contient au moins driver_id, id, from_city, to_city).
    """
    if not drivers:
        return 0
    route = _route_display(request.get("from_city"), request.get("to_city"))
    date = (request.get("date") or "")[:10]
    time_hint = request.get("time_from") or ""
    seen: set[str] = set()
    count = 0
    for r in drivers:
        did = r.get("driver_id")
        if not did or did in seen:
            continue
        seen.add(did)
        title = "Nouvelle demande sur votre trajet"
        message = f"{route} · {date} {time_hint}".strip()
        await _inapp(
            db,
            did,
            NOTIF_KIND_NEW_REQUEST_MATCH,
            title,
            message,
            {"request_id": request["id"], "ride_id": r.get("id")},
        )
        await _push(
            [did],
            {
                "title": title,
                "message": message,
                "action_url": f"/mobility/requests/{request['id']}",
                "channel_id": NOTIF_CHANNEL_MOBILITY,
            },
            idempotency_key=f"req_match:{request['id']}:{did}",
        )
        count += 1
    return count


async def notify_passenger_of_new_ride(db: Any, request: dict, ride: dict) -> None:
    """Prévient le passager qu'un trajet compatible avec sa demande vient d'être publié."""
    passenger_id = request.get("passenger_id")
    if not passenger_id:
        return
    route = _route_display(ride.get("from_city"), ride.get("to_city"))
    date = (ride.get("date") or "")[:10]
    time_hint = ride.get("time") or ""
    title = "Un trajet compatible vient d'être publié"
    message = f"{route} · {date} {time_hint}".strip()
    await _inapp(
        db,
        passenger_id,
        NOTIF_KIND_NEW_RIDE_MATCH,
        title,
        message,
        {"ride_id": ride.get("id"), "request_id": request["id"]},
    )
    await _push(
        [passenger_id],
        {
            "title": title,
            "message": message,
            "action_url": f"/mobility/rides/{ride.get('id')}",
            "channel_id": NOTIF_CHANNEL_MOBILITY,
        },
        idempotency_key=f"ride_match:{ride.get('id')}:{request['id']}",
    )


async def notify_passenger_new_offer(db: Any, request: dict, offer: dict, driver_name: str = "") -> None:
    passenger_id = request.get("passenger_id")
    if not passenger_id:
        return
    route = _route_display(request.get("from_city"), request.get("to_city"))
    title = "Nouvelle offre reçue"
    message = f"{driver_name or 'Un conducteur'} propose votre {route}".strip()
    await _inapp(
        db,
        passenger_id,
        NOTIF_KIND_NEW_OFFER,
        title,
        message,
        {"request_id": request["id"], "offer_id": offer["id"]},
    )
    await _push(
        [passenger_id],
        {
            "title": title,
            "message": message,
            "action_url": f"/mobility/requests/{request['id']}",
            "channel_id": NOTIF_CHANNEL_MOBILITY,
        },
        idempotency_key=f"offer_new:{offer['id']}",
    )


async def notify_driver_offer_decision(db: Any, offer: dict, accepted: bool) -> None:
    driver_id = offer.get("driver_id")
    if not driver_id:
        return
    kind = NOTIF_KIND_OFFER_ACCEPTED if accepted else NOTIF_KIND_OFFER_REFUSED
    title = "Offre acceptée 🎉" if accepted else "Offre déclinée"
    message = "Le passager a accepté votre proposition." if accepted else "Le passager n'a pas retenu votre proposition."
    await _inapp(db, driver_id, kind, title, message, {"offer_id": offer["id"], "request_id": offer.get("request_id")})
    await _push(
        [driver_id],
        {
            "title": title,
            "message": message,
            "action_url": f"/mobility/requests/{offer.get('request_id')}",
            "channel_id": NOTIF_CHANNEL_MOBILITY,
        },
        idempotency_key=f"offer_dec:{offer['id']}:{accepted}",
    )


async def notify_request_expiring(db: Any, request: dict) -> None:
    """Rappel avant expiration : incite à republier."""
    passenger_id = request.get("passenger_id")
    if not passenger_id:
        return
    route = _route_display(request.get("from_city"), request.get("to_city"))
    title = "Votre demande expire bientôt"
    message = f"{route} · Souhaitez-vous la republier ?"
    await _inapp(
        db,
        passenger_id,
        NOTIF_KIND_REQUEST_EXPIRING,
        title,
        message,
        {"request_id": request["id"]},
    )
    await _push(
        [passenger_id],
        {
            "title": title,
            "message": message,
            "action_url": f"/mobility/requests/{request['id']}",
            "channel_id": NOTIF_CHANNEL_MOBILITY,
        },
        idempotency_key=f"req_expiring:{request['id']}",
    )


async def notify_request_expired(db: Any, request: dict) -> None:
    passenger_id = request.get("passenger_id")
    if not passenger_id:
        return
    route = _route_display(request.get("from_city"), request.get("to_city"))
    title = "Demande expirée"
    message = f"{route} · Republiez en un clic."
    await _inapp(
        db,
        passenger_id,
        NOTIF_KIND_REQUEST_EXPIRED,
        title,
        message,
        {"request_id": request["id"]},
    )
    # Pas de push obligatoire pour l'expiration effective (le rappel suffit).


async def notify_losing_drivers(db: Any, request: dict, losing_offer_ids: list[str]) -> int:
    """
    Prévient les conducteurs dont l'offre a été fermée automatiquement suite
    à l'acceptation d'une autre offre. Message : "Cette demande a déjà trouvé un conducteur."
    """
    if not losing_offer_ids:
        return 0
    route = _route_display(request.get("from_city"), request.get("to_city"))
    count = 0
    async for offer in db.ride_offers.find({"id": {"$in": losing_offer_ids}}, {"_id": 0, "driver_id": 1, "id": 1}):
        did = offer.get("driver_id")
        if not did:
            continue
        title = "Cette demande a trouvé un conducteur"
        message = f"{route} · Merci pour votre proposition."
        await _inapp(
            db, did,
            NOTIF_KIND_OFFER_CLOSED,
            title, message,
            {"request_id": request["id"], "offer_id": offer["id"]},
        )
        await _push(
            [did],
            {
                "title": title,
                "message": message,
                "action_url": f"/mobility/offers/sent",
                "channel_id": NOTIF_CHANNEL_MOBILITY,
            },
            idempotency_key=f"offer_closed:{offer['id']}",
        )
        count += 1
    return count


async def notify_booking_created(db: Any, request: dict, booking: dict) -> None:
    """Notif au passager après création automatique de sa réservation."""
    passenger_id = request.get("passenger_id")
    if not passenger_id:
        return
    route = _route_display(request.get("from_city"), request.get("to_city"))
    title = "Réservation confirmée"
    message = f"{route} · {booking.get('seats', 1)} place(s) · {booking.get('price_xof', 0):,} F CFA".replace(",", " ")
    await _inapp(
        db, passenger_id,
        NOTIF_KIND_BOOKING_CREATED,
        title, message,
        {"request_id": request["id"], "booking_id": booking["id"]},
    )
    await _push(
        [passenger_id],
        {
            "title": title,
            "message": message,
            "action_url": f"/booking/detail/{booking['id']}",
            "channel_id": NOTIF_CHANNEL_MOBILITY,
        },
        idempotency_key=f"booking_created:{booking['id']}",
    )


async def notify_departure_reminder(db: Any, request: dict, offer: Optional[dict], booking: Optional[dict]) -> None:
    """
    Rappel avant départ : prévient le passager (et le conducteur si offre présente).
    Envoyé ~2h avant l'heure de départ.
    """
    route = _route_display(request.get("from_city"), request.get("to_city"))
    time_hint = request.get("time_from") or ""
    title = "Départ dans environ 2 heures"
    message = f"{route} · {time_hint}"
    # Passager
    pid = request.get("passenger_id")
    if pid:
        await _inapp(db, pid, NOTIF_KIND_DEPARTURE_REMINDER, title, message,
                     {"request_id": request["id"], "booking_id": (booking or {}).get("id")})
        await _push([pid], {"title": title, "message": message, "action_url": f"/mobility/requests/{request['id']}", "channel_id": NOTIF_CHANNEL_MOBILITY},
                    idempotency_key=f"depart:{request['id']}:p")
    # Conducteur (si offre acceptée connue)
    if offer and offer.get("driver_id"):
        did = offer["driver_id"]
        await _inapp(db, did, NOTIF_KIND_DEPARTURE_REMINDER, title, message,
                     {"request_id": request["id"], "offer_id": offer.get("id")})
        await _push([did], {"title": title, "message": message, "action_url": f"/mobility/offers/sent", "channel_id": NOTIF_CHANNEL_MOBILITY},
                    idempotency_key=f"depart:{request['id']}:d")
