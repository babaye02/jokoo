"""Jokoo backend — Senegalese services marketplace.

Endpoints under /api prefix:
  Auth: /auth/register, /auth/login, /auth/me
  Services: /services
  Providers: /providers, /providers/{id}, /providers/me (upsert)
  Bookings: /bookings, /bookings/{id} (accept/reject/complete)
  Reviews: /reviews
  Favorites: /favorites, /favorites/{provider_id}
  Chat: /chat/conversations, /chat/{peer_id}/messages
  Notifications: /notifications
  Dashboard: /dashboard
  Payments: /payments/checkout/booking, /payments/checkout/subscription
  Utility: /seed
"""

import os
import uuid
import secrets
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone
import json
from typing import Any, List, Optional, Literal

import bcrypt
import jwt
from apple_siwa import (
    exchange_authorization_code as _apple_exchange_code,
    revoke_apple_refresh_token as _apple_revoke_token,
    apple_configured as _apple_configured,
)
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Header, Request, Query
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, field_validator

from payments_local import (
    wave_create_checkout,
    wave_get_session,
    wave_verify_webhook,
    om_create_webpayment,
    om_get_status,
)


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------- config ----------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "").strip()
if not JWT_SECRET:
    # Dev fallback : autorisé uniquement quand DEBUG=1, sinon on plante fort au démarrage.
    if os.environ.get("DEBUG", "0") == "1":
        JWT_SECRET = "jokoo-dev-secret-change-me"
    else:
        raise RuntimeError(
            "JWT_SECRET manquant en production. Définir la variable d'environnement JWT_SECRET avant de démarrer."
        )
JWT_ALG = "HS256"
JWT_EXP_DAYS = 30

# ─── Stripe : entièrement optionnel ────────────────────────────
# La version production (Sénégal) doit pouvoir tourner SANS aucune clé Stripe.
# Stripe reste réactivable en fournissant STRIPE_API_KEY dans l'environnement.
STRIPE_KEY = os.environ.get("STRIPE_API_KEY", "").strip()
# Ne considérer Stripe "activé" que si la clé n'est pas vide et pas un placeholder.
STRIPE_ENABLED = bool(STRIPE_KEY) and STRIPE_KEY.lower() not in {"disabled", "placeholder", "none", "off"}
APP_URL = os.environ.get("APP_URL", "").strip()
if not APP_URL:
    # Fallback dev : autorisé uniquement quand DEBUG=1 (preview locale).
    # En production, APP_URL DOIT être fourni pour que les callbacks Stripe/Wave/Orange
    # et les liens des emails pointent vers le bon domaine.
    if os.environ.get("DEBUG", "0") == "1":
        APP_URL = "http://localhost:8001"
    else:
        raise RuntimeError(
            "APP_URL manquant en production. Définir APP_URL (ex: https://api.jokooservices.com) avant de démarrer."
        )
try:
    stripe_checkout = StripeCheckout(api_key=STRIPE_KEY) if STRIPE_ENABLED else None
except Exception:
    stripe_checkout = None
    STRIPE_ENABLED = False


def _require_stripe():
    """Lève 503 propre si Stripe n'est pas configuré (build Sénégal)."""
    if not STRIPE_ENABLED or stripe_checkout is None:
        raise HTTPException(
            503,
            "Le paiement par carte bancaire est temporairement indisponible. "
            "Utilisez Wave, Orange Money ou payez en espèces à la fin de la prestation.",
        )
    return stripe_checkout


# Import différé pour éviter l'ordre d'import
from payments_local import WAVE_API_KEY as _WAVE_KEY, OM_CLIENT_ID as _OM_ID, OM_CLIENT_SECRET as _OM_SECRET, OM_MERCHANT_KEY as _OM_MERCH  # noqa: E402
from seed_legal_contents import _build_seed_legal_contents  # noqa: E402


def _wave_enabled() -> bool:
    return bool(_WAVE_KEY)


def _orange_enabled() -> bool:
    return bool(_OM_ID and _OM_SECRET and _OM_MERCH)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Jokoo API")
api = APIRouter(prefix="/api")

# ---------- Structured logging ----------
logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":%(message)s}',
)
log = logging.getLogger("jokoo")


# ─────────────────────────────────────────────────────────────
# 🔔 Push notifications (Emergent-managed via SuprSend relay)
# ─────────────────────────────────────────────────────────────
import httpx as _httpx_push  # noqa: E402

PUSH_BASE_URL = "https://integrations.emergentagent.com"
_EMERGENT_PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
_push_client = _httpx_push.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": _EMERGENT_PUSH_KEY},
    timeout=10.0,
)


async def send_push(
    recipients: list[str],
    data: dict,
    idempotency_key: Optional[str] = None,
) -> None:
    """Envoie une notification push aux utilisateurs.
    - `recipients` : liste des user IDs (max 100 par appel).
    - `data` doit contenir au minimum `title` et `message` (str).
      Optionnels : `subtext`, `image_url`, `action_url`, `channel_id`, `sound`.
    Toute erreur est catchée par l'appelant (patron try/except non-bloquant).
    """
    if not recipients:
        return
    if len(recipients) > 100:
        # Chunker par lots de 100
        for i in range(0, len(recipients), 100):
            await send_push(recipients[i:i + 100], data, idempotency_key)
        return
    if "title" not in data or "message" not in data:
        raise ValueError("send_push: data must include title and message")
    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await _push_client.post("/api/v1/push/trigger", json=payload)
    if resp.status_code == 401:
        # SuprSend renvoie 401 en dev quand la clé est un placeholder — traiter comme 502
        raise HTTPException(502, "Push provider unavailable")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str  # "android" | "ios"
    device_token: str


@api.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    """Enregistre (ou met à jour) le token push natif d'un appareil.
    Persiste également en base pour le ciblage CRM (Campagnes)."""
    # Persistance MongoDB — obligatoire pour le CRM Campagnes
    try:
        await db.push_devices.update_one(
            {"user_id": body.user_id, "device_token": body.device_token},
            {
                "$set": {
                    "user_id": body.user_id,
                    "platform": body.platform,
                    "device_token": body.device_token,
                    "last_seen_at": now_iso(),
                    "active": True,
                },
                "$setOnInsert": {"created_at": now_iso()},
            },
            upsert=True,
        )
    except Exception as e:
        log.warning(f"push_devices upsert failed (non-blocking): {e}")

    # Relais vers Emergent SuprSend (peut renvoyer 500 en dev si placeholder)
    try:
        resp = await _push_client.post("/api/v1/push/users/register", json=body.model_dump())
    except _httpx_push.HTTPError as e:
        log.warning(f"register-push upstream error: {e}")
        raise HTTPException(502, "Push provider unavailable")
    if resp.status_code == 401:
        # SuprSend renvoie 401 en dev quand la clé est un placeholder — traiter comme 502
        raise HTTPException(502, "Push provider unavailable")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}


def audit_log(event: str, **fields: Any) -> None:
    """Log structuré JSON pour audit sécurité (login, paiement, RGPD, admin)."""
    try:
        safe = {k: v for k, v in fields.items() if k != "password"}
        log.info(json.dumps({"event": event, **safe}, default=str))
    except Exception:
        log.info(json.dumps({"event": event, "error": "log_serialize_failed"}))


# ---------- Rate limiter (slowapi) ----------
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded

    def _rl_key(request: Request) -> str:
        # Priorité au user_id si authentifié (via header), sinon IP.
        # ⚠️ On utilise la SIGNATURE JWT (dernière partie après le 2e point)
        #    car les 25 premiers caractères sont l'en-tête base64 standard
        #    (`eyJhbGciOiJIUzI1NiJ9...`) — identique pour TOUS les users.
        #    Utiliser [7:32] créait une collision globale → un seul user à
        #    forte activité bloquait toute la base.
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            tok = auth[7:]
            # JWT format = HEADER.PAYLOAD.SIGNATURE — la signature est unique
            parts = tok.rsplit(".", 1)
            sig = parts[-1] if len(parts) > 1 else tok
            return f"tok:{sig[:32]}"
        return get_remote_address(request)

    limiter = Limiter(key_func=_rl_key, default_limits=["6000/minute"])
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    RATE_LIMIT_ENABLED = True
except Exception as _rl_err:
    log.warning('"rate_limiter_disabled: %s"' % str(_rl_err))
    limiter = None
    RATE_LIMIT_ENABLED = False


# ---------- Brute-force lockout helper ----------
BRUTE_MAX_ATTEMPTS = 5
BRUTE_WINDOW_SEC = 15 * 60   # 15 min
BRUTE_LOCKOUT_SEC = 30 * 60  # 30 min

async def brute_force_check(identifier: str, ip: str) -> None:
    """Bloque temporairement après trop d'échecs.
    Identifie par email et IP conjointement pour limiter les faux positifs partagés."""
    now = datetime.now(timezone.utc)
    keys = [f"login:email:{identifier.lower()}", f"login:ip:{ip}"]
    for k in keys:
        doc = await db.rate_limit.find_one({"_id": k})
        if not doc:
            continue
        locked_until = doc.get("locked_until")
        if locked_until:
            # Assurer que locked_until est timezone-aware (compat legacy naive)
            if isinstance(locked_until, datetime) and locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=timezone.utc)
            if now < locked_until:
                remaining = int((locked_until - now).total_seconds())
                raise HTTPException(429, f"Trop de tentatives. Réessayez dans {remaining // 60} min.")


async def brute_force_record(identifier: str, ip: str, success: bool) -> None:
    now = datetime.now(timezone.utc)
    keys = [f"login:email:{identifier.lower()}", f"login:ip:{ip}"]
    for k in keys:
        if success:
            await db.rate_limit.delete_one({"_id": k})
            continue
        # Sliding window : garde les échecs des BRUTE_WINDOW_SEC dernières s
        doc = await db.rate_limit.find_one({"_id": k}) or {"_id": k, "attempts": []}
        cutoff = now - timedelta(seconds=BRUTE_WINDOW_SEC)
        # Assurer que les attempts stockés sont timezone-aware (compat legacy)
        attempts = []
        for a in (doc.get("attempts") or []):
            if isinstance(a, datetime) and a.tzinfo is None:
                a = a.replace(tzinfo=timezone.utc)
            if a > cutoff:
                attempts.append(a)
        attempts.append(now)
        update = {"$set": {"attempts": attempts, "updated_at": now}}
        if len(attempts) >= BRUTE_MAX_ATTEMPTS:
            update["$set"]["locked_until"] = now + timedelta(seconds=BRUTE_LOCKOUT_SEC)
            audit_log("auth.brute_force_lock", key=k, attempts=len(attempts))
        await db.rate_limit.update_one({"_id": k}, update, upsert=True)


# ---------- helpers ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


async def hash_password_async(password: str) -> str:
    """bcrypt est CPU-bound (~100-300ms). On l'exécute dans un thread pour ne pas bloquer l'event loop."""
    import asyncio
    return await asyncio.to_thread(hash_password, password)


async def verify_password_async(password: str, hashed: str) -> bool:
    import asyncio
    return await asyncio.to_thread(verify_password, password, hashed)


def make_token(user_id: str, token_version: int = 0) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
        "iat": datetime.now(timezone.utc),
        # SEC : versionne le token. Incrémenté au reset password → invalide les
        # anciennes sessions. Vérifié dans `current_user`.
        "tv": int(token_version or 0),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        uid = data.get("sub")
        tv_claim = int(data.get("tv") or 0)
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    # SEC : rejette les tokens dont la version est antérieure à la version actuelle
    # (ex: après reset password l'utilisateur est déconnecté sur tous ses appareils).
    if int(user.get("token_version") or 0) > tv_claim:
        raise HTTPException(401, "Session révoquée — reconnectez-vous.")
    return user


async def optional_user(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """Comme current_user mais retourne None si pas de token/token invalide (routes publiques enrichies)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        return await current_user(authorization)
    except HTTPException:
        return None


async def admin_user(user=Depends(lambda authorization=Header(None): current_user(authorization))) -> dict:
    # thin wrapper — we just re-check the flag from the DB
    return user  # placeholder replaced by dependency below


def require_admin(user: dict) -> None:
    if not user.get("is_admin") and not user.get("staff_role"):
        raise HTTPException(403, "Accès administrateur requis")


# ---------- marketplace protection (anti-contournement) ----------
import hashlib
import re
import unicodedata


def _safe_regex(user_input: str, max_len: int = 80) -> str:
    """SEC : échappe les métacaractères regex et borne la longueur, pour éviter
    la regex injection / ReDoS lors du passage dans un $regex Mongo."""
    if user_input is None:
        return ""
    s = str(user_input).strip()[:max_len]
    return re.escape(s)

# Digit words in French/English/Wolof (basic) for obfuscated numbers
_DIGIT_WORDS = {
    "zero": "0", "zéro": "0",
    "un": "1", "one": "1", "benn": "1",
    "deux": "2", "two": "2", "ñaar": "2",
    "trois": "3", "three": "3", "ñett": "3",
    "quatre": "4", "four": "4", "ñeent": "4",
    "cinq": "5", "five": "5", "juróom": "5",
    "six": "6",
    "sept": "7", "seven": "7",
    "huit": "8", "eight": "8",
    "neuf": "9", "nine": "9",
}

_SOCIAL_KEYWORDS = [
    "whatsapp", "wa.me", "whats app", "watsap", "wattsap",
    "telegram", "t.me", "signal", "viber", "wechat",
    "facebook", "fb.com", "messenger", "m.me",
    "instagram", "ig", "insta ", "tiktok", "snapchat", "snap",
    "twitter", "x.com",
    "gmail", "yahoo", "hotmail", "outlook",
]

_CONTACT_HINTS = [
    "contacte moi", "contacte-moi", "contactez moi", "contactez-moi",
    "appelle moi", "appelle-moi", "appeler moi", "appelez moi",
    "mon numero", "mon numéro", "my number", "mon whats", "mon insta",
    "en dehors", "hors app", "hors application", "sans jokoo", "sans passer par",
    "envoie", "envoyez moi", "send me", "hit me up",
]

_PHONE_RE = re.compile(
    r"(?:\+?\d[\s.\-]*){7,}"  # 7+ digits with separators (matches +221 77 123 45 67)
)
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_URL_RE = re.compile(r"\b(?:https?://|www\.)\S+", re.IGNORECASE)

MASK = "•••[masqué par Jokoo]"


def _normalize_for_scan(s: str) -> str:
    """NFD-normalize + lowercase for keyword matching."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower()


def _obfuscated_digits_count(text: str) -> int:
    """Count digit-words (sept, deux, trois...) that might form a hidden phone."""
    norm = _normalize_for_scan(text)
    tokens = re.findall(r"[a-z\u00e0-\u00ff]+", norm)
    return sum(1 for t in tokens if t in _DIGIT_WORDS)


def _sanitize_message(text: str) -> tuple[str, list[str]]:
    """Detect and mask contact-info attempts. Returns (cleaned_text, flags[])."""
    flags: list[str] = []
    cleaned = text

    if _EMAIL_RE.search(cleaned):
        cleaned = _EMAIL_RE.sub(MASK, cleaned)
        flags.append("email")

    if _URL_RE.search(cleaned):
        cleaned = _URL_RE.sub(MASK, cleaned)
        flags.append("url")

    if _PHONE_RE.search(cleaned):
        cleaned = _PHONE_RE.sub(MASK, cleaned)
        flags.append("phone")

    norm = _normalize_for_scan(cleaned)
    if any(k in norm for k in _SOCIAL_KEYWORDS):
        flags.append("social")
    if any(k in norm for k in _CONTACT_HINTS):
        flags.append("hint")

    # Obfuscated: 4+ digit words in the same message => likely a hidden phone
    if _obfuscated_digits_count(cleaned) >= 4:
        flags.append("obfuscated-digits")
        cleaned += "\n\n⚠️ Jokoo a détecté un partage de coordonnées déguisé. Les paiements hors app ne sont pas garantis."

    if flags and MASK not in cleaned:
        # Add a footer to inform user
        cleaned += "\n\n⚠️ Certains éléments ont été détectés comme un partage de coordonnées. Utilisez Jokoo pour rester protégé."

    return cleaned, flags


# ---------- commissions & wallet config ----------
COMMISSION_RATES = {
    "services": 0.12,   # 12% services à domicile
    "mobility": 0.10,   # 10% covoiturage / livraison
    "family": 0.15,     # 15% Jokoo Family
    "default": 0.12,
}
COMMISSION_DEBT_THRESHOLD_FCFA = 10000  # blocage au-delà


def _commission_for(kind: str, amount: float) -> float:
    rate = COMMISSION_RATES.get(kind, COMMISSION_RATES["default"])
    return round(amount * rate, 2)


# ---------- rôles & permissions ----------
STAFF_ROLES = ("super_admin", "admin", "marketing", "support", "operator", "tech")

ROLE_PERMS: dict = {
    "super_admin": ["*"],  # tout
    "admin": [
        "users:read", "users:write",
        "bookings:read", "bookings:write",
        "categories:write",
        "providers:read", "providers:write", "providers:validate",
        "kyc:read", "kyc:write",
        "ads:read", "stats:read",
    ],
    "marketing": [
        "ads:read", "ads:write",
        "notifications:send",
        "stats:marketing",
    ],
    "support": [
        "users:read",
        "bookings:read",
        "reports:handle",
        "passwords:reset",
        "kyc:read",
    ],
    "operator": [
        "operator:create_account",
        "users:read", "users:write",
        "providers:write", "providers:validate",
        "kyc:read", "kyc:write",
        "docs:upload",
    ],
    "tech": [
        "tech:logs", "stats:tech",
    ],
}


def user_perms(user: dict) -> set:
    """Permissions effectives = rôle + overrides individuels."""
    role = user.get("staff_role")
    perms = set(ROLE_PERMS.get(role, [])) if role else set()
    perms.update(user.get("permissions") or [])
    if user.get("is_admin") and role != "super_admin":
        # ancien is_admin=true → mappé sur super_admin par défaut
        perms.add("*")
    return perms


def has_perm(user: dict, key: str) -> bool:
    p = user_perms(user)
    return "*" in p or key in p


def require_perm(key: str):
    async def dep(user=Depends(current_user)) -> dict:
        if not has_perm(user, key):
            raise HTTPException(403, f"Permission requise : {key}")
        return user
    return dep


def require_super_admin(user=Depends(current_user)) -> dict:
    if user.get("staff_role") != "super_admin" and not (user.get("is_admin") and not user.get("staff_role")):
        raise HTTPException(403, "Super administrateur uniquement")
    return user


# ---------- models ----------
Role = Literal["client", "prestataire"]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=2, max_length=80)
    role: Role
    phone: Optional[str] = Field(default=None, max_length=32)
    city: Optional[str] = Field(default=None, max_length=80)
    # Jokoo Partners — code ou slug de parrainage (optionnel, in-app deep link)
    referral_code: Optional[str] = Field(default=None, max_length=40)

    @field_validator("password")
    @classmethod
    def _password_strength(cls, v: str) -> str:
        """Politique min : 8 caractères + au moins 1 lettre et 1 chiffre.
        Refuse les mots de passe évidents."""
        if not any(c.isalpha() for c in v):
            raise ValueError("Le mot de passe doit contenir au moins une lettre.")
        if not any(c.isdigit() for c in v):
            raise ValueError("Le mot de passe doit contenir au moins un chiffre.")
        # Liste noire minimaliste — mots de passe massivement compromis
        _weak = {"password", "12345678", "azerty12", "qwerty12", "passw0rd", "motdepasse"}
        if v.lower() in _weak:
            raise ValueError("Ce mot de passe est trop courant. Choisissez-en un autre.")
        return v

    @field_validator("name")
    @classmethod
    def _name_no_html(cls, v: str) -> str:
        v = v.strip()
        # Anti-XSS basique : refuser les balises HTML dans le nom d'affichage
        if any(tok in v for tok in ("<", ">", "javascript:", "onerror=")):
            raise ValueError("Le nom contient des caractères non autorisés.")
        return v

    @field_validator("phone")
    @classmethod
    def _phone_format(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        v = v.strip()
        # Autorise chiffres, espaces, tirets, parenthèses et le +. Longueur 6-32.
        import re as _re
        if not _re.fullmatch(r"[+()\d\s.\-]{6,32}", v):
            raise ValueError("Numéro de téléphone invalide.")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AuthOut(BaseModel):
    token: str
    user: dict


PriceType = Literal["fixed", "from", "quote"]


class ProviderProfileIn(BaseModel):
    service: Optional[str] = None  # legacy — auto-rempli depuis trades[0]
    categories: List[str] = []     # v2 : catégories choisies
    trades: List[str] = []          # v2 : métiers choisis (clés du catalogue)
    description: Optional[str] = ""
    price_type: PriceType = "quote"
    price_amount: Optional[float] = None  # None si "quote"
    city: str
    zones: List[str] = []
    hours: Optional[str] = ""
    photo: Optional[str] = None  # base64 or url (avatar)
    cover_photo: Optional[str] = None  # base64 ou url (bannière)
    gallery: List[str] = []
    diplomas: List[str] = []
    id_card: Optional[str] = None
    # --- v2.1 : mode d'intervention (au domicile / à l'établissement / les deux) ---
    service_mode: Optional[Literal["at_client", "at_venue", "both"]] = None
    travel_fee_xof: Optional[float] = None
    venue_address: Optional[str] = None  # adresse complète (déplien Google Maps)
    venue_city: Optional[str] = None
    # --- v2.1 : disponibilités hebdomadaires + absences ---
    # weekly_availability : {"mon":[{"start":"08:00","end":"12:00"}], ..., "sun":[]}
    weekly_availability: Optional[dict] = None
    # unavailable_dates : [{"date":"YYYY-MM-DD","reason":"congés"}]
    unavailable_dates: Optional[List[dict]] = None


class BookingIn(BaseModel):
    provider_id: str
    service_id: Optional[str] = None  # id de la prestation choisie (facultatif)
    date: str  # ISO
    time: str  # "14:00"
    address: str
    description: str


class ServiceIn(BaseModel):
    """Une prestation du prestataire (Ex: 'Tresses complètes', 'Diagnostic élec.', etc.)."""
    name: str = Field(min_length=2, max_length=80)
    description: Optional[str] = ""
    category_key: str  # clé du catalogue (plombier, electricien...)
    photos: List[str] = []  # URLs ou base64
    price_type: PriceType = "quote"
    price_amount: Optional[float] = None
    duration_minutes: Optional[int] = None
    active: bool = True


AdType = Literal["image", "banner", "video", "carousel"]
AdAudience = Literal["all", "client", "prestataire"]
AdDisplayMode = Literal["single", "carousel_queue"]
AdLinkType = Literal[
    "none",         # Bannière décorative — pas de clic
    "provider",     # link_target = provider_id -> /provider/{id}
    "category",     # link_target = service_key -> /(tabs)/search?service=xxx
    "promo",        # link_target = promo slug -> /promo/{slug}
    "partner",      # link_target = partner_id -> /partner/{id}
    "external",     # link_target = URL absolue https://…
    "app_route",    # link_target = route interne ex. "/mobility" ou "/(tabs)/family"
]


class AdMedia(BaseModel):
    kind: Literal["image", "video"] = "image"
    url: str
    thumb: Optional[str] = None


class AdIn(BaseModel):
    type: AdType = "banner"
    title: str
    description: Optional[str] = ""
    button_label: Optional[str] = "Voir"
    # Legacy free-text link (rétro-compat) — décodé côté client en fallback si link_type/target non fournis.
    link: Optional[str] = None
    # Nouveau système de campagne : destination structurée.
    link_type: Optional[AdLinkType] = None
    link_target: Optional[str] = None
    link_label: Optional[str] = None  # nom lisible pour l'admin (ex. "Aminata Sy - Plombière")
    media: List[AdMedia] = []
    placements: List[Literal["home", "between_lists", "category", "search", "profile"]] = ["home"]
    category_key: Optional[str] = None
    target_audience: AdAudience = "all"
    display_mode: AdDisplayMode = "single"
    display_duration_ms: Optional[int] = None  # durée d'affichage dans un carrousel (ms). Défaut : 5000
    start_at: Optional[str] = None  # ISO 8601 with time
    end_at: Optional[str] = None
    active: bool = True
    suspended: bool = False


class PromoIn(BaseModel):
    """Offre promotionnelle : landing page accessible via /promo/{slug}."""
    slug: str = Field(pattern=r"^[a-z0-9-]{2,40}$")
    title: str = Field(min_length=2, max_length=120)
    subtitle: Optional[str] = ""
    description: Optional[str] = ""  # markdown ok
    cta_label: Optional[str] = "En profiter"
    cta_link_type: Optional[AdLinkType] = None
    cta_link_target: Optional[str] = None
    image: Optional[str] = None  # URL ou base64
    bg_color: Optional[str] = None
    discount_label: Optional[str] = None  # ex. "-20%" ou "1er mois offert"
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    active: bool = True


class PartnerIn(BaseModel):
    """Partenaire commercial référencé — landing dans l'app via /partner/{id}."""
    name: str = Field(min_length=2, max_length=100)
    tagline: Optional[str] = ""
    description: Optional[str] = ""
    logo: Optional[str] = None
    cover: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    category: Optional[str] = None
    active: bool = True


class AdCampaignIn(BaseModel):
    """Un annonceur soumet une campagne payante — approuvée par l'admin."""
    advertiser_name: str
    advertiser_email: Optional[EmailStr] = None
    advertiser_phone: Optional[str] = None
    ad: AdIn
    duration_days: Literal[7, 15, 30] = 7


class SponsorshipIn(BaseModel):
    duration_days: Literal[7, 15, 30] = 7


StaffRole = Literal["super_admin", "admin", "marketing", "support", "operator", "tech"]


class StaffIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    staff_role: StaffRole
    permissions: List[str] = []
    phone: Optional[str] = None


class StaffUpdate(BaseModel):
    name: Optional[str] = None
    staff_role: Optional[StaffRole] = None
    permissions: Optional[List[str]] = None
    active: Optional[bool] = None


class AssistedRegisterIn(BaseModel):
    """Un opérateur crée un compte client/prestataire depuis l'agence."""
    name: str
    phone: str  # ex "+2217712345678"
    role: Role
    email: Optional[EmailStr] = None
    city: Optional[str] = "Dakar"
    temp_password: Optional[str] = None  # facultatif — sinon OTP généré


class OtpRequestIn(BaseModel):
    phone: str


class OtpVerifyIn(BaseModel):
    phone: str
    code: str


class PasswordResetIn(BaseModel):
    new_password: Optional[str] = None  # sinon généré


class BookingUpdate(BaseModel):
    status: Optional[Literal["accepted", "rejected", "completed", "cancelled"]] = None
    quote_amount: Optional[float] = None  # prestataire envoie / met à jour le devis


class ReviewIn(BaseModel):
    provider_id: Optional[str] = None
    booking_id: Optional[str] = None
    rating: int = Field(ge=1, le=5)
    comment: str = ""
    photos: List[str] = []


class MessageIn(BaseModel):
    text: str = ""
    kind: Literal["text", "image", "location"] = "text"
    lat: Optional[float] = None
    lng: Optional[float] = None
    accuracy_m: Optional[float] = None
    landmark: Optional[str] = None
    expires_in_minutes: Optional[int] = None


class CheckoutBookingIn(BaseModel):
    booking_id: str
    amount_xof: int  # amount in whole XOF (F CFA) — AFTER promo discount if any
    promo_code: Optional[str] = None  # optional promo code applied at checkout


class CheckoutSubIn(BaseModel):
    plan: Literal["monthly"] = "monthly"


# ---------- Mobility (Covoiturage) ----------
RideStopModel = dict  # {"city": str, "address": str}
DistanceType = Literal["short", "long"]
Recurrence = Literal["none", "weekly"]
RideStatus = Literal["active", "cancelled", "completed"]


class RideStop(BaseModel):
    city: str
    address: Optional[str] = ""


class RideIn(BaseModel):
    from_city: str
    from_address: Optional[str] = ""
    to_city: str
    to_address: Optional[str] = ""
    stops: List[RideStop] = []
    date: str  # ISO date "2026-06-25"
    time: str  # "07:30"
    seats_total: int = Field(ge=1, le=8)
    price_xof: int = Field(ge=0)
    distance_type: DistanceType = "short"
    recurrence: Recurrence = "none"
    recurrence_days: List[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]] = []
    vehicle_model: Optional[str] = ""
    vehicle_plate: Optional[str] = ""
    vehicle_color: Optional[str] = ""
    notes: Optional[str] = ""
    # Livraison longue distance (facultatif — uniquement sur trajets "long")
    accepts_parcels: bool = False
    parcel_price_xof: int = 0
    parcel_max_kg: int = 20
    parcel_payment_mode: Literal["app_only", "app_or_cash", "cash_only"] = "app_or_cash"


class RideUpdate(BaseModel):
    from_city: Optional[str] = None
    from_address: Optional[str] = None
    to_city: Optional[str] = None
    to_address: Optional[str] = None
    stops: Optional[List[RideStop]] = None
    date: Optional[str] = None
    time: Optional[str] = None
    seats_total: Optional[int] = None
    price_xof: Optional[int] = None
    distance_type: Optional[DistanceType] = None
    recurrence: Optional[Recurrence] = None
    recurrence_days: Optional[List[str]] = None
    vehicle_model: Optional[str] = None
    vehicle_plate: Optional[str] = None
    vehicle_color: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[RideStatus] = None
    accepts_parcels: Optional[bool] = None
    parcel_price_xof: Optional[int] = None
    parcel_max_kg: Optional[int] = None
    parcel_payment_mode: Optional[Literal["app_only", "app_or_cash", "cash_only"]] = None


class RideBookingIn(BaseModel):
    seats: int = Field(ge=1, le=8)
    note: Optional[str] = ""


class ParcelIn(BaseModel):
    pickup_address: str = Field(min_length=2)
    dropoff_address: str = Field(min_length=2)
    description: str = Field(min_length=2, max_length=500)
    weight_kg: float = Field(ge=0, le=200)
    recipient_name: str = Field(min_length=2)
    recipient_phone: str = Field(min_length=6)
    photo: Optional[str] = None  # base64 ou URL
    payment_mode: Literal["app", "cash"] = "app"


class ParcelUpdate(BaseModel):
    status: Optional[Literal["accepted", "rejected", "picked_up", "delivered", "cancelled"]] = None
    paid: Optional[bool] = None


# ---------- Jokoo Family · Babysitting & Tutorat ----------
LanguageLevel = Literal["native", "fluent", "intermediate", "basic"]
AgeGroup = Literal["0-2", "3-5", "6-10", "11-14"]
Skill = Literal[
    "languages", "homework", "music", "art", "sport", "cooking", "stories", "outdoor",
    "educational_games", "baby_care", "school_pickup", "holiday_care",
]
StudyLevel = Literal["licence", "master", "doctorat", "prepa", "other"]
ProfileType = Literal["student", "teacher", "professional"]
FamilyService = Literal[
    "babysitting", "tutoring", "school_pickup", "holiday_care", "educational_activities",
]
BabysitterServiceType = Literal["babysitting", "tutoring", "both"]
BabysittingStatus = Literal["pending", "confirmed", "in_progress", "completed", "cancelled"]
MoodType = Literal["happy", "calm", "tired", "upset"]


class LanguageProficiency(BaseModel):
    code: str  # ISO 639-1 short code (fr, en, ar, wo, es...)
    level: LanguageLevel = "fluent"


class EmergencyContact(BaseModel):
    name: str
    phone: str


class BabysitterProfileIn(BaseModel):
    bio: str = Field(min_length=10, max_length=800)
    profile_type: ProfileType = "student"
    university: str = Field(min_length=2)
    level: StudyLevel = "licence"
    field_of_study: Optional[str] = ""
    city: str = Field(min_length=2)
    languages: List[LanguageProficiency] = Field(min_length=1)
    age_specialties: List[AgeGroup] = Field(min_length=1)
    skills: List[Skill] = []
    # Services offerts
    services: List[FamilyService] = Field(default_factory=list)
    tutoring_subjects: List[str] = []
    # Disponibilité & mobilité
    available_today: bool = False
    night_care: bool = False
    can_travel: bool = False
    # Tarif & certifications
    hourly_rate_xof: int = Field(ge=500, le=50000)
    psc1_certified: bool = False
    emergency_contact: Optional[EmergencyContact] = None
    photo: Optional[str] = None  # base64 or URL
    student_card: Optional[str] = None  # base64 pending verification


class BabysittingKid(BaseModel):
    name: str
    age: int = Field(ge=0, le=17)
    special_needs: Optional[str] = ""


class BabysittingBookingIn(BaseModel):
    babysitter_id: str
    service_type: BabysitterServiceType = "babysitting"
    address: str = Field(min_length=3)
    city: str = Field(min_length=2)
    date: str
    time_start: str  # "18:00"
    time_end: str  # "22:00"
    kids: List[BabysittingKid] = Field(min_length=1)
    language_focus: Optional[str] = None  # ISO code
    tutoring_subjects: List[str] = []
    notes: Optional[str] = ""
    emergency_contact: EmergencyContact


class BabysittingBookingUpdate(BaseModel):
    status: Optional[BabysittingStatus] = None
    checkin_photo: Optional[str] = None


class SessionReportIn(BaseModel):
    activities: str = Field(min_length=3, max_length=1000)
    meals: Optional[str] = ""
    mood: MoodType = "happy"
    notes: Optional[str] = ""
    photo: Optional[str] = None


# ---------- Legal Center ----------
class LegalDocumentUpsertIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    content: str = Field(min_length=1)  # Markdown
    summary: Optional[str] = ""
    category: Optional[str] = "general"
    language: str = "fr"
    country: str = "SN"
    effective_date: Optional[str] = None  # ISO date; défaut = date de publication
    requires_acceptance: bool = False
    published: bool = True


class LegalAcceptanceIn(BaseModel):
    slug: str
    version: int


# ---------- services catalog ----------
# ---------------------------------------------------------------------------
# Catalogue de métiers (Étape A - v2)
# --------------------------------------------------------------------------
# Chaque métier appartient à UNE catégorie. Les 12 métiers historiques
# conservent leurs `key` d'origine pour ne pas casser les prestataires
# déjà inscrits (`plombier`, `electricien`, `macon`, `peintre`, `menage`,
# `coiffeuse`, `prof`, `decorateur`, `clim`, `jardinier`, `chauffeur`,
# `photographe`).
#
# Les nouvelles suggestions validées par un admin sont chargées depuis
# `db.services_extra` et fusionnées au démarrage / à chaque appel.
# ---------------------------------------------------------------------------

SERVICE_CATEGORIES = [
    {"key": "beauty",    "label": "Beauté",                     "emoji": "💄", "color": "#EC4899", "order": 1},
    {"key": "health",    "label": "Santé",                      "emoji": "🩺", "color": "#0EA5E9", "order": 2},
    {"key": "security",  "label": "Sécurité",                   "emoji": "🛡️", "color": "#0B1F3A", "order": 3},
    {"key": "home",      "label": "Maison & Ménage",            "emoji": "🏠", "color": "#10B981", "order": 4},
    {"key": "repair",    "label": "Bâtiment & Réparations",     "emoji": "🔧", "color": "#F59E0B", "order": 5},
    {"key": "transport", "label": "Transport & Livraison",      "emoji": "🚗", "color": "#0B1F3A", "order": 6},
    {"key": "food",      "label": "Restauration & Traiteur",    "emoji": "🍽️", "color": "#F97316", "order": 7},
    {"key": "events",    "label": "Événementiel",               "emoji": "🎉", "color": "#8B5CF6", "order": 8},
    {"key": "tech",      "label": "Informatique & Digital",     "emoji": "💻", "color": "#6366F1", "order": 9},
    {"key": "education", "label": "Cours & Formation",          "emoji": "📚", "color": "#3B82F6", "order": 10},
    {"key": "kids",      "label": "Enfants & Babysitting",      "emoji": "👶", "color": "#EC4899", "order": 11},
    {"key": "pets",      "label": "Animaux",                    "emoji": "🐶", "color": "#F59E0B", "order": 12},
    {"key": "laundry",   "label": "Pressing & Couture",         "emoji": "🧺", "color": "#22C55E", "order": 13},
    {"key": "moving",    "label": "Déménagement",               "emoji": "📦", "color": "#F97316", "order": 14},
    {"key": "garden",    "label": "Jardinage",                  "emoji": "🌿", "color": "#22C55E", "order": 15},
    {"key": "errands",   "label": "Courses & Assistance",       "emoji": "🛒", "color": "#0EA5E9", "order": 16},
    {"key": "admin",     "label": "Administratif",              "emoji": "📄", "color": "#8B5CF6", "order": 17},
    {"key": "creative",  "label": "Création (Photo, Vidéo, Design)", "emoji": "📷", "color": "#6366F1", "order": 18},
    {"key": "rental",    "label": "Location de matériel",       "emoji": "📦", "color": "#F59E0B", "order": 19},
    {"key": "other",     "label": "Autres",                     "emoji": "✨", "color": "#64748B", "order": 99},
]

SERVICES_CATALOG = [
    # --- Beauté (💄) ---
    {"key": "coiffeuse",           "label": "Coiffeuse",                  "icon": "cut-outline",       "color": "#EC4899", "category": "beauty"},
    {"key": "coiffeur",            "label": "Coiffeur",                   "icon": "cut-outline",       "color": "#EC4899", "category": "beauty"},
    {"key": "tresseuse",           "label": "Tresseuse",                  "icon": "sparkles-outline",  "color": "#EC4899", "category": "beauty"},
    {"key": "perruques",           "label": "Pose de perruques",          "icon": "woman-outline",     "color": "#EC4899", "category": "beauty"},
    {"key": "maquilleuse",         "label": "Maquilleuse (MUA)",          "icon": "color-palette-outline", "color": "#EC4899", "category": "beauty"},
    {"key": "estheticienne",       "label": "Esthéticienne",              "icon": "flower-outline",    "color": "#EC4899", "category": "beauty"},
    {"key": "manucure",            "label": "Manucure",                   "icon": "hand-left-outline", "color": "#EC4899", "category": "beauty"},
    {"key": "pedicure",            "label": "Pédicure",                   "icon": "footsteps-outline", "color": "#EC4899", "category": "beauty"},
    {"key": "nail_art",            "label": "Nail art / pose ongles",     "icon": "brush-outline",     "color": "#EC4899", "category": "beauty"},
    {"key": "extension_cils",      "label": "Extension de cils",          "icon": "eye-outline",       "color": "#EC4899", "category": "beauty"},
    {"key": "rehaussement_cils",   "label": "Rehaussement de cils",       "icon": "eye-outline",       "color": "#EC4899", "category": "beauty"},
    {"key": "brow_lift",           "label": "Brow lift / Sourcils",       "icon": "eye-outline",       "color": "#EC4899", "category": "beauty"},
    {"key": "epilation",           "label": "Épilation",                  "icon": "sparkles-outline",  "color": "#EC4899", "category": "beauty"},
    {"key": "massage",             "label": "Massage",                    "icon": "hand-right-outline","color": "#EC4899", "category": "beauty"},
    {"key": "spa_hammam",          "label": "Spa & Hammam",               "icon": "water-outline",     "color": "#EC4899", "category": "beauty"},
    {"key": "barbier",             "label": "Barbier",                    "icon": "cut-outline",       "color": "#EC4899", "category": "beauty"},
    {"key": "tatouage_henne",      "label": "Tatouage au henné",          "icon": "brush-outline",     "color": "#EC4899", "category": "beauty"},

    # --- Santé (🩺) ---
    {"key": "infirmier",           "label": "Infirmier(ère)",             "icon": "medical-outline",   "color": "#0EA5E9", "category": "health"},
    {"key": "aide_soignant",       "label": "Aide-soignant(e)",           "icon": "heart-outline",     "color": "#0EA5E9", "category": "health"},
    {"key": "kinesitherapeute",    "label": "Kinésithérapeute",           "icon": "fitness-outline",   "color": "#0EA5E9", "category": "health"},
    {"key": "sage_femme",          "label": "Sage-femme",                 "icon": "medkit-outline",    "color": "#0EA5E9", "category": "health"},
    {"key": "garde_malade",        "label": "Garde-malade",               "icon": "bed-outline",       "color": "#0EA5E9", "category": "health"},
    {"key": "masseur_therapeute",  "label": "Masseur thérapeute",         "icon": "hand-right-outline","color": "#0EA5E9", "category": "health"},
    {"key": "dieteticien",         "label": "Diététicien(ne)",            "icon": "nutrition-outline", "color": "#0EA5E9", "category": "health"},
    {"key": "psy_therapeute",      "label": "Psychologue / Thérapeute",   "icon": "chatbubbles-outline","color": "#0EA5E9", "category": "health"},
    {"key": "orthophoniste",       "label": "Orthophoniste",              "icon": "chatbubbles-outline","color": "#0EA5E9", "category": "health"},

    # --- Sécurité (🛡️) ---
    {"key": "agent_securite",      "label": "Agent de sécurité",          "icon": "shield-checkmark-outline","color": "#0B1F3A", "category": "security"},
    {"key": "gardien",             "label": "Gardien",                    "icon": "shield-outline",    "color": "#0B1F3A", "category": "security"},
    {"key": "garde_du_corps",      "label": "Garde du corps",             "icon": "shield-half-outline","color": "#0B1F3A", "category": "security"},
    {"key": "installateur_alarme", "label": "Installateur d'alarme / vidéo","icon": "videocam-outline","color": "#0B1F3A", "category": "security"},

    # --- Maison & Ménage (🏠) ---
    {"key": "menage",              "label": "Femme de ménage",            "icon": "sparkles-outline",  "color": "#10B981", "category": "home"},
    {"key": "menage_homme",        "label": "Homme de ménage",            "icon": "sparkles-outline",  "color": "#10B981", "category": "home"},
    {"key": "nettoyage_pro",       "label": "Nettoyage professionnel",    "icon": "brush-outline",     "color": "#10B981", "category": "home"},
    {"key": "nettoyage_fin_chantier","label": "Nettoyage fin de chantier","icon": "brush-outline",     "color": "#10B981", "category": "home"},
    {"key": "nettoyage_vitres",    "label": "Nettoyage vitres",           "icon": "sunny-outline",     "color": "#10B981", "category": "home"},
    {"key": "gouvernante",         "label": "Gouvernante",                "icon": "person-outline",    "color": "#10B981", "category": "home"},
    {"key": "cuisiniere_domicile", "label": "Cuisinière à domicile",      "icon": "restaurant-outline","color": "#10B981", "category": "home"},
    {"key": "repasseuse",          "label": "Repassage à domicile",       "icon": "shirt-outline",     "color": "#10B981", "category": "home"},
    {"key": "dératisation",        "label": "Dératisation / Désinsectisation","icon": "bug-outline",   "color": "#10B981", "category": "home"},

    # --- Bâtiment & Réparations (🔧) ---
    {"key": "plombier",            "label": "Plombier",                   "icon": "water-outline",     "color": "#F59E0B", "category": "repair"},
    {"key": "electricien",         "label": "Électricien",                "icon": "flash-outline",     "color": "#F59E0B", "category": "repair"},
    {"key": "macon",               "label": "Maçon",                      "icon": "hammer-outline",    "color": "#F59E0B", "category": "repair"},
    {"key": "peintre",             "label": "Peintre en bâtiment",        "icon": "color-palette-outline","color": "#F59E0B","category": "repair"},
    {"key": "carreleur",           "label": "Carreleur",                  "icon": "grid-outline",      "color": "#F59E0B", "category": "repair"},
    {"key": "menuisier",           "label": "Menuisier",                  "icon": "construct-outline", "color": "#F59E0B", "category": "repair"},
    {"key": "aluminium",           "label": "Aluminier / Vitrier",        "icon": "square-outline",    "color": "#F59E0B", "category": "repair"},
    {"key": "soudeur",             "label": "Soudeur / Ferronnier",       "icon": "flame-outline",     "color": "#F59E0B", "category": "repair"},
    {"key": "clim",                "label": "Climatisation & Frigoriste", "icon": "snow-outline",      "color": "#F59E0B", "category": "repair"},
    {"key": "reparateur_electro",  "label": "Réparateur électroménager",  "icon": "cog-outline",       "color": "#F59E0B", "category": "repair"},
    {"key": "serrurier",           "label": "Serrurier",                  "icon": "key-outline",       "color": "#F59E0B", "category": "repair"},
    {"key": "reparateur_tv",       "label": "Réparateur TV / Hi-fi",      "icon": "tv-outline",        "color": "#F59E0B", "category": "repair"},
    {"key": "reparateur_tel",      "label": "Réparateur téléphone",       "icon": "phone-portrait-outline","color": "#F59E0B", "category": "repair"},
    {"key": "toiture",             "label": "Toiture / Étanchéité",       "icon": "home-outline",      "color": "#F59E0B", "category": "repair"},
    {"key": "platrier",            "label": "Plâtrier / Faux plafonds",   "icon": "layers-outline",    "color": "#F59E0B", "category": "repair"},

    # --- Transport & Livraison (🚗) ---
    {"key": "chauffeur",           "label": "Chauffeur particulier",      "icon": "car-outline",       "color": "#0B1F3A", "category": "transport"},
    {"key": "chauffeur_vtc",       "label": "Chauffeur VTC / Taxi",       "icon": "car-sport-outline", "color": "#0B1F3A", "category": "transport"},
    {"key": "livreur_moto",        "label": "Livreur (moto)",             "icon": "bicycle-outline",   "color": "#0B1F3A", "category": "transport"},
    {"key": "coursier",            "label": "Coursier / Course urbaine",  "icon": "bicycle-outline",   "color": "#0B1F3A", "category": "transport"},
    {"key": "transporteur_marchandise","label": "Transporteur marchandises","icon": "cube-outline",    "color": "#0B1F3A", "category": "transport"},
    {"key": "location_voiture",    "label": "Location de voiture",        "icon": "car-outline",       "color": "#0B1F3A", "category": "transport"},

    # --- Restauration & Traiteur (🍽️) ---
    {"key": "traiteur",            "label": "Traiteur",                   "icon": "restaurant-outline","color": "#F97316", "category": "food"},
    {"key": "cake_designer",       "label": "Cake designer",              "icon": "cafe-outline",      "color": "#F97316", "category": "food"},
    {"key": "patissier",           "label": "Pâtissier",                  "icon": "ice-cream-outline", "color": "#F97316", "category": "food"},
    {"key": "chef_domicile",       "label": "Chef à domicile",            "icon": "restaurant-outline","color": "#F97316", "category": "food"},
    {"key": "grillades",           "label": "Grilladeur / Méchoui",       "icon": "flame-outline",     "color": "#F97316", "category": "food"},
    {"key": "serveur_evenement",   "label": "Serveur événementiel",       "icon": "wine-outline",      "color": "#F97316", "category": "food"},
    {"key": "barman",              "label": "Barman / Mixologue",         "icon": "beer-outline",      "color": "#F97316", "category": "food"},

    # --- Événementiel (🎉) ---
    {"key": "decorateur",          "label": "Décorateur événementiel",    "icon": "brush-outline",     "color": "#8B5CF6", "category": "events"},
    {"key": "organisateur_evenement","label": "Organisateur d'événements","icon": "calendar-outline",  "color": "#8B5CF6", "category": "events"},
    {"key": "wedding_planner",     "label": "Wedding planner",            "icon": "heart-outline",     "color": "#8B5CF6", "category": "events"},
    {"key": "dj",                  "label": "DJ",                         "icon": "musical-notes-outline","color": "#8B5CF6", "category": "events"},
    {"key": "animateur",           "label": "Animateur",                  "icon": "mic-outline",       "color": "#8B5CF6", "category": "events"},
    {"key": "griot",               "label": "Griot / Maître de cérémonie","icon": "mic-outline",       "color": "#8B5CF6", "category": "events"},
    {"key": "fleuriste",           "label": "Fleuriste",                  "icon": "flower-outline",    "color": "#8B5CF6", "category": "events"},
    {"key": "deco_mariage",        "label": "Décoration de mariage",      "icon": "heart-outline",     "color": "#8B5CF6", "category": "events"},
    {"key": "deco_bapteme",        "label": "Décoration de baptême",      "icon": "gift-outline",      "color": "#8B5CF6", "category": "events"},
    {"key": "deco_anniversaire",   "label": "Décoration d'anniversaire",  "icon": "balloon-outline",   "color": "#8B5CF6", "category": "events"},
    {"key": "ceremonies_religieuses","label": "Cérémonies religieuses & familiales","icon": "sparkles-outline","color": "#8B5CF6", "category": "events"},
    {"key": "danseurs",            "label": "Danseurs / Groupe de danse", "icon": "body-outline",      "color": "#8B5CF6", "category": "events"},

    # --- Informatique & Digital (💻) ---
    {"key": "dev_web",             "label": "Développeur Web",            "icon": "code-slash-outline","color": "#6366F1", "category": "tech"},
    {"key": "dev_mobile",          "label": "Développeur mobile",         "icon": "phone-portrait-outline","color": "#6366F1", "category": "tech"},
    {"key": "designer_ui_ux",      "label": "Designer UI/UX",             "icon": "color-wand-outline","color": "#6366F1", "category": "tech"},
    {"key": "graphiste",           "label": "Graphiste",                  "icon": "brush-outline",     "color": "#6366F1", "category": "tech"},
    {"key": "community_manager",   "label": "Community manager",          "icon": "megaphone-outline", "color": "#6366F1", "category": "tech"},
    {"key": "seo_marketeur",       "label": "SEO / Marketeur digital",    "icon": "trending-up-outline","color": "#6366F1", "category": "tech"},
    {"key": "reparateur_pc",       "label": "Réparateur PC",              "icon": "laptop-outline",    "color": "#6366F1", "category": "tech"},
    {"key": "installateur_reseau", "label": "Installateur réseau / wifi", "icon": "wifi-outline",      "color": "#6366F1", "category": "tech"},

    # --- Cours & Formation (📚) ---
    {"key": "prof",                "label": "Professeur particulier",     "icon": "book-outline",      "color": "#3B82F6", "category": "education"},
    {"key": "prof_maths",          "label": "Prof de maths",              "icon": "calculator-outline","color": "#3B82F6", "category": "education"},
    {"key": "prof_francais",       "label": "Prof de français",           "icon": "book-outline",      "color": "#3B82F6", "category": "education"},
    {"key": "prof_anglais",        "label": "Prof d'anglais",             "icon": "globe-outline",     "color": "#3B82F6", "category": "education"},
    {"key": "prof_arabe",          "label": "Prof d'arabe",               "icon": "book-outline",      "color": "#3B82F6", "category": "education"},
    {"key": "prof_musique",        "label": "Prof de musique",            "icon": "musical-notes-outline","color": "#3B82F6", "category": "education"},
    {"key": "prof_sport",          "label": "Coach sportif",              "icon": "fitness-outline",   "color": "#3B82F6", "category": "education"},
    {"key": "prof_yoga",           "label": "Prof de yoga",               "icon": "leaf-outline",      "color": "#3B82F6", "category": "education"},
    {"key": "prof_conduite",       "label": "Moniteur de conduite",       "icon": "car-outline",       "color": "#3B82F6", "category": "education"},
    {"key": "prof_couture",        "label": "Prof de couture",            "icon": "shirt-outline",     "color": "#3B82F6", "category": "education"},

    # --- Enfants & Babysitting (👶) ---
    {"key": "babysitter",          "label": "Baby-sitter",                "icon": "happy-outline",     "color": "#EC4899", "category": "kids"},
    {"key": "nounou",              "label": "Nounou / Nourrice",          "icon": "heart-outline",     "color": "#EC4899", "category": "kids"},
    {"key": "garde_enfants",       "label": "Garde d'enfants à domicile", "icon": "home-outline",      "color": "#EC4899", "category": "kids"},
    {"key": "accompagnateur_ecole","label": "Accompagnement école",       "icon": "school-outline",    "color": "#EC4899", "category": "kids"},
    {"key": "animateur_enfants",   "label": "Animateur pour enfants",     "icon": "balloon-outline",   "color": "#EC4899", "category": "kids"},

    # --- Animaux (🐶) ---
    {"key": "toiletteur",          "label": "Toiletteur",                 "icon": "paw-outline",       "color": "#F59E0B", "category": "pets"},
    {"key": "dog_sitter",          "label": "Dog-sitter / promeneur",     "icon": "walk-outline",      "color": "#F59E0B", "category": "pets"},
    {"key": "veterinaire_domicile","label": "Vétérinaire à domicile",     "icon": "medical-outline",   "color": "#F59E0B", "category": "pets"},
    {"key": "dresseur_chien",      "label": "Dresseur de chien",          "icon": "paw-outline",       "color": "#F59E0B", "category": "pets"},

    # --- Pressing & Couture (🧺) ---
    {"key": "pressing",            "label": "Pressing / Blanchisserie",   "icon": "shirt-outline",     "color": "#22C55E", "category": "laundry"},
    {"key": "couturier",           "label": "Couturier",                  "icon": "cut-outline",       "color": "#22C55E", "category": "laundry"},
    {"key": "couturiere",          "label": "Couturière",                 "icon": "cut-outline",       "color": "#22C55E", "category": "laundry"},
    {"key": "brodeuse",            "label": "Brodeuse",                   "icon": "sparkles-outline",  "color": "#22C55E", "category": "laundry"},
    {"key": "styliste",            "label": "Styliste modéliste",         "icon": "brush-outline",     "color": "#22C55E", "category": "laundry"},
    {"key": "cordonnier",          "label": "Cordonnier",                 "icon": "footsteps-outline", "color": "#22C55E", "category": "laundry"},

    # --- Déménagement (📦) ---
    {"key": "demenageur",          "label": "Déménageur",                 "icon": "cube-outline",      "color": "#F97316", "category": "moving"},
    {"key": "manutentionnaire",    "label": "Manutentionnaire",           "icon": "barbell-outline",   "color": "#F97316", "category": "moving"},
    {"key": "monte_meuble",        "label": "Monte-meuble",               "icon": "arrow-up-outline",  "color": "#F97316", "category": "moving"},
    {"key": "assembleur_meubles",  "label": "Monteur de meubles",         "icon": "construct-outline", "color": "#F97316", "category": "moving"},

    # --- Jardinage (🌿) ---
    {"key": "jardinier",           "label": "Jardinier",                  "icon": "leaf-outline",      "color": "#22C55E", "category": "garden"},
    {"key": "paysagiste",          "label": "Paysagiste",                 "icon": "flower-outline",    "color": "#22C55E", "category": "garden"},
    {"key": "elagueur",            "label": "Élagueur / Émondeur",        "icon": "cut-outline",       "color": "#22C55E", "category": "garden"},
    {"key": "arroseur_pelouse",    "label": "Entretien pelouse / arrosage","icon": "water-outline",    "color": "#22C55E", "category": "garden"},

    # --- Courses & Assistance (🛒) ---
    {"key": "faire_courses",       "label": "Faire des courses",          "icon": "cart-outline",      "color": "#0EA5E9", "category": "errands"},
    {"key": "assistant_personnel", "label": "Assistant personnel",        "icon": "person-outline",    "color": "#0EA5E9", "category": "errands"},
    {"key": "aide_domicile",       "label": "Aide à domicile",            "icon": "hand-left-outline", "color": "#0EA5E9", "category": "errands"},
    {"key": "compagnon_seniors",   "label": "Compagnon pour seniors",     "icon": "heart-outline",     "color": "#0EA5E9", "category": "errands"},

    # --- Administratif (📄) ---
    {"key": "comptable",           "label": "Comptable",                  "icon": "calculator-outline","color": "#8B5CF6", "category": "admin"},
    {"key": "secretaire",          "label": "Secrétaire",                 "icon": "document-text-outline","color": "#8B5CF6", "category": "admin"},
    {"key": "traducteur",          "label": "Traducteur / Interprète",    "icon": "language-outline",  "color": "#8B5CF6", "category": "admin"},
    {"key": "notaire_juriste",     "label": "Juriste / Assistance légale","icon": "briefcase-outline", "color": "#8B5CF6", "category": "admin"},
    {"key": "consultant_admin",    "label": "Consultant administratif",   "icon": "clipboard-outline", "color": "#8B5CF6", "category": "admin"},

    # --- Création (Photo, Vidéo, Design) (📷) ---
    {"key": "photographe",         "label": "Photographe",                "icon": "camera-outline",    "color": "#6366F1", "category": "creative"},
    {"key": "videaste",            "label": "Vidéaste / Cameraman",       "icon": "videocam-outline",  "color": "#6366F1", "category": "creative"},
    {"key": "monteur_video",       "label": "Monteur vidéo",              "icon": "film-outline",      "color": "#6366F1", "category": "creative"},
    {"key": "photographe_studio",  "label": "Photographe studio",         "icon": "aperture-outline",  "color": "#6366F1", "category": "creative"},
    {"key": "drone_operator",      "label": "Pilote de drone",            "icon": "paper-plane-outline","color": "#6366F1", "category": "creative"},
    {"key": "designer_produit",    "label": "Designer produit",           "icon": "cube-outline",      "color": "#6366F1", "category": "creative"},

    # --- Location de matériel (📦) ---
    {"key": "location_baches",     "label": "Location de bâches",         "icon": "square-outline",    "color": "#F59E0B", "category": "rental"},
    {"key": "installation_baches", "label": "Installation de bâches",     "icon": "hammer-outline",    "color": "#F59E0B", "category": "rental"},
    {"key": "location_chaises",    "label": "Location de chaises",        "icon": "grid-outline",      "color": "#F59E0B", "category": "rental"},
    {"key": "location_tables",     "label": "Location de tables",         "icon": "grid-outline",      "color": "#F59E0B", "category": "rental"},
    {"key": "location_tentes",     "label": "Location de tentes",         "icon": "triangle-outline",  "color": "#F59E0B", "category": "rental"},
    {"key": "location_vaisselle",  "label": "Location de vaisselle",      "icon": "restaurant-outline","color": "#F59E0B", "category": "rental"},
    {"key": "sonorisation",        "label": "Sonorisation",               "icon": "volume-high-outline","color": "#F59E0B", "category": "rental"},
    {"key": "eclairage",           "label": "Éclairage événementiel",     "icon": "bulb-outline",      "color": "#F59E0B", "category": "rental"},
    {"key": "location_podium",     "label": "Location de podium / scène", "icon": "layers-outline",    "color": "#F59E0B", "category": "rental"},
    {"key": "location_groupe_electrogene","label": "Location groupe électrogène","icon": "flash-outline","color": "#F59E0B","category": "rental"},
    {"key": "location_bar_mobile", "label": "Location bar mobile",        "icon": "wine-outline",      "color": "#F59E0B", "category": "rental"},
]


async def _get_full_services_catalog() -> list[dict]:
    """Retourne le catalogue complet = catalogue de base + métiers ajoutés
    à partir des suggestions validées par les admins (db.services_extra)."""
    extra_docs = await db.services_extra.find(
        {"active": {"$ne": False}}, {"_id": 0}
    ).to_list(1000)
    # Priorité : base > extra si la key est dupliquée (protège contre les collisions).
    seen = {s["key"] for s in SERVICES_CATALOG}
    fused = list(SERVICES_CATALOG)
    for e in extra_docs:
        if e.get("key") and e["key"] not in seen:
            fused.append({
                "key": e["key"],
                "label": e.get("label") or e["key"],
                "icon": e.get("icon", "briefcase-outline"),
                "color": e.get("color", "#64748B"),
                "category": e.get("category", "other"),
            })
            seen.add(e["key"])
    return fused


# ---------- auth ----------
# --- Rate limiting anti brute-force (in-memory, suffisant pour Play Store MVP) ---
from collections import defaultdict, deque
from time import time as _now

_RL_BUCKETS: dict[str, deque] = defaultdict(deque)


def _rate_check(bucket_key: str, max_hits: int, window_sec: int) -> None:
    """Sliding window : lève 429 si trop de tentatives dans la fenêtre."""
    now = _now()
    dq = _RL_BUCKETS[bucket_key]
    while dq and (now - dq[0]) > window_sec:
        dq.popleft()
    if len(dq) >= max_hits:
        retry_after = int(window_sec - (now - dq[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Trop de tentatives. Réessayez dans {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )
    dq.append(now)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@api.post("/auth/register", response_model=AuthOut)
async def register(body: RegisterIn, request: Request):
    # 200/h/IP → NAT partagés (café, université, opérateurs mobiles, réseaux
    # d'entreprise) supportent plusieurs dizaines d'inscriptions simultanées.
    _rate_check(f"register:{_client_ip(request)}", max_hits=200, window_sec=3600)
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(400, "Email déjà utilisé")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": body.email.lower(),
        "password_hash": await hash_password_async(body.password),
        "name": body.name,
        "role": body.role,                    # legacy (== active_role à tout instant)
        "roles": [body.role],                  # v2 : profils actifs
        "active_role": body.role,              # v2 : profil courant
        "is_admin": False,
        "phone": body.phone,
        "city": body.city or "Dakar",
        "avatar": None,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    audit_log("auth.register", user_id=uid, email=body.email.lower(), role=body.role, ip=_client_ip(request))
    token = make_token(uid, token_version=0)  # nouvel user → tv=0
    user = {k: v for k, v in doc.items() if k not in ("password_hash", "_id")}
    # Jokoo Partners — rattachement à un ambassadeur si code fourni
    if body.referral_code:
        try:
            await _amb_hook_user_registered(
                db,
                new_user_id=uid,
                new_user_role=body.role,
                ambassador_code_or_slug=body.referral_code,
                new_user_email=body.email.lower(),
                new_user_phone=body.phone,
                ip=_client_ip(request),
                notify=send_push,
            )
        except Exception as _amb_err:
            log.debug("ambassador attach on register failed: %s", _amb_err)
    # Email de bienvenue (non-bloquant : si échoue, log seulement)
    try:
        from services.emails import send_email, tpl_welcome, EmailPayload
        subject, html = tpl_welcome(body.name)
        support_email = await get_email_for("support")
        await send_email(EmailPayload(to=body.email.lower(), subject=subject, html=html, reply_to=support_email))
    except Exception:
        pass
    return {"token": token, "user": user}


@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn, request: Request):
    ip = _client_ip(request)
    email_key = body.email.lower()
    # 1) In-memory sliding-window (fast)
    _rate_check(f"login-ip:{ip}", max_hits=20, window_sec=300)
    _rate_check(f"login-email:{email_key}:{ip}", max_hits=8, window_sec=300)
    # 2) Persistent DB lockout (survives restarts, cross-worker)
    await brute_force_check(email_key, ip)
    user = await db.users.find_one({"email": email_key})
    if not user or not await verify_password_async(body.password, user["password_hash"]):
        await brute_force_record(email_key, ip, success=False)
        audit_log("auth.login_failed", email=email_key, ip=ip)
        raise HTTPException(401, "Identifiants invalides")
    await brute_force_record(email_key, ip, success=True)
    audit_log("auth.login_success", user_id=user["id"], email=email_key, ip=ip)
    token = make_token(user["id"], token_version=int(user.get("token_version") or 0))
    safe = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    return {"token": token, "user": safe}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return user


class UpdateMeIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    avatar: Optional[str] = None


@api.patch("/auth/me")
async def update_me(body: UpdateMeIn, user=Depends(current_user)):
    """Mise à jour partielle du profil utilisateur (nom, téléphone, ville, avatar)."""
    updates: dict = {}
    if body.name is not None:
        n = body.name.strip()
        if not n:
            raise HTTPException(400, "Le nom ne peut pas être vide.")
        if len(n) > 120:
            raise HTTPException(400, "Nom trop long.")
        updates["name"] = n
    if body.phone is not None:
        updates["phone"] = body.phone.strip() or None
    if body.city is not None:
        updates["city"] = body.city.strip() or None
    if body.avatar is not None:
        updates["avatar"] = body.avatar or None
    if not updates:
        return {k: v for k, v in user.items() if k != "password_hash"}
    await db.users.update_one({"id": user["id"]}, {"$set": updates})
    # Si le user est aussi prestataire, garder son profil provider en sync (nom/ville/avatar/phone)
    prov_updates = {k: v for k, v in updates.items() if k in ("name", "city", "avatar", "phone")}
    if prov_updates:
        await db.providers.update_one({"id": user["id"]}, {"$set": prov_updates})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return fresh


# ---------- v2.2 : double profil client/prestataire ----------
_VALID_ROLES = {"client", "prestataire"}


@api.post("/auth/switch-role")
async def switch_active_role(user=Depends(current_user)):
    """Bascule entre les profils actifs de l'utilisateur (client ⇄ prestataire).
    L'utilisateur doit avoir activé les 2 rôles au préalable via /auth/activate-role.
    Le champ legacy `role` est sync avec `active_role` pour ne rien casser."""
    roles = list(user.get("roles") or [user.get("role")])
    roles = [r for r in roles if r in _VALID_ROLES]
    if len(roles) < 2:
        raise HTTPException(
            400,
            "Vous n'avez qu'un seul profil actif. Activez d'abord le second via /auth/activate-role.",
        )
    current = user.get("active_role") or user.get("role")
    target = next((r for r in roles if r != current), None)
    if not target:
        raise HTTPException(400, "Impossible de basculer : profil cible introuvable.")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"active_role": target, "role": target}},
    )
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return {"user": fresh}


class ActivateRoleIn(BaseModel):
    role: Literal["client", "prestataire"]


@api.post("/auth/activate-role")
async def activate_role(body: ActivateRoleIn, user=Depends(current_user)):
    """Active un second profil pour l'utilisateur (sans le forcer à basculer dessus).
    Après activation, un bouton "Basculer vers Prestataire/Client" apparaît."""
    new_role = body.role
    if new_role not in _VALID_ROLES:
        raise HTTPException(400, "Rôle invalide")
    roles = list(user.get("roles") or [user.get("role")])
    roles = [r for r in roles if r in _VALID_ROLES]
    if new_role in roles:
        return {"user": {k: v for k, v in user.items() if k != "password_hash"}}
    roles.append(new_role)
    # On active mais sans basculer d'office (l'utilisateur choisira)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"roles": roles}},
    )
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return {"user": fresh}


# ---------- Sign in with Apple ----------
# Client (iOS or web) submits Apple identity_token → we verify with Apple JWKS.
# Idempotent: keyed on Apple `sub` (stable). Falls back to email match if same address.
# Returns the same {token, user} shape as /auth/login.
import httpx  # noqa: E402  (local import to keep top clean)

APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"
_APPLE_JWKS_CACHE: dict = {"keys": None, "fetched_at": None}


async def _apple_jwks() -> list:
    now = datetime.now(timezone.utc)
    cached_at = _APPLE_JWKS_CACHE.get("fetched_at")
    if _APPLE_JWKS_CACHE.get("keys") and cached_at and (now - cached_at).total_seconds() < 3600:
        return _APPLE_JWKS_CACHE["keys"]
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(APPLE_JWKS_URL)
        r.raise_for_status()
        keys = r.json().get("keys", [])
    _APPLE_JWKS_CACHE["keys"] = keys
    _APPLE_JWKS_CACHE["fetched_at"] = now
    return keys


def _apple_audiences() -> list:
    raw = os.environ.get("APPLE_AUDIENCES", "com.emergent.jokoomobiledev.b94ufz,host.exp.Exponent")
    return [a.strip() for a in raw.split(",") if a.strip()]


class AppleSignInIn(BaseModel):
    identity_token: str
    # authorization_code — required to obtain an Apple refresh_token that we can
    # later revoke at account deletion (Apple 5.1.1(v) compliance).
    # Optional for backward compatibility with older client builds that don't
    # send it yet; those users will simply skip revocation at deletion.
    authorization_code: Optional[str] = None
    # First sign-in only — Apple gives these once, we must save them immediately
    name: Optional[str] = None
    email: Optional[str] = None
    # Jokoo Partners — code/slug de parrainage (deep-link)
    referral_code: Optional[str] = Field(default=None, max_length=40)


async def _verify_apple_token(identity_token: str) -> dict:
    """Verify Apple identity token against JWKS. Return decoded claims."""
    try:
        header = jwt.get_unverified_header(identity_token)
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"Token Apple invalide: {e}")
    kid = header.get("kid")
    keys = await _apple_jwks()
    key_dict = next((k for k in keys if k.get("kid") == kid), None)
    if not key_dict:
        raise HTTPException(401, "Clé Apple inconnue")
    try:
        pub_key = jwt.algorithms.RSAAlgorithm.from_jwk(key_dict)
        audiences = _apple_audiences()
        # PyJWT accepts a list for audience since v2
        claims = jwt.decode(
            identity_token,
            pub_key,
            algorithms=["RS256"],
            audience=audiences,
            issuer=APPLE_ISSUER,
        )
    except jwt.InvalidAudienceError:
        raise HTTPException(401, "Audience Apple invalide (vérifiez APPLE_AUDIENCES)")
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token Apple expiré")
    except jwt.PyJWTError as e:
        raise HTTPException(401, f"Token Apple invalide: {e}")
    return claims


@api.post("/auth/apple", response_model=AuthOut)
async def sign_in_with_apple(body: AppleSignInIn):
    claims = await _verify_apple_token(body.identity_token)
    apple_sub = claims.get("sub")
    if not apple_sub:
        raise HTTPException(401, "Token Apple sans identifiant sujet")
    apple_email = (claims.get("email") or body.email or "").lower() or None

    # Best-effort: exchange authorization_code for a refresh_token so we can
    # later revoke it at account deletion (Apple 5.1.1(v) compliance).
    # Silent failure — sign-in must still succeed even without server-side revoke setup.
    apple_refresh_token: Optional[str] = None
    if body.authorization_code:
        try:
            token_resp = await _apple_exchange_code(body.authorization_code)
            if token_resp and token_resp.get("refresh_token"):
                apple_refresh_token = token_resp["refresh_token"]
        except Exception as _apple_err:
            log.warning("Apple token exchange failed (non-blocking): %s", _apple_err)

    # Match order: apple_sub → email → new user
    user = await db.users.find_one({"apple_sub": apple_sub}, {"_id": 0})
    if not user and apple_email:
        user = await db.users.find_one({"email": apple_email}, {"_id": 0})
        if user:
            # link this Apple identity to existing account
            _update: dict[str, Any] = {"apple_sub": apple_sub, "updated_at": now_iso()}
            if apple_refresh_token:
                _update["apple_refresh_token"] = apple_refresh_token
                _update["apple_token_updated_at"] = now_iso()
            await db.users.update_one({"id": user["id"]}, {"$set": _update})
            user["apple_sub"] = apple_sub

    if not user:
        # First sign-in — create the account. Save name/email ONLY here (Apple only sends these once).
        uid = str(uuid.uuid4())
        display_name = (body.name or "").strip() or (apple_email.split("@")[0] if apple_email else "Utilisateur Apple")
        doc = {
            "id": uid,
            "email": apple_email or f"apple.{apple_sub[:8]}@private.appleid.local",
            "password_hash": None,
            "name": display_name,
            "role": "client",
            "is_admin": False,
            "staff_role": None,
            "permissions": [],
            "phone": None,
            "city": "Dakar",
            "avatar": None,
            "apple_sub": apple_sub,
            "auth_provider": "apple",
            "created_at": now_iso(),
        }
        if apple_refresh_token:
            doc["apple_refresh_token"] = apple_refresh_token
            doc["apple_token_updated_at"] = now_iso()
        await db.users.insert_one(doc)
        user = {k: v for k, v in doc.items() if k not in ("password_hash", "_id", "apple_refresh_token")}
        # Jokoo Partners — rattachement à l'ambassadeur (best-effort)
        if body.referral_code:
            try:
                await _amb_hook_user_registered(
                    db,
                    new_user_id=uid,
                    new_user_role="client",
                    ambassador_code_or_slug=body.referral_code,
                    new_user_email=apple_email,
                    ip=None,
                    notify=send_push,
                )
            except Exception as _amb_err:
                log.debug("apple signup ambassador attach failed: %s", _amb_err)
    else:
        # Refresh the stored token on every sign-in if Apple returned a new one.
        if apple_refresh_token:
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {
                    "apple_refresh_token": apple_refresh_token,
                    "apple_token_updated_at": now_iso(),
                }},
            )
        user = {k: v for k, v in user.items() if k not in ("password_hash", "_id", "apple_refresh_token")}

    token = make_token(user["id"], token_version=int(user.get("token_version") or 0))
    return {"token": token, "user": user}


# ---------- services ----------
@api.get("/services")
async def list_services():
    """Catalogue complet à plat (base + suggestions validées).
    Chaque item : {key, label, icon, color, category}."""
    return await _get_full_services_catalog()


@api.get("/services/categories")
async def list_service_categories():
    """Retourne les catégories + les services regroupés par catégorie.
    Utilisé par le nouveau ServicePicker (Étape A)."""
    catalog = await _get_full_services_catalog()
    grouped: dict[str, list[dict]] = {c["key"]: [] for c in SERVICE_CATEGORIES}
    for svc in catalog:
        cat = svc.get("category") or "other"
        if cat not in grouped:
            grouped[cat] = []
        grouped[cat].append(svc)
    # Tri alpha des métiers dans chaque catégorie pour éviter l'aléatoire.
    for k in grouped:
        grouped[k].sort(key=lambda s: (s.get("label") or "").lower())
    cats_out = []
    for c in sorted(SERVICE_CATEGORIES, key=lambda x: x.get("order", 999)):
        cats_out.append({
            **c,
            "count": len(grouped.get(c["key"], [])),
            "services": grouped.get(c["key"], []),
        })
    return {"categories": cats_out}


# ----- Service suggestions (prestataires) -----
class ServiceSuggestionIn(BaseModel):
    label: str
    category: Optional[str] = None
    description: Optional[str] = None


_ALLOWED_CATEGORY_KEYS = {c["key"] for c in SERVICE_CATEGORIES}


def _slugify_service(label: str) -> str:
    """Génère une clé unique (sans accents) à partir du label."""
    import unicodedata
    s = unicodedata.normalize("NFKD", label or "").encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_").lower()
    return s or "custom_service"


@api.post("/services/suggestions")
async def suggest_service(body: ServiceSuggestionIn, user=Depends(current_user)):
    """Un prestataire soumet un nouveau métier ; l'admin validera."""
    label = (body.label or "").strip()
    if len(label) < 2 or len(label) > 60:
        raise HTTPException(400, "Le nom du métier doit contenir entre 2 et 60 caractères.")
    category = (body.category or "other").strip().lower()
    if category not in _ALLOWED_CATEGORY_KEYS:
        category = "other"
    # Anti-doublon (par utilisateur) : si déjà en attente sur ce label, on renvoie l'existante.
    existing = await db.service_suggestions.find_one({
        "suggested_by": user["id"],
        "label_norm": label.lower(),
        "status": "pending",
    })
    if existing:
        return {k: v for k, v in existing.items() if k != "_id"}
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "suggested_by": user["id"],
        "suggested_by_name": user.get("name"),
        "label": label,
        "label_norm": label.lower(),
        "category": category,
        "description": (body.description or "").strip()[:280] or None,
        "status": "pending",
        "created_at": now_iso(),
        "reviewed_at": None,
        "reviewed_by": None,
        "admin_note": None,
        "generated_key": None,
    }
    await db.service_suggestions.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/services/suggestions/mine")
async def list_my_service_suggestions(user=Depends(current_user)):
    rows = await db.service_suggestions.find(
        {"suggested_by": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return rows


# ----- Admin : gestion des suggestions -----
def _require_admin_or_staff(user: dict):
    if not (user.get("is_admin") or user.get("staff_role") in {"super_admin", "support", "operator"}):
        raise HTTPException(403, "Interdit")


@api.get("/admin/service-suggestions")
async def admin_list_service_suggestions(status_filter: Optional[str] = None, user=Depends(current_user)):
    _require_admin_or_staff(user)
    q: dict = {}
    if status_filter in {"pending", "approved", "rejected"}:
        q["status"] = status_filter
    rows = await db.service_suggestions.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows


class SuggestionReviewIn(BaseModel):
    action: str  # "approve" | "reject"
    admin_note: Optional[str] = None
    category: Optional[str] = None  # override éventuel
    key: Optional[str] = None       # override éventuel
    icon: Optional[str] = None      # override éventuel
    color: Optional[str] = None


@api.patch("/admin/service-suggestions/{sid}")
async def admin_review_service_suggestion(sid: str, body: SuggestionReviewIn, user=Depends(current_user)):
    _require_admin_or_staff(user)
    s = await db.service_suggestions.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Suggestion introuvable")
    action = (body.action or "").lower()
    if action not in {"approve", "reject"}:
        raise HTTPException(400, "Action invalide (approve/reject)")

    updates: dict = {
        "status": "approved" if action == "approve" else "rejected",
        "reviewed_at": now_iso(),
        "reviewed_by": user["id"],
        "admin_note": (body.admin_note or "").strip() or None,
    }

    if action == "approve":
        # Générer une clé unique et ajouter dans services_extra.
        base_key = (body.key or _slugify_service(s["label"]))[:48]
        # Vérifier collisions dans catalogue de base + suggestions déjà validées.
        existing_keys = {sv["key"] for sv in SERVICES_CATALOG}
        already = await db.services_extra.find({"key": base_key}, {"_id": 0, "key": 1}).to_list(1)
        existing_keys.update({r["key"] for r in already})
        final_key = base_key
        n = 2
        while final_key in existing_keys:
            final_key = f"{base_key}_{n}"
            n += 1
        cat = (body.category or s.get("category") or "other").lower()
        if cat not in _ALLOWED_CATEGORY_KEYS:
            cat = "other"
        service_doc = {
            "key": final_key,
            "label": s["label"],
            "icon": body.icon or "briefcase-outline",
            "color": body.color or "#64748B",
            "category": cat,
            "active": True,
            "source": "suggestion",
            "suggestion_id": sid,
            "created_at": now_iso(),
        }
        await db.services_extra.insert_one(service_doc)
        updates["generated_key"] = final_key
        # Notifier le prestataire
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": s["suggested_by"],
            "type": "service_suggestion_approved",
            "title": "✅ Métier approuvé",
            "body": f"Votre suggestion « {s['label']} » a été validée par l'équipe Jokoo.",
            "read": False,
            "created_at": now_iso(),
        })
    else:
        # Notifier rejet
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": s["suggested_by"],
            "type": "service_suggestion_rejected",
            "title": "🚫 Suggestion non retenue",
            "body": (body.admin_note or "Votre suggestion n'a pas été retenue.").strip()[:180],
            "read": False,
            "created_at": now_iso(),
        })

    await db.service_suggestions.update_one({"id": sid}, {"$set": updates})
    s.update(updates)
    return s


# ---------- providers ----------
def _provider_public(p: dict) -> dict:
    return {k: v for k, v in p.items() if k != "_id"}


# ---------- v2.1 : mode d'intervention & disponibilités ----------
_DAYS_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
_TIME_RE = re.compile(r"^\d{2}:\d{2}$")


def _hhmm_to_min(hhmm: str) -> Optional[int]:
    try:
        if not _TIME_RE.match(hhmm):
            return None
        h, m = hhmm.split(":")
        h_i, m_i = int(h), int(m)
        if 0 <= h_i <= 23 and 0 <= m_i <= 59:
            return h_i * 60 + m_i
    except Exception:
        pass
    return None


def _normalize_weekly_availability(payload: Optional[dict]) -> dict:
    """Nettoie et trie les créneaux horaires par jour.
    Retourne toujours 7 clés (mon..sun), même vides."""
    out: dict[str, list[dict]] = {d: [] for d in _DAYS_ORDER}
    if not isinstance(payload, dict):
        return out
    for day in _DAYS_ORDER:
        raw = payload.get(day) or []
        if not isinstance(raw, list):
            continue
        cleaned: list[tuple[int, int]] = []
        for slot in raw:
            if not isinstance(slot, dict):
                continue
            s = _hhmm_to_min(str(slot.get("start", "")))
            e = _hhmm_to_min(str(slot.get("end", "")))
            if s is None or e is None or e <= s:
                continue
            cleaned.append((s, e))
        cleaned.sort()
        # merge des chevauchements
        merged: list[tuple[int, int]] = []
        for s, e in cleaned:
            if merged and s <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], e))
            else:
                merged.append((s, e))
        out[day] = [
            {
                "start": f"{s // 60:02d}:{s % 60:02d}",
                "end": f"{e // 60:02d}:{e % 60:02d}",
            }
            for s, e in merged
        ]
    return out


def _normalize_unavailable_dates(payload: Optional[list]) -> list[dict]:
    if not isinstance(payload, list):
        return []
    out = []
    seen = set()
    for item in payload:
        if not isinstance(item, dict):
            continue
        d = str(item.get("date", "")).strip()
        # Format ISO YYYY-MM-DD
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", d):
            continue
        if d in seen:
            continue
        seen.add(d)
        entry = {"date": d}
        r = str(item.get("reason", "")).strip()
        if r:
            entry["reason"] = r[:80]
        out.append(entry)
    out.sort(key=lambda x: x["date"])
    return out


def _mask_phone(phone: Optional[str]) -> Optional[str]:
    """Ne montre que les 2 derniers chiffres jusqu'à réservation confirmée."""
    if not phone:
        return phone
    digits = re.sub(r"\D", "", phone)
    if len(digits) < 4:
        return "•••"
    return "•• •• •• " + digits[-2:]


async def _has_confirmed_booking(client_id: str, provider_id: str) -> bool:
    b = await db.bookings.find_one({
        "client_id": client_id,
        "provider_id": provider_id,
        "status": {"$in": ["accepted", "confirmed", "in_progress", "completed"]},
    })
    return b is not None


@api.get("/providers")
async def list_providers(
    service: Optional[str] = None,
    category: Optional[str] = None,  # v2 : filtre par catégorie(s) — CSV possible
    trade: Optional[str] = None,     # v2 : filtre par métier(s) — CSV possible
    city: Optional[str] = None,
    zone: Optional[str] = None,  # quartier/commune : match sur zones[] ou city
    q: Optional[str] = None,
    sort: Optional[str] = None,  # "rating" | "price" | "reviews" | "nearest"
    verified: Optional[bool] = None,     # verified only
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    languages: Optional[str] = None,     # CSV
    min_rating: Optional[float] = None,  # e.g. 4.5
    limit: int = 50,
    user=Depends(optional_user),
):
    and_clauses: list[dict] = []
    if category:
        cats = [c.strip() for c in category.split(",") if c.strip()]
        if cats:
            and_clauses.append({"categories": {"$in": cats}})
    if trade:
        trades = [t.strip() for t in trade.split(",") if t.strip()]
        if trades:
            and_clauses.append({"$or": [
                {"trades": {"$in": trades}},
                {"service_key": {"$in": trades}},
            ]})
    if service:
        # Rétro-compat : accepte la clé unique historique OU un métier v2.
        and_clauses.append({"$or": [
            {"service_key": service},
            {"trades": service},
        ]})
    query: dict = {}
    if city:
        query["city"] = {"$regex": _safe_regex(city), "$options": "i"}
    if zone:
        and_clauses.append({"$or": [
            {"zones": {"$regex": _safe_regex(zone), "$options": "i"}},
            {"city": {"$regex": _safe_regex(zone), "$options": "i"}},
        ]})
    if q:
        and_clauses.append({"$or": [
            {"name": {"$regex": _safe_regex(q), "$options": "i"}},
            {"service": {"$regex": _safe_regex(q), "$options": "i"}},
            {"description": {"$regex": _safe_regex(q), "$options": "i"}},
            {"trades": {"$regex": _safe_regex(q), "$options": "i"}},
        ]})
    if verified is True:
        and_clauses.append({"verified": True})
    if min_rating is not None:
        and_clauses.append({"rating": {"$gte": float(min_rating)}})
    if min_price is not None:
        and_clauses.append({"price_amount": {"$gte": int(min_price)}})
    if max_price is not None:
        # NB : on inclut les devis (price_type == "quote") en n'écartant que ceux dont le prix numérique dépasse max_price
        and_clauses.append({"$or": [
            {"price_type": "quote"},
            {"price_amount": {"$lte": int(max_price)}},
        ]})
    if languages:
        langs = [l.strip() for l in languages.split(",") if l.strip()]
        if langs:
            and_clauses.append({"languages": {"$in": langs}})
    if and_clauses:
        query["$and"] = and_clauses
    # Exclure les prestataires bloqués (mutuellement) via l'utilisateur courant.
    blocked = await _blocked_ids(user["id"] if user else None)
    if blocked:
        query["id"] = {"$nin": list(blocked)}
    cursor = db.providers.find(query, {"_id": 0}).limit(limit)
    items = await cursor.to_list(length=limit)
    # Les prestataires sponsorisés (sponsored_until dans le futur) sont mis en tête.
    now = now_iso()
    def sponsored(p: dict) -> bool:
        su = p.get("sponsored_until")
        return bool(su and su > now)
    if sort == "rating":
        items.sort(key=lambda p: (not sponsored(p), -p.get("rating", 0)))
    elif sort == "price":
        items.sort(key=lambda p: (not sponsored(p), p.get("price_type") == "quote", p.get("price_amount") or 10**12))
    elif sort == "reviews":
        items.sort(key=lambda p: (not sponsored(p), -int(p.get("reviews_count") or 0)))
    elif sort == "nearest":
        # Sans géoloc précise : les prestataires ayant `city` == city du user en premier.
        user_city = (user or {}).get("city", "") if user else ""
        items.sort(key=lambda p: (not sponsored(p), 0 if user_city and (p.get("city") or "").lower() == user_city.lower() else 1, -p.get("rating", 0)))
    else:
        items.sort(key=lambda p: (not sponsored(p), -p.get("rating", 0)))
    # Masquer les numéros/emails de la liste publique (anti-contournement)
    for p in items:
        if p.get("phone"):
            p["phone"] = _mask_phone(p["phone"])
        p.pop("email", None)
    return items


@api.get("/providers/{provider_id}")
async def get_provider(provider_id: str, user=Depends(optional_user)):
    # Filtre bloqués : 404 si l'un des deux a bloqué l'autre (masquer l'existence).
    if user and await _is_pair_blocked(user["id"], provider_id):
        raise HTTPException(404, "Prestataire introuvable")
    p = await db.providers.find_one({"id": provider_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Prestataire introuvable")
    reviews = await db.reviews.find({"provider_id": provider_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    services = await db.services.find({"provider_id": provider_id, "active": True}, {"_id": 0}).sort("created_at", 1).to_list(200)
    p["reviews"] = reviews
    p["services"] = services
    # Masquer coordonnées tant que le client n'a pas de réservation confirmée
    can_see_contact = False
    if user:
        if user["id"] == provider_id or user.get("is_admin") or user.get("staff_role"):
            can_see_contact = True
        else:
            can_see_contact = await _has_confirmed_booking(user["id"], provider_id)
    if not can_see_contact:
        if p.get("phone"):
            p["phone"] = _mask_phone(p["phone"])
        p.pop("email", None)
    p["contact_visible"] = can_see_contact
    return p


@api.get("/providers/{provider_id}/availability")
async def get_provider_availability(
    provider_id: str,
    date: str,
    slot_minutes: int = 60,
    step_minutes: int = 30,
):
    """Retourne les créneaux disponibles pour un prestataire à une date donnée.

    - `date` : YYYY-MM-DD
    - `slot_minutes` : durée de chaque créneau (défaut 60 min)
    - `step_minutes` : pas entre 2 créneaux successifs (défaut 30 min)
    Prend en compte : weekly_availability, unavailable_dates ET les bookings
    déjà réservés/en attente sur ce prestataire à cette date.
    """
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date or ""):
        raise HTTPException(400, "Date invalide (YYYY-MM-DD)")
    if slot_minutes < 15 or slot_minutes > 480:
        slot_minutes = 60
    if step_minutes < 15 or step_minutes > 240:
        step_minutes = 30

    p = await db.providers.find_one({"id": provider_id}, {
        "_id": 0, "weekly_availability": 1, "unavailable_dates": 1,
    })
    if not p:
        raise HTTPException(404, "Prestataire introuvable")

    # Jour indispo ?
    unav = {u.get("date") for u in (p.get("unavailable_dates") or []) if isinstance(u, dict)}
    if date in unav:
        return {"date": date, "day_off": True, "slots": []}

    # Jour de la semaine (0=lundi)
    from datetime import date as _date_cls
    try:
        y, m, d = date.split("-")
        wd = _date_cls(int(y), int(m), int(d)).weekday()
    except Exception:
        raise HTTPException(400, "Date invalide")
    day_key = _DAYS_ORDER[wd]
    weekly = p.get("weekly_availability") or {}
    ranges = weekly.get(day_key) or []
    if not ranges:
        return {"date": date, "day_off": True, "slots": []}

    # Créneaux existants (bookings) sur cette date pour ce provider
    day_bookings = await db.bookings.find(
        {"provider_id": provider_id, "date": {"$regex": f"^{date}"}, "status": {"$in": [
            "pending", "accepted", "in_progress", "completion_requested", "completed"
        ]}},
        {"_id": 0, "date": 1, "time": 1, "duration_minutes": 1}
    ).to_list(200)
    taken: list[tuple[int, int]] = []
    for b in day_bookings:
        t = (b.get("time") or "").strip()
        start = _hhmm_to_min(t)
        if start is None:
            continue
        dur = int(b.get("duration_minutes") or slot_minutes)
        taken.append((start, start + dur))

    # Génération des créneaux
    slots = []
    for r in ranges:
        s = _hhmm_to_min(r.get("start", ""))
        e = _hhmm_to_min(r.get("end", ""))
        if s is None or e is None:
            continue
        cursor = s
        while cursor + slot_minutes <= e:
            c_start, c_end = cursor, cursor + slot_minutes
            # Conflit avec un booking existant ?
            conflict = any(not (c_end <= ts or c_start >= te) for (ts, te) in taken)
            slots.append({
                "start": f"{c_start // 60:02d}:{c_start % 60:02d}",
                "end": f"{c_end // 60:02d}:{c_end % 60:02d}",
                "available": not conflict,
            })
            cursor += step_minutes
    return {"date": date, "day_off": False, "slots": slots}


@api.post("/providers/me")
async def upsert_my_provider(body: ProviderProfileIn, user=Depends(current_user)):
    if user["role"] != "prestataire":
        raise HTTPException(403, "Compte prestataire requis")
    # Catalogue enrichi : base + suggestions validées (services_extra).
    full_catalog = await _get_full_services_catalog()
    cat_map = {s["key"]: s.get("category") or "other" for s in full_catalog}
    label_map = {s["key"]: s["label"] for s in full_catalog}

    # ------------ Résolution multi-métiers / multi-catégories (v2) ------------
    trades_in = list(body.trades or [])
    cats_in = list(body.categories or [])

    # Retro-compat : si le client envoie encore `service` unique, on l'injecte.
    if not trades_in and body.service:
        legacy = body.service.strip()
        # essayer de résoudre la clé exacte
        matched_key = next(
            (s["key"] for s in full_catalog
             if s["label"].lower() == legacy.lower() or s["key"] == legacy.lower()),
            legacy.lower(),
        )
        trades_in = [matched_key]

    # Dédoublonner et filtrer les clés inconnues (garder au moins celle envoyée
    # pour permettre les "pending_*" en attente de validation admin).
    seen: set[str] = set()
    trades_clean: list[str] = []
    for t in trades_in:
        if not t:
            continue
        t = t.strip()
        if not t or t in seen:
            continue
        seen.add(t)
        trades_clean.append(t)

    # Déduire les catégories à partir des trades (union catégories envoyées + celles des trades)
    derived_cats: set[str] = set()
    for t in trades_clean:
        c = cat_map.get(t)
        if c:
            derived_cats.add(c)
        elif t.startswith("pending_"):
            derived_cats.add("other")
    for c in cats_in:
        if c:
            derived_cats.add(c.strip().lower())

    _valid_cat_keys = {c["key"] for c in SERVICE_CATEGORIES}
    categories_clean = [c for c in sorted(derived_cats) if c in _valid_cat_keys] or ["other"]

    if not trades_clean:
        raise HTTPException(400, "Sélectionnez au moins un métier.")

    # Label & clé primaires (compat rétro affichage listes/cartes) : premier métier.
    primary_key = trades_clean[0]
    primary_label = label_map.get(primary_key, primary_key.replace("_", " ").title())
    # Récupérer le doc existant pour préserver les champs computed (rating, reviews_count, sponsored_until, etc.)
    existing = await db.providers.find_one({"id": user["id"]}, {"_id": 0}) or {}
    # CRITICAL FIX : ne PAS écraser rating / reviews_count / subscription — ils sont computed ou gérés par d'autres endpoints.
    editable = {
        "id": user["id"],
        "user_id": user["id"],
        "name": user["name"],
        "avatar": user.get("avatar"),
        "phone": user.get("phone"),
        # Legacy simple fields — utilisés par les cartes/search actuelles
        "service": primary_label,
        "service_key": primary_key,
        # v2 — multi-catégories / multi-métiers
        "categories": categories_clean,
        "trades": trades_clean,
        "description": body.description or "",
        "price_type": body.price_type,
        "price_amount": body.price_amount if body.price_type != "quote" else None,
        "city": body.city,
        "zones": body.zones,
        "hours": body.hours or "",
        "photo": body.photo,
        "cover_photo": body.cover_photo,
        "gallery": body.gallery,
        "diplomas": body.diplomas,
        "id_card": body.id_card,
        "verified": bool(body.id_card) or bool(existing.get("verified")),
        # v2.1 — mode d'intervention
        "service_mode": body.service_mode or existing.get("service_mode") or "at_client",
        "travel_fee_xof": (body.travel_fee_xof if body.travel_fee_xof is not None else existing.get("travel_fee_xof")),
        "venue_address": body.venue_address if body.venue_address is not None else existing.get("venue_address"),
        "venue_city": body.venue_city if body.venue_city is not None else existing.get("venue_city"),
        # v2.1 — disponibilités
        "weekly_availability": _normalize_weekly_availability(body.weekly_availability) if body.weekly_availability is not None else existing.get("weekly_availability"),
        "unavailable_dates": _normalize_unavailable_dates(body.unavailable_dates) if body.unavailable_dates is not None else existing.get("unavailable_dates"),
        "updated_at": now_iso(),
    }
    # Merge en préservant les champs computed s'ils existaient déjà
    if not existing:
        # 1ère création : initialiser les compteurs à 0
        editable["rating"] = 0
        editable["reviews_count"] = 0
        editable["subscription_active"] = False
        editable["subscription_until"] = None
    await db.providers.update_one({"id": user["id"]}, {"$set": editable}, upsert=True)
    updated = await db.providers.find_one({"id": user["id"]}, {"_id": 0})
    return {"ok": True, "provider": updated}


# ---------- bookings ----------
@api.post("/bookings")
async def create_booking(body: BookingIn, user=Depends(current_user)):
    provider = await db.providers.find_one({"id": body.provider_id}, {"_id": 0})
    if not provider:
        raise HTTPException(404, "Prestataire introuvable")

    # Blocage mutuel : interdire la réservation entre deux utilisateurs bloqués.
    if await _is_pair_blocked(user["id"], body.provider_id):
        raise HTTPException(403, "Réservation impossible : l'un de vous a bloqué l'autre.")

    # Bloquer si le prestataire a des commissions impayées au-delà du seuil
    await _check_provider_not_blocked(body.provider_id)

    # Si une prestation spécifique est choisie, on prend son tarif ; sinon on retombe sur le profil.
    svc = None
    if body.service_id:
        svc = await db.services.find_one({"id": body.service_id, "provider_id": body.provider_id}, {"_id": 0})
        if not svc or not svc.get("active", True):
            raise HTTPException(404, "Prestation introuvable")

    price_type = (svc.get("price_type") if svc else provider.get("price_type")) or "quote"
    price_amount = svc.get("price_amount") if svc else provider.get("price_amount")
    initial_price = None if price_type == "quote" else price_amount
    bid = str(uuid.uuid4())
    doc = {
        "id": bid,
        "client_id": user["id"],
        "client_name": user["name"],
        "provider_id": body.provider_id,
        "provider_name": provider["name"],
        "provider_service": provider["service"],
        "service_id": body.service_id,
        "service_name": svc["name"] if svc else None,
        "date": body.date,
        "time": body.time,
        "address": body.address,
        "description": body.description,
        "price": initial_price,
        "price_type": price_type,
        "quote_amount": None,
        "status": "pending",
        "paid": False,
        "created_at": now_iso(),
    }
    await db.bookings.insert_one(doc)
    # notif to provider
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": body.provider_id,
        "type": "booking_new",
        "title": "Nouvelle demande",
        "body": f"{user['name']} vous a envoyé une demande",
        "booking_id": bid,
        "read": False,
        "created_at": now_iso(),
    })
    # Push mobile : architecture prête (backend/push.py) — activation post-store
    # Emails de confirmation (client) + notification (prestataire), non-bloquants
    try:
        from services.emails import send_email, tpl_booking_confirmed, tpl_booking_new_for_provider, EmailPayload
        # Client
        s1, h1 = tpl_booking_confirmed(
            provider_name=provider.get("name", "votre prestataire"),
            date=doc.get("date", "à définir"),
            time=doc.get("time", ""),
            address=doc.get("address", ""),
            price_label=(f"{doc.get('quote_amount')} FCFA" if doc.get("quote_amount") else "Sur devis"),
        )
        support_email = await get_email_for("support")
        await send_email(EmailPayload(to=user["email"], subject=s1, html=h1, reply_to=support_email))
        # Prestataire (email seulement si on a un doc user pour lui)
        pu = await db.users.find_one({"id": body.provider_id}, {"_id": 0, "email": 1})
        if pu and pu.get("email"):
            s2, h2 = tpl_booking_new_for_provider(
                client_name=user["name"],
                service=provider.get("service", ""),
                date=doc.get("date", ""),
                time=doc.get("time", ""),
            )
            pro_email = await get_email_for("prestataires")
            await send_email(EmailPayload(to=pu["email"], subject=s2, html=h2, reply_to=pro_email))
    except Exception:
        pass
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/bookings")
async def list_bookings(as_role: Optional[str] = Query(None, alias="as"), user=Depends(current_user)):
    """
    Retourne les réservations de l'utilisateur.

    Résolution du rôle (par ordre de priorité) :
      1. Query param ?as=client|prestataire  (explicit, override total)
      2. user["active_role"]                   (dual-role : reflète le mode actuel)
      3. user["role"]                          (legacy)

    Cette résolution fixe le bug où un client en dual-mode (`roles: [client, prestataire]`)
    voyait 0 réservation dans "Vos réservations" parce que son `role` legacy avait été
    basculé en "prestataire" lors d'une visite précédente au tableau de bord pro.
    """
    role = (as_role or user.get("active_role") or user.get("role") or "client").lower()
    if role == "prestataire":
        cur = db.bookings.find({"provider_id": user["id"]}, {"_id": 0})
    else:
        cur = db.bookings.find({"client_id": user["id"]}, {"_id": 0})
    items = await cur.sort("created_at", -1).to_list(200)
    return items


@api.post("/bookings/{bid}/confirm-completion")
async def confirm_completion(bid: str, user=Depends(current_user)):
    """
    Confirmation de fin de mission — DEUX parties.
    Le client ET le prestataire doivent confirmer.
    Une fois les deux confirmations reçues, le statut passe à `completed`
    et le client peut laisser un avis.
    """
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Réservation introuvable")
    is_client = b["client_id"] == user["id"]
    is_provider = b["provider_id"] == user["id"]
    if not (is_client or is_provider):
        raise HTTPException(403, "Vous ne participez pas à cette réservation")

    updates: dict = {"updated_at": now_iso()}
    role = "client" if is_client else "provider"
    field = f"{role}_confirmed_at"
    if b.get(field):
        return {"ok": True, "already": True, "status": b.get("status")}
    updates[field] = now_iso()

    both = bool(b.get("client_confirmed_at" if is_provider else "provider_confirmed_at"))
    if both:
        updates["status"] = "completed"
        updates["completed_at"] = now_iso()

    await db.bookings.update_one({"id": bid}, {"$set": updates})

    # Notif autre partie
    peer_id = b["provider_id"] if is_client else b["client_id"]
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": peer_id,
        "type": "booking_completed" if both else "booking_completion_requested",
        "title": "Mission terminée" if both else "Confirmation attendue",
        "body": "Merci de laisser un avis pour valoriser le prestataire." if both and is_client
                else ("La mission est officiellement close." if both else "L'autre partie a confirmé la fin de la mission. Confirmez à votre tour."),
        "booking_id": bid,
        "read": False,
        "created_at": now_iso(),
    })
    # Notif soi-même quand les 2 ont confirmé (pour que le confirmer voie aussi la mission close)
    if both:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "type": "booking_completed",
            "title": "Mission terminée",
            "body": "Vous pouvez laisser un avis pour votre prestataire." if is_client
                    else "Mission validée. Consultez votre wallet pour la commission.",
            "booking_id": bid,
            "read": False,
            "created_at": now_iso(),
        })
        # Jokoo Partners — hook pour calcul commissions + validation referral
        try:
            b_full = {**b, **updates}
            amount = int(b_full.get("total_xof") or b_full.get("price_xof") or b_full.get("amount_xof") or 0)
            await _amb_hook_booking_completed(db, b_full, amount, notify=send_push)
        except Exception as _amb_err:
            log.debug("ambassador booking hook failed: %s", _amb_err)
    return {"ok": True, "status": "completed" if both else b.get("status"), "both_confirmed": both}


# ---------- forgot / reset password (email token, 60 min TTL) ----------
class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=6)
    new_password: str = Field(min_length=8, max_length=128)


@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordIn, request: Request):
    """
    Génère un token de réinitialisation à usage unique (60 min).
    Pour ne pas fuiter l'existence d'un email, on renvoie toujours `{ok: true}`.
    En dev (aucune clé email configurée), le token est retourné dans `dev_token` pour tests manuels.
    """
    # Rate limit anti-abuse : 5 demandes / 15 min / IP + 3 / 15 min / email
    ip = _client_ip(request)
    email = body.email.lower().strip()
    _rate_check(f"forgot-ip:{ip}", max_hits=5, window_sec=900)
    _rate_check(f"forgot-email:{email}", max_hits=3, window_sec=900)
    from services.emails import send_email, tpl_reset_password, EmailPayload, _current_mode
    u = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "name": 1})
    dev_token: Optional[str] = None
    if u:
        token = secrets.token_urlsafe(24)
        await db.password_resets.insert_one({
            "token": token,
            "user_id": u["id"],
            "email": email,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=60)).isoformat(),
            "used": False,
            "created_at": now_iso(),
        })
        dev_token = token
        # Envoi email si Resend/Emergent configuré
        reset_link = f"{os.environ.get('APP_URL', 'https://jokooservices.com').rstrip('/')}/reset-password?token={token}"
        subject, html = tpl_reset_password(reset_link)
        # Envoi non-bloquant : si l'API email tombe, le user peut toujours utiliser le dev_token en dev.
        support_email = await get_email_for("support")
        await send_email(EmailPayload(to=email, subject=subject, html=html, reply_to=support_email))
    resp = {"ok": True}
    # Retourner dev_token uniquement si aucun provider email actif (mode dev pur)
    from services.emails import _current_mode as _mode
    if _mode() == "dev" and os.environ.get("APP_ENV", "development") != "production":
        resp["dev_token"] = dev_token
    return resp


@api.post("/auth/reset-password")
async def reset_password(body: ResetPasswordIn):
    rec = await db.password_resets.find_one({"token": body.token, "used": False}, {"_id": 0})
    if not rec:
        raise HTTPException(400, "Lien invalide ou déjà utilisé")
    try:
        expires_at = datetime.fromisoformat(rec["expires_at"])
    except Exception:
        expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(400, "Lien expiré. Recommencez la procédure.")
    new_hash = await hash_password_async(body.new_password)
    # SEC : invalider les sessions existantes en incrémentant token_version.
    # Cf. `current_user` — vérifie que le token JWT contient la version courante.
    now = now_iso()
    await db.users.update_one(
        {"id": rec["user_id"]},
        {"$set": {"password_hash": new_hash, "password_changed_at": now, "updated_at": now},
         "$inc": {"token_version": 1}},
    )
    await db.password_resets.update_one({"token": body.token}, {"$set": {"used": True, "used_at": now}})
    # Purge des autres tokens de reset non utilisés pour ce user (safety)
    await db.password_resets.update_many(
        {"user_id": rec["user_id"], "used": False, "token": {"$ne": body.token}},
        {"$set": {"used": True, "used_at": now, "revoked_reason": "password_reset"}},
    )
    return {"ok": True}


@api.patch("/bookings/{bid}")
async def update_booking(bid: str, body: BookingUpdate, user=Depends(current_user)):
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Réservation introuvable")

    updates: dict = {"updated_at": now_iso()}

    # Quote from prestataire (before/after acceptance): only provider can quote.
    if body.quote_amount is not None:
        if b["provider_id"] != user["id"]:
            raise HTTPException(403, "Seul le prestataire peut envoyer un devis")
        if body.quote_amount <= 0:
            raise HTTPException(400, "Montant du devis invalide")
        updates["quote_amount"] = float(body.quote_amount)
        updates["price"] = float(body.quote_amount)
        # Notify client
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": b["client_id"],
            "type": "booking_quote",
            "title": "Devis reçu",
            "body": f"{b['provider_name']} vous a envoyé un devis de {int(body.quote_amount):,} F CFA".replace(",", " "),
            "booking_id": bid,
            "read": False,
            "created_at": now_iso(),
        })

    # Status change
    if body.status is not None:
        # State machine : refuser les transitions incohérentes.
        current_status = b.get("status", "pending")
        # Booking terminé, remboursé ou refusé : état FINAL, aucune transition sortante autorisée.
        if current_status in ("completed", "refunded", "rejected"):
            raise HTTPException(400, f"Impossible de modifier une réservation {current_status}")
        # Un booking déjà annulé ne peut pas non plus être re-modifié.
        if current_status == "cancelled" and body.status != "cancelled":
            raise HTTPException(400, "Impossible de réactiver une réservation annulée")
        # Only provider can accept/reject/complete; client can cancel
        if body.status in ("accepted", "rejected", "completed"):
            if b["provider_id"] != user["id"]:
                raise HTTPException(403, "Interdit")
        else:
            if b["client_id"] != user["id"]:
                raise HTTPException(403, "Interdit")
        updates["status"] = body.status

        # CRITICAL rollback: si on annule un booking déjà cash-payé, on doit rembourser la commission_due du prestataire.
        if body.status == "cancelled" and b.get("paid") and b.get("paid_method") == "cash":
            commission = float(b.get("commission") or 0)
            if commission > 0:
                await db.wallets.update_one(
                    {"user_id": b["provider_id"]},
                    {"$inc": {"commission_due": -commission}},
                )
                await db.wallet_transactions.insert_one({
                    "id": str(uuid.uuid4()),
                    "user_id": b["provider_id"],
                    "type": "refund",
                    "amount_xof": -commission,
                    "source_booking_id": bid,
                    "note": "Rollback commission suite à annulation cash-payé",
                    "created_at": now_iso(),
                })

        target = b["client_id"] if body.status in ("accepted", "rejected", "completed") else b["provider_id"]
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": target,
            "type": f"booking_{body.status}",
            "title": f"Réservation {body.status}",
            "body": f"Statut mis à jour : {body.status}",
            "booking_id": bid,
            "read": False,
            "created_at": now_iso(),
        })
        # Push mobile — non-bloquant
        try:
            status_labels = {
                "accepted": "Réservation acceptée ✅",
                "rejected": "Réservation refusée",
                "completed": "Mission terminée ✨",
                "cancelled": "Réservation annulée",
                "in_progress": "Mission en cours",
            }
            title = status_labels.get(body.status, f"Réservation {body.status}")
            msg = f"{b.get('service') or 'Votre mission'} avec {b.get('provider_name') if target == b['client_id'] else b.get('client_name')}"
            await send_push(
                recipients=[target],
                data={
                    "title": title,
                    "message": msg,
                    "action_url": f"/booking/{bid}",
                },
            )
        except Exception as e:
            log.warning(f"Push failed (non-blocking): {e}")

    if body.quote_amount is not None:
        # Push devis reçu
        try:
            await send_push(
                recipients=[b["client_id"]],
                data={
                    "title": "Devis reçu",
                    "message": f"{b['provider_name']} · {int(body.quote_amount):,} F CFA".replace(",", " "),
                    "action_url": f"/booking/{bid}",
                },
            )
        except Exception as e:
            log.warning(f"Push failed (non-blocking): {e}")

    if len(updates) == 1:
        raise HTTPException(400, "Aucune mise à jour fournie")

    # Si passage en `completed` via PATCH direct (par le prestataire) — on aligne
    # les timestamps + on déclenche le hook Jokoo Partners.
    triggered_completion = updates.get("status") == "completed"
    if triggered_completion and not b.get("completed_at"):
        updates["completed_at"] = now_iso()

    await db.bookings.update_one({"id": bid}, {"$set": updates})

    # Jokoo Partners — hook post-completion (compute commissions + verify referrals)
    # Idempotent : le hook lui-même vérifie s'il a déjà été appliqué (via first_booking_at
    # sur le referral). Peut donc être appelé plusieurs fois sans risque.
    if triggered_completion:
        try:
            b_full = {**b, **updates}
            amount = int(b_full.get("total_xof") or b_full.get("price_xof") or b_full.get("amount_xof") or b_full.get("price") or 0)
            await _amb_hook_booking_completed(db, b_full, amount, notify=send_push)
        except Exception as _amb_err:
            log.debug("ambassador booking hook failed (via PATCH): %s", _amb_err)

    return {"ok": True}


# ---------- reviews ----------
@api.post("/reviews")
async def create_review(body: ReviewIn, user=Depends(current_user)):
    """
    Notation d'un prestataire après une mission terminée.

    Règles strictes :
    - Un client doit fournir un `booking_id` (le mode legacy `provider_id`-only est refusé pour éviter la fraude).
    - La mission doit être en statut `completed`.
    - Un seul avis par mission.
    - Un prestataire ne peut pas se noter lui-même.
    - Rating : entier 1..5 (validé par Pydantic).
    - Comment : optionnel (défaut "").
    """
    if not body.booking_id:
        raise HTTPException(400, "booking_id requis pour laisser un avis")
    b = await db.bookings.find_one({"id": body.booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Réservation introuvable")
    if b["client_id"] != user["id"]:
        raise HTTPException(403, "Seul le client peut noter cette réservation")
    if b.get("status") != "completed":
        raise HTTPException(400, "Vous ne pouvez noter qu'une mission terminée")
    if b.get("review_id"):
        raise HTTPException(400, "Un avis a déjà été laissé pour cette réservation")
    provider_id = b["provider_id"]
    # Un prestataire ne peut pas se noter lui-même (edge case si un compte a réservé chez lui-même via ancien système).
    if provider_id == user["id"]:
        raise HTTPException(400, "Vous ne pouvez pas noter votre propre profil")
    provider = await db.providers.find_one({"id": provider_id})
    if not provider:
        raise HTTPException(404, "Prestataire introuvable")
    rid = str(uuid.uuid4())
    doc = {
        "id": rid,
        "provider_id": provider_id,
        "booking_id": body.booking_id,
        "author_id": user["id"],
        "author_name": user["name"],
        "author_avatar": user.get("avatar"),
        "rating": body.rating,
        "comment": (body.comment or "").strip(),
        "photos": body.photos or [],
        "created_at": now_iso(),
    }
    await db.reviews.insert_one(doc)
    await db.bookings.update_one({"id": body.booking_id}, {"$set": {"review_id": rid}})
    # Notifier le prestataire qu'un avis a été publié
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": provider_id,
        "type": "review_received",
        "title": f"⭐ Nouvel avis {body.rating}/5",
        "body": (doc["comment"][:120] + "…") if doc["comment"] and len(doc["comment"]) > 120
                 else (doc["comment"] or f"{user['name']} vous a laissé une note."),
        "peer_id": user["id"],
        "booking_id": body.booking_id,
        "review_id": rid,
        "provider_id": provider_id,
        "read": False,
        "created_at": now_iso(),
    })
    # Recompute rating & count sur la fiche prestataire (moyenne exacte à 2 décimales).
    rs = await db.reviews.find({"provider_id": provider_id}, {"_id": 0, "rating": 1}).to_list(10000)
    avg = round(sum(r["rating"] for r in rs) / len(rs), 2) if rs else 0
    await db.providers.update_one(
        {"id": provider_id},
        {"$set": {"rating": avg, "reviews_count": len(rs)}},
    )
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/reviews")
async def list_reviews(
    provider_id: str,
    limit: int = 50,
):
    """Liste publique des avis d'un prestataire (visible par les futurs clients)."""
    if limit < 1: limit = 1
    if limit > 200: limit = 200
    cur = db.reviews.find({"provider_id": provider_id}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return await cur.to_list(limit)


@api.get("/bookings/{bid}/review-eligibility")
async def review_eligibility(bid: str, user=Depends(current_user)):
    """
    Endpoint utilitaire pour l'UI : indique si le client peut noter la mission maintenant.
    Retourne : { eligible: bool, reason?: str, existing_review_id?: str }
    """
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Réservation introuvable")
    if b["client_id"] != user["id"]:
        return {"eligible": False, "reason": "not_owner"}
    if b.get("status") != "completed":
        return {"eligible": False, "reason": "not_completed", "status": b.get("status")}
    if b.get("review_id"):
        return {"eligible": False, "reason": "already_reviewed", "existing_review_id": b["review_id"]}
    return {"eligible": True}


@api.get("/bookings/{bid}")
async def get_booking_detail(bid: str, user=Depends(current_user)):
    """Récupération d'une réservation par id (client ou prestataire)."""
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Réservation introuvable")
    if b["client_id"] != user["id"] and b["provider_id"] != user["id"]:
        raise HTTPException(403, "Interdit")
    return b


# ---------- favorites ----------
@api.get("/favorites")
async def list_favorites(user=Depends(current_user)):
    fav = await db.favorites.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    ids = [f["provider_id"] for f in fav]
    if not ids:
        return []
    # Exclure les prestataires bloqués (mutuellement)
    blocked = await _blocked_ids(user["id"])
    filtered_ids = [i for i in ids if i not in blocked]
    if not filtered_ids:
        return []
    provs = await db.providers.find({"id": {"$in": filtered_ids}}, {"_id": 0}).to_list(500)
    return provs


@api.post("/favorites/{provider_id}")
async def add_favorite(provider_id: str, user=Depends(current_user)):
    await db.favorites.update_one(
        {"user_id": user["id"], "provider_id": provider_id},
        {"$set": {"user_id": user["id"], "provider_id": provider_id, "created_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}


@api.delete("/favorites/{provider_id}")
async def remove_favorite(provider_id: str, user=Depends(current_user)):
    await db.favorites.delete_one({"user_id": user["id"], "provider_id": provider_id})
    return {"ok": True}


# ---------- chat (polling) ----------
def _conv_id(a: str, b: str) -> str:
    return "-".join(sorted([a, b]))


@api.get("/chat/conversations")
async def conversations(user=Depends(current_user)):
    # find distinct peers from messages
    cur = db.messages.find(
        {"$or": [{"from_id": user["id"]}, {"to_id": user["id"]}]},
        {"_id": 0},
    ).sort("created_at", -1)
    msgs = await cur.to_list(1000)
    # Exclure les conversations avec des pairs bloqués (mutuellement).
    blocked = await _blocked_ids(user["id"])
    peers: dict = {}
    for m in msgs:
        peer = m["to_id"] if m["from_id"] == user["id"] else m["from_id"]
        if peer in blocked:
            continue
        if peer not in peers:
            peers[peer] = {"peer_id": peer, "last": m, "unread": 0}
        if m["to_id"] == user["id"] and not m.get("read"):
            peers[peer]["unread"] += 1
    # attach peer info (fallback : providers collection si le peer n'est pas dans users)
    peer_ids = list(peers.keys())
    users = await db.users.find({"id": {"$in": peer_ids}}, {"_id": 0, "password_hash": 0}).to_list(500)
    umap = {u["id"]: u for u in users}
    missing = [pid for pid in peer_ids if pid not in umap]
    if missing:
        provs = await db.providers.find({"id": {"$in": missing}}, {"_id": 0}).to_list(500)
        for prov in provs:
            umap[prov["id"]] = {
                "id": prov["id"],
                "name": prov.get("name"),
                "avatar": prov.get("photo") or prov.get("avatar"),
                "role": "prestataire",
            }
    out = []
    for pid, data in peers.items():
        u = umap.get(pid, {"id": pid, "name": "Utilisateur", "avatar": None})
        out.append({
            "peer_id": pid,
            "peer_name": u.get("name"),
            "peer_avatar": u.get("avatar"),
            "peer_role": u.get("role"),
            "last_message": data["last"].get("text"),
            "last_at": data["last"].get("created_at"),
            "unread": data["unread"],
        })
    out.sort(key=lambda x: x["last_at"] or "", reverse=True)
    return out


@api.get("/chat/{peer_id}/messages")
async def get_messages(peer_id: str, user=Depends(current_user)):
    # Si l'un des deux a bloqué l'autre, on renvoie une conversation vide
    # (pas d'erreur, la liste des conversations gère l'affichage bloqué séparément).
    if await _is_pair_blocked(user["id"], peer_id):
        return []
    cid = _conv_id(user["id"], peer_id)
    cur = db.messages.find({"conv_id": cid}, {"_id": 0}).sort("created_at", 1)
    msgs = await cur.to_list(1000)
    # mark inbound as read
    await db.messages.update_many(
        {"conv_id": cid, "to_id": user["id"], "read": {"$ne": True}},
        {"$set": {"read": True}},
    )
    now = datetime.now(timezone.utc)
    for m in msgs:
        if m.get("kind") == "location":
            expires_at = m.get("expires_at")
            expired = bool(expires_at) and datetime.fromisoformat(expires_at) <= now
            m["location_expired"] = expired
            if expired:
                m["lat"] = None
                m["lng"] = None
    return msgs


@api.post("/chat/{peer_id}/messages")
async def send_message(peer_id: str, body: MessageIn, user=Depends(current_user)):
    # Interdire l'envoi si blocage mutuel (dans les deux sens).
    if await _is_pair_blocked(user["id"], peer_id):
        raise HTTPException(403, "Impossible d'envoyer un message : vous ou l'autre partie l'avez bloqué·e.")
    # Accept peer as either a real user OR a provider (seeded/demo providers may not have a user doc yet)
    peer = await db.users.find_one({"id": peer_id}, {"_id": 0})
    peer_name = None
    if peer:
        peer_name = peer.get("name")
    else:
        prov = await db.providers.find_one({"id": peer_id}, {"_id": 0})
        if not prov:
            raise HTTPException(404, "Destinataire introuvable")
        peer_name = prov.get("name")
    if body.kind == "location":
        if body.lat is None or body.lng is None:
            raise HTTPException(400, "Position manquante")
        filtered_text, flags = "", []
    else:
        if not (body.text or "").strip():
            raise HTTPException(400, "Message vide")
        # === ANTI-CIRCUMVENTION FILTER === (protect marketplace revenue)
        original_text = body.text.strip()
        filtered_text, flags = _sanitize_message(original_text)
        # Log potential contournement dans une collection dédiée pour le fraud scoring
        if flags:
            await db.contact_flags.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                "peer_id": peer_id,
                "flags": flags,
                "text_hash": hashlib.sha256(original_text.encode()).hexdigest()[:16],
                "created_at": now_iso(),
            })
    cid = _conv_id(user["id"], peer_id)
    doc = {
        "id": str(uuid.uuid4()),
        "conv_id": cid,
        "from_id": user["id"],
        "from_name": user["name"],
        "to_id": peer_id,
        "to_name": peer_name,
        "text": filtered_text,
        "flagged": bool(flags),
        "flags": flags,
        "kind": body.kind,
        "read": False,
        "created_at": now_iso(),
    }
    if body.kind == "location":
        expires_in_minutes = body.expires_in_minutes or 15
        doc["lat"] = body.lat
        doc["lng"] = body.lng
        doc["accuracy_m"] = body.accuracy_m
        doc["landmark"] = (body.landmark or "").strip() or None
        doc["expires_in_minutes"] = expires_in_minutes
        doc["expires_at"] = (datetime.now(timezone.utc) + timedelta(minutes=expires_in_minutes)).isoformat()
    await db.messages.insert_one(doc)
    # Notifier le destinataire uniquement s'il a un compte utilisateur réel
    if peer:
        notif_body = "a partagé sa position" if body.kind == "location" else filtered_text[:80]
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": peer_id,
            "type": "message",
            "title": user["name"],
            "body": notif_body,
            "peer_id": user["id"],
            "read": False,
            "created_at": now_iso(),
        })
        # Push mobile — non-bloquant
        try:
            await send_push(
                recipients=[peer_id],
                data={
                    "title": user["name"],
                    "message": notif_body[:120],
                    "action_url": f"/chat/{user['id']}",
                },
            )
        except Exception as e:
            log.warning(f"Push failed (non-blocking): {e}")
    return {k: v for k, v in doc.items() if k != "_id"}


# ---------- marketplace: wallet, cash payment, admin stats, fraud ----------
async def _get_wallet(uid: str) -> dict:
    """Récupère (ou initialise) le portefeuille d'un utilisateur."""
    w = await db.wallets.find_one({"user_id": uid}, {"_id": 0})
    if w:
        return w
    doc = {
        "user_id": uid,
        "balance_available": 0.0,   # gains disponibles (paiements en ligne validés)
        "balance_pending": 0.0,     # gains en attente de validation
        "commission_due": 0.0,      # commissions Jokoo à régler (paiements espèces)
        "commission_paid": 0.0,     # total commissions déjà payées à Jokoo
        "gross_earnings": 0.0,      # chiffre d'affaires brut
        "is_blocked_debt": False,   # bloqué pour dette de commission
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.wallets.insert_one(doc)
    return doc


@api.get("/wallet/me-legacy-shim")
async def wallet_me_legacy_shim(user=Depends(current_user)):
    """[DEPRECATED] Ancien schéma wallet — conservé uniquement pour anciens builds
    mobiles. Le nouveau moteur v2 est servi par `/api/wallet/me`.
    """
    w = await _get_wallet(user["id"])
    return {k: v for k, v in w.items() if k != "_id"}


# [REMOVED] Legacy `/wallet/me`, `/wallet/history`, `/wallet/pay-commission-due`
# — replaced by production-grade Wallet Engine v2 in `wallet/` package.
# See `/api/wallet/me`, `/api/wallet/history`, `/api/wallet/recharge`, etc.


@api.post("/bookings/{bid}/cash-payment")
async def record_cash_payment(bid: str, body: dict, user=Depends(current_user)):
    """Le prestataire déclare avoir reçu un paiement en espèces.

    Utilise le moteur Wallet v2 : la commission Jokoo est automatiquement
    débitée du wallet du prestataire (allow_negative jusqu'au plafond admin).
    """
    from wallet import commission as _wcom
    from wallet import service as _wsvc

    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Réservation introuvable")
    if b.get("provider_id") != user["id"]:
        raise HTTPException(403, "Seul le prestataire peut enregistrer un paiement espèces")
    if b.get("paid_at"):
        raise HTTPException(400, "Réservation déjà payée")

    amount = int(body.get("amount") or b.get("amount") or b.get("estimated_price") or 0)
    if amount <= 0:
        raise HTTPException(400, "Montant invalide")

    # Persist the payment declaration on the booking
    await db.bookings.update_one(
        {"id": bid},
        {"$set": {
            "paid": True,
            "paid_at": now_iso(),
            "paid_method": "cash",
            "amount_paid": amount,
            "estimated_price": amount,  # ensure commission engine sees this
        }},
    )

    # Re-read for latest state
    b_updated = await db.bookings.find_one({"id": bid}, {"_id": 0})
    b_updated["provider_user_id"] = user["id"]

    # Wallet v2: debit commission from provider, credit platform.
    try:
        result = await _wcom.charge_cash_commission(
            db,
            booking=b_updated,
            actor_id=user["id"],
            ip=None,
        )
    except _wsvc.InsufficientFunds as e:
        # The wallet went past the admin-defined negative floor.
        # The booking is still marked paid, but the commission is flagged as unrecoverable.
        raise HTTPException(status_code=402, detail={
            "code": "insufficient_funds",
            "message": str(e),
        })

    commission_xof = int(result.get("commission_xof", 0))
    balance_after = int(result.get("provider_balance_after_xof", 0))

    # Get the actual gate value from the wallet snapshot (respects min_balance + max_negative admin config)
    pro_wallet = await _wallet_service.get_wallet(db, user["id"])
    snap = await _wallet_service.public_snapshot(db, pro_wallet)
    is_blocked = not snap.get("can_receive_bookings", True)

    # Notify provider
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "commission_due",
        "title": "Commission Jokoo débitée",
        "body": (
            f"{commission_xof:,} F CFA débités automatiquement de votre wallet "
            f"(commission {result.get('rate_percent')}% sur {amount:,} F cash reçus)."
        ).replace(",", " "),
        "booking_id": bid,
        "read": False,
        "created_at": now_iso(),
    })
    if b.get("client_id"):
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": b["client_id"],
            "type": "booking_confirmed",
            "title": "Réservation confirmée",
            "body": f"Le prestataire a confirmé la réservation ({amount:,} F CFA payés en espèces).".replace(",", " "),
            "booking_id": bid,
            "read": False,
            "created_at": now_iso(),
        })
        try:
            await send_push(
                recipients=[b["client_id"]],
                data={
                    "title": "Réservation confirmée ✅",
                    "message": f"Le prestataire a confirmé votre réservation ({amount:,} F CFA payés en espèces).".replace(",", " "),
                    "action_url": f"/booking/{bid}",
                },
            )
        except Exception as _e:
            log.warning(f"Push failed (non-blocking): {_e}")

    if is_blocked:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "type": "account_blocked",
            "title": "Wallet en négatif",
            "body": "Rechargez votre wallet pour continuer à recevoir des réservations.",
            "read": False,
            "created_at": now_iso(),
        })

    return {
        "ok": True,
        "booking_id": bid,
        "amount_paid_xof": amount,
        "commission_xof": commission_xof,
        "commission_rate_percent": result.get("rate_percent"),
        "wallet_balance_after_xof": balance_after,
        "wallet_can_receive_bookings": not is_blocked,
        "transaction_id": result.get("transaction_id"),
    }


# --- Legacy cash-payment implementation (kept as reference, unused) ---
async def _legacy_record_cash_payment_deprecated(bid: str, body: dict, user):
    """[DEPRECATED — replaced by v2 above] Do not call directly."""
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Réservation introuvable")
    if b.get("provider_id") != user["id"]:
        raise HTTPException(403, "Seul le prestataire peut enregistrer un paiement espèces")
    if b.get("paid_at"):
        raise HTTPException(400, "Réservation déjà payée")
    amount = float(body.get("amount") or b.get("amount") or 0)
    if amount <= 0:
        raise HTTPException(400, "Montant invalide")
    kind = body.get("category") or b.get("category") or "default"
    commission = _commission_for(kind, amount)
    await db.bookings.update_one(
        {"id": bid},
        {"$set": {
            "paid": True,
            "paid_at": now_iso(),
            "paid_method": "cash",
            "amount_paid": amount,
            "commission": commission,
            "commission_status": "due",
        }},
    )
    w = await _get_wallet(user["id"])
    new_debt = w["commission_due"] + commission
    is_blocked = new_debt >= COMMISSION_DEBT_THRESHOLD_FCFA
    await db.wallets.update_one(
        {"user_id": user["id"]},
        {"$set": {
            "commission_due": new_debt,
            "gross_earnings": w["gross_earnings"] + amount,
            "is_blocked_debt": is_blocked,
            "updated_at": now_iso(),
        }},
    )
    await db.wallet_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "cash_commission_due",
        "amount": commission,
        "gross": amount,
        "booking_id": bid,
        "created_at": now_iso(),
    })
    # Notifier le prestataire (commission Jokoo à régler)
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "commission_due",
        "title": "Commission Jokoo à régler",
        "body": f"{commission:.0f} FCFA de commission sur votre paiement espèces. Solde dû : {new_debt:.0f} FCFA.",
        "booking_id": bid,
        "read": False,
        "created_at": now_iso(),
    })
    # Notifier le client (réservation confirmée)
    if b.get("client_id"):
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": b["client_id"],
            "type": "booking_confirmed",
            "title": "Réservation confirmée",
            "body": f"Le prestataire a confirmé la réservation ({amount:.0f} FCFA payés en espèces).",
            "booking_id": bid,
            "read": False,
            "created_at": now_iso(),
        })
        # Push mobile — non-bloquant
        try:
            await send_push(
                recipients=[b["client_id"]],
                data={
                    "title": "Réservation confirmée ✅",
                    "message": f"Le prestataire a confirmé votre réservation ({amount:.0f} FCFA payés en espèces).",
                    "action_url": f"/booking/{bid}",
                },
            )
        except Exception as e:
            log.warning(f"Push failed (non-blocking): {e}")
    if is_blocked:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "type": "account_blocked",
            "title": "Compte bloqué",
            "body": f"Vous avez dépassé le plafond ({COMMISSION_DEBT_THRESHOLD_FCFA} FCFA) de commissions impayées. Réglez pour réactiver.",
            "read": False,
            "created_at": now_iso(),
        })
    return {"ok": True, "commission": commission, "commission_due_total": new_debt, "blocked": is_blocked}


@api.post("/wallet/pay-commission-due-legacy")
async def pay_commission_due_legacy(body: dict, user=Depends(current_user)):
    """[DEPRECATED] Reste actif pour anciens builds mobiles.
    Ne PAS utiliser dans les nouvelles intégrations — la commission est
    automatiquement débitée par le moteur v2 dès `POST /bookings/{id}/cash-payment`.
    """
    w = await _get_wallet(user["id"])
    to_pay = float(body.get("amount") or w["commission_due"])
    if to_pay <= 0:
        raise HTTPException(400, "Aucune commission à régler")
    if to_pay > w["commission_due"]:
        raise HTTPException(400, "Montant supérieur à la dette")
    new_due = round(w["commission_due"] - to_pay, 2)
    await db.wallets.update_one(
        {"user_id": user["id"]},
        {"$set": {
            "commission_due": new_due,
            "commission_paid": w["commission_paid"] + to_pay,
            "is_blocked_debt": new_due >= COMMISSION_DEBT_THRESHOLD_FCFA,
            "updated_at": now_iso(),
        }},
    )
    await db.wallet_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "commission_paid",
        "amount": to_pay,
        "method": body.get("method", "manual"),
        "created_at": now_iso(),
    })
    if new_due < COMMISSION_DEBT_THRESHOLD_FCFA and w["is_blocked_debt"]:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "type": "account_reactivated",
            "title": "Compte réactivé",
            "body": "Vos commissions sont à jour. Vous pouvez de nouveau recevoir des réservations.",
            "read": False,
            "created_at": now_iso(),
        })
    return {"ok": True, "commission_due": new_due, "commission_paid_total": w["commission_paid"] + to_pay}


# ---------- Auto-block: hook dans les créations de bookings ----------
async def _check_provider_not_blocked(provider_id: str) -> None:
    w = await db.wallets.find_one({"user_id": provider_id}, {"_id": 0})
    if w and w.get("is_blocked_debt"):
        raise HTTPException(
            status_code=403,
            detail=f"Ce prestataire ne peut plus accepter de réservations (commissions impayées > {COMMISSION_DEBT_THRESHOLD_FCFA} FCFA).",
        )


# ---------- Admin: revenue & marketplace stats ----------
@api.get("/admin/stats/marketplace")
async def admin_marketplace_stats(user=Depends(current_user)):
    require_admin(user)
    # Aggregate totals
    online_agg = await db.bookings.aggregate([
        {"$match": {"paid_method": {"$in": ["stripe", "wave", "orange_money"]}}},
        {"$group": {"_id": None, "gmv": {"$sum": "$amount_paid"}, "commissions": {"$sum": "$commission"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    cash_agg = await db.bookings.aggregate([
        {"$match": {"paid_method": "cash"}},
        {"$group": {"_id": None, "gmv": {"$sum": "$amount_paid"}, "commissions": {"$sum": "$commission"}, "count": {"$sum": 1}}},
    ]).to_list(1)
    wallets_agg = await db.wallets.aggregate([
        {"$group": {"_id": None,
                    "total_due": {"$sum": "$commission_due"},
                    "total_paid": {"$sum": "$commission_paid"},
                    "blocked_count": {"$sum": {"$cond": ["$is_blocked_debt", 1, 0]}}}},
    ]).to_list(1)
    top_providers = await db.wallets.find({}, {"_id": 0}).sort("gross_earnings", -1).limit(10).to_list(10)
    flags_last_30d = await db.contact_flags.count_documents({})
    return {
        "online": online_agg[0] if online_agg else {"gmv": 0, "commissions": 0, "count": 0},
        "cash": cash_agg[0] if cash_agg else {"gmv": 0, "commissions": 0, "count": 0},
        "wallets": wallets_agg[0] if wallets_agg else {"total_due": 0, "total_paid": 0, "blocked_count": 0},
        "top_providers": top_providers,
        "contact_flags_total": flags_last_30d,
        "threshold_fcfa": COMMISSION_DEBT_THRESHOLD_FCFA,
    }


# ---------- Fraud detection ----------
@api.get("/admin/fraud-alerts")
async def admin_fraud_alerts(user=Depends(current_user), limit: int = 100):
    require_admin(user)
    # Suspicious users : ceux avec le plus de contact_flags
    pipeline = [
        {"$group": {"_id": "$user_id", "flag_count": {"$sum": 1}, "flags": {"$push": "$flags"}, "last_at": {"$max": "$created_at"}}},
        {"$sort": {"flag_count": -1}},
        {"$limit": limit},
    ]
    suspects = await db.contact_flags.aggregate(pipeline).to_list(limit)
    # Enrichir avec le nom
    ids = [s["_id"] for s in suspects]
    users = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}).to_list(500)
    umap = {u["id"]: u for u in users}
    for s in suspects:
        s["user"] = umap.get(s["_id"], {"name": "[inconnu]", "id": s["_id"]})
        s["flags"] = list({f for sublist in s["flags"] for f in sublist})
    # Cancelled-then-contact pattern
    cancelled_recent = await db.bookings.count_documents({"status": "cancelled"})
    return {
        "suspects": suspects,
        "cancelled_bookings_total": cancelled_recent,
        "threshold_alert_flags": 3,
    }


# ---------- notifications ----------
@api.get("/notifications")
async def list_notifications(include_archived: bool = False, user=Depends(current_user)):
    query: dict = {"user_id": user["id"]}
    if not include_archived:
        query["archived"] = {"$ne": True}
    cur = db.notifications.find(query, {"_id": 0}).sort("created_at", -1).limit(100)
    return await cur.to_list(100)


@api.post("/notifications/read-all")
async def read_all_notifs(user=Depends(current_user)):
    await db.notifications.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/notifications/{nid}/read")
async def read_one_notif(nid: str, user=Depends(current_user)):
    """Marque une notification comme lue (utilisé au clic sur un item)."""
    await db.notifications.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


# ---------- Notification preferences (Play/App Store best practice) ----------
DEFAULT_NOTIF_PREFS = {
    "new_booking": True,
    "booking_accepted": True,
    "booking_confirmed": True,
    "provider_on_way": True,
    "payment_received": True,
    "messages": True,
    "promotions": True,
    "reminders": True,
    "commission_due": True,
    "sos": True,
}


@api.get("/notifications/preferences")
async def get_notif_prefs(user=Depends(current_user)):
    doc = await db.notification_prefs.find_one({"user_id": user["id"]}, {"_id": 0})
    base = {
        "user_id": user["id"],
        **DEFAULT_NOTIF_PREFS,
        "channel_push": True,
        "channel_email": True,
        "channel_inapp": True,
    }
    if doc:
        base.update(doc)
    return base


@api.patch("/notifications/preferences")
async def update_notif_prefs(body: dict, user=Depends(current_user)):
    allowed = set(DEFAULT_NOTIF_PREFS.keys()) | {"channel_push", "channel_email", "channel_inapp"}
    updates = {k: bool(v) for k, v in body.items() if k in allowed}
    if not updates:
        raise HTTPException(400, "Aucune préférence valide fournie")
    updates["updated_at"] = now_iso()
    await db.notification_prefs.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], **updates}},
        upsert=True,
    )
    # Retourne la structure fusionnée avec les défauts (évite les KeyError côté client)
    doc = await db.notification_prefs.find_one({"user_id": user["id"]}, {"_id": 0})
    base = {
        "user_id": user["id"],
        **DEFAULT_NOTIF_PREFS,
        "channel_push": True,
        "channel_email": True,
        "channel_inapp": True,
    }
    if doc:
        base.update(doc)
    return base


# ---------- Push notification tokens (Expo / FCM / APNs) ----------
@api.post("/notifications/register-token")
async def register_push_token(body: dict, user=Depends(current_user)):
    """Enregistre le token de push notif de l'appareil (Expo/FCM/APNs).
    Le champ platform doit valoir 'ios', 'android' ou 'web'.
    """
    token = (body.get("token") or "").strip()
    platform = body.get("platform", "unknown")
    if not token:
        raise HTTPException(400, "token requis")
    await db.push_tokens.update_one(
        {"user_id": user["id"], "token": token},
        {"$set": {
            "user_id": user["id"],
            "token": token,
            "platform": platform,
            "device_info": body.get("device_info"),
            "updated_at": now_iso(),
        }},
        upsert=True,
    )
    return {"ok": True}


@api.delete("/notifications/register-token")
async def unregister_push_token(body: dict, user=Depends(current_user)):
    token = (body.get("token") or "").strip()
    if token:
        await db.push_tokens.delete_one({"user_id": user["id"], "token": token})
    else:
        await db.push_tokens.delete_many({"user_id": user["id"]})
    return {"ok": True}


# ---------- Notifications item operations (must come AFTER literal register-token route) ----------
@api.post("/notifications/{nid}/unread")
async def unread_one_notif(nid: str, user=Depends(current_user)):
    """Marque une notification comme non-lue."""
    await db.notifications.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"read": False}})
    return {"ok": True}


@api.post("/notifications/{nid}/archive")
async def archive_one_notif(nid: str, user=Depends(current_user)):
    """Archive une notification (masquée de la liste par défaut, conservée en DB)."""
    await db.notifications.update_one(
        {"id": nid, "user_id": user["id"]},
        {"$set": {"archived": True, "archived_at": now_iso(), "read": True}},
    )
    return {"ok": True}


@api.delete("/notifications/{nid}")
async def delete_one_notif(nid: str, user=Depends(current_user)):
    """Supprime définitivement une notification."""
    r = await db.notifications.delete_one({"id": nid, "user_id": user["id"]})
    return {"deleted": r.deleted_count}


# ---------- CRM: Admin dashboard overview ----------
@api.get("/admin/crm/overview")
async def admin_crm_overview(user=Depends(current_user)):
    require_admin(user)
    now = datetime.now(timezone.utc)
    since_7d = (now - timedelta(days=7)).isoformat()
    since_30d = (now - timedelta(days=30)).isoformat()

    total_users = await db.users.count_documents({})
    total_clients = await db.users.count_documents({"role": "client"})
    total_providers = await db.users.count_documents({"role": "prestataire"})
    new_users_7d = await db.users.count_documents({"created_at": {"$gte": since_7d}})

    total_bookings = await db.bookings.count_documents({})
    bookings_7d = await db.bookings.count_documents({"created_at": {"$gte": since_7d}})
    completed = await db.bookings.count_documents({"status": "completed"})
    cancelled = await db.bookings.count_documents({"status": "cancelled"})

    open_reports = await db.reports.count_documents({"status": {"$ne": "resolved"}})
    total_reports = await db.reports.count_documents({})
    active_conversations_30d = len(await db.messages.distinct("conv_id", {"created_at": {"$gte": since_30d}}))

    total_messages = await db.messages.count_documents({})
    flagged_messages = await db.messages.count_documents({"flagged": True})

    recent_users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1, "created_at": 1}).sort("created_at", -1).limit(10).to_list(10)
    recent_bookings = await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)

    return {
        "users": {
            "total": total_users,
            "clients": total_clients,
            "providers": total_providers,
            "new_7d": new_users_7d,
        },
        "bookings": {
            "total": total_bookings,
            "last_7d": bookings_7d,
            "completed": completed,
            "cancelled": cancelled,
            "conversion_rate": round((completed / total_bookings * 100), 1) if total_bookings else 0,
        },
        "support": {
            "open_reports": open_reports,
            "total_reports": total_reports,
        },
        "messaging": {
            "total_messages": total_messages,
            "flagged_messages": flagged_messages,
            "active_conversations_30d": active_conversations_30d,
        },
        "recent_users": recent_users,
        "recent_bookings": recent_bookings,
    }


@api.get("/admin/crm/users")
async def admin_list_users(
    user=Depends(current_user),
    role: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
):
    require_admin(user)
    query: dict = {}
    if role:
        query["role"] = role
    if q:
        query["$or"] = [
            {"name": {"$regex": _safe_regex(q), "$options": "i"}},
            {"email": {"$regex": _safe_regex(q), "$options": "i"}},
            {"phone": {"$regex": _safe_regex(q), "$options": "i"}},
        ]
    total = await db.users.count_documents(query)
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"total": total, "items": users}


# ---------- dashboard (prestataire) ----------
@api.get("/dashboard")
async def dashboard(user=Depends(current_user)):
    if user["role"] != "prestataire":
        raise HTTPException(403, "Prestataire uniquement")
    all_b = await db.bookings.find({"provider_id": user["id"]}, {"_id": 0}).to_list(1000)
    pending = [b for b in all_b if b["status"] == "pending"]
    accepted = [b for b in all_b if b["status"] == "accepted"]
    completed = [b for b in all_b if b["status"] == "completed"]
    revenue = sum((b.get("price") or b.get("quote_amount") or 0) for b in completed)
    provider = await db.providers.find_one({"id": user["id"]}, {"_id": 0})
    return {
        "total_bookings": len(all_b),
        "pending": len(pending),
        "accepted": len(accepted),
        "completed": len(completed),
        "revenue_xof": revenue,
        "rating": (provider or {}).get("rating", 0),
        "reviews_count": (provider or {}).get("reviews_count", 0),
        "subscription_active": (provider or {}).get("subscription_active", False),
        "subscription_until": (provider or {}).get("subscription_until"),
        "recent_bookings": sorted(all_b, key=lambda b: b.get("created_at", ""), reverse=True)[:10],
    }


# ---------- Dashboard: Revenue history ----------
@api.get("/dashboard/revenue-history")
async def dashboard_revenue_history(
    range_: str = Query("week", alias="range"),  # "week" | "month" | "year"
    user=Depends(current_user),
):
    """Historique agrégé des revenus. Prestataire uniquement.
    - week  : 7 derniers jours (bucket = jour)
    - month : 4 dernières semaines (bucket = semaine)
    - year  : 12 derniers mois (bucket = mois)
    Retourne : { range, currency, total, buckets: [{ label, iso, amount }] }
    """
    if user["role"] != "prestataire":
        raise HTTPException(403, "Prestataire uniquement")

    now = datetime.now(timezone.utc)
    rng = range_ if range_ in ("week", "month", "year") else "week"

    # 1. Determine window & bucket size
    if rng == "week":
        start = now - timedelta(days=6)
        buckets_meta = []
        for i in range(7):
            d = start + timedelta(days=i)
            buckets_meta.append({
                "label": ["L", "M", "M", "J", "V", "S", "D"][d.weekday()],
                "iso": d.date().isoformat(),
                "start": datetime(d.year, d.month, d.day),
                "end": datetime(d.year, d.month, d.day) + timedelta(days=1),
                "amount": 0,
            })
    elif rng == "month":
        start = now - timedelta(days=27)
        buckets_meta = []
        for i in range(4):
            ws = start + timedelta(days=i * 7)
            we = ws + timedelta(days=7)
            buckets_meta.append({
                "label": f"S{i + 1}",
                "iso": ws.date().isoformat(),
                "start": datetime(ws.year, ws.month, ws.day),
                "end": datetime(we.year, we.month, we.day),
                "amount": 0,
            })
    else:  # year
        buckets_meta = []
        for i in range(11, -1, -1):
            m = (now.month - i - 1) % 12 + 1
            y = now.year - ((i - now.month + 1) // 12 if i >= now.month else 0)
            ms = datetime(y, m, 1)
            if m == 12:
                me = datetime(y + 1, 1, 1)
            else:
                me = datetime(y, m + 1, 1)
            months_fr = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"]
            buckets_meta.append({
                "label": months_fr[m - 1],
                "iso": ms.date().isoformat(),
                "start": ms,
                "end": me,
                "amount": 0,
            })

    completed = await db.bookings.find(
        {"provider_id": user["id"], "status": "completed"},
        {"_id": 0, "created_at": 1, "price": 1, "quote_amount": 1, "date": 1},
    ).to_list(2000)

    def _bkt_dt(b: dict) -> datetime:
        d = b.get("date")
        if d and isinstance(d, str) and len(d) >= 10:
            try:
                return datetime.fromisoformat(d[:10])
            except Exception:
                pass
        ca = b.get("created_at") or ""
        try:
            return datetime.fromisoformat(ca[:19])
        except Exception:
            return datetime(2000, 1, 1)

    for b in completed:
        dt = _bkt_dt(b)
        amt = int(b.get("price") or b.get("quote_amount") or 0)
        for bkt in buckets_meta:
            if bkt["start"] <= dt < bkt["end"]:
                bkt["amount"] += amt
                break

    total = sum(bkt["amount"] for bkt in buckets_meta)
    return {
        "range": rng,
        "currency": "XOF",
        "total": total,
        "buckets": [
            {"label": bkt["label"], "iso": bkt["iso"], "amount": bkt["amount"]}
            for bkt in buckets_meta
        ],
    }


# ---------- Dashboard: Activity timeline ----------
@api.get("/dashboard/activity")
async def dashboard_activity(limit: int = 20, user=Depends(current_user)):
    """Timeline unifiée d'activité pour prestataire : missions terminées, paiements, avis, achievements."""
    if user["role"] != "prestataire":
        raise HTTPException(403, "Prestataire uniquement")

    items: list[dict] = []

    # 1. Recent completed bookings (missions)
    completed = await db.bookings.find(
        {"provider_id": user["id"], "status": "completed"},
        {"_id": 0},
    ).sort("updated_at", -1).limit(int(limit)).to_list(int(limit))
    for b in completed:
        items.append({
            "id": f"mission_{b.get('id')}",
            "type": "mission_completed",
            "title": "Mission terminée",
            "subtitle": f"{b.get('client_name', 'Client')} · {b.get('service') or 'Prestation'}",
            "amount": b.get("price") or b.get("quote_amount") or 0,
            "at": b.get("updated_at") or b.get("created_at"),
            "booking_id": b.get("id"),
        })

    # 2. Paid bookings (payment received / booking confirmed for cash)
    paid = await db.bookings.find(
        {"provider_id": user["id"], "paid": True},
        {"_id": 0},
    ).sort("updated_at", -1).limit(int(limit)).to_list(int(limit))
    for b in paid:
        # Cash bookings show "Réservation confirmée" — no money moves via
        # the platform, so it's not a payment reception, it's a booking
        # confirmation by the provider.
        is_cash = (b.get("paid_method") or "").lower() in ("cash", "espèces", "especes")
        items.append({
            "id": f"payment_{b.get('id')}",
            "type": "booking_confirmed" if is_cash else "payment_received",
            "title": "Réservation confirmée" if is_cash else "Paiement reçu",
            "subtitle": f"{b.get('client_name', 'Client')} · {b.get('service') or 'Prestation'}",
            "amount": b.get("price") or b.get("quote_amount") or 0,
            "at": b.get("paid_at") or b.get("updated_at") or b.get("created_at"),
            "booking_id": b.get("id"),
        })

    # 3. Recent reviews on provider
    reviews = await db.reviews.find(
        {"provider_id": user["id"]},
        {"_id": 0},
    ).sort("created_at", -1).limit(int(limit)).to_list(int(limit))
    for r in reviews:
        rating = r.get("rating", 0)
        stars = "⭐" * min(5, int(rating))
        items.append({
            "id": f"review_{r.get('id')}",
            "type": "review_received",
            "title": f"Avis {rating}/5 {stars}",
            "subtitle": r.get("author_name") or "Client",
            "at": r.get("created_at"),
            "review_id": r.get("id"),
        })

    # 4. Achievements (milestones — derived)
    completed_count = len(completed)
    achievement_thresholds = [(1, "1re mission"), (10, "10 missions"), (50, "50 missions"), (100, "100 missions")]
    for th, label in achievement_thresholds:
        if completed_count >= th:
            items.append({
                "id": f"achievement_{th}",
                "type": "achievement",
                "title": "Objectif débloqué",
                "subtitle": label,
                "at": (completed[th - 1] if len(completed) >= th else completed[-1]).get("updated_at") if completed else None,
            })

    # Sort by timestamp desc
    items.sort(key=lambda x: x.get("at") or "", reverse=True)
    return {"items": items[: int(limit)]}


# ---------- payments (Stripe checkout via emergentintegrations) ----------
def _authoritative_booking_price(b: dict) -> int:
    """SEC-003 : montant à facturer, calculé UNIQUEMENT côté serveur.
    Priorité : quote_amount (devis validé) > price (initial). Jamais fourni par le client.
    """
    amt = b.get("quote_amount")
    if amt is None or amt == "" or amt == 0:
        amt = b.get("price") or 0
    try:
        amt_int = int(round(float(amt)))
    except Exception:
        amt_int = 0
    return max(0, amt_int)


@api.get("/payments/config")
async def payments_config():
    """Retourne dynamiquement les moyens de paiement affichés dans l'app.
    Nous masquons proactivement les fournisseurs non configurés (Wave/OM sans
    clés API) pour éviter d'afficher des boutons qui renverraient 503 —
    exigence Apple : pas d'erreurs backend visibles pour l'utilisateur final.

    - `card`   : Stripe (désactivé par défaut en version Sénégal).
    - `wave`   : Affiché SEULEMENT si WAVE_API_KEY est configurée.
    - `orange` : Affiché SEULEMENT si les credentials OM sont configurés.
    - `cash`   : Toujours disponible (paiement à la fin de la prestation).
    """
    wave_ready = _wave_enabled()
    orange_ready = _orange_enabled()
    return {
        "card":   STRIPE_ENABLED,
        "wave":   wave_ready,
        "orange": orange_ready,
        "cash":   True,
        "card_ready":   STRIPE_ENABLED,
        "wave_ready":   wave_ready,
        "orange_ready": orange_ready,
        "currency": "XOF",
        "country":  "SN",
    }


@api.post("/payments/checkout/booking")
async def pay_booking(body: CheckoutBookingIn, user=Depends(current_user)):
    b = await db.bookings.find_one({"id": body.booking_id}, {"_id": 0})
    if not b or b["client_id"] != user["id"]:
        raise HTTPException(404, "Réservation introuvable")
    # SEC-003 : recalculer le montant côté serveur. Ignorer body.amount_xof
    # (audit trail seulement).
    base_amt = _authoritative_booking_price(b)
    if base_amt <= 0:
        raise HTTPException(400, "Le devis n'est pas encore validé pour cette réservation")
    # Apply promo code if provided (server-computed final amount)
    final_amt = await _apply_promo_to_booking(body.booking_id, body.promo_code, base_amt, user, category="provider")
    if final_amt <= 0:
        raise HTTPException(400, "Montant invalide")
    try:
        # emergentintegrations wrapper expects amount as float in major units.
        req = CheckoutSessionRequest(
            amount=float(final_amt),
            currency="xof",
            success_url=f"{APP_URL}/booking/paid?session_id={{CHECKOUT_SESSION_ID}}&booking_id={body.booking_id}",
            cancel_url=f"{APP_URL}/booking/cancelled",
            metadata={
                "booking_id": body.booking_id,
                "user_id": user["id"],
                "kind": "booking",
                "promo_code": (body.promo_code or "").upper() if body.promo_code else "",
            },
        )
        session = await _require_stripe().create_checkout_session(req)
        await db.bookings.update_one(
            {"id": body.booking_id},
            {"$set": {"stripe_session_id": session.session_id}},
        )
        return {"url": session.url, "session_id": session.session_id}
    except HTTPException:
        raise
    except Exception as e:
        log.exception("stripe booking checkout failed")
        raise HTTPException(500, f"Paiement indisponible: {e}")


@api.post("/payments/checkout/subscription")
async def pay_sub(body: CheckoutSubIn, user=Depends(current_user)):
    if user["role"] != "prestataire":
        raise HTTPException(403, "Prestataire uniquement")
    try:
        req = CheckoutSessionRequest(
            amount=15000.0,  # 15 000 F CFA / month
            currency="xof",
            success_url=f"{APP_URL}/booking/paid?session_id={{CHECKOUT_SESSION_ID}}&kind=sub",
            cancel_url=f"{APP_URL}/booking/cancelled",
            metadata={"user_id": user["id"], "kind": "subscription"},
        )
        session = await _require_stripe().create_checkout_session(req)
        return {"url": session.url, "session_id": session.session_id}
    except HTTPException:
        raise
    except Exception as e:
        log.exception("stripe sub checkout failed")
        raise HTTPException(500, f"Paiement indisponible: {e}")


@api.get("/payments/mine")
async def my_payments(user=Depends(current_user)):
    """Historique de paiement d'un utilisateur : bookings passés avec statut payé/en attente."""
    # On agrège depuis bookings + rides.bookings + parcels + family.bookings.
    payments: list = []
    async for b in db.bookings.find({"client_id": user["id"]}, {"_id": 0}):
        if b.get("price") or b.get("paid"):
            payments.append({
                "id": f"bk-{b['id']}",
                "amount_xof": b.get("price") or 0,
                "provider": (b.get("payment_provider") or "stripe"),
                "status": "paid" if b.get("paid") else b.get("status", "pending"),
                "created_at": b.get("created_at") or now_iso(),
                "booking_id": b["id"],
                "title": f"Réservation service · {b.get('service_key') or ''}".strip(" ·"),
            })
    async for r in db.ride_bookings.find({"passenger_id": user["id"]}, {"_id": 0}):
        payments.append({
            "id": f"rb-{r['id']}",
            "amount_xof": r.get("total_price") or 0,
            "provider": r.get("payment_provider") or "cash",
            "status": r.get("status", "pending"),
            "created_at": r.get("created_at") or now_iso(),
            "booking_id": r["id"],
            "title": "Covoiturage",
        })
    async for p in db.parcels.find({"sender_id": user["id"]}, {"_id": 0}):
        payments.append({
            "id": f"pc-{p['id']}",
            "amount_xof": p.get("price") or 0,
            "provider": p.get("payment_mode") or "cash",
            "status": p.get("status", "pending"),
            "created_at": p.get("created_at") or now_iso(),
            "booking_id": p["id"],
            "title": "Livraison colis",
        })
    async for fb in db.babysitting_bookings.find({"parent_id": user["id"]}, {"_id": 0}):
        payments.append({
            "id": f"fb-{fb['id']}",
            "amount_xof": fb.get("total_price") or 0,
            "provider": "cash",
            "status": fb.get("status", "pending"),
            "created_at": fb.get("created_at") or now_iso(),
            "booking_id": fb["id"],
            "title": "Jokoo Family",
        })
    payments.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return payments[:200]


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


@api.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, user=Depends(current_user)):
    """Change the user's password after verifying the current one."""
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if not u:
        raise HTTPException(404, "Utilisateur introuvable")
    stored = u.get("password_hash")
    if not stored or not await verify_password_async(body.current_password, stored):
        raise HTTPException(400, "Mot de passe actuel incorrect")
    # policy check
    if body.new_password == body.current_password:
        raise HTTPException(400, "Le nouveau mot de passe doit être différent de l'actuel")
    new_hash = await hash_password_async(body.new_password)
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": new_hash, "updated_at": now_iso()}})
    return {"ok": True}


@api.get("/payments/status/{session_id}")
async def payment_status(
    session_id: str,
    authorization: Optional[str] = Header(None),
):
    """Vérification du statut d'un paiement Stripe.

    Auth optionnelle : le session_id étant un secret Stripe à usage unique,
    l'endpoint peut être appelé depuis la page de retour /booking/paid sans
    token (ex. après clearage de la session navigateur). Si un token valide
    est fourni, on met à jour l'état de l'abonnement du provider connecté.
    """
    user: Optional[dict] = None
    if authorization and authorization.lower().startswith("bearer "):
        tok = authorization.split(" ", 1)[1]
        try:
            payload = jwt.decode(tok, JWT_SECRET, algorithms=[JWT_ALG])
            user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
        except Exception:
            user = None
    try:
        s = await _require_stripe().get_checkout_status(session_id)
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        # 404 propre si Stripe ne connaît pas la session
        if "no such" in msg.lower() or "not found" in msg.lower() or "invalidrequest" in msg.lower().replace(" ", ""):
            raise HTTPException(404, "Session de paiement introuvable")
        raise HTTPException(502, f"Impossible de vérifier: {msg}")
    paid = getattr(s, "payment_status", None) == "paid" or getattr(s, "status", None) == "complete"
    meta = getattr(s, "metadata", {}) or {}
    if paid and meta.get("kind") == "booking" and meta.get("booking_id"):
        await db.bookings.update_one(
            {"id": meta["booking_id"]},
            {"$set": {"paid": True, "paid_at": now_iso()}},
        )
        # Push mobile : architecture prête — activation post-store
    if paid and meta.get("kind") == "subscription" and user:
        until = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        await db.providers.update_one(
            {"id": user["id"]},
            {"$set": {"subscription_active": True, "subscription_until": until}},
        )
    return {"paid": paid, "status": getattr(s, "payment_status", getattr(s, "status", None))}


# ---------- Wave (Business API) ----------
@api.post("/payments/wave/checkout/booking")
async def wave_pay_booking(body: CheckoutBookingIn, user=Depends(current_user)):
    b = await db.bookings.find_one({"id": body.booking_id}, {"_id": 0})
    if not b or b["client_id"] != user["id"]:
        raise HTTPException(404, "Réservation introuvable")
    # SEC-003 : montant recalculé côté serveur
    base_amt = _authoritative_booking_price(b)
    if base_amt <= 0:
        raise HTTPException(400, "Le devis n'est pas encore validé pour cette réservation")
    final_amt = await _apply_promo_to_booking(body.booking_id, body.promo_code, base_amt, user, category="provider")
    if final_amt <= 0:
        raise HTTPException(400, "Montant invalide")
    session = await wave_create_checkout(
        amount_xof=final_amt,
        success_url=f"{APP_URL}/api/payments/wave/return?booking_id={body.booking_id}",
        error_url=f"{APP_URL}/api/payments/wave/cancel",
        client_reference=f"booking:{body.booking_id}",
    )
    await db.bookings.update_one(
        {"id": body.booking_id},
        {"$set": {
            "wave_session_id": session.get("id"),
            "payment_provider": "wave",
        }},
    )
    return {"url": session.get("wave_launch_url"), "session_id": session.get("id")}


@api.post("/payments/wave/checkout/subscription")
async def wave_pay_sub(body: CheckoutSubIn, user=Depends(current_user)):
    if user["role"] != "prestataire":
        raise HTTPException(403, "Prestataire uniquement")
    session = await wave_create_checkout(
        amount_xof=15000,
        success_url=f"{APP_URL}/api/payments/wave/return?user_id={user['id']}&kind=sub",
        error_url=f"{APP_URL}/api/payments/wave/cancel",
        client_reference=f"sub:{user['id']}",
    )
    return {"url": session.get("wave_launch_url"), "session_id": session.get("id")}


@api.post("/payments/wave/webhook")
async def wave_webhook(request: Request):
    """Wave webhook — verifies signature then marks booking/subscription paid."""
    raw = await request.body()
    sig = request.headers.get("Wave-Signature") or request.headers.get("wave-signature")
    if not wave_verify_webhook(raw, sig):
        raise HTTPException(400, "Signature invalide")
    event = await request.json()
    et = event.get("type") or event.get("event") or ""
    data = event.get("data") or event
    if et in ("checkout.session.completed", "checkout.session.payment_success"):
        ref = data.get("client_reference") or ""
        if ref.startswith("booking:"):
            bid = ref.split(":", 1)[1]
            await db.bookings.update_one(
                {"id": bid},
                {"$set": {"paid": True, "paid_at": now_iso(), "payment_provider": "wave"}},
            )
        elif ref.startswith("sub:"):
            uid = ref.split(":", 1)[1]
            until = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
            await db.providers.update_one(
                {"id": uid},
                {"$set": {"subscription_active": True, "subscription_until": until}},
            )
    return {"received": True}


@api.get("/payments/wave/return")
async def wave_return(booking_id: Optional[str] = None, user_id: Optional[str] = None, kind: Optional[str] = None, sponsorship_id: Optional[str] = None):
    """Wave redirects the browser here after payment. We redirect the user to the frontend confirmation page."""
    if sponsorship_id:
        try:
            await _activate_sponsorship(sponsorship_id, provider="wave")
        except Exception:
            log.exception("wave sponsorship activation failed")
        return RedirectResponse(url=f"{APP_URL}/sponsor?paid=1&sid={sponsorship_id}&provider=wave", status_code=302)
    qs = []
    if booking_id: qs.append(f"booking_id={booking_id}")
    if kind: qs.append(f"kind={kind}")
    qs.append("provider=wave")
    return RedirectResponse(url=f"{APP_URL}/booking/paid?{'&'.join(qs)}", status_code=302)


@api.get("/payments/wave/cancel")
async def wave_cancel():
    return RedirectResponse(url=f"{APP_URL}/booking/cancelled?provider=wave", status_code=302)


# ---------- Orange Money Web Payment ----------
@api.post("/payments/orange/checkout/booking")
async def om_pay_booking(body: CheckoutBookingIn, user=Depends(current_user)):
    b = await db.bookings.find_one({"id": body.booking_id}, {"_id": 0})
    if not b or b["client_id"] != user["id"]:
        raise HTTPException(404, "Réservation introuvable")
    # SEC-003 : montant recalculé côté serveur
    base_amt = _authoritative_booking_price(b)
    if base_amt <= 0:
        raise HTTPException(400, "Le devis n'est pas encore validé pour cette réservation")
    final_amt = await _apply_promo_to_booking(body.booking_id, body.promo_code, base_amt, user, category="provider")
    if final_amt <= 0:
        raise HTTPException(400, "Montant invalide")
    order_id = f"jokoo-{body.booking_id}"
    session = await om_create_webpayment(
        amount_xof=final_amt,
        order_id=order_id,
        return_url=f"{APP_URL}/api/payments/orange/return?booking_id={body.booking_id}",
        cancel_url=f"{APP_URL}/api/payments/orange/cancel",
        notif_url=f"{APP_URL}/api/payments/orange/notify",
        reference="Jokoo",
    )
    await db.bookings.update_one(
        {"id": body.booking_id},
        {"$set": {
            "om_pay_token": session.get("pay_token"),
            "om_notif_token": session.get("notif_token"),
            "payment_provider": "orange",
        }},
    )
    return {
        "url": session.get("payment_url"),
        "pay_token": session.get("pay_token"),
    }


@api.post("/payments/orange/checkout/subscription")
async def om_pay_sub(body: CheckoutSubIn, user=Depends(current_user)):
    if user["role"] != "prestataire":
        raise HTTPException(403, "Prestataire uniquement")
    order_id = f"jokoo-sub-{user['id']}-{int(datetime.now(timezone.utc).timestamp())}"
    session = await om_create_webpayment(
        amount_xof=15000,
        order_id=order_id,
        return_url=f"{APP_URL}/api/payments/orange/return?user_id={user['id']}&kind=sub",
        cancel_url=f"{APP_URL}/api/payments/orange/cancel",
        notif_url=f"{APP_URL}/api/payments/orange/notify",
        reference="Jokoo Pro",
    )
    return {"url": session.get("payment_url"), "pay_token": session.get("pay_token")}


@api.get("/payments/orange/status/{pay_token}")
async def om_status(pay_token: str, user=Depends(current_user)):
    """Client polls this after the OM redirect flow. Marks paid on SUCCESS."""
    r = await om_get_status(pay_token)
    status_ = (r.get("status") or "").upper()
    if status_ == "SUCCESS":
        # Try mark booking
        b = await db.bookings.find_one({"om_pay_token": pay_token}, {"_id": 0})
        if b:
            await db.bookings.update_one(
                {"id": b["id"]},
                {"$set": {"paid": True, "paid_at": now_iso(), "payment_provider": "orange"}},
            )
        else:
            # subscription
            until = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
            await db.providers.update_one(
                {"id": user["id"]},
                {"$set": {"subscription_active": True, "subscription_until": until}},
            )
    return {"paid": status_ == "SUCCESS", "status": status_}


@api.get("/payments/orange/return")
async def om_return(booking_id: Optional[str] = None, user_id: Optional[str] = None, kind: Optional[str] = None, sponsorship_id: Optional[str] = None):
    if sponsorship_id:
        try:
            await _activate_sponsorship(sponsorship_id, provider="orange")
        except Exception:
            log.exception("orange sponsorship activation failed")
        return RedirectResponse(url=f"{APP_URL}/sponsor?paid=1&sid={sponsorship_id}&provider=orange", status_code=302)
    qs = []
    if booking_id: qs.append(f"booking_id={booking_id}")
    if kind: qs.append(f"kind={kind}")
    qs.append("provider=orange")
    return RedirectResponse(url=f"{APP_URL}/booking/paid?{'&'.join(qs)}", status_code=302)


@api.get("/payments/orange/cancel")
async def om_cancel():
    return RedirectResponse(url=f"{APP_URL}/booking/cancelled?provider=orange", status_code=302)


@api.post("/payments/orange/notify")
async def om_notify(request: Request):
    """Orange Money server-to-server notification endpoint.

    SEC-002 : cet endpoint doit vérifier l'authenticité de la notification
    (signature HMAC, IP allowlist, ou secret partagé) avant de marquer un
    paiement. Sans vérification, n'importe qui peut forger un webhook.

    Tant que la vraie API Orange Money n'est pas branchée (clé placeholder),
    on refuse toutes les notifications entrantes pour éviter la fraude.
    En prod : implémenter la vérification HMAC signature ci-dessous.
    """
    om_shared_secret = os.environ.get("ORANGE_NOTIFY_SECRET", "").strip()
    om_api_key = os.environ.get("ORANGE_API_KEY", "").strip().lower()
    if not om_shared_secret or om_api_key in ("", "placeholder"):
        # Vraie API OM non configurée : refuser toute notification entrante.
        logging.getLogger("jokoo").warning("orange notify received but ORANGE_NOTIFY_SECRET missing — rejecting")
        raise HTTPException(status_code=401, detail="unauthorized")

    # Vérification signature HMAC sur le corps brut.
    body_bytes = await request.body()
    provided_sig = (
        request.headers.get("X-Orange-Signature")
        or request.headers.get("X-Signature")
        or ""
    ).strip()
    import hmac as _hmac
    import hashlib as _hashlib
    expected = _hmac.new(
        om_shared_secret.encode("utf-8"), body_bytes, _hashlib.sha256
    ).hexdigest()
    if not provided_sig or not _hmac.compare_digest(expected, provided_sig):
        logging.getLogger("jokoo").warning("orange notify signature mismatch")
        raise HTTPException(status_code=401, detail="invalid signature")

    try:
        data = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="invalid body")

    status_ = str(data.get("status") or "").upper()
    order_id = str(data.get("order_id") or "")
    if status_ == "SUCCESS":
        if order_id.startswith("jokoo-sub-"):
            uid = order_id.split("-")[2] if len(order_id.split("-")) > 2 else None
            if uid:
                until = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
                await db.providers.update_one(
                    {"id": uid},
                    {"$set": {"subscription_active": True, "subscription_until": until}},
                )
        elif order_id.startswith("jokoo-"):
            bid = order_id.split("-", 1)[1]
            await db.bookings.update_one(
                {"id": bid},
                {"$set": {"paid": True, "paid_at": now_iso(), "payment_provider": "orange"}},
            )
    return {"received": True}



# ---------- prestations (services personnels du prestataire) ----------
def _clean_service(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/providers/{provider_id}/services")
async def list_provider_services(provider_id: str):
    """Liste publique des prestations actives d'un prestataire."""
    cur = db.services.find(
        {"provider_id": provider_id, "active": True}, {"_id": 0}
    ).sort("created_at", 1)
    return await cur.to_list(200)


@api.get("/services/mine")
async def list_my_services(user=Depends(current_user)):
    if user["role"] != "prestataire":
        raise HTTPException(403, "Prestataire uniquement")
    cur = db.services.find({"provider_id": user["id"]}, {"_id": 0}).sort("created_at", 1)
    return await cur.to_list(200)


@api.post("/services/mine")
async def create_my_service(body: ServiceIn, user=Depends(current_user)):
    if user["role"] != "prestataire":
        raise HTTPException(403, "Prestataire uniquement")
    if body.price_type != "quote" and (not body.price_amount or body.price_amount < 500):
        raise HTTPException(400, "Prix minimum 500 F CFA pour un prix fixe / de départ")
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "provider_id": user["id"],
        "name": body.name,
        "description": body.description or "",
        "category_key": body.category_key,
        "photos": body.photos,
        "price_type": body.price_type,
        "price_amount": None if body.price_type == "quote" else body.price_amount,
        "duration_minutes": body.duration_minutes,
        "active": body.active,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.services.insert_one(doc)
    return _clean_service(doc)


@api.patch("/services/mine/{sid}")
async def update_my_service(sid: str, body: ServiceIn, user=Depends(current_user)):
    svc = await db.services.find_one({"id": sid}, {"_id": 0})
    if not svc:
        raise HTTPException(404, "Prestation introuvable")
    if svc["provider_id"] != user["id"]:
        raise HTTPException(403, "Interdit")
    updates = {
        "name": body.name,
        "description": body.description or "",
        "category_key": body.category_key,
        "photos": body.photos,
        "price_type": body.price_type,
        "price_amount": None if body.price_type == "quote" else body.price_amount,
        "duration_minutes": body.duration_minutes,
        "active": body.active,
        "updated_at": now_iso(),
    }
    await db.services.update_one({"id": sid}, {"$set": updates})
    return {"ok": True}


@api.delete("/services/mine/{sid}")
async def delete_my_service(sid: str, user=Depends(current_user)):
    svc = await db.services.find_one({"id": sid}, {"_id": 0})
    if not svc:
        raise HTTPException(404, "Prestation introuvable")
    if svc["provider_id"] != user["id"]:
        raise HTTPException(403, "Interdit")
    await db.services.delete_one({"id": sid})
    return {"ok": True}


# ---------- publicités (admin) ----------
CAMPAIGN_PRICES_XOF = {7: 25000, 15: 45000, 30: 80000}


def _with_ctr(ad: dict) -> dict:
    imps = ad.get("impressions", 0) or 0
    clicks = ad.get("clicks", 0) or 0
    ad["ctr"] = round((clicks / imps) * 100, 2) if imps else 0
    return ad


def _is_ad_visible(ad: dict, now_str: str) -> bool:
    if not ad.get("active") or ad.get("suspended"):
        return False
    if ad.get("start_at") and now_str < ad["start_at"]:
        return False
    if ad.get("end_at") and now_str > ad["end_at"]:
        return False
    return True


@api.get("/ads")
async def list_public_ads(
    placement: str = "home",
    category: Optional[str] = None,
    audience: Optional[str] = None,  # "client" | "prestataire" — filtre par cible
    user=Depends(optional_user),
):
    """Liste publique — placement, dates, cible, actif. Incrémente les impressions."""
    now = now_iso()
    query: dict = {"placements": placement}
    if placement == "category" and category:
        query["category_key"] = category
    cur = db.ads.find(query, {"_id": 0}).sort("created_at", -1)
    items = await cur.to_list(100)
    # Cache des IDs bloqués (utilisateur courant), utilisé pour cacher les pubs pointant vers un prestataire bloqué.
    blocked = await _blocked_ids(user["id"] if user else None)
    valid = []
    for a in items:
        if not _is_ad_visible(a, now):
            continue
        # Ciblage : "all" ou correspond au rôle transmis
        aud = a.get("target_audience") or "all"
        if audience and aud != "all" and aud != audience:
            continue
        # Filtre bloqués : masquer les pubs qui pointent vers un prestataire bloqué mutuellement
        if blocked and a.get("link_type") == "provider" and a.get("link_target") in blocked:
            continue
        valid.append(_with_ctr(a))
    if valid:
        ids = [a["id"] for a in valid]
        await db.ads.update_many({"id": {"$in": ids}}, {"$inc": {"impressions": 1}})
    return valid


@api.post("/ads/{ad_id}/click")
async def ad_click(ad_id: str):
    await db.ads.update_one({"id": ad_id}, {"$inc": {"clicks": 1}})
    return {"ok": True}


@api.get("/admin/ads")
async def admin_list_ads(user=Depends(require_perm("ads:read"))):
    cur = db.ads.find({}, {"_id": 0}).sort("created_at", -1)
    items = await cur.to_list(500)
    return [_with_ctr(a) for a in items]


@api.post("/admin/ads")
async def admin_create_ad(body: AdIn, user=Depends(require_perm("ads:write"))):
    aid = str(uuid.uuid4())
    doc = {
        "id": aid,
        **body.model_dump(),
        "impressions": 0,
        "clicks": 0,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.ads.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.patch("/admin/ads/{ad_id}")
async def admin_update_ad(ad_id: str, body: AdIn, user=Depends(require_perm("ads:write"))):
    await db.ads.update_one(
        {"id": ad_id},
        {"$set": {**body.model_dump(), "updated_at": now_iso()}},
    )
    return {"ok": True}


@api.patch("/admin/ads/{ad_id}/suspend")
async def admin_suspend_ad(ad_id: str, user=Depends(require_perm("ads:write"))):
    await db.ads.update_one({"id": ad_id}, {"$set": {"suspended": True, "updated_at": now_iso()}})
    return {"ok": True}


@api.patch("/admin/ads/{ad_id}/resume")
async def admin_resume_ad(ad_id: str, user=Depends(require_perm("ads:write"))):
    await db.ads.update_one({"id": ad_id}, {"$set": {"suspended": False, "updated_at": now_iso()}})
    return {"ok": True}


@api.delete("/admin/ads/{ad_id}")
async def admin_delete_ad(ad_id: str, user=Depends(require_perm("ads:write"))):
    await db.ads.delete_one({"id": ad_id})
    return {"ok": True}


@api.get("/admin/ads/stats")
async def admin_ads_stats(user=Depends(require_perm("ads:read"))):
    ads = await db.ads.find({}, {"_id": 0}).to_list(1000)
    return {
        "total_ads": len(ads),
        "active_ads": sum(1 for a in ads if a.get("active") and not a.get("suspended")),
        "total_impressions": sum(a.get("impressions", 0) for a in ads),
        "total_clicks": sum(a.get("clicks", 0) for a in ads),
        "top": sorted([_with_ctr(a) for a in ads], key=lambda a: a.get("impressions", 0), reverse=True)[:10],
    }


# ---------- Promos (offres promotionnelles pilotées par l'admin) ----------
def _promo_visible(p: dict, now: str) -> bool:
    if not p.get("active"):
        return False
    if p.get("starts_at") and now < p["starts_at"]:
        return False
    if p.get("ends_at") and now > p["ends_at"]:
        return False
    return True


@api.get("/promos")
async def list_public_promos():
    """Liste publique des promos actives — utilisée pour peupler l'écran /promo/{slug}."""
    now = now_iso()
    items = await db.promos.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [p for p in items if _promo_visible(p, now)]


@api.get("/promos/{slug}")
async def get_public_promo(slug: str):
    p = await db.promos.find_one({"slug": slug}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Promo introuvable")
    if not _promo_visible(p, now_iso()):
        raise HTTPException(404, "Promo indisponible")
    return p


@api.get("/admin/promos")
async def admin_list_promos(user=Depends(require_perm("ads:read"))):
    cur = db.promos.find({}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)


@api.post("/admin/promos")
async def admin_create_promo(body: PromoIn, user=Depends(require_perm("ads:write"))):
    exists = await db.promos.find_one({"slug": body.slug}, {"_id": 0, "slug": 1})
    if exists:
        raise HTTPException(400, "Ce slug existe déjà — choisissez-en un autre")
    pid = str(uuid.uuid4())
    doc = {"id": pid, **body.model_dump(), "created_at": now_iso(), "updated_at": now_iso()}
    await db.promos.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.patch("/admin/promos/{pid}")
async def admin_update_promo(pid: str, body: PromoIn, user=Depends(require_perm("ads:write"))):
    # Empêche le changement de slug s'il entre en collision avec un autre.
    other = await db.promos.find_one({"slug": body.slug, "id": {"$ne": pid}}, {"_id": 0})
    if other:
        raise HTTPException(400, "Ce slug est déjà utilisé par une autre promo")
    await db.promos.update_one(
        {"id": pid},
        {"$set": {**body.model_dump(), "updated_at": now_iso()}},
    )
    return {"ok": True}


@api.delete("/admin/promos/{pid}")
async def admin_delete_promo(pid: str, user=Depends(require_perm("ads:write"))):
    await db.promos.delete_one({"id": pid})
    return {"ok": True}


# ==================================================================
# PROMO CODES — Discount codes system (user-facing)
# ==================================================================
class PromoCodeIn(BaseModel):
    code: str
    title: str
    description: Optional[str] = None
    discount_type: str  # "percent" | "fixed"
    discount_value: float
    min_amount_xof: Optional[int] = None
    max_discount_xof: Optional[int] = None
    category: Optional[str] = None  # "all", "family", "provider", "mobility"
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    usage_limit: Optional[int] = None
    usage_per_user: int = 1
    first_booking_only: bool = False
    active: bool = True


def _promo_code_visible(p: dict, now: str) -> bool:
    if not p.get("active"):
        return False
    if p.get("ends_at") and now > p["ends_at"]:
        return False
    return True


async def _user_promo_usage(user_id: str, code: str) -> int:
    """Nombre de fois qu'un utilisateur a déjà utilisé un code promo."""
    return await db.promo_code_uses.count_documents({"user_id": user_id, "code": code.upper()})


async def _user_bookings_count(user_id: str) -> int:
    """Nombre total de réservations de l'utilisateur (tous types confondus)."""
    a = await db.bookings.count_documents({"client_id": user_id})
    b = await db.family_bookings.count_documents({"parent_id": user_id})
    return a + b


def _compute_discount(promo: dict, amount: int) -> int:
    """Retourne le montant de la réduction en FCFA (arrondi à l'entier)."""
    dtype = promo.get("discount_type", "percent")
    dvalue = float(promo.get("discount_value", 0))
    if dtype == "percent":
        d = int(round(amount * dvalue / 100.0))
    else:
        d = int(round(dvalue))
    max_d = promo.get("max_discount_xof")
    if max_d:
        d = min(d, int(max_d))
    return max(0, min(d, amount))


async def _promo_status_for_user(promo: dict, user: dict, amount: Optional[int] = None, category: Optional[str] = None) -> dict:
    """Détermine le statut d'un code pour un utilisateur donné.
    Renvoie {status, reason, discount, final_amount}
    Statuts : available | applicable | not_applicable | expired | coming_soon | used_up
    """
    now = now_iso()
    code = (promo.get("code") or "").upper()
    # 1. Bornes temporelles
    if not promo.get("active"):
        return {"status": "not_applicable", "reason": "Ce code n'est plus actif."}
    if promo.get("starts_at") and now < promo["starts_at"]:
        return {"status": "coming_soon", "reason": f"Disponible à partir du {promo['starts_at'][:10]}."}
    if promo.get("ends_at") and now > promo["ends_at"]:
        return {"status": "expired", "reason": "Ce code a expiré."}
    # 2. Limite globale
    lim = promo.get("usage_limit")
    if lim:
        used_total = await db.promo_code_uses.count_documents({"code": code})
        if used_total >= int(lim):
            return {"status": "used_up", "reason": "Ce code a atteint sa limite d'utilisation."}
    # 3. Limite par utilisateur
    per_user = int(promo.get("usage_per_user", 1))
    used_by_me = await _user_promo_usage(user["id"], code)
    if used_by_me >= per_user:
        return {"status": "not_applicable", "reason": "Vous avez déjà utilisé ce code."}
    # 4. Première réservation seulement
    if promo.get("first_booking_only"):
        n = await _user_bookings_count(user["id"])
        if n > 0:
            return {"status": "not_applicable", "reason": "Réservé aux nouvelles inscriptions (1re réservation)."}
    # 5. Catégorie
    p_cat = promo.get("category") or "all"
    if p_cat != "all" and category and category != p_cat:
        cat_label = {"family": "baby-sitting", "provider": "prestations", "mobility": "mobilité"}.get(p_cat, p_cat)
        return {"status": "not_applicable", "reason": f"Valable uniquement pour {cat_label}."}
    # 6. Montant minimum
    min_a = promo.get("min_amount_xof")
    if min_a and amount is not None and amount < int(min_a):
        return {"status": "not_applicable", "reason": f"Minimum requis : {int(min_a):,} F CFA.".replace(",", " ")}
    # OK — applicable
    result = {"status": "applicable" if amount is not None else "available", "reason": None}
    if amount is not None:
        disc = _compute_discount(promo, int(amount))
        result["discount"] = disc
        result["final_amount"] = max(0, int(amount) - disc)
    return result


async def _apply_promo_to_booking(booking_id: str, code: Optional[str], amount: int, user: dict, category: str = "provider") -> int:
    """Valide et applique un code promo à une réservation.
    - Vérifie l'applicabilité (via _promo_status_for_user)
    - Enregistre l'usage dans `promo_code_uses`
    - Stamp la réservation avec {promo_code, promo_discount_xof, promo_final_xof}
    Retourne : le montant final (int, en F CFA) après réduction. Si code invalide/absent, renvoie `amount` inchangé.
    """
    if not code:
        return amount
    code_up = code.strip().upper()
    p = await db.promo_codes.find_one({"code": code_up}, {"_id": 0})
    if not p:
        return amount
    st = await _promo_status_for_user(p, user, amount=amount, category=category)
    if st.get("status") != "applicable":
        # Non applicable — on ignore silencieusement pour ne pas casser le paiement.
        return amount
    disc = int(st.get("discount") or 0)
    final = int(st.get("final_amount") if st.get("final_amount") is not None else max(0, amount - disc))
    if disc <= 0:
        return amount
    # Record usage
    await db.promo_code_uses.insert_one({
        "id": str(uuid.uuid4()),
        "code": code_up,
        "user_id": user["id"],
        "booking_id": booking_id,
        "amount_xof": amount,
        "discount_xof": disc,
        "final_xof": final,
        "created_at": now_iso(),
    })
    # Stamp booking (both bookings & family_bookings collections)
    stamp = {
        "promo_code": code_up,
        "promo_discount_xof": disc,
        "promo_final_xof": final,
    }
    await db.bookings.update_one({"id": booking_id}, {"$set": stamp})
    await db.family_bookings.update_one({"id": booking_id}, {"$set": stamp})
    return final


@api.get("/promo-codes")
async def list_promo_codes(
    amount: Optional[int] = None,
    category: Optional[str] = None,
    user=Depends(current_user),
):
    """Liste tous les codes promo visibles + leur statut personnalisé pour l'utilisateur.
    Filtres optionnels : amount (contexte checkout), category (family/provider/mobility)."""
    now = now_iso()
    cur = db.promo_codes.find({}, {"_id": 0}).sort("created_at", -1)
    items = await cur.to_list(200)
    out = []
    for p in items:
        if not _promo_code_visible(p, now):
            continue
        st = await _promo_status_for_user(p, user, amount=amount, category=category)
        out.append({**p, **st})
    # Tri : applicable > available > coming_soon > not_applicable > expired/used_up
    prio = {"applicable": 0, "available": 1, "coming_soon": 2, "not_applicable": 3, "used_up": 4, "expired": 5}
    out.sort(key=lambda x: prio.get(x.get("status", "not_applicable"), 9))
    return out


class ValidatePromoIn(BaseModel):
    code: str
    amount: int
    category: Optional[str] = None


@api.post("/promo-codes/validate")
async def validate_promo_code(body: ValidatePromoIn, user=Depends(current_user)):
    code_up = (body.code or "").strip().upper()
    if not code_up:
        raise HTTPException(400, "Code requis")
    p = await db.promo_codes.find_one({"code": code_up}, {"_id": 0})
    if not p:
        return {"valid": False, "status": "not_found", "reason": "Ce code n'existe pas."}
    st = await _promo_status_for_user(p, user, amount=body.amount, category=body.category)
    valid = st.get("status") == "applicable"
    return {
        "valid": valid,
        "code": code_up,
        "title": p.get("title"),
        "description": p.get("description"),
        "discount_type": p.get("discount_type"),
        "discount_value": p.get("discount_value"),
        **st,
    }


# ---------- Admin CRUD ----------
@api.get("/admin/promo-codes")
async def admin_list_promo_codes(user=Depends(require_perm("ads:read"))):
    cur = db.promo_codes.find({}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)


@api.post("/admin/promo-codes")
async def admin_create_promo_code(body: PromoCodeIn, user=Depends(require_perm("ads:write"))):
    code_up = body.code.strip().upper()
    exists = await db.promo_codes.find_one({"code": code_up}, {"_id": 0, "code": 1})
    if exists:
        raise HTTPException(400, "Ce code existe déjà")
    pid = str(uuid.uuid4())
    doc = {"id": pid, **body.model_dump(), "code": code_up, "created_at": now_iso(), "updated_at": now_iso()}
    await db.promo_codes.insert_one(doc)
    # Push broadcast : architecture prête — activation post-store
    return {k: v for k, v in doc.items() if k != "_id"}


# ---------- Partenaires (annuaire léger géré par l'admin) ----------
@api.get("/partners")
async def list_public_partners():
    cur = db.partners.find({"active": True}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(200)


@api.get("/partners/{pid}")
async def get_public_partner(pid: str):
    p = await db.partners.find_one({"id": pid, "active": True}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Partenaire introuvable")
    return p


@api.get("/admin/partners")
async def admin_list_partners(user=Depends(require_perm("ads:read"))):
    cur = db.partners.find({}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)


@api.post("/admin/partners")
async def admin_create_partner(body: PartnerIn, user=Depends(require_perm("ads:write"))):
    pid = str(uuid.uuid4())
    doc = {"id": pid, **body.model_dump(), "created_at": now_iso(), "updated_at": now_iso()}
    await db.partners.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.patch("/admin/partners/{pid}")
async def admin_update_partner(pid: str, body: PartnerIn, user=Depends(require_perm("ads:write"))):
    await db.partners.update_one(
        {"id": pid},
        {"$set": {**body.model_dump(), "updated_at": now_iso()}},
    )
    return {"ok": True}


@api.delete("/admin/partners/{pid}")
async def admin_delete_partner(pid: str, user=Depends(require_perm("ads:write"))):
    await db.partners.delete_one({"id": pid})
    return {"ok": True}


# ---------- campagnes payantes (espaces publicitaires vendus) ----------
@api.post("/ad-campaigns")
async def submit_campaign(body: AdCampaignIn, user=Depends(current_user)):
    cid = str(uuid.uuid4())
    price = CAMPAIGN_PRICES_XOF[body.duration_days]
    doc = {
        "id": cid,
        "author_id": user["id"],
        "advertiser_name": body.advertiser_name,
        "advertiser_email": body.advertiser_email,
        "advertiser_phone": body.advertiser_phone,
        "ad": body.ad.model_dump(),
        "duration_days": body.duration_days,
        "amount_xof": price,
        "status": "pending",
        "paid": False,
        "created_at": now_iso(),
    }
    await db.ad_campaigns.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/admin/ad-campaigns")
async def admin_list_campaigns(user=Depends(require_perm("ads:read"))):
    cur = db.ad_campaigns.find({}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)


@api.patch("/admin/ad-campaigns/{cid}")
async def admin_update_campaign(cid: str, body: dict, user=Depends(require_perm("ads:write"))):
    c = await db.ad_campaigns.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Campagne introuvable")
    status_ = body.get("status")
    updates = {"updated_at": now_iso()}
    if status_ == "approved":
        # Provisionne une publicité active pour la durée de la campagne
        starts = datetime.now(timezone.utc)
        ends = starts + timedelta(days=c["duration_days"])
        ad_doc = {
            "id": str(uuid.uuid4()),
            **c["ad"],
            "start_at": starts.isoformat(),
            "end_at": ends.isoformat(),
            "active": True,
            "suspended": False,
            "impressions": 0,
            "clicks": 0,
            "campaign_id": cid,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.ads.insert_one(ad_doc)
        updates.update({"status": "active", "paid": True, "ad_id": ad_doc["id"], "starts_at": starts.isoformat(), "ends_at": ends.isoformat()})
    elif status_ in ("rejected", "expired"):
        updates["status"] = status_
    else:
        raise HTTPException(400, "status invalide")
    await db.ad_campaigns.update_one({"id": cid}, {"$set": updates})
    return {"ok": True}


# ---------- sponsorisation prestataires ----------
DEFAULT_SPONSOR_PRICES_XOF: dict[int, int] = {7: 5000, 15: 10000, 30: 18000}


async def _get_sponsor_prices() -> dict[int, int]:
    """Récupère les tarifs de sponsorisation depuis `system_settings`. Fallback = défauts."""
    doc = await db.system_settings.find_one({"key": "sponsorship_prices"}, {"_id": 0})
    if not doc or not isinstance(doc.get("value"), dict):
        return dict(DEFAULT_SPONSOR_PRICES_XOF)
    out: dict[int, int] = {}
    for k, v in doc["value"].items():
        try:
            days = int(k)
            price = int(v)
            if days in (7, 15, 30) and price > 0:
                out[days] = price
        except Exception:
            continue
    # Complète les jours manquants avec les défauts
    for d, p in DEFAULT_SPONSOR_PRICES_XOF.items():
        out.setdefault(d, p)
    return out


@api.get("/sponsorships/prices")
async def sponsor_prices():
    """Tarifs publics utilisés par l'écran /sponsor côté prestataire."""
    prices = await _get_sponsor_prices()
    return [{"duration_days": k, "amount_xof": v} for k, v in sorted(prices.items())]


@api.get("/admin/sponsorships/prices")
async def admin_sponsor_prices(user=Depends(current_user)):
    """Retourne les prix courants (admin)."""
    require_admin(user)
    prices = await _get_sponsor_prices()
    return {"prices": prices, "defaults": DEFAULT_SPONSOR_PRICES_XOF}


@api.put("/admin/sponsorships/prices")
async def admin_update_sponsor_prices(body: dict, user=Depends(current_user)):
    """Met à jour les tarifs de sponsorisation.
    Body attendu: { "7": 5000, "15": 10000, "30": 18000 } (montants XOF, > 0).
    """
    require_admin(user)
    incoming = body.get("prices") if isinstance(body.get("prices"), dict) else body
    cleaned: dict[str, int] = {}
    for k, v in (incoming or {}).items():
        try:
            days = int(k)
            price = int(v)
        except Exception:
            raise HTTPException(400, "Format invalide : jours et prix doivent être des entiers")
        if days not in (7, 15, 30):
            raise HTTPException(400, "Durées autorisées: 7, 15 ou 30 jours")
        if price <= 0 or price > 10_000_000:
            raise HTTPException(400, "Montant invalide (1 - 10 000 000 XOF)")
        cleaned[str(days)] = price
    if not cleaned:
        raise HTTPException(400, "Aucun tarif fourni")
    await db.system_settings.update_one(
        {"key": "sponsorship_prices"},
        {"$set": {"key": "sponsorship_prices", "value": cleaned, "updated_at": now_iso(), "updated_by": user["id"]}},
        upsert=True,
    )
    return {"ok": True, "prices": await _get_sponsor_prices()}


@api.post("/sponsorships")
async def request_sponsorship(body: SponsorshipIn, user=Depends(current_user)):
    if user.get("active_role") != "prestataire" and user.get("role") != "prestataire":
        raise HTTPException(403, "Prestataire uniquement")
    prices = await _get_sponsor_prices()
    if body.duration_days not in prices:
        raise HTTPException(400, "Durée invalide (7, 15 ou 30 jours)")
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "provider_id": user["id"],
        "provider_name": user["name"],
        "duration_days": body.duration_days,
        "amount_xof": prices[body.duration_days],
        "status": "pending_payment",  # pending_payment | active | expired | rejected
        "starts_at": None,
        "ends_at": None,
        "paid": False,
        "payment_provider": None,
        "payment_reference": None,
        "created_at": now_iso(),
    }
    await db.sponsorships.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


def _activate_sponsorship_sync_doc(s: dict) -> dict:
    """Retourne les champs à setter pour activer une sponsorisation payée."""
    starts = datetime.now(timezone.utc)
    ends = starts + timedelta(days=int(s.get("duration_days", 7)))
    return {
        "status": "active",
        "paid": True,
        "starts_at": starts.isoformat(),
        "ends_at": ends.isoformat(),
        "activated_at": now_iso(),
    }


async def _activate_sponsorship(sid: str, provider: str) -> dict:
    """Active un dossier de sponsorship payé et met à jour le provider (sponsored_until).
    Retourne le doc final."""
    s = await db.sponsorships.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Sponsorship introuvable")
    if s.get("status") == "active" and s.get("ends_at"):
        return s  # déjà actif
    updates = _activate_sponsorship_sync_doc(s)
    updates["payment_provider"] = provider
    await db.sponsorships.update_one({"id": sid}, {"$set": updates})
    await db.providers.update_one(
        {"id": s["provider_id"]},
        {"$set": {"sponsored_until": updates["ends_at"]}},
    )
    # Notification interne
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": s["provider_id"],
        "type": "sponsorship_active",
        "title": "Sponsorisation activée 🚀",
        "body": f"Votre profil est mis en avant jusqu'au {updates['ends_at'][:10]}.",
        "read": False,
        "created_at": now_iso(),
    })
    # Push mobile — non-bloquant
    try:
        await send_push(
            recipients=[s["provider_id"]],
            data={
                "title": "Sponsorisation activée 🚀",
                "message": f"Votre profil est mis en avant jusqu'au {updates['ends_at'][:10]}.",
                "action_url": "/sponsor",
            },
        )
    except Exception as e:
        log.warning(f"Push failed (non-blocking): {e}")
    return {**s, **updates}


async def _expire_stale_sponsorships() -> int:
    """Passe en `expired` toutes les sponsorisations actives dont `ends_at` est dépassé.
    Retourne le nombre d'enregistrements mis à jour. Idempotent, safe à appeler souvent."""
    now = now_iso()
    cur = db.sponsorships.find(
        {"status": "active", "ends_at": {"$ne": None, "$lt": now}},
        {"_id": 0, "id": 1, "provider_id": 1},
    )
    stale = await cur.to_list(500)
    for s in stale:
        await db.sponsorships.update_one(
            {"id": s["id"]},
            {"$set": {"status": "expired", "expired_at": now}},
        )
        await db.providers.update_one(
            {"id": s["provider_id"]},
            {"$unset": {"sponsored_until": ""}},
        )
    return len(stale)


@api.post("/sponsorships/{sid}/checkout")
async def sponsorship_checkout(sid: str, body: dict, user=Depends(current_user)):
    """Crée une session de paiement (Stripe / Wave / Orange) pour une sponsorisation
    pending. Retourne l'URL de paiement à ouvrir côté client.
    Body: { "provider": "card"|"wave"|"orange" }
    """
    s = await db.sponsorships.find_one({"id": sid}, {"_id": 0})
    if not s or s["provider_id"] != user["id"]:
        raise HTTPException(404, "Sponsorship introuvable")
    if s.get("paid"):
        raise HTTPException(400, "Sponsorisation déjà payée")
    provider = (body.get("provider") or "card").strip().lower()
    amount = int(s["amount_xof"])
    if provider == "card":
        try:
            req = CheckoutSessionRequest(
                amount=float(amount),
                currency="xof",
                success_url=f"{APP_URL}/sponsor/success?session_id={{CHECKOUT_SESSION_ID}}&sid={sid}",
                cancel_url=f"{APP_URL}/sponsor",
                metadata={"kind": "sponsorship", "sponsorship_id": sid, "user_id": user["id"]},
            )
            session = await _require_stripe().create_checkout_session(req)
            await db.sponsorships.update_one(
                {"id": sid},
                {"$set": {"stripe_session_id": session.session_id, "payment_provider": "card"}},
            )
            return {"url": session.url, "session_id": session.session_id}
        except HTTPException:
            raise
        except Exception as e:
            log.exception("stripe sponsor checkout failed")
            raise HTTPException(500, f"Paiement indisponible: {e}")
    elif provider == "wave":
        session = await wave_create_checkout(
            amount_xof=amount,
            success_url=f"{APP_URL}/api/payments/wave/return?sponsorship_id={sid}",
            error_url=f"{APP_URL}/sponsor",
            client_reference=f"sponsorship:{sid}",
        )
        await db.sponsorships.update_one(
            {"id": sid},
            {"$set": {"wave_session_id": session.get("id"), "payment_provider": "wave"}},
        )
        return {"url": session.get("wave_launch_url"), "session_id": session.get("id")}
    elif provider == "orange":
        order_id = f"jokoo-sponsor-{sid}"
        r = await om_create_webpayment(
            amount_xof=amount,
            order_id=order_id,
            return_url=f"{APP_URL}/api/payments/orange/return?sponsorship_id={sid}",
            cancel_url=f"{APP_URL}/sponsor",
            notif_url=f"{APP_URL}/api/payments/orange/notify",
            reference="Jokoo Boost",
        )
        await db.sponsorships.update_one(
            {"id": sid},
            {"$set": {
                "orange_order_id": order_id,
                "om_pay_token": r.get("pay_token"),
                "om_notif_token": r.get("notif_token"),
                "payment_provider": "orange",
            }},
        )
        return {"url": r.get("payment_url"), "pay_token": r.get("pay_token")}
    raise HTTPException(400, "Fournisseur invalide (card|wave|orange)")


@api.post("/sponsorships/{sid}/verify")
async def sponsorship_verify(sid: str, body: dict, user=Depends(current_user)):
    """Confirme côté serveur qu'une session Stripe est payée puis active la
    sponsorisation. Body: { "session_id": "..." }. Idempotent."""
    s = await db.sponsorships.find_one({"id": sid}, {"_id": 0})
    if not s or s["provider_id"] != user["id"]:
        raise HTTPException(404, "Sponsorship introuvable")
    if s.get("paid"):
        # Déjà activé — retourne l'état
        return await db.sponsorships.find_one({"id": sid}, {"_id": 0})
    session_id = (body.get("session_id") or "").strip()
    if not session_id:
        raise HTTPException(400, "session_id requis")
    try:
        status_resp = await _require_stripe().get_checkout_status(session_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Vérification paiement impossible: {e}")
    if not (status_resp.payment_status == "paid" or getattr(status_resp, "status", "") == "complete"):
        return {"paid": False, "status": status_resp.payment_status}
    updated = await _activate_sponsorship(sid, provider="card")
    return {"paid": True, "sponsorship": updated}


@api.get("/sponsorships/mine")
async def my_sponsorships(user=Depends(current_user)):
    await _expire_stale_sponsorships()
    cur = db.sponsorships.find({"provider_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(50)


@api.get("/admin/sponsorships")
async def admin_list_sponsorships(user=Depends(current_user)):
    require_admin(user)
    await _expire_stale_sponsorships()
    cur = db.sponsorships.find({}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)


@api.patch("/admin/sponsorships/{sid}")
async def admin_update_sponsorship(
    sid: str,
    body: dict,
    user=Depends(current_user),
):
    """Actions admin :
      - `gift`   : offre la sponsorisation sans paiement (traçable).
      - `reject` : refuse la demande (avec motif optionnel).
      - `expire` : force l'expiration immédiate.
    """
    require_admin(user)
    s = await db.sponsorships.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Introuvable")
    action = (body.get("status") or body.get("action") or "").lower()
    updates: dict = {"updated_at": now_iso(), "reviewed_by": user["id"], "reviewed_by_name": user.get("name")}
    if action in ("gift", "approved"):
        upd = _activate_sponsorship_sync_doc(s)
        upd["payment_provider"] = "admin_gift"
        upd["gifted_by"] = user["id"]
        updates.update(upd)
        await db.providers.update_one(
            {"id": s["provider_id"]},
            {"$set": {"sponsored_until": upd["ends_at"]}},
        )
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": s["provider_id"],
            "type": "sponsorship_gifted",
            "title": "Sponsorisation offerte 🎁",
            "body": "L'équipe Jokoo vous a offert une mise en avant.",
            "read": False,
            "created_at": now_iso(),
        })
        # Push mobile — non-bloquant
        try:
            await send_push(
                recipients=[s["provider_id"]],
                data={
                    "title": "Sponsorisation offerte 🎁",
                    "message": f"L'équipe Jokoo vous a offert un boost jusqu'au {upd['ends_at'][:10]}.",
                    "action_url": "/sponsor",
                },
            )
        except Exception as e:
            log.warning(f"Push failed (non-blocking): {e}")
    elif action in ("rejected", "reject"):
        updates.update({"status": "rejected", "rejection_reason": body.get("reason")})
    elif action in ("expired", "expire"):
        updates.update({"status": "expired", "ends_at": now_iso()})
        await db.providers.update_one({"id": s["provider_id"]}, {"$unset": {"sponsored_until": ""}})
    else:
        raise HTTPException(400, "Action invalide (gift|reject|expire)")
    await db.sponsorships.update_one({"id": sid}, {"$set": updates})
    return {"ok": True}



# ---------- staff (super_admin) ----------
def _safe_user(u: dict) -> dict:
    return {k: v for k, v in u.items() if k not in ("_id", "password_hash")}


@api.get("/admin/roles")
async def list_roles(user=Depends(current_user)):
    require_admin(user)
    return {
        "roles": [{"key": k, "permissions": v} for k, v in ROLE_PERMS.items()],
    }


@api.get("/admin/staff")
async def list_staff(user=Depends(require_super_admin)):
    cur = db.users.find(
        {"$or": [{"staff_role": {"$ne": None}}, {"is_admin": True}]},
        {"_id": 0, "password_hash": 0},
    ).sort("created_at", -1)
    return await cur.to_list(500)


@api.post("/admin/staff")
async def create_staff(body: StaffIn, user=Depends(require_super_admin)):
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(400, "Email déjà utilisé")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": body.email.lower(),
        "password_hash": await hash_password_async(body.password),
        "name": body.name,
        "role": "client",  # staff = compte technique côté app
        "is_admin": body.staff_role == "super_admin",
        "staff_role": body.staff_role,
        "permissions": body.permissions or [],
        "active": True,
        "phone": body.phone,
        "city": "Dakar",
        "avatar": None,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    return _safe_user(doc)


@api.patch("/admin/staff/{sid}")
async def update_staff(sid: str, body: StaffUpdate, user=Depends(require_super_admin)):
    u = await db.users.find_one({"id": sid})
    if not u or not (u.get("staff_role") or u.get("is_admin")):
        raise HTTPException(404, "Membre introuvable")
    updates: dict = {"updated_at": now_iso()}
    if body.name is not None: updates["name"] = body.name
    if body.staff_role is not None:
        updates["staff_role"] = body.staff_role
        updates["is_admin"] = body.staff_role == "super_admin"
    if body.permissions is not None: updates["permissions"] = body.permissions
    if body.active is not None: updates["active"] = body.active
    await db.users.update_one({"id": sid}, {"$set": updates})
    return {"ok": True}


@api.delete("/admin/staff/{sid}")
async def delete_staff(sid: str, user=Depends(require_super_admin)):
    if sid == user["id"]:
        raise HTTPException(400, "Impossible de se supprimer soi-même")
    await db.users.delete_one({"id": sid})
    return {"ok": True}


# ---------- inscription assistée (opérateur) ----------
def _gen_otp() -> str:
    # SEC : utiliser secrets (CSPRNG) et non random (Mersenne-Twister prédictible)
    import secrets
    return f"{secrets.randbelow(1000000):06d}"


@api.post("/admin/assisted-register")
async def assisted_register(body: AssistedRegisterIn, user=Depends(require_perm("operator:create_account"))):
    existing = None
    if body.email:
        existing = await db.users.find_one({"email": body.email.lower()})
    if not existing:
        existing = await db.users.find_one({"phone": body.phone})
    if existing:
        raise HTTPException(400, "Un compte existe déjà avec ce téléphone ou cet email")
    uid = str(uuid.uuid4())
    temp_pwd = body.temp_password or _gen_otp()
    doc = {
        "id": uid,
        "email": (body.email or f"{body.phone.replace('+', '')}@jokooservices.com").lower(),
        "password_hash": await hash_password_async(temp_pwd),
        "name": body.name,
        "role": body.role,
        "phone": body.phone,
        "city": body.city or "Dakar",
        "avatar": None,
        "is_admin": False,
        "staff_role": None,
        "permissions": [],
        "created_by_operator": user["id"],
        "assisted": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    return {
        "user": _safe_user(doc),
        # En prod: envoyé par SMS via Twilio/Orange SMS API. Ici on retourne pour test.
        "temp_password_or_otp": temp_pwd,
    }


@api.post("/auth/otp/request")
async def otp_request(body: OtpRequestIn, request: Request):
    ip = _client_ip(request)
    _rate_check(f"otp-req-ip:{ip}", max_hits=10, window_sec=3600)
    _rate_check(f"otp-req-phone:{body.phone}", max_hits=5, window_sec=3600)
    user = await db.users.find_one({"phone": body.phone})
    # SEC-001 : NE PAS révéler l'existence du compte. Toujours retourner un
    # succès générique. Ne créer/renouveler l'OTP que si le compte existe,
    # mais en silence côté client.
    if user:
        code = _gen_otp()
        await db.otps.update_one(
            {"phone": body.phone},
            {"$set": {
                "phone": body.phone,
                "code": code,
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
                "user_id": user["id"],
                "created_at": now_iso(),
            }},
            upsert=True,
        )
        # Prod: envoyer via SMS. Le code ne DOIT JAMAIS quitter le serveur
        # dans la réponse HTTP. En dev uniquement (DEBUG=true), on peut
        # exposer le code pour faciliter les tests locaux.
        if os.environ.get("DEBUG", "").lower() in ("1", "true", "yes"):
            return {"ok": True, "otp_dev_only": code}
    return {"ok": True}


@api.post("/auth/otp/verify", response_model=AuthOut)
async def otp_verify(body: OtpVerifyIn, request: Request):
    ip = _client_ip(request)
    _rate_check(f"otp-verify-ip:{ip}", max_hits=20, window_sec=3600)
    _rate_check(f"otp-verify-phone:{body.phone}", max_hits=10, window_sec=3600)
    rec = await db.otps.find_one({"phone": body.phone}, {"_id": 0})
    if not rec or rec["code"] != body.code:
        raise HTTPException(401, "Code OTP invalide")
    if rec.get("expires_at") and rec["expires_at"] < now_iso():
        raise HTTPException(401, "Code OTP expiré")
    user = await db.users.find_one({"id": rec["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    await db.otps.delete_one({"phone": body.phone})
    token = make_token(user["id"], token_version=int(user.get("token_version") or 0))
    return {"token": token, "user": user}


# ---------- support: password reset ----------
@api.post("/admin/users/{uid}/reset-password")
async def reset_user_password(uid: str, body: PasswordResetIn, user=Depends(require_perm("passwords:reset"))):
    u = await db.users.find_one({"id": uid})
    if not u:
        raise HTTPException(404, "Utilisateur introuvable")
    new_pwd = body.new_password or _gen_otp()
    # SEC : invalider toutes les sessions existantes du user en incrémentant token_version
    await db.users.update_one(
        {"id": uid},
        {"$set": {"password_hash": await hash_password_async(new_pwd), "password_changed_at": now_iso(), "updated_at": now_iso()},
         "$inc": {"token_version": 1}},
    )
    audit_log("auth.admin_reset_password", user_id=uid, target=uid, by=user["id"])
    return {"ok": True, "new_password": new_pwd}


# ---------- signalements / réclamations (support) ----------
@api.get("/admin/reports")
async def list_reports(status_filter: Optional[str] = None, user=Depends(require_perm("reports:handle"))):
    """Liste des signalements. Filtre optionnel par statut : open|investigating|awaiting_reporter_confirm|resolved|dismissed|escalated."""
    q: dict = {}
    if status_filter and status_filter != "all":
        q["status"] = status_filter
    items = await db.reports.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Hydratation légère : nom + téléphone de l'auteur et de la cible (si user)
    user_ids = set()
    for r in items:
        if r.get("author_id"): user_ids.add(r["author_id"])
        if r.get("target_type") == "user" and r.get("target_id"): user_ids.add(r["target_id"])
    users_map: dict = {}
    if user_ids:
        async for u in db.users.find({"id": {"$in": list(user_ids)}}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1}):
            users_map[u["id"]] = u
    for r in items:
        au = users_map.get(r.get("author_id"))
        if au:
            r["author_phone"] = au.get("phone")
            r["author_email"] = au.get("email")
        tu = users_map.get(r.get("target_id")) if r.get("target_type") == "user" else None
        if tu:
            r["target_name"] = tu.get("name")
            r["target_phone"] = tu.get("phone")
    return items


@api.get("/admin/reports/stats")
async def reports_stats(user=Depends(require_perm("reports:handle"))):
    """Aperçu synthétique pour le hub Signalements."""
    pipeline = [{"$group": {"_id": "$status", "n": {"$sum": 1}}}]
    counts = {c["_id"]: c["n"] async for c in db.reports.aggregate(pipeline)}
    total = sum(counts.values())
    return {
        "total": total,
        "open": counts.get("open", 0),
        "investigating": counts.get("investigating", 0),
        "resolved": counts.get("resolved", 0),
        "dismissed": counts.get("dismissed", 0),
        "escalated": counts.get("escalated", 0),
    }


@api.post("/reports")
async def create_report(body: dict, user=Depends(current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "author_id": user["id"],
        "author_name": user["name"],
        "target_id": body.get("target_id"),
        "target_type": body.get("target_type", "provider"),
        "reason": body.get("reason", ""),
        "status": "open",
        "priority": body.get("priority", "normal"),  # normal | high | urgent
        "history": [{
            "at": now_iso(),
            "by_id": user["id"],
            "by_name": user["name"],
            "action": "created",
            "note": "Signalement créé",
        }],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.reports.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.post("/reports/{rid}/confirm-resolution")
async def reporter_confirm_resolution(rid: str, body: dict, user=Depends(current_user)):
    """
    Le déclarant confirme (ou non) la résolution proposée par le support.
    Body : `{ resolved: bool, note?: str }`.
    - resolved=True → status = resolved (fin de la boucle)
    - resolved=False → status = open + note pour rebond côté support
    """
    r = await db.reports.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Signalement introuvable")
    if r.get("author_id") != user["id"]:
        raise HTTPException(403, "Seul le déclarant peut confirmer")
    if r.get("status") != "awaiting_reporter_confirm":
        raise HTTPException(400, "Ce signalement n'attend pas de confirmation")
    resolved = bool(body.get("resolved"))
    note = (body.get("note") or "").strip()
    new_status = "resolved" if resolved else "open"
    entry = {
        "at": now_iso(),
        "by_id": user["id"],
        "by_name": user["name"],
        "action": "reporter_confirmed" if resolved else "reporter_rejected",
        "note": note,
    }
    updates = {"status": new_status, "updated_at": now_iso()}
    if resolved:
        updates["resolved_by_reporter"] = True
        updates["resolved_at"] = now_iso()
    await db.reports.update_one(
        {"id": rid},
        {"$set": updates, "$push": {"history": entry}},
    )
    # Notif support qui a demandé la confirmation (si connu)
    resolver = r.get("resolved_by") or (r.get("history") or [{}])[-1].get("by_id")
    if resolver:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": resolver,
            "type": "report_confirmed" if resolved else "report_reopened",
            "title": "Signalement clos par le déclarant" if resolved else "Signalement rouvert par le déclarant",
            "body": note or ("Le déclarant confirme la résolution." if resolved else "Le déclarant estime que le problème n'est pas résolu."),
            "report_id": rid,
            "read": False,
            "created_at": now_iso(),
        })
    return {"ok": True, "status": new_status}


VALID_REPORT_STATUS = {"open", "investigating", "awaiting_reporter_confirm", "resolved", "dismissed", "escalated"}


@api.patch("/admin/reports/{rid}")
async def update_report(rid: str, body: dict, user=Depends(require_perm("reports:handle"))):
    """Met à jour un signalement.

    Payload : `{status?, note?, priority?, assigned_to?}`
    Toute action alimente l'historique (timeline visible côté admin).
    """
    existing = await db.reports.find_one({"id": rid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Signalement introuvable")

    new_status = body.get("status")
    if new_status and new_status not in VALID_REPORT_STATUS:
        raise HTTPException(400, f"Statut invalide. Utilisez : {sorted(VALID_REPORT_STATUS)}")

    updates: dict = {"updated_at": now_iso()}
    history_entries = []

    if new_status and new_status != existing.get("status"):
        updates["status"] = new_status
        if new_status in ("resolved", "dismissed"):
            updates["resolved_by"] = user["id"]
            updates["resolved_by_name"] = user["name"]
            updates["resolved_at"] = now_iso()
        if new_status == "awaiting_reporter_confirm":
            # Notif au déclarant pour qu'il valide (ou pas) la résolution proposée
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": existing.get("author_id"),
                "type": "report_awaiting_confirm",
                "title": "Votre signalement a été traité",
                "body": "L'équipe support propose de clore. Merci de confirmer si votre problème est résolu.",
                "peer_id": user["id"],
                "report_id": rid,
                "read": False,
                "created_at": now_iso(),
            })
        history_entries.append({
            "at": now_iso(),
            "by_id": user["id"],
            "by_name": user["name"],
            "action": "status_changed",
            "from": existing.get("status", "open"),
            "to": new_status,
            "note": body.get("note") or "",
        })

    new_priority = body.get("priority")
    if new_priority and new_priority != existing.get("priority"):
        if new_priority not in {"normal", "high", "urgent"}:
            raise HTTPException(400, "Priorité invalide (normal|high|urgent)")
        updates["priority"] = new_priority
        history_entries.append({
            "at": now_iso(),
            "by_id": user["id"],
            "by_name": user["name"],
            "action": "priority_changed",
            "from": existing.get("priority", "normal"),
            "to": new_priority,
        })

    assign_to = body.get("assigned_to")
    if assign_to is not None and assign_to != existing.get("assigned_to"):
        assignee = await db.users.find_one({"id": assign_to}, {"_id": 0, "name": 1}) if assign_to else None
        updates["assigned_to"] = assign_to
        updates["assigned_to_name"] = assignee.get("name") if assignee else None
        history_entries.append({
            "at": now_iso(),
            "by_id": user["id"],
            "by_name": user["name"],
            "action": "assigned",
            "to": assignee.get("name") if assignee else "—",
        })

    note = (body.get("note") or "").strip()
    # Note « pure » (sans changement de status) : on l'ajoute quand même à l'historique
    if note and not new_status:
        history_entries.append({
            "at": now_iso(),
            "by_id": user["id"],
            "by_name": user["name"],
            "action": "note",
            "note": note,
        })

    if not history_entries:
        # Rien à faire → on renvoie une erreur claire (l'admin voulait probablement sauver mais rien n'a bougé)
        raise HTTPException(400, "Aucune modification détectée. Modifiez le statut, la priorité ou ajoutez une note.")

    await db.reports.update_one(
        {"id": rid},
        {
            "$set": updates,
            "$push": {"history": {"$each": history_entries}},
        },
    )
    fresh = await db.reports.find_one({"id": rid}, {"_id": 0})
    return fresh


# ---------- Account deletion (Apple App Store 5.1.1(v)) ----------
# ─────────────────────────────────────────────────────────────────────────────
# KYC — Vérification d'identité des prestataires (Know Your Customer)
# ─────────────────────────────────────────────────────────────────────────────
#
# Flow :
#   1. Le prestataire uploade recto / verso / selfie via Cloudinary (frontend),
#      puis POST /api/kyc-requests avec les URLs pour créer la demande.
#   2. L'admin voit la file d'attente via GET /api/admin/kyc-requests?status=pending.
#   3. L'admin approve ou reject via POST /api/admin/kyc-requests/{id}/approve|reject.
#   4. Sur approve : provider.verified=true, notification "Compte vérifié ✅".
#   5. Sur reject : notification avec le motif, le user peut ré-uploader (nouvelle
#      demande, version incrémentée). Aucune données ne quitte le serveur.
#
# Sécurité :
#   - URLs Cloudinary stockées, jamais renvoyées à des tiers.
#   - GET des documents restreint : le propriétaire OU un admin (require_perm("kyc:read")).
#   - Suppression du compte : les KYC rattachés sont supprimés (cf. delete_my_account).

class KycSubmitIn(BaseModel):
    id_type: str = Field(..., pattern="^(cni|passport|drivers_licence)$")
    doc_front: str = Field(..., min_length=8, max_length=2000)
    doc_back: Optional[str] = Field(None, max_length=2000)
    selfie: str = Field(..., min_length=8, max_length=2000)

    @field_validator("doc_front", "doc_back", "selfie", mode="before")
    @classmethod
    def _must_be_url(cls, v):
        if v is None or v == "":
            return None
        s = str(v).strip()
        if not (s.startswith("https://") or s.startswith("http://")):
            raise ValueError("URL Cloudinary attendue (https).")
        if len(s) > 2000:
            raise ValueError("URL trop longue.")
        return s


class KycDecisionIn(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)


@api.post("/kyc-requests", status_code=201)
async def submit_kyc_request(body: KycSubmitIn, user=Depends(current_user)):
    """Le prestataire soumet ses documents. Une seule demande active à la fois :
    si une demande est en 'pending' ou 'more_info', elle est mise à jour (version++).
    """
    # Passeport : doc_back optionnel
    if body.id_type != "passport" and not body.doc_back:
        raise HTTPException(400, "Le verso de la pièce est requis pour ce type de document.")

    existing = await db.kyc_requests.find_one(
        {"user_id": user["id"], "status": {"$in": ["pending", "more_info"]}},
        {"_id": 0},
    )
    now = now_iso()
    if existing:
        # Ré-soumission : mise à jour + version++
        version = int(existing.get("version", 1)) + 1
        await db.kyc_requests.update_one(
            {"id": existing["id"]},
            {
                "$set": {
                    "id_type": body.id_type,
                    "doc_front": body.doc_front,
                    "doc_back": body.doc_back,
                    "selfie": body.selfie,
                    "status": "pending",
                    "rejection_reason": None,
                    "version": version,
                    "submitted_at": now,
                    "updated_at": now,
                }
            },
        )
        doc = await db.kyc_requests.find_one({"id": existing["id"]}, {"_id": 0})
    else:
        kyc_id = str(uuid.uuid4())
        doc = {
            "id": kyc_id,
            "user_id": user["id"],
            "user_name": user.get("name"),
            "user_email": user.get("email"),
            "id_type": body.id_type,
            "doc_front": body.doc_front,
            "doc_back": body.doc_back,
            "selfie": body.selfie,
            "status": "pending",
            "rejection_reason": None,
            "version": 1,
            "submitted_at": now,
            "reviewed_at": None,
            "reviewed_by": None,
            "created_at": now,
            "updated_at": now,
        }
        await db.kyc_requests.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/kyc-requests/mine")
async def my_kyc_request(user=Depends(current_user)):
    """Retourne la dernière demande KYC de l'utilisateur (peu importe le status)."""
    doc = await db.kyc_requests.find_one(
        {"user_id": user["id"]},
        {"_id": 0},
        sort=[("submitted_at", -1)],
    )
    return doc or {"status": "none"}


# ────────── ADMIN — file d'attente et décisions ──────────
@api.get("/admin/kyc-requests")
async def admin_list_kyc(
    status_filter: Optional[str] = Query(None, alias="status"),
    q: Optional[str] = None,
    limit: int = 100,
    user=Depends(require_perm("kyc:read")),
):
    query: dict = {}
    if status_filter in ("pending", "approved", "rejected", "more_info"):
        query["status"] = status_filter
    if q and q.strip():
        rx = _safe_regex(q.strip())
        query["$or"] = [
            {"user_name": {"$regex": rx, "$options": "i"}},
            {"user_email": {"$regex": rx, "$options": "i"}},
        ]
    cursor = db.kyc_requests.find(query, {"_id": 0}).sort("submitted_at", -1).limit(min(max(1, limit), 200))
    return [d async for d in cursor]


@api.get("/admin/kyc-requests/stats")
async def admin_kyc_stats(user=Depends(require_perm("kyc:read"))):
    pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    out = {"pending": 0, "approved": 0, "rejected": 0, "more_info": 0, "total": 0}
    async for row in db.kyc_requests.aggregate(pipeline):
        key = row.get("_id") or "unknown"
        cnt = int(row.get("count", 0))
        out[key] = cnt
        out["total"] += cnt
    return out


@api.get("/admin/kyc-requests/{kyc_id}")
async def admin_get_kyc(kyc_id: str, user=Depends(require_perm("kyc:read"))):
    doc = await db.kyc_requests.find_one({"id": kyc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Demande KYC introuvable")
    return doc


@api.post("/admin/kyc-requests/{kyc_id}/approve")
async def admin_approve_kyc(kyc_id: str, user=Depends(require_perm("kyc:write"))):
    doc = await db.kyc_requests.find_one({"id": kyc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Demande KYC introuvable")
    if doc["status"] == "approved":
        return {"ok": True, "status": "approved", "already": True}
    now = now_iso()
    await db.kyc_requests.update_one(
        {"id": kyc_id},
        {"$set": {
            "status": "approved",
            "rejection_reason": None,
            "reviewed_at": now,
            "reviewed_by": user["id"],
            "reviewed_by_name": user.get("name"),
            "updated_at": now,
        }},
    )
    # Propage sur le profil provider
    await db.providers.update_many(
        {"user_id": doc["user_id"]},
        {"$set": {"verified": True, "identity_verified": True, "verified_at": now}},
    )
    await db.babysitters.update_many(
        {"user_id": doc["user_id"]},
        {"$set": {"identity_verified": True, "verified_at": now}},
    )
    # Notification interne au prestataire
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": doc["user_id"],
        "type": "kyc_approved",
        "title": "Compte vérifié ✅",
        "body": "Votre identité a été vérifiée. Le badge Vérifié apparaît maintenant sur votre profil.",
        "read": False,
        "created_at": now,
    })
    # Push mobile — non-bloquant
    try:
        await send_push(
            recipients=[doc["user_id"]],
            data={
                "title": "Compte vérifié ✅",
                "message": "Votre identité a été vérifiée. Le badge Vérifié est actif.",
                "action_url": "/provider/verification",
            },
        )
    except Exception as e:
        log.warning(f"Push failed (non-blocking): {e}")
    # Jokoo Partners — signale au module ambassadors que ce user est KYC-OK
    try:
        await _amb_hook_kyc_verified(db, doc["user_id"], notify=send_push)
    except Exception as _amb_err:
        log.debug("ambassador kyc hook failed: %s", _amb_err)
    return {"ok": True, "status": "approved"}


@api.post("/admin/kyc-requests/{kyc_id}/reject")
async def admin_reject_kyc(kyc_id: str, body: KycDecisionIn, user=Depends(require_perm("kyc:write"))):
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(400, "Un motif de refus est requis.")
    if len(reason) < 5:
        raise HTTPException(400, "Motif trop court (5 caractères minimum).")
    doc = await db.kyc_requests.find_one({"id": kyc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Demande KYC introuvable")
    now = now_iso()
    await db.kyc_requests.update_one(
        {"id": kyc_id},
        {"$set": {
            "status": "rejected",
            "rejection_reason": reason,
            "reviewed_at": now,
            "reviewed_by": user["id"],
            "reviewed_by_name": user.get("name"),
            "updated_at": now,
        }},
    )
    # NE PAS retirer un badge déjà accordé sur des versions précédentes,
    # sauf si le refus concerne le premier dossier (verified=False par défaut).
    # Ici on garde verified inchangé côté provider.
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": doc["user_id"],
        "type": "kyc_rejected",
        "title": "Vérification refusée",
        "body": f"Motif : {reason}. Vous pouvez ré-uploader vos documents depuis votre profil.",
        "read": False,
        "created_at": now,
    })
    # Push mobile — non-bloquant
    try:
        await send_push(
            recipients=[doc["user_id"]],
            data={
                "title": "Vérification refusée",
                "message": f"Motif : {reason[:120]}",
                "action_url": "/provider/verification",
            },
        )
    except Exception as e:
        log.warning(f"Push failed (non-blocking): {e}")
    return {"ok": True, "status": "rejected"}



@api.delete("/users/me")
async def delete_my_account(user=Depends(current_user)):
    """Suppression de compte en 1 clic — exigence Apple 5.1.1(v) et Google Play.
    Supprime les données personnelles et anonymise les données historiques.
    Révoque également le refresh_token Apple si l'utilisateur s'est connecté via
    Sign in with Apple (obligation Apple 5.1.1(v) sur la révocation de tokens).
    """
    uid = user["id"]
    # ── Étape 1 : Apple Sign-In token revocation (best-effort, avant suppression)
    # Doit être appelé AVANT de supprimer le doc utilisateur pour lire le refresh_token.
    # Si Apple est down ou credentials manquants, la suppression continue quand même.
    try:
        full_user = await db.users.find_one({"id": uid}, {"apple_refresh_token": 1, "apple_sub": 1})
        apple_refresh_token = (full_user or {}).get("apple_refresh_token")
        if apple_refresh_token:
            await _apple_revoke_token(apple_refresh_token)
    except Exception as _apple_err:
        log.warning("Apple token revocation encountered an error (non-blocking): %s", _apple_err)

    # ── Étape 2 : Delete personal-only collections
    await db.favorites.delete_many({"user_id": uid})
    await db.legal_acceptances.delete_many({"user_id": uid})
    await db.notifications.delete_many({"user_id": uid})
    await db.otps.delete_many({"user_id": uid})
    await db.blocked_users.delete_many({"$or": [{"user_id": uid}, {"blocked_id": uid}]})
    await db.providers.delete_many({"user_id": uid})
    await db.services.delete_many({"provider_id": uid})
    await db.babysitters.delete_many({"user_id": uid})
    # RGPD : purger les tokens push, les préférences notif et les password resets
    await db.push_tokens.delete_many({"user_id": uid})
    await db.notification_prefs.delete_many({"user_id": uid})
    await db.password_resets.delete_many({"user_id": uid})
    # Anonymise historic bookings & messages (conserver l'historique pour l'autre partie)
    await db.bookings.update_many({"client_id": uid}, {"$set": {"client_name": "[Compte supprimé]", "client_id_deleted": True}})
    await db.bookings.update_many({"provider_id": uid}, {"$set": {"provider_name": "[Compte supprimé]", "provider_id_deleted": True}})
    await db.messages.update_many({"from_id": uid}, {"$set": {"from_name": "[Compte supprimé]"}})
    await db.reviews.update_many({"author_id": uid}, {"$set": {"author_name": "[Compte supprimé]"}})
    # Finally remove the user account itself
    await db.users.delete_one({"id": uid})
    audit_log("account.deleted", user_id=uid, email=user.get("email"))
    return {"ok": True, "message": "Compte supprimé"}


# ---------- Block user (Apple 1.2 UGC requirement) ----------
@api.post("/users/{peer_id}/block")
async def block_user(peer_id: str, user=Depends(current_user)):
    if peer_id == user["id"]:
        raise HTTPException(400, "Impossible de se bloquer soi-même")
    # Vérifier que la cible existe (soit user, soit provider, soit babysitter)
    exists = await db.users.find_one({"id": peer_id}, {"_id": 1})
    if not exists:
        exists = await db.providers.find_one({"id": peer_id}, {"_id": 1})
    if not exists:
        exists = await db.babysitters.find_one({"user_id": peer_id}, {"_id": 1})
    if not exists:
        raise HTTPException(404, "Utilisateur introuvable")
    await db.blocked_users.update_one(
        {"user_id": user["id"], "blocked_id": peer_id},
        {"$set": {"user_id": user["id"], "blocked_id": peer_id, "created_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}


@api.delete("/users/{peer_id}/block")
async def unblock_user(peer_id: str, user=Depends(current_user)):
    await db.blocked_users.delete_one({"user_id": user["id"], "blocked_id": peer_id})
    return {"ok": True}


@api.get("/users/me/blocked")
async def list_blocked(user=Depends(current_user)):
    cur = db.blocked_users.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)


# ---------- Block helpers (visibility & interaction filters) ----------
async def _blocked_ids(user_id: Optional[str]) -> set[str]:
    """Retourne l'ensemble des user_ids que `user_id` a bloqué OU qui l'ont bloqué.
    Utilisé pour filtrer profils, recherche, chat, réservations. Vide si non authentifié.
    """
    if not user_id:
        return set()
    out: set[str] = set()
    async for d in db.blocked_users.find(
        {"$or": [{"user_id": user_id}, {"blocked_id": user_id}]},
        {"_id": 0, "user_id": 1, "blocked_id": 1},
    ):
        peer = d["blocked_id"] if d["user_id"] == user_id else d["user_id"]
        if peer and peer != user_id:
            out.add(peer)
    return out


async def _is_pair_blocked(a: Optional[str], b: Optional[str]) -> bool:
    """True si a a bloqué b OU b a bloqué a."""
    if not a or not b or a == b:
        return False
    doc = await db.blocked_users.find_one({
        "$or": [
            {"user_id": a, "blocked_id": b},
            {"user_id": b, "blocked_id": a},
        ]
    }, {"_id": 1})
    return bool(doc)




# ---------- Mobility · Covoiturage (rides) ----------
def _clean(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "_id"}


async def _driver_info(uid: str) -> dict:
    u = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0}) or {}
    prov = await db.providers.find_one({"id": uid}, {"_id": 0}) or {}
    return {
        "driver_id": uid,
        "driver_name": u.get("name") or "Conducteur",
        "driver_avatar": u.get("avatar") or prov.get("photo"),
        "driver_phone": u.get("phone"),
        "driver_city": u.get("city"),
        "driver_rating": prov.get("rating", 0) or 0,
        "driver_reviews_count": prov.get("reviews_count", 0) or 0,
        "driver_verified": bool(prov.get("verified")),
    }


@api.post("/rides")
async def create_ride(body: RideIn, user=Depends(current_user)):
    rid = str(uuid.uuid4())
    info = await _driver_info(user["id"])
    # Sécurité : colis autorisés uniquement sur longue distance.
    accepts_parcels = bool(body.accepts_parcels and body.distance_type == "long")
    doc = {
        "id": rid,
        **info,
        "from_city": body.from_city.strip(),
        "from_address": (body.from_address or "").strip(),
        "to_city": body.to_city.strip(),
        "to_address": (body.to_address or "").strip(),
        "stops": [s.model_dump() for s in body.stops],
        "date": body.date,
        "time": body.time,
        "seats_total": body.seats_total,
        "seats_available": body.seats_total,
        "price_xof": body.price_xof,
        "distance_type": body.distance_type,
        "recurrence": body.recurrence,
        "recurrence_days": body.recurrence_days if body.recurrence == "weekly" else [],
        "vehicle_model": body.vehicle_model or "",
        "vehicle_plate": body.vehicle_plate or "",
        "vehicle_color": body.vehicle_color or "",
        "notes": body.notes or "",
        "accepts_parcels": accepts_parcels,
        "parcel_price_xof": int(body.parcel_price_xof) if accepts_parcels else 0,
        "parcel_max_kg": int(body.parcel_max_kg) if accepts_parcels else 0,
        "parcel_payment_mode": body.parcel_payment_mode if accepts_parcels else "app_or_cash",
        "status": "active",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.rides.insert_one(doc)
    # Marketplace v2 : maintenir champs normalisés + déclencher matching demandes
    try:
        from rides_v2.cities import resolve_city as _rv2_resolve
        from rides_v2 import matching as _rv2_matching, notify as _rv2_notify
        norm_from = _rv2_resolve(doc.get("from_city"))
        norm_to = _rv2_resolve(doc.get("to_city"))
        await db.rides.update_one({"id": rid}, {"$set": {"from_city_norm": norm_from, "to_city_norm": norm_to}})
        doc["from_city_norm"] = norm_from
        doc["to_city_norm"] = norm_to
        matched_requests = await _rv2_matching.match_requests_for_ride(db, doc)
        for req in matched_requests:
            await _rv2_notify.notify_passenger_of_new_ride(db, req, doc)
    except Exception as _e:
        log.warning("[rides_v2] post-create ride match failed: %s", _e)
    return _clean(doc)


@api.get("/rides")
async def search_rides(
    from_city: Optional[str] = None,
    to_city: Optional[str] = None,
    date: Optional[str] = None,
    distance_type: Optional[str] = None,
    accepts_parcels: Optional[bool] = None,
    limit: int = 50,
    user=Depends(optional_user),
):
    q: dict = {"status": "active"}
    if from_city:
        q["from_city"] = {"$regex": _safe_regex(from_city), "$options": "i"}
    if to_city:
        q["to_city"] = {"$regex": _safe_regex(to_city), "$options": "i"}
    if date:
        # Match ISO date prefix (YYYY-MM-DD) OR weekly recurrence
        weekday_map = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
        try:
            dt = datetime.fromisoformat(date[:10])
            wd = weekday_map[dt.weekday()]
        except Exception:
            wd = None
        or_clauses = [{"date": date[:10]}, {"date": {"$regex": f"^{date[:10]}"}}]
        if wd:
            or_clauses.append({"recurrence": "weekly", "recurrence_days": wd})
        q["$or"] = or_clauses
    if distance_type in ("short", "long"):
        q["distance_type"] = distance_type
    if accepts_parcels is True:
        q["accepts_parcels"] = True
        q["distance_type"] = "long"
    # Exclure les trajets dont le conducteur est bloqué (dans les deux sens).
    blocked = await _blocked_ids(user["id"] if user else None)
    if blocked:
        q["driver_id"] = {"$nin": list(blocked)}
    cur = db.rides.find(q, {"_id": 0}).sort([("date", 1), ("time", 1)]).limit(limit)
    return await cur.to_list(limit)


@api.get("/rides/mine")
async def my_rides(user=Depends(current_user)):
    cur = db.rides.find({"driver_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(200)


@api.get("/rides/bookings/mine")
async def my_ride_bookings(user=Depends(current_user)):
    cur = db.ride_bookings.find({"passenger_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    items = await cur.to_list(200)
    # Attach light ride info
    ride_ids = list({b["ride_id"] for b in items})
    rides = await db.rides.find({"id": {"$in": ride_ids}}, {"_id": 0}).to_list(200)
    rmap = {r["id"]: r for r in rides}
    for b in items:
        r = rmap.get(b["ride_id"])
        if r:
            b["ride"] = {
                "id": r["id"],
                "from_city": r["from_city"],
                "to_city": r["to_city"],
                "date": r["date"],
                "time": r["time"],
                "driver_name": r.get("driver_name"),
                "driver_avatar": r.get("driver_avatar"),
                "status": r.get("status"),
            }
    return items


@api.get("/rides/bookings/received")
async def received_ride_bookings(user=Depends(current_user)):
    """Bookings for rides published by the current user (driver view)."""
    my = await db.rides.find({"driver_id": user["id"]}, {"_id": 0, "id": 1}).to_list(500)
    ids = [r["id"] for r in my]
    cur = db.ride_bookings.find({"ride_id": {"$in": ids}}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)


@api.get("/rides/{rid}")
async def get_ride(rid: str, user=Depends(optional_user)):
    r = await db.rides.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Trajet introuvable")
    if user and await _is_pair_blocked(user["id"], r.get("driver_id")):
        raise HTTPException(404, "Trajet introuvable")
    return r


@api.patch("/rides/{rid}")
async def update_ride(rid: str, body: RideUpdate, user=Depends(current_user)):
    r = await db.rides.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Trajet introuvable")
    if r["driver_id"] != user["id"]:
        raise HTTPException(403, "Interdit")
    updates: dict = {"updated_at": now_iso()}
    data = body.model_dump(exclude_unset=True)
    if "stops" in data and data["stops"] is not None:
        data["stops"] = [s if isinstance(s, dict) else s.model_dump() for s in data["stops"]]
    if "seats_total" in data and data["seats_total"] is not None:
        # adjust seats_available proportionnally
        booked = r["seats_total"] - r.get("seats_available", r["seats_total"])
        data["seats_available"] = max(0, data["seats_total"] - booked)
    updates.update(data)
    await db.rides.update_one({"id": rid}, {"$set": updates})
    # cancel notifications to passengers
    if data.get("status") == "cancelled":
        bookings = await db.ride_bookings.find({"ride_id": rid}, {"_id": 0}).to_list(500)
        for b in bookings:
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": b["passenger_id"],
                "type": "ride_cancelled",
                "title": "Trajet annulé",
                "body": f"{r.get('from_city')} → {r.get('to_city')} le {r.get('date')}",
                "peer_id": r["driver_id"],
                "read": False,
                "created_at": now_iso(),
            })
    return {"ok": True}


@api.delete("/rides/{rid}")
async def delete_ride(rid: str, user=Depends(current_user)):
    r = await db.rides.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Trajet introuvable")
    if r["driver_id"] != user["id"]:
        raise HTTPException(403, "Interdit")
    await db.rides.update_one({"id": rid}, {"$set": {"status": "cancelled", "updated_at": now_iso()}})
    return {"ok": True}


@api.post("/rides/{rid}/book")
async def book_ride(rid: str, body: RideBookingIn, user=Depends(current_user)):
    r = await db.rides.find_one({"id": rid}, {"_id": 0})
    if not r or r.get("status") != "active":
        raise HTTPException(404, "Trajet indisponible")
    if r["driver_id"] == user["id"]:
        raise HTTPException(400, "Vous ne pouvez pas réserver votre propre trajet")
    if await _is_pair_blocked(user["id"], r["driver_id"]):
        raise HTTPException(403, "Réservation impossible : l'un de vous a bloqué l'autre.")
    # Bloquer si le conducteur a des commissions impayées au-delà du seuil
    await _check_provider_not_blocked(r["driver_id"])
    if body.seats > (r.get("seats_available") or 0):
        raise HTTPException(400, "Places insuffisantes")
    bid = str(uuid.uuid4())
    total = body.seats * int(r.get("price_xof") or 0)
    doc = {
        "id": bid,
        "ride_id": rid,
        "passenger_id": user["id"],
        "passenger_name": user.get("name") or "Passager",
        "passenger_phone": user.get("phone"),
        "seats": body.seats,
        "price_xof": total,
        "status": "confirmed",  # instant confirm (MVP)
        "paid": False,
        "note": body.note or "",
        "created_at": now_iso(),
    }
    await db.ride_bookings.insert_one(doc)
    await db.rides.update_one({"id": rid}, {"$inc": {"seats_available": -body.seats}})
    # Notify driver
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": r["driver_id"],
        "type": "ride_booking",
        "title": "Nouvelle réservation",
        "body": f"{user.get('name')} a réservé {body.seats} place(s) — {r.get('from_city')} → {r.get('to_city')}",
        "peer_id": user["id"],
        "read": False,
        "created_at": now_iso(),
    })
    return _clean(doc)


@api.patch("/rides/bookings/{bid}")
async def update_ride_booking(bid: str, body: dict, user=Depends(current_user)):
    b = await db.ride_bookings.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Réservation introuvable")
    new_status = body.get("status")
    if new_status not in ("cancelled", "confirmed"):
        raise HTTPException(400, "Statut invalide")
    r = await db.rides.find_one({"id": b["ride_id"]}, {"_id": 0})
    # passenger can cancel; driver can also cancel/confirm
    if user["id"] not in (b["passenger_id"], (r or {}).get("driver_id")):
        raise HTTPException(403, "Interdit")
    if b["status"] == new_status:
        return {"ok": True}
    await db.ride_bookings.update_one({"id": bid}, {"$set": {"status": new_status, "updated_at": now_iso()}})
    if new_status == "cancelled" and b["status"] != "cancelled":
        await db.rides.update_one({"id": b["ride_id"]}, {"$inc": {"seats_available": b["seats"]}})
    return {"ok": True}


# ---------- Mobility · Livraison longue distance (parcels) ----------
PARCEL_STATUSES = ("pending", "accepted", "rejected", "picked_up", "delivered", "cancelled")


@api.post("/rides/{rid}/parcel")
async def create_parcel_request(rid: str, body: ParcelIn, user=Depends(current_user)):
    r = await db.rides.find_one({"id": rid}, {"_id": 0})
    if not r or r.get("status") != "active":
        raise HTTPException(404, "Trajet indisponible")
    if not r.get("accepts_parcels") or r.get("distance_type") != "long":
        raise HTTPException(400, "Ce trajet n'accepte pas de colis longue distance")
    if r["driver_id"] == user["id"]:
        raise HTTPException(400, "Vous ne pouvez pas envoyer un colis sur votre propre trajet")
    if await _is_pair_blocked(user["id"], r["driver_id"]):
        raise HTTPException(403, "Envoi impossible : l'un de vous a bloqué l'autre.")
    if body.weight_kg > (r.get("parcel_max_kg") or 0):
        raise HTTPException(400, f"Poids maximum autorisé : {r.get('parcel_max_kg')} kg")
    payment_mode_allowed = r.get("parcel_payment_mode") or "app_or_cash"
    if payment_mode_allowed == "app_only" and body.payment_mode == "cash":
        raise HTTPException(400, "Le conducteur n'accepte que le paiement en app")
    if payment_mode_allowed == "cash_only" and body.payment_mode == "app":
        raise HTTPException(400, "Le conducteur n'accepte que le paiement en espèces")
    pid = str(uuid.uuid4())
    price = int(r.get("parcel_price_xof") or 0)
    doc = {
        "id": pid,
        "ride_id": rid,
        "sender_id": user["id"],
        "sender_name": user.get("name") or "Expéditeur",
        "sender_phone": user.get("phone"),
        "driver_id": r["driver_id"],
        "driver_name": r.get("driver_name"),
        "driver_avatar": r.get("driver_avatar"),
        "from_city": r.get("from_city"),
        "to_city": r.get("to_city"),
        "date": r.get("date"),
        "time": r.get("time"),
        "pickup_address": body.pickup_address.strip(),
        "dropoff_address": body.dropoff_address.strip(),
        "description": body.description.strip(),
        "weight_kg": float(body.weight_kg),
        "recipient_name": body.recipient_name.strip(),
        "recipient_phone": body.recipient_phone.strip(),
        "photo": body.photo,
        "payment_mode": body.payment_mode,
        "price_xof": price,
        "status": "pending",
        "paid": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.parcels.insert_one(doc)
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": r["driver_id"],
        "type": "parcel_request",
        "title": "Nouvelle demande de colis",
        "body": f"{doc['sender_name']} — {r.get('from_city')} → {r.get('to_city')} ({body.weight_kg} kg)",
        "peer_id": user["id"],
        "read": False,
        "created_at": now_iso(),
    })
    return _clean(doc)


@api.get("/parcels/mine")
async def my_parcels(user=Depends(current_user)):
    cur = db.parcels.find({"sender_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(200)


@api.get("/parcels/received")
async def received_parcels(user=Depends(current_user)):
    cur = db.parcels.find({"driver_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)


@api.get("/parcels/{pid}")
async def get_parcel(pid: str, user=Depends(current_user)):
    p = await db.parcels.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Colis introuvable")
    if user["id"] not in (p["sender_id"], p["driver_id"]) and not (user.get("is_admin") or user.get("staff_role")):
        raise HTTPException(403, "Interdit")
    return p


@api.patch("/parcels/{pid}")
async def update_parcel(pid: str, body: ParcelUpdate, user=Depends(current_user)):
    p = await db.parcels.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Colis introuvable")
    new_status = body.status
    if new_status is None and body.paid is None:
        raise HTTPException(400, "Aucune mise à jour fournie")

    is_driver = user["id"] == p["driver_id"]
    is_sender = user["id"] == p["sender_id"]

    # Transitions autorisées
    allowed_driver = {"accepted", "rejected", "picked_up", "delivered", "cancelled"}
    allowed_sender = {"cancelled"}
    if new_status:
        if new_status not in PARCEL_STATUSES:
            raise HTTPException(400, "Statut invalide")
        if is_driver and new_status not in allowed_driver:
            raise HTTPException(403, "Transition interdite pour le conducteur")
        if is_sender and new_status not in allowed_sender:
            raise HTTPException(403, "Transition interdite pour l'expéditeur")
        # Séquence logique
        cur_s = p.get("status") or "pending"
        if cur_s in ("delivered", "cancelled", "rejected") and new_status != cur_s:
            raise HTTPException(400, f"Colis déjà en statut '{cur_s}'")

    updates: dict = {"updated_at": now_iso()}
    notif_target = None
    notif_msg = None
    if new_status:
        updates["status"] = new_status
        notif_target = p["sender_id"] if is_driver else p["driver_id"]
        labels = {
            "accepted": "Colis accepté par le conducteur",
            "rejected": "Colis refusé",
            "picked_up": "Colis récupéré, en route",
            "delivered": "Colis livré ✅",
            "cancelled": "Colis annulé",
        }
        notif_msg = labels.get(new_status, f"Statut : {new_status}")
        if new_status == "delivered" and p.get("payment_mode") == "cash":
            updates["paid"] = True
        if new_status == "delivered":
            updates["delivered_at"] = now_iso()
    if body.paid is not None:
        updates["paid"] = bool(body.paid)

    await db.parcels.update_one({"id": pid}, {"$set": updates})
    # Jokoo Partners — hook si livraison confirmée (sender=client, driver=provider)
    if new_status == "delivered":
        try:
            p_full = {**p, **updates}
            amount = int(
                p_full.get("total_xof")
                or p_full.get("price_xof")
                or p_full.get("amount_xof")
                or p_full.get("price")
                or 0
            )
            await _amb_hook_booking_completed(db, p_full, amount, notify=send_push)
        except Exception as _amb_err:
            log.debug("ambassador parcel hook failed: %s", _amb_err)
    if notif_target and notif_msg:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": notif_target,
            "type": "parcel_update",
            "title": notif_msg,
            "body": f"{p.get('from_city')} → {p.get('to_city')} · {p.get('date')}",
            "peer_id": user["id"],
            "read": False,
            "created_at": now_iso(),
        })
    return {"ok": True}


# ---------- Jokoo Family · Babysitting & Tutorat ----------
def _rate_hint(hourly_rate: int, psc1: bool) -> dict:
    """Give a rate-guidance meta object."""
    rec_min = 2500 if psc1 else 2000
    rec_max = 5000 if psc1 else 4000
    ok = rec_min <= hourly_rate <= rec_max
    return {"recommended_min": rec_min, "recommended_max": rec_max, "in_range": ok}


@api.post("/family/profile")
async def upsert_babysitter_profile(body: BabysitterProfileIn, user=Depends(current_user)):
    """Create or update the current user's babysitter profile."""
    existing = await db.babysitters.find_one({"user_id": user["id"]}, {"_id": 0})
    # Back-compat: derive offers_* from services list
    services = list(dict.fromkeys(body.services))
    offers_babysitting = "babysitting" in services or "educational_activities" in services
    offers_tutoring = "tutoring" in services
    doc = {
        "user_id": user["id"],
        "name": user.get("name") or "Étudiant",
        "phone": user.get("phone"),
        "avatar": body.photo or user.get("avatar") or (existing or {}).get("avatar"),
        "bio": body.bio.strip(),
        "profile_type": body.profile_type,
        "university": body.university.strip(),
        "level": body.level,
        "field_of_study": (body.field_of_study or "").strip(),
        "city": body.city.strip(),
        "languages": [l.model_dump() for l in body.languages],
        "age_specialties": body.age_specialties,
        "skills": body.skills,
        "services": services,
        "offers_babysitting": offers_babysitting,
        "offers_tutoring": offers_tutoring,
        "tutoring_subjects": body.tutoring_subjects,
        "available_today": body.available_today,
        "night_care": body.night_care,
        "can_travel": body.can_travel,
        "hourly_rate_xof": body.hourly_rate_xof,
        "psc1_certified": body.psc1_certified,
        "emergency_contact": body.emergency_contact.model_dump() if body.emergency_contact else None,
        "student_card": body.student_card or (existing or {}).get("student_card"),
        "student_card_verified": (existing or {}).get("student_card_verified", False),
        "identity_verified": (existing or {}).get("identity_verified", False),
        "references_verified": (existing or {}).get("references_verified", False),
        "recommended_by_jokoo": (existing or {}).get("recommended_by_jokoo", False),
        "status": "active",
        "rating": (existing or {}).get("rating", 0),
        "reviews_count": (existing or {}).get("reviews_count", 0),
        "updated_at": now_iso(),
    }
    # Compute Verified+ badge server-side
    doc["verified_plus"] = bool(
        doc["identity_verified"]
        and doc["references_verified"]
        and doc["psc1_certified"]
        and (doc["rating"] or 0) >= 4.5
        and (doc["reviews_count"] or 0) >= 5
    )
    if existing:
        await db.babysitters.update_one({"user_id": user["id"]}, {"$set": doc})
        doc["id"] = existing["id"]
        doc["created_at"] = existing.get("created_at")
    else:
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = now_iso()
        await db.babysitters.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/family/profile/me")
async def get_my_babysitter_profile(user=Depends(current_user)):
    p = await db.babysitters.find_one({"user_id": user["id"]}, {"_id": 0})
    if not p:
        return {"exists": False}
    return {"exists": True, "profile": p, "rate_hint": _rate_hint(p.get("hourly_rate_xof", 0), p.get("psc1_certified", False))}


@api.get("/family/babysitters")
async def search_babysitters(
    city: Optional[str] = None,
    language: Optional[str] = None,  # ISO code (fr, en, wo, ar…)
    age_group: Optional[str] = None,  # "0-2" etc.
    skill: Optional[str] = None,
    service: Optional[str] = None,  # "babysitting"|"tutoring"|"school_pickup"|"holiday_care"|"educational_activities"
    profile_type: Optional[str] = None,  # student|teacher|professional
    offers_tutoring: Optional[bool] = None,
    psc1: Optional[bool] = None,
    min_rate: Optional[int] = None,
    max_rate: Optional[int] = None,
    verified_only: Optional[bool] = None,
    available_today: Optional[bool] = None,
    night_care: Optional[bool] = None,
    can_travel: Optional[bool] = None,
    recommended: Optional[bool] = None,
    verified_plus: Optional[bool] = None,
    limit: int = 50,
    user=Depends(optional_user),
):
    q: dict = {"status": "active"}
    if city:
        q["city"] = {"$regex": _safe_regex(city), "$options": "i"}
    if language:
        q["languages.code"] = language
    if age_group:
        q["age_specialties"] = age_group
    if skill:
        q["skills"] = skill
    if service:
        q["services"] = service
    if profile_type:
        q["profile_type"] = profile_type
    if offers_tutoring is True:
        q["offers_tutoring"] = True
    if psc1 is True:
        q["psc1_certified"] = True
    if verified_only is True:
        q["student_card_verified"] = True
    if available_today is True:
        q["available_today"] = True
    if night_care is True:
        q["night_care"] = True
    if can_travel is True:
        q["can_travel"] = True
    if recommended is True:
        q["recommended_by_jokoo"] = True
    if verified_plus is True:
        q["verified_plus"] = True
    rate_q = {}
    if min_rate is not None:
        rate_q["$gte"] = int(min_rate)
    if max_rate is not None:
        rate_q["$lte"] = int(max_rate)
    if rate_q:
        q["hourly_rate_xof"] = rate_q
    # Exclure les baby-sitters bloqués (par user_id).
    blocked = await _blocked_ids(user["id"] if user else None)
    if blocked:
        q["user_id"] = {"$nin": list(blocked)}
    cur = db.babysitters.find(q, {"_id": 0, "student_card": 0, "emergency_contact": 0}).sort([
        ("recommended_by_jokoo", -1),
        ("verified_plus", -1),
        ("student_card_verified", -1),
        ("rating", -1),
    ]).limit(limit)
    return await cur.to_list(limit)


@api.get("/family/babysitters/{bid}")
async def get_babysitter(bid: str, user=Depends(optional_user)):
    b = await db.babysitters.find_one({"id": bid}, {"_id": 0, "student_card": 0, "emergency_contact": 0})
    if not b:
        raise HTTPException(404, "Étudiant introuvable")
    if user and await _is_pair_blocked(user["id"], b.get("user_id")):
        raise HTTPException(404, "Étudiant introuvable")
    return b


# --- Admin verification ---
@api.patch("/admin/family/babysitters/{bid}/verify")
async def verify_babysitter(bid: str, body: dict, user=Depends(current_user)):
    if not (user.get("is_admin") or (user.get("staff_role") in {"super_admin", "support", "operator"})):
        raise HTTPException(403, "Interdit")
    b = await db.babysitters.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Étudiant introuvable")
    updates: dict = {"updated_at": now_iso()}
    for key in ("student_card_verified", "identity_verified", "references_verified", "recommended_by_jokoo"):
        if key in body:
            updates[key] = bool(body[key])
    # Legacy support: "verified"=true means both student card + identity
    if "verified" in body and "student_card_verified" not in updates:
        updates["student_card_verified"] = bool(body["verified"])
        updates["identity_verified"] = bool(body["verified"])
    # Recompute Verified+
    merged = {**b, **updates}
    updates["verified_plus"] = bool(
        merged.get("identity_verified")
        and merged.get("references_verified")
        and merged.get("psc1_certified")
        and (merged.get("rating") or 0) >= 4.5
        and (merged.get("reviews_count") or 0) >= 5
    )
    await db.babysitters.update_one({"id": bid}, {"$set": updates})
    return {"ok": True, "verified_plus": updates["verified_plus"]}


# --- Bookings ---
def _duration_hours(start: str, end: str) -> float:
    def _min(t):
        h, m = t.split(":")
        return int(h) * 60 + int(m)
    diff = _min(end) - _min(start)
    if diff <= 0:
        diff += 24 * 60
    return round(diff / 60.0, 2)


@api.post("/family/bookings")
async def create_babysitting_booking(body: BabysittingBookingIn, user=Depends(current_user)):
    sitter = await db.babysitters.find_one({"id": body.babysitter_id}, {"_id": 0})
    if not sitter or sitter.get("status") != "active":
        raise HTTPException(404, "Étudiant indisponible")
    if sitter["user_id"] == user["id"]:
        raise HTTPException(400, "Vous ne pouvez pas vous réserver vous-même")
    if await _is_pair_blocked(user["id"], sitter["user_id"]):
        raise HTTPException(403, "Réservation impossible : l'un de vous a bloqué l'autre.")
    # Bloquer si l'étudiant a des commissions Jokoo impayées au-delà du seuil
    await _check_provider_not_blocked(sitter["user_id"])
    if body.service_type in ("tutoring", "both") and not sitter.get("offers_tutoring"):
        raise HTTPException(400, "Cet étudiant n'offre pas de tutorat")
    hours = _duration_hours(body.time_start, body.time_end)
    if hours < 0.5:
        raise HTTPException(400, "Durée trop courte")
    rate = int(sitter.get("hourly_rate_xof") or 0)
    total = int(round(hours * rate))
    bid = str(uuid.uuid4())
    doc = {
        "id": bid,
        "parent_id": user["id"],
        "parent_name": user.get("name") or "Parent",
        "parent_phone": user.get("phone"),
        "babysitter_id": sitter["id"],
        "babysitter_user_id": sitter["user_id"],
        "babysitter_name": sitter.get("name"),
        "babysitter_avatar": sitter.get("avatar"),
        "service_type": body.service_type,
        "address": body.address.strip(),
        "city": body.city.strip(),
        "date": body.date,
        "time_start": body.time_start,
        "time_end": body.time_end,
        "duration_hours": hours,
        "kids": [k.model_dump() for k in body.kids],
        "language_focus": body.language_focus,
        "tutoring_subjects": body.tutoring_subjects,
        "notes": (body.notes or "").strip(),
        "emergency_contact": body.emergency_contact.model_dump(),
        "hourly_rate_xof": rate,
        "total_xof": total,
        "status": "pending",
        "checkin_photo": None,
        "sos_triggered_at": None,
        "report_id": None,
        "paid": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.babysitting_bookings.insert_one(doc)
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": sitter["user_id"],
        "type": "babysitting_request",
        "title": "Nouvelle mission de babysitting",
        "body": f"{doc['parent_name']} — {body.date} de {body.time_start} à {body.time_end}",
        "peer_id": user["id"],
        "family_booking_id": doc["id"],
        "read": False,
        "created_at": now_iso(),
    })
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/family/bookings/mine")
async def my_family_bookings(user=Depends(current_user)):
    cur = db.babysitting_bookings.find({"parent_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(200)


@api.get("/family/bookings/assigned")
async def assigned_family_bookings(user=Depends(current_user)):
    cur = db.babysitting_bookings.find({"babysitter_user_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(200)


@api.get("/family/bookings/{bid}")
async def get_family_booking(bid: str, user=Depends(current_user)):
    b = await db.babysitting_bookings.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Réservation introuvable")
    if user["id"] not in (b["parent_id"], b["babysitter_user_id"]) and not (user.get("is_admin") or user.get("staff_role")):
        raise HTTPException(403, "Interdit")
    return b


@api.patch("/family/bookings/{bid}")
async def update_family_booking(bid: str, body: BabysittingBookingUpdate, user=Depends(current_user)):
    b = await db.babysitting_bookings.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Réservation introuvable")
    is_parent = user["id"] == b["parent_id"]
    is_sitter = user["id"] == b["babysitter_user_id"]
    if not (is_parent or is_sitter):
        raise HTTPException(403, "Interdit")
    updates: dict = {"updated_at": now_iso()}
    notif_target = None
    notif_body = None
    if body.status:
        allowed_sitter = {"confirmed", "in_progress", "completed", "cancelled"}
        allowed_parent = {"cancelled"}
        cur_s = b.get("status")
        if cur_s in ("completed", "cancelled"):
            raise HTTPException(400, f"Réservation déjà en statut '{cur_s}'")
        if is_sitter and body.status not in allowed_sitter:
            raise HTTPException(403, "Transition interdite pour l'étudiant")
        if is_parent and body.status not in allowed_parent:
            raise HTTPException(403, "Transition interdite pour le parent")
        updates["status"] = body.status
        notif_target = b["parent_id"] if is_sitter else b["babysitter_user_id"]
        label = {
            "confirmed": "Mission confirmée ✅",
            "in_progress": "La session a commencé",
            "completed": "Session terminée",
            "cancelled": "Session annulée",
        }.get(body.status, body.status)
        notif_body = f"{b.get('date')} · {b.get('time_start')}–{b.get('time_end')}"
        if body.status == "completed":
            updates["paid"] = True
            updates["completed_at"] = now_iso()
    if body.checkin_photo is not None:
        if not is_sitter:
            raise HTTPException(403, "Seul l'étudiant peut envoyer le check-in")
        updates["checkin_photo"] = body.checkin_photo
    await db.babysitting_bookings.update_one({"id": bid}, {"$set": updates})
    # Jokoo Partners — hook si passage en completed
    if body.status == "completed":
        try:
            b_full = {**b, **updates}
            amount = int(
                b_full.get("total_xof")
                or b_full.get("total_amount")
                or b_full.get("price_xof")
                or b_full.get("amount_xof")
                or b_full.get("price")
                or 0
            )
            await _amb_hook_booking_completed(db, b_full, amount, notify=send_push)
        except Exception as _amb_err:
            log.debug("ambassador family booking hook failed: %s", _amb_err)
    if notif_target:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": notif_target,
            "type": "babysitting_update",
            "title": label if body.status else "Session mise à jour",
            "body": notif_body or "",
            "peer_id": user["id"],
            "family_booking_id": bid,
            "read": False,
            "created_at": now_iso(),
        })
    return {"ok": True}


@api.post("/family/bookings/{bid}/sos")
async def trigger_sos(bid: str, user=Depends(current_user)):
    b = await db.babysitting_bookings.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Réservation introuvable")
    if user["id"] not in (b["parent_id"], b["babysitter_user_id"]):
        raise HTTPException(403, "Interdit")
    now = now_iso()
    await db.babysitting_bookings.update_one({"id": bid}, {"$set": {"sos_triggered_at": now, "updated_at": now}})
    # Notify the counterparty AND emergency contact reference
    counter = b["parent_id"] if user["id"] == b["babysitter_user_id"] else b["babysitter_user_id"]
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": counter,
        "type": "babysitting_sos",
        "title": "🚨 Alerte SOS reçue",
        "body": f"Contactez immédiatement — {b.get('address')} · {b.get('city')}",
        "peer_id": user["id"],
        "family_booking_id": bid,
        "read": False,
        "created_at": now,
    })
    return {"ok": True, "emergency_contact": b.get("emergency_contact")}


@api.post("/family/bookings/{bid}/report")
async def submit_session_report(bid: str, body: SessionReportIn, user=Depends(current_user)):
    b = await db.babysitting_bookings.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Réservation introuvable")
    if user["id"] != b["babysitter_user_id"]:
        raise HTTPException(403, "Seul l'étudiant peut soumettre le carnet")
    if b.get("report_id"):
        raise HTTPException(400, "Carnet déjà soumis")
    rid = str(uuid.uuid4())
    doc = {
        "id": rid,
        "booking_id": bid,
        "parent_id": b["parent_id"],
        "babysitter_id": b["babysitter_id"],
        "activities": body.activities.strip(),
        "meals": (body.meals or "").strip(),
        "mood": body.mood,
        "notes": (body.notes or "").strip(),
        "photo": body.photo,
        "created_at": now_iso(),
    }
    await db.babysitting_reports.insert_one(doc)
    completion_ts = now_iso()
    await db.babysitting_bookings.update_one(
        {"id": bid},
        {"$set": {"report_id": rid, "status": "completed", "paid": True, "completed_at": completion_ts, "updated_at": completion_ts}},
    )
    # Jokoo Partners — hook post-completion (idempotent)
    try:
        b_updated = {**b, "status": "completed", "completed_at": completion_ts, "report_id": rid}
        amount = int(
            b_updated.get("total_xof")
            or b_updated.get("total_amount")
            or b_updated.get("price_xof")
            or b_updated.get("amount_xof")
            or b_updated.get("price")
            or 0
        )
        await _amb_hook_booking_completed(db, b_updated, amount, notify=send_push)
    except Exception as _amb_err:
        log.debug("ambassador family report hook failed: %s", _amb_err)
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": b["parent_id"],
        "type": "babysitting_report",
        "title": "Carnet de session prêt 📝",
        "body": f"{b.get('date')} · {b.get('babysitter_name')} — Vous pouvez maintenant noter la baby-sitter.",
        "peer_id": user["id"],
        "family_booking_id": bid,
        "read": False,
        "created_at": now_iso(),
    })
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/family/bookings/{bid}/report")
async def get_session_report(bid: str, user=Depends(current_user)):
    b = await db.babysitting_bookings.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Réservation introuvable")
    if user["id"] not in (b["parent_id"], b["babysitter_user_id"]) and not (user.get("is_admin") or user.get("staff_role")):
        raise HTTPException(403, "Interdit")
    r = await db.babysitting_reports.find_one({"booking_id": bid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Carnet non encore disponible")
    return r


# ---------- Family reviews (parent → baby-sitter) ----------
class FamilyReviewIn(BaseModel):
    family_booking_id: str
    rating: int = Field(ge=1, le=5)
    comment: str = ""


@api.post("/family/reviews")
async def create_family_review(body: FamilyReviewIn, user=Depends(current_user)):
    """
    Notation d'une baby-sitter après une mission Famille terminée.
    Règles identiques au système Provider : uniquement le parent, uniquement completed, un seul avis, 1..5, comment optionnel, pas d'auto-notation.
    """
    b = await db.babysitting_bookings.find_one({"id": body.family_booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Réservation introuvable")
    if b.get("parent_id") != user["id"]:
        raise HTTPException(403, "Seul le parent peut noter la baby-sitter")
    if b.get("status") != "completed":
        raise HTTPException(400, "Vous ne pouvez noter qu'une mission terminée")
    if b.get("review_id"):
        raise HTTPException(400, "Un avis a déjà été laissé pour cette mission")
    sitter_user_id = b.get("babysitter_user_id")
    babysitter_id = b.get("babysitter_id")
    if not sitter_user_id or not babysitter_id:
        raise HTTPException(400, "Baby-sitter introuvable pour cette réservation")
    if sitter_user_id == user["id"]:
        raise HTTPException(400, "Vous ne pouvez pas noter votre propre profil")
    rid = str(uuid.uuid4())
    doc = {
        "id": rid,
        "babysitter_id": babysitter_id,
        "babysitter_user_id": sitter_user_id,
        "family_booking_id": body.family_booking_id,
        "author_id": user["id"],
        "author_name": user["name"],
        "author_avatar": user.get("avatar"),
        "rating": body.rating,
        "comment": (body.comment or "").strip(),
        "created_at": now_iso(),
    }
    await db.family_reviews.insert_one(doc)
    await db.babysitting_bookings.update_one({"id": body.family_booking_id}, {"$set": {"review_id": rid}})
    # Notifier la baby-sitter
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": sitter_user_id,
        "type": "review_received",
        "title": f"⭐ Nouvel avis {body.rating}/5",
        "body": (doc["comment"][:120] + "…") if doc["comment"] and len(doc["comment"]) > 120
                 else (doc["comment"] or f"{user['name']} vous a laissé une note."),
        "peer_id": user["id"],
        "family_booking_id": body.family_booking_id,
        "review_id": rid,
        "babysitter_id": babysitter_id,
        "read": False,
        "created_at": now_iso(),
    })
    # Recompute rating + count sur la fiche babysitter
    rs = await db.family_reviews.find({"babysitter_id": babysitter_id}, {"_id": 0, "rating": 1}).to_list(10000)
    avg = round(sum(r["rating"] for r in rs) / len(rs), 2) if rs else 0
    await db.babysitters.update_one(
        {"id": babysitter_id},
        {"$set": {"rating": avg, "reviews_count": len(rs)}},
    )
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/family/reviews")
async def list_family_reviews(babysitter_id: str, limit: int = 50):
    """Liste publique des avis d'une baby-sitter."""
    if limit < 1: limit = 1
    if limit > 200: limit = 200
    cur = db.family_reviews.find({"babysitter_id": babysitter_id}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return await cur.to_list(limit)


@api.get("/family/bookings/{bid}/review-eligibility")
async def family_review_eligibility(bid: str, user=Depends(current_user)):
    b = await db.babysitting_bookings.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Réservation introuvable")
    if b.get("parent_id") != user["id"]:
        return {"eligible": False, "reason": "not_owner"}
    if b.get("status") != "completed":
        return {"eligible": False, "reason": "not_completed", "status": b.get("status")}
    if b.get("review_id"):
        return {"eligible": False, "reason": "already_reviewed", "existing_review_id": b["review_id"]}
    return {"eligible": True}


# ---------- Legal Center ----------
LEGAL_STAFF_ROLES = {"super_admin", "admin", "support"}


def _is_legal_admin(user: dict) -> bool:
    return bool(user.get("is_admin") or (user.get("staff_role") in LEGAL_STAFF_ROLES))


@api.get("/legal/documents")
async def list_legal_documents(language: str = "fr", country: str = "SN"):
    cur = db.legal_documents.find(
        {"language": language, "country": country, "published": True},
        {"_id": 0, "content": 0},
    ).sort([("category", 1), ("order", 1), ("title", 1)])
    return await cur.to_list(200)


@api.get("/legal/documents/{slug}")
async def get_legal_document(slug: str, language: str = "fr", country: str = "SN"):
    d = await db.legal_documents.find_one(
        {"slug": slug, "language": language, "country": country},
        {"_id": 0},
    )
    if not d:
        raise HTTPException(404, "Document introuvable")
    return d


@api.post("/legal/acceptances")
async def record_acceptance(body: LegalAcceptanceIn, user=Depends(current_user)):
    d = await db.legal_documents.find_one({"slug": body.slug}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Document introuvable")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "slug": body.slug,
        "version": body.version,
        "accepted_at": now_iso(),
    }
    await db.legal_acceptances.insert_one(doc)
    return {"ok": True}


@api.get("/legal/acceptances/mine")
async def my_acceptances(user=Depends(current_user)):
    cur = db.legal_acceptances.find({"user_id": user["id"]}, {"_id": 0}).sort("accepted_at", -1)
    return await cur.to_list(200)


# --- Admin editor ---
# ─────────────────────────────────────────────────────────────
# 🌐 Public API (CORS-safe) — pour le site web jokooservices.com
# Ces endpoints ne requièrent PAS d'authentification et retournent
# le CMS Jokoo de manière à ce que le site externe reste toujours
# synchronisé avec l'app mobile.
# ─────────────────────────────────────────────────────────────

# Slugs officiels utilisés par le site web
_PUBLIC_LEGAL_SLUGS: dict[str, str] = {
    "privacy":            "Politique de confidentialité",
    "cgu":                "Conditions Générales d'Utilisation",
    "terms-clients":      "Conditions Clients",
    "terms-prestataires": "Conditions Prestataires",
    "mentions-legales":   "Mentions légales",
    "cookies":            "Politique de cookies",
    "help-center":        "Centre d'aide",
}


@api.get("/public/legal")
async def public_legal_index(language: str = "fr", country: str = "SN"):
    """Liste publique des documents légaux publiés (sans contenu)."""
    docs = await db.legal_documents.find(
        {"language": language, "country": country, "published": True},
        {"_id": 0, "content": 0},
    ).sort([("category", 1), ("order", 1), ("title", 1)]).to_list(200)
    # Filtre + garantit la présence des 5 slugs publics prioritaires en tête
    priority = list(_PUBLIC_LEGAL_SLUGS.keys())
    docs.sort(key=lambda d: (priority.index(d["slug"]) if d.get("slug") in priority else 999, d.get("order", 100)))
    return {
        "count": len(docs),
        "language": language,
        "country": country,
        "documents": docs,
    }


@api.get("/public/legal/{slug}")
async def public_legal_get(slug: str, language: str = "fr", country: str = "SN", format: str = "json"):
    """Contenu public d'un document légal.
    format=json → JSON structuré ; format=html → HTML rendu (utilisable en <iframe> ou fetch texte)."""
    d = await db.legal_documents.find_one(
        {"slug": slug, "language": language, "country": country, "published": True},
        {"_id": 0},
    )
    if not d:
        raise HTTPException(404, "Document introuvable")
    if format == "html":
        # Rendu HTML minimal (le contenu est déjà en Markdown → converti en HTML très simple)
        content_md = d.get("content", "")
        # Conversion Markdown minimaliste sans dépendance (titres, gras, italiques, listes)
        import re as _re
        html = content_md
        html = _re.sub(r"^### (.+)$", r"<h3>\1</h3>", html, flags=_re.M)
        html = _re.sub(r"^## (.+)$", r"<h2>\1</h2>", html, flags=_re.M)
        html = _re.sub(r"^# (.+)$", r"<h1>\1</h1>", html, flags=_re.M)
        html = _re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html)
        html = _re.sub(r"\*(.+?)\*", r"<em>\1</em>", html)
        html = _re.sub(r"`([^`]+)`", r"<code>\1</code>", html)
        # Listes
        html = _re.sub(r"(?:^|\n)- (.+)", r"\n<li>\1</li>", html)
        # Paragraphes (double newline)
        parts = [p.strip() for p in html.split("\n\n") if p.strip()]
        html = "".join([f"<p>{p}</p>" if not p.startswith("<") else p for p in parts])
        page = f"""<!doctype html><html lang="{language}"><head><meta charset="utf-8">
<title>{d.get('title')} — Jokoo</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:780px;margin:40px auto;padding:0 20px;color:#0f172a;line-height:1.6}}h1,h2,h3{{color:#0f172a}}a{{color:#14b8a6}}code{{background:#f1f5f9;padding:2px 6px;border-radius:4px}}li{{margin:6px 0}}</style>
</head><body>
<article><h1>{d.get('title')}</h1><p><small>Version {d.get('version')} · en vigueur au {d.get('effective_date','')}</small></p>{html}<hr><p><small>© Jokoo Services · Extrait du CMS Jokoo (auto-synchronisé)</small></p></article>
</body></html>"""
        return Response(content=page, media_type="text/html; charset=utf-8")
    return {
        "slug": d.get("slug"),
        "title": d.get("title"),
        "summary": d.get("summary"),
        "content_md": d.get("content"),
        "category": d.get("category"),
        "language": d.get("language"),
        "country": d.get("country"),
        "version": d.get("version"),
        "effective_date": d.get("effective_date"),
        "updated_at": d.get("updated_at"),
    }


# ─── Informations entreprise (admin-éditables) ─────────────
DEFAULT_COMPANY_INFO = {
    "company_name": "",
    "trade_name": "Jokoo Services",
    "legal_form": "",              # ex : "SARL", "SAS"...
    "rccm": "",                    # numéro RCCM Sénégal
    "ninea": "",                   # NINEA
    "address": "",
    "city": "Dakar",
    "country": "Sénégal",
    "email": "support@jokooservices.com",
    "phone": "",
    "whatsapp": "",
    "website": "https://jokooservices.com",
    "socials": {
        "facebook":  "",
        "instagram": "",
        "linkedin":  "",
        "tiktok":    "",
        "x":         "",
        "youtube":   "",
    },
    "app_download": {
        "ios_url":     "",
        "android_url": "",
    },
    "brand": {
        "primary_color":   "#14b8a6",
        "secondary_color": "#0f172a",
        "logo_url":        "",
    },
    # ─── Emails professionnels (infrastructure jokooservices.com) ───
    # Chaque adresse peut être personnalisée dans /admin/company-info → Emails.
    # Utilisées dans les templates d'emails transactionnels + reply_to + pages légales.
    "emails": {
        "noreply":      "noreply@jokooservices.com",       # Expéditeur transactionnel
        "support":      "support@jokooservices.com",       # Reply-to par défaut
        "contact":      "contact@jokooservices.com",       # Formulaire contact site
        "legal":        "legal@jokooservices.com",         # Juridique
        "dpo":          "dpo@jokooservices.com",           # RGPD / DPO
        "paiements":    "paiements@jokooservices.com",     # Paiements / remboursements
        "verification": "verification@jokooservices.com",  # KYC
        "prestataires": "prestataires@jokooservices.com",  # Support prestataires Pro
        "security":     "security@jokooservices.com",      # Sécurité / disclosure
        "fraude":       "fraude@jokooservices.com",        # Signalement fraude
        "family":       "family@jokooservices.com",        # Jokoo Family SOS
        "press":        "press@jokooservices.com",         # Presse
    },
    "hosting_provider": "",        # obligatoire mentions légales
    "director_name": "",           # directeur de la publication
    "updated_at": None,
}


async def _get_company_info() -> dict:
    doc = await db.system_settings.find_one({"key": "company_info"}, {"_id": 0})
    if not doc or not isinstance(doc.get("value"), dict):
        return dict(DEFAULT_COMPANY_INFO)
    merged = dict(DEFAULT_COMPANY_INFO)
    val = doc["value"]
    for k, v in val.items():
        if k in ("socials", "app_download", "brand", "emails") and isinstance(v, dict):
            merged[k] = {**merged.get(k, {}), **v}
        else:
            merged[k] = v
    merged["updated_at"] = doc.get("updated_at")
    return merged


async def get_email_for(role: str, fallback: str = "support@jokooservices.com") -> str:
    """Retourne l'adresse email pro pour un rôle donné, éditable via /admin/company-info.
    Rôles : noreply, support, contact, legal, dpo, paiements, verification, prestataires, security, fraude, family, press."""
    info = await _get_company_info()
    emails = info.get("emails", {}) or {}
    return (emails.get(role) or "").strip() or fallback


@api.get("/public/company-info")
async def public_company_info():
    """Coordonnées / branding officiels de l'entreprise (site web + app + mentions légales)."""
    return await _get_company_info()


@api.get("/admin/company-info")
async def admin_get_company_info(user=Depends(current_user)):
    require_admin(user)
    return await _get_company_info()


@api.put("/admin/company-info")
async def admin_update_company_info(body: dict, user=Depends(current_user)):
    require_admin(user)
    if not isinstance(body, dict):
        raise HTTPException(400, "Payload invalide")
    # On merge avec les défauts pour ne pas écraser accidentellement des sous-objets
    current = await _get_company_info()
    new_val = {**current}
    for k, v in body.items():
        if k in ("socials", "app_download", "brand", "emails") and isinstance(v, dict) and isinstance(new_val.get(k), dict):
            new_val[k] = {**new_val[k], **v}
        elif k == "updated_at":
            continue
        else:
            new_val[k] = v
    new_val["updated_at"] = now_iso()
    await db.system_settings.update_one(
        {"key": "company_info"},
        {"$set": {"key": "company_info", "value": new_val, "updated_at": now_iso(), "updated_by": user["id"]}},
        upsert=True,
    )
    return {"ok": True, "company_info": new_val}


# --- Admin editor ---
@api.get("/admin/legal/documents/{slug}/versions")
async def list_versions(slug: str, user=Depends(current_user)):
    if not _is_legal_admin(user):
        raise HTTPException(403, "Interdit")
    cur = db.legal_versions.find({"slug": slug}, {"_id": 0}).sort("version", -1)
    return await cur.to_list(500)


@api.put("/admin/legal/documents/{slug}")
async def upsert_legal_document(slug: str, body: LegalDocumentUpsertIn, user=Depends(current_user)):
    if not _is_legal_admin(user):
        raise HTTPException(403, "Interdit")
    existing = await db.legal_documents.find_one({"slug": slug, "language": body.language, "country": body.country}, {"_id": 0})
    version = (existing.get("version", 0) if existing else 0) + 1
    now = now_iso()
    doc = {
        "slug": slug,
        "title": body.title.strip(),
        "content": body.content,
        "summary": (body.summary or "").strip(),
        "category": body.category or "general",
        "language": body.language,
        "country": body.country,
        "version": version,
        "requires_acceptance": body.requires_acceptance,
        "published": body.published,
        "effective_date": body.effective_date or now[:10],
        "updated_at": now,
        "updated_by": user["id"],
    }
    if existing:
        doc["created_at"] = existing.get("created_at", now)
        doc["order"] = existing.get("order", 100)
        await db.legal_documents.update_one({"slug": slug, "language": body.language, "country": body.country}, {"$set": doc})
    else:
        doc["created_at"] = now
        doc["order"] = 100
        await db.legal_documents.insert_one(doc)
    # Historique version
    await db.legal_versions.insert_one({
        "id": str(uuid.uuid4()),
        **doc,
        "author_id": user["id"],
    })
    return {"ok": True, "version": version}


@api.post("/admin/legal/documents/{slug}/versions/{version}/restore")
async def restore_version(slug: str, version: int, user=Depends(current_user)):
    if not _is_legal_admin(user):
        raise HTTPException(403, "Interdit")
    old = await db.legal_versions.find_one({"slug": slug, "version": version}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Version introuvable")
    body = LegalDocumentUpsertIn(
        title=old["title"], content=old["content"], summary=old.get("summary", ""),
        category=old.get("category"), language=old.get("language", "fr"),
        country=old.get("country", "SN"), effective_date=old.get("effective_date"),
        requires_acceptance=old.get("requires_acceptance", False),
        published=old.get("published", True),
    )
    return await upsert_legal_document(slug, body, user)


# ---------- seed ----------
# Chaque prestataire a un mode de tarification distinct :
# "fixed" = prix ferme par prestation, "from" = prix de départ, "quote" = sur devis.
SEED_PROVIDERS = [
    {"name": "Moussa Diop", "service_key": "plombier", "service": "Plombier", "city": "Dakar", "price_type": "from", "price_amount": 5000, "rating": 4.8, "reviews_count": 42, "description": "Plombier certifié avec 10 ans d'expérience. Interventions rapides à Dakar. Devis gratuit avant intervention.", "photo": "https://images.pexels.com/photos/8005368/pexels-photo-8005368.jpeg", "verified": True},
    {"name": "Awa Ndiaye", "service_key": "coiffeuse", "service": "Coiffeuse", "city": "Dakar", "price_type": "fixed", "price_amount": 15000, "rating": 4.9, "reviews_count": 87, "description": "Spécialiste tresses, extensions et défrisage. À domicile. Forfait tout compris.", "photo": "https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg", "verified": True},
    {"name": "Ibrahima Fall", "service_key": "electricien", "service": "Électricien", "city": "Dakar", "price_type": "from", "price_amount": 8000, "rating": 4.7, "reviews_count": 33, "description": "Électricien qualifié, dépannage 24/7, installations complètes. Devis rapide.", "photo": "https://images.pexels.com/photos/8005397/pexels-photo-8005397.jpeg", "verified": True},
    {"name": "Fatou Sow", "service_key": "menage", "service": "Femme de ménage", "city": "Dakar", "price_type": "fixed", "price_amount": 12000, "rating": 4.9, "reviews_count": 121, "description": "Ménage complet d'appartement (jusqu'à 3 pièces), repassage inclus. Sérieuse et ponctuelle.", "photo": "https://images.pexels.com/photos/8817841/pexels-photo-8817841.jpeg", "verified": True},
    {"name": "Cheikh Ba", "service_key": "macon", "service": "Maçon", "city": "Thiès", "price_type": "quote", "price_amount": None, "rating": 4.5, "reviews_count": 19, "description": "Maçonnerie générale, carrelage, rénovation. Devis personnalisé après visite.", "photo": "https://images.pexels.com/photos/8961251/pexels-photo-8961251.jpeg", "verified": True},
    {"name": "Aminata Sy", "service_key": "prof", "service": "Professeur", "city": "Dakar", "price_type": "fixed", "price_amount": 8000, "rating": 5.0, "reviews_count": 56, "description": "Prof de maths & physique — collège & lycée. Cours à domicile de 1h30.", "photo": "https://images.pexels.com/photos/5212345/pexels-photo-5212345.jpeg", "verified": True},
    {"name": "Ousmane Kane", "service_key": "peintre", "service": "Peintre", "city": "Dakar", "price_type": "quote", "price_amount": None, "rating": 4.6, "reviews_count": 28, "description": "Peinture intérieure & extérieure, finitions soignées. Devis gratuit sur mesure.", "photo": "https://images.pexels.com/photos/1109543/pexels-photo-1109543.jpeg", "verified": True},
    {"name": "Sokhna Dieng", "service_key": "decorateur", "service": "Décoratrice", "city": "Dakar", "price_type": "quote", "price_amount": None, "rating": 4.8, "reviews_count": 22, "description": "Décoration événementielle, mariages, baptêmes. Devis personnalisé selon l'événement.", "photo": "https://images.pexels.com/photos/1181696/pexels-photo-1181696.jpeg", "verified": True},
    {"name": "Mamadou Sarr", "service_key": "clim", "service": "Climatisation", "city": "Dakar", "price_type": "from", "price_amount": 20000, "rating": 4.7, "reviews_count": 47, "description": "Installation & entretien climatisation toutes marques. Tarif variable selon puissance.", "photo": "https://images.pexels.com/photos/5877455/pexels-photo-5877455.jpeg", "verified": True},
    {"name": "Papis Gueye", "service_key": "jardinier", "service": "Jardinier", "city": "Saly", "price_type": "fixed", "price_amount": 10000, "rating": 4.6, "reviews_count": 31, "description": "Entretien jardin (jusqu'à 200 m²), taille de haies, arrosage automatique.", "photo": "https://images.pexels.com/photos/6231795/pexels-photo-6231795.jpeg", "verified": True},
    {"name": "Serigne Mbaye", "service_key": "chauffeur", "service": "Chauffeur", "city": "Dakar", "price_type": "from", "price_amount": 15000, "rating": 4.9, "reviews_count": 64, "description": "Chauffeur privé, aéroport & courses. Véhicule confort. Forfait journée disponible.", "photo": "https://images.pexels.com/photos/3771120/pexels-photo-3771120.jpeg", "verified": True},
    {"name": "Ndèye Faye", "service_key": "photographe", "service": "Photographe", "city": "Dakar", "price_type": "from", "price_amount": 75000, "rating": 5.0, "reviews_count": 38, "description": "Photographe portrait, mariage & évènements. Forfaits demi-journée / journée.", "photo": "https://images.pexels.com/photos/1264210/pexels-photo-1264210.jpeg", "verified": True},
    {"name": "Aliou Cissé", "service_key": "plombier", "service": "Plombier", "city": "Rufisque", "price_type": "fixed", "price_amount": 7500, "rating": 4.5, "reviews_count": 17, "description": "Fuites, chauffe-eau, wc. Intervention rapide. Forfait dépannage simple.", "photo": "https://images.pexels.com/photos/5691660/pexels-photo-5691660.jpeg", "verified": False},
    {"name": "Mariam Gassama", "service_key": "coiffeuse", "service": "Coiffeuse", "city": "Thiès", "price_type": "from", "price_amount": 10000, "rating": 4.6, "reviews_count": 41, "description": "Coiffure afro & modernes. Salon et à domicile. Tarif selon prestation.", "photo": "https://images.pexels.com/photos/3993451/pexels-photo-3993451.jpeg", "verified": True},
    {"name": "Bassirou Diallo", "service_key": "electricien", "service": "Électricien", "city": "Dakar", "price_type": "quote", "price_amount": None, "rating": 4.4, "reviews_count": 25, "description": "Câblage, tableaux électriques, urgences. Devis après diagnostic.", "photo": "https://images.pexels.com/photos/8005398/pexels-photo-8005398.jpeg", "verified": True},
    {"name": "Khady Ndoye", "service_key": "menage", "service": "Femme de ménage", "city": "Dakar", "price_type": "from", "price_amount": 8000, "rating": 4.7, "reviews_count": 63, "description": "Ménage régulier ou ponctuel. Tarif selon surface et fréquence.", "photo": "https://images.pexels.com/photos/8817842/pexels-photo-8817842.jpeg", "verified": True},
]

SEED_REVIEWS = [
    ("Aisha M.", 5, "Excellent travail, très professionnel !"),
    ("Ousmane T.", 5, "Ponctuel et efficace, je recommande vivement."),
    ("Fatima L.", 4, "Bon service, prix correct."),
    ("Modou B.", 5, "Parfait, à refaire sans hésiter."),
    ("Rokhaya D.", 4, "Bon travail dans l'ensemble."),
]


@api.post("/seed")
async def seed(request: Request, user=Depends(current_user)):
    """Seed idempotent — protégé (SEC-004).
    Seul un super-admin OU en mode DEBUG local peut ré-initialiser les données seed.
    """
    is_debug = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")
    is_super = bool(user.get("is_admin")) or (user.get("staff_role") == "super_admin")
    if not (is_debug or is_super):
        raise HTTPException(status_code=403, detail="Accès administrateur requis")
    # idempotent
    await db.providers.delete_many({"seeded": True})
    await db.reviews.delete_many({"seeded": True})
    await db.services.delete_many({"seeded": True})
    await db.ads.delete_many({"seeded": True})

    # ------ Sample Promo Codes (idempotent) ------
    _now = now_iso()
    _year_ahead = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    _month_ahead = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    _past = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
    seed_promos = [
        {"code": "JOKOO20",    "title": "20% de réduction",             "description": "Sur votre prochaine réservation.",
         "discount_type": "percent", "discount_value": 20, "min_amount_xof": 5000, "max_discount_xof": 5000,
         "category": "all", "starts_at": None, "ends_at": _year_ahead, "usage_per_user": 3, "usage_limit": None,
         "first_booking_only": False, "active": True},
        {"code": "BIENVENUE",  "title": "3 000 F CFA offerts",           "description": "Cadeau de bienvenue pour votre 1re résa.",
         "discount_type": "fixed", "discount_value": 3000, "min_amount_xof": 8000, "max_discount_xof": None,
         "category": "all", "starts_at": None, "ends_at": _year_ahead, "usage_per_user": 1, "usage_limit": None,
         "first_booking_only": True, "active": True},
        {"code": "FAMILLE10",  "title": "10% sur Jokoo Family",         "description": "Baby-sitting & tutorat uniquement.",
         "discount_type": "percent", "discount_value": 10, "min_amount_xof": None, "max_discount_xof": 3000,
         "category": "family", "starts_at": None, "ends_at": _year_ahead, "usage_per_user": 5, "usage_limit": None,
         "first_booking_only": False, "active": True},
        {"code": "MOBILITE500","title": "500 F sur Mobilité",           "description": "Sur vos trajets covoiturage.",
         "discount_type": "fixed", "discount_value": 500, "min_amount_xof": 1500, "max_discount_xof": None,
         "category": "mobility", "starts_at": None, "ends_at": _month_ahead, "usage_per_user": 10, "usage_limit": None,
         "first_booking_only": False, "active": True},
        {"code": "RAMADAN25",  "title": "25% Spécial Ramadan",           "description": "Offre limitée à durée réduite.",
         "discount_type": "percent", "discount_value": 25, "min_amount_xof": 10000, "max_discount_xof": 8000,
         "category": "all", "starts_at": None, "ends_at": _past, "usage_per_user": 1, "usage_limit": None,
         "first_booking_only": False, "active": True},
    ]
    for pc in seed_promos:
        exists = await db.promo_codes.find_one({"code": pc["code"]}, {"_id": 0, "code": 1})
        if not exists:
            await db.promo_codes.insert_one({
                "id": str(uuid.uuid4()), **pc,
                "created_at": _now, "updated_at": _now, "seeded": True,
            })

    # Seed super_admin + un membre par rôle (idempotent)
    seed_staff = [
        ("superadmin@jokoo.sn", "super_admin", "Awa Super Admin"),
        ("admin2@jokoo.sn",    "admin",       "Ibrahim Admin"),
        ("marketing@jokoo.sn", "marketing",   "Ndeye Marketing"),
        ("support@jokoo.sn",   "support",     "Ousmane Support"),
        ("operator@jokoo.sn",  "operator",    "Fatou Opératrice"),
        ("tech@jokoo.sn",      "tech",        "Cheikh Tech"),
    ]
    for email, sr, nm in seed_staff:
        exists = await db.users.find_one({"email": email})
        payload = {
            "staff_role": sr,
            "permissions": [],
            "active": True,
            "is_admin": sr == "super_admin",
        }
        if not exists:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": email,
                "password_hash": hash_password("Staff1234!"),
                "name": nm,
                "role": "client",
                "phone": None,
                "city": "Dakar",
                "avatar": None,
                "created_at": now_iso(),
                **payload,
            })
        else:
            await db.users.update_one({"email": email}, {"$set": payload})

    # Legacy admin@jokoo.sn devient super_admin
    admin_email = "admin@jokoo.sn"
    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password("Admin1234!"),
            "name": "Admin Jokoo",
            "role": "client",
            "is_admin": True,
            "staff_role": "super_admin",
            "permissions": [],
            "active": True,
            "phone": None,
            "city": "Dakar",
            "avatar": None,
            "created_at": now_iso(),
        })
    else:
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"is_admin": True, "staff_role": "super_admin"}},
        )

    # ------ Demo end-user accounts (QA & App Store / Play Store review) ------
    # Ces comptes sont documentés dans /app/memory/test_credentials.md et doivent
    # exister systématiquement pour permettre aux reviewers stores de tester
    # le parcours Client + le tableau de bord Prestataire.
    demo_end_users = [
        {
            "email": "client@jokoo.sn",
            "password": "Passw0rd!",
            "name": "Aïda Client",
            "role": "client",
            "phone": "+221770001111",
            "city": "Dakar",
            "avatar": "https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg",
        },
        {
            "email": "pro@jokoo.sn",
            "password": "Passw0rd!",
            "name": "Moussa Prestataire",
            "role": "prestataire",
            "phone": "+221770002222",
            "city": "Dakar",
            "avatar": "https://images.pexels.com/photos/1516680/pexels-photo-1516680.jpeg",
        },
    ]
    for du in demo_end_users:
        existing = await db.users.find_one({"email": du["email"]})
        if existing:
            # Rafraîchit le mot de passe pour rester en phase avec test_credentials.md
            await db.users.update_one(
                {"email": du["email"]},
                {"$set": {
                    "password_hash": hash_password(du["password"]),
                    "role": du["role"],
                    "active": True,
                }},
            )
        else:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": du["email"],
                "password_hash": hash_password(du["password"]),
                "name": du["name"],
                "role": du["role"],
                "phone": du["phone"],
                "city": du["city"],
                "avatar": du["avatar"],
                "is_admin": False,
                "staff_role": None,
                "permissions": [],
                "active": True,
                "created_at": now_iso(),
            })

    inserted = 0
    dakar_zones = ["Almadies", "Plateau", "Yoff", "Ouakam", "Point E", "Sacré-Cœur", "Mermoz"]
    for s in SEED_PROVIDERS:
        pid = str(uuid.uuid4())
        zones = dakar_zones if s["city"] == "Dakar" else [s["city"]]
        doc = {
            "id": pid,
            "user_id": pid,
            "seeded": True,
            "avatar": s.get("photo"),
            **s,
            "zones": zones,
            "hours": "Lun-Sam · 8h-19h",
            "gallery": [s.get("photo")],
            "diplomas": [],
            "id_card": None,
            "subscription_active": True,
            "subscription_until": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            "sponsored_until": (datetime.now(timezone.utc) + timedelta(days=15)).isoformat() if inserted in (1, 5, 9) else None,
            "phone": "+2217700000" + str(inserted).zfill(2),
            "created_at": now_iso(),
        }
        await db.providers.insert_one(doc)

        # 2 prestations par prestataire (adaptées au métier)
        base = s.get("price_amount") or 10000
        prestations_examples = {
            "plombier":    [("Débouchage évacuation", "Débouchage rapide de canalisation", "fixed", 8000, 45),
                            ("Réparation fuite", "Diagnostic et réparation de fuite d'eau", "from", base, 60)],
            "electricien": [("Diagnostic électrique", "Contrôle complet du tableau", "fixed", 10000, 60),
                            ("Installation prise/interrupteur", "Pose ou remplacement", "from", base, 30)],
            "macon":       [("Pose de carrelage", "Pose au m²", "quote", None, None),
                            ("Rénovation muret", "Reprise et enduit", "quote", None, None)],
            "peintre":     [("Peinture 1 pièce", "Murs + plafond, peinture fournie", "from", 35000, None),
                            ("Façade extérieure", "Ravalement complet", "quote", None, None)],
            "menage":      [("Ménage complet 3 pièces", "Nettoyage + repassage", "fixed", base, 180),
                            ("Grand ménage post-emménagement", "Nettoyage intensif", "from", base * 2 if base else 20000, None)],
            "coiffeuse":   [("Tresses complètes", "Tresses avec mèches, à domicile", "fixed", base, 180),
                            ("Défrisage + brushing", "Salon ou domicile", "from", int(base * 0.7) if base else 8000, 90)],
            "prof":        [("Cours particulier 1h30", "Maths & physique — collège / lycée", "fixed", base, 90),
                            ("Pack 4 séances", "Réduction pour engagement mensuel", "from", int(base * 3.5) if base else 25000, None)],
            "decorateur":  [("Déco mariage", "Décoration complète cérémonie", "quote", None, None),
                            ("Déco baptême", "Ambiance et scénographie", "quote", None, None)],
            "clim":        [("Installation split 12000 BTU", "Fourniture + pose", "from", base, 180),
                            ("Entretien annuel", "Nettoyage filtres et recharge", "fixed", 12000, 60)],
            "jardinier":   [("Entretien jardin < 200m²", "Tonte + taille", "fixed", base, 120),
                            ("Création massif", "Conception et plantation", "quote", None, None)],
            "chauffeur":   [("Course aéroport", "Prise en charge domicile ↔ AIBD", "fixed", base, 60),
                            ("Journée complète 8h", "Véhicule + chauffeur", "from", int(base * 3) if base else 40000, 480)],
            "photographe": [("Séance portrait 1h", "Studio ou extérieur", "fixed", base, 60),
                            ("Reportage mariage journée", "Photos + retouches", "from", int(base * 4) if base else 200000, None)],
        }
        exs = prestations_examples.get(s["service_key"], [
            ("Prestation standard", s.get("description", ""), s.get("price_type", "quote"), s.get("price_amount"), None),
        ])
        for name, desc, pt, amt, dur in exs:
            await db.services.insert_one({
                "id": str(uuid.uuid4()),
                "seeded": True,
                "provider_id": pid,
                "name": name,
                "description": desc,
                "category_key": s["service_key"],
                "photos": [s.get("photo")] if s.get("photo") else [],
                "price_type": pt,
                "price_amount": amt,
                "duration_minutes": dur,
                "active": True,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            })

        # seed reviews
        for name, rating, comment in SEED_REVIEWS[: (3 + inserted % 3)]:
            await db.reviews.insert_one({
                "id": str(uuid.uuid4()),
                "seeded": True,
                "provider_id": pid,
                "author_id": "seed",
                "author_name": name,
                "author_avatar": None,
                "rating": rating,
                "comment": comment,
                "photos": [],
                "created_at": now_iso(),
            })
        inserted += 1

    # Seed a few ads
    ads_seed = [
        {
            "type": "banner",
            "title": "Trouvez votre pro en 2 min",
            "description": "Des milliers de professionnels vérifiés à Dakar & Thiès",
            "button_label": "Découvrir",
            "link": "app:home",
            "media": [{"kind": "image", "url": "https://images.unsplash.com/photo-1657302699239-c350f0372260"}],
            "placements": ["home"],
            "category_key": None,
            "target_audience": "all",
            "display_mode": "single",
        },
        {
            "type": "image",
            "title": "-20% sur votre 1ère réservation",
            "description": "Utilisez le code JOKOO20",
            "button_label": "Profiter",
            "link": "app:home",
            "media": [{"kind": "image", "url": "https://images.pexels.com/photos/8005368/pexels-photo-8005368.jpeg"}],
            "placements": ["between_lists"],
            "category_key": None,
            "target_audience": "client",
            "display_mode": "single",
        },
        {
            "type": "banner",
            "title": "Devenez prestataire vérifié",
            "description": "Recevez plus de demandes avec Jokoo Pro",
            "button_label": "S'inscrire",
            "link": "app:home",
            "media": [{"kind": "image", "url": "https://images.pexels.com/photos/8961251/pexels-photo-8961251.jpeg"}],
            "placements": ["home"],
            "category_key": None,
            "target_audience": "prestataire",
            "display_mode": "single",
        },
        {
            "type": "carousel",
            "title": "Nos meilleurs plombiers",
            "description": "Interventions en moins de 2h",
            "button_label": "Voir",
            "link": "category:plombier",
            "media": [
                {"kind": "image", "url": "https://images.pexels.com/photos/8961251/pexels-photo-8961251.jpeg"},
                {"kind": "image", "url": "https://images.pexels.com/photos/8005368/pexels-photo-8005368.jpeg"},
            ],
            "placements": ["category"],
            "category_key": "plombier",
            "target_audience": "all",
            "display_mode": "carousel_queue",
        },
    ]
    for a in ads_seed:
        await db.ads.insert_one({
            "id": str(uuid.uuid4()),
            "seeded": True,
            **a,
            "start_at": None,
            "end_at": None,
            "active": True,
            "suspended": False,
            "impressions": 0,
            "clicks": 0,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })

    # Seed rides (Mobility · Covoiturage)
    await db.rides.delete_many({"seeded": True})
    demo_driver_email = "chauffeur@jokoo.sn"
    demo_driver = await db.users.find_one({"email": demo_driver_email})
    if not demo_driver:
        did = str(uuid.uuid4())
        demo_driver = {
            "id": did,
            "email": demo_driver_email,
            "password_hash": hash_password("Driver1234!"),
            "name": "Ismaïla Ndao",
            "role": "prestataire",
            "phone": "+221771234567",
            "city": "Dakar",
            "avatar": "https://images.pexels.com/photos/3771120/pexels-photo-3771120.jpeg",
            "is_admin": False,
            "staff_role": None,
            "permissions": [],
            "created_at": now_iso(),
        }
        await db.users.insert_one(demo_driver)
    else:
        did = demo_driver["id"]

    today = datetime.now(timezone.utc)
    demo_rides = [
        {
            "from_city": "Dakar", "from_address": "Plateau",
            "to_city": "Thiès", "to_address": "Centre-ville",
            "stops": [{"city": "Rufisque", "address": "Gare routière"}],
            "date": (today + timedelta(days=1)).date().isoformat(),
            "time": "07:30",
            "seats_total": 4, "price_xof": 3000, "distance_type": "long",
            "recurrence": "none", "recurrence_days": [],
            "vehicle_model": "Toyota Yaris", "vehicle_plate": "DK 4521 A", "vehicle_color": "Blanc",
            "notes": "Départ ponctuel — merci de prévoir de la monnaie.",
        },
        {
            "from_city": "Dakar", "from_address": "Yoff Aéroport",
            "to_city": "Saly", "to_address": "Résidence les Manguiers",
            "stops": [],
            "date": (today + timedelta(days=2)).date().isoformat(),
            "time": "10:00",
            "seats_total": 3, "price_xof": 7500, "distance_type": "long",
            "recurrence": "none", "recurrence_days": [],
            "vehicle_model": "Hyundai Tucson", "vehicle_plate": "DK 8891 C", "vehicle_color": "Gris",
            "notes": "Climatisation, wifi.",
        },
        {
            "from_city": "Dakar", "from_address": "Almadies",
            "to_city": "Dakar", "to_address": "Sacré-Cœur",
            "stops": [{"city": "Dakar", "address": "Point E"}],
            "date": (today + timedelta(days=1)).date().isoformat(),
            "time": "17:45",
            "seats_total": 2, "price_xof": 1500, "distance_type": "short",
            "recurrence": "weekly", "recurrence_days": ["mon", "tue", "wed", "thu", "fri"],
            "vehicle_model": "Renault Clio", "vehicle_plate": "DK 1023 B", "vehicle_color": "Rouge",
            "notes": "Trajet après le bureau — récurrent lundi au vendredi.",
        },
        {
            "from_city": "Thiès", "from_address": "Randoulène",
            "to_city": "Dakar", "to_address": "Plateau",
            "stops": [],
            "date": (today + timedelta(days=3)).date().isoformat(),
            "time": "06:15",
            "seats_total": 4, "price_xof": 2500, "distance_type": "long",
            "recurrence": "none", "recurrence_days": [],
            "vehicle_model": "Peugeot 208", "vehicle_plate": "TH 3345 D", "vehicle_color": "Bleu",
            "notes": "Idéal pour rejoindre le bureau tôt.",
        },
    ]
    for r in demo_rides:
        rid = str(uuid.uuid4())
        info = await _driver_info(did)
        accepts_parcels = r["distance_type"] == "long"
        await db.rides.insert_one({
            "id": rid,
            "seeded": True,
            **info,
            **r,
            "seats_available": r["seats_total"],
            "status": "active",
            "accepts_parcels": accepts_parcels,
            "parcel_price_xof": 2500 if accepts_parcels else 0,
            "parcel_max_kg": 15 if accepts_parcels else 0,
            "parcel_payment_mode": "app_or_cash" if accepts_parcels else "app_or_cash",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })

    # Seed babysitters (Jokoo Family)
    await db.babysitters.delete_many({"seeded": True})
    demo_sitters = [
        {
            "email": "aisha.family@jokoo.sn", "password": "Family1234!",
            "name": "Aïsha Mbaye", "phone": "+221771001100",
            "avatar": "https://images.pexels.com/photos/1181695/pexels-photo-1181695.jpeg",
            "bio": "Étudiante en Master de Lettres modernes, passionnée par les enfants. Je propose des ateliers bilingues français-anglais.",
            "profile_type": "student",
            "university": "UCAD Dakar", "level": "master", "field_of_study": "Lettres modernes anglais",
            "city": "Dakar",
            "languages": [{"code": "fr", "level": "native"}, {"code": "en", "level": "fluent"}, {"code": "wo", "level": "native"}],
            "age_specialties": ["3-5", "6-10"],
            "skills": ["languages", "homework", "stories", "art", "educational_games"],
            "services": ["babysitting", "tutoring", "educational_activities"],
            "tutoring_subjects": ["Anglais", "Français"],
            "available_today": True, "night_care": False, "can_travel": True,
            "hourly_rate_xof": 3000, "psc1_certified": True,
            "student_card_verified": True, "identity_verified": True, "references_verified": True,
            "recommended_by_jokoo": True,
            "rating": 4.9, "reviews_count": 27,
        },
        {
            "email": "moussa.family@jokoo.sn", "password": "Family1234!",
            "name": "Moussa Diop", "phone": "+221771001101",
            "avatar": "https://images.pexels.com/photos/1043471/pexels-photo-1043471.jpeg",
            "bio": "Étudiant en Licence de Mathématiques. J'adore le tutorat pour élèves du collège. Trilingue.",
            "profile_type": "student",
            "university": "UGB Saint-Louis", "level": "licence", "field_of_study": "Mathématiques",
            "city": "Dakar",
            "languages": [{"code": "fr", "level": "native"}, {"code": "en", "level": "intermediate"}, {"code": "ar", "level": "fluent"}, {"code": "wo", "level": "native"}],
            "age_specialties": ["6-10", "11-14"],
            "skills": ["homework", "sport", "outdoor", "school_pickup"],
            "services": ["tutoring", "school_pickup"],
            "tutoring_subjects": ["Mathématiques", "Physique", "SVT"],
            "available_today": False, "night_care": False, "can_travel": True,
            "hourly_rate_xof": 2500, "psc1_certified": False,
            "student_card_verified": True, "identity_verified": True, "references_verified": False,
            "recommended_by_jokoo": False,
            "rating": 4.7, "reviews_count": 15,
        },
        {
            "email": "fatou.family@jokoo.sn", "password": "Family1234!",
            "name": "Fatou Sarr", "phone": "+221771001102",
            "avatar": "https://images.pexels.com/photos/1858175/pexels-photo-1858175.jpeg",
            "bio": "Étudiante en musicologie. J'apprends aux enfants à chanter et à jouer d'instruments. Douce et créative.",
            "profile_type": "student",
            "university": "UCAD Dakar", "level": "licence", "field_of_study": "Musicologie",
            "city": "Dakar",
            "languages": [{"code": "fr", "level": "native"}, {"code": "en", "level": "basic"}, {"code": "wo", "level": "native"}],
            "age_specialties": ["0-2", "3-5"],
            "skills": ["music", "art", "stories", "cooking", "baby_care"],
            "services": ["babysitting", "educational_activities"],
            "tutoring_subjects": [],
            "available_today": True, "night_care": True, "can_travel": False,
            "hourly_rate_xof": 2200, "psc1_certified": True,
            "student_card_verified": True, "identity_verified": True, "references_verified": True,
            "recommended_by_jokoo": True,
            "rating": 5.0, "reviews_count": 32,
        },
        {
            "email": "ibrahim.family@jokoo.sn", "password": "Family1234!",
            "name": "Prof. Ibrahim Ndiaye", "phone": "+221771001103",
            "avatar": "https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg",
            "bio": "Professeur agrégé de Physique, doctorant. 10 ans d'expérience en cours particuliers de collège et lycée.",
            "profile_type": "teacher",
            "university": "UCAD Dakar", "level": "doctorat", "field_of_study": "Physique appliquée",
            "city": "Thiès",
            "languages": [{"code": "fr", "level": "native"}, {"code": "en", "level": "fluent"}, {"code": "ar", "level": "intermediate"}, {"code": "es", "level": "intermediate"}, {"code": "wo", "level": "native"}],
            "age_specialties": ["11-14"],
            "skills": ["homework", "languages", "school_pickup", "holiday_care"],
            "services": ["tutoring", "school_pickup", "holiday_care"],
            "tutoring_subjects": ["Mathématiques", "Physique", "Chimie", "Anglais"],
            "available_today": False, "night_care": False, "can_travel": True,
            "hourly_rate_xof": 4500, "psc1_certified": False,
            "student_card_verified": True, "identity_verified": True, "references_verified": True,
            "recommended_by_jokoo": True,
            "rating": 4.8, "reviews_count": 41,
        },
        {
            "email": "khady.family@jokoo.sn", "password": "Family1234!",
            "name": "Khady Fall", "phone": "+221771001104",
            "avatar": "https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg",
            "bio": "Étudiante en Sciences de l'éducation. Pédagogue certifiée PSC1. Bienveillance et énergie.",
            "profile_type": "student",
            "university": "UASZ Ziguinchor", "level": "master", "field_of_study": "Sciences de l'éducation",
            "city": "Dakar",
            "languages": [{"code": "fr", "level": "native"}, {"code": "en", "level": "fluent"}, {"code": "es", "level": "fluent"}, {"code": "wo", "level": "native"}],
            "age_specialties": ["0-2", "3-5", "6-10"],
            "skills": ["languages", "homework", "art", "cooking", "stories", "educational_games", "baby_care", "holiday_care"],
            "services": ["babysitting", "tutoring", "educational_activities", "holiday_care"],
            "tutoring_subjects": ["Français", "Anglais", "Espagnol"],
            "available_today": True, "night_care": True, "can_travel": True,
            "hourly_rate_xof": 3500, "psc1_certified": True,
            "student_card_verified": True, "identity_verified": True, "references_verified": True,
            "recommended_by_jokoo": True,
            "rating": 4.95, "reviews_count": 58,
        },
    ]
    for s in demo_sitters:
        # ensure user account
        u = await db.users.find_one({"email": s["email"]})
        if not u:
            uid = str(uuid.uuid4())
            u = {
                "id": uid,
                "email": s["email"],
                "password_hash": hash_password(s["password"]),
                "name": s["name"],
                "role": "client",
                "phone": s["phone"],
                "city": s["city"],
                "avatar": s["avatar"],
                "is_admin": False,
                "staff_role": None,
                "permissions": [],
                "created_at": now_iso(),
            }
            await db.users.insert_one(u)
        else:
            uid = u["id"]
        # Derive back-compat flags
        offers_baby = "babysitting" in s["services"] or "educational_activities" in s["services"]
        offers_tuto = "tutoring" in s["services"]
        # Compute verified_plus
        verified_plus = bool(
            s["identity_verified"]
            and s["references_verified"]
            and s["psc1_certified"]
            and s["rating"] >= 4.5
            and s["reviews_count"] >= 5
        )
        await db.babysitters.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": uid,
            "seeded": True,
            "name": s["name"],
            "phone": s["phone"],
            "avatar": s["avatar"],
            "bio": s["bio"],
            "profile_type": s["profile_type"],
            "university": s["university"],
            "level": s["level"],
            "field_of_study": s.get("field_of_study", ""),
            "city": s["city"],
            "languages": s["languages"],
            "age_specialties": s["age_specialties"],
            "skills": s["skills"],
            "services": s["services"],
            "offers_babysitting": offers_baby,
            "offers_tutoring": offers_tuto,
            "tutoring_subjects": s["tutoring_subjects"],
            "available_today": s["available_today"],
            "night_care": s["night_care"],
            "can_travel": s["can_travel"],
            "hourly_rate_xof": s["hourly_rate_xof"],
            "psc1_certified": s["psc1_certified"],
            "emergency_contact": {"name": f"Contact de {s['name'].split()[-1]}", "phone": s["phone"]},
            "student_card": None,
            "student_card_verified": s["student_card_verified"],
            "identity_verified": s["identity_verified"],
            "references_verified": s["references_verified"],
            "recommended_by_jokoo": s["recommended_by_jokoo"],
            "verified_plus": verified_plus,
            "status": "active",
            "rating": s["rating"],
            "reviews_count": s["reviews_count"],
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })

    # Seed legal documents (Jokoo Legal Center)
    #
    # Les documents essentiels à la review App Store / Play Store (Privacy Policy,
    # CGU, Mentions légales, Cookies, Conditions Clients & Prestataires) sont
    # publiés avec un contenu réel. Les documents secondaires restent des
    # placeholders "à rédiger" que l'équipe juridique enrichira ensuite via
    # l'admin CMS — cela n'impacte pas la review store.
    LEGAL_DOCS = [
        ("cgu", "Conditions générales d'utilisation", "conditions", True, 10),
        ("privacy", "Politique de confidentialité", "conditions", True, 20),
        ("cookies", "Politique relative aux cookies", "conditions", False, 30),
        ("mentions-legales", "Mentions légales", "conditions", False, 40),
        ("terms-prestataires", "Conditions des prestataires", "conditions", False, 50),
        ("terms-clients", "Conditions des clients", "conditions", False, 60),
        ("refund-policy", "Politique de remboursement", "paiements", False, 70),
        ("cancellation-policy", "Politique d'annulation", "paiements", False, 80),
        ("payment-policy", "Politique de paiement", "paiements", False, 90),
        ("verification-policy", "Politique de vérification des prestataires", "securite", False, 100),
        ("security-policy", "Politique de sécurité", "securite", False, 110),
        ("anti-fraud", "Politique anti-fraude", "securite", False, 120),
        ("content-moderation", "Politique de modération des contenus", "communaute", False, 130),
        ("children-protection", "Politique de protection des enfants", "securite", False, 140),
        ("data-protection", "Politique de protection des données", "conditions", False, 150),
        ("geolocation-policy", "Politique de géolocalisation", "conditions", False, 160),
        ("reviews-policy", "Politique des avis et évaluations", "communaute", False, 170),
        ("community-charter", "Charte de la communauté", "communaute", False, 180),
        ("code-of-conduct", "Code de conduite", "communaute", False, 190),
        ("faq", "FAQ", "aide", False, 200),
        ("help-center", "Centre d'aide", "aide", False, 210),
        ("legal-contact", "Contact juridique", "aide", False, 220),
    ]

    # Contenu production-ready pour les documents review-critical.
    LEGAL_CONTENTS = _build_seed_legal_contents()
    # Bumping this constant forces the seed to overwrite existing docs. Increment
    # whenever we ship material content changes (translations, domain change,
    # regulatory update). Docs edited manually via the admin UI persist as long
    # as their DB `content_version` matches or exceeds this value.
    SEED_CONTENT_VERSION = 4  # 2026-08-06 — enriched cookies/mentions/terms/refund policy contents

    for slug, title, category, requires_acc, order in LEGAL_DOCS:
        existing = await db.legal_documents.find_one({"slug": slug, "language": "fr", "country": "SN"})
        content = LEGAL_CONTENTS.get(slug)
        if not content:
            content = (
                f"# {title}\n\n"
                f"> ⚠️ **Contenu à rédiger** — Ce document est un espace réservé.\n"
                f"> L'équipe juridique de Jokoo publiera prochainement la version officielle.\n\n"
                f"## À propos de ce document\n\n"
                f"Cette section détaillera prochainement la politique de Jokoo concernant : "
                f"**{title.lower()}**.\n\n"
                f"## Sections prévues\n\n"
                f"- Objet du document\n- Champ d'application\n- Vos droits et obligations\n"
                f"- Nos engagements\n- Modifications & mises à jour\n- Contact\n\n"
                f"---\n\n"
                f"*Pour toute question, contactez-nous à support@jokooservices.com.*\n"
            )
        summary = f"Document juridique de Jokoo — {title}"
        now = now_iso()

        if existing:
            # Preserve admin edits by only upserting when our seed content version
            # is newer OR the DB was seeded with a shorter/placeholder version.
            db_ver = int(existing.get("content_version", 0))
            db_len = len(existing.get("content", "") or "")
            seed_len = len(content)
            # Trigger update if seed version bumped OR DB has clearly-stale (much shorter) content.
            needs_update = (db_ver < SEED_CONTENT_VERSION) or (db_len < seed_len * 0.6)
            if not needs_update:
                continue
            new_version = int(existing.get("version", 1)) + 1
            await db.legal_documents.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "content": content,
                    "summary": summary,
                    "title": title,
                    "category": category,
                    "requires_acceptance": requires_acc,
                    "order": order,
                    "version": new_version,
                    "content_version": SEED_CONTENT_VERSION,
                    "published": True,
                    "effective_date": now[:10],
                    "updated_at": now,
                    "updated_by": "seed_content_v4",
                }},
            )
            await db.legal_versions.insert_one({
                "id": str(uuid.uuid4()),
                **{k: v for k, v in existing.items() if k != "_id"},
                "content": content, "summary": summary, "title": title,
                "version": new_version, "content_version": SEED_CONTENT_VERSION,
                "effective_date": now[:10], "updated_at": now, "updated_by": "seed_content_v4",
                "author_id": "system",
            })
            continue

        doc = {
            "slug": slug,
            "title": title,
            "content": content,
            "summary": summary,
            "category": category,
            "language": "fr",
            "country": "SN",
            "version": 1,
            "content_version": SEED_CONTENT_VERSION,
            "order": order,
            "requires_acceptance": requires_acc,
            "published": True,
            "effective_date": now[:10],
            "created_at": now,
            "updated_at": now,
            "updated_by": "system",
        }
        await db.legal_documents.insert_one(doc)
        await db.legal_versions.insert_one({"id": str(uuid.uuid4()), **doc, "author_id": "system"})

    return {"ok": True, "providers": inserted, "admin_email": admin_email}


# ---------- health ----------
@api.get("/")
async def root():
    return {"service": "Jokoo API", "status": "ok"}


# ---------- store assets download (App Store screenshots + docs) ----------
# TEMPORARY: exposes /api/store-assets/* for downloading generated files from
# the pod filesystem. Safe because it only serves whitelisted files inside
# /app/store-assets (no path traversal possible).
_STORE_ASSETS_DIR = Path("/app/store-assets/screenshots/final")
_STORE_ASSETS_IPAD_DIR = Path("/app/store-assets/screenshots/ipad")
_STORE_ASSETS_ZIP = Path("/app/store-assets/jokoo_appstore_screenshots.zip")
_STORE_ASSETS_IPAD_ZIP = Path("/app/store-assets/jokoo_ipad_screenshots.zip")
_STORE_ASSETS_ROOT = Path("/app/store-assets")
# Additional whitelisted documents that can be downloaded via /api/store-assets/docs/{name}
_STORE_ASSETS_DOCS = {
    "geographic_availability_strategy.md": ("text/markdown; charset=utf-8", "geographic_availability_strategy.md"),
    "geographic_availability_strategy.pdf": ("application/pdf", "Jokoo_couverture_geographique.pdf"),
    "geographic_availability.csv": ("text/csv; charset=utf-8", "geographic_availability.csv"),
    "geographic_availability_checklist.txt": ("text/plain; charset=utf-8", "geographic_availability_checklist.txt"),
}


@api.get("/store-assets/zip")
async def download_store_assets_zip():
    if not _STORE_ASSETS_ZIP.exists():
        raise HTTPException(404, "Screenshots archive not generated yet")
    return FileResponse(
        _STORE_ASSETS_ZIP,
        media_type="application/zip",
        filename="jokoo_appstore_screenshots.zip",
    )


@api.get("/store-assets/ipad-zip")
async def download_ipad_assets_zip():
    if not _STORE_ASSETS_IPAD_ZIP.exists():
        raise HTTPException(404, "iPad screenshots archive not generated yet")
    return FileResponse(
        _STORE_ASSETS_IPAD_ZIP,
        media_type="application/zip",
        filename="jokoo_ipad_screenshots.zip",
    )


@api.get("/store-assets/ipad/{filename}")
async def download_ipad_asset(filename: str):
    if "/" in filename or "\\" in filename or not filename.endswith(".png"):
        raise HTTPException(400, "Invalid filename")
    target = _STORE_ASSETS_IPAD_DIR / filename
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "iPad screenshot not found")
    return FileResponse(target, media_type="image/png", filename=filename)


@api.get("/store-assets/list")
async def list_store_assets():
    items = []
    if _STORE_ASSETS_DIR.exists():
        items = [
            {"name": p.name, "size_kb": p.stat().st_size // 1024, "type": "screenshot"}
            for p in sorted(_STORE_ASSETS_DIR.glob("*.png"))
        ]
    docs = []
    for name in _STORE_ASSETS_DOCS:
        f = _STORE_ASSETS_ROOT / name
        if f.exists():
            docs.append({"name": name, "size_kb": max(1, f.stat().st_size // 1024), "type": "document"})
    zip_exists = _STORE_ASSETS_ZIP.exists()
    return {
        "screenshots": items,
        "documents": docs,
        "zip_available": zip_exists,
        "zip_size_kb": (_STORE_ASSETS_ZIP.stat().st_size // 1024) if zip_exists else None,
    }


@api.get("/store-assets/docs/{filename}")
async def download_store_asset_doc(filename: str):
    """Serve whitelisted marketing/strategy documents (CSV, TXT, MD)."""
    if filename not in _STORE_ASSETS_DOCS:
        raise HTTPException(404, "Document not available")
    media_type, download_name = _STORE_ASSETS_DOCS[filename]
    target = _STORE_ASSETS_ROOT / filename
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "Document not found on disk")
    return FileResponse(target, media_type=media_type, filename=download_name)


@api.get("/store-assets/{filename}")
async def download_store_asset(filename: str):
    # Whitelist: only PNG files inside the fixed screenshots directory.
    if "/" in filename or "\\" in filename or not filename.endswith(".png"):
        raise HTTPException(400, "Invalid filename")
    target = _STORE_ASSETS_DIR / filename
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "Screenshot not found")
    return FileResponse(target, media_type="image/png", filename=filename)


# ---------- mount ----------
app.include_router(api)

# Push notifications (Emergent-managed / SuprSend relay) — legacy internal router
from push import push_router  # noqa: E402
app.include_router(push_router)

# 📢 CRM — Push Campaigns (Phase 1 complète)
from push_crm import create_push_crm_router, push_scheduler_loop  # noqa: E402
_push_crm_router = create_push_crm_router(
    db=db,
    send_push=send_push,
    current_user=current_user,
    require_admin=require_admin,
    now_iso=now_iso,
    log=log,
)
# Le préfixe /admin/push est déjà défini dans le router → montage sous /api
app.include_router(_push_crm_router, prefix="/api")


# 🤝 Jokoo Partners — programme d'affiliation (Ambassadeurs)
from ambassadors import (  # noqa: E402
    create_ambassadors_router,
    ensure_indexes as _ambassadors_ensure_indexes,
    hook_user_registered as _amb_hook_user_registered,
    hook_kyc_verified as _amb_hook_kyc_verified,
    hook_booking_completed as _amb_hook_booking_completed,
)
_ambassadors_router = create_ambassadors_router(
    db=db,
    current_user=current_user,
    require_admin=require_admin,
    send_push=send_push,
)
app.include_router(_ambassadors_router, prefix="/api")


# 💰 Wallet & Payments v2 — production-grade financial engine
from wallet.router import build_router as _build_wallet_router  # noqa: E402
from wallet.setup import create_indexes as _wallet_create_indexes  # noqa: E402
from wallet import service as _wallet_service  # noqa: E402
from wallet import commission as _wallet_commission  # noqa: E402
from wallet import jokoo_pro as _wallet_jokoo_pro  # noqa: E402
from wallet import notify as _wallet_notify  # noqa: E402

# Bind our real push implementation so wallet events trigger mobile notifs
_wallet_notify.bind_push(send_push)


def _require_admin_dep(user=Depends(current_user)) -> dict:
    """FastAPI dependency wrapper around `require_admin`."""
    require_admin(user)
    return user


_wallet_user_router, _wallet_admin_router = _build_wallet_router(
    db,
    current_user=current_user,
    require_admin=_require_admin_dep,
)
app.include_router(_wallet_user_router, prefix="/api")
app.include_router(_wallet_admin_router, prefix="/api")


@app.on_event("startup")
async def _wallet_startup():
    """Initialize wallet indexes & platform master wallet."""
    try:
        await _wallet_create_indexes(db)
        await _wallet_service.ensure_platform_wallet(db)
        log.info("[wallet] engine v2 ready")
    except Exception as _e:
        try:
            log.warning(f"[wallet] startup skip: {_e}")
        except Exception:
            pass


@app.on_event("startup")
async def _ambassadors_startup():
    """Crée les index MongoDB nécessaires au module ambassadors."""
    try:
        await _ambassadors_ensure_indexes(db)
    except Exception as _e:
        log.warning("ambassadors ensure_indexes failed: %s", _e)


@app.on_event("startup")
async def _push_scheduler_startup():
    """Démarre la boucle de traitement des campagnes programmées."""
    import asyncio as _asyncio
    _asyncio.create_task(push_scheduler_loop(db=db, send_push=send_push, log=log, poll_seconds=60))


# 🚗 Mobility v2 — Marketplace covoiturage bidirectionnelle
from rides_v2.router import build_mobility_router as _build_mobility_router  # noqa: E402
from rides_v2 import notify as _rv2_notify  # noqa: E402
from rides_v2 import service as _rv2_service  # noqa: E402
from rides_v2.expiration import start_expiration_loop as _rv2_expiration_loop  # noqa: E402

_rv2_notify.bind_push(send_push)


async def _rv2_driver_info(user_id: str) -> dict:
    """Lookup async des infos conducteur pour attacher aux offres."""
    u = await db.users.find_one({"id": user_id}, {"_id": 0}) or {}
    completed = await db.rides.count_documents({"driver_id": user_id, "status": "completed"})
    return {
        "name": u.get("name") or u.get("email") or "",
        "avatar": u.get("avatar") or u.get("photo_url") or "",
        "rating": u.get("rating"),
        "completed_rides": completed,
        "verified": bool(u.get("verified") or u.get("id_verified") or u.get("kyc_status") == "approved"),
    }


async def _rv2_user_info(user_id: str) -> dict:
    u = await db.users.find_one({"id": user_id}, {"_id": 0}) or {}
    return {
        "name": u.get("name") or u.get("email") or "",
        "avatar": u.get("avatar") or u.get("photo_url") or "",
        "role": u.get("role") or "client",
    }


_mobility_router = _build_mobility_router(
    db,
    current_user=current_user,
    optional_user=optional_user,
    driver_info_lookup=_rv2_driver_info,
    user_info_lookup=_rv2_user_info,
)
app.include_router(_mobility_router, prefix="/api")


@app.on_event("startup")
async def _rides_v2_startup():
    """Indexes + migration + boucle d'expiration marketplace covoiturage."""
    import asyncio as _asyncio
    try:
        await _rv2_service.ensure_indexes(db)
        log.info("[rides_v2] indexes ok")
        migrated = await _rv2_service.backfill_ride_norms(db)
        if migrated:
            log.info("[rides_v2] backfilled from/to_city_norm on %d legacy rides", migrated)
    except Exception as _e:
        log.warning("[rides_v2] ensure_indexes failed: %s", _e)
    _asyncio.create_task(_rv2_expiration_loop(db, interval_seconds=300))


async def _ambassador_commissions_cron():
    """Cron ambassadeur : auto-approbation des commissions arrivées à J+14.
    Tourne 1× par heure — safe car idempotent (query filter sur status=pending)."""
    import asyncio as _asyncio
    from ambassadors import auto_approve_ready_commissions as _auto_approve
    log.info("ambassador commissions cron started (every 3600s)")
    # Petit délai au démarrage pour ne pas gêner le boot
    await _asyncio.sleep(30)
    while True:
        try:
            res = await _auto_approve(db, notify=send_push)
            if res.get("promoted") or res.get("cancelled"):
                log.info("ambassador cron: %s", res)
        except Exception as e:
            log.warning("ambassador cron failed (non-blocking): %s", e)
        await _asyncio.sleep(3600)  # 1h


@app.on_event("startup")
async def _ambassador_cron_startup():
    import asyncio as _asyncio
    _asyncio.create_task(_ambassador_commissions_cron())

# SEC : CORS restreint. On lit CORS_ORIGINS (CSV) depuis l'env. Wildcard '*'
# NE peut JAMAIS être combiné avec allow_credentials=True (échec silencieux navigateur
# et surface d'attaque CSRF côté navigateur web).
_cors_env = os.environ.get("CORS_ORIGINS", "").strip()
if _cors_env == "*":
    # Sans credentials, wildcard reste acceptable pour une API publique read-heavy.
    _cors_origins = ["*"]
    _cors_creds = False
elif _cors_env:
    _cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
    _cors_creds = True
else:
    # Défaut sécurisé : autoriser uniquement les surfaces Jokoo connues + preview.
    _cors_origins = [
        "https://jokooservices.com",
        "https://www.jokooservices.com",
        "http://localhost:3000",
        "http://localhost:19006",
    ]
    _cors_creds = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"^https?://(?:[a-z0-9-]+\.)?emergentagent\.com$",
    allow_credentials=_cors_creds,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "Accept", "Origin"],
    max_age=600,
)

# GZip compression : réduit ~70% le poids des grosses réponses JSON (recherches, listes admin, providers avec photos base64).
# min_size=1024 : n'active la compression que pour les réponses ≥ 1 KB (évite surcoût CPU sur petites réponses).
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.on_event("startup")
async def _startup_ensure_indexes():
    """Idempotent : corrige les index stales et crée les index recommandés critiques.

    - Drop l'index legacy `expo_token_1 unique` sur push_tokens (bloquait register-token quand plusieurs users avaient expo_token=null en migration).
    - Recrée un index composite propre pour push_tokens.
    - Assure quelques index critiques pour perf (email unique, notifications user_id+created_at, etc.).
    """
    try:
        idx = await db.push_tokens.index_information()
        if "expo_token_1" in idx:
            await db.push_tokens.drop_index("expo_token_1")
    except Exception:
        pass
    try:
        await db.push_tokens.create_index([("user_id", 1), ("token", 1)], unique=True, name="user_token_uniq", sparse=True)
    except Exception:
        pass
    # Sécurise les index critiques (idempotent : si déjà présent, no-op).
    try:
        await db.users.create_index("email", unique=True, name="email_uniq")
        await db.users.create_index("apple_sub", sparse=True)
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        await db.blocked_users.create_index([("user_id", 1), ("blocked_id", 1)], unique=True)
        await db.blocked_users.create_index("blocked_id")
        await db.providers.create_index([("service_key", 1), ("city", 1)])
        await db.providers.create_index("categories")
        await db.providers.create_index("trades")
        await db.services_extra.create_index("key", unique=True, sparse=True)
        await db.service_suggestions.create_index([("status", 1), ("created_at", -1)])
        await db.bookings.create_index([("client_id", 1), ("created_at", -1)])
        await db.bookings.create_index([("provider_id", 1), ("created_at", -1)])
        await db.messages.create_index([("conv_id", 1), ("created_at", 1)])
        # P2 : indexes manquants critiques pour perf (audit iter42)
        # favorites — write-heavy sur chaque "like"
        await db.favorites.create_index([("user_id", 1), ("target_id", 1)], unique=True, sparse=True)
        await db.favorites.create_index([("user_id", 1), ("created_at", -1)])
        # push_events — pour analytics par user
        await db.push_events.create_index([("user_id", 1), ("created_at", -1)])
        await db.push_events.create_index("campaign_id", sparse=True)
        # push_devices — pour envoi ciblé
        await db.push_devices.create_index("user_id", sparse=True)
        # promo_codes — uniqueness + lookup
        await db.promo_codes.create_index("code", unique=True, sparse=True)
        await db.promo_codes.create_index("active", sparse=True)
        # promo_code_uses — uniqueness idempotency
        await db.promo_code_uses.create_index([("user_id", 1), ("code", 1)], unique=True, sparse=True)
        # kyc_requests — filtre admin
        await db.kyc_requests.create_index([("user_id", 1), ("status", 1)])
        await db.kyc_requests.create_index([("status", 1), ("created_at", -1)])
        # family_reviews — rating aggregation
        await db.family_reviews.create_index([("babysitter_id", 1), ("created_at", -1)])
        await db.family_reviews.create_index("booking_id", sparse=True)
        # rate_limit — TTL pour auto-clean après 24h (locked_until + 24h)
        await db.rate_limit.create_index("updated_at", expireAfterSeconds=86400)
        # ambassador_referrals — index unique déjà présent mais confirme
        await db.ambassador_referrals.create_index("referred_user_id", unique=True, sparse=True)
    except Exception:
        pass

    # ------------------------------------------------------------------
    # Auto-seed des documents juridiques (idempotent) — garantit que le
    # Legal Center et les liens login (/legal/cgu, /legal/privacy) fonctionnent
    # dès le 1er démarrage, sans avoir à appeler /api/seed manuellement.
    # ------------------------------------------------------------------
    try:
        LEGAL_DOCS_BOOTSTRAP = [
            ("cgu", "Conditions générales d'utilisation", "conditions", True, 10),
            ("privacy", "Politique de confidentialité", "conditions", True, 20),
            ("cookies", "Politique relative aux cookies", "conditions", False, 30),
            ("mentions-legales", "Mentions légales", "conditions", False, 40),
            ("terms-prestataires", "Conditions des prestataires", "conditions", False, 50),
            ("terms-clients", "Conditions des clients", "conditions", False, 60),
            ("refund-policy", "Politique de remboursement", "paiements", False, 70),
            ("cancellation-policy", "Politique d'annulation", "paiements", False, 80),
            ("verification-policy", "Politique de vérification des prestataires", "securite", False, 100),
            ("community-charter", "Charte de la communauté", "communaute", False, 180),
            ("faq", "FAQ", "aide", False, 200),
            ("help-center", "Centre d'aide", "aide", False, 210),
        ]
        for slug, title, category, requires_acc, order in LEGAL_DOCS_BOOTSTRAP:
            existing = await db.legal_documents.find_one({"slug": slug, "language": "fr", "country": "SN"})
            if existing:
                continue
            placeholder = (
                f"# {title}\n\n"
                f"> ℹ️ Ce document est en cours de rédaction par l'équipe juridique de Jokoo.\n\n"
                f"## À propos\n\nCette page détaillera prochainement : **{title.lower()}**.\n\n"
                f"## Sections prévues\n\n- Objet\n- Champ d'application\n- Vos droits\n- Nos engagements\n- Modifications\n- Contact\n\n"
                f"---\n\n*Pour toute question, écrivez-nous à support@jokooservices.com.*\n"
            )
            now = now_iso()
            doc = {
                "slug": slug, "title": title, "content": placeholder,
                "summary": f"Document juridique de Jokoo — {title}",
                "category": category, "language": "fr", "country": "SN",
                "version": 1, "order": order,
                "requires_acceptance": requires_acc, "published": True,
                "effective_date": now[:10], "created_at": now, "updated_at": now,
                "updated_by": "system-bootstrap",
            }
            await db.legal_documents.insert_one(doc)
            await db.legal_versions.insert_one({"id": str(uuid.uuid4()), **doc, "author_id": "system"})
    except Exception as _e:
        logging.getLogger("jokoo").warning("legal docs bootstrap skipped: %s", _e)

    # ------------------------------------------------------------------
    # Migration one-shot (idempotente) : peupler categories[]/trades[]
    # sur les providers existants qui n'ont que `service_key` (legacy v1).
    # ------------------------------------------------------------------
    try:
        catalog = await _get_full_services_catalog()
        key_to_cat = {s["key"]: s.get("category") or "other" for s in catalog}
        cursor = db.providers.find(
            {
                "$or": [
                    {"categories": {"$exists": False}},
                    {"categories": {"$size": 0}},
                    {"trades": {"$exists": False}},
                    {"trades": {"$size": 0}},
                ]
            },
            {"_id": 1, "id": 1, "service_key": 1, "categories": 1, "trades": 1},
        )
        n_migrated = 0
        async for p in cursor:
            sk = (p.get("service_key") or "").strip()
            if not sk:
                continue
            new_trades = list(p.get("trades") or []) or [sk]
            existing_cats = list(p.get("categories") or [])
            if not existing_cats:
                existing_cats = [key_to_cat.get(sk, "other")]
            await db.providers.update_one(
                {"_id": p["_id"]},
                {"$set": {"categories": existing_cats, "trades": new_trades}},
            )
            n_migrated += 1
        if n_migrated:
            logging.getLogger("jokoo.migration").info(
                f"[migration] providers v2 : {n_migrated} docs mis à jour (categories/trades)"
            )
    except Exception as e:
        try:
            logging.getLogger("jokoo.migration").warning(
                f"[migration] providers v2 skip : {e}"
            )
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Migration v2.2 : peupler roles[]/active_role sur les users existants.
    # ------------------------------------------------------------------
    try:
        cursor = db.users.find(
            {"$or": [
                {"roles": {"$exists": False}},
                {"active_role": {"$exists": False}},
            ]},
            {"_id": 1, "role": 1, "roles": 1, "active_role": 1},
        )
        n_u = 0
        async for u in cursor:
            r = u.get("role") or "client"
            roles = list(u.get("roles") or [r])
            if r not in roles:
                roles.append(r)
            await db.users.update_one(
                {"_id": u["_id"]},
                {"$set": {"roles": roles, "active_role": u.get("active_role") or r}},
            )
            n_u += 1
        if n_u:
            logging.getLogger("jokoo.migration").info(
                f"[migration] users v2.2 : {n_u} docs mis à jour (roles/active_role)"
            )
    except Exception as e:
        try:
            logging.getLogger("jokoo.migration").warning(
                f"[migration] users v2.2 skip : {e}"
            )
        except Exception:
            pass


@app.on_event("shutdown")
async def close_db():
    client.close()
