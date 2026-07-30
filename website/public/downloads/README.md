# Dossier de téléchargement Jokoo

Placez ici le fichier **`jokoo-latest.apk`** téléchargé depuis Emergent
(bouton **Publish → Android → Download APK**).

## Chemin attendu
```
/app/website/public/downloads/jokoo-latest.apk
```

## Comment mettre à jour l'APK ?

1. Emergent → **Publish → Android → Générer un build**
2. Une fois le build terminé, cliquez sur **Download APK**
3. Renommez le fichier en `jokoo-latest.apk`
4. Déposez-le dans `/app/website/public/downloads/`
5. Poussez sur GitHub → Vercel redéploie automatiquement

## URL publique après déploiement
```
https://jokooservices.com/downloads/jokoo-latest.apk
```

## Alternative — Env var
Si vous préférez héberger l'APK ailleurs (CDN, Google Drive direct, etc.),
définissez la variable d'environnement dans Vercel :

```
NEXT_PUBLIC_APK_URL=https://votre-cdn.com/jokoo-latest.apk
```

## Publication définitive (Play Store / App Store)

Quand l'app sera publiée, ajoutez dans Vercel :

```
NEXT_PUBLIC_ANDROID_APP_URL=https://play.google.com/store/apps/details?id=com.jokoo.services
NEXT_PUBLIC_IOS_APP_URL=https://apps.apple.com/app/jokoo/idXXXXXXXXX
```

Le bouton "Télécharger" redirigera alors automatiquement chaque utilisateur
vers le store correspondant à son appareil. Aucun autre changement de code nécessaire ✨
