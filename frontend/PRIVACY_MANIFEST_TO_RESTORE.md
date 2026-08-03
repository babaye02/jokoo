# Privacy Manifest — À rétablir avant soumission App Store

**Contexte** : Le Privacy Manifest (`PrivacyInfo.xcprivacy`) est requis par Apple depuis iOS 17.4 (mai 2024) pour toute app sur l'App Store. Il déclare les données collectées et les API "required reason".

**Pourquoi c'est retiré de `app.json` actuellement** : Le champ `ios.privacyManifests` (SDK 51+) faisait planter Expo Go sur cette version (SDK 54) lors du chargement du manifest à distance. Il n'est pas nécessaire au runtime — uniquement au build IPA final.

**Comment le remettre avant `Publish` / EAS build** :

1. Ouvrir `/app/frontend/app.json`
2. Sous `ios`, juste avant `infoPlist`, ajouter le bloc suivant :

```json
      "privacyManifests": {
        "NSPrivacyAccessedAPITypes": [
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
            "NSPrivacyAccessedAPITypeReasons": ["CA92.1"]
          },
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp",
            "NSPrivacyAccessedAPITypeReasons": ["C617.1"]
          },
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategorySystemBootTime",
            "NSPrivacyAccessedAPITypeReasons": ["35F9.1"]
          },
          {
            "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryDiskSpace",
            "NSPrivacyAccessedAPITypeReasons": ["E174.1"]
          }
        ],
        "NSPrivacyTracking": false,
        "NSPrivacyTrackingDomains": [],
        "NSPrivacyCollectedDataTypes": [
          { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeEmailAddress", "NSPrivacyCollectedDataTypeLinked": true, "NSPrivacyCollectedDataTypeTracking": false, "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
          { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeName", "NSPrivacyCollectedDataTypeLinked": true, "NSPrivacyCollectedDataTypeTracking": false, "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
          { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypePhoneNumber", "NSPrivacyCollectedDataTypeLinked": true, "NSPrivacyCollectedDataTypeTracking": false, "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
          { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypePhysicalAddress", "NSPrivacyCollectedDataTypeLinked": true, "NSPrivacyCollectedDataTypeTracking": false, "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
          { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypePhotosorVideos", "NSPrivacyCollectedDataTypeLinked": true, "NSPrivacyCollectedDataTypeTracking": false, "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
          { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypePaymentInfo", "NSPrivacyCollectedDataTypeLinked": true, "NSPrivacyCollectedDataTypeTracking": false, "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
          { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeCustomerSupport", "NSPrivacyCollectedDataTypeLinked": true, "NSPrivacyCollectedDataTypeTracking": false, "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
          { "NSPrivacyCollectedDataType": "NSPrivacyCollectedDataTypeCrashData", "NSPrivacyCollectedDataTypeLinked": false, "NSPrivacyCollectedDataTypeTracking": false, "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] }
        ]
      },
```

## Alternative — Ajouter via un plugin config Expo

Créer `/app/frontend/plugins/with-privacy-manifest.js` :

```js
const { withInfoPlist } = require("expo/config-plugins");

module.exports = function withPrivacyManifest(config) {
  return withInfoPlist(config, (cfg) => {
    // À implémenter si besoin — génère le fichier PrivacyInfo.xcprivacy
    return cfg;
  });
};
```

Et l'ajouter dans `plugins` de `app.json`.

## API Reasons expliqués

- **CA92.1** (UserDefaults) : Persistance des préférences user (langue, thème)
- **C617.1** (FileTimestamp) : Cache et gestion des fichiers téléchargés
- **35F9.1** (SystemBootTime) : Mesure des temps de session pour analytics
- **E174.1** (DiskSpace) : Vérification avant upload de médias

## Data Types déclarés

Toutes les données collectées sont **linked** (attribuables à l'utilisateur), **non tracking** (pas de partage avec des tiers pour ciblage cross-app), et servent uniquement au **fonctionnement de l'app** (pas de marketing/analytics tiers).
