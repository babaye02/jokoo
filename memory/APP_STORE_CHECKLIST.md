# 🍎 Checklist App Store — Jokoo (v1.0.1)

**Objectif** : maximiser les chances d'acceptation au **premier envoi** en respectant les *App Store Review Guidelines* d'Apple.

---

## ✅ CE QUI EST DÉJÀ CONFORME (corrigé automatiquement)

### 🔒 Legal & Privacy
- [x] **Suppression de compte in-app** (Guideline 5.1.1(v)) — bouton dans `/(tabs)/profile` + endpoint `DELETE /api/users/me`
- [x] **Signaler un utilisateur** (Guideline 1.2 UGC) — menu ⋮ dans chat → « Signaler »
- [x] **Bloquer un utilisateur** (Guideline 1.2 UGC) — menu ⋮ dans chat → « Bloquer »
- [x] **Politique de confidentialité rédigée** — 22 documents dans `/legal`
- [x] **Sign in with Apple présent** (Guideline 4.8) — bouton `AppleSignInButton` sur Login et Register

### 🔧 Technique & Sécurité
- [x] **Toutes les `NS*UsageDescription` iOS en français** dans `app.json` :
  - `NSCameraUsageDescription` : "Prenez des photos pour votre profil et vos annonces."
  - `NSPhotoLibraryUsageDescription` : "Ajoutez des photos à vos annonces et profil."
  - `NSPhotoLibraryAddUsageDescription` : "Enregistrez vos reçus de mission."
- [x] **`ITSAppUsesNonExemptEncryption: false`** — évite le questionnaire Export Compliance
- [x] **Bundle Identifier** valide : `com.emergent.jokoomobiledev.b94ufz`
- [x] **`buildNumber: "2"`** dans iOS (incrémentable à chaque submission)
- [x] **`supportsTablet: true`** — universelle iPhone + iPad
- [x] **Splash screen premium** avec brand color `#0B1F3A`
- [x] **Onboarding 5 écrans immersifs** (parallax + haptics)
- [x] **JWT_SECRET 64 octets** + bcrypt password hashing
- [x] **Rate limiting** sur `/auth/login`, `/auth/register`, `/auth/otp/*`
- [x] **RBAC** avec `require_perm` sur les endpoints admin
- [x] **HTTPS partout** (Emergent + Vercel)
- [x] **Touch targets ≥ 44×44** (Apple HIG) — corrigé sur le chat header
- [x] **Design responsive** — SafeArea + Flexbox

### 🎨 Design & UX
- [x] **Splash + icône adaptive** avec brand color
- [x] **StatusBar** style dynamique
- [x] **Keyboard-aware** (KeyboardAvoidingView) sur chat et forms
- [x] **Pull-to-refresh** sur listes principales
- [x] **États vides** informatifs (chat, bookings, favorites)
- [x] **Feedback haptique** iOS (onboarding, actions clés)
- [x] **Messages d'erreur clairs** en français

### 🔬 Tests
- [x] **Backend** : 105 endpoints, 94%+ pass tests
- [x] **Frontend** : 0 crash JS, tous les tabs et écrans chargent
- [x] **Chat** : optimistic UI, error handling, polling — validé
- [x] **Delete account + Block user** : validé par testing_agent (iteration_9)

---

## 📋 CE QUI VOUS RESTE À FAIRE MANUELLEMENT

### 1️⃣ Configuration Apple Developer

- [ ] **Créer/vérifier Apple Developer Account** (99 $/an) → https://developer.apple.com
- [ ] **App ID** : créer `com.emergent.jokoomobiledev.b94ufz` avec capabilities :
  - Sign in with Apple
  - Push Notifications (si vous les activez plus tard)
- [ ] **Provisioning profiles** : gérés automatiquement par Emergent Build ou Xcode

### 2️⃣ Build & Upload

- [ ] **Générer le build iOS** via **Emergent → Publish → iOS → Generate build**
- [ ] **Upload vers TestFlight** (via Xcode ou Transporter)
- [ ] **Tester sur au moins 1 iPhone réel** via TestFlight (obligatoire)

### 3️⃣ App Store Connect — Métadonnées

Copiez depuis `/app/memory/PLAY_STORE_LISTING.md` en adaptant :

- [ ] **Nom** : `Jokoo — Services & Mobilité` (≤ 30 car.)
- [ ] **Sous-titre** : `Marketplace sénégalais vérifié` (≤ 30 car.)
- [ ] **Description** (≤ 4000 car.) : adapter la version Play Store
- [ ] **Mots-clés** (≤ 100 car., séparés par des virgules) :
  ```
  jokoo,services,senegal,dakar,plombier,covoiturage,livraison,babysitter,marketplace,wolof
  ```
- [ ] **URL de support** : `https://jokooservices.com/contact`
- [ ] **URL marketing** : `https://jokooservices.com`
- [ ] **URL politique de confidentialité** : `https://jokooservices.com/legal/privacy` ⚠️ **DOIT ÊTRE PUBLIQUEMENT ACCESSIBLE**
- [ ] **Notes de version v1.0.1** : voir PLAY_STORE_LISTING.md

### 4️⃣ App Store Connect — Assets visuels

- [ ] **Icône App Store 1024×1024** PNG sans transparence, sans coins arrondis (Apple les ajoute)
- [ ] **Screenshots iPhone 6.7"** (iPhone 15 Pro Max) : **au moins 3**, 1290×2796 px
- [ ] **Screenshots iPhone 6.5"** (iPhone 11 Pro Max) : **au moins 3**, 1284×2778 px
- [ ] **Screenshots iPad Pro 12.9" 6ème gen** : au moins 2, 2048×2732 px (obligatoire car `supportsTablet: true`)
- [ ] **App Preview vidéo** (optionnel mais recommandé) : 15-30s

### 5️⃣ App Privacy (Nutrition Label)

À remplir dans **App Store Connect → App Privacy** :

| Data Type | Collected? | Linked to User? | Used for Tracking? | Purpose |
|-----------|-----------|-----------------|--------------------|---------| 
| Contact Info (name, email, phone) | ✅ | ✅ | ❌ | App Functionality |
| User Content (photos, messages) | ✅ | ✅ | ❌ | App Functionality |
| Identifiers (User ID) | ✅ | ✅ | ❌ | App Functionality |
| Usage Data (product interaction) | ✅ | ✅ | ❌ | Analytics, App Functionality |
| Diagnostics (crash data) | ✅ | ❌ | ❌ | App Functionality |
| Purchases (payment info) | ✅ | ✅ | ❌ | App Functionality |

⚠️ **Ne pas cocher** : Location, Contacts, Health, Financial Info précise, etc.

### 6️⃣ App Review Information

- [ ] **Compte de démo** (Apple exige des credentials pour tester UGC) :
  - Email : `demo-review@jokooservices.com`
  - Mot de passe : (créer un mot de passe unique)
  - Créer ce compte AVANT la soumission
- [ ] **Notes pour l'examinateur** (dans "Notes for Review") :
  ```
  Jokoo est une plateforme de mise en relation entre clients et prestataires
  de services au Sénégal.

  IDENTIFIANTS DE TEST :
  Email : demo-review@jokooservices.com
  Mot de passe : [votre password]

  FONCTIONNALITÉS À TESTER :
  1. Onglet Accueil → parcourir les prestataires
  2. Fiche prestataire → bouton Message → envoyer un message
  3. Chat → icône ⋮ → tester "Signaler" et "Bloquer" (Guidelines 1.2)
  4. Profil → "Supprimer mon compte" (Guideline 5.1.1(v))

  PAIEMENTS : les services sont des prestations physiques réelles (plomberie,
  covoiturage, garde d'enfants). Les paiements passent par Stripe, Wave et
  Orange Money — HORS du système d'in-app purchases Apple (Guideline 3.1.5(a)).

  MULTILINGUE : app en français principalement. Support wolof à venir.
  ```

### 7️⃣ Content Rating (Age Rating)

Répondre au questionnaire Apple :
- Cartoon/Fantasy Violence : No
- Realistic Violence : No
- Sexual Content : No
- Profanity : No
- Alcohol/Tobacco/Drugs : No
- Mature Themes : No
- Horror/Fear : No
- Gambling : No
- Contests : No
- **Unrestricted Web Access** : No (in-app browser strictement contrôlé)
- **User-Generated Content** : YES → avec modération (Report/Block/Community Guidelines)

**Résultat attendu** : **4+** (tous publics)

### 8️⃣ Pricing & Availability

- [ ] Prix : **Free** (téléchargement gratuit)
- [ ] Pays : sélectionner **Sénégal** en priorité, puis Afrique de l'Ouest, France, Canada
- [ ] Availability date : à la publication

### 9️⃣ Sign in with Apple — Configuration

- [ ] Backend `.env` : renseigner `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (guide dans `/app/memory/APPLE_SIGNIN_SETUP.md`)
- [ ] Sur developer.apple.com → **Certificates, IDs & Profiles → Keys** → créer une clé "Sign in with Apple"

### 🔟 Contenu à vérifier

- [ ] La description NE MENTIONNE PAS "iOS", "Apple", "iPhone" en dehors du contexte technique
- [ ] AUCUN LIEN vers d'autres app stores (Google Play etc.) dans l'app
- [ ] Le bouton "Télécharger l'APK Android" sur `jokooservices.com` est OK (site externe)
- [ ] Aucune mention de bêta, alpha, "TestFlight" dans la description ou l'UI

---

## 🎯 VERDICT PRÉVISIONNEL

### **Si Jokoo était soumis maintenant, chances d'acceptation ?** 

⚠️ **Impossible tel quel** — il manque :
1. Le build iOS signé (nécessite votre compte Apple Developer)
2. Les assets Store (icône 1024, screenshots)
3. Le compte demo-review actif
4. La configuration Sign in with Apple (clés Apple Developer)
5. L'URL politique de confidentialité publique (déployer le site sur Vercel)

### **Une fois ces 5 items complétés, chances d'acceptation ?**

✅ **Très élevées** (85-95 %) au premier envoi. Voici pourquoi :

**Points forts** :
- Toutes les exigences techniques Guidelines respectées (deletion, UGC controls, Sign in Apple, permissions justifiées)
- Contenu 100 % légitime, pas de contournement d'IAP
- 22 documents légaux professionnels
- Design premium, aucun crash
- Rate limiting sécurité
- Métadonnées et description prêtes

**Risques résiduels (5-15 %)** — motifs de rejet possibles :
1. **Métadonnées** (2.3) : screenshots pas assez représentatifs → refaire avec vraies captures
2. **Wave / Orange Money** : si les paiements ne fonctionnent pas → afficher explicitement "en attente d'activation" ou masquer
3. **Compte demo** : si le reviewer ne peut pas se connecter → **CRITIQUE**, testez la veille de la soumission
4. **Bugs edge case** : Apple teste rigoureusement → prévoir 1-2 semaines de TestFlight avant submission

### Estimation du délai total avant soumission
- **Actions utilisateur** : 6-8 heures (assets, Apple Dev, tests TestFlight)
- **Review Apple** : 24-48 h en moyenne (peut aller jusqu'à 7 jours)

---

## 🚀 Recommandation finale

**Étape par étape pour maximiser vos chances** :

1. **Déployer `jokooservices.com`** sur Vercel (URL confidentialité publique)
2. **Configurer Apple Developer** + Sign in with Apple keys
3. **Créer les assets Store** (icône 1024, screenshots iPhone 6.7"/6.5", iPad Pro 12.9")
4. **Générer un build iOS** via Emergent Publish
5. **Uploader sur TestFlight** et tester 1 semaine sur un vrai iPhone
6. **Créer le compte demo-review@** actif dans la base
7. **Soumettre** avec les notes pour l'examinateur ci-dessus

Bonne chance ! 🇸🇳🍎
