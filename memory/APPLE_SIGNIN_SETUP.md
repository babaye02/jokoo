# 🍎 Sign in with Apple — Configuration Jokoo

## Ce qui est déjà fait ✅

**Backend** — `POST /api/auth/apple`
- Vérifie l'identity_token contre les clés publiques Apple (JWKS)
- Idempotent : identifie l'utilisateur par `apple_sub` (stable), avec fallback email si l'utilisateur existe déjà
- Persiste `name` + `email` uniquement au **premier** sign-in (Apple ne les renvoie plus après)
- Retourne le même JWT `{token, user}` que `/auth/login`

**Frontend**
- Composant `<AppleSignInButton />` monté sur `/login` et `/register`
- iOS 13+ : affiche le bouton natif officiel Apple (obligatoire App Store)
- Android : le bouton est **masqué automatiquement** (Apple Sign-In non disponible)
- Web : bouton stylisé avec message "Bientôt disponible" jusqu'à ajout du Service ID

**app.json**
- `expo.ios.usesAppleSignIn: true` ✅
- `expo.plugins` inclut `expo-apple-authentication` ✅
- Bundle ID : `com.emergent.jokoomobiledev.b94ufz`

## Ce qu'il vous reste à faire 🔨

### 1. Créer un compte Apple Developer (99 $/an)
👉 https://developer.apple.com/programs/enroll/

### 2. Activer "Sign in with Apple" sur votre App ID
- Ouvrez https://developer.apple.com/account/resources/identifiers
- Sélectionnez votre App ID (`com.emergent.jokoomobiledev.b94ufz`)
- Cochez **Sign In with Apple** dans la liste des capabilities
- Enregistrez

### 3. (Web/Android fallback uniquement) — créer un Services ID
Si vous voulez la connexion Apple aussi sur le web / Android :
- Créez un **Services ID** dans Identifiers > + > Services ID
- Bundle : `com.emergent.jokoomobiledev.b94ufz.web` (par exemple)
- Cochez Sign In with Apple > Configure
- Renseignez les Return URLs : `https://<votre-app>.preview.emergentagent.com/api/auth/apple/callback`
- Créez ensuite une **Sign in with Apple Private Key** (`.p8`) dans Keys

### 4. Renseigner les variables d'environnement
Dans `/app/backend/.env` (déjà présent) :
```
APPLE_AUDIENCES="com.emergent.jokoomobiledev.b94ufz,host.exp.Exponent"
```

Pour le fallback web (à ajouter plus tard) :
```
APPLE_SERVICES_ID="com.emergent.jokoomobiledev.b94ufz.web"
APPLE_TEAM_ID="XXXXXXXXXX"           # 10 chars, visible sur developer.apple.com
APPLE_KEY_ID="XXXXXXXXXX"            # 10 chars, ID de la clé .p8
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

### 5. Générer un build iOS de développement
⚠️ Le bouton Apple **ne fonctionne pas dans Expo Go** — il faut un build natif.
- Depuis Emergent : cliquez **Publish** → *Deploy your app* → *Generate iOS build*
- Compte Apple Developer requis pour la signature du build
- Testez sur un iPhone réel via TestFlight

## Résumé du flow utilisateur

1. Utilisateur ouvre `/login` sur iPhone → voit "Continuer avec Apple"
2. Il touche le bouton → sheet native Apple ID (Face ID / Touch ID)
3. iOS renvoie un `identityToken` + optionnellement `email` + `fullName`
4. L'app POST sur `/api/auth/apple`
5. Backend vérifie le token contre Apple JWKS, crée ou retrouve l'utilisateur
6. Backend retourne un JWT Jokoo standard → l'utilisateur est connecté ✅

Aucun mot de passe stocké, aucun email obligatoire (Apple peut utiliser Private Relay).

## Test rapide sans compte Apple

L'endpoint est déjà exposé. Testez avec un faux token :
```bash
curl -X POST https://<votre-url>/api/auth/apple \
  -H "Content-Type: application/json" \
  -d '{"identity_token":"eyJhbGciOiJSUzI1NiJ9.fake.sig"}'
# → 401 "Clé Apple inconnue" (comportement attendu)
```

Cela prouve que le backend contacte bien Apple JWKS et rejette les tokens invalides.
