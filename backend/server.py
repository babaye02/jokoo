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


class ProviderProfileIn(BaseModel):
    service: str  # e.g. "Plombier"
    description: Optional[str] = ""
    hourly_price: float = 0
    city: str
    zones: List[str] = []
    hours: Optional[str] = ""
    photo: Optional[str] = None  # base64 or url
    gallery: List[str] = []
    diplomas: List[str] = []
    id_card: Optional[str] = None


class BookingIn(BaseModel):
    provider_id: str
    date: str  # ISO
    time: str  # "14:00"
    address: str
    description: str
    estimated_price: float


class BookingUpdate(BaseModel):
    status: Literal["accepted", "rejected", "completed", "cancelled"]


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
    q: Optional[str] = None,
    sort: Optional[str] = None,  # "rating" | "price"
    limit: int = 50,
):
    query: dict = {}
    if service:
        query["service_key"] = service
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"service": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    cursor = db.providers.find(query, {"_id": 0}).limit(limit)
    items = await cursor.to_list(length=limit)
    if sort == "rating":
        items.sort(key=lambda p: p.get("rating", 0), reverse=True)
    elif sort == "price":
        items.sort(key=lambda p: p.get("hourly_price", 0))
    return items


@api.get("/providers/{provider_id}")
async def get_provider(provider_id: str):
    p = await db.providers.find_one({"id": provider_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Prestataire introuvable")
    reviews = await db.reviews.find({"provider_id": provider_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    p["reviews"] = reviews
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
        "hourly_price": body.hourly_price,
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
    bid = str(uuid.uuid4())
    doc = {
        "id": bid,
        "client_id": user["id"],
        "client_name": user["name"],
        "provider_id": body.provider_id,
        "provider_name": provider["name"],
        "provider_service": provider["service"],
        "date": body.date,
        "time": body.time,
        "address": body.address,
        "description": body.description,
        "estimated_price": body.estimated_price,
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
    # Only provider can accept/reject/complete; client can cancel
    if body.status in ("accepted", "rejected", "completed"):
        if b["provider_id"] != user["id"]:
            raise HTTPException(403, "Interdit")
    else:
        if b["client_id"] != user["id"]:
            raise HTTPException(403, "Interdit")
    await db.bookings.update_one({"id": bid}, {"$set": {"status": body.status, "updated_at": now_iso()}})
    # notify counterparty
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
    revenue = sum(b.get("estimated_price", 0) for b in completed)
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



# ---------- seed ----------
SEED_PROVIDERS = [
    {"name": "Moussa Diop", "service_key": "plombier", "service": "Plombier", "city": "Dakar", "hourly_price": 5000, "rating": 4.8, "reviews_count": 42, "description": "Plombier certifié avec 10 ans d'expérience. Interventions rapides à Dakar.", "photo": "https://images.pexels.com/photos/8005368/pexels-photo-8005368.jpeg", "verified": True},
    {"name": "Awa Ndiaye", "service_key": "coiffeuse", "service": "Coiffeuse", "city": "Dakar", "hourly_price": 8000, "rating": 4.9, "reviews_count": 87, "description": "Spécialiste tresses, extensions et défrisage. À domicile.", "photo": "https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg", "verified": True},
    {"name": "Ibrahima Fall", "service_key": "electricien", "service": "Électricien", "city": "Dakar", "hourly_price": 6000, "rating": 4.7, "reviews_count": 33, "description": "Électricien qualifié, dépannage 24/7, installations complètes.", "photo": "https://images.pexels.com/photos/8005397/pexels-photo-8005397.jpeg", "verified": True},
    {"name": "Fatou Sow", "service_key": "menage", "service": "Femme de ménage", "city": "Dakar", "hourly_price": 3500, "rating": 4.9, "reviews_count": 121, "description": "Ménage complet, repassage. Sérieuse et ponctuelle.", "photo": "https://images.pexels.com/photos/8817841/pexels-photo-8817841.jpeg", "verified": True},
    {"name": "Cheikh Ba", "service_key": "macon", "service": "Maçon", "city": "Thiès", "hourly_price": 7000, "rating": 4.5, "reviews_count": 19, "description": "Maçonnerie générale, carrelage, rénovation.", "photo": "https://images.pexels.com/photos/8961251/pexels-photo-8961251.jpeg", "verified": True},
    {"name": "Aminata Sy", "service_key": "prof", "service": "Professeur", "city": "Dakar", "hourly_price": 5000, "rating": 5.0, "reviews_count": 56, "description": "Prof de maths & physique — collège & lycée. Cours à domicile.", "photo": "https://images.pexels.com/photos/5212345/pexels-photo-5212345.jpeg", "verified": True},
    {"name": "Ousmane Kane", "service_key": "peintre", "service": "Peintre", "city": "Dakar", "hourly_price": 4500, "rating": 4.6, "reviews_count": 28, "description": "Peinture intérieure & extérieure, finitions soignées.", "photo": "https://images.pexels.com/photos/8961324/pexels-photo-8961324.jpeg", "verified": True},
    {"name": "Sokhna Dieng", "service_key": "decorateur", "service": "Décoratrice", "city": "Dakar", "hourly_price": 12000, "rating": 4.8, "reviews_count": 22, "description": "Décoration événementielle, mariages, baptêmes.", "photo": "https://images.pexels.com/photos/1181696/pexels-photo-1181696.jpeg", "verified": True},
    {"name": "Mamadou Sarr", "service_key": "clim", "service": "Climatisation", "city": "Dakar", "hourly_price": 8000, "rating": 4.7, "reviews_count": 47, "description": "Installation & entretien climatisation toutes marques.", "photo": "https://images.pexels.com/photos/5877455/pexels-photo-5877455.jpeg", "verified": True},
    {"name": "Papis Gueye", "service_key": "jardinier", "service": "Jardinier", "city": "Saly", "hourly_price": 4000, "rating": 4.6, "reviews_count": 31, "description": "Entretien jardins, taille de haies, arrosage automatique.", "photo": "https://images.pexels.com/photos/6231795/pexels-photo-6231795.jpeg", "verified": True},
    {"name": "Serigne Mbaye", "service_key": "chauffeur", "service": "Chauffeur", "city": "Dakar", "hourly_price": 6000, "rating": 4.9, "reviews_count": 64, "description": "Chauffeur privé, aéroport & courses. Véhicule confort.", "photo": "https://images.pexels.com/photos/3771120/pexels-photo-3771120.jpeg", "verified": True},
    {"name": "Ndèye Faye", "service_key": "photographe", "service": "Photographe", "city": "Dakar", "hourly_price": 25000, "rating": 5.0, "reviews_count": 38, "description": "Photographe portrait, mariage & évènements.", "photo": "https://images.pexels.com/photos/1264210/pexels-photo-1264210.jpeg", "verified": True},
    {"name": "Aliou Cissé", "service_key": "plombier", "service": "Plombier", "city": "Rufisque", "hourly_price": 4500, "rating": 4.5, "reviews_count": 17, "description": "Fuites, chauffe-eau, wc. Intervention rapide.", "photo": "https://images.pexels.com/photos/5691660/pexels-photo-5691660.jpeg", "verified": False},
    {"name": "Mariam Gassama", "service_key": "coiffeuse", "service": "Coiffeuse", "city": "Thiès", "hourly_price": 6000, "rating": 4.6, "reviews_count": 41, "description": "Coiffure afro & modernes. Salon et à domicile.", "photo": "https://images.pexels.com/photos/3993451/pexels-photo-3993451.jpeg", "verified": True},
    {"name": "Bassirou Diallo", "service_key": "electricien", "service": "Électricien", "city": "Dakar", "hourly_price": 5500, "rating": 4.4, "reviews_count": 25, "description": "Câblage, tableaux électriques, urgences.", "photo": "https://images.pexels.com/photos/8005398/pexels-photo-8005398.jpeg", "verified": True},
    {"name": "Khady Ndoye", "service_key": "menage", "service": "Femme de ménage", "city": "Dakar", "hourly_price": 3000, "rating": 4.7, "reviews_count": 63, "description": "Ménage régulier ou ponctuel. Références disponibles.", "photo": "https://images.pexels.com/photos/8817842/pexels-photo-8817842.jpeg", "verified": True},
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
    inserted = 0
    for s in SEED_PROVIDERS:
        pid = str(uuid.uuid4())
        doc = {
            "id": pid,
            "user_id": pid,
            "seeded": True,
            "avatar": s.get("photo"),
            **s,
            "zones": ["Dakar", "Almadies", "Plateau"] if s["city"] == "Dakar" else [s["city"]],
            "hours": "Lun-Sam · 8h-19h",
            "gallery": [s.get("photo")],
            "diplomas": [],
            "id_card": None,
            "subscription_active": True,
            "subscription_until": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
            "phone": "+2217700000" + str(inserted).zfill(2),
            "created_at": now_iso(),
        }
        await db.providers.insert_one(doc)
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
    return {"ok": True, "providers": inserted}


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
