# Dépendances Emergent — Inventaire & procédure de suppression

Ce document liste **tout ce qui est spécifique à la plateforme Emergent** dans le repo Jokoo, et explique comment le remplacer pour obtenir un projet **100% autonome**.

**Verdict global** : Jokoo n'a **AUCUNE dépendance critique** à Emergent. Toutes les intégrations Emergent utilisées sont **remplaçables en 1-2h de refactor**.

---

## 1. `emergentintegrations` (Python) — 🔴 À remplacer

### Où c'est utilisé

Un seul import dans `backend/server.py` :

```python
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionResponse,
    CheckoutSessionRequest, CheckoutStatusResponse,
)
```

Ce wrapper simplifie l'usage de Stripe Checkout.

### Comment le remplacer

Utiliser le SDK Stripe officiel :

```bash
cd backend
pip uninstall emergentintegrations
pip install stripe==11.4.1
pip freeze > requirements.txt
```

Puis dans `server.py`, voir la section "Migration" de `docs/PAYMENTS.md` — remplacer les 3-4 appels par `stripe.checkout.Session.create(...)` et `stripe.checkout.Session.retrieve(...)`.

Effort : **~2 h** + tests.

**Note importante** : `emergentintegrations` dépend transitivement de `litellm`, qui pointe vers un customer-asset Emergent :

```
litellm @ https://customer-assets.emergentagent.com/internal-asset/library/litellm-1.80.0-py3-none-any.whl#...
```

Après désinstallation d'`emergentintegrations`, retirer aussi cette ligne. Si vous voulez garder `litellm` pour un usage LLM futur : `pip install litellm==1.80.0` depuis PyPI officiel.

---

## 2. `STRIPE_API_KEY=sk_test_emergent` — 🔴 À remplacer

### Où c'est utilisé

`backend/.env` :

```env
STRIPE_API_KEY="sk_test_emergent"
```

C'est une **valeur factice** fournie par Emergent qui pointe vers un compte Stripe partagé pour la démo. **Elle ne fonctionne pas en dehors d'Emergent.**

### Comment la remplacer

1. Créer un compte Stripe : https://stripe.com
2. Dashboard → Developers → API keys → copier la **secret key** :
   - Test : `sk_test_51...`
   - Prod : `sk_live_51...`
3. Remplacer dans `backend/.env` (jamais dans le code source).
4. Redémarrer le backend.

---

## 3. `litellm` customer-asset — 🟡 Optionnel

Voir §1. Retirer la ligne suivante de `requirements.txt` :

```
litellm @ https://customer-assets.emergentagent.com/internal-asset/library/litellm-1.80.0-py3-none-any.whl#sha256=adf398c513273de9341f61822296c6b2145f7f2dc4a69daf3ac04829f5bde3f8
```

Aucun code Jokoo n'utilise `litellm` directement — c'est une dépendance transitive.

---

## 4. Variables preview Expo — 🟡 À nettoyer

### Où c'est utilisé

`frontend/.env` :

```env
EXPO_TUNNEL_SUBDOMAIN=jokoo-mobile-dev
EXPO_PACKAGER_HOSTNAME=https://jokoo-mobile-dev.preview.emergentagent.com
EXPO_PACKAGER_PROXY_URL=https://jokoo-mobile-dev.preview.emergentagent.com
EXPO_PUBLIC_BACKEND_URL=https://jokoo-mobile-dev.preview.emergentagent.com
```

Les 3 premières sont utilisées **exclusivement par le preview web d'Emergent**. Elles ne servent à rien en dev local ni en prod.

Seule `EXPO_PUBLIC_BACKEND_URL` doit être conservée mais **pointée vers votre backend** :

```env
EXPO_PUBLIC_BACKEND_URL=https://api.jokooservices.com    # prod
# ou
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001            # dev
```

### Comment nettoyer

```bash
cd frontend
cp .env.example .env
# Éditer .env pour ne garder que EXPO_PUBLIC_BACKEND_URL + variables de perf.
```

---

## 5. URLs `*.preview.emergentagent.com` dans le code — 🟡 À remplacer

### Où c'est utilisé

Grep du repo :

```bash
grep -r "preview.emergentagent.com" --include="*.py" --include="*.ts*" --include="*.json" .
```

Occurrences trouvées :

| Fichier | Ligne | Rôle |
|---|---|---|
| `backend/server.py` | `origins = [ ..., "https://868fd53e-....preview.emergentagent.com", ... ]` | CORS |
| `backend/.env` | `APP_URL="https://jokoo-mobile-dev.preview.emergentagent.com"` | Base URL pour redirections Stripe/Wave/OM |
| `frontend/.env` | 3 vars EXPO_* | Preview only |
| `website/.env` | `NEXT_PUBLIC_API_URL=https://jokoo-mobile-dev.preview.emergentagent.com/api` | Fetch legal docs |
| `memory/test_credentials.md` | doc | Non critique |

### Comment remplacer

1. **Backend CORS** (`server.py`) — remplacer la liste :

```python
origins = [
    "https://jokooservices.com",
    "https://www.jokooservices.com",
    "https://app.jokooservices.com",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:8081",   # Expo web dev
]
```

2. **Backend `.env`** : `APP_URL="https://api.jokooservices.com"` (ou `http://localhost:8001` en dev).

3. **Frontend `.env`** : `EXPO_PUBLIC_BACKEND_URL="https://api.jokooservices.com"`.

4. **Website `.env.local`** : `NEXT_PUBLIC_API_URL="https://api.jokooservices.com/api"`.

---

## 6. `APPLE_AUDIENCES` — 🟡 À adapter

`backend/.env` :

```env
APPLE_AUDIENCES="com.emergent.jokoomobiledev.b94ufz,host.exp.Exponent"
```

`com.emergent.jokoomobiledev.b94ufz` est le bundle ID utilisé par Emergent pendant le développement Expo Go. Pour vos builds EAS :

```env
APPLE_AUDIENCES="com.jokoo.services,host.exp.Exponent"
```

Adapter aussi dans `frontend/app.json` :

```json
"ios": {
  "bundleIdentifier": "com.jokoo.services",
  "supportsTablet": true
}
```

---

## 7. Dossier `.emergent/` — 🟡 Optionnel

`.emergent/` contient :

- `emergent.yml` : config du preview Emergent
- `cron` : cron jobs internes Emergent

Après export du repo, **vous pouvez supprimer ce dossier** :

```bash
rm -rf .emergent
```

Aucun impact sur le fonctionnement du projet.

---

## 8. `test_reports/` et `memory/` — 🟢 Neutres

- `test_reports/iteration_*.json` : rapports pytest historiques. Utiles pour l'audit. Peuvent être conservés ou supprimés.
- `memory/test_credentials.md` : comptes de test seed. **À ne pas commiter en prod** (déjà exclu par `.gitignore`).

---

## 9. Points **NON dépendants** d'Emergent

Pour éviter les malentendus, ces éléments **n'ont AUCUN lien** avec Emergent :

- FastAPI, Pydantic, Motor, MongoDB, bcrypt, jose (JWT) — packages open-source PyPI standards.
- Expo, expo-router, react-native, react-native-reanimated, expo-secure-store — packages open-source Expo standards (Expo est un projet indépendant, pas Emergent).
- Next.js, Tailwind, react-markdown — standards.
- Wave, Orange Money — providers directs (Wave Business API + Orange Sonatel Developer), pas d'intermédiaire Emergent.
- **JWT_SECRET** — vous en générez un neuf, aucun lien avec Emergent.
- Tests pytest — 100% locaux.

---

## 10. Procédure complète de "désomergentation"

### Script bash pour tout faire d'un coup

```bash
#!/bin/bash
set -e

echo "→ 1. Retirer emergentintegrations et litellm customer-asset"
cd backend
pip uninstall -y emergentintegrations || true
sed -i '/^emergentintegrations==/d' requirements.txt
sed -i '/^litellm @ https:\/\/customer-assets\.emergentagent\.com/d' requirements.txt
pip install stripe==11.4.1
pip freeze > requirements.txt
cd ..

echo "→ 2. Supprimer .emergent/"
rm -rf .emergent

echo "→ 3. Copier les .env.example vers .env (à éditer manuellement)"
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp website/.env.example website/.env.local

echo "→ 4. Reviewer les URLs dans server.py (CORS + Apple audiences)"
grep -n "preview.emergentagent.com\|emergent" backend/server.py

echo "→ 5. Refactor Stripe (voir docs/PAYMENTS.md §Migration)"
# À faire manuellement — remplacer les appels StripeCheckout par stripe.checkout.Session

echo "✅ Terminé. Prochaines étapes manuelles :"
echo "   - Remplir les .env avec vos vraies clés (Stripe, Mongo, JWT_SECRET, etc.)"
echo "   - Refactorer les 4 appels Stripe dans server.py (~2h)"
echo "   - Tester : cd backend && pytest"
echo "   - Push GitHub : git commit + git push"
```

### Effort estimé

| Tâche | Durée |
|---|---|
| Nettoyer `.env` + URLs CORS | 15 min |
| Retirer `emergentintegrations` + `litellm` customer-asset | 15 min |
| Refactor 4 appels Stripe | 1-2 h |
| Tester end-to-end (login, booking, paiement Stripe test) | 1 h |
| **Total** | **~3 h** |

---

## 11. Autres services Emergent-managed **non utilisés** par Jokoo

Pour information — Jokoo n'utilise **PAS** ces services Emergent, donc rien à faire :

- ❌ **Emergent LLM Key** (`EMERGENT_LLM_KEY`) — Jokoo n'a pas d'intégration LLM.
- ❌ **Emergent-managed Google Auth** — Jokoo utilise Sign in with Apple + email/password + OTP téléphone.
- ❌ **Emergent-managed Resend** — Jokoo n'a pas d'envoi d'emails en production (à brancher directement Resend si besoin, voir `backend/.env.example`).
- ❌ **Emergent-managed Push Notifications** — Jokoo utilise `push_tokens` en base + Expo Push Service natif (à activer via `EXPO_ACCESS_TOKEN`, non branché aujourd'hui).

---

## 12. FAQ

**Q : Puis-je continuer à utiliser `emergentintegrations` en production ?**
R : Techniquement oui **tant que la clé `sk_test_emergent` fonctionne**. Mais ce n'est pas un compte Stripe à vous — les paiements vont sur un compte partagé Emergent. **Refactor obligatoire pour la prod.**

**Q : Le seed (`POST /api/seed`) crée des comptes `@jokoo.sn`. Faut-il les garder en prod ?**
R : Non — désactivez le seed en prod ou renommez `admin@jokoo.sn` en `admin@jokooservices.com` avec un vrai mot de passe fort.

**Q : Comment sortir de la plateforme Emergent ?**
R :
1. Bouton **"Save to GitHub"** dans l'IDE Emergent → push tout le repo sur votre compte GitHub.
2. Cloner le repo sur votre machine : `git clone git@github.com:votre-org/jokoo.git`.
3. Suivre le Quick Start du `README.md`.
4. Suivre ce document pour retirer les dernières dépendances Emergent.
5. Déployer selon `docs/DEPLOYMENT.md`.

**Q : Je conserve des fichiers `test_reports/iteration_*.json`. Utiles ?**
R : Ils documentent 22+ itérations de tests pytest. Utiles pour un audit de qualité, mais dispensables. Vous pouvez les archiver ou supprimer.
