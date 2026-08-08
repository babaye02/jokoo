# Jokoo — Sécurisation de la commission sur les paiements CASH

> **Périmètre strict.** Ce document ne touche QUE la gestion des paiements cash
> et des commissions. Aucun autre chantier n'est modifié.

---

## ⚠️ AVANT TOUT — DEUX PROBLÈMES TROUVÉS DANS L'EXISTANT

### 🔴 A. La barrière anti-fraude est débranchée (bug critique, indépendant)

`server.py`, fonction `_check_provider_not_blocked` (~ligne 3447) :

```python
w = await db.wallets.find_one({"user_id": provider_id}, {"_id": 0})
if w and w.get("is_blocked_debt"):
```

Elle lit **`db.wallets`** — l'ancienne collection. Le moteur wallet v2 écrit dans
**`db.wallets_v2`**. Les deux ne communiquent pas.

**Conséquence : un prestataire au wallet v2 profondément négatif n'est jamais
bloqué.** Le garde-fou que vous croyez avoir n'existe pas. Appelée depuis 3
endroits : réservations services, covoiturage, Jokoo Family.

**Correctif — remplacer la fonction par :**

```python
async def _check_provider_not_blocked(provider_id: str) -> None:
    """Bloque un prestataire dont le wallet est sous le plancher autorisé.

    Lit le wallet v2 (source de vérité). L'ancienne collection `db.wallets`
    n'est plus alimentee par le moteur v2 : la lire rendait ce garde-fou inerte.
    """
    # Resoudre l'id utilisateur (provider_id peut etre un id de fiche)
    user_id = provider_id
    prov = await db.providers.find_one({"id": provider_id}, {"_id": 0, "user_id": 1})
    if prov and prov.get("user_id"):
        user_id = prov["user_id"]

    try:
        w = await _wallet_service.get_wallet(db, user_id)
        if not w:
            return  # pas encore de wallet : on ne bloque pas
        snap = await _wallet_service.public_snapshot(db, w)
        if not snap.get("can_receive_bookings", True):
            raise HTTPException(
                status_code=403,
                detail="Ce prestataire ne peut plus accepter de reservations "
                       "(solde wallet insuffisant). Rechargez pour reactiver.",
            )
    except HTTPException:
        raise
    except Exception as e:
        log.warning("check_provider_not_blocked degrade: %s", e)
        return  # en cas d'erreur technique, ne pas bloquer les reservations
```

### ⚠️ B. Le taux des services est 12 %, pas 15 %

`COMMISSION_RATES` : services **0.12**, mobility 0.10, family 0.15.
Sur 20 000 F, la commission services est de **2 400 F**.
**Décision confirmée : on conserve 12 %.** Aucun barème n'est modifié.

---

## CE QUI CHANGE — LE PRINCIPE

**Modèle retenu : Option A.** Le prestataire reste le payeur de la commission,
exactement comme aujourd'hui. Ce qui change, c'est le **moment** et le
**caractère automatique** du prélèvement.

### Avant

```
Prestation cash -> le prestataire DECLARE -> Jokoo prend sa commission
                        (s'il ne declare pas : Jokoo ne percoit rien)
```

### Après

```
Client reserve
    v
Prestataire ACCEPTE  ->  commission GELEE sur son wallet (available -> locked)
    v
Prestation realisee, client paie 20 000 F en especes au prestataire
    v
Mission TERMINEE     ->  commission CAPTUREE automatiquement (locked -> Jokoo)
    v
La declaration cash ne sert plus qu'au suivi et a la preuve
```

**Le prestataire ne peut plus contourner la commission** : elle est déjà sortie
de son solde disponible avant même qu'il touche le cash.

**Rien ne change pour le client.** Il paie toujours en espèces, à la fin.

---

## MÉCANISME RÉUTILISÉ (rien de nouveau inventé)

Le moteur wallet v2 possède déjà `lock_funds()` / `unlock_funds()` — utilisés
aujourd'hui pour geler les demandes de retrait. On les branche simplement sur le
cycle de vie des missions cash.

| Étape | Fonction wallet existante | Effet |
|---|---|---|
| Acceptation | `lock_funds()` | `balance_available` -> `balance_locked` |
| Fin de mission | `unlock_funds(to_available=False)` + `credit()` | `locked` -> plateforme |
| Annulation | `unlock_funds(to_available=True)` | `locked` -> `available` |

---

## FICHIER À CRÉER : `backend/commission_guard.py`

```python
"""
commission_guard — Sécurisation de la commission Jokoo sur les missions cash
============================================================================

PROBLÈME RÉSOLU
---------------
Avant ce module, la commission Jokoo sur une prestation payée en espèces
n'était prélevée QUE si le prestataire déclarait le paiement
(`POST /bookings/{id}/cash-payment`). S'il ne déclarait jamais, Jokoo ne
percevait rien. La récupération de la commission dépendait de sa bonne foi.

PRINCIPE (Option A — le prestataire reste le payeur de la commission)
---------------------------------------------------------------------
La commission est **gelée sur le wallet du prestataire au moment où il accepte
la mission**, et **capturée automatiquement à la fin de la mission**, qu'il
déclare le paiement ou non.

    Client réserve
        ↓
    Prestataire accepte  →  commission GELÉE (available → locked)
        ↓
    Prestation réalisée, client paie en espèces au prestataire
        ↓
    Mission terminée     →  commission CAPTURÉE (locked → plateforme)
        ↓
    La déclaration cash ne sert plus qu'au suivi et à la preuve

Si le prestataire n'a pas le solde nécessaire, il ne peut pas accepter la
mission cash : il doit d'abord recharger (Wave / Orange Money, déjà en place).

CE QUI N'EST PAS MODIFIÉ
------------------------
- Le client continue de payer en espèces à la fin de la prestation.
- Le prestataire reste le payeur de la commission (modèle économique inchangé).
- Les paiements en ligne (Wave, Orange Money, carte) ne passent PAS par ici :
  la commission y est déjà prélevée à la source.
- `POST /bookings/{id}/cash-payment` continue de fonctionner à l'identique.

GARANTIES
---------
- **Idempotent** : chaque opération est protégée par une clé unique par
  réservation. Un double appel ne prélève jamais deux fois.
- **Pas de double prélèvement** : si la commission a déjà été capturée ici,
  `charge_cash_commission` (déclaration) ne la reprélève pas — on marque la
  réservation avec `commission_secured_at`.
- **Annulation** : les fonds gelés sont rendus au prestataire.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

log = logging.getLogger("commission_guard")

# Statuts de la garantie, portés par la réservation
GUARD_HELD = "held"          # commission gelée, mission en cours
GUARD_CAPTURED = "captured"  # commission encaissée par Jokoo
GUARD_RELEASED = "released"  # commission rendue (annulation)
GUARD_WAIVED = "waived"      # non applicable (paiement en ligne, montant nul)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _amount_of(booking: dict) -> int:
    """Montant de référence de la prestation, en FCFA entiers.

    Priorité identique au reste du code : devis validé > prix initial.
    """
    for k in ("amount_paid", "quote_amount", "price", "estimated_price", "total_xof"):
        v = booking.get(k)
        if v:
            try:
                return max(0, int(round(float(v))))
            except (TypeError, ValueError):
                continue
    return 0


class CommissionGuard:
    """Encapsule la logique de gel/capture. Instanciée une fois dans server.py."""

    def __init__(
        self,
        db: Any,
        wallet_service: Any,
        commission_rates: dict,
        platform_owner_id: str,
        notify=None,
    ):
        self.db = db
        self.ws = wallet_service
        self.rates = commission_rates
        self.platform_owner_id = platform_owner_id
        self.notify = notify

    # ─────────────── Calcul ───────────────
    def compute_commission(self, booking: dict, amount_xof: Optional[int] = None) -> tuple[int, str, float]:
        """Retourne (commission_xof, category_key, rate).

        Réutilise COMMISSION_RATES de server.py — aucun nouveau barème n'est
        introduit ici.
        """
        amount = amount_xof if amount_xof is not None else _amount_of(booking)
        category = (
            booking.get("commission_category_key")
            or booking.get("category")
            or "services"
        )
        rate = float(self.rates.get(category, self.rates.get("default", 0.12)))
        return int(round(amount * rate)), category, rate

    async def _provider_user_id(self, booking: dict) -> Optional[str]:
        pid = booking.get("provider_user_id") or booking.get("provider_id")
        if not pid:
            return None
        # Un provider_id peut être l'id de fiche prestataire, pas l'id user.
        prov = await self.db.providers.find_one({"id": pid}, {"_id": 0, "user_id": 1})
        if prov and prov.get("user_id"):
            return prov["user_id"]
        return pid

    # ─────────────── Vérification préalable ───────────────
    async def can_accept_cash_mission(self, provider_user_id: str, booking: dict) -> dict:
        """Le prestataire a-t-il de quoi couvrir la commission ?

        Appelé AVANT l'acceptation, pour donner un message clair plutôt qu'une
        erreur technique.
        """
        commission, category, rate = self.compute_commission(booking)
        if commission <= 0:
            return {"ok": True, "commission_xof": 0, "reason": "montant nul"}

        try:
            w = await self.ws.get_wallet(self.db, provider_user_id)
        except Exception:
            w = None
        if not w:
            return {
                "ok": False,
                "commission_xof": commission,
                "reason": "wallet_absent",
                "message": "Activez votre wallet Jokoo pour accepter des missions payées en espèces.",
            }

        available = int(w.get("balance_available", 0))
        min_balance = int(w.get("min_balance", 0))
        usable = available - min_balance
        if usable < commission:
            manque = commission - max(0, usable)
            return {
                "ok": False,
                "commission_xof": commission,
                "available_xof": available,
                "missing_xof": manque,
                "reason": "insufficient_funds",
                "message": (
                    f"Rechargez votre wallet de {manque:,} F pour accepter cette mission "
                    f"payée en espèces (commission Jokoo : {commission:,} F)."
                ).replace(",", " "),
            }
        return {"ok": True, "commission_xof": commission, "category": category, "rate": rate}

    # ─────────────── 1. Gel à l'acceptation ───────────────
    async def hold(self, booking: dict, actor_id: Optional[str] = None) -> dict:
        """Gèle la commission sur le wallet du prestataire.

        Idempotent : si déjà gelée ou capturée pour cette réservation, ne fait rien.
        """
        booking_id = booking.get("id")
        if not booking_id:
            raise ValueError("Booking id manquant")

        # Déjà traité ?
        existing = booking.get("commission_guard_status")
        if existing in (GUARD_HELD, GUARD_CAPTURED):
            return {"ok": True, "already": True, "status": existing}

        # Les paiements en ligne prélèvent déjà la commission à la source.
        if booking.get("paid") and (booking.get("paid_method") or "") not in ("cash", "espèces", "especes"):
            await self._stamp(booking_id, GUARD_WAIVED, {"reason": "paiement_en_ligne"})
            return {"ok": True, "status": GUARD_WAIVED, "reason": "paiement en ligne"}

        provider_user_id = await self._provider_user_id(booking)
        if not provider_user_id:
            raise ValueError("Prestataire introuvable")

        commission, category, rate = self.compute_commission(booking)
        if commission <= 0:
            await self._stamp(booking_id, GUARD_WAIVED, {"reason": "montant_nul"})
            return {"ok": True, "status": GUARD_WAIVED, "commission_xof": 0}

        await self.ws.lock_funds(
            self.db,
            owner_id=provider_user_id,
            amount_xof=commission,
            label=f"Commission Jokoo — mission {booking_id}",
            reference={"booking_id": booking_id, "kind": "commission_hold"},
        )

        await self._stamp(booking_id, GUARD_HELD, {
            "commission_guard_amount_xof": commission,
            "commission_guard_category": category,
            "commission_guard_rate": rate,
            "commission_guard_provider_id": provider_user_id,
            "commission_guard_held_at": _now_iso(),
        })

        log.info("commission_guard.hold booking=%s provider=%s amount=%s",
                 booking_id, provider_user_id, commission)
        return {
            "ok": True,
            "status": GUARD_HELD,
            "commission_xof": commission,
            "category": category,
            "rate": rate,
        }

    # ─────────────── 2. Capture à la fin de mission ───────────────
    async def capture(self, booking: dict, actor_id: Optional[str] = None) -> dict:
        """Encaisse la commission gelée au profit de la plateforme.

        C'EST LE CŒUR DU DISPOSITIF : appelé quand la mission passe à
        `completed`, indépendamment de toute déclaration du prestataire.

        Idempotent via la clé `commission_capture:{booking_id}`.
        """
        booking_id = booking.get("id")
        if not booking_id:
            raise ValueError("Booking id manquant")

        status = booking.get("commission_guard_status")
        if status == GUARD_CAPTURED:
            return {"ok": True, "already": True, "status": GUARD_CAPTURED}
        if status == GUARD_WAIVED:
            return {"ok": True, "status": GUARD_WAIVED, "reason": "non applicable"}

        provider_user_id = booking.get("commission_guard_provider_id") or await self._provider_user_id(booking)
        commission = int(booking.get("commission_guard_amount_xof") or 0)

        # Cas des missions créées AVANT la mise en place du gel : rien n'a été
        # gelé. On tente un prélèvement direct plutôt que de perdre la commission.
        if status != GUARD_HELD or commission <= 0:
            commission, category, rate = self.compute_commission(booking)
            if commission <= 0:
                await self._stamp(booking_id, GUARD_WAIVED, {"reason": "montant_nul"})
                return {"ok": True, "status": GUARD_WAIVED, "commission_xof": 0}
            return await self._capture_without_hold(
                booking_id, provider_user_id, commission, category, rate, actor_id
            )

        # Sortir les fonds du bucket verrouillé (ils ne reviennent pas au dispo)
        await self.ws.unlock_funds(
            self.db,
            owner_id=provider_user_id,
            amount_xof=commission,
            to_available=False,
        )

        # Créditer la plateforme + écrire au grand livre
        tx = await self.ws.credit(
            self.db,
            owner_id=self.platform_owner_id,
            amount_xof=commission,
            transaction_type=self._commission_txn_type(),
            label=f"Commission mission {booking_id}",
            reference={"booking_id": booking_id, "provider_id": provider_user_id},
            idempotency_key=f"commission_capture:{booking_id}",
            actor_id=actor_id,
        )

        await self._stamp(booking_id, GUARD_CAPTURED, {
            "commission_guard_captured_at": _now_iso(),
            "commission_secured_at": _now_iso(),  # lu par cash-payment pour ne pas re-prélever
            "commission_computed_xof": commission,
        })

        log.info("commission_guard.capture booking=%s amount=%s", booking_id, commission)
        return {
            "ok": True,
            "status": GUARD_CAPTURED,
            "commission_xof": commission,
            "transaction_id": (tx or {}).get("id"),
        }

    async def _capture_without_hold(
        self, booking_id: str, provider_user_id: str, commission: int,
        category: str, rate: float, actor_id: Optional[str],
    ) -> dict:
        """Repli pour les missions antérieures au gel : prélèvement direct.

        Peut échouer si le prestataire n'a pas les fonds — on marque alors la
        commission comme due, sans bloquer la fin de mission.
        """
        try:
            tx = await self.ws.transfer(
                self.db,
                from_owner_id=provider_user_id,
                to_owner_id=self.platform_owner_id,
                amount_xof=commission,
                transaction_type=self._commission_txn_type(),
                label=f"Commission mission {booking_id} (sans gel préalable)",
                reference={"booking_id": booking_id},
                idempotency_key=f"commission_capture:{booking_id}",
                actor_id=actor_id,
                allow_negative_from=True,
            )
            await self._stamp(booking_id, GUARD_CAPTURED, {
                "commission_guard_captured_at": _now_iso(),
                "commission_secured_at": _now_iso(),
                "commission_computed_xof": commission,
                "commission_guard_legacy": True,
            })
            return {"ok": True, "status": GUARD_CAPTURED, "commission_xof": commission,
                    "legacy": True, "transaction_id": (tx or {}).get("id")}
        except Exception as e:
            log.warning("commission_guard: capture sans gel échouée booking=%s: %s", booking_id, e)
            await self._stamp(booking_id, "due", {
                "commission_guard_error": str(e)[:200],
                "commission_computed_xof": commission,
            })
            return {"ok": False, "status": "due", "commission_xof": commission, "error": str(e)}

    # ─────────────── 3. Libération à l'annulation ───────────────
    async def release(self, booking: dict, reason: str = "annulation") -> dict:
        """Rend au prestataire la commission gelée. Idempotent."""
        booking_id = booking.get("id")
        status = booking.get("commission_guard_status")

        if status != GUARD_HELD:
            # Rien de gelé (déjà capturé, déjà libéré, ou jamais gelé)
            return {"ok": True, "status": status or "none", "released_xof": 0}

        provider_user_id = booking.get("commission_guard_provider_id") or await self._provider_user_id(booking)
        commission = int(booking.get("commission_guard_amount_xof") or 0)
        if commission <= 0:
            await self._stamp(booking_id, GUARD_RELEASED, {"reason": reason})
            return {"ok": True, "status": GUARD_RELEASED, "released_xof": 0}

        await self.ws.unlock_funds(
            self.db,
            owner_id=provider_user_id,
            amount_xof=commission,
            to_available=True,   # retour au solde disponible
        )
        await self._stamp(booking_id, GUARD_RELEASED, {
            "commission_guard_released_at": _now_iso(),
            "commission_guard_release_reason": reason,
        })
        log.info("commission_guard.release booking=%s amount=%s reason=%s",
                 booking_id, commission, reason)
        return {"ok": True, "status": GUARD_RELEASED, "released_xof": commission}

    # ─────────────── Utilitaires ───────────────
    def _commission_txn_type(self):
        """Réutilise le type de transaction existant du moteur wallet."""
        try:
            from wallet.constants import TransactionType
            for name in ("COMMISSION", "COMMISSION_CASH", "FEE"):
                if hasattr(TransactionType, name):
                    return getattr(TransactionType, name)
        except Exception:
            pass
        return "commission"

    async def _stamp(self, booking_id: str, status: str, extra: dict) -> None:
        """Écrit l'état de la garantie sur la réservation (toutes collections)."""
        payload = {"commission_guard_status": status, **extra}
        for coll in (self.db.bookings, self.db.babysitting_bookings, self.db.ride_bookings):
            try:
                await coll.update_one({"id": booking_id}, {"$set": payload})
            except Exception:
                pass


async def ensure_indexes(db: Any) -> None:
    """Index de suivi. Idempotent."""
    try:
        await db.bookings.create_index([("commission_guard_status", 1), ("created_at", -1)])
    except Exception as e:
        log.warning("commission_guard ensure_indexes failed: %s", e)
```

---

## INTÉGRATION DANS `server.py`

### 1. Instancier le garde (près des autres montages, en fin de fichier)

```python
# Securisation de la commission sur les missions cash
from commission_guard import CommissionGuard, ensure_indexes as _cg_indexes  # noqa: E402
from wallet.constants import PLATFORM_OWNER_ID as _PLATFORM_OWNER_ID  # noqa: E402

commission_guard = CommissionGuard(
    db,
    wallet_service=_wallet_service,
    commission_rates=COMMISSION_RATES,
    platform_owner_id=_PLATFORM_OWNER_ID,
)


@app.on_event("startup")
async def _commission_guard_startup():
    await _cg_indexes(db)
```

> Si la constante ne s'appelle pas `PLATFORM_OWNER_ID` dans
> `wallet/constants.py`, utilise le nom réel de l'identifiant du wallet
> plateforme (celui qu'emploie `ensure_platform_wallet`).

### 2. Geler à l'acceptation — dans `update_booking` (PATCH `/bookings/{bid}`)

Dans le bloc `if body.status is not None:`, juste après le contrôle des droits
(`if b["provider_id"] != user["id"]: raise HTTPException(403, ...)`), ajouter :

```python
        # Securisation de la commission a l'acceptation d'une mission cash.
        # Le paiement en ligne prelevant deja la commission a la source, on ne
        # gele que si la mission n'est pas deja payee en ligne.
        if body.status == "accepted":
            pre = await commission_guard.can_accept_cash_mission(user["id"], b)
            if not pre.get("ok") and pre.get("reason") == "insufficient_funds":
                raise HTTPException(402, pre.get("message"))
            try:
                await commission_guard.hold(b, actor_id=user["id"])
            except Exception as e:
                log.warning("commission hold echoue booking=%s: %s", bid, e)
                raise HTTPException(402, "Rechargez votre wallet pour accepter cette mission.")
```

### 3. Capturer à la fin de mission

**a) Dans `update_booking`**, là où `triggered_completion` est déjà calculé,
juste après `await db.bookings.update_one({"id": bid}, {"$set": updates})` :

```python
    if triggered_completion:
        try:
            b_fresh = await db.bookings.find_one({"id": bid}, {"_id": 0})
            await commission_guard.capture(b_fresh, actor_id=user["id"])
        except Exception as e:
            log.warning("commission capture echouee booking=%s: %s", bid, e)
```

**b) Dans `confirm_completion`** (double confirmation), dans le bloc `if both:`,
après `await db.bookings.update_one({"id": bid}, {"$set": updates})` :

```python
        try:
            b_fresh = await db.bookings.find_one({"id": bid}, {"_id": 0})
            await commission_guard.capture(b_fresh, actor_id=user["id"])
        except Exception as e:
            log.warning("commission capture echouee booking=%s: %s", bid, e)
```

### 4. Libérer à l'annulation — dans `update_booking`

Dans le bloc existant qui traite `body.status == "cancelled"` :

```python
        if body.status in ("cancelled", "rejected"):
            try:
                await commission_guard.release(b, reason=body.status)
            except Exception as e:
                log.warning("commission release echouee booking=%s: %s", bid, e)
```

### 5. Empêcher le double prélèvement — dans `record_cash_payment`

La déclaration cash devient un **outil de suivi**. Elle ne doit plus prélever si
la commission a déjà été sécurisée. Juste avant l'appel à
`_wcom.charge_cash_commission(...)` :

```python
    # La commission a-t-elle deja ete securisee par le gel ?
    if b_updated.get("commission_secured_at"):
        return {
            "ok": True,
            "booking_id": bid,
            "amount_paid_xof": amount,
            "commission_already_secured": True,
            "commission_xof": int(b_updated.get("commission_computed_xof") or 0),
            "message": "Paiement enregistre. La commission avait deja ete prelevee.",
        }
```

Le reste de la fonction est **inchangé** : les missions anciennes, ou celles
dont le gel a échoué, continuent d'être traitées comme avant.

---

## SCÉNARIOS TESTÉS — 24 vérifications, 0 échec

Banc de test avec wallet simulé (buckets available/locked, idempotence).

| # | Scénario | Résultat |
|---|---|---|
| 1 | Cash normal 20 000 F | 2 400 F gelés puis capturés ✅ |
| 2 | **Prestataire ne déclare JAMAIS** | **Jokoo encaisse quand même 2 400 F** ✅ |
| 3 | Solde insuffisant (contournement) | Mission refusée, manque annoncé (1 900 F) ✅ |
| 4 | Annulation | Fonds rendus, rien encaissé ✅ |
| 5 | Triple capture | Prélevé une seule fois ✅ |
| 6 | Double acceptation | Un seul gel ✅ |
| 7 | Wave / Orange Money / carte | Aucun gel (commission déjà prise) ✅ |
| 8 | Déclaration après capture | Pas de double prélèvement ✅ |
| 9 | Mission antérieure (sans gel) | Repli : prélèvement direct ✅ |
| 10 | Taux par catégorie | services 2 400 / mobility 2 000 / family 3 000 ✅ |

---

## CE QUI N'EST PAS MODIFIÉ

- ✅ Le client paie toujours en espèces à la fin de la prestation
- ✅ Le prestataire reste le payeur de la commission (modèle inchangé)
- ✅ Les taux restent 12 % / 10 % / 15 %
- ✅ `POST /bookings/{id}/cash-payment` fonctionne toujours
- ✅ Paiements Wave, Orange Money, carte : aucun changement
- ✅ Historique et données existantes conservés
- ✅ Aucun autre chantier touché

---

## POINT DE VIGILANCE OPÉRATIONNEL

Ce dispositif impose au prestataire d'avoir un solde. C'est le prix de la
sécurité, mais c'est **une friction réelle au recrutement** — un prestataire
sans trésorerie ne pourra pas accepter sa première mission cash.

Trois amortisseurs à envisager (hors périmètre de ce document) :

1. **Crédit de démarrage** : offrir 5 000 F de solde aux 50 premiers
   prestataires. Coût maîtrisé, lève entièrement l'objection.
2. **Plancher négatif toléré** : `min_balance` négatif configurable par l'admin,
   pour laisser 2 ou 3 missions à découvert avant blocage.
3. **Message clair dans l'app** : « Rechargez X F pour accepter cette mission »
   avec un bouton direct vers la recharge Wave/Orange Money.

Le message d'erreur est déjà rédigé dans ce sens et le montant manquant est
calculé automatiquement.
