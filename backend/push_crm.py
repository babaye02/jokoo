"""
📢 Jokoo CRM — Push Campaigns Module

Provides:
  - Segment resolver (target audiences)
  - Campaign CRUD + immediate/scheduled send
  - Template library (10 seeded templates)
  - Auto-triggers helper for lifecycle events
  - Dashboard KPIs
  - Background scheduler (asyncio task)

All admin endpoints are guarded by `require_admin` (imported at plug time).
"""
from __future__ import annotations

import asyncio
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


# ------------------------------------------------------------------
# Templates de messages (10 modèles prêts à l'emploi)
# ------------------------------------------------------------------
DEFAULT_TEMPLATES: list[dict] = [
    {
        "key": "welcome",
        "category": "onboarding",
        "title_template": "Bienvenue sur Jokoo 👋",
        "message_template": "Découvrez des prestataires vérifiés près de chez vous.",
        "deep_link": "/",
        "cta_text": "Explorer",
    },
    {
        "key": "eid",
        "category": "fete",
        "title_template": "Bonne fête 🌙",
        "message_template": "L'équipe Jokoo vous souhaite une belle fête à vous et à vos proches.",
    },
    {
        "key": "christmas",
        "category": "fete",
        "title_template": "Joyeux Noël 🎄",
        "message_template": "L'équipe Jokoo vous souhaite un très joyeux Noël, entouré de vos proches.",
    },
    {
        "key": "new_year",
        "category": "fete",
        "title_template": "Bonne année ! 🎉",
        "message_template": "Que cette nouvelle année vous apporte succès, santé et prospérité.",
    },
    {
        "key": "promo",
        "category": "marketing",
        "title_template": "🔥 Offre spéciale Jokoo",
        "message_template": "Profitez de -20% sur votre prochaine réservation avec le code JOKOO20.",
        "deep_link": "/promo-codes",
        "cta_text": "En profiter",
    },
    {
        "key": "new_service",
        "category": "marketing",
        "title_template": "Nouveau service disponible 🚀",
        "message_template": "Découvrez notre nouveau service : plus proche, plus rapide, plus pratique.",
        "deep_link": "/",
        "cta_text": "Découvrir",
    },
    {
        "key": "app_update",
        "category": "system",
        "title_template": "Mise à jour Jokoo disponible 📱",
        "message_template": "Une nouvelle version de l'app est prête. Mettez-la à jour pour de nouvelles fonctionnalités.",
    },
    {
        "key": "booking_reminder",
        "category": "reminder",
        "title_template": "Rappel : votre réservation demain 📅",
        "message_template": "N'oubliez pas votre rendez-vous prévu demain avec votre prestataire.",
        "deep_link": "/(tabs)/profile",
        "cta_text": "Voir la réservation",
    },
    {
        "key": "review_request",
        "category": "reminder",
        "title_template": "Comment s'est passée votre mission ? ⭐",
        "message_template": "Partagez votre expérience et aidez la communauté Jokoo.",
        "deep_link": "/(tabs)/profile",
        "cta_text": "Noter",
    },
    {
        "key": "new_promo_codes",
        "category": "marketing",
        "title_template": "🎁 De nouveaux codes promo Jokoo !",
        "message_template": "De nouvelles réductions sont disponibles. Découvrez-les vite.",
        "deep_link": "/promo-codes",
        "cta_text": "Voir les codes",
    },
]


# ------------------------------------------------------------------
# Segment resolver
# ------------------------------------------------------------------
SegmentType = str  # "all"|"clients"|"prestataires"|"verified"|"unverified"|"category"|"city"|"new_signups"|"inactive"|"manual"

INACTIVE_DAYS = 30
NEW_SIGNUP_DAYS = 7


async def resolve_segment(db, segment_type: SegmentType, params: dict | None = None) -> list[str]:
    """Retourne la liste des user_ids ciblés par un segment."""
    params = params or {}
    now = datetime.now(timezone.utc)

    if segment_type == "all":
        cur = db.users.find({"blocked": {"$ne": True}}, {"_id": 0, "id": 1})
        return [u["id"] async for u in cur if u.get("id")]

    if segment_type == "clients":
        cur = db.users.find({"role": "client", "blocked": {"$ne": True}}, {"_id": 0, "id": 1})
        return [u["id"] async for u in cur if u.get("id")]

    if segment_type == "prestataires":
        cur = db.users.find({"role": "prestataire", "blocked": {"$ne": True}}, {"_id": 0, "id": 1})
        return [u["id"] async for u in cur if u.get("id")]

    if segment_type == "verified":
        cur = db.providers.find({"verified": True}, {"_id": 0, "id": 1})
        return [p["id"] async for p in cur if p.get("id")]

    if segment_type == "unverified":
        # Prestataires non vérifiés (users role=prestataire dont providers.verified != true)
        cur = db.providers.find({"$or": [{"verified": {"$exists": False}}, {"verified": False}]}, {"_id": 0, "id": 1})
        return [p["id"] async for p in cur if p.get("id")]

    if segment_type == "category":
        key = params.get("category") or params.get("value")
        if not key:
            return []
        cur = db.providers.find({"category": key}, {"_id": 0, "id": 1})
        return [p["id"] async for p in cur if p.get("id")]

    if segment_type == "city":
        city = params.get("city") or params.get("value")
        if not city:
            return []
        # Recherche insensible à la casse sur users.city ET providers.city
        pattern = re.compile(f"^{re.escape(city)}$", re.IGNORECASE)
        seen: set[str] = set()
        async for u in db.users.find({"city": {"$regex": pattern}}, {"_id": 0, "id": 1}):
            if u.get("id"):
                seen.add(u["id"])
        async for p in db.providers.find({"city": {"$regex": pattern}}, {"_id": 0, "id": 1}):
            if p.get("id"):
                seen.add(p["id"])
        return list(seen)

    if segment_type == "new_signups":
        days = int(params.get("days") or NEW_SIGNUP_DAYS)
        cutoff = (now - timedelta(days=days)).isoformat()
        cur = db.users.find({"created_at": {"$gte": cutoff}, "blocked": {"$ne": True}}, {"_id": 0, "id": 1})
        return [u["id"] async for u in cur if u.get("id")]

    if segment_type == "inactive":
        days = int(params.get("days") or INACTIVE_DAYS)
        cutoff = (now - timedelta(days=days)).isoformat()
        # Un utilisateur "inactif" = last_seen_at (push_devices) avant cutoff OU jamais vu
        active_ids: set[str] = set()
        async for d in db.push_devices.find({"last_seen_at": {"$gte": cutoff}, "active": True}, {"_id": 0, "user_id": 1}):
            active_ids.add(d["user_id"])
        cur = db.users.find({"blocked": {"$ne": True}}, {"_id": 0, "id": 1})
        return [u["id"] async for u in cur if u.get("id") and u["id"] not in active_ids]

    if segment_type == "manual":
        ids = params.get("user_ids") or []
        return [str(x) for x in ids if x]

    return []


# ------------------------------------------------------------------
# Pydantic models
# ------------------------------------------------------------------
class SegmentSpec(BaseModel):
    type: str  # SegmentType
    params: Optional[dict] = None


class CampaignIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    message: str = Field(..., min_length=1, max_length=500)
    image_url: Optional[str] = None
    deep_link: Optional[str] = None
    cta_text: Optional[str] = Field(None, max_length=40)
    segment: SegmentSpec
    mode: str = "immediate"  # "immediate" | "scheduled"
    scheduled_at: Optional[str] = None  # ISO-8601


class CampaignPatch(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    image_url: Optional[str] = None
    deep_link: Optional[str] = None
    cta_text: Optional[str] = None
    segment: Optional[SegmentSpec] = None
    mode: Optional[str] = None
    scheduled_at: Optional[str] = None
    status: Optional[str] = None


class TemplateIn(BaseModel):
    key: str = Field(..., min_length=1, max_length=60)
    category: str = "custom"
    title_template: str = Field(..., min_length=1, max_length=120)
    message_template: str = Field(..., min_length=1, max_length=500)
    image_url: Optional[str] = None
    deep_link: Optional[str] = None
    cta_text: Optional[str] = None


class PreviewIn(BaseModel):
    segment: SegmentSpec


# ------------------------------------------------------------------
# Router factory — plug into main app in server.py
# ------------------------------------------------------------------
def create_push_crm_router(*, db, send_push, current_user, require_admin, now_iso, log) -> APIRouter:
    router = APIRouter(prefix="/admin/push", tags=["admin_push"])

    async def _ensure_default_templates() -> None:
        for tpl in DEFAULT_TEMPLATES:
            await db.push_templates.update_one(
                {"key": tpl["key"]},
                {
                    "$setOnInsert": {
                        **tpl,
                        "id": str(uuid.uuid4()),
                        "is_default": True,
                        "created_at": now_iso(),
                    }
                },
                upsert=True,
            )

    async def _campaign_stats(campaign_id: str) -> dict:
        pipeline = [
            {"$match": {"campaign_id": campaign_id}},
            {"$group": {"_id": "$event", "n": {"$sum": 1}}},
        ]
        by_event = {row["_id"]: row["n"] async for row in db.push_events.aggregate(pipeline)}
        return {
            "sent":      by_event.get("sent", 0),
            "delivered": by_event.get("delivered", 0),  # Phase 2
            "opened":    by_event.get("opened", 0),      # Phase 2
            "failed":    by_event.get("failed", 0),
        }

    async def _send_campaign(campaign: dict) -> dict:
        recipients = await resolve_segment(db, campaign["segment"]["type"], campaign["segment"].get("params"))
        stats = {"targeted": len(recipients), "sent": 0, "failed": 0}
        campaign_id = campaign["id"]

        data = {
            "title": campaign["title"],
            "message": campaign["message"],
        }
        if campaign.get("image_url"):    data["image_url"] = campaign["image_url"]
        if campaign.get("deep_link"):    data["action_url"] = campaign["deep_link"]
        if campaign.get("cta_text"):     data["cta_text"] = campaign["cta_text"]

        if not recipients:
            await db.push_campaigns.update_one(
                {"id": campaign_id},
                {"$set": {"status": "sent", "stats": stats, "sent_at": now_iso()}},
            )
            return stats

        # Chunk pour éviter d'envoyer un batch énorme
        for i in range(0, len(recipients), 100):
            batch = recipients[i:i + 100]
            try:
                await send_push(recipients=batch, data=data, idempotency_key=f"campaign-{campaign_id}-{i}")
                stats["sent"] += len(batch)
                # Log par utilisateur (bulk)
                bulk_docs = [
                    {"id": str(uuid.uuid4()), "campaign_id": campaign_id, "user_id": u, "event": "sent", "ts": now_iso()}
                    for u in batch
                ]
                if bulk_docs:
                    await db.push_events.insert_many(bulk_docs)
            except Exception as e:
                log.warning(f"Campaign {campaign_id} batch failed: {e}")
                stats["failed"] += len(batch)
                bulk_docs = [
                    {"id": str(uuid.uuid4()), "campaign_id": campaign_id, "user_id": u, "event": "failed", "ts": now_iso(), "error": str(e)[:200]}
                    for u in batch
                ]
                if bulk_docs:
                    await db.push_events.insert_many(bulk_docs)

        await db.push_campaigns.update_one(
            {"id": campaign_id},
            {"$set": {"status": "sent", "stats": stats, "sent_at": now_iso()}},
        )
        return stats

    # ─────────────── Endpoints ───────────────

    @router.get("/dashboard")
    async def dashboard(user=Depends(current_user)):
        require_admin(user)
        total_users = await db.users.count_documents({"blocked": {"$ne": True}})
        clients = await db.users.count_documents({"role": "client", "blocked": {"$ne": True}})
        prestataires = await db.users.count_documents({"role": "prestataire", "blocked": {"$ne": True}})
        devices = await db.push_devices.count_documents({"active": True})
        campaigns_total = await db.push_campaigns.count_documents({})
        campaigns_sent  = await db.push_campaigns.count_documents({"status": "sent"})
        campaigns_scheduled = await db.push_campaigns.count_documents({"status": "scheduled"})

        # Agrégats globaux
        agg = [
            {"$group": {
                "_id": None,
                "sent":      {"$sum": "$stats.sent"},
                "failed":    {"$sum": "$stats.failed"},
                "targeted":  {"$sum": "$stats.targeted"},
            }},
        ]
        totals = {"sent": 0, "failed": 0, "targeted": 0}
        async for row in db.push_campaigns.aggregate(agg):
            totals = {"sent": row.get("sent", 0), "failed": row.get("failed", 0), "targeted": row.get("targeted", 0)}

        # Taux (Phase 2 pour delivered/opened — nous simulons delivered = sent - failed)
        delivered_rate = round((totals["sent"] / totals["targeted"] * 100), 1) if totals["targeted"] else 0
        # 5 dernières campagnes
        recent = await db.push_campaigns.find(
            {}, {"_id": 0}
        ).sort("created_at", -1).limit(5).to_list(5)

        return {
            "counts": {
                "total_users": total_users,
                "clients": clients,
                "prestataires": prestataires,
                "devices": devices,
                "campaigns_total": campaigns_total,
                "campaigns_sent": campaigns_sent,
                "campaigns_scheduled": campaigns_scheduled,
            },
            "totals": totals,
            "rates": {
                "delivered_pct": delivered_rate,
                "opened_pct": 0,  # Phase 2
            },
            "recent_campaigns": recent,
        }

    @router.post("/preview")
    async def preview(body: PreviewIn, user=Depends(current_user)):
        require_admin(user)
        ids = await resolve_segment(db, body.segment.type, body.segment.params)
        return {"count": len(ids), "sample": ids[:20]}

    @router.get("/campaigns")
    async def list_campaigns(status: Optional[str] = None, user=Depends(current_user)):
        require_admin(user)
        q: dict = {}
        if status:
            q["status"] = status
        cur = db.push_campaigns.find(q, {"_id": 0}).sort("created_at", -1).limit(200)
        return await cur.to_list(200)

    @router.post("/campaigns", status_code=201)
    async def create_campaign(body: CampaignIn, user=Depends(current_user)):
        require_admin(user)
        cid = str(uuid.uuid4())
        recipients = await resolve_segment(db, body.segment.type, body.segment.params)
        status = "draft"
        if body.mode == "immediate":
            status = "sending"
        elif body.mode == "scheduled":
            if not body.scheduled_at:
                raise HTTPException(400, "scheduled_at requis pour le mode 'scheduled'")
            try:
                dt = datetime.fromisoformat(body.scheduled_at.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                if dt <= datetime.now(timezone.utc):
                    raise HTTPException(400, "La date programmée doit être future")
            except ValueError:
                raise HTTPException(400, "Format scheduled_at invalide (ISO-8601)")
            status = "scheduled"

        doc = {
            "id": cid,
            "title": body.title,
            "message": body.message,
            "image_url": body.image_url,
            "deep_link": body.deep_link,
            "cta_text": body.cta_text,
            "segment": body.segment.model_dump(),
            "mode": body.mode,
            "scheduled_at": body.scheduled_at,
            "status": status,
            "stats": {"targeted": len(recipients), "sent": 0, "failed": 0},
            "created_by": user["id"],
            "created_at": now_iso(),
            "sent_at": None,
        }
        await db.push_campaigns.insert_one(doc)

        if body.mode == "immediate":
            # Envoi tout de suite (background sans bloquer la réponse)
            asyncio.create_task(_send_campaign(doc))

        return {k: v for k, v in doc.items() if k != "_id"}

    @router.get("/campaigns/{cid}")
    async def get_campaign(cid: str, user=Depends(current_user)):
        require_admin(user)
        c = await db.push_campaigns.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Campagne introuvable")
        c["live_stats"] = await _campaign_stats(cid)
        return c

    @router.patch("/campaigns/{cid}")
    async def patch_campaign(cid: str, body: CampaignPatch, user=Depends(current_user)):
        require_admin(user)
        c = await db.push_campaigns.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Campagne introuvable")
        if c["status"] in ("sent", "sending"):
            raise HTTPException(400, "Impossible de modifier une campagne envoyée")
        updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        if updates:
            await db.push_campaigns.update_one({"id": cid}, {"$set": updates})
        return {**c, **updates}

    @router.delete("/campaigns/{cid}")
    async def delete_campaign(cid: str, user=Depends(current_user)):
        require_admin(user)
        r = await db.push_campaigns.delete_one({"id": cid, "status": {"$ne": "sending"}})
        return {"deleted": r.deleted_count}

    @router.post("/campaigns/{cid}/send")
    async def force_send(cid: str, user=Depends(current_user)):
        require_admin(user)
        c = await db.push_campaigns.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Campagne introuvable")
        if c["status"] == "sent":
            raise HTTPException(400, "Déjà envoyée")
        await db.push_campaigns.update_one({"id": cid}, {"$set": {"status": "sending"}})
        stats = await _send_campaign(c)
        return {"ok": True, "stats": stats}

    # ─── Templates ───
    @router.get("/templates")
    async def list_templates(user=Depends(current_user)):
        require_admin(user)
        await _ensure_default_templates()
        cur = db.push_templates.find({}, {"_id": 0}).sort([("is_default", -1), ("category", 1), ("key", 1)])
        return await cur.to_list(200)

    @router.post("/templates", status_code=201)
    async def create_template(body: TemplateIn, user=Depends(current_user)):
        require_admin(user)
        tid = str(uuid.uuid4())
        doc = {
            "id": tid,
            **body.model_dump(),
            "is_default": False,
            "created_at": now_iso(),
        }
        try:
            await db.push_templates.insert_one(doc)
        except Exception as e:
            raise HTTPException(400, f"Slug déjà utilisé: {e}")
        return {k: v for k, v in doc.items() if k != "_id"}

    @router.put("/templates/{tid}")
    async def update_template(tid: str, body: TemplateIn, user=Depends(current_user)):
        require_admin(user)
        r = await db.push_templates.update_one({"id": tid}, {"$set": body.model_dump()})
        if r.matched_count == 0:
            raise HTTPException(404, "Modèle introuvable")
        return {"ok": True}

    @router.delete("/templates/{tid}")
    async def delete_template(tid: str, user=Depends(current_user)):
        require_admin(user)
        # Empêche la suppression des modèles par défaut
        t = await db.push_templates.find_one({"id": tid}, {"is_default": 1})
        if t and t.get("is_default"):
            raise HTTPException(400, "Les modèles par défaut ne peuvent pas être supprimés")
        r = await db.push_templates.delete_one({"id": tid})
        return {"deleted": r.deleted_count}

    return router


# ------------------------------------------------------------------
# Background scheduler — traite les campagnes scheduled dont l'heure est arrivée
# ------------------------------------------------------------------
async def push_scheduler_loop(*, db, send_push, log, poll_seconds: int = 60):
    """Tâche asyncio à démarrer au startup. Vérifie toutes les 60s si des campagnes
    scheduled sont dues et les envoie."""
    log.info("Push scheduler loop started (poll every %ss)", poll_seconds)
    while True:
        try:
            now = datetime.now(timezone.utc).isoformat()
            cur = db.push_campaigns.find(
                {"status": "scheduled", "scheduled_at": {"$lte": now}},
                {"_id": 0},
            )
            campaigns = await cur.to_list(50)
            for c in campaigns:
                # Marquer sending, envoyer, marquer sent
                await db.push_campaigns.update_one({"id": c["id"]}, {"$set": {"status": "sending"}})
                try:
                    recipients = await resolve_segment(db, c["segment"]["type"], c["segment"].get("params"))
                    data = {"title": c["title"], "message": c["message"]}
                    if c.get("image_url"): data["image_url"] = c["image_url"]
                    if c.get("deep_link"): data["action_url"] = c["deep_link"]
                    if c.get("cta_text"):  data["cta_text"] = c["cta_text"]
                    stats = {"targeted": len(recipients), "sent": 0, "failed": 0}
                    for i in range(0, len(recipients), 100):
                        batch = recipients[i:i + 100]
                        try:
                            await send_push(recipients=batch, data=data, idempotency_key=f"campaign-{c['id']}-{i}")
                            stats["sent"] += len(batch)
                            evs = [{"id": str(uuid.uuid4()), "campaign_id": c["id"], "user_id": u,
                                    "event": "sent", "ts": datetime.now(timezone.utc).isoformat()} for u in batch]
                            if evs:
                                await db.push_events.insert_many(evs)
                        except Exception as e:
                            stats["failed"] += len(batch)
                            log.warning("Scheduled campaign %s batch %s failed: %s", c["id"], i, e)
                    await db.push_campaigns.update_one(
                        {"id": c["id"]},
                        {"$set": {"status": "sent", "stats": stats, "sent_at": datetime.now(timezone.utc).isoformat()}},
                    )
                except Exception as e:
                    log.warning("Scheduled campaign %s failed: %s", c["id"], e)
                    await db.push_campaigns.update_one(
                        {"id": c["id"]},
                        {"$set": {"status": "failed"}},
                    )
        except Exception as e:
            log.warning("Push scheduler iteration failed: %s", e)
        await asyncio.sleep(poll_seconds)
