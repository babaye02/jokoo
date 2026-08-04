# 🌐 Intégration Site Web ↔ App Jokoo

Ce guide décrit comment **jokooservices.com** consomme le CMS Jokoo pour rester **automatiquement synchronisé** avec l'application mobile.

**Toute modification dans l'admin de l'app est répercutée immédiatement sur le site web.**

---

## 🔌 API publiques (aucune authentification requise)

Base URL (production) :
```
https://api.jokooservices.com/api    (à remplacer par votre URL prod)
```

Base URL (preview actuelle) :
```
https://868fd53e-1f85-41aa-80f4-13c6ad7575b7.preview.emergentagent.com/api
```

### 1. Documents juridiques

| Endpoint | Description |
|----------|-------------|
| `GET /public/legal` | Liste tous les documents légaux publiés (JSON) |
| `GET /public/legal/{slug}` | Détail JSON d'un document |
| `GET /public/legal/{slug}?format=html` | Version HTML prête à embarquer |

**Slugs prioritaires :**
- `privacy` — Politique de confidentialité
- `cgu` — Conditions Générales d'Utilisation
- `terms-clients` — Conditions Clients
- `terms-prestataires` — Conditions Prestataires
- `mentions-legales` — Mentions légales
- `cookies` — Politique de cookies
- `help-center` — Centre d'aide

**Exemple JSON :**
```bash
curl https://api.jokooservices.com/api/public/legal/privacy
```
```json
{
  "slug": "privacy",
  "title": "Politique de confidentialité",
  "summary": "…",
  "content_md": "# Politique de confidentialité\n\n## 1. …",
  "language": "fr",
  "country": "SN",
  "version": 3,
  "effective_date": "2026-01-01",
  "updated_at": "2026-08-04T12:34:56Z"
}
```

**Exemple HTML embarqué :**
```html
<iframe
  src="https://api.jokooservices.com/api/public/legal/privacy?format=html"
  style="width:100%;height:80vh;border:0"
  loading="lazy"
></iframe>
```

Ou charger dynamiquement en JS :
```js
async function loadLegal(slug) {
  const r = await fetch(`https://api.jokooservices.com/api/public/legal/${slug}`);
  if (!r.ok) throw new Error("Introuvable");
  const doc = await r.json();
  // Convertir Markdown → HTML avec marked.js ou similaire
  document.querySelector("#content").innerHTML = window.marked.parse(doc.content_md);
  document.querySelector("#title").textContent = doc.title;
  document.querySelector("#version").textContent = `Version ${doc.version} · ${doc.effective_date}`;
}
loadLegal("privacy");
```

### 2. Informations entreprise

**Endpoint :** `GET /public/company-info`

```json
{
  "company_name": "Jokoo Services SARL",
  "trade_name": "Jokoo",
  "rccm": "SN-DKR-2024-B-XXXX",
  "ninea": "XXXXXXX",
  "address": "…",
  "city": "Dakar",
  "country": "Sénégal",
  "email": "support@jokooservices.com",
  "phone": "+221 33 800 00 00",
  "whatsapp": "+221 77 000 00 00",
  "website": "https://jokooservices.com",
  "socials": {
    "facebook": "https://facebook.com/jokoo",
    "instagram": "https://instagram.com/jokoo",
    "linkedin": "…",
    "tiktok": "…",
    "x": "…",
    "youtube": "…"
  },
  "app_download": {
    "ios_url":     "https://apps.apple.com/…",
    "android_url": "https://play.google.com/store/apps/details?id=…"
  },
  "brand": {
    "primary_color":   "#14b8a6",
    "secondary_color": "#0f172a",
    "logo_url":        "https://…"
  },
  "hosting_provider": "…",
  "director_name": "…"
}
```

**Utilisation** : le footer / header / boutons de téléchargement / liens sociaux du site doivent tous se remplir à partir de cette API. Aucune valeur ne doit être en dur.

### 3. Pages recommandées sur jokooservices.com

| URL site | Source CMS | Notes |
|----------|-----------|-------|
| `/privacy` | `GET /api/public/legal/privacy` | Requis App Store & Play Store |
| `/terms` (ou `/cgu`) | `GET /api/public/legal/cgu` | Requis App Store & Play Store |
| `/terms-clients` | `GET /api/public/legal/terms-clients` | |
| `/terms-prestataires` | `GET /api/public/legal/terms-prestataires` | |
| `/mentions-legales` | `GET /api/public/legal/mentions-legales` | Obligatoire au Sénégal |
| `/cookies` | `GET /api/public/legal/cookies` | Si bandeau cookies actif |
| `/aide` (ou `/support`) | `GET /api/public/legal/help-center` | Centre d'aide |
| `/telecharger` | `GET /api/public/company-info` → `app_download` | Boutons stores |
| `/contact` | `GET /api/public/company-info` | Email, tél, WhatsApp |

---

## 🎨 Cohérence visuelle

- **Couleur primaire** : `#14b8a6` (turquoise Jokoo)
- **Couleur secondaire** : `#0F172A` (midnight)
- **Police** : `-apple-system, Segoe UI, Roboto, sans-serif` (native)
- **Logo** : (à fournir) — même fichier utilisé dans app et site
- **Ton** : sénégalais chaleureux, marketplace de confiance

---

## 🔗 Deep linking

Sur le site, tous les liens **"Ouvrir dans l'app"** doivent utiliser :
- iOS : `https://jokooservices.com/…` (Universal Links via `apple-app-site-association`)
- Android : `https://jokooservices.com/…` (App Links via `assetlinks.json`)

**⚠️ Ces fichiers d'association ne peuvent être générés qu'après création des builds** (bundle ID iOS + package name Android).

**En attendant**, utilisez des liens directs vers les stores (via `/public/company-info` → `app_download`).

---

## ✅ Checklist d'intégration site

- [ ] Consommer `/public/legal` au chargement du footer pour lister les liens légaux.
- [ ] Créer les 7 pages listées ci-dessus, chacune fetchant `/public/legal/{slug}`.
- [ ] Consommer `/public/company-info` pour footer + header + boutons stores + réseaux sociaux.
- [ ] Vérifier qu'aucune URL ni email n'est en dur dans le code du site.
- [ ] Ajouter le tag `<meta name="viewport">` responsive.
- [ ] Vérifier le sitemap + robots.txt.
- [ ] SSL/HTTPS actif.
- [ ] Bandeau cookies conforme RGPD (si applicable).
- [ ] Boutons App Store / Play Store visibles sur la home.
- [ ] Liens réseaux sociaux ouvrent dans un nouvel onglet (`target="_blank" rel="noopener"`).

---

_Document généré automatiquement par l'audit Jokoo · À jour au 2026-08-04._
