# API — Référence complète

> Base URL : `<APP_URL>/api` (ex. `http://localhost:8001/api`)
> Toutes les routes sont préfixées `/api`. **Swagger auto-généré** : `http://localhost:8001/docs`.

**Authentification** : la plupart des endpoints attendent un header `Authorization: Bearer <JWT>` obtenu via `POST /api/auth/login`. Les endpoints marqués **[optional]** acceptent aussi les visiteurs non authentifiés (avec filtrage adapté). Les endpoints marqués **[admin]** exigent `is_admin=true` ou `staff_role ∈ {super_admin, admin, marketing, support, operator, technical}`.

---

## 1. Auth (`/api/auth`)

| Méthode | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Inscription email/password → renvoie `{token, user}` |
| `POST` | `/auth/login` | Connexion → `{token, user}` |
| `POST` | `/auth/apple` | Sign in with Apple (identity token) → `{token, user}` |
| `POST` | `/auth/otp/request` | Demande code OTP téléphone (en dev : retourné dans `otp_dev_only`) |
| `POST` | `/auth/otp/verify` | Vérifie OTP → `{token, user}` |
| `GET` | `/auth/me` | Retourne l'utilisateur courant |
| `POST` | `/auth/change-password` | Change le password (auth requise) |
| `POST` | `/auth/forgot-password` | Génère un token de reset (TTL 60 min). En dev, retourne `dev_token`. |
| `POST` | `/auth/reset-password` | Réinitialise via `{token, new_password}` |

---

## 2. Users (`/api/users`)

| Méthode | Path | Description |
|---|---|---|
| `DELETE` | `/users/me` | Supprime le compte (RGPD, cascade) |
| `POST` | `/users/{peer_id}/block` | Bloque un utilisateur |
| `DELETE` | `/users/{peer_id}/block` | Débloque |
| `GET` | `/users/me/blocked` | Liste des bloqués |

---

## 3. Providers (`/api/providers`)

| Méthode | Path | Description |
|---|---|---|
| `GET` | `/providers` **[optional]** | Recherche : `service`, `city`, `zone`, `q`, `sort=rating\|price`, `limit`. **Filtre bloqués auto.** |
| `GET` | `/providers/{id}` **[optional]** | Détail (masque téléphone/email si pas de booking confirmé). 404 si bloqué mutuellement. |
| `POST` | `/providers/me` | Upsert du profil prestataire (auth) |
| `GET` | `/providers/{provider_id}/services` | Liste des prestations actives |

---

## 4. Services (prestations)

| Méthode | Path | Description |
|---|---|---|
| `GET` | `/services` | Toutes les prestations actives |
| `GET` | `/services/mine` | Mes prestations (prestataire connecté) |
| `POST` | `/services/mine` | Créer une prestation |
| `PATCH` | `/services/mine/{sid}` | Modifier |
| `DELETE` | `/services/mine/{sid}` | Supprimer (soft) |

---

## 5. Bookings

| Méthode | Path | Description |
|---|---|---|
| `POST` | `/bookings` | Créer une demande (client). 403 si bloqué. 403 si prestataire endetté. |
| `GET` | `/bookings` | Mes bookings (rôle-aware) |
| `GET` | `/bookings/{bid}` | Détail |
| `PATCH` | `/bookings/{bid}` | Update statut, montant, notes |
| `POST` | `/bookings/{bid}/confirm-completion` | Confirmation bilatérale (client + prestataire). Passe en `completed` quand les 2 ont confirmé. |
| `POST` | `/bookings/{bid}/cash-payment` | Prestataire déclare paiement cash → commission ajoutée à sa dette |

---

## 6. Reviews

| Méthode | Path | Description |
|---|---|---|
| `POST` | `/reviews` | Poster un avis. Body : `{booking_id, rating: 1-5, comment}`. Résout `provider_id` depuis le booking. Notifie le prestataire (`type=review_received`). |

---

## 7. Chat

| Méthode | Path | Description |
|---|---|---|
| `GET` | `/chat/conversations` | Liste des conversations (peers, unread, dernier msg) — filtre bloqués auto |
| `GET` | `/chat/{peer_id}/messages` | Historique. Retourne `[]` si bloqué. Marque comme lu. |
| `POST` | `/chat/{peer_id}/messages` | Envoyer un message. **Sanitizer anti-contournement** : détecte tel/email et masque. 403 si bloqué. |

---

## 8. Notifications

| Méthode | Path | Description |
|---|---|---|
| `GET` | `/notifications` | Mes notifications (triées récent→ancien) |
| `POST` | `/notifications/{nid}/read` | Marque une notif comme lue |
| `POST` | `/notifications/read-all` | Marque tout comme lu |
| `POST` | `/notifications/register-token` | Enregistre un push token Expo |
| `DELETE` | `/notifications/register-token` | Désinscription |
| `GET` | `/notifications/preferences` | Préférences (types de notifs souhaités) |
| `PATCH` | `/notifications/preferences` | Update |

Types de notifications rencontrés :
`booking_new`, `booking_status`, `booking_completed`, `booking_completion_requested`, `payment_received`, `review_received`, `message`, `ride_new`, `ride_cancelled`, `parcel_new`, `parcel_status`, `babysitting_new`, `babysitting_status`, `babysitting_sos`, `babysitting_report`, `admin_action`, `report_status`, `wallet_debt_warning`.

---

## 9. Favorites

| Méthode | Path | Description |
|---|---|---|
| `GET` | `/favorites` | Liste des prestataires favoris (enrichis) |
| `POST` | `/favorites/{provider_id}` | Ajouter |
| `DELETE` | `/favorites/{provider_id}` | Retirer |

---

## 10. Mobilité — Covoiturage

| Méthode | Path | Description |
|---|---|---|
| `GET` | `/rides` **[optional]** | Recherche : `from_city`, `to_city`, `date`, `distance_type=short\|long`, `accepts_parcels`. Filtre bloqués auto. |
| `POST` | `/rides` | Publier un trajet (auth) |
| `GET` | `/rides/mine` | Mes trajets (conducteur) |
| `GET` | `/rides/{rid}` **[optional]** | Détail (404 si bloqué mutuellement) |
| `PATCH` | `/rides/{rid}` | Update (conducteur seulement) |
| `DELETE` | `/rides/{rid}` | Supprimer / annuler |
| `POST` | `/rides/{rid}/book` | Réserver `{seats, note}`. 403 si bloqué. |
| `GET` | `/rides/bookings/mine` | Mes réservations passager |
| `GET` | `/rides/bookings/received` | Réservations reçues (conducteur) |
| `PATCH` | `/rides/bookings/{bid}` | Update statut (`confirmed`, `cancelled`, ...) |

---

## 11. Mobilité — Livraison colis

| Méthode | Path | Description |
|---|---|---|
| `POST` | `/rides/{rid}/parcel` | Créer une demande de colis longue distance (le trajet doit avoir `accepts_parcels=true`, `distance_type=long`). 403 si bloqué. |
| `GET` | `/parcels/mine` | Vue expéditeur |
| `GET` | `/parcels/received` | Vue conducteur |
| `GET` | `/parcels/{pid}` | Détail (auth : sender / driver / admin) |
| `PATCH` | `/parcels/{pid}` | Update statut (pickup, in_transit, delivered, cancelled) |

---

## 12. Jokoo Family

| Méthode | Path | Description |
|---|---|---|
| `GET` | `/family/babysitters` **[optional]** | Recherche : `city`, `language`, `age_group`, `skill`, `service`, `profile_type`, `offers_tutoring`, `psc1`, filtres rate, `verified_plus`, etc. Filtre bloqués. |
| `GET` | `/family/babysitters/{bid}` **[optional]** | Détail (404 si bloqué) |
| `GET` | `/family/profile/me` | Mon profil baby-sitter (le cas échéant) |
| `POST` | `/family/profile` | Upsert (baby-sitter) |
| `POST` | `/family/bookings` | Créer une réservation (parent). 403 si bloqué. |
| `GET` | `/family/bookings/mine` | Vue parent |
| `GET` | `/family/bookings/assigned` | Vue baby-sitter |
| `GET` | `/family/bookings/{bid}` | Détail |
| `PATCH` | `/family/bookings/{bid}` | Update statut, check-in |
| `POST` | `/family/bookings/{bid}/sos` | Déclenche SOS (renvoie le contact d'urgence, notifie le parent) |
| `POST` | `/family/bookings/{bid}/report` | Baby-sitter soumet le **carnet de session**. Notifie le parent. |
| `GET` | `/family/bookings/{bid}/report` | Récupère le carnet (parent / sitter / admin) |

---

## 13. Legal Center

| Méthode | Path | Description |
|---|---|---|
| `GET` | `/legal/documents` | Liste des documents publiés |
| `GET` | `/legal/documents/{slug}` | Détail (dernière version publiée) |
| `POST` | `/legal/acceptances` | Enregistre acceptation `{doc_slug, version}` |
| `GET` | `/legal/acceptances/mine` | Historique des acceptations |
| `PUT` | `/admin/legal/documents/{slug}` **[admin]** | Créer/mettre à jour un doc (crée une nouvelle version) |
| `GET` | `/admin/legal/documents/{slug}/versions` **[admin]** | Historique des versions |
| `POST` | `/admin/legal/documents/{slug}/versions/{version}/restore` **[admin]** | Restaure une version |

---

## 14. Partners & promos

| Méthode | Path | Description |
|---|---|---|
| `GET` | `/partners` | Liste publique des partenaires actifs |
| `GET` | `/partners/{pid}` | Détail |
| `GET` | `/promos` | Liste des promos actives |
| `GET` | `/promos/{slug}` | Détail |
| `POST/PATCH/DELETE` | `/admin/partners`, `/admin/promos` **[admin]** | CRUD |

---

## 15. Ads & campaigns

| Méthode | Path | Description |
|---|---|---|
| `GET` | `/ads?placement=home\|between_lists\|category&audience=client\|provider` | Retourne les pubs actives adaptées |
| `POST` | `/ads/{ad_id}/click` | Track un clic |
| `POST` | `/admin/ads` **[admin]** | Créer |
| `PATCH/DELETE` | `/admin/ads/{ad_id}` **[admin]** | Update / supprimer |
| `PATCH` | `/admin/ads/{ad_id}/suspend` **[admin]** | Suspendre |
| `PATCH` | `/admin/ads/{ad_id}/resume` **[admin]** | Reprendre |
| `GET` | `/admin/ads/stats` **[admin]** | Impressions / clics |
| `POST` | `/ad-campaigns` | Achat auto-service d'une campagne (provider) |
| `GET/PATCH` | `/admin/ad-campaigns[/{cid}]` **[admin]** | Modération |

---

## 16. Sponsorships (mise en avant)

| Méthode | Path | Description |
|---|---|---|
| `GET` | `/sponsorships/mine` | Mon sponsorship actif |
| `POST` | `/sponsorships` | Achète un sponsorship (via Stripe checkout) |
| `GET/PATCH` | `/admin/sponsorships[/{sid}]` **[admin]** | Modération |

---

## 17. Reports (signalements)

| Méthode | Path | Description |
|---|---|---|
| `POST` | `/reports` | Signaler `{target_id, target_type, reason, description}` |
| `POST` | `/reports/{rid}/confirm-resolution` | Reporter valide la résolution admin |
| `GET` | `/admin/reports` **[admin]** | Liste, filtres statut/type |
| `PATCH` | `/admin/reports/{rid}` **[admin]** | Update statut (`awaiting_reporter`, `resolved`, `dismissed`) + notes admin |
| `GET` | `/admin/reports/stats` **[admin]** | Compteurs |

---

## 18. Wallet & commissions

| Méthode | Path | Description |
|---|---|---|
| `GET` | `/wallet/me` | Mon wallet (provider) : `commission_due`, `commission_paid`, `is_blocked_debt` |
| `GET` | `/wallet/history` | Transactions |
| `POST` | `/wallet/pay-commission-due` | Paie une partie de la dette via Stripe checkout |
| `GET` | `/payments/mine` | Historique de mes paiements |

---

## 19. Paiements — Stripe / Wave / Orange Money

| Méthode | Path | Description |
|---|---|---|
| `POST` | `/payments/checkout/booking` | Crée une session Stripe checkout pour un booking |
| `POST` | `/payments/checkout/subscription` | Session Stripe pour abonnement Pro |
| `GET` | `/payments/status/{session_id}` | Statut d'une session Stripe |
| `POST` | `/payments/wave/checkout/booking` | Wave — checkout booking |
| `POST` | `/payments/wave/checkout/subscription` | Wave — abonnement |
| `POST` | `/payments/wave/webhook` | Webhook Wave (signé) |
| `GET` | `/payments/wave/return` | Callback succès Wave |
| `GET` | `/payments/wave/cancel` | Callback annulation Wave |
| `POST` | `/payments/orange/checkout/booking` | Orange Money — booking |
| `POST` | `/payments/orange/checkout/subscription` | Orange Money — abonnement |
| `POST` | `/payments/orange/notify` | Callback notification OM |
| `GET` | `/payments/orange/return` | Redirect succès OM |
| `GET` | `/payments/orange/cancel` | Redirect annulation OM |
| `GET` | `/payments/orange/status/{pay_token}` | Statut d'une transaction OM |

Détails du flow paiement → voir `docs/PAYMENTS.md`.

---

## 20. Admin CRM

| Méthode | Path | Description |
|---|---|---|
| `GET` | `/admin/crm/overview` **[admin]** | Dashboard chiffres clés |
| `GET` | `/admin/crm/users` **[admin]** | Recherche utilisateurs (paginée, filtrable) |
| `GET` | `/admin/stats/marketplace` **[admin]** | GMV, commissions, wallets, etc. |
| `GET` | `/admin/staff` **[admin]** | Liste staff |
| `POST` | `/admin/staff` **[admin]** | Créer staff |
| `PATCH` | `/admin/staff/{sid}` **[admin]** | Update |
| `DELETE` | `/admin/staff/{sid}` **[admin]** | Supprimer |
| `GET` | `/admin/roles` **[admin]** | Catalogue des rôles |
| `POST` | `/admin/users/{uid}/reset-password` **[admin]** | Reset user password |
| `POST` | `/admin/assisted-register` **[admin]** | Inscription assistée (password temporaire retourné) |
| `GET` | `/admin/fraud-alerts` **[admin]** | Alertes anti-contournement |
| `PATCH` | `/admin/family/babysitters/{bid}/verify` **[admin]** | Vérifier / attribuer Verified+ |

---

## 21. Misc

| Méthode | Path | Description |
|---|---|---|
| `GET` | `/` | Ping (auth-less) |
| `GET` | `/dashboard` | Widgets récap client/prestataire |
| `POST` | `/seed` | (dev) Peuple la DB en idempotent : users, providers, staff, ads, partners |

---

## Format des erreurs

```json
{ "detail": "Message d'erreur en français" }
```

Codes utilisés :
- **400** : validation Pydantic ou règle métier (`Impossible de se bloquer soi-même`, `Un avis a déjà été laissé`, ...)
- **401** : JWT manquant/invalide
- **403** : rôle insuffisant, blocage mutuel, prestataire endetté
- **404** : ressource introuvable (ou masquée par un blocage mutuel)
- **422** : validation body
- **500** : erreur serveur (bug — à rapporter)

## Pagination & limites

La plupart des listes acceptent `limit` (défaut 50, max soft 500). Pas de curseur pour l'instant — filtrer par ville / service pour réduire.

## OpenAPI

Swagger interactif : **`GET /docs`** (FastAPI auto). Schéma OpenAPI JSON : **`GET /openapi.json`**.
