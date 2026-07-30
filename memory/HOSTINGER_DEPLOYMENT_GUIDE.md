# 🚀 Guide de déploiement — jokooservices.com sur Hostinger

Ce guide vous accompagne pour déployer le site marketing Next.js `jokooservices.com` et configurer votre domaine chez **Hostinger**.

---

## 📋 Résumé de l'architecture

- **Site marketing** (ce qu'on vient de construire) → Next.js dans `/app/website`
- **Backend & App mobile** → FastAPI + MongoDB (déjà en production sur Emergent)
- **Le site consomme le même backend** via `/api/legal/documents`, etc.

---

## 🎯 Étape 1 — Choisir un hébergeur pour le site Next.js

Hostinger propose plusieurs options :

### Option A : Hostinger VPS (recommandé si vous avez un VPS Hostinger)
Vous pouvez déployer Next.js directement sur un VPS Ubuntu.

### Option B : Vercel (recommandé, gratuit, ultra-simple) ⭐
**Vercel** (le créateur de Next.js) offre un hébergement gratuit optimisé.
- Aucune configuration serveur
- SSL automatique
- CDN mondial
- Déploiement en 2 minutes

### Option C : Hostinger Cloud Hosting (avec Node.js)
Les plans Cloud Business/Enterprise supportent Node.js.

**Nous recommandons Vercel** pour la simplicité — le domaine restera géré chez Hostinger.

---

## 🎯 Étape 2A — Déployer sur Vercel (recommandé)

1. Créez un compte gratuit sur https://vercel.com (avec GitHub, GitLab ou email)
2. Poussez le dossier `/app/website` sur GitHub (bouton "Save to GitHub" d'Emergent en haut à droite, puis créez un nouveau repo)
3. Sur Vercel : **Add New… → Project → Import Git Repository**
4. Sélectionnez le repo `jokoo-website`
5. Vercel détecte automatiquement Next.js. Ajoutez ces **variables d'environnement** :

```
NEXT_PUBLIC_API_URL=https://jokoo-mobile-dev.preview.emergentagent.com/api
NEXT_PUBLIC_SITE_URL=https://jokooservices.com
```

> ⚠️ Une fois votre backend déployé en production, remplacez `NEXT_PUBLIC_API_URL` par l'URL de production, ex: `https://api.jokooservices.com/api`.

6. Cliquez sur **Deploy** — attendre 2 min ⏳
7. Vercel vous donne une URL du type `jokoo-website.vercel.app`

---

## 🎯 Étape 2B — Alternative : Déployer sur un VPS Hostinger

Si vous avez un VPS Hostinger avec accès SSH :

```bash
# Sur votre VPS Ubuntu
git clone <votre-repo>
cd website
yarn install
yarn build

# Créer un service systemd
sudo nano /etc/systemd/system/jokoo-site.service
```

Contenu du service :
```ini
[Unit]
Description=Jokoo Website
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/website
ExecStart=/usr/bin/yarn start
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
```

Puis :
```bash
sudo systemctl enable jokoo-site && sudo systemctl start jokoo-site

# Configurer Nginx en reverse-proxy
sudo apt install nginx certbot python3-certbot-nginx
```

Fichier Nginx `/etc/nginx/sites-available/jokooservices.com` :
```nginx
server {
    listen 80;
    server_name jokooservices.com www.jokooservices.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Puis :
```bash
sudo ln -s /etc/nginx/sites-available/jokooservices.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d jokooservices.com -d www.jokooservices.com
```

---

## 🌐 Étape 3 — Configurer le DNS chez Hostinger

Connectez-vous à https://hpanel.hostinger.com

**Domains → jokooservices.com → DNS / Nameservers**

### Cas 1 : Si vous avez déployé sur Vercel

Vercel vous donnera 2 enregistrements DNS. Ajoutez :

| Type | Nom | Valeur | TTL |
|------|-----|--------|-----|
| **A** | `@` | `76.76.21.21` | 3600 |
| **CNAME** | `www` | `cname.vercel-dns.com.` | 3600 |

> Vercel affiche parfois d'autres IPs — **utilisez toujours celles qu'il vous donne**.

Dans Vercel : **Project → Settings → Domains → Add**  
Ajoutez `jokooservices.com` et `www.jokooservices.com`.  
Vercel valide la propagation DNS puis émet un SSL automatiquement.

### Cas 2 : Si vous avez déployé sur un VPS Hostinger

| Type | Nom | Valeur | TTL |
|------|-----|--------|-----|
| **A** | `@` | `<IP-de-votre-VPS>` | 3600 |
| **A** | `www` | `<IP-de-votre-VPS>` | 3600 |

### (Optionnel) Sous-domaine pour l'API backend

Si vous voulez une URL propre pour l'API :

| Type | Nom | Valeur | TTL |
|------|-----|--------|-----|
| **CNAME** | `api` | `jokoo-mobile-dev.preview.emergentagent.com.` | 3600 |

Cela permettra à `api.jokooservices.com` de pointer vers votre backend Emergent (à condition qu'Emergent supporte les domaines custom — sinon utilisez directement l'URL Emergent).

---

## ⏱️ Étape 4 — Propagation DNS

- **Propagation** : 15 min à 48h (souvent 1-2h)
- **Vérifier** : https://dnschecker.org → tapez `jokooservices.com`
- Une fois propagé, votre site est en ligne ✅

---

## 🔒 Étape 5 — SSL / HTTPS

- **Vercel** : automatique (Let's Encrypt), zéro action
- **VPS** : `sudo certbot --nginx` (déjà dans l'étape 2B)

---

## 📊 Étape 6 — Google Search Console (SEO)

1. Rendez-vous sur https://search.google.com/search-console
2. **Ajouter une propriété** → `jokooservices.com`
3. Méthode de vérification : **Enregistrement DNS TXT**
4. Ajoutez le TXT chez Hostinger :
   
   | Type | Nom | Valeur | TTL |
   |------|-----|--------|-----|
   | **TXT** | `@` | `google-site-verification=xxxxxx` | 3600 |

5. Une fois vérifié, soumettez votre sitemap : `https://jokooservices.com/sitemap.xml`

---

## ✅ Checklist de mise en ligne

- [ ] Site Next.js déployé (Vercel ou VPS)
- [ ] Variables d'env configurées (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`)
- [ ] DNS Hostinger pointe vers l'hébergeur
- [ ] SSL activé (https://)
- [ ] `www.jokooservices.com` redirige vers `jokooservices.com`
- [ ] `/sitemap.xml` et `/robots.txt` accessibles
- [ ] Google Search Console configuré
- [ ] Test des pages : `/`, `/prestataires`, `/blog`, `/legal`, `/contact`

---

## 🆘 Support

- **Support Hostinger** : chat 24/7 dans le hPanel
- **Support Vercel** : https://vercel.com/help
- **Équipe Jokoo** : contact@jokooservices.com

---

## 📌 URLs à retenir

- Site public : https://jokooservices.com
- Sitemap : https://jokooservices.com/sitemap.xml
- Robots : https://jokooservices.com/robots.txt
- Centre juridique : https://jokooservices.com/legal
- Blog : https://jokooservices.com/blog
- Contact : https://jokooservices.com/contact

Bon lancement ! 🚀🇸🇳
