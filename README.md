# Jokoo — Marketplace mobile sénégalaise

> Marketplace mobile premium mettant en relation clients et prestataires qualifiés au Sénégal, avec covoiturage, livraison de colis longue distance, garde d'enfants (Jokoo Family), paiements Stripe/Wave/Orange Money, chat temps réel, wallet & commissions, admin CRM complet.

**Repo produit trois applications** :

| App | Techno | Rôle | Port dev |
|---|---|---|---|
| `backend/` | FastAPI + MongoDB (Motor async) | API REST `/api/*` — 142 endpoints | `8001` |
| `frontend/` | Expo Router (React Native + web) | App mobile iOS/Android + web preview | `3000` |
| `website/` | Next.js 15 (App Router + Tailwind) | Site marketing `jokooservices.com` | `3001` |

---

## Table des matières

- [Quick start](#quick-start)
- [Structure du repo](#structure-du-repo)
- [Documentation détaillée](#documentation-détaillée)
- [Variables d'environnement](#variables-denvironnement)
- [Comptes de test seed](#comptes-de-test-seed)
- [Scripts utilitaires](#scripts-utilitaires)
- [Dépendances Emergent à connaître](#dépendances-emergent-à-connaître)
- [Contribuer](#contribuer)

---

## Quick start

### Prérequis

- **Node.js** ≥ 20 LTS
- **Yarn** ≥ 1.22 (le repo utilise `yarn@1.22.22` — voir `packageManager`)
- **Python** ≥ 3.11
- **MongoDB** ≥ 6.0 en local (ou une URL Mongo Atlas)
- **Expo CLI** (inclus via `npx expo`)
- (Optionnel) **EAS CLI** pour builds iOS/Android : `npm i -g eas-cli`

### 1. Cloner et installer

```bash
git clone https://github.com/<votre-org>/jokoo.git
cd jokoo

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # puis éditez les valeurs

# Frontend (Expo)
cd ../frontend
yarn install
cp .env.example .env

# Website (Next.js)
cd ../website
yarn install
cp .env.example .env.local
```

### 2. Démarrer MongoDB

```bash
# macOS (brew)
brew services start mongodb-community

# Linux / Docker
docker run -d -p 27017:27017 --name jokoo-mongo mongo:7
```

### 3. Lancer les 3 services

```bash
# Terminal 1 — Backend
cd backend && source .venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Terminal 2 — Frontend Expo
cd frontend && yarn start

# Terminal 3 — Website
cd website && yarn dev
```

### 4. Seed initial (users, providers, ads, staff, prestations)

```bash
curl -X POST http://localhost:8001/api/seed
# Idempotent — peut être re-lancé sans doublons.
```

### 5. Ouvrir l'app

- API docs Swagger : http://localhost:8001/docs
- Website : http://localhost:3001
- Expo : scanner le QR code avec Expo Go, ou touche `w` pour la version web.

---

## Structure du repo

```
jokoo/
├── backend/                    # API FastAPI
│   ├── server.py               # Monolithe applicatif (~4700 lignes, 142 endpoints)
│   ├── payments_local.py       # Wrappers Wave & Orange Money
│   ├── seed_legal_content.py   # Contenus légaux (CGU, Privacy, etc.)
│   ├── requirements.txt        # Dépendances Python (pinned versions)
│   ├── pytest.ini
│   ├── tests/                  # Suite pytest (validée itérativement)
│   └── .env.example
│
├── frontend/                   # App Expo (React Native + web)
│   ├── app/                    # Routes file-based (expo-router)
│   │   ├── (tabs)/             # Onglets principaux : home, search, chat, notifs, profile
│   │   ├── admin/              # Backoffice CRM
│   │   ├── auth/               # Login, register, forgot/reset password, OTP, Apple
│   │   ├── booking/            # Détail, paiement, review, cancel, success
│   │   ├── chat/               # Conversations & messages
│   │   ├── family/             # Jokoo Family : baby-sitters, bookings, SOS, carnet
│   │   ├── legal/              # Legal Center (CGU, Privacy, etc.)
│   │   ├── mobility/           # Covoiturage & Livraison
│   │   ├── onboarding/         # 5 écrans animés + splash
│   │   ├── profile/            # Réglages, sécurité, paiements, aide
│   │   └── ...
│   ├── assets/                 # Images, fonts, icônes
│   ├── constants/              # Couleurs, spacing, typographie
│   ├── src/
│   │   ├── api.ts              # Client HTTP centralisé
│   │   ├── auth.tsx            # Context d'authentification JWT
│   │   ├── components/         # ActionSheet, Btn, Card, Txt, etc.
│   │   └── utils/
│   ├── app.json                # Config Expo (permissions iOS/Android)
│   ├── metro.config.js         # NE PAS ÉDITER — bundler
│   ├── package.json
│   └── .env.example
│
├── website/                    # Site marketing Next.js
│   ├── app/                    # App Router
│   ├── public/downloads/       # APK téléchargeable
│   ├── tailwind.config.js
│   ├── package.json
│   └── .env.example
│
├── docs/                       # ← DOCUMENTATION COMPLÈTE
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DATABASE.md
│   ├── AUTH.md
│   ├── PAYMENTS.md
│   ├── DEPLOYMENT.md
│   └── EMERGENT_DEPENDENCIES.md
│
├── scripts/                    # Dump / restore / seed helpers
│   ├── db_dump.sh
│   ├── db_restore.sh
│   └── seed.sh
│
├── memory/test_credentials.md  # Comptes de test (ne pas commiter en prod)
├── test_result.md              # Journal de tests par itération
├── test_reports/               # Rapports pytest JSON par itération
└── README.md                   # Ce fichier
```

---

## Documentation détaillée

Toute la documentation vit dans `docs/` :

| Fichier | Contenu |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architecture globale, arborescence, choix techniques, patterns |
| [`docs/API.md`](docs/API.md) | Référence complète des 142 endpoints (auth, params, réponses) |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Schéma MongoDB (30 collections), index, relations, dump/restore |
| [`docs/AUTH.md`](docs/AUTH.md) | JWT, sessions, rôles (client, prestataire, staff, super_admin), permissions |
| [`docs/PAYMENTS.md`](docs/PAYMENTS.md) | Stripe / Wave / Orange Money, commissions, wallet, escrow, notifications |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Déploiement autonome frontend / backend / DB / site / builds iOS & Android |
| [`docs/EMERGENT_DEPENDENCIES.md`](docs/EMERGENT_DEPENDENCIES.md) | **Inventaire précis des dépendances Emergent + procédure de suppression** |

---

## Variables d'environnement

Chaque service a son propre `.env.example` :

- [`backend/.env.example`](backend/.env.example)
- [`frontend/.env.example`](frontend/.env.example)
- [`website/.env.example`](website/.env.example)

**Ne jamais commiter les vraies valeurs** — le `.gitignore` racine exclut déjà `.env`, `.env.*`, `*.env`.

Voir la section "Variables" de `docs/DEPLOYMENT.md` pour l'explication de chaque variable.

---

## Comptes de test seed

Après `POST /api/seed`, ces comptes existent (voir `memory/test_credentials.md`) :

| Rôle | Email | Password |
|---|---|---|
| Super Admin | `admin@jokoo.sn` | `Admin1234!` |
| Client | `client@jokoo.sn` | `Passw0rd!` |
| Prestataire | `pro@jokoo.sn` | `Passw0rd!` |
| Conducteur (covoit) | `chauffeur@jokoo.sn` | `Driver1234!` |
| Baby-sitter | `aisha.family@jokoo.sn` | `Family1234!` |
| Staff (marketing, support, tech, operator) | `marketing@jokoo.sn`, etc. | `Staff1234!` |

---

## Scripts utilitaires

| Script | Rôle |
|---|---|
| `scripts/db_dump.sh` | `mongodump` de la DB `jokoo_db` vers `./dumps/YYYY-MM-DD/` |
| `scripts/db_restore.sh <dump_dir>` | `mongorestore` depuis un dossier |
| `scripts/seed.sh` | Lance `POST /api/seed` sur `$BACKEND_URL` (défaut `http://localhost:8001`) |

---

## Dépendances Emergent à connaître

Ce projet a été développé sur la plateforme Emergent et contient quelques éléments spécifiques à supprimer pour un déploiement autonome :

1. **`emergentintegrations==0.2.0`** dans `backend/requirements.txt` → wrapper Stripe. **Remplaçable par `stripe==11.x` officiel** (5 minutes de refactor).
2. **`STRIPE_API_KEY=sk_test_emergent`** dans `backend/.env` → remplacer par une **vraie clé Stripe** (`sk_test_...` ou `sk_live_...` depuis dashboard.stripe.com).
3. **`litellm` depuis un customer-asset Emergent** dans `requirements.txt` → remplacer par `litellm` officiel PyPI si vous en avez besoin. **Jokoo n'en dépend PAS aujourd'hui** (dépendance transitive de `emergentintegrations`).
4. **`EXPO_PACKAGER_PROXY_URL`, `EXPO_PACKAGER_HOSTNAME`, `EXPO_TUNNEL_SUBDOMAIN`** dans `frontend/.env` → variables du preview Emergent. **À supprimer** hors Emergent, à remplacer par `EXPO_PUBLIC_BACKEND_URL=<votre-url-backend>`.
5. **URLs `*.preview.emergentagent.com`** dans le CORS backend et Apple audience → à mettre à jour avec vos propres domaines.
6. **`.emergent/`** — dossier de config plateforme, peut être supprimé après export.

Détails complets et procédure pas-à-pas : **[`docs/EMERGENT_DEPENDENCIES.md`](docs/EMERGENT_DEPENDENCIES.md)**.

---

## Contribuer

- Convention de commit libre (le repo utilise des `auto-commit` Emergent).
- Tests backend : `cd backend && pytest`
- Lint frontend : `cd frontend && yarn lint`
- Ne pas éditer `metro.config.js` ni les URLs dans `.env` sans savoir ce que vous faites.

## Licence

Propriétaire — Jokoo Services SAS. Voir `docs/legal/` pour CGU / Privacy / Mentions Légales.
