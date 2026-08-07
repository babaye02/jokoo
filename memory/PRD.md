# Jokoo — Product Requirements Document

## Vision

Jokoo est la première plateforme sénégalaise qui met en relation les particuliers, les entreprises et les professionnels qualifiés (plombiers, électriciens, coiffeuses, professeurs, chauffeurs, photographes, etc.). L'expérience se veut aussi moderne qu'Uber, Airbnb et TaskRabbit, avec un design premium bleu nuit / turquoise / blanc et Poppins.

## Utilisateurs

- **Client** : recherche un pro, réserve, discute, paie, note, gère favoris et historique.
- **Prestataire** : gère son profil (métier, tarif, zones, horaires, pièce d'identité), reçoit et accepte des demandes, consulte son dashboard (revenus, note, calendrier) et souscrit un abonnement mensuel.

## Modèle de tarification

Jokoo **ne facture pas à l'heure**. Chaque prestataire choisit son mode :

| Mode | Description | Ex. |
|---|---|---|
| `fixed` | Prix ferme par prestation | `15 000 F` |
| `from` | Prix "à partir de…" (indicatif) | `Dès 10 000 F` |
| `quote` | Devis personnalisé après lecture de la demande | `Sur devis` |

**Flux quote** : le client crée une demande sans prix → le prestataire reçoit la demande et envoie un devis (`PATCH /bookings/{id}` avec `quote_amount`) → le client voit le montant dans son historique et peut payer.

## Fonctionnalités livrées (MVP)

- Splash animé + onboarding 3 écrans (skip / next / commencer).
- Auth email/mot de passe (JWT) avec rôle Client/Prestataire.
- Accueil : recherche, catégories, promo, "près de vous", "mieux notés".
- Recherche : query + chips de catégories + tri (rating / prix).
- Fiche prestataire : cover, avatar, note, avis, galerie, zones, horaires, boutons Réserver / Discuter / Appeler / Favori.
- Flow de réservation (date, heure, adresse, durée, prix estimé).
- Écran paiement multi-méthodes (Carte via Stripe Checkout, Wave, Orange Money, à la prestation).
- Chat en temps réel (polling 3s) + réponses rapides (chips), notes vocales (max 2 min, expo-audio, stockage `chat_media` BinData) et partage de position temporaire (15/30/60 min, coordonnées masquées après expiration).
- Notifications (demandes, statuts, messages).
- Favoris.
- Profil client + dashboard prestataire (stats, demandes, accept/refuser/terminer, abonnement mensuel).
- Édition du profil prestataire (métier, tarif, zones, horaires, pièce d'identité).

## Stack

- **Frontend** : Expo + expo-router (file-based), React Native, TypeScript.
- **Backend** : FastAPI + Motor (MongoDB), JWT, bcrypt.
- **Paiement** : Stripe Checkout (mode payment, XOF).
- **Storage** : `@/src/utils/storage` (SecureStore pour le token JWT).

## Structure des données

- `users` : id, email, password_hash, name, role, phone, city, avatar.
- `providers` : id, user_id, name, service, service_key, city, hourly_price, rating, reviews_count, description, photo, gallery, verified, zones, hours, subscription_active, subscription_until.
- `bookings` : id, client_id, provider_id, date, time, address, description, estimated_price, status (pending/accepted/rejected/completed/cancelled), paid.
- `reviews` : id, provider_id, author_id, rating, comment.
- `favorites` : user_id + provider_id.
- `messages` : conv_id, from_id, to_id, text, kind (text/image/location/voice), read, media_id, duration_ms, lat/lng/landmark/expires_at (location).
- `chat_media` : id, conv_id, participants, owner_id, mime, size_bytes, duration_ms, data (BinData audio).
- `notifications` : user_id, type, title, body, read.

## Endpoints API (préfixe `/api`)

Auth : `/auth/register`, `/auth/login`, `/auth/me`.
Catalog : `/services`, `/providers[?service,city,q,sort,limit]`, `/providers/{id}`, `/providers/me`.
Booking : `/bookings` (GET/POST), `/bookings/{id}` (PATCH).
Reviews : `/reviews` (POST).
Favorites : `/favorites`, `/favorites/{id}` (POST/DELETE).
Chat : `/chat/conversations`, `/chat/{peer}/messages` (GET/POST), `/chat/{peer}/voice` (POST, note vocale), `/chat/media/{media_id}` (GET, audio protégé participants).
Notifications : `/notifications`, `/notifications/read-all`.
Dashboard : `/dashboard`.
Payments : `/payments/checkout/booking`, `/payments/checkout/subscription`, `/payments/status/{sid}`.
Utility : `/seed`.

## Prochaines évolutions

- Prise en charge Wave / Orange Money via APIs marchandes réelles.
- Notifications push via Emergent-managed push notifications.
- Upload photos réelles (base64 → cloud storage).
- Admin dashboard (modération / statistiques).
