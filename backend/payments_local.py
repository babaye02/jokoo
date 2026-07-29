"""Wave Business + Orange Money Web Payment integrations for Jokoo.

Both providers use a hosted redirect flow:
- Backend creates a payment session → returns a URL.
- Frontend opens the URL in an in-app browser.
- Wave: signed webhook → we mark the booking as paid.
- Orange Money: no webhook; frontend polls /payments/orange/status/{token}.

Credentials come from .env (empty by default). Endpoints raise a clear HTTPException(503)
when credentials are missing so the frontend can display a friendly error.
"""

import hmac
import hashlib
import os
import uuid
from typing import Any, Optional

import httpx
from fastapi import HTTPException, Request


# ---------- Wave Business ----------

WAVE_API_KEY = os.environ.get("WAVE_API_KEY", "")
WAVE_WEBHOOK_SECRET = os.environ.get("WAVE_WEBHOOK_SECRET", "")
WAVE_BASE_URL = os.environ.get("WAVE_BASE_URL", "https://api.wave.com/v1")


def _require_wave() -> None:
    if not WAVE_API_KEY:
        raise HTTPException(
            503,
            "Wave n'est pas encore configuré. Ajoutez WAVE_API_KEY dans le fichier .env du backend.",
        )


async def wave_create_checkout(
    *,
    amount_xof: int,
    success_url: str,
    error_url: str,
    client_reference: str,
    metadata: Optional[dict] = None,
) -> dict:
    """Create a Wave Checkout session.

    See https://docs.wave.com/checkout — POST /v1/checkout/sessions.
    Returns the raw JSON response (contains `id`, `wave_launch_url`, ...).
    """
    _require_wave()
    payload = {
        "amount": str(int(amount_xof)),  # XOF integer string
        "currency": "XOF",
        "success_url": success_url,
        "error_url": error_url,
        "client_reference": client_reference,
    }
    if metadata:
        # Wave doesn't accept nested metadata dict on session create for all merchants;
        # we stash relevant ids in client_reference and rely on it in the webhook.
        pass

    headers = {
        "Authorization": f"Bearer {WAVE_API_KEY}",
        "Content-Type": "application/json",
        "idempotency-key": str(uuid.uuid4()),
    }
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{WAVE_BASE_URL}/checkout/sessions", json=payload, headers=headers)
    if r.status_code >= 300:
        raise HTTPException(r.status_code, f"Wave: {r.text}")
    return r.json()


async def wave_get_session(session_id: str) -> dict:
    _require_wave()
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            f"{WAVE_BASE_URL}/checkout/sessions/{session_id}",
            headers={"Authorization": f"Bearer {WAVE_API_KEY}"},
        )
    if r.status_code >= 300:
        raise HTTPException(r.status_code, f"Wave: {r.text}")
    return r.json()


def wave_verify_webhook(raw_body: bytes, signature_header: Optional[str]) -> bool:
    """Verify Wave webhook signature.

    Wave sends `Wave-Signature: t=<ts>,v1=<hex>` where the signed payload is
    "<ts>.<raw_body>" HMAC-SHA256'd with WAVE_WEBHOOK_SECRET.
    """
    if not WAVE_WEBHOOK_SECRET or not signature_header:
        return False
    try:
        parts = dict(p.split("=", 1) for p in signature_header.split(","))
        ts = parts.get("t")
        sig = parts.get("v1")
        if not ts or not sig:
            return False
        signed = f"{ts}.{raw_body.decode('utf-8')}".encode("utf-8")
        expected = hmac.new(
            WAVE_WEBHOOK_SECRET.encode("utf-8"), signed, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, sig)
    except Exception:
        return False


# ---------- Orange Money Web Payment ----------

OM_CLIENT_ID = os.environ.get("OM_CLIENT_ID", "")
OM_CLIENT_SECRET = os.environ.get("OM_CLIENT_SECRET", "")
OM_MERCHANT_KEY = os.environ.get("OM_MERCHANT_KEY", "")
OM_BASE_URL = os.environ.get(
    "OM_BASE_URL", "https://api.orange.com/orange-money-webpay/dev/v1"
)
OM_TOKEN_URL = os.environ.get("OM_TOKEN_URL", "https://api.orange.com/oauth/v3/token")


def _require_om() -> None:
    if not (OM_CLIENT_ID and OM_CLIENT_SECRET and OM_MERCHANT_KEY):
        raise HTTPException(
            503,
            "Orange Money n'est pas encore configuré. Ajoutez OM_CLIENT_ID, "
            "OM_CLIENT_SECRET et OM_MERCHANT_KEY dans le fichier .env du backend.",
        )


async def _om_get_token() -> str:
    """OAuth2 client credentials grant against Orange Developer."""
    _require_om()
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            OM_TOKEN_URL,
            data={"grant_type": "client_credentials"},
            auth=(OM_CLIENT_ID, OM_CLIENT_SECRET),
            headers={"Accept": "application/json"},
        )
    if r.status_code >= 300:
        raise HTTPException(r.status_code, f"Orange Money OAuth: {r.text}")
    data = r.json()
    tok = data.get("access_token")
    if not tok:
        raise HTTPException(502, "Orange Money: access_token manquant")
    return tok


async def om_create_webpayment(
    *,
    amount_xof: int,
    order_id: str,
    return_url: str,
    cancel_url: str,
    notif_url: str,
    reference: str = "Jokoo",
    lang: str = "fr",
) -> dict:
    """Create an Orange Money Web Payment session.

    Returns dict with `pay_token`, `payment_url`, `notif_token`.
    """
    token = await _om_get_token()
    payload = {
        "merchant_key": OM_MERCHANT_KEY,
        "currency": "OUV",  # OUV = XOF pour OM sandbox; utiliser "XOF" en prod
        "order_id": order_id,
        "amount": int(amount_xof),
        "return_url": return_url,
        "cancel_url": cancel_url,
        "notif_url": notif_url,
        "lang": lang,
        "reference": reference,
    }
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(
            f"{OM_BASE_URL}/webpayment",
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
    if r.status_code >= 300:
        raise HTTPException(r.status_code, f"Orange Money: {r.text}")
    return r.json()


async def om_get_status(pay_token: str) -> dict:
    """Poll transaction status. Response includes `status` (SUCCESS / PENDING / FAILED / EXPIRED)."""
    token = await _om_get_token()
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(
            f"{OM_BASE_URL}/transactionstatus/{pay_token}",
            params={"merchant_key": OM_MERCHANT_KEY},
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
    if r.status_code >= 300:
        raise HTTPException(r.status_code, f"Orange Money status: {r.text}")
    return r.json()
