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


async def admin_user(user=Depends(lambda authorization=Header(None): current_user(authorization))) -> dict:
    # thin wrapper — we just re-check the flag from the DB
    return user  # placeholder replaced by dependency below


def require_admin(user: dict) -> None:
    if not user.get("is_admin") and not user.get("staff_role"):
        raise HTTPException(403, "Accès administrateur requis")


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


class AdMedia(BaseModel):
    kind: Literal["image", "video"] = "image"
    url: str
    thumb: Optional[str] = None


class AdIn(BaseModel):
    type: AdType = "banner"
    title: str
    description: Optional[str] = ""
    button_label: Optional[str] = "Voir"
    link: Optional[str] = None
    media: List[AdMedia] = []
    placements: List[Literal["home", "between_lists", "category", "search", "profile"]] = ["home"]
    category_key: Optional[str] = None
    target_audience: AdAudience = "all"
    display_mode: AdDisplayMode = "single"
    start_at: Optional[str] = None  # ISO 8601 with time
    end_at: Optional[str] = None
    active: bool = True
    suspended: bool = False


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
@api.post("/auth/register", response_model=AuthOut)
async def register(body: RegisterIn):
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
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Identifiants invalides")
    token = make_token(user["id"])
    safe = {k: v for k, v in user.items() if k not in ("_id", "password_hash")}
    return {"token": token, "user": safe}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return user


# ---------- services ----------
@api.get("/services")
async def list_services():
    return SERVICES_CATALOG


# ---------- providers ----------
def _provider_public(p: dict) -> dict:
    return {k: v for k, v in p.items() if k != "_id"}


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
    return items


@api.get("/providers/{provider_id}")
async def get_provider(provider_id: str):
    p = await db.providers.find_one({"id": provider_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Prestataire introuvable")
    reviews = await db.reviews.find({"provider_id": provider_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    services = await db.services.find({"provider_id": provider_id, "active": True}, {"_id": 0}).sort("created_at", 1).to_list(200)
    p["reviews"] = reviews
    p["services"] = services
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
    # attach peer info
    peer_ids = list(peers.keys())
    users = await db.users.find({"id": {"$in": peer_ids}}, {"_id": 0, "password_hash": 0}).to_list(500)
    umap = {u["id"]: u for u in users}
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
    peer = await db.users.find_one({"id": peer_id}, {"_id": 0})
    if not peer:
        raise HTTPException(404, "Destinataire introuvable")
    cid = _conv_id(user["id"], peer_id)
    doc = {
        "id": str(uuid.uuid4()),
        "conv_id": cid,
        "from_id": user["id"],
        "from_name": user["name"],
        "to_id": peer_id,
        "text": body.text,
        "kind": body.kind,
        "read": False,
        "created_at": now_iso(),
    }
    await db.messages.insert_one(doc)
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": peer_id,
        "type": "message",
        "title": user["name"],
        "body": body.text[:80],
        "peer_id": user["id"],
        "read": False,
        "created_at": now_iso(),
    })
    return {k: v for k, v in doc.items() if k != "_id"}


# ---------- notifications ----------
@api.get("/notifications")
async def list_notifications(user=Depends(current_user)):
    cur = db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(100)
    return await cur.to_list(100)


@api.post("/notifications/read-all")
async def read_all_notifs(user=Depends(current_user)):
    await db.notifications.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


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
            success_url=f"{APP_URL}/api/payments/success?session_id={{CHECKOUT_SESSION_ID}}&booking_id={body.booking_id}",
            cancel_url=f"{APP_URL}/api/payments/cancel",
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
            success_url=f"{APP_URL}/api/payments/success?session_id={{CHECKOUT_SESSION_ID}}&kind=sub",
            cancel_url=f"{APP_URL}/api/payments/cancel",
            metadata={"user_id": user["id"], "kind": "subscription"},
        )
        session = await stripe_checkout.create_checkout_session(req)
        return {"url": session.url, "session_id": session.session_id}
    except HTTPException:
        raise
    except Exception as e:
        log.exception("stripe sub checkout failed")
        raise HTTPException(500, f"Paiement indisponible: {e}")


@api.get("/payments/status/{session_id}")
async def payment_status(session_id: str, user=Depends(current_user)):
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
    if paid and meta.get("kind") == "subscription":
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
    """Landing page after Wave redirect (browser). Just informs user; final state comes via webhook."""
    return {"ok": True, "booking_id": booking_id, "user_id": user_id, "kind": kind}


@api.get("/payments/wave/cancel")
async def wave_cancel():
    return {"ok": False, "cancelled": True}


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
    return {"ok": True, "booking_id": booking_id, "user_id": user_id, "kind": kind}


@api.get("/payments/orange/cancel")
async def om_cancel():
    return {"ok": False, "cancelled": True}


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
async def otp_request(body: OtpRequestIn):
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
async def otp_verify(body: OtpVerifyIn):
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
async def list_reports(user=Depends(require_perm("reports:handle"))):
    cur = db.reports.find({}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)


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
        "created_at": now_iso(),
    }
    await db.reports.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@api.patch("/admin/reports/{rid}")
async def update_report(rid: str, body: dict, user=Depends(require_perm("reports:handle"))):
    await db.reports.update_one(
        {"id": rid},
        {"$set": {"status": body.get("status", "resolved"), "resolved_by": user["id"], "resolved_at": now_iso()}},
    )
    return {"ok": True}




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
