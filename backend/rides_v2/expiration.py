"""
rides_v2.expiration — Auto-expiration des demandes passager
============================================================

Deux stratégies combinées :
1. Cron (invoquée par server.py au startup, boucle 5 min) — passe les demandes
   dont `expires_at < now` en `expired`, et envoie un rappel J-6h si non fait.
2. Lazy — à chaque `GET /ride_requests` on filtre les expirées.
"""

from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from . import notify
from .constants import (
    EXPIRATION_REMINDER_HOURS,
    REQUEST_STATUS_EXPIRED,
    REQUEST_STATUS_MATCHED,
    REQUEST_STATUS_OPEN,
)

log = logging.getLogger("rides_v2.expiration")


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def sweep_expired(db: Any) -> dict:
    """
    Passe les demandes expirées en `expired` et envoie les rappels J-6h.
    Retourne un dict {expired, reminded} pour observabilité.
    """
    now = _now()
    now_iso = now.isoformat()
    remind_before_iso = (now + timedelta(hours=EXPIRATION_REMINDER_HOURS)).isoformat()

    # 1) Reminders pour les demandes qui expirent dans <= EXPIRATION_REMINDER_HOURS
    to_remind = await db.ride_requests.find({
        "status": {"$in": [REQUEST_STATUS_OPEN, REQUEST_STATUS_MATCHED]},
        "expiration_reminded": {"$ne": True},
        "expires_at": {"$lte": remind_before_iso, "$gt": now_iso},
    }, {"_id": 0}).to_list(100)
    reminded = 0
    for req in to_remind:
        try:
            await notify.notify_request_expiring(db, req)
            await db.ride_requests.update_one({"id": req["id"]}, {"$set": {"expiration_reminded": True}})
            reminded += 1
        except Exception as e:
            log.warning("reminder failed for %s: %s", req.get("id"), e)

    # 2) Expiration effective
    to_expire = await db.ride_requests.find({
        "status": {"$in": [REQUEST_STATUS_OPEN, REQUEST_STATUS_MATCHED]},
        "expires_at": {"$lt": now_iso},
    }, {"_id": 0}).to_list(200)
    expired = 0
    for req in to_expire:
        try:
            await db.ride_requests.update_one({"id": req["id"]}, {"$set": {"status": REQUEST_STATUS_EXPIRED, "updated_at": now_iso}})
            await notify.notify_request_expired(db, req)
            expired += 1
        except Exception as e:
            log.warning("expire failed for %s: %s", req.get("id"), e)

    return {"expired": expired, "reminded": reminded}


async def start_expiration_loop(db: Any, interval_seconds: int = 300) -> None:
    """
    Démarre une tâche asyncio infinie qui balaie les expirations toutes les 5 min.
    """
    log.info("[rides_v2] expiration sweeper started (interval=%ss)", interval_seconds)
    while True:
        try:
            stats = await sweep_expired(db)
            if stats["expired"] or stats["reminded"]:
                log.info("[rides_v2] sweep %s", stats)
        except Exception as e:
            log.warning("sweep loop error: %s", e)
        await asyncio.sleep(interval_seconds)
