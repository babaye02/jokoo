# Base de données — MongoDB

Jokoo utilise **MongoDB** (Motor async driver). Pas de SQL, pas de RLS, pas de triggers natifs — les contraintes métier sont appliquées au niveau applicatif (FastAPI) via des helpers (`_is_pair_blocked`, `_check_provider_not_blocked`, guards `require_admin`, etc.).

- DB par défaut : **`jokoo_db`**
- URL de connexion : variable d'env **`MONGO_URL`**
- 30 collections principales

---

## Collections

### 1. `users`
Utilisateurs (tous rôles confondus).

| Champ | Type | Description |
|---|---|---|
| `id` | `str` UUID | PK applicative |
| `email` | `str` (lowercase) | Unique |
| `password_hash` | `str` (bcrypt) | |
| `name` | `str` | |
| `phone` | `str?` | |
| `city` | `str?` | |
| `avatar` | `str?` (base64) | |
| `role` | `"client" \| "prestataire"` | |
| `is_admin` | `bool` | |
| `staff_role` | `"super_admin" \| "admin" \| "marketing" \| "support" \| "operator" \| "technical"?` | |
| `created_at` | `str` ISO 8601 | |
| `updated_at` | `str?` ISO 8601 | |
| `apple_sub` | `str?` | Sub JWT Sign in with Apple |
| `sub_expires_at` | `str?` | Abonnement Pro (ISO) |

**Index recommandés** : `email` (unique), `apple_sub`, `staff_role`.

### 2. `providers`
Profils prestataires (1:1 avec un `users` de role `prestataire`).

| Champ | Type | Description |
|---|---|---|
| `id` | `str` = users.id | PK partagée |
| `name`, `service`, `service_key`, `city`, `zones[]` | | |
| `description`, `photo`, `photos[]` | | Base64 |
| `price_type` | `"fixed" \| "hourly" \| "quote"` | |
| `price_amount` | `int?` XOF | |
| `rating`, `reviews_count` | | Recomputés sur review |
| `sponsored_until` | `str?` ISO | |
| `phone`, `email` (masqués côté public si pas de booking confirmé) | | |

**Index** : `service_key`, `city`, `sponsored_until`.

### 3. `services`
Prestations (sous-services d'un prestataire).

`{id, provider_id, name, description, price_type, price_amount, active, created_at}`

### 4. `bookings`
Réservations principales.

| Champ | Type |
|---|---|
| `id`, `client_id`, `client_name`, `provider_id`, `provider_name`, `provider_service`, `service_id?`, `service_name?` | |
| `date` (YYYY-MM-DD), `time` (HH:mm), `address`, `description` | |
| `price`, `price_type`, `quote_amount?`, `amount_paid?`, `commission?`, `paid_method?` (`stripe\|wave\|orange_money\|cash`) | |
| `status` | `"pending" \| "accepted" \| "rejected" \| "in_progress" \| "completed" \| "cancelled"` |
| `paid` | `bool` |
| `client_confirmed_at?`, `provider_confirmed_at?`, `completed_at?`, `review_id?` | |
| `created_at`, `updated_at?` | |

**Index** : `client_id`, `provider_id`, `status`.

### 5. `reviews`
Avis clients sur prestataires.

`{id, provider_id, booking_id?, author_id, author_name, author_avatar, rating (1-5), comment, created_at}`

### 6. `favorites`
`{user_id, provider_id, created_at}` — Index composite unique `(user_id, provider_id)`.

### 7. `messages`
Chat.

`{id, conv_id, from_id, from_name, to_id, to_name, text, kind, flagged, flags[], read, created_at}`

`conv_id` = `"-".join(sorted([a, b]))` — même conv_id pour A→B et B→A.

### 8. `notifications`
`{id, user_id, type, title, body, read, created_at, ...contextIds}` — types listés dans `docs/API.md` §8.

### 9. `blocked_users`
`{user_id, blocked_id, created_at}` — bidirectionnel géré applicativement (voir helpers `_blocked_ids` / `_is_pair_blocked`).

### 10-11. `rides` + `ride_bookings`
Covoiturage. Champs clés :

**rides** : `id`, `driver_id`, `from_city`, `to_city`, `stops[]`, `date`, `time`, `distance_type` (`short\|long`), `recurrence` (`once\|weekly`), `recurrence_days[]` (`mon..sun`), `price_xof`, `seats_total`, `seats_available`, `status` (`active\|cancelled\|completed`), `accepts_parcels`, `parcel_price_xof`, `parcel_max_kg`, `parcel_payment_mode` (`app_only\|app_or_cash\|cash_only`).

**ride_bookings** : `id`, `ride_id`, `passenger_id`, `passenger_name`, `passenger_phone`, `seats`, `price_xof`, `status` (`confirmed\|cancelled\|completed`), `paid`, `note`.

### 12. `parcels`
Livraison longue distance.

`{id, ride_id, sender_id, driver_id, from_city, to_city, date, time, pickup_address, dropoff_address, description, weight_kg, recipient_name, recipient_phone, photo, payment_mode (app\|cash), price_xof, status (pending\|accepted\|picked_up\|in_transit\|delivered\|cancelled\|rejected)}`

### 13-15. Jokoo Family
- **`babysitters`** : profil student/teacher/professional. `{id, user_id, name, avatar, city, profile_type, languages[], age_specialties[], skills[], services[], offers_tutoring, psc1_certified, hourly_rate_xof, student_card (upload), student_card_verified, verified_plus, recommended_by_jokoo, night_care, can_travel, available_today, emergency_contact, rating, status}`
- **`babysitting_bookings`** : `{id, parent_id, parent_name, babysitter_id, babysitter_user_id, babysitter_name, service_type (babysitting\|tutoring\|both), address, city, date, time_start, time_end, duration_hours, kids[], language_focus, emergency_contact, status (pending\|confirmed\|in_progress\|completed\|cancelled), paid, report_id?, checkin_photo?}`
- **`babysitting_reports`** : carnet de session `{id, booking_id, parent_id, babysitter_id, activities, meals, mood (happy\|calm\|tired\|neutral), notes, photo?, created_at}`

### 16-18. Legal Center
- **`legal_documents`** : `{slug, title, latest_version, published, published_at, ...}` — un doc par slug (`cgu`, `privacy`, `mentions-legales`, ...).
- **`legal_versions`** : historique complet `{doc_slug, version, content (markdown), created_at, created_by}`.
- **`legal_acceptances`** : `{user_id, doc_slug, version, accepted_at}`.

### 19-20. Ads
- **`ads`** : `{id, image, title, subtitle, placement, audience, link_type (provider\|category\|promo\|url), link_target, duration_ms, screens[], suspended, created_at}` — pubs actives.
- **`ad_campaigns`** : campagnes auto-service achetées par providers `{id, provider_id, budget_xof, start_at, end_at, ads[], status}`.

### 21. `partners` / 22. `promos`
Partenariats admin-managed.
`partners` : `{id, name, logo, url, active}`.
`promos` : `{id, slug, title, description (markdown), image, partner_id?, valid_until, discount_type (percent\|fixed\|commission_only), discount_value, cumulative_with_pro (bool)}`.

### 23. `sponsorships`
Mises en avant payantes.
`{id, provider_id, duration_days, price_xof, status, paid, expires_at}`.

### 24. `wallets`
`{user_id (= provider), commission_due, commission_paid, is_blocked_debt, blocked_at?, ...}`.

### 25. `wallet_transactions`
`{id, user_id, type (charge\|payment\|refund), amount_xof, source_booking_id?, created_at}`.

### 26. `reports`
Signalements.
`{id, reporter_id, target_id, target_type (user\|provider\|booking\|ride\|message), reason, description, status (open\|awaiting_reporter\|resolved\|dismissed), admin_notes?, created_at, updated_at}`.

### 27. `otps`
Codes OTP téléphone.
`{phone, code (hashed), expires_at, used}` — TTL applicatif.

### 28. `password_resets`
`{token, user_id, email, expires_at, used}` — TTL 60 min.

### 29. `contact_flags`
Alertes anti-contournement.
`{id, user_id, peer_id, flags[] (phone\|email\|url), text_hash, created_at}`.

### 30. `push_tokens` + 31. `notification_prefs`
`push_tokens` : `{user_id, expo_token, platform, created_at}` — pour push notifications Expo.
`notification_prefs` : `{user_id, ...booleans}` — préférences opt-in/out par type.

---

## Relations (logiques)

```
users ─┬─ providers (1:1 si role=prestataire, id partagé)
       ├─ babysitters (1:1 profil family)
       ├─ bookings (1:N comme client, 1:N comme provider)
       ├─ babysitting_bookings (1:N parent, 1:N babysitter)
       ├─ rides (1:N conducteur)
       ├─ ride_bookings (1:N passager)
       ├─ parcels (1:N sender, 1:N driver)
       ├─ reviews (author_id / provider_id)
       ├─ favorites (user_id, provider_id)
       ├─ messages (from_id, to_id)
       ├─ notifications (user_id)
       ├─ blocked_users (user_id, blocked_id)
       ├─ wallets (1:1 pour providers)
       ├─ push_tokens (1:N devices)
       ├─ notification_prefs (1:1)
       └─ legal_acceptances (N:M via version)
```

## Index recommandés (à créer manuellement)

MongoDB crée `_id` par défaut. Ajouter :

```javascript
use jokoo_db;

db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ apple_sub: 1 }, { sparse: true });

db.providers.createIndex({ service_key: 1, city: 1 });
db.providers.createIndex({ sponsored_until: 1 });

db.bookings.createIndex({ client_id: 1, created_at: -1 });
db.bookings.createIndex({ provider_id: 1, created_at: -1 });

db.reviews.createIndex({ provider_id: 1, created_at: -1 });

db.messages.createIndex({ conv_id: 1, created_at: 1 });
db.messages.createIndex({ to_id: 1, read: 1 });

db.notifications.createIndex({ user_id: 1, created_at: -1 });
db.notifications.createIndex({ user_id: 1, read: 1 });

db.blocked_users.createIndex({ user_id: 1, blocked_id: 1 }, { unique: true });
db.blocked_users.createIndex({ blocked_id: 1 });

db.rides.createIndex({ status: 1, date: 1 });
db.rides.createIndex({ driver_id: 1 });

db.ride_bookings.createIndex({ passenger_id: 1 });
db.ride_bookings.createIndex({ ride_id: 1 });

db.parcels.createIndex({ sender_id: 1 });
db.parcels.createIndex({ driver_id: 1 });

db.babysitters.createIndex({ status: 1, city: 1 });
db.babysitting_bookings.createIndex({ parent_id: 1, created_at: -1 });
db.babysitting_bookings.createIndex({ babysitter_user_id: 1, created_at: -1 });

db.legal_documents.createIndex({ slug: 1 }, { unique: true });
db.legal_versions.createIndex({ doc_slug: 1, version: -1 });

db.ads.createIndex({ placement: 1, audience: 1, suspended: 1 });

db.wallets.createIndex({ user_id: 1 }, { unique: true });
db.otps.createIndex({ phone: 1 });
db.password_resets.createIndex({ token: 1 }, { unique: true });
db.password_resets.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });  // TTL auto
```

À exécuter dans le shell `mongosh` :

```bash
mongosh "mongodb://localhost:27017/jokoo_db" scripts/db_indexes.js
```

## Fonctions / Triggers

MongoDB natif n'a pas de triggers. Toute la logique est côté FastAPI :

- **Recompute rating provider** : `providers.rating` + `reviews_count` recomputés après chaque `POST /reviews` (voir `create_review` dans `server.py`).
- **Seats decrement** : `POST /rides/{rid}/book` fait `$inc: {seats_available: -seats}`. Annulation → +seats.
- **Commission** : calculée à la validation d'un paiement en ligne (voir `docs/PAYMENTS.md`).
- **Wallet blocked_debt** : passe à `true` quand `commission_due > COMMISSION_DEBT_THRESHOLD_FCFA`. Reset après paiement.
- **Filtre bloqués** : appliqué à la lecture (search/detail) et à l'écriture (booking, chat) via `_is_pair_blocked`.

## RLS

**Pas de RLS SQL** (on est en Mongo). Les contrôles d'accès sont **applicatifs** :

- `Depends(current_user)` sur chaque endpoint sensible → 401 si pas de JWT.
- `require_admin(user)` sur les endpoints `/admin/*` → 403 sinon.
- Comparaison `resource.owner_id == user["id"]` pour l'auto-owner (bookings, chat, family).
- Blocages mutuels via `_is_pair_blocked(a, b)`.

## Backup & restore

### Dump complet

```bash
# Utiliser le script fourni :
./scripts/db_dump.sh
# → produit ./dumps/YYYY-MM-DD-HHmm/jokoo_db/

# Manuel :
mongodump --uri "mongodb://localhost:27017/jokoo_db" --out ./dumps/2026-06-15
```

### Restore

```bash
./scripts/db_restore.sh ./dumps/2026-06-15
# ou manuel :
mongorestore --uri "mongodb://localhost:27017" ./dumps/2026-06-15
```

### Import initial

```bash
# Après un fresh install :
curl -X POST http://localhost:8001/api/seed
```

## Migration Base64 → Cloud storage (recommandation)

Les images sont aujourd'hui stockées en base64 dans Mongo. Pour la migration :

1. Créer un bucket S3 / compte Cloudinary.
2. Ajouter les vars dans `backend/.env` (voir `backend/.env.example`).
3. Écrire un script `scripts/migrate_media.py` qui :
   - Parcourt `users.avatar`, `providers.photos[]`, `services.image`, `messages.text` (si image), `parcels.photo`, `babysitting_reports.photo`, `ads.image`, `partners.logo`.
   - Upload chaque base64 → URL publique.
   - Remplace le champ par l'URL.
4. Adapter `server.py` pour uploader → retourner URL (au lieu de stocker base64).

Pas encore fait — laisser en base64 tant que le trafic reste MVP.
