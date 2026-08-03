"""
Push notifications module — Emergent-managed (SuprSend relay).

Provides:
  - POST /api/register-push : device registration relayed to SuprSend.
  - send_push()             : server-side helper to trigger notifications.

Never store device tokens locally — SuprSend resolves user_id → tokens at trigger time.

Environment:
  - EMERGENT_PUSH_KEY : provided at deploy (placeholder in dev).
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("jokoo.push")

PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")

# Shared async client (single connection pool)
_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)

push_router = APIRouter(prefix="/api", tags=["push"])


class RegisterPushBody(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=128)
    platform: str = Field(..., pattern="^(ios|android|web)$")
    device_token: str = Field(..., min_length=8, max_length=4096)


@push_router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    """Relay device registration to SuprSend. Called from the app after login."""
    try:
        resp = await _client.post("/api/v1/push/users/register", json=body.model_dump())
    except httpx.RequestError as e:
        logger.warning("Push registration transport error: %s", e)
        raise HTTPException(502, "Push provider unreachable")
    if resp.status_code == 401:
        logger.error("EMERGENT_PUSH_KEY missing or invalid at push register")
        raise HTTPException(500, "Push key misconfigured")
    if resp.status_code >= 500:
        logger.warning("Push provider 5xx on register: %s", resp.status_code)
        raise HTTPException(502, "Push provider unavailable")
    try:
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        logger.warning("Push register non-2xx: %s", e)
        raise HTTPException(resp.status_code, "Push registration rejected")
    return {"status": "registered"}


async def send_push(
    recipients: list[str],
    data: dict,
    idempotency_key: Optional[str] = None,
) -> None:
    """
    Send a push notification via Emergent relay. Non-blocking : caller wraps in try/except.

    Args:
      recipients        : list of user_ids (max 100)
      data              : must contain title & message. Optional keys :
                          subtext, image_url, action_url (deep link), channel_id, sound
      idempotency_key   : optional dedupe token

    Notes:
      - Push failure NEVER blocks the primary business operation.
      - action_url can be a route ("/booking/xyz") or full https url.
    """
    if not recipients:
        return
    if len(recipients) > 100:
        raise ValueError("max 100 recipients per push trigger")
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")

    # Filter empties defensively
    recipients = [str(r) for r in recipients if r]
    if not recipients:
        return

    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key

    try:
        resp = await _client.post("/api/v1/push/trigger", json=payload)
    except httpx.RequestError as e:
        logger.warning("Push send transport error: %s", e)
        return  # non-blocking

    if resp.status_code == 401:
        logger.error("EMERGENT_PUSH_KEY invalid at push send (using placeholder in dev is expected)")
        return
    if resp.status_code >= 500:
        logger.warning("Push provider 5xx on send: %s", resp.status_code)
        return
    if resp.status_code >= 400:
        logger.warning("Push send %s: %s", resp.status_code, resp.text[:200])
        return
    logger.info("Push sent to %d recipient(s) — title=%r", len(recipients), data.get("title"))


# ─────────────────────────────────────────────────────────────────────────────
# High-level triggers — semantic wrappers used by the rest of the backend.
# Each accepts a MongoDB-shaped Booking/Message/Payment dict and dispatches
# a well-typed push. All wrapped in try/except at the call site.
# ─────────────────────────────────────────────────────────────────────────────


async def notify_new_message(recipient_id: str, sender_name: str, preview: str, thread_id: str) -> None:
    await send_push(
        recipients=[recipient_id],
        data={
            "title": sender_name or "Nouveau message",
            "message": (preview or "")[:120] or "📩 Nouveau message reçu",
            "action_url": f"/chat/{thread_id}",
        },
    )


async def notify_new_booking_provider(provider_id: str, client_name: str, service_title: str, booking_id: str) -> None:
    await send_push(
        recipients=[provider_id],
        data={
            "title": "Nouvelle réservation",
            "message": f"{client_name or 'Un client'} a réservé « {service_title or 'votre prestation'} »",
            "action_url": "/dashboard",
        },
        idempotency_key=f"booking_new:{booking_id}",
    )


async def notify_booking_status_change(recipient_id: str, status: str, booking_id: str, family: bool = False) -> None:
    """Called when a booking transitions to accepted / rejected / in_progress / completed."""
    labels = {
        "accepted": ("Réservation acceptée ✅", "Ta prestation est confirmée. Prépare-toi !"),
        "confirmed": ("Réservation confirmée ✅", "Ta prestation est confirmée. Prépare-toi !"),
        "rejected": ("Réservation refusée", "Ta demande n'a pas pu être acceptée. Retrouve d'autres pros."),
        "cancelled": ("Réservation annulée", "Ta réservation a été annulée."),
        "in_progress": ("Mission démarrée 🚀", "Le prestataire vient de commencer."),
        "completed": ("Mission terminée 🎉", "Comment s'est passée ton expérience ? Note ton prestataire."),
    }
    title, msg = labels.get(status, ("Statut mis à jour", f"Statut : {status}"))
    action = f"/family/booking/{booking_id}" if family else f"/booking/{booking_id}"
    await send_push(
        recipients=[recipient_id],
        data={"title": title, "message": msg, "action_url": action},
        idempotency_key=f"booking_status:{booking_id}:{status}",
    )


async def notify_payment(recipient_id: str, success: bool, amount_xof: int, reference: str) -> None:
    if success:
        title = "Paiement reçu 💰"
        msg = f"+{amount_xof:,} FCFA crédité sur ton portefeuille".replace(",", " ")
    else:
        title = "Paiement échoué"
        msg = "Une transaction n'a pas abouti. Ouvre ton portefeuille pour vérifier."
    await send_push(
        recipients=[recipient_id],
        data={"title": title, "message": msg, "action_url": "/wallet"},
        idempotency_key=f"pay:{reference}:{'ok' if success else 'ko'}",
    )


async def notify_promo(recipient_ids: list[str], code: str, headline: str, message: str) -> None:
    # Chunk to respect the 100-recipient hard limit
    if not recipient_ids:
        return
    for i in range(0, len(recipient_ids), 100):
        batch = recipient_ids[i : i + 100]
        await send_push(
            recipients=batch,
            data={
                "title": headline or "🎁 Nouvelle promo",
                "message": message or f"Utilise le code {code} pour économiser.",
                "action_url": "/promo-codes",
            },
            idempotency_key=f"promo:{code}:{i}",
        )
