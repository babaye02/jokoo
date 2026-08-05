"""
Apple Sign in with Apple — server-side helpers.

Handles:
- Client secret JWT generation (ES256, signed with the Sign in with Apple .p8 key).
- Exchange of the authorization_code for a refresh_token at /auth/token.
- Revocation of the stored refresh_token at /auth/revoke on account deletion.

Design:
- Native App ID flow only (client_id = bundle ID `com.jokoo.app`). No Services ID.
- Defensive: if Apple credentials are not configured, all functions degrade
  gracefully (log a warning, return None/False) so that the app remains usable
  in dev and account deletion always succeeds locally.

Required env variables (set in backend/.env or Kubernetes secret):
    APPLE_TEAM_ID          — 10-char Apple Developer Team ID (e.g. "7NU22762D3")
    APPLE_KEY_ID           — 10-char Sign in with Apple key ID
    APPLE_CLIENT_ID        — App bundle ID (defaults to "com.jokoo.app")
    APPLE_PRIVATE_KEY_PATH — Path to .p8 file (preferred in production)
    APPLE_PRIVATE_KEY      — Raw .p8 contents (with literal \\n) if no file mount

Compliance: Apple 5.1.1(v) requires revoking Sign in with Apple tokens when a
user deletes their account. See:
- https://developer.apple.com/documentation/technotes/tn3194
- https://developer.apple.com/support/offering-account-deletion-in-your-app/
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

import httpx
import jwt

log = logging.getLogger("jokoo.apple_siwa")

APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"
APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke"
APPLE_AUDIENCE = "https://appleid.apple.com"
DEFAULT_CLIENT_ID = "com.jokoo.app"
# Apple caps client_secret validity at 6 months. Using 180 days gives us a safe
# margin and forces natural rotation each request.
CLIENT_SECRET_LIFETIME_SECONDS = 180 * 24 * 60 * 60


def _load_private_key() -> Optional[str]:
    """Return the .p8 PEM contents, or None if not configured."""
    path = os.getenv("APPLE_PRIVATE_KEY_PATH")
    if path:
        try:
            return Path(path).read_text(encoding="utf-8")
        except Exception as e:  # noqa: BLE001
            log.warning("APPLE_PRIVATE_KEY_PATH set but unreadable (%s): %s", path, e)
            return None

    value = os.getenv("APPLE_PRIVATE_KEY")
    if value:
        # Env vars typically cannot contain literal newlines; accept \n escapes.
        return value.replace("\\n", "\n")

    return None


def apple_configured() -> bool:
    """True only if ALL Apple Sign-In credentials are configured."""
    return bool(
        os.getenv("APPLE_TEAM_ID")
        and os.getenv("APPLE_KEY_ID")
        and _load_private_key()
    )


def build_client_secret() -> str:
    """Create the Apple developer JWT (ES256). Never log or return to client."""
    team_id = os.environ["APPLE_TEAM_ID"]
    key_id = os.environ["APPLE_KEY_ID"]
    client_id = os.getenv("APPLE_CLIENT_ID", DEFAULT_CLIENT_ID)
    private_key = _load_private_key()
    if not private_key:
        raise RuntimeError("Apple private key is not configured")

    now = int(time.time())
    payload = {
        "iss": team_id,
        "iat": now,
        "exp": now + CLIENT_SECRET_LIFETIME_SECONDS,
        "aud": APPLE_AUDIENCE,
        "sub": client_id,
    }
    headers = {"kid": key_id, "alg": "ES256"}
    return jwt.encode(payload, private_key, algorithm="ES256", headers=headers)


async def exchange_authorization_code(code: str) -> Optional[dict[str, Any]]:
    """Exchange an Apple authorization_code for tokens (incl. refresh_token).

    Returns the token response dict on success, or None if:
    - Apple credentials are not configured (dev mode fallback).
    - The exchange failed (network/HTTP error).
    - Apple did not return a refresh_token.
    """
    if not apple_configured():
        log.warning("Apple credentials not configured; skipping token exchange")
        return None
    if not code:
        return None

    try:
        form = {
            "client_id": os.getenv("APPLE_CLIENT_ID", DEFAULT_CLIENT_ID),
            "client_secret": build_client_secret(),
            "code": code,
            "grant_type": "authorization_code",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                APPLE_TOKEN_URL,
                data=form,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        if response.status_code != 200:
            log.warning(
                "Apple /auth/token returned HTTP %s (body redacted)",
                response.status_code,
            )
            return None
        result = response.json()
        if not result.get("refresh_token"):
            log.warning("Apple token response did not contain refresh_token")
            return None
        return result
    except Exception:  # noqa: BLE001
        log.exception("Apple /auth/token exchange failed")
        return None


async def revoke_apple_refresh_token(refresh_token: Optional[str]) -> bool:
    """Best-effort revocation at Apple /auth/revoke.

    Returns True on HTTP 200 from Apple. Always returns False (with a warning
    log) on any failure path — the caller MUST still proceed with the local
    account deletion so users can always delete their data.
    """
    if not refresh_token:
        # User signed in via Apple before this feature shipped — nothing to revoke.
        return False
    if not apple_configured():
        log.warning("Apple credentials not configured; skipping revocation")
        return False

    try:
        form = {
            "client_id": os.getenv("APPLE_CLIENT_ID", DEFAULT_CLIENT_ID),
            "client_secret": build_client_secret(),
            "token": refresh_token,
            "token_type_hint": "refresh_token",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                APPLE_REVOKE_URL,
                data=form,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        if response.status_code == 200:
            log.info("Apple refresh_token successfully revoked")
            return True
        log.warning(
            "Apple /auth/revoke returned HTTP %s (body redacted); continuing deletion",
            response.status_code,
        )
        return False
    except Exception:  # noqa: BLE001
        log.exception("Apple /auth/revoke call failed; continuing local deletion")
        return False
