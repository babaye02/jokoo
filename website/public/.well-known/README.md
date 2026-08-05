# Deep Links Configuration — Jokoo

Ces fichiers **doivent être servis en HTTPS** depuis `https://jokooservices.com/.well-known/` pour que les Universal Links (iOS) et App Links (Android) fonctionnent.

## ⚠️ Placeholders à remplacer AVANT le premier déploiement production

### 1. `apple-app-site-association` — `TEAMID`

Remplacer `TEAMID.com.jokoo.app` par votre **Apple Developer Team ID** (10 caractères alphanumériques).

**Comment le trouver :**
1. Connectez-vous à [App Store Connect](https://appstoreconnect.apple.com)
2. En haut à droite : votre nom → **Membership**
3. Copiez le champ **Team ID** (ex: `A1B2C3D4E5`)

Ou depuis EAS :
```bash
eas whoami
# puis
eas project:info
```

### 2. `assetlinks.json` — `REPLACE_WITH_ANDROID_KEYSTORE_SHA256_FINGERPRINT`

Remplacer par le SHA-256 fingerprint de votre keystore Android de production.

**Comment le trouver après le premier build EAS :**
```bash
# Sur votre machine locale, après avoir téléchargé le keystore EAS
eas credentials -p android

# Ou depuis Google Play Console (après upload initial) :
# Play Console → Setup → App signing → App signing key certificate → SHA-256
```

Format attendu : `AA:BB:CC:DD:EE:FF:...` (64 chars hex avec 2-points).

## ✅ Validation post-déploiement

Après avoir remplacé les placeholders et déployé le site, vérifiez :

```bash
# iOS
curl -sI https://jokooservices.com/.well-known/apple-app-site-association \
  | grep -i "content-type"
# Doit renvoyer: application/json (PAS application/pkcs7-mime, PAS text/plain)

# Android
curl -s https://jokooservices.com/.well-known/assetlinks.json \
  | python3 -m json.tool
# Doit s'afficher sans erreur JSON
```

## 🔗 Tests deep links

**iOS Universal Links (simulateur ou device) :**
```bash
xcrun simctl openurl booted "https://jokooservices.com/i/5GB3EH"
```

**Android App Links :**
```bash
adb shell am start -W -a android.intent.action.VIEW \
  -d "https://jokooservices.com/i/5GB3EH" com.jokoo.app
```

## 📚 Références
- [Apple — Supporting Associated Domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
- [Android — Verify Android App Links](https://developer.android.com/training/app-links/verify-android-applinks)
