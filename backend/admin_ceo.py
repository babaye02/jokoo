"""
admin_ceo — Cockpit CEO : santé de l'entreprise en 30 secondes
==============================================================

Monté par server.py sous `/api` (même patron que admin_mobility / chat_voice).

GET /api/admin/ceo/dashboard  (perm stats:read)

Agrège en un seul appel tous les indicateurs vitaux :
- Finance   : GMV, revenu (commissions + Jokoo Pro), take rate, float & dette wallet
- Croissance: nouveaux utilisateurs (24h/7j/30j + delta), inscriptions par jour, parrainage
- Opérations: réservations, taux de complétion, files d'attente admin (KYC, signalements…)
- Qualité   : note moyenne 30 j, taux d'annulation, flags anti-contournement
- Mobilité  : demandes ouvertes, taux de matching, trajets actifs

Chaque domaine reçoit un statut ok / warn / crit selon des seuils simples et
déterministes, et un statut global en découle : c'est le « feu tricolore » que
le CEO regarde en premier.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from fastapi import APIRouter, Depends

log = logging.getLogger("admin_ceo")


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def build_admin_ceo_router(db: Any, require_perm: Callable) -> APIRouter:
    router = APIRouter(tags=["admin-ceo"])
    dash_dep = require_perm("stats:read")

    @router.get("/admin/ceo/dashboard")
    async def ceo_dashboard(user=Depends(dash_dep)):
        now = datetime.now(timezone.utc)
        d1 = _iso(now - timedelta(hours=24))
        d7 = _iso(now - timedelta(days=7))
        d14 = _iso(now - timedelta(days=14))
        d30 = _iso(now - timedelta(days=30))

        # ── FINANCE ────────────────────────────────────────────────
        async def _sum(coll, match, field):
            rows = await db[coll].aggregate([
                {"$match": match},
                {"$group": {"_id": None, "s": {"$sum": f"${field}"}, "n": {"$sum": 1}}},
            ]).to_list(1)
            return (int(rows[0]["s"]), rows[0]["n"]) if rows else (0, 0)

        # GMV 30 j : missions terminées + covoiturage confirmé + colis livrés
        gmv_services, n_completed = await _sum(
            "bookings",
            {"status": "completed", "created_at": {"$gte": d30}},
            "quote_amount",
        )
        gmv_rides, _ = await _sum(
            "ride_bookings",
            {"status": "confirmed", "created_at": {"$gte": d30}},
            "price_xof",
        )
        gmv_parcels, _ = await _sum(
            "parcels",
            {"status": "delivered", "created_at": {"$gte": d30}},
            "price_xof",
        )
        gmv_30d = gmv_services + gmv_rides + gmv_parcels

        # Revenu 30 j : commissions cash + abonnements Jokoo Pro (wallet v2)
        rev_commissions, _ = await _sum(
            "wallet_transactions_v2",
            {"type": "cash_commission", "status": "completed", "created_at": {"$gte": d30}},
            "amount",
        )
        rev_pro, _ = await _sum(
            "wallet_transactions_v2",
            {"type": "jokoo_pro_charge", "status": "completed", "created_at": {"$gte": d30}},
            "amount",
        )
        revenue_30d = rev_commissions + rev_pro
        take_rate = (revenue_30d / gmv_30d) if gmv_30d else 0.0

        # Float (soldes positifs) & dette (soldes négatifs) du wallet
        wallet_rows = await db.wallets_v2.aggregate([
            {"$group": {
                "_id": None,
                "float": {"$sum": {"$cond": [{"$gt": ["$balance_available", 0]}, "$balance_available", 0]}},
                "debt": {"$sum": {"$cond": [{"$lt": ["$balance_available", 0]}, "$balance_available", 0]}},
                "n_debtors": {"$sum": {"$cond": [{"$lt": ["$balance_available", 0]}, 1, 0]}},
            }},
        ]).to_list(1)
        wallet_float = int(wallet_rows[0]["float"]) if wallet_rows else 0
        wallet_debt = -int(wallet_rows[0]["debt"]) if wallet_rows else 0
        wallet_debtors = wallet_rows[0]["n_debtors"] if wallet_rows else 0

        recharges_30d, recharges_n = await _sum(
            "wallet_transactions_v2",
            {"type": "recharge", "status": "completed", "created_at": {"$gte": d30}},
            "amount",
        )
        pro_active = await db.subscriptions.count_documents({"kind": "jokoo_pro", "status": "active"})

        # ── CROISSANCE ─────────────────────────────────────────────
        users_total = await db.users.count_documents({})
        new_24h = await db.users.count_documents({"created_at": {"$gte": d1}})
        new_7d = await db.users.count_documents({"created_at": {"$gte": d7}})
        new_prev_7d = await db.users.count_documents({"created_at": {"$gte": d14, "$lt": d7}})
        new_30d = await db.users.count_documents({"created_at": {"$gte": d30}})

        # Inscriptions par jour (7 derniers jours) — pour la sparkline
        signups_daily = []
        for i in range(6, -1, -1):
            start = now - timedelta(days=i + 1)
            end = now - timedelta(days=i)
            c = await db.users.count_documents({"created_at": {"$gte": _iso(start), "$lt": _iso(end)}})
            signups_daily.append({"day": end.strftime("%d/%m"), "count": c})

        ambassadors_active = await db.ambassadors.count_documents({"active": True})
        referrals_total = await db.ambassador_referrals.count_documents({})

        # ── OPÉRATIONS ─────────────────────────────────────────────
        bookings_7d = await db.bookings.count_documents({"created_at": {"$gte": d7}})
        bookings_30d = await db.bookings.count_documents({"created_at": {"$gte": d30}})
        bookings_pending = await db.bookings.count_documents({"status": "pending"})
        terminal_30d = await db.bookings.count_documents({
            "created_at": {"$gte": d30},
            "status": {"$in": ["completed", "cancelled", "rejected"]},
        })
        completed_30d = await db.bookings.count_documents({
            "created_at": {"$gte": d30}, "status": "completed",
        })
        completion_rate = (completed_30d / terminal_30d) if terminal_30d else 0.0

        providers_total = await db.providers.count_documents({})
        active_provider_ids = await db.bookings.distinct("provider_id", {"created_at": {"$gte": d30}})

        # Files d'attente admin : tout ce qui attend une action humaine
        queues = {
            "kyc_pending": await db.kyc_requests.count_documents({"status": "pending"}),
            "reports_open": await db.reports.count_documents({"status": {"$in": ["open", "pending"]}}),
            "refunds_pending": await db.refund_requests.count_documents({"status": "pending"}),
            "withdrawals_pending": await db.withdrawal_requests.count_documents({"status": "pending"}),
            "service_suggestions": await db.service_suggestions.count_documents({"status": "pending"}),
        }
        queues_total = sum(queues.values())

        # ── QUALITÉ ────────────────────────────────────────────────
        rating_rows = await db.reviews.aggregate([
            {"$match": {"created_at": {"$gte": d30}}},
            {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "n": {"$sum": 1}}},
        ]).to_list(1)
        avg_rating_30d = round(rating_rows[0]["avg"], 2) if rating_rows else None
        reviews_30d = rating_rows[0]["n"] if rating_rows else 0
        cancelled_30d = await db.bookings.count_documents({
            "created_at": {"$gte": d30}, "status": "cancelled",
        })
        cancel_rate = (cancelled_30d / bookings_30d) if bookings_30d else 0.0
        contact_flags_7d = await db.contact_flags.count_documents({"created_at": {"$gte": d7}})

        # ── MOBILITÉ ───────────────────────────────────────────────
        req_open = await db.ride_requests.count_documents({"status": {"$in": ["open", "matched"]}})
        req_7d = await db.ride_requests.count_documents({"created_at": {"$gte": d7}})
        req_7d_matched = await db.ride_requests.count_documents({
            "created_at": {"$gte": d7}, "offers_count": {"$gte": 1},
        })
        match_rate = (req_7d_matched / req_7d) if req_7d else 0.0
        rides_active = await db.rides.count_documents({"status": "active"})
        ghost_active = await db.rides.count_documents({"status": "active", "is_ghost": True})

        # ── SANTÉ : feu tricolore par domaine ──────────────────────
        def _status(crit: bool, warn: bool) -> str:
            return "crit" if crit else ("warn" if warn else "ok")

        health = {
            "finance": {
                "status": _status(
                    crit=wallet_float > 0 and wallet_debt > wallet_float,
                    warn=(gmv_30d > 0 and take_rate < 0.05) or (wallet_debt > 0.2 * max(wallet_float, 1)),
                ),
                "reason": f"take rate {round(take_rate * 100, 1)} % · dette {wallet_debt:,} F".replace(",", " "),
            },
            "growth": {
                "status": _status(
                    crit=new_7d == 0 and users_total > 20,
                    warn=new_7d < new_prev_7d,
                ),
                "reason": f"{new_7d} inscrits/7 j (précédent : {new_prev_7d})",
            },
            "operations": {
                "status": _status(
                    crit=terminal_30d >= 10 and completion_rate < 0.4,
                    warn=(terminal_30d >= 10 and completion_rate < 0.6) or queues_total > 25,
                ),
                "reason": f"complétion {round(completion_rate * 100)} % · {queues_total} en file d'attente",
            },
            "quality": {
                "status": _status(
                    crit=avg_rating_30d is not None and avg_rating_30d < 3.5,
                    warn=(avg_rating_30d is not None and avg_rating_30d < 4.0) or cancel_rate > 0.25,
                ),
                "reason": f"note {avg_rating_30d if avg_rating_30d is not None else '—'} · annulation {round(cancel_rate * 100)} %",
            },
            "mobility": {
                "status": _status(
                    crit=False,
                    warn=req_7d >= 5 and match_rate < 0.3,
                ),
                "reason": f"matching {round(match_rate * 100)} % · {req_open} demandes ouvertes",
            },
        }
        order = {"ok": 0, "warn": 1, "crit": 2}
        overall = max((h["status"] for h in health.values()), key=lambda s: order[s])

        return {
            "generated_at": _iso(now),
            "health": {"overall": overall, "domains": health},
            "finance": {
                "gmv_30d_xof": gmv_30d,
                "gmv_breakdown": {"services": gmv_services, "rides": gmv_rides, "parcels": gmv_parcels},
                "revenue_30d_xof": revenue_30d,
                "revenue_breakdown": {"commissions": rev_commissions, "jokoo_pro": rev_pro},
                "take_rate": round(take_rate, 4),
                "wallet_float_xof": wallet_float,
                "wallet_debt_xof": wallet_debt,
                "wallet_debtors": wallet_debtors,
                "recharges_30d_xof": recharges_30d,
                "recharges_30d_count": recharges_n,
                "jokoo_pro_active": pro_active,
            },
            "growth": {
                "users_total": users_total,
                "new_24h": new_24h,
                "new_7d": new_7d,
                "new_prev_7d": new_prev_7d,
                "new_30d": new_30d,
                "signups_daily": signups_daily,
                "ambassadors_active": ambassadors_active,
                "referrals_total": referrals_total,
            },
            "operations": {
                "bookings_7d": bookings_7d,
                "bookings_30d": bookings_30d,
                "bookings_pending": bookings_pending,
                "completion_rate_30d": round(completion_rate, 3),
                "providers_total": providers_total,
                "providers_active_30d": len(active_provider_ids),
                "queues": queues,
                "queues_total": queues_total,
            },
            "quality": {
                "avg_rating_30d": avg_rating_30d,
                "reviews_30d": reviews_30d,
                "cancel_rate_30d": round(cancel_rate, 3),
                "contact_flags_7d": contact_flags_7d,
            },
            "mobility": {
                "requests_open": req_open,
                "match_rate_7d": round(match_rate, 3),
                "rides_active": rides_active,
                "ghost_rides_active": ghost_active,
            },
        }

    return router
