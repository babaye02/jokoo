# Authentification & permissions

## Vue d'ensemble

Jokoo utilise une **authentification JWT stateless** (HS256) signée avec `JWT_SECRET`. Aucune session serveur — le token est envoyé dans le header `Authorization: Bearer <jwt>` à chaque requête.

3 méthodes d'inscription/connexion :

1. **Email + password** classique
2. **Sign in with Apple** (obligatoire iOS, badge Store review)
3. **OTP téléphone** (SMS envoyé — en dev, le code est retourné dans la réponse)

Un **reset de password** est disponible via email (token TTL 60 min).

---

## Flow de connexion

```
POST /api/auth/login   (body: {email, password})
        │
        ▼
   bcrypt.verify()
        │
        ▼
   JWT.sign({sub: user.id}, JWT_SECRET, exp=30 days)
        │
        ▼
   200 {token, user: {...}}
```

Le client stocke le token :
- **Natif** : `expo-secure-store` (Keychain iOS / Keystore Android)
- **Web** : `AsyncStorage` (fallback localStorage)

Tous les appels suivants passent par `frontend/src/api.ts` qui injecte automatiquement le header `Authorization`.

### Vérification côté backend

Toute route protégée utilise `Depends(current_user)` :

```python
@api.get("/bookings")
async def list_bookings(user=Depends(current_user)):
    ...
```

Le middleware `current_user` décode le JWT, vérifie l'expiration, et charge l'utilisateur depuis MongoDB. En cas d'échec → **401**.

Certaines routes acceptent `Depends(optional_user)` — utile pour endpoints publics qui personnalisent selon l'auth (ex. masquer les prestataires bloqués si connecté).

---

## Sign in with Apple

Endpoint : `POST /api/auth/apple`

Body : `{ identity_token, name?, email? }`

Le backend :
1. Décode l'`identity_token` sans vérifier la signature (les JWT Apple utilisent RS256 avec des JWKS rotatifs — implémentation MVP, à durcir en prod).
2. Vérifie que l'audience du token est dans `APPLE_AUDIENCES` (`backend/.env`).
3. Trouve/crée l'utilisateur via `apple_sub`.
4. Retourne un JWT interne.

**IMPORTANT prod** : ajouter la vérification stricte de la signature via les JWKS Apple (voir [Apple docs](https://developer.apple.com/documentation/sign_in_with_apple)). Package recommandé : `python-jose[cryptography]` + fetch de `https://appleid.apple.com/auth/keys`.

---

## OTP téléphone

Endpoint : `POST /api/auth/otp/request` → génère un code 6 chiffres, TTL 5 min.

- **En dev** (`APP_ENV != "production"`) : le code est retourné dans la réponse (`otp_dev_only`).
- **En prod** : envoyer un SMS via Twilio, InfoBip, Wave SMS, etc. (à intégrer).

Endpoint : `POST /api/auth/otp/verify` → vérifie et login.

---

## Reset password

```
POST /api/auth/forgot-password  {email}
   ↓
   Génère un token secrets.token_urlsafe(24), TTL 60 min, stocké dans `password_resets`
   Envoie un email (à intégrer avec Resend/Sendgrid)
   En dev, retourne `dev_token` dans la réponse

POST /api/auth/reset-password  {token, new_password}
   ↓
   Vérifie token unused + non expiré
   Update user.password_hash
   Marque le token used=true
```

---

## Rôles & permissions

### Utilisateurs finaux

| Rôle | Champ | Peut |
|---|---|---|
| **Client** | `role="client"` | Rechercher, réserver, chatter, noter, favoris |
| **Prestataire** | `role="prestataire"` | Tout ci-dessus + créer profil provider, prestations, dashboard, wallet |

### Staff (backoffice CRM)

Un utilisateur peut avoir `staff_role` ∈ :

| Rôle | Périmètre |
|---|---|
| `super_admin` | Tous droits, y compris création staff, gestion legal |
| `admin` | Gestion contenu (ads, partners, promos, sponsorships, reports), reset password users |
| `marketing` | Ads, campaigns, partners, promos |
| `support` | Reports, users, chat admin, reset password |
| `operator` | Modération operationnelle : reports, verification Family |
| `technical` | Lecture stats + fraud alerts (pas d'écriture) |

Le champ `is_admin=true` (booléen legacy) accorde le pack complet — utilisé pour `admin@jokoo.sn`.

### Guards backend

```python
def require_admin(user: dict) -> None:
    if not (user.get("is_admin") or user.get("staff_role") in {"super_admin", "admin"}):
        raise HTTPException(403, "Réservé aux administrateurs")

LEGAL_STAFF_ROLES = {"super_admin", "admin", "support"}
def _is_legal_admin(user: dict) -> bool:
    return bool(user.get("is_admin") or user.get("staff_role") in LEGAL_STAFF_ROLES)
```

Certains endpoints ont des règles fines :

- `POST /api/family/bookings/{bid}/report` → seule la baby-sitter du booking (`b.babysitter_user_id == user.id`)
- `POST /api/reviews` → seul le client du booking peut noter
- `PATCH /api/bookings/{bid}` → transitions autorisées selon rôle et statut source

### Guards frontend

Les écrans admin (`app/admin/**`) vérifient `user.is_admin || user.staff_role` dans `AuthContext` et redirigent sinon.

---

## Blocages mutuels

Un utilisateur peut en bloquer un autre :

```
POST /api/users/{peer_id}/block
DELETE /api/users/{peer_id}/block
GET /api/users/me/blocked
```

Les helpers `_blocked_ids(user_id)` et `_is_pair_blocked(a, b)` sont utilisés partout où c'est pertinent :

- Recherche providers / rides / babysitters → exclusion bidirectionnelle
- Détail (`/providers/{id}`, `/rides/{id}`, `/family/babysitters/{id}`) → **404** si pair bloqué
- Création de booking / rideBooking / familyBooking / parcel → **403**
- Chat conversations / messages → conversation masquée, `POST` bloqué en 403

Ce comportement est **bidirectionnel** : si A bloque B, B ne voit plus A non plus.

---

## Sécurité — checklist prod

- [ ] `JWT_SECRET` généré avec 64+ bytes aléatoires (`openssl rand -base64 48`)
- [ ] `MONGO_URL` avec auth (`mongodb+srv://user:pass@...`) et TLS
- [ ] `APP_ENV="production"` → désactive les tokens en clair dans les réponses (`otp_dev_only`, `dev_token`)
- [ ] Vérification stricte des signatures Apple JWT
- [ ] Rate-limiting sur `/auth/login`, `/auth/forgot-password`, `/auth/otp/request` (recommandé : `slowapi`)
- [ ] SMS/email réels branchés
- [ ] CORS restreint au domaine app + website (voir `server.py`)
- [ ] `HTTPS` obligatoire côté reverse-proxy (Nginx/Caddy/Cloudflare)
- [ ] Backups Mongo quotidiens (voir `scripts/db_dump.sh`)

---

## Récupération d'un compte de test

Voir `memory/test_credentials.md` — comptes seed :

- Super Admin : `admin@jokoo.sn` / `Admin1234!`
- Client : `client@jokoo.sn` / `Passw0rd!`
- Prestataire : `pro@jokoo.sn` / `Passw0rd!`
- Conducteur : `chauffeur@jokoo.sn` / `Driver1234!`
- Baby-sitter : `aisha.family@jokoo.sn` / `Family1234!`
- Staff : `marketing@jokoo.sn`, `support@jokoo.sn`, `operator@jokoo.sn`, `tech@jokoo.sn` — password commun `Staff1234!`
