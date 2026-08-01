# Paiements & wallet

Jokoo accepte **3 méthodes de paiement en ligne** + le **cash** :

| Méthode | Statut | Provider | Marché cible |
|---|---|---|---|
| **Stripe Checkout** | ✅ Actif | Stripe.com | International (CB) |
| **Wave** | 🟡 Prêt à activer | Wave Business API | Sénégal, Côte d'Ivoire, Mali |
| **Orange Money** | 🟡 Prêt à activer | Orange Sonatel Developer | Sénégal |
| **Cash** | ✅ Actif | — | Sénégal (deal direct) |

**MOCKED / EN ATTENTE** : Wave et Orange Money — le code est en place (`backend/payments_local.py`) mais les clés API doivent être fournies pour activer.

---

## Flow Stripe Checkout (booking)

```
Client                      Frontend Expo                Backend                    Stripe
  │                              │                          │                        │
  │─── Confirm booking ─────────▶│                          │                        │
  │                              │─── POST /payments/       │                        │
  │                              │     checkout/booking ───▶│                        │
  │                              │                          │─── create session ────▶│
  │                              │                          │◀─── {url, id} ─────────│
  │                              │◀─── {checkout_url} ──────│                        │
  │                              │                          │                        │
  │◀── Redirect to Stripe hosted ┤                          │                        │
  │                                                                                  │
  │──── pay ─────────────────────────────────────────────────────────────────────────▶│
  │                                                                                  │
  │◀── Redirect $APP_URL/booking/paid?session_id=xxx ────────────────────────────────┤
  │                              │                          │                        │
  │                              │─── GET /payments/        │                        │
  │                              │     status/{session_id}─▶│─── retrieve ──────────▶│
  │                              │                          │◀── {paid: true} ───────│
  │                              │                          │─── update booking      │
  │                              │                          │    + wallet + notif    │
  │                              │◀── {status: "paid"} ─────│                        │
```

### Retour sur l'app

- **Succès** : `{APP_URL}/booking/paid?session_id=...` → écran de confirmation avec bouton "Voir ma réservation".
- **Annulation** : `{APP_URL}/booking/cancelled?booking_id=...`.

---

## Wave Business API

Endpoints `POST /api/payments/wave/checkout/*` :

- Crée une session Wave via `https://api.wave.com/v1/checkout/sessions`.
- Retour utilisateur : `GET /api/payments/wave/return?session_id=...`.
- **Webhook signé HMAC** : `POST /api/payments/wave/webhook` — vérifie `X-Wave-Signature` avec `WAVE_WEBHOOK_SECRET`.

Voir [Wave Docs](https://docs.wave.com/business/checkout).

### Activation

1. Créer un compte marchand sur https://business.wave.com
2. Récupérer `WAVE_API_KEY` (validation manuelle).
3. Configurer un webhook pointant vers `<APP_URL>/api/payments/wave/webhook`, récupérer `WAVE_WEBHOOK_SECRET`.
4. Renseigner dans `backend/.env` :
   ```env
   WAVE_API_KEY="wave_..."
   WAVE_WEBHOOK_SECRET="whsec_..."
   WAVE_BASE_URL="https://api.wave.com/v1"
   ```
5. Redémarrer le backend.

---

## Orange Money Sénégal — Web Payment API

Provider : **Orange Sonatel Developer** (https://developer.orange-sonatel.com).

Flow :

1. Backend obtient un access token via OAuth 2.0 (`OM_TOKEN_URL`, `OM_CLIENT_ID`, `OM_CLIENT_SECRET`).
2. Crée une transaction via `OM_BASE_URL/webpayment` (retourne un `pay_token` + URL de redirection).
3. Client redirigé vers l'URL OM → paye → OM renvoie sur `GET /api/payments/orange/return?pay_token=...`.
4. Notification asynchrone via `POST /api/payments/orange/notify` (à activer côté portail OM).

### Activation

```env
OM_CLIENT_ID="..."
OM_CLIENT_SECRET="..."
OM_MERCHANT_KEY="..."
OM_BASE_URL="https://api.orange.com/orange-money-webpay/dev/v1"   # sandbox
# OM_BASE_URL="https://api.orange.com/orange-money-webpay/v1"    # prod
OM_TOKEN_URL="https://api.orange.com/oauth/v3/token"
```

---

## Cash

Un prestataire peut déclarer une prestation payée en cash :

- `POST /api/bookings/{bid}/cash-payment { amount_xof }`.
- Booking passe à `paid=true`, `paid_method="cash"`.
- **La commission Jokoo est calculée puis ajoutée à `wallets.commission_due`** — le prestataire devra la régler plus tard via Stripe (`POST /api/wallet/pay-commission-due`).
- Si `commission_due` dépasse **`COMMISSION_DEBT_THRESHOLD_FCFA`** (constante dans `server.py`, ex. 100 000 XOF), le wallet passe `is_blocked_debt=true` et le provider ne peut plus accepter de nouvelles réservations (guard `_check_provider_not_blocked` sur `POST /bookings`, `POST /rides/{id}/book`, `POST /family/bookings`).

---

## Commissions

- **Taux par défaut** : configurable (constante `COMMISSION_RATE` dans `server.py`, aujourd'hui env. 15-20% selon le domaine).
- **Cumul avec l'abonnement Pro** : un provider Pro (`sub_expires_at > now`) bénéficie d'un taux réduit. À enrichir avec la Phase 1 des **codes promo** (règle métier : la remise s'applique uniquement sur la part commission de Jokoo, le provider garde 100%).
- Calculée à chaque paiement online ET pour chaque cash-payment.

## Wallet

Endpoints :

- `GET /api/wallet/me` : `{commission_due, commission_paid, is_blocked_debt}`
- `GET /api/wallet/history` : transactions
- `POST /api/wallet/pay-commission-due` : crée une session Stripe pour régler tout ou partie

## Remboursements

Aujourd'hui, les remboursements sont **manuels** (via Stripe Dashboard). Pour automatiser :

1. Endpoint `POST /api/admin/bookings/{bid}/refund` (à implémenter).
2. Appel `stripe.Refund.create(payment_intent=..., amount=...)`.
3. Update booking `status=refunded`, notification client + provider, ajustement wallet si commission déjà perçue.

## Notifications de paiement

Après tout paiement réussi, le backend émet :

| Type notif | Cible | Contenu |
|---|---|---|
| `payment_received` | Prestataire | "Vous avez reçu X FCFA de <client>." |
| `booking_status` | Client | "Réservation confirmée / payée." |
| `wallet_debt_warning` | Prestataire | Émis quand `commission_due` approche du seuil |

---

## Abonnement Pro (subscription)

Endpoints `POST /api/payments/*/checkout/subscription` — le provider paie 1 mois d'abonnement.

Retour de paiement → `user.sub_expires_at` mis à jour à `now + 30 days`.

**Cumul** : la Phase 1 des codes promo (à venir) permettra de cumuler l'abonnement Pro avec une remise supplémentaire sur la commission.

---

## Sécurité paiements — Do & Don't

**DO** :

- Toujours vérifier la signature webhook (Wave HMAC, Stripe `stripe.Webhook.construct_event`).
- Idempotence : conserver `session_id` / `payment_intent_id` et refuser un 2e traitement.
- Vérifier le montant côté serveur (jamais confiance dans le body client).
- Logger toutes les transactions dans `wallet_transactions`.
- Redémarrer le backend après modification des variables Stripe/Wave/OM.

**DON'T** :

- Ne pas exposer `STRIPE_API_KEY` / `WAVE_API_KEY` / `OM_CLIENT_SECRET` au frontend.
- Ne pas modifier `commission_due` depuis le client.
- Ne pas rediriger vers une `return_url` non validée (open redirect).

---

## Migration `emergentintegrations` → `stripe` officiel

Aujourd'hui, `server.py` utilise `from emergentintegrations.payments.stripe.checkout import ...`. Pour un déploiement autonome :

```bash
# 1. Installer le SDK Stripe officiel
pip install stripe==11.4.1
```

Puis remplacer dans `server.py` :

```python
# AVANT
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionResponse,
    CheckoutSessionRequest, CheckoutStatusResponse,
)

# APRÈS
import stripe
stripe.api_key = os.environ["STRIPE_API_KEY"]
```

Et les appels :

```python
# AVANT
session = await StripeCheckout(api_key=STRIPE_KEY).create_session(
    CheckoutSessionRequest(amount=amount, currency="xof", ...)
)

# APRÈS
session = stripe.checkout.Session.create(
    payment_method_types=["card"],
    line_items=[{
        "price_data": {
            "currency": "xof",
            "product_data": {"name": item_name},
            "unit_amount": int(amount * 100),
        },
        "quantity": 1,
    }],
    mode="payment",
    success_url=f"{APP_URL}/booking/paid?session_id={{CHECKOUT_SESSION_ID}}",
    cancel_url=f"{APP_URL}/booking/cancelled?booking_id={booking_id}",
    metadata={"booking_id": booking_id, "user_id": user["id"]},
)
```

Effort estimé : **~2 h** de refactor + tests. Voir `docs/EMERGENT_DEPENDENCIES.md` pour la procédure complète.
