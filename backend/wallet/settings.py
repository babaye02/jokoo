"""Platform settings — admin-configurable runtime values.

Cached in-process for hot reads (commissions, min/max amounts) with a short
TTL so admin edits propagate quickly without a redeploy.
"""

from __future__ import annotations

import time
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from .constants import DEFAULT_SETTINGS, SettingKey

_CACHE: dict[str, tuple[float, Any]] = {}
_TTL_SECONDS = 30  # short TTL — settings rarely change


def _now() -> float:
    return time.monotonic()


async def get(db: AsyncIOMotorDatabase, key: str, default: Any = None) -> Any:
    """Return the current value for a setting key, or fallback.

    Order of precedence:
      1. In-process cache (fresh)
      2. DB `platform_settings` collection
      3. Hard-coded default in `constants.DEFAULT_SETTINGS`
      4. Caller-supplied `default`
    """
    key = str(key)
    hit = _CACHE.get(key)
    if hit and (_now() - hit[0]) < _TTL_SECONDS:
        return hit[1]

    doc = await db.platform_settings.find_one({"_id": key})
    if doc and "value" in doc:
        val = doc["value"]
    elif key in DEFAULT_SETTINGS:
        val = DEFAULT_SETTINGS[key]
    else:
        val = default

    _CACHE[key] = (_now(), val)
    return val


async def get_int(db: AsyncIOMotorDatabase, key: str, default: int = 0) -> int:
    v = await get(db, key, default)
    try:
        return int(v)
    except (TypeError, ValueError):
        return int(default)


async def get_float(db: AsyncIOMotorDatabase, key: str, default: float = 0.0) -> float:
    v = await get(db, key, default)
    try:
        return float(v)
    except (TypeError, ValueError):
        return float(default)


async def get_bool(db: AsyncIOMotorDatabase, key: str, default: bool = False) -> bool:
    v = await get(db, key, default)
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    if isinstance(v, str):
        return v.strip().lower() in {"1", "true", "yes", "oui", "on"}
    return bool(default)


async def set_value(db: AsyncIOMotorDatabase, key: str, value: Any, updated_by: str) -> dict:
    """Upsert a setting; invalidate cache."""
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "_id": key,
        "key": key,
        "value": value,
        "updated_at": now_iso,
        "updated_by": updated_by,
    }
    await db.platform_settings.update_one({"_id": key}, {"$set": doc}, upsert=True)
    _CACHE.pop(key, None)
    return doc


def invalidate(key: str | None = None) -> None:
    if key is None:
        _CACHE.clear()
    else:
        _CACHE.pop(key, None)


async def snapshot_all(db: AsyncIOMotorDatabase) -> dict[str, Any]:
    """Return a merged view of DB overrides + defaults — for admin dashboard."""
    docs = await db.platform_settings.find({}, {"_id": 0}).to_list(500)
    by_key = {d["key"]: d for d in docs if "key" in d}
    out: dict[str, Any] = {}
    for key_enum in SettingKey:
        k = key_enum.value
        db_doc = by_key.get(k)
        out[k] = {
            "key": k,
            "value": db_doc["value"] if db_doc and "value" in db_doc else DEFAULT_SETTINGS.get(k),
            "default": DEFAULT_SETTINGS.get(k),
            "is_default": (db_doc is None) or (db_doc.get("value") == DEFAULT_SETTINGS.get(k)),
            "updated_at": (db_doc or {}).get("updated_at"),
            "updated_by": (db_doc or {}).get("updated_by"),
        }
    return out
