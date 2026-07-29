# Intégrations paiement — Wave & Orange Money

Le code est prêt en production ; il ne reste qu'à renseigner vos identifiants marchand dans `/app/backend/.env` puis redémarrer le backend.

---

## Wave Business API

### 1. Créer le compte

1. Rendez-vous sur https://business.wave.com et créez un compte marchand.
2. Complétez la vérification KYB (registre de commerce, NINEA, RIB, pièce d'identité du représentant légal).
3. Une fois validé, allez dans **Settings → API keys** et générez :
   - un **API key** (secret Bearer token) — `WAVE_API_KEY`
   - un **Webhook signing secret** — `WAVE_WEBHOOK_SECRET`

### 2. Configurer .env

```env
WAVE_API_KEY="wave_sn_prod_xxxxxxxxxx"
WAVE_WEBHOOK_SECRET="whsec_xxxxxxxxxx"
WAVE_BASE_URL="https://api.wave.com/v1"
```

### 3. Configurer le webhook côté Wave

Dans le portail Business, ajoutez l'URL suivante :

```
https://<votre-domaine>/api/payments/wave/webhook
```

Événements à écouter : `checkout.session.completed`, `checkout.session.payment_success`.

### 4. Endpoints Jokoo

- `POST /api/payments/wave/checkout/booking` (auth client) → `{ url, session_id }`
- `POST /api/payments/wave/checkout/subscription` (auth prestataire) → `{ url, session_id }`
- `POST /api/payments/wave/webhook` (Wave → nous, signé)

---

## Orange Money Sénégal — Web Payment API

### 1. Créer le compte développeur

1. Créez un compte sur https://developer.orange-sonatel.com
2. Créez une **application** et souscrivez au produit **Orange Money Web Payment**.
3. Récupérez :
   - `Client ID` → `OM_CLIENT_ID`
   - `Client Secret` → `OM_CLIENT_SECRET`
   - `Merchant Key` (fourni par Sonatel après validation) → `OM_MERCHANT_KEY`

### 2. Fournir les documents pour passer en prod

Sonatel demande : **NINEA, RCCM, CNI du représentant légal, RIB**, plus le formulaire d'identification partenaire.

### 3. Configurer .env

```env
# Sandbox
OM_BASE_URL="https://api.orange.com/orange-money-webpay/dev/v1"
# Prod (après validation)
# OM_BASE_URL="https://api.orange.com/orange-money-webpay/v1"

OM_CLIENT_ID="xxxxxxxxxxxxxxxx"
OM_CLIENT_SECRET="xxxxxxxxxxxxxxxx"
OM_MERCHANT_KEY="xxxxxxxxxxxxxxxx"
OM_TOKEN_URL="https://api.orange.com/oauth/v3/token"
```

### 4. Endpoints Jokoo

- `POST /api/payments/orange/checkout/booking` (auth client) → `{ url, pay_token }`
- `POST /api/payments/orange/checkout/subscription` (auth prestataire)
- `GET /api/payments/orange/status/{pay_token}` (auth) — polling côté client
- `POST /api/payments/orange/notify` (OM → nous, notification serveur — best-effort)

### 5. Note sur la devise

Le sandbox OM utilise souvent `OUV` comme code devise pour les tests. En production, remplacez par `XOF` dans `payments_local.py` (`om_create_webpayment`).

---

## Flux frontend

- Écran **paiement** (`/app/frontend/app/booking/success.tsx`) : boutons `pay-card`, `pay-wave`, `pay-orange`, `pay-cash`. Chaque bouton appelle l'endpoint correspondant et ouvre l'URL retournée dans le navigateur intégré (`expo-web-browser`) ou redirige sur web (`window.location.assign`).
- Écran **dashboard prestataire** (`/app/frontend/app/dashboard.tsx`) : bouton d'abonnement affiche un choix (Carte / Wave / Orange).

Tant que les credentials sont vides, l'API renvoie `503` avec un message clair en français ; le frontend l'affiche dans une `Alert`.

---

## Test end-to-end après ajout des credentials

```bash
# Wave
curl -X POST https://<domain>/api/payments/wave/checkout/booking \
  -H "Authorization: Bearer <token_client>" \
  -H "Content-Type: application/json" \
  -d '{"booking_id":"<id>","amount_xof":5000}'

# Orange Money
curl -X POST https://<domain>/api/payments/orange/checkout/booking \
  -H "Authorization: Bearer <token_client>" \
  -H "Content-Type: application/json" \
  -d '{"booking_id":"<id>","amount_xof":5000}'
```

La réponse contient `url` (Wave: `wave_launch_url`, OM: `payment_url`). Ouvrez-la dans un navigateur — vous serez redirigé vers la page marchand de Wave / OM.

Pour Wave, testez avec `stripe listen`-like et `ngrok` pour recevoir le webhook en local :

```bash
ngrok http 8001
# puis mettez à jour l'URL webhook sur business.wave.com
```
