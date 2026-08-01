# Déploiement

## Vue d'ensemble des environnements

| Composant | Techno | Recommandé |
|---|---|---|
| **Backend API** | FastAPI (Python 3.11) | Fly.io, Railway, Render, ou VPS + Nginx |
| **Frontend mobile** | Expo (React Native) | EAS Build → App Store + Play Store |
| **Frontend web preview** | Metro bundler | Vercel (via Expo web export) ou même serveur que le backend |
| **Website marketing** | Next.js 15 | **Vercel** (idéal) ou Netlify |
| **Base de données** | MongoDB 7 | **MongoDB Atlas** (managé) |

---

## 1. Backend — FastAPI

### Option A : Fly.io (recommandé)

```bash
cd backend
fly launch    # génère Dockerfile + fly.toml
fly secrets set \
  MONGO_URL="mongodb+srv://..." \
  JWT_SECRET="$(openssl rand -base64 48)" \
  STRIPE_API_KEY="sk_live_..." \
  APP_URL="https://api.jokooservices.com" \
  APP_ENV="production" \
  APPLE_AUDIENCES="com.jokoo.services,host.exp.Exponent"
fly deploy
```

Fichier `Dockerfile` à créer :

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8001
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT}
```

### Option B : Railway / Render

- Créer un projet, connecter le repo GitHub.
- Root directory : `backend/`.
- Start command : `uvicorn server:app --host 0.0.0.0 --port $PORT`.
- Ajouter les variables d'env (voir `backend/.env.example`).
- Redémarre auto à chaque push.

### Option C : VPS + Nginx + supervisord

```nginx
# /etc/nginx/sites-available/jokoo-api
server {
    listen 443 ssl;
    server_name api.jokooservices.com;

    ssl_certificate /etc/letsencrypt/live/api.jokooservices.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.jokooservices.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`/etc/supervisor/conf.d/jokoo-backend.conf` :

```ini
[program:jokoo-backend]
command=/opt/jokoo/backend/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
directory=/opt/jokoo/backend
autostart=true
autorestart=true
stderr_logfile=/var/log/jokoo-backend.err.log
stdout_logfile=/var/log/jokoo-backend.out.log
environment=APP_ENV="production"
```

### CORS

Éditer la liste des origines autorisées dans `server.py` (`origins = [...]`) pour ajouter :

- `https://jokooservices.com`
- `https://app.jokooservices.com`
- `https://api.jokooservices.com` (si servi sur même domaine)
- Retirer les URLs `*.preview.emergentagent.com`.

---

## 2. Frontend mobile — Expo + EAS Build

### 2.1 Prérequis

```bash
npm i -g eas-cli
cd frontend
eas login          # avec votre compte Expo (créez-en un gratuit)
eas init           # lie le projet
```

### 2.2 Configurer `frontend/app.json`

Vérifier :

- `expo.name` : `Jokoo`
- `expo.slug` : `jokoo`
- `expo.ios.bundleIdentifier` : `com.jokoo.services` (ou autre)
- `expo.android.package` : `com.jokoo.services`
- Permissions listées :
  - iOS `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`, `NSMicrophoneUsageDescription`
  - Android `CAMERA`, `READ_EXTERNAL_STORAGE`, `ACCESS_FINE_LOCATION`, etc.

### 2.3 Variables d'environnement

Créez `frontend/eas.json` :

```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_BACKEND_URL": "https://api-staging.jokooservices.com"
      }
    },
    "preview": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_BACKEND_URL": "https://api-staging.jokooservices.com"
      }
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_BACKEND_URL": "https://api.jokooservices.com"
      }
    }
  },
  "submit": { "production": {} }
}
```

### 2.4 Builds

```bash
# Android APK preview (interne, à distribuer par lien)
eas build --platform android --profile preview

# Android AAB production (pour Play Store)
eas build --platform android --profile production

# iOS TestFlight
eas build --platform ios --profile production
# → nécessite un compte Apple Developer (99 $/an)

# Soumission stores
eas submit --platform android --latest
eas submit --platform ios --latest
```

---

## 3. Website Next.js — Vercel

### 3.1 One-click (recommandé)

1. Push le repo sur GitHub.
2. Sur https://vercel.com/new, importer le repo.
3. **Root Directory** : `website`
4. **Build Command** : `yarn build` (défaut)
5. **Output Directory** : `.next` (défaut)
6. Ajouter les variables d'env :
   - `NEXT_PUBLIC_API_URL=https://api.jokooservices.com/api`
   - `NEXT_PUBLIC_SITE_URL=https://jokooservices.com`
   - `NEXT_PUBLIC_APK_URL=/downloads/jokoo-latest.apk` (ou URL absolue)
7. Deploy.

### 3.2 Custom domain

Dans Vercel → Settings → Domains → ajouter `jokooservices.com` et `www.jokooservices.com`. Configurez les DNS chez votre registrar :

```
A     @      76.76.21.21
CNAME www    cname.vercel-dns.com.
```

### 3.3 APK à télécharger

Placer l'APK dans `website/public/downloads/jokoo-latest.apk`. Il sera servi sur `/downloads/jokoo-latest.apk`.

---

## 4. Base de données — MongoDB Atlas

### 4.1 Créer un cluster

1. https://cloud.mongodb.com → New Project → New Cluster (M0 gratuit pour dev, M10+ pour prod).
2. Choisir une région proche (Frankfurt / Paris).
3. Créer un utilisateur (username + password).
4. Ajouter les IPs (0.0.0.0/0 pour test, restreindre en prod).

### 4.2 Récupérer l'URI

```
mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?retryWrites=true&w=majority
```

Copiez dans `MONGO_URL` du backend.

### 4.3 Créer les index

```bash
mongosh "mongodb+srv://..." /path/to/db_indexes.js
```

Voir `docs/DATABASE.md#index-recommandés` pour le script complet.

### 4.4 Migrer depuis local

```bash
# 1. Dump local
mongodump --uri "mongodb://localhost:27017/jokoo_db" --out ./dumps/prod-migration

# 2. Restore sur Atlas
mongorestore --uri "mongodb+srv://..." --nsFrom "jokoo_db.*" --nsTo "jokoo_db.*" ./dumps/prod-migration
```

### 4.5 Backups

Atlas M10+ inclut des backups automatiques. Pour dumps manuels supplémentaires :

```bash
./scripts/db_dump.sh    # utilise $MONGO_URL de l'environnement courant
```

Idéalement, planifiez un cron GitHub Actions quotidien qui pousse le dump vers S3.

---

## 5. DNS & domaines

Recommandation :

| Sous-domaine | Cible |
|---|---|
| `jokooservices.com` | Vercel (website) |
| `www.jokooservices.com` | Vercel |
| `api.jokooservices.com` | Backend (Fly/Railway/VPS) |
| `admin.jokooservices.com` | (optionnel) Frontend Expo web export |

---

## 6. Publier sur les stores

### 6.1 Google Play

1. Compte Google Play Console (25 $ one-time).
2. Créer une app, remplir la fiche (screenshots, description, catégorie).
3. Uploader l'AAB généré via `eas build`.
4. Passer les tests internes → alpha → production.

### 6.2 Apple App Store

1. Compte Apple Developer (99 $/an).
2. Créer un App ID sur developer.apple.com (bundle `com.jokoo.services`).
3. Créer une entrée dans App Store Connect.
4. Uploader la build via `eas submit --platform ios`.
5. Passer par TestFlight → Review Apple (~2-5 jours).

**⚠️ Sign in with Apple** est **obligatoire** si vous acceptez d'autres providers OAuth. Déjà implémenté.

### 6.3 Permissions requises pour la review

Voir `frontend/app.json`. Les descriptions iOS doivent expliquer le bénéfice utilisateur, ≤ 10 mots. Exemples fournis :

- Camera : "Prendre des photos de votre profil et de vos missions"
- Photo Library : "Ajouter des photos à votre profil ou à un message"
- Location : "Trouver des prestataires près de chez vous"
- Microphone : "Enregistrer des messages vocaux dans le chat"

---

## 7. Monitoring & logs

- **Backend** : logs Uvicorn (stdout). Router vers Datadog / Papertrail / Grafana Loki en prod.
- **Frontend** : intégrer Sentry (`@sentry/react-native`) — non branché aujourd'hui.
- **Uptime** : UptimeRobot / BetterStack sur `/api/` (ping).

---

## 8. Checklist go-live

- [ ] `.env` prod remplis (backend + frontend + website)
- [ ] `JWT_SECRET` régénéré (jamais celui de dev)
- [ ] `STRIPE_API_KEY` en `sk_live_...` + webhook Stripe configuré vers `<APP_URL>/api/payments/stripe/webhook` (à implémenter si besoin)
- [ ] Wave + OM clés récupérées (si activation)
- [ ] MongoDB Atlas backup activé
- [ ] `POST /api/seed` désactivé ou protégé en prod (aujourd'hui non protégé — à réserver aux staff)
- [ ] Rate limiter posé sur `/auth/*`
- [ ] SSL / HTTPS actif partout
- [ ] Domaines DNS pointés
- [ ] Sign in with Apple test réussi (Expo Go + build EAS)
- [ ] Notifications push branchées si souhaité (Expo Access Token)
- [ ] Legal Center rempli (CGU, Privacy, Mentions légales) via l'admin
- [ ] Comptes admin réels créés + comptes seed retirés (`admin@jokoo.sn` → renommer)
- [ ] Fichier `memory/test_credentials.md` non commité en prod (déjà exclu du .gitignore)

---

## 9. CI/CD suggérée (GitHub Actions)

```yaml
# .github/workflows/backend.yml
name: Backend CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install -r backend/requirements.txt
      - run: cd backend && pytest
```

```yaml
# .github/workflows/website.yml
name: Website Preview
on: pull_request
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: cd website && yarn install && yarn build
```

Le déploiement Vercel se fera automatiquement à chaque push sur `main` si vous connectez le repo.
