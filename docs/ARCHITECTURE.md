# Architecture — Jokoo

## Vue d'ensemble

Jokoo est une **marketplace mobile-first** composée de trois applications indépendantes qui communiquent via une API REST unique.

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Expo Router    │      │  Next.js 15     │      │  Admin CRM      │
│  (iOS/Android/  │      │  Site marketing │      │  (dans l'app    │
│   Web preview)  │      │  jokooservices  │      │   Expo, staff)  │
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                        │                        │
         │        HTTPS /api/*    │                        │
         └────────────┬───────────┴────────────────────────┘
                      │
              ┌───────▼────────────┐
              │  FastAPI (server.py)│
              │  142 endpoints      │
              │  JWT auth (HS256)   │
              │  Motor async driver │
              └───────┬─────────────┘
                      │
                      ▼
              ┌────────────────────┐
              │   MongoDB          │
              │   30 collections   │
              └────────────────────┘
```

## Choix techniques

### Backend

| Élément | Choix | Raison |
|---|---|---|
| Framework | **FastAPI 0.110** | Perf, typage Pydantic, OpenAPI auto |
| DB driver | **Motor** (async) | Compatible asyncio, non-bloquant |
| Auth | **JWT HS256** (`python-jose`) | Simple, stateless, mobile-friendly |
| Password | **bcrypt** (`passlib`) | Standard industrie |
| Paiement | **Stripe Checkout** via `emergentintegrations` (à remplacer par `stripe` officiel) + **Wave** / **Orange Money** SN via HTTP direct | Adapté au marché sénégalais |
| Notifications | Modèle **pull** (polling `/api/notifications` toutes les 15 s côté mobile) | Simple, pas de socket à maintenir |
| Media | **Base64** encodé dans Mongo (MVP) — à migrer vers Cloudinary/S3 | Rapide à builder, prêt à scaler |

### Frontend (Expo)

| Élément | Choix | Raison |
|---|---|---|
| Framework | **Expo SDK 54 + Expo Router 6** (file-based) | Écriture unique iOS/Android/Web |
| State | **React Context** (`AuthContext`) + hooks locaux | Simplicité pour MVP |
| Auth storage | **expo-secure-store** (native) + AsyncStorage (web fallback) | Sécurisé côté natif |
| Animations | **react-native-reanimated 4** | Perf 60fps, worklets |
| Nav | **expo-router** (deep-linking gratuit) | Idiomatique Expo |
| Types | **TypeScript** strict | Sécurité au refactor |

### Website

| Élément | Choix | Raison |
|---|---|---|
| Framework | **Next.js 15 App Router** | SSG + SEO |
| Style | **Tailwind CSS 3.4** | Vitesse d'itération |
| CMS | Contenus légaux tirés de l'API backend (`/api/legal/documents`) | Single source of truth |

## Modules fonctionnels

### 1. Authentification & profils
- Email + password (register, login, forgot, reset)
- **Sign in with Apple** (obligatoire iOS)
- OTP téléphone (dev : code retourné en clair)
- Rôles : `client`, `prestataire`, `super_admin`, staff (`admin`, `marketing`, `support`, `operator`, `technical`)
- Suppression de compte (RGPD) — endpoint `DELETE /api/users/me`

### 2. Marketplace principale
- Catalogue de **prestataires** (`providers` collection) avec service, ville, zones, prix, rating, photos.
- **Prestations** (`services` collection) : sous-services d'un prestataire.
- Recherche par service, ville, quartier, texte libre, tri par rating/prix.
- **Sponsorships** (mises en avant payantes) — les providers `sponsored_until > now` remontent en tête.

### 3. Bookings
- Client demande une réservation → prestataire confirme/refuse → mission → complétion **bilatérale** (client + prestataire) → review.
- Support du **cash** ou du paiement en ligne (Stripe/Wave/OM).
- Statuts : `pending`, `accepted`, `rejected`, `in_progress`, `completed`, `cancelled`.
- **Escrow léger** : commission Jokoo calculée sur `amount_paid`, wallet du prestataire.

### 4. Chat
- Modèle "polling" simple : `GET /chat/conversations`, `GET /chat/{peer_id}/messages` toutes les ~5s.
- **Filtre anti-contournement** : détecte téléphones/emails dans les messages avant validation d'un booking.
- **Filtrage bidirectionnel bloqués** (voir `docs/AUTH.md`).

### 5. Notifications
- Modèle unifié dans `db.notifications` avec `type`, `user_id`, `booking_id?`, `family_booking_id?`, `ride_id?`, `parcel_id?`, `review_id?`, `peer_id?`.
- Types : `booking_new`, `booking_status`, `booking_completed`, `booking_completion_requested`, `payment_received`, `review_received`, `message`, `ride_new`, `ride_cancelled`, `parcel_*`, `babysitting_*`, `admin_action`, etc.
- Badge non-lues affiché sur la tab notifs.
- Routing contextuel côté frontend (`frontend/app/(tabs)/notifications.tsx`).

### 6. Jokoo Family
- Baby-sitters, tutorat, garde d'enfants, activités éducatives.
- **Verified+** badge (student card upload validé par admin).
- Bookings dédiés (`babysitting_bookings`) avec check-in photo, **bouton SOS** (contact d'urgence), et **carnet de session** (`babysitting_reports`) rempli par la sitter en fin de mission.

### 7. Mobilité
- **Covoiturage** (`rides` + `ride_bookings`) : courte/longue distance + recurrence hebdo.
- **Livraison longue distance de colis** (`parcels`) : sur trajets `accepts_parcels=true`.
- Support du paiement en app ou en cash.

### 8. Legal Center
- Documents versionnés (`legal_documents` + `legal_versions`) admin-manageable.
- Support **markdown** + acceptation obligatoire (`legal_acceptances`).
- Restauration de version depuis l'admin.

### 9. Wallet & commissions
- Chaque provider a un `wallets` doc avec `commission_due`, `commission_paid`, `is_blocked_debt`.
- Booking payé en ligne → commission auto-perçue.
- Booking cash → commission ajoutée à `commission_due`.
- Au-delà d'un seuil (`COMMISSION_DEBT_THRESHOLD_FCFA`), le provider est bloqué de nouvelles réservations.
- **Endpoint `POST /wallet/pay-commission-due`** : le provider paie sa dette via Stripe.

### 10. Admin CRM
- `/admin/crm/overview`, `/admin/crm/users`, `/admin/stats/marketplace`
- Gestion **staff**, **partners**, **ads/campaigns**, **promos** (partenaires), **reports** (signalements), **sponsorships**.
- Réinitialisation de mot de passe user par admin.
- Vérification Verified+ pour Family.

## Patterns critiques

### DO
- **Routes backend TOUJOURS préfixées `/api`** (ingress k8s / reverse-proxy).
- **Frontend** : utiliser `src/api.ts` centralisé pour tous les appels HTTP.
- **Web-compat** : NE PAS utiliser `Alert.alert` avec `onPress` — casse silencieusement sur navigateur. Utiliser `src/components/ActionSheet.tsx` ou des modals custom.
- **File-based routing** : chaque page navigable dans `app/`. Le code non-route va dans `src/`.
- **State** : garder simple avec Context + hooks. Éviter Redux tant que le besoin n'est pas prouvé.

### DON'T
- Pas de CSS ou `className` (React Native). Utiliser `StyleSheet.create()`.
- Pas de libs web-only (`react-router-dom`, `@mui/material`, `framer-motion`, etc.).
- Pas de packages Expo dépréciés (`expo-av`, `expo-barcode-scanner`, `expo-background-fetch`, `@expo-google-fonts/*`).
- Ne pas hardcoder d'URL — tout passe par `.env`.

## Sécurité

- Passwords bcrypt (rounds = 12).
- JWT signés HS256 avec `JWT_SECRET` (≥ 64 chars random).
- **Filtre anti-contournement** dans le chat (bloque numéros/emails avant confirmation booking).
- **Bloqués mutuels** : filtres bidirectionnels sur recherche, profils, chat, réservations (voir `_blocked_ids` / `_is_pair_blocked` dans `server.py`).
- **Fraud alerts** : collection `contact_flags` alimentée par le sanitizer chat.
- **Signalements** avec workflow `awaiting_reporter` / `resolved` / `dismissed`.

## Observabilité

- Logs Uvicorn `stdout`/`stderr` (récupérables par supervisord ou journald).
- Endpoint `GET /` renvoie un ping.
- Tests pytest dans `backend/tests/` — 22 rapports d'itération dans `test_reports/`.

## Refactor recommandé (futur)

- **Découper `server.py`** (≥ 4700 lignes) en routeurs FastAPI par domaine :
  ```
  backend/
  ├── routers/
  │   ├── auth.py
  │   ├── providers.py
  │   ├── bookings.py
  │   ├── chat.py
  │   ├── family.py
  │   ├── mobility.py
  │   ├── payments.py
  │   ├── legal.py
  │   ├── admin.py
  │   └── wallet.py
  ├── models/
  ├── services/
  ├── deps.py       # current_user, optional_user, require_admin, ...
  └── main.py       # app = FastAPI(...) + include_router(...)
  ```
- Migrer Base64 → Cloudinary/S3.
- Introduire un vrai **background worker** (Celery/Arq) pour push, emails, calculs de wallet.
