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
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Literal

import bcrypt
import jwt
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Header, Request
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

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
JWT_SECRET = os.environ.get("JWT_SECRET", "jokoo-dev-secret-change-me")
JWT_ALG = "HS256"
JWT_EXP_DAYS = 30

STRIPE_KEY = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")
APP_URL = os.environ.get(
    "APP_URL",
    "https://868fd53e-1f85-41aa-80f4-13c6ad7575b7.preview.emergentagent.com",
)
stripe_checkout = StripeCheckout(api_key=STRIPE_KEY)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Jokoo API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("jokoo")


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


def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        uid = data.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
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
    ],
    "operator": [
        "operator:create_account",
        "users:read", "users:write",
        "providers:write", "providers:validate",
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
    password: str = Field(min_length=6)
    name: str
    role: Role
    phone: Optional[str] = None
    city: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AuthOut(BaseModel):
    token: str
    user: dict


PriceType = Literal["fixed", "from", "quote"]


class ProviderProfileIn(BaseModel):
    service: str  # e.g. "Plombier"
    description: Optional[str] = ""
    price_type: PriceType = "quote"
    price_amount: Optional[float] = None  # None si "quote"
    city: str
    zones: List[str] = []
    hours: Optional[str] = ""
    photo: Optional[str] = None  # base64 or url
    gallery: List[str] = []
    diplomas: List[str] = []
    id_card: Optional[str] = None


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
    provider_id: str
    booking_id: Optional[str] = None
    rating: int = Field(ge=1, le=5)
    comment: str = ""
    photos: List[str] = []


class MessageIn(BaseModel):
    text: str
    kind: Literal["text", "image", "location"] = "text"


class CheckoutBookingIn(BaseModel):
    booking_id: str
    amount_xof: int  # amount in whole XOF (F CFA)


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
SERVICES_CATALOG = [
    {"key": "plombier", "label": "Plombier", "icon": "water-outline", "color": "#00C2A8"},
    {"key": "electricien", "label": "Électricien", "icon": "flash-outline", "color": "#F59E0B"},
    {"key": "macon", "label": "Maçon", "icon": "hammer-outline", "color": "#8B5CF6"},
    {"key": "peintre", "label": "Peintre", "icon": "color-palette-outline", "color": "#EF4444"},
    {"key": "menage", "label": "Femme de ménage", "icon": "sparkles-outline", "color": "#10B981"},
    {"key": "coiffeuse", "label": "Coiffeuse", "icon": "cut-outline", "color": "#EC4899"},
    {"key": "prof", "label": "Professeur", "icon": "book-outline", "color": "#3B82F6"},
    {"key": "decorateur", "label": "Décorateur", "icon": "brush-outline", "color": "#F97316"},
    {"key": "clim", "label": "Climatisation", "icon": "snow-outline", "color": "#0EA5E9"},
    {"key": "jardinier", "label": "Jardinier", "icon": "leaf-outline", "color": "#22C55E"},
    {"key": "chauffeur", "label": "Chauffeur", "icon": "car-outline", "color": "#0B1F3A"},
    {"key": "photographe", "label": "Photographe", "icon": "camera-outline", "color": "#6366F1"},
]


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
    _rate_check(f"register:{_client_ip(request)}", max_hits=5, window_sec=3600)
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(400, "Email déjà utilisé")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": body.role,
        "is_admin": False,
        "phone": body.phone,
        "city": body.city or "Dakar",
        "avatar": None,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    token = make_token(uid)
    user = {k: v for k, v in doc.items() if k not in ("password_hash", "_id")}
    return {"token": token, "user": user}


@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn, request: Request):
    ip = _client_ip(request)
    email_key = body.email.lower()
    # Deux buckets : par IP (protège contre attaque massive) + par email+IP (protège compte cible)
    _rate_check(f"login-ip:{ip}", max_hits=20, window_sec=300)
    _rate_check(f"login-email:{email_key}:{ip}", max_hits=8, window_sec=300)
    user = await db.users.find_one({"email": email_key})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Identifiants invalides")
    token = make_token(user["id"])
    safe = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    return {"token": token, "user": safe}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return user


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
    # First sign-in only — Apple gives these once, we must save them immediately
    name: Optional[str] = None
    email: Optional[str] = None


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

    # Match order: apple_sub → email → new user
    user = await db.users.find_one({"apple_sub": apple_sub}, {"_id": 0})
    if not user and apple_email:
        user = await db.users.find_one({"email": apple_email}, {"_id": 0})
        if user:
            # link this Apple identity to existing account
            await db.users.update_one({"id": user["id"]}, {"$set": {
                "apple_sub": apple_sub,
                "updated_at": now_iso(),
            }})
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
        await db.users.insert_one(doc)
        user = {k: v for k, v in doc.items() if k not in ("password_hash", "_id")}
    else:
        user = {k: v for k, v in user.items() if k not in ("password_hash", "_id")}

    token = make_token(user["id"])
    return {"token": token, "user": user}


# ---------- services ----------
@api.get("/services")
async def list_services():
    return SERVICES_CATALOG


# ---------- providers ----------
def _provider_public(p: dict) -> dict:
    return {k: v for k, v in p.items() if k != "_id"}


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
    city: Optional[str] = None,
    zone: Optional[str] = None,  # quartier/commune : match sur zones[] ou city
    q: Optional[str] = None,
    sort: Optional[str] = None,  # "rating" | "price"
    limit: int = 50,
):
    query: dict = {}
    if service:
        query["service_key"] = service
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    if zone:
        query["$or"] = [
            {"zones": {"$regex": zone, "$options": "i"}},
            {"city": {"$regex": zone, "$options": "i"}},
        ]
    if q:
        query.setdefault("$or", [])
        query["$or"] += [
            {"name": {"$regex": q, "$options": "i"}},
            {"service": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
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


@api.post("/providers/me")
async def upsert_my_provider(body: ProviderProfileIn, user=Depends(current_user)):
    if user["role"] != "prestataire":
        raise HTTPException(403, "Compte prestataire requis")
    label = next((s["label"] for s in SERVICES_CATALOG if s["label"].lower() == body.service.lower() or s["key"] == body.service.lower()), body.service)
    key = next((s["key"] for s in SERVICES_CATALOG if s["label"].lower() == body.service.lower() or s["key"] == body.service.lower()), body.service.lower())
    doc = {
        "id": user["id"],
        "user_id": user["id"],
        "name": user["name"],
        "avatar": user.get("avatar"),
        "phone": user.get("phone"),
        "service": label,
        "service_key": key,
        "description": body.description or "",
        "price_type": body.price_type,
        "price_amount": body.price_amount if body.price_type != "quote" else None,
        "city": body.city,
        "zones": body.zones,
        "hours": body.hours or "",
        "photo": body.photo,
        "gallery": body.gallery,
        "diplomas": body.diplomas,
        "id_card": body.id_card,
        "verified": bool(body.id_card),
        "rating": 0,
        "reviews_count": 0,
        "subscription_active": False,
        "subscription_until": None,
        "updated_at": now_iso(),
    }
    await db.providers.update_one({"id": user["id"]}, {"$set": doc}, upsert=True)
    return {"ok": True, "provider": doc}


# ---------- bookings ----------
@api.post("/bookings")
async def create_booking(body: BookingIn, user=Depends(current_user)):
    provider = await db.providers.find_one({"id": body.provider_id}, {"_id": 0})
    if not provider:
        raise HTTPException(404, "Prestataire introuvable")

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
    return {k: v for k, v in doc.items() if k != "_id"}


@api.get("/bookings")
async def list_bookings(user=Depends(current_user)):
    if user["role"] == "prestataire":
        cur = db.bookings.find({"provider_id": user["id"]}, {"_id": 0})
    else:
        cur = db.bookings.find({"client_id": user["id"]}, {"_id": 0})
    items = await cur.sort("created_at", -1).to_list(200)
    return items


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
        # Only provider can accept/reject/complete; client can cancel
        if body.status in ("accepted", "rejected", "completed"):
            if b["provider_id"] != user["id"]:
                raise HTTPException(403, "Interdit")
        else:
            if b["client_id"] != user["id"]:
                raise HTTPException(403, "Interdit")
        updates["status"] = body.status
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

    if len(updates) == 1:
        raise HTTPException(400, "Aucune mise à jour fournie")

    await db.bookings.update_one({"id": bid}, {"$set": updates})
    return {"ok": True}


# ---------- reviews ----------
@api.post("/reviews")
async def create_review(body: ReviewIn, user=Depends(current_user)):
    provider = await db.providers.find_one({"id": body.provider_id})
    if not provider:
        raise HTTPException(404, "Prestataire introuvable")
    rid = str(uuid.uuid4())
    doc = {
        "id": rid,
        "provider_id": body.provider_id,
        "booking_id": body.booking_id,
        "author_id": user["id"],
        "author_name": user["name"],
        "author_avatar": user.get("avatar"),
        "rating": body.rating,
        "comment": body.comment,
        "photos": body.photos,
        "created_at": now_iso(),
    }
    await db.reviews.insert_one(doc)
    # recompute rating
    rs = await db.reviews.find({"provider_id": body.provider_id}).to_list(1000)
    avg = round(sum(r["rating"] for r in rs) / len(rs), 2)
    await db.providers.update_one(
        {"id": body.provider_id},
        {"$set": {"rating": avg, "reviews_count": len(rs)}},
    )
    return {k: v for k, v in doc.items() if k != "_id"}


# ---------- favorites ----------
@api.get("/favorites")
async def list_favorites(user=Depends(current_user)):
    fav = await db.favorites.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    ids = [f["provider_id"] for f in fav]
    provs = await db.providers.find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)
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
    peers: dict = {}
    for m in msgs:
        peer = m["to_id"] if m["from_id"] == user["id"] else m["from_id"]
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
    cid = _conv_id(user["id"], peer_id)
    cur = db.messages.find({"conv_id": cid}, {"_id": 0}).sort("created_at", 1)
    msgs = await cur.to_list(1000)
    # mark inbound as read
    await db.messages.update_many(
        {"conv_id": cid, "to_id": user["id"], "read": {"$ne": True}},
        {"$set": {"read": True}},
    )
    return msgs


@api.post("/chat/{peer_id}/messages")
async def send_message(peer_id: str, body: MessageIn, user=Depends(current_user)):
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
    await db.messages.insert_one(doc)
    # Notifier le destinataire uniquement s'il a un compte utilisateur réel
    if peer:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": peer_id,
            "type": "message",
            "title": user["name"],
            "body": filtered_text[:80],
            "peer_id": user["id"],
            "read": False,
            "created_at": now_iso(),
        })
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


@api.get("/wallet/me")
async def wallet_me(user=Depends(current_user)):
    w = await _get_wallet(user["id"])
    return {k: v for k, v in w.items() if k != "_id"}


@api.get("/wallet/history")
async def wallet_history(user=Depends(current_user), limit: int = 50):
    cur = db.wallet_transactions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(limit)
    return await cur.to_list(limit)


@api.post("/bookings/{bid}/cash-payment")
async def record_cash_payment(bid: str, body: dict, user=Depends(current_user)):
    """Le prestataire déclare avoir reçu un paiement en espèces.
    Jokoo calcule la commission due et l'ajoute au wallet en dette.
    """
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
    # Notifier le prestataire
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "commission_due",
        "title": "Commission Jokoo à régler",
        "body": f"{commission:.0f} FCFA de commission sur votre paiement espèces. Solde dû : {new_debt:.0f} FCFA.",
        "read": False,
        "created_at": now_iso(),
    })
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


@api.post("/wallet/pay-commission-due")
async def pay_commission_due(body: dict, user=Depends(current_user)):
    """Le prestataire règle sa commission due (via Stripe/Wave/OM à l'avenir — pour l'instant on marque payé)."""
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
async def list_notifications(user=Depends(current_user)):
    cur = db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(100)
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
            {"name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
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


# ---------- payments (Stripe checkout via emergentintegrations) ----------
@api.post("/payments/checkout/booking")
async def pay_booking(body: CheckoutBookingIn, user=Depends(current_user)):
    b = await db.bookings.find_one({"id": body.booking_id}, {"_id": 0})
    if not b or b["client_id"] != user["id"]:
        raise HTTPException(404, "Réservation introuvable")
    try:
        # emergentintegrations wrapper expects amount as float in major units.
        req = CheckoutSessionRequest(
            amount=float(body.amount_xof),
            currency="xof",
            success_url=f"{APP_URL}/booking/paid?session_id={{CHECKOUT_SESSION_ID}}&booking_id={body.booking_id}",
            cancel_url=f"{APP_URL}/booking/cancelled",
            metadata={
                "booking_id": body.booking_id,
                "user_id": user["id"],
                "kind": "booking",
            },
        )
        session = await stripe_checkout.create_checkout_session(req)
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
        session = await stripe_checkout.create_checkout_session(req)
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
    if not stored or not verify_password(body.current_password, stored):
        raise HTTPException(400, "Mot de passe actuel incorrect")
    # policy check
    if body.new_password == body.current_password:
        raise HTTPException(400, "Le nouveau mot de passe doit être différent de l'actuel")
    new_hash = hash_password(body.new_password)
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
        s = await stripe_checkout.get_checkout_status(session_id)
    except Exception as e:
        raise HTTPException(500, f"Impossible de vérifier: {e}")
    paid = getattr(s, "payment_status", None) == "paid" or getattr(s, "status", None) == "complete"
    meta = getattr(s, "metadata", {}) or {}
    if paid and meta.get("kind") == "booking" and meta.get("booking_id"):
        await db.bookings.update_one(
            {"id": meta["booking_id"]},
            {"$set": {"paid": True, "paid_at": now_iso()}},
        )
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
    session = await wave_create_checkout(
        amount_xof=int(body.amount_xof),
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
async def wave_return(booking_id: Optional[str] = None, user_id: Optional[str] = None, kind: Optional[str] = None):
    """Wave redirects the browser here after payment. We redirect the user to the frontend confirmation page."""
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
    order_id = f"jokoo-{body.booking_id}"
    session = await om_create_webpayment(
        amount_xof=int(body.amount_xof),
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
async def om_return(booking_id: Optional[str] = None, user_id: Optional[str] = None, kind: Optional[str] = None):
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
    """Optional Orange Money server notification endpoint.

    OM sends a POST here after a payment. Best-effort mark paid; relies on order_id
    which we set to jokoo-<booking_id> or jokoo-sub-<user_id>-<ts>.
    """
    try:
        data = await request.json()
    except Exception:
        return {"received": True}
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
):
    """Liste publique — placement, dates, cible, actif. Incrémente les impressions."""
    now = now_iso()
    query: dict = {"placements": placement}
    if placement == "category" and category:
        query["category_key"] = category
    cur = db.ads.find(query, {"_id": 0}).sort("created_at", -1)
    items = await cur.to_list(100)
    valid = []
    for a in items:
        if not _is_ad_visible(a, now):
            continue
        # Ciblage : "all" ou correspond au rôle transmis
        aud = a.get("target_audience") or "all"
        if audience and aud != "all" and aud != audience:
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
SPONSOR_PRICES_XOF = {7: 5000, 15: 9000, 30: 15000}


@api.post("/sponsorships")
async def request_sponsorship(body: SponsorshipIn, user=Depends(current_user)):
    if user["role"] != "prestataire":
        raise HTTPException(403, "Prestataire uniquement")
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "provider_id": user["id"],
        "provider_name": user["name"],
        "duration_days": body.duration_days,
        "amount_xof": SPONSOR_PRICES_XOF[body.duration_days],
        "status": "pending",  # pending | approved | rejected | active | expired
        "starts_at": None,
        "ends_at": None,
        "paid": False,
        "created_at": now_iso(),
    }
    await db.sponsorships.insert_one(doc)
    return _clean_service(doc)


@api.get("/sponsorships/mine")
async def my_sponsorships(user=Depends(current_user)):
    cur = db.sponsorships.find({"provider_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(50)


@api.get("/admin/sponsorships")
async def admin_list_sponsorships(user=Depends(current_user)):
    require_admin(user)
    cur = db.sponsorships.find({}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)


@api.patch("/admin/sponsorships/{sid}")
async def admin_update_sponsorship(
    sid: str,
    body: dict,
    user=Depends(current_user),
):
    require_admin(user)
    s = await db.sponsorships.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Introuvable")
    status_ = body.get("status")
    updates: dict = {"updated_at": now_iso()}
    if status_ == "approved":
        starts = datetime.now(timezone.utc)
        ends = starts + timedelta(days=s["duration_days"])
        updates.update({
            "status": "active",
            "starts_at": starts.isoformat(),
            "ends_at": ends.isoformat(),
            "paid": True,
        })
        await db.providers.update_one(
            {"id": s["provider_id"]},
            {"$set": {"sponsored_until": ends.isoformat()}},
        )
    elif status_ in ("rejected", "expired"):
        updates["status"] = status_
    else:
        raise HTTPException(400, "status invalide")
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
        "password_hash": hash_password(body.password),
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
    import random
    return f"{random.randint(0, 999999):06d}"


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
        "email": (body.email or f"{body.phone.replace('+', '')}@jokoo.sn").lower(),
        "password_hash": hash_password(temp_pwd),
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
    if not user:
        raise HTTPException(404, "Aucun compte pour ce numéro")
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
    # Prod: envoyer via SMS. En dev on retourne le code pour test.
    return {"ok": True, "otp_dev_only": code}


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
    token = make_token(user["id"])
    return {"token": token, "user": user}


# ---------- support: password reset ----------
@api.post("/admin/users/{uid}/reset-password")
async def reset_user_password(uid: str, body: PasswordResetIn, user=Depends(require_perm("passwords:reset"))):
    u = await db.users.find_one({"id": uid})
    if not u:
        raise HTTPException(404, "Utilisateur introuvable")
    new_pwd = body.new_password or _gen_otp()
    await db.users.update_one({"id": uid}, {"$set": {"password_hash": hash_password(new_pwd)}})
    return {"ok": True, "new_password": new_pwd}


# ---------- signalements / réclamations (support) ----------
@api.get("/admin/reports")
async def list_reports(status_filter: Optional[str] = None, user=Depends(require_perm("reports:handle"))):
    """Liste des signalements. Filtre optionnel par statut : open|investigating|resolved|dismissed|escalated."""
    q: dict = {}
    if status_filter and status_filter != "all":
        q["status"] = status_filter
    cur = db.reports.find(q, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)


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


VALID_REPORT_STATUS = {"open", "investigating", "resolved", "dismissed", "escalated"}


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
@api.delete("/users/me")
async def delete_my_account(user=Depends(current_user)):
    """Suppression de compte en 1 clic — exigence Apple 5.1.1(v) et Google Play.
    Supprime les données personnelles et anonymise les données historiques.
    """
    uid = user["id"]
    # Delete personal-only collections
    await db.favorites.delete_many({"user_id": uid})
    await db.legal_acceptances.delete_many({"user_id": uid})
    await db.notifications.delete_many({"user_id": uid})
    await db.otps.delete_many({"user_id": uid})
    await db.blocked_users.delete_many({"$or": [{"user_id": uid}, {"blocked_id": uid}]})
    await db.providers.delete_many({"user_id": uid})
    await db.services.delete_many({"provider_id": uid})
    await db.babysitters.delete_many({"user_id": uid})
    # Anonymise historic bookings & messages (conserver l'historique pour l'autre partie)
    await db.bookings.update_many({"client_id": uid}, {"$set": {"client_name": "[Compte supprimé]", "client_id_deleted": True}})
    await db.bookings.update_many({"provider_id": uid}, {"$set": {"provider_name": "[Compte supprimé]", "provider_id_deleted": True}})
    await db.messages.update_many({"from_id": uid}, {"$set": {"from_name": "[Compte supprimé]"}})
    await db.reviews.update_many({"author_id": uid}, {"$set": {"author_name": "[Compte supprimé]"}})
    # Finally remove the user account itself
    await db.users.delete_one({"id": uid})
    return {"ok": True, "message": "Compte supprimé"}


# ---------- Block user (Apple 1.2 UGC requirement) ----------
@api.post("/users/{peer_id}/block")
async def block_user(peer_id: str, user=Depends(current_user)):
    if peer_id == user["id"]:
        raise HTTPException(400, "Impossible de se bloquer soi-même")
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
    return _clean(doc)


@api.get("/rides")
async def search_rides(
    from_city: Optional[str] = None,
    to_city: Optional[str] = None,
    date: Optional[str] = None,
    distance_type: Optional[str] = None,
    accepts_parcels: Optional[bool] = None,
    limit: int = 50,
):
    q: dict = {"status": "active"}
    if from_city:
        q["from_city"] = {"$regex": from_city, "$options": "i"}
    if to_city:
        q["to_city"] = {"$regex": to_city, "$options": "i"}
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
async def get_ride(rid: str):
    r = await db.rides.find_one({"id": rid}, {"_id": 0})
    if not r:
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
    if body.paid is not None:
        updates["paid"] = bool(body.paid)

    await db.parcels.update_one({"id": pid}, {"$set": updates})
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
):
    q: dict = {"status": "active"}
    if city:
        q["city"] = {"$regex": city, "$options": "i"}
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
    cur = db.babysitters.find(q, {"_id": 0, "student_card": 0, "emergency_contact": 0}).sort([
        ("recommended_by_jokoo", -1),
        ("verified_plus", -1),
        ("student_card_verified", -1),
        ("rating", -1),
    ]).limit(limit)
    return await cur.to_list(limit)


@api.get("/family/babysitters/{bid}")
async def get_babysitter(bid: str):
    b = await db.babysitters.find_one({"id": bid}, {"_id": 0, "student_card": 0, "emergency_contact": 0})
    if not b:
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
    if body.checkin_photo is not None:
        if not is_sitter:
            raise HTTPException(403, "Seul l'étudiant peut envoyer le check-in")
        updates["checkin_photo"] = body.checkin_photo
    await db.babysitting_bookings.update_one({"id": bid}, {"$set": updates})
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
    await db.babysitting_bookings.update_one({"id": bid}, {"$set": {"report_id": rid, "status": "completed", "paid": True, "updated_at": now_iso()}})
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": b["parent_id"],
        "type": "babysitting_report",
        "title": "Carnet de session prêt 📝",
        "body": f"{b.get('date')} · {b.get('babysitter_name')}",
        "peer_id": user["id"],
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
    {"name": "Ousmane Kane", "service_key": "peintre", "service": "Peintre", "city": "Dakar", "price_type": "quote", "price_amount": None, "rating": 4.6, "reviews_count": 28, "description": "Peinture intérieure & extérieure, finitions soignées. Devis gratuit sur mesure.", "photo": "https://images.pexels.com/photos/8961324/pexels-photo-8961324.jpeg", "verified": True},
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
async def seed():
    # idempotent
    await db.providers.delete_many({"seeded": True})
    await db.reviews.delete_many({"seeded": True})
    await db.services.delete_many({"seeded": True})
    await db.ads.delete_many({"seeded": True})

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

    # Seed legal documents (Jokoo Legal Center) — placeholders "À rédiger"
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
    for slug, title, category, requires_acc, order in LEGAL_DOCS:
        existing = await db.legal_documents.find_one({"slug": slug, "language": "fr", "country": "SN"})
        if existing:
            continue
        placeholder = (
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
            f"*Pour toute question, contactez-nous à support@jokoo.sn.*\n"
        )
        now = now_iso()
        doc = {
            "slug": slug,
            "title": title,
            "content": placeholder,
            "summary": f"Document juridique de Jokoo — {title}",
            "category": category,
            "language": "fr",
            "country": "SN",
            "version": 1,
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


# ---------- mount ----------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def close_db():
    client.close()
