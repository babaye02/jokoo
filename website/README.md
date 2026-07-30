# Jokoo — Site Marketing (jokooservices.com)

Site public Next.js 15 (App Router) qui consomme le backend FastAPI existant.

## 🎨 Design
- Palette Jokoo : Midnight `#0B1F3A` + Turquoise `#00C2A8`
- Style cohérent avec l'app mobile
- Responsive (mobile-first)
- Tailwind CSS

## 📄 Pages

- `/` — Accueil (Hero, Services, Mobilité, Family, Download)
- `/prestataires` — Landing pour recruter des prestataires
- `/apropos` — Page à propos
- `/contact` — Page contact avec formulaire
- `/blog` — Blog SEO (articles statiques dans `app/lib/blog.ts`)
- `/blog/[slug]` — Article de blog
- `/legal` — Centre juridique (liste depuis `/api/legal/documents`)
- `/legal/[slug]` — Document juridique (markdown depuis backend)

## 🔧 SEO

- `sitemap.xml` généré dynamiquement (statique + blog + docs juridiques)
- `robots.txt` généré via `app/robots.ts`
- JSON-LD Organization schema dans le layout
- Open Graph et Twitter Cards
- Meta descriptions FR optimisées

## 🚀 Développement

```bash
cd /app/website
yarn dev      # http://localhost:3001
yarn build    # build production
yarn start    # server production
```

## 🌍 Variables d'environnement (`.env.local`)

```
NEXT_PUBLIC_API_URL=https://jokoo-mobile-dev.preview.emergentagent.com/api
NEXT_PUBLIC_SITE_URL=https://jokooservices.com
```

## 📖 Déploiement

Voir `/app/memory/HOSTINGER_DEPLOYMENT_GUIDE.md` pour le guide complet Vercel/VPS + DNS Hostinger.

## ✍️ Ajouter un article de blog

Éditez `app/lib/blog.ts` et ajoutez un objet `BlogPost` au tableau `POSTS`.
Le sitemap et les pages statiques seront regénérés automatiquement au build.
