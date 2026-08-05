"""
🤝 Jokoo Ambassadors — Programme d'affiliation Jokoo Partners.

Module isolé (0 impact sur l'existant). Permet à un utilisateur (client ou
prestataire) d'être promu "Ambassadeur" par un admin. L'ambassadeur reçoit
alors un code + un lien de parrainage. Les nouveaux utilisateurs qui
s'inscrivent avec son code lui sont rattachés. Les stats et commissions
sont calculées automatiquement selon des tiers progressifs.

Naming :
  - Interne / DB / URL : `ambassadors` (évite la collision avec les "marques
    partenaires" du module `partners`).
  - UI affichée aux utilisateurs : "Jokoo Partners".

Tiers & commissions (modifiables via /admin/ambassadors/config) :
  - starter (0-4 filleuls vérifiés) :  2 %
  - bronze  (5-19)                  :  3 %
  - silver  (20-49)                 :  5 %
  - gold    (50-149)                :  7 %
  - diamond (150-499)               :  9 %
  - elite   (500+)                  : 12 %

Anti-fraude :
  - Un filleul PRESTATAIRE ne compte que s'il est KYC-vérifié ET a effectué
    au moins 1 réservation validée.
  - Un filleul CLIENT ne compte que s'il a effectué au moins 1 réservation
    validée.
  - Auto-parrainage bloqué (même user_id / même email / même téléphone).
  - Rate limit d'attachement : 20 filleuls / IP / jour.

Collections MongoDB :
  - ambassadors         : { user_id, active, code, slug, tier, monthly_goal,
                            joined_at, custom_bio, links: {invite_url} }
  - ambassador_referrals: { id, ambassador_id, referred_user_id, referred_role,
                            status: pending|verified|invalid, first_booking_at,
                            kyc_verified_at, created_at, ip_hash }
  - ambassador_commissions: { id, ambassador_id, booking_id, amount_xof,
                              rate, tier_snapshot, status: pending|approved|
                              paid|cancelled, created_at, paid_at }
  - ambassador_config   : { commissions: {...}, thresholds: {...}, monthly_goal }

Endpoints admin :
  - POST   /api/admin/users/{uid}/ambassador       (toggle + config perso)
  - GET    /api/admin/ambassadors                  (liste + filtres)
  - GET    /api/admin/ambassadors/{aid}            (détail admin)
  - GET    /api/admin/ambassadors/config           (récupère seuils/tiers)
  - PUT    /api/admin/ambassadors/config           (met à jour seuils/tiers)
  - PATCH  /api/admin/ambassadors/{aid}/commission/{cid} (approve/pay/cancel)

Endpoints utilisateur :
  - GET    /api/ambassadors/me                     (profil + stats live)
  - GET    /api/ambassadors/me/referrals           (mes filleuls)
  - GET    /api/ambassadors/me/commissions         (mes commissions)
  - GET    /api/ambassadors/leaderboard            (public, sans montants)
  - POST   /api/ambassadors/resolve                (code → ambassador public)

Endpoints deep-link / signup :
  - POST   /api/ambassadors/attach                 (appelé au signup avec ref)
  - GET    /api/public/invite/{code}               (résolution publique code)

Hooks (auto-triggers, appelés par server.py) :
  - on_user_registered(user, referral_code) → crée le referral
  - on_kyc_verified(user_id)                → mark referral prestataire
  - on_booking_completed(booking)           → calcule + crée commission
"""

from __future__ import annotations

import hashlib
import logging
import re
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, Field

logger = logging.getLogger("jokoo.ambassadors")

# ---------------------------------------------------------------------------
# Configuration par défaut
# ---------------------------------------------------------------------------

DEFAULT_TIER_THRESHOLDS: dict[str, int] = {
    "bronze": 5,
    "silver": 20,
    "gold": 50,
    "diamond": 150,
    "elite": 500,
}

DEFAULT_TIER_COMMISSIONS: dict[str, float] = {
    "starter": 0.02,
    "bronze": 0.03,
    "silver": 0.05,
    "gold": 0.07,
    "diamond": 0.09,
    "elite": 0.12,
}

TIER_ORDER: list[str] = ["starter", "bronze", "silver", "gold", "diamond", "elite"]

TIER_BADGES: dict[str, str] = {
    "starter": "🤝 Jokoo Partner",
    "bronze": "🥉 Bronze",
    "silver": "🥈 Silver",
    "gold": "🥇 Gold",
    "diamond": "💎 Diamond",
    "elite": "👑 Elite",
}

DEFAULT_MONTHLY_GOAL_PRESTATAIRES = 500

# App scheme + universal link base (utilisé pour construire le lien de partage)
DEFAULT_APP_SCHEME = "jokoo"
DEFAULT_INVITE_HOST = "https://jokoo.sn"

MAX_ATTACH_PER_IP_PER_DAY = 20


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def compute_tier(verified_count: int, thresholds: dict[str, int] | None = None) -> str:
    t = thresholds or DEFAULT_TIER_THRESHOLDS
    if verified_count >= t.get("elite", 500):
        return "elite"
    if verified_count >= t.get("diamond", 150):
        return "diamond"
    if verified_count >= t.get("gold", 50):
        return "gold"
    if verified_count >= t.get("silver", 20):
        return "silver"
    if verified_count >= t.get("bronze", 5):
        return "bronze"
    return "starter"


def gen_code(length: int = 6) -> str:
    """Code court alphanumérique majuscule (évite les caractères ambigus)."""
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _slugify(name: str) -> str:
    if not name:
        return "partner"
    s = name.strip().lower()
    # Retire les accents
    import unicodedata
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "partner"


def _hash_ip(ip: Optional[str]) -> Optional[str]:
    if not ip:
        return None
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


def _get_ip(request: Request) -> Optional[str]:
    try:
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            return xff.split(",")[0].strip()
        return request.client.host if request.client else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Pydantic bodies
# ---------------------------------------------------------------------------

class ToggleAmbassadorBody(BaseModel):
    active: bool = True
    monthly_goal: Optional[int] = Field(default=None, ge=0, le=10000)
    custom_slug: Optional[str] = Field(default=None, max_length=40)
    custom_bio: Optional[str] = Field(default=None, max_length=280)


class AmbassadorConfigBody(BaseModel):
    thresholds: Optional[dict[str, int]] = None
    commissions: Optional[dict[str, float]] = None
    monthly_goal: Optional[int] = Field(default=None, ge=0, le=10000)


class AttachReferralBody(BaseModel):
    """Appelé côté serveur au moment du signup pour rattacher un nouveau
    user à un ambassadeur. Peut être appelé aussi de façon manuelle depuis
    l'app si l'utilisateur entre un code après inscription."""
    code: Optional[str] = None
    slug: Optional[str] = None
    referred_user_id: Optional[str] = None  # optionnel : utilisé si appel serveur→serveur
    device_fingerprint: Optional[str] = None


class ResolveInviteBody(BaseModel):
    code: str


# ---------------------------------------------------------------------------
# Public utilities (utilisées par server.py pour hooks + activation)
# ---------------------------------------------------------------------------

async def get_config(db) -> dict:
    """Retourne la config globale (avec merge des defaults)."""
    cfg = await db.ambassador_config.find_one({"_id": "global"})
    if not cfg:
        cfg = {
            "_id": "global",
            "thresholds": dict(DEFAULT_TIER_THRESHOLDS),
            "commissions": dict(DEFAULT_TIER_COMMISSIONS),
            "monthly_goal": DEFAULT_MONTHLY_GOAL_PRESTATAIRES,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        await db.ambassador_config.insert_one(cfg)
    # merge defaults for missing keys
    thr = dict(DEFAULT_TIER_THRESHOLDS)
    thr.update(cfg.get("thresholds") or {})
    cm = dict(DEFAULT_TIER_COMMISSIONS)
    cm.update(cfg.get("commissions") or {})
    return {
        "thresholds": thr,
        "commissions": cm,
        "monthly_goal": cfg.get("monthly_goal", DEFAULT_MONTHLY_GOAL_PRESTATAIRES),
    }


async def ensure_indexes(db) -> None:
    """Idempotent : crée les index nécessaires."""
    try:
        await db.ambassadors.create_index("user_id", unique=True)
        await db.ambassadors.create_index("code", unique=True, sparse=True)
        await db.ambassadors.create_index("slug", unique=True, sparse=True)
        await db.ambassador_referrals.create_index([("ambassador_id", 1), ("created_at", -1)])
        await db.ambassador_referrals.create_index("referred_user_id", unique=True, sparse=True)
        await db.ambassador_commissions.create_index([("ambassador_id", 1), ("created_at", -1)])
        await db.ambassador_commissions.create_index("booking_id", sparse=True)
    except Exception as e:  # noqa
        logger.warning("ambassadors ensure_indexes failed: %s", e)


async def _generate_unique_code(db) -> str:
    for _ in range(20):
        code = gen_code(6)
        exists = await db.ambassadors.find_one({"code": code}, {"_id": 1})
        if not exists:
            return code
    # fallback : plus long
    return gen_code(9)


async def _generate_unique_slug(db, base: str) -> str:
    slug = _slugify(base)
    candidate = slug
    i = 2
    while await db.ambassadors.find_one({"slug": candidate}, {"_id": 1}):
        candidate = f"{slug}-{i}"
        i += 1
        if i > 500:
            candidate = f"{slug}-{secrets.token_hex(3)}"
            break
    return candidate


def _build_links(code: str, slug: str) -> dict[str, str]:
    return {
        "web": f"{DEFAULT_INVITE_HOST}/i/{code}",
        "web_slug": f"{DEFAULT_INVITE_HOST}/{slug}",
        "app": f"{DEFAULT_APP_SCHEME}://invite/{code}",
        "share_text": (
            "Rejoins-moi sur Jokoo 🇸🇳 — la marketplace des services de confiance. "
            f"Utilise mon code {code} : {DEFAULT_INVITE_HOST}/{slug}"
        ),
    }


async def _get_or_create_ambassador(
    db,
    user_id: str,
    user_name: Optional[str],
    goal: Optional[int] = None,
    custom_slug: Optional[str] = None,
    custom_bio: Optional[str] = None,
) -> dict:
    existing = await db.ambassadors.find_one({"user_id": user_id})
    if existing:
        return existing
    code = await _generate_unique_code(db)
    slug_source = custom_slug or user_name or user_id[:6]
    slug = await _generate_unique_slug(db, slug_source)
    doc = {
        "user_id": user_id,
        "active": True,
        "code": code,
        "slug": slug,
        "tier": "starter",
        "monthly_goal": goal or DEFAULT_MONTHLY_GOAL_PRESTATAIRES,
        "custom_bio": custom_bio,
        "joined_at": _now_iso(),
        "updated_at": _now_iso(),
        "links": _build_links(code, slug),
        "verified_count": 0,
        "pending_count": 0,
    }
    await db.ambassadors.insert_one(doc)
    return doc


async def _refresh_ambassador_stats(db, ambassador_id: str) -> dict:
    """Recompute stats + tier for one ambassador. Renvoie le doc mis à jour."""
    amb = await db.ambassadors.find_one({"user_id": ambassador_id})
    if not amb:
        return {}
    pending = await db.ambassador_referrals.count_documents(
        {"ambassador_id": ambassador_id, "status": "pending"}
    )
    verified = await db.ambassador_referrals.count_documents(
        {"ambassador_id": ambassador_id, "status": "verified"}
    )
    cfg = await get_config(db)
    tier = compute_tier(verified, cfg["thresholds"])
    await db.ambassadors.update_one(
        {"user_id": ambassador_id},
        {"$set": {
            "verified_count": verified,
            "pending_count": pending,
            "tier": tier,
            "updated_at": _now_iso(),
        }},
    )
    amb["verified_count"] = verified
    amb["pending_count"] = pending
    amb["tier"] = tier
    return amb


# ---------------------------------------------------------------------------
# Hooks (appelés par server.py aux moments-clés du cycle utilisateur)
# ---------------------------------------------------------------------------

async def hook_user_registered(
    db,
    new_user_id: str,
    new_user_role: str,
    ambassador_code_or_slug: Optional[str],
    new_user_email: Optional[str] = None,
    new_user_phone: Optional[str] = None,
    ip: Optional[str] = None,
) -> Optional[str]:
    """Rattache un nouvel utilisateur à un ambassadeur si un code/slug est fourni.

    Retourne l'ambassador_id (= user_id de l'ambassadeur) si rattachement OK,
    sinon None.
    """
    if not ambassador_code_or_slug:
        return None

    token = ambassador_code_or_slug.strip().upper()
    amb = await db.ambassadors.find_one({
        "$or": [
            {"code": token},
            {"slug": token.lower()},
        ],
        "active": True,
    })
    if not amb:
        return None

    # Anti-fraude : auto-parrainage bloqué
    if amb["user_id"] == new_user_id:
        return None

    # Anti-fraude : rate limit par IP
    ip_hash = _hash_ip(ip)
    if ip_hash:
        since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        recent = await db.ambassador_referrals.count_documents({
            "ip_hash": ip_hash,
            "created_at": {"$gte": since},
        })
        if recent >= MAX_ATTACH_PER_IP_PER_DAY:
            logger.warning("ambassadors: rate limit hit for ip_hash=%s", ip_hash)
            return None

    # Idempotence : un user ne peut être filleul que d'un seul ambassadeur
    existing = await db.ambassador_referrals.find_one({"referred_user_id": new_user_id})
    if existing:
        return existing.get("ambassador_id")

    doc = {
        "id": str(uuid.uuid4()),
        "ambassador_id": amb["user_id"],
        "referred_user_id": new_user_id,
        "referred_role": new_user_role,
        "referred_email_hash": _hash_ip(new_user_email) if new_user_email else None,
        "referred_phone_hash": _hash_ip(new_user_phone) if new_user_phone else None,
        "status": "pending",
        "created_at": _now_iso(),
        "ip_hash": ip_hash,
    }
    await db.ambassador_referrals.insert_one(doc)

    # Bump pending count (tier ne change pas car verified inchangé)
    await db.ambassadors.update_one(
        {"user_id": amb["user_id"]},
        {"$inc": {"pending_count": 1}, "$set": {"updated_at": _now_iso()}},
    )
    logger.info(
        "ambassador referral: %s → %s (role=%s)",
        amb["user_id"], new_user_id, new_user_role,
    )
    return amb["user_id"]


async def hook_kyc_verified(db, user_id: str) -> None:
    """Marque le referral prestataire comme KYC-vérifié. Ne le passe PAS encore
    en 'verified' — il faut aussi 1 réservation."""
    ref = await db.ambassador_referrals.find_one({"referred_user_id": user_id})
    if not ref or ref.get("kyc_verified_at"):
        return
    await db.ambassador_referrals.update_one(
        {"referred_user_id": user_id},
        {"$set": {"kyc_verified_at": _now_iso()}},
    )
    # Si prestataire ET a déjà une réservation → passe en verified
    if ref.get("referred_role") == "prestataire" and ref.get("first_booking_at"):
        await _finalize_referral(db, ref["ambassador_id"], user_id)


async def hook_booking_completed(
    db,
    booking: dict,
    booking_amount_xof: int,
) -> None:
    """Appelé quand une réservation passe en 'completed'. Peut faire 2 choses :
      1. Finaliser le referral (passer pending → verified si prestataire KYC OK
         ou si c'est le 1er booking d'un client).
      2. Créer une commission pour l'ambassadeur du prestataire (côté
         prestataire) et/ou du client (côté client), sur la base du tier.
    """
    # 1) referral côté client (le client vient d'utiliser Jokoo pour la 1ère fois)
    client_id = booking.get("client_id") or booking.get("customer_id")
    provider_id = booking.get("provider_id") or booking.get("prestataire_id")

    for uid, role in [(client_id, "client"), (provider_id, "prestataire")]:
        if not uid:
            continue
        ref = await db.ambassador_referrals.find_one({"referred_user_id": uid})
        if not ref:
            continue
        # 1er booking : on stocke la date
        if not ref.get("first_booking_at"):
            await db.ambassador_referrals.update_one(
                {"referred_user_id": uid},
                {"$set": {"first_booking_at": _now_iso()}},
            )
        # Client : verified dès le 1er booking completed
        if role == "client" and ref.get("status") == "pending":
            await _finalize_referral(db, ref["ambassador_id"], uid)
        # Prestataire : verified si aussi KYC vérifié
        if role == "prestataire" and ref.get("status") == "pending" and ref.get("kyc_verified_at"):
            await _finalize_referral(db, ref["ambassador_id"], uid)

    # 2) Commission — on utilise le prestataire (celui qui exécute la mission)
    # Note : on choisit UN seul ambassadeur qui touche la commission. Pour éviter
    # double comptage, on privilégie l'ambassadeur du prestataire (qui a apporté
    # le talent), puis à défaut celui du client.
    commission_target: Optional[str] = None
    if provider_id:
        ref_p = await db.ambassador_referrals.find_one({"referred_user_id": provider_id})
        if ref_p:
            commission_target = ref_p["ambassador_id"]
    if not commission_target and client_id:
        ref_c = await db.ambassador_referrals.find_one({"referred_user_id": client_id})
        if ref_c:
            commission_target = ref_c["ambassador_id"]
    if not commission_target:
        return
    amb = await db.ambassadors.find_one({"user_id": commission_target, "active": True})
    if not amb:
        return

    # Idempotence : une seule commission par (ambassador, booking)
    booking_id = booking.get("id") or booking.get("_id")
    if not booking_id:
        return
    existing_cm = await db.ambassador_commissions.find_one({
        "ambassador_id": commission_target,
        "booking_id": booking_id,
    })
    if existing_cm:
        return

    cfg = await get_config(db)
    tier = amb.get("tier", "starter")
    rate = float(cfg["commissions"].get(tier, DEFAULT_TIER_COMMISSIONS.get(tier, 0.02)))
    amount = int(round(booking_amount_xof * rate))

    await db.ambassador_commissions.insert_one({
        "id": str(uuid.uuid4()),
        "ambassador_id": commission_target,
        "booking_id": booking_id,
        "amount_xof": amount,
        "rate": rate,
        "tier_snapshot": tier,
        "status": "pending",
        "created_at": _now_iso(),
    })
    logger.info(
        "commission created: amb=%s booking=%s tier=%s rate=%.2f amount=%d XOF",
        commission_target, booking_id, tier, rate, amount,
    )


async def _finalize_referral(db, ambassador_id: str, referred_user_id: str) -> None:
    """Passe le referral de 'pending' à 'verified' et déclenche re-tier."""
    r = await db.ambassador_referrals.update_one(
        {"referred_user_id": referred_user_id, "status": "pending"},
        {"$set": {"status": "verified", "verified_at": _now_iso()}},
    )
    if r.modified_count > 0:
        await db.ambassadors.update_one(
            {"user_id": ambassador_id},
            {"$inc": {"pending_count": -1, "verified_count": 1}},
        )
        await _refresh_ambassador_stats(db, ambassador_id)


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

def create_ambassadors_router(
    *,
    db,
    current_user: Callable,
    require_admin: Callable,
    send_push: Optional[Callable] = None,
) -> APIRouter:
    """Fabrique un router prêt à monter sur `/api`.

    :param db:            Motor DB.
    :param current_user:  dépendance FastAPI renvoyant le user courant (dict).
    :param require_admin: fonction de garde `require_admin(user_dict)` qui
                          lève 403 si le user n'est pas admin.
    :param send_push:     fonction async(user_id, title, body, data) —
                          notifications automatiques sur événements.
    """
    router = APIRouter(tags=["ambassadors"])

    # Wrapper `Depends`-compatible pour require_admin (qui est une fonction de
    # garde plain, pas une vraie dépendance FastAPI).
    async def _admin_dep(user=Depends(current_user)) -> dict:
        require_admin(user)
        return user

    async def _notify(user_id: str, title: str, body: str, data: Optional[dict] = None):
        if not send_push:
            return
        try:
            await send_push(
                user_id=user_id,
                title=title,
                body=body,
                data=data or {},
            )
        except Exception as e:
            logger.debug("ambassador notify failed: %s", e)

    # ---- Admin ----

    @router.post("/admin/users/{uid}/ambassador")
    async def admin_toggle_ambassador(uid: str, body: ToggleAmbassadorBody, _admin=Depends(_admin_dep)):
        user = await db.users.find_one({"id": uid})
        if not user:
            raise HTTPException(404, "User not found")

        if not body.active:
            # Désactivation soft : on garde l'historique + les commissions
            await db.ambassadors.update_one(
                {"user_id": uid},
                {"$set": {"active": False, "updated_at": _now_iso()}},
            )
            return {"ok": True, "active": False}

        # Custom slug validation
        if body.custom_slug:
            clean = _slugify(body.custom_slug)
            other = await db.ambassadors.find_one({"slug": clean, "user_id": {"$ne": uid}}, {"_id": 1})
            if other:
                raise HTTPException(400, "Slug déjà utilisé.")

        amb = await _get_or_create_ambassador(
            db,
            user_id=uid,
            user_name=user.get("name"),
            goal=body.monthly_goal,
            custom_slug=body.custom_slug,
            custom_bio=body.custom_bio,
        )
        # Re-activate if previously deactivated
        updates = {"active": True, "updated_at": _now_iso()}
        if body.monthly_goal is not None:
            updates["monthly_goal"] = body.monthly_goal
        if body.custom_bio is not None:
            updates["custom_bio"] = body.custom_bio
        await db.ambassadors.update_one({"user_id": uid}, {"$set": updates})

        # Notification
        await _notify(
            uid,
            "🤝 Bienvenue chez Jokoo Partners !",
            f"Votre code de parrainage : {amb['code']}. Partagez et gagnez.",
            {"type": "ambassador_activated", "code": amb["code"]},
        )
        amb = await db.ambassadors.find_one({"user_id": uid})
        return {"ok": True, "ambassador": _serialize_ambassador(amb, user)}

    @router.get("/admin/ambassadors")
    async def admin_list_ambassadors(
        _admin=Depends(_admin_dep),
        active: Optional[bool] = None,
        limit: int = Query(default=100, ge=1, le=500),
    ):
        q: dict = {}
        if active is not None:
            q["active"] = active
        cur = db.ambassadors.find(q, {"_id": 0}).sort("verified_count", -1).limit(limit)
        rows = await cur.to_list(length=limit)
        # Enrich with user info
        uids = [r["user_id"] for r in rows]
        users = {u["id"]: u async for u in db.users.find({"id": {"$in": uids}})}
        return [_serialize_ambassador(r, users.get(r["user_id"], {})) for r in rows]

    @router.get("/admin/ambassadors/config")
    async def admin_get_config(_admin=Depends(_admin_dep)):
        return await get_config(db)

    @router.put("/admin/ambassadors/config")
    async def admin_update_config(body: AmbassadorConfigBody, _admin=Depends(_admin_dep)):
        update: dict = {"updated_at": _now_iso()}
        if body.thresholds:
            update["thresholds"] = body.thresholds
        if body.commissions:
            update["commissions"] = {k: float(v) for k, v in body.commissions.items()}
        if body.monthly_goal is not None:
            update["monthly_goal"] = body.monthly_goal
        await db.ambassador_config.update_one(
            {"_id": "global"},
            {"$set": update, "$setOnInsert": {"created_at": _now_iso()}},
            upsert=True,
        )
        return await get_config(db)

    @router.patch("/admin/ambassadors/commissions/{cid}")
    async def admin_update_commission(
        cid: str, status: str = Query(...), _admin=Depends(_admin_dep)
    ):
        if status not in ("pending", "approved", "paid", "cancelled"):
            raise HTTPException(400, "Invalid status")
        updates: dict = {"status": status}
        if status == "paid":
            updates["paid_at"] = _now_iso()
        r = await db.ambassador_commissions.update_one({"id": cid}, {"$set": updates})
        if r.matched_count == 0:
            raise HTTPException(404, "Commission not found")
        return {"ok": True}

    # ---- User (self) ----

    @router.get("/ambassadors/me")
    async def my_profile(user=Depends(current_user)):
        amb = await db.ambassadors.find_one({"user_id": user["id"]})
        if not amb or not amb.get("active"):
            return {"is_ambassador": False}
        amb = await _refresh_ambassador_stats(db, user["id"])
        # Compute commissions summary
        agg = db.ambassador_commissions.aggregate([
            {"$match": {"ambassador_id": user["id"]}},
            {"$group": {"_id": "$status", "total": {"$sum": "$amount_xof"}, "count": {"$sum": 1}}},
        ])
        totals = {"pending": 0, "approved": 0, "paid": 0, "cancelled": 0}
        counts = {"pending": 0, "approved": 0, "paid": 0, "cancelled": 0}
        async for row in agg:
            totals[row["_id"]] = row["total"]
            counts[row["_id"]] = row["count"]
        cfg = await get_config(db)
        # Filleuls du mois pour la progress bar
        month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        month_verified = await db.ambassador_referrals.count_documents({
            "ambassador_id": user["id"],
            "status": "verified",
            "verified_at": {"$gte": month_start},
        })
        return {
            "is_ambassador": True,
            "ambassador": _serialize_ambassador(amb, user),
            "stats": {
                "verified_total": amb.get("verified_count", 0),
                "pending_total": amb.get("pending_count", 0),
                "prestataires_verified": await db.ambassador_referrals.count_documents({
                    "ambassador_id": user["id"], "status": "verified", "referred_role": "prestataire"
                }),
                "clients_verified": await db.ambassador_referrals.count_documents({
                    "ambassador_id": user["id"], "status": "verified", "referred_role": "client"
                }),
                "bookings_generated": await db.ambassador_commissions.count_documents({
                    "ambassador_id": user["id"]
                }),
                "commissions": {
                    "pending_xof": totals["pending"],
                    "approved_xof": totals["approved"],
                    "paid_xof": totals["paid"],
                    "count": counts["pending"] + counts["approved"] + counts["paid"],
                },
                "month_progress": {
                    "current": month_verified,
                    "goal": amb.get("monthly_goal", cfg["monthly_goal"]),
                },
            },
            "tier": amb.get("tier", "starter"),
            "tier_label": TIER_BADGES.get(amb.get("tier", "starter"), "🤝"),
            "next_tier": _next_tier_info(amb.get("verified_count", 0), cfg["thresholds"]),
            "config": {
                "thresholds": cfg["thresholds"],
                "commissions": cfg["commissions"],
            },
        }

    @router.get("/ambassadors/me/referrals")
    async def my_referrals(user=Depends(current_user), limit: int = Query(50, ge=1, le=200)):
        amb = await db.ambassadors.find_one({"user_id": user["id"]}, {"_id": 1})
        if not amb:
            raise HTTPException(403, "Not an ambassador")
        rows = await db.ambassador_referrals.find(
            {"ambassador_id": user["id"]}, {"_id": 0, "ip_hash": 0, "referred_email_hash": 0, "referred_phone_hash": 0}
        ).sort("created_at", -1).limit(limit).to_list(length=limit)
        # Enrich with user names
        uids = [r["referred_user_id"] for r in rows]
        users = {u["id"]: u async for u in db.users.find({"id": {"$in": uids}}, {"_id": 0, "id": 1, "name": 1, "avatar": 1, "role": 1})}
        for r in rows:
            u = users.get(r["referred_user_id"], {})
            r["name"] = u.get("name")
            r["avatar"] = u.get("avatar")
            r["role"] = u.get("role") or r.get("referred_role")
        return rows

    @router.get("/ambassadors/me/commissions")
    async def my_commissions(user=Depends(current_user), limit: int = Query(50, ge=1, le=200)):
        amb = await db.ambassadors.find_one({"user_id": user["id"]}, {"_id": 1})
        if not amb:
            raise HTTPException(403, "Not an ambassador")
        rows = await db.ambassador_commissions.find(
            {"ambassador_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1).limit(limit).to_list(length=limit)
        return rows

    # ---- Public ----

    @router.get("/ambassadors/leaderboard")
    async def public_leaderboard(limit: int = Query(20, ge=1, le=100)):
        # Trie par verified_count (aucun montant révélé)
        cur = db.ambassadors.find(
            {"active": True, "verified_count": {"$gt": 0}},
            {"_id": 0, "user_id": 1, "code": 1, "slug": 1, "tier": 1, "verified_count": 1},
        ).sort("verified_count", -1).limit(limit)
        rows = await cur.to_list(length=limit)
        uids = [r["user_id"] for r in rows]
        users = {u["id"]: u async for u in db.users.find({"id": {"$in": uids}}, {"_id": 0, "id": 1, "name": 1, "avatar": 1})}
        out = []
        for idx, r in enumerate(rows, start=1):
            u = users.get(r["user_id"], {})
            # Split by role — approximé via un count clients vs prestataires
            prest = await db.ambassador_referrals.count_documents({
                "ambassador_id": r["user_id"], "status": "verified", "referred_role": "prestataire"
            })
            clients = await db.ambassador_referrals.count_documents({
                "ambassador_id": r["user_id"], "status": "verified", "referred_role": "client"
            })
            out.append({
                "rank": idx,
                "name": u.get("name") or r.get("slug"),
                "avatar": u.get("avatar"),
                "tier": r.get("tier", "starter"),
                "badge": TIER_BADGES.get(r.get("tier", "starter"), "🤝"),
                "prestataires": prest,
                "clients": clients,
            })
        return out

    @router.post("/ambassadors/attach")
    async def user_attach(body: AttachReferralBody, request: Request, user=Depends(current_user)):
        """L'utilisateur (connecté) rentre un code après inscription pour se
        rattacher à un ambassadeur (idempotent : une seule fois)."""
        existing = await db.ambassador_referrals.find_one({"referred_user_id": user["id"]})
        if existing:
            return {"ok": True, "already_attached": True, "ambassador_id": existing["ambassador_id"]}
        ip = _get_ip(request)
        aid = await hook_user_registered(
            db,
            new_user_id=user["id"],
            new_user_role=user.get("role", "client"),
            ambassador_code_or_slug=body.code or body.slug,
            new_user_email=user.get("email"),
            new_user_phone=user.get("phone"),
            ip=ip,
        )
        return {"ok": bool(aid), "ambassador_id": aid}

    @router.post("/ambassadors/resolve")
    async def public_resolve(body: ResolveInviteBody):
        """Résout un code/slug en profil public (utilisé au signup pour afficher
        'Vous avez été invité par X'). Ne révèle aucune donnée sensible."""
        token = body.code.strip()
        amb = await db.ambassadors.find_one({
            "$or": [{"code": token.upper()}, {"slug": token.lower()}],
            "active": True,
        })
        if not amb:
            raise HTTPException(404, "Invitation invalide ou expirée.")
        user = await db.users.find_one({"id": amb["user_id"]}, {"_id": 0, "name": 1, "avatar": 1})
        return {
            "code": amb["code"],
            "slug": amb["slug"],
            "tier": amb.get("tier", "starter"),
            "badge": TIER_BADGES.get(amb.get("tier", "starter"), "🤝"),
            "inviter_name": user.get("name") if user else "Un partenaire Jokoo",
            "inviter_avatar": user.get("avatar") if user else None,
        }

    @router.get("/public/invite/{code}")
    async def public_invite_meta(code: str):
        """Métadonnées pour la landing page web (jokoo.sn/i/CODE). Renvoie
        aussi les Universal Link params."""
        token = code.strip().upper()
        amb = await db.ambassadors.find_one({"code": token, "active": True})
        if not amb:
            # On renvoie une réponse "vide" mais 200 pour que la landing gère.
            return {"valid": False, "code": token}
        user = await db.users.find_one({"id": amb["user_id"]}, {"_id": 0, "name": 1, "avatar": 1})
        return {
            "valid": True,
            "code": amb["code"],
            "slug": amb["slug"],
            "tier": amb.get("tier", "starter"),
            "badge": TIER_BADGES.get(amb.get("tier", "starter"), "🤝"),
            "inviter_name": user.get("name") if user else "Un partenaire Jokoo",
            "inviter_avatar": user.get("avatar") if user else None,
            "links": amb.get("links") or _build_links(amb["code"], amb["slug"]),
        }

    return router


def _serialize_ambassador(amb: dict, user: dict | None = None) -> dict:
    if not amb:
        return {}
    return {
        "user_id": amb.get("user_id"),
        "name": (user or {}).get("name"),
        "avatar": (user or {}).get("avatar"),
        "role": (user or {}).get("role"),
        "active": amb.get("active", False),
        "code": amb.get("code"),
        "slug": amb.get("slug"),
        "tier": amb.get("tier", "starter"),
        "badge": TIER_BADGES.get(amb.get("tier", "starter"), "🤝"),
        "monthly_goal": amb.get("monthly_goal", DEFAULT_MONTHLY_GOAL_PRESTATAIRES),
        "verified_count": amb.get("verified_count", 0),
        "pending_count": amb.get("pending_count", 0),
        "custom_bio": amb.get("custom_bio"),
        "joined_at": amb.get("joined_at"),
        "links": amb.get("links") or {},
    }


def _next_tier_info(verified: int, thresholds: dict[str, int]) -> Optional[dict]:
    """Retourne le prochain tier + combien il en manque pour l'atteindre."""
    order = [("bronze", thresholds.get("bronze", 5)),
             ("silver", thresholds.get("silver", 20)),
             ("gold", thresholds.get("gold", 50)),
             ("diamond", thresholds.get("diamond", 150)),
             ("elite", thresholds.get("elite", 500))]
    for tier, thr in order:
        if verified < thr:
            return {"tier": tier, "badge": TIER_BADGES.get(tier), "needed": thr - verified, "threshold": thr}
    return None
