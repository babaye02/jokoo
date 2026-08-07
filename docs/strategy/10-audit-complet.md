# 10 — Audit complet Jokoo : note /100 par catégorie + plan

> Audit fondé sur le code réel (backend FastAPI, frontend Expo, MongoDB, site
> Next.js). Chaque note est justifiée. **Score global : 68 / 100** — produit
> solide techniquement, mais bloqué par des dépendances business (Wave) et
> quelques dettes d'architecture.

---

## 1. Backend — **74 / 100**
**Forces** : 189 endpoints structurés, modules bien isolés récents (wallet,
rides_v2, chat_voice, admin_mobility, admin_ceo), wallet transactionnel atomique
avec ledger et audit, permissions granulaires par rôle, pipeline anti-contournement
sérieux, 71 blocs try/except.
**Faiblesses** :
- `server.py` = **8 522 lignes** : monolithe qui concentre le risque de régression
  (un bug wallet v1→v2 y est resté invisible jusqu'à cet audit).
- Logique métier mêlée aux routes dans le cœur (auth, bookings, providers, chat).
- Peu de tests sur le cœur historique (bonne couverture wallet/mobilité/chat récents).
**Plan** : extraire auth / bookings / providers / chat en modules ; viser
`server.py` < 1 500 lignes ; tests d'intégration sur les 20 endpoints critiques.

## 2. Frontend — **72 / 100**
**Forces** : 127 écrans/composants, expo-router propre, thème centralisé,
composants réutilisés (Card, Txt, ErrorBox, ConfirmDialog), Reanimated, lint clean.
**Faiblesses** :
- `Alert.alert` utilisé pour des confirmations → **no-op sur web** (deux bugs déjà
  trouvés : parrainage, pubs). D'autres écrans concernés (Jokoo Pro, wallet).
- Pas de gestion d'état global (chaque écran re-fetch), pas de cache → sur-appels API.
- Chat en polling.
**Plan** : bannir `Alert.alert` pour les confirmations (migrer vers ConfirmDialog) ;
introduire React Query (cache + retry + offline) ; WebSocket chat.

## 3. Sécurité — **65 / 100**
**Forces** : bcrypt ✅, JWT, permissions par rôle, rate limiting slowapi, contrôle
d'accès média testé (403 tiers), plafonds d'upload (413), filtrage anti-contournement.
**Faiblesses** :
- **JWT 30 jours** sans refresh token (token volé = 1 mois d'accès).
- Rate limiter **désactivable silencieusement** si l'import échoue (`except` qui log
  et continue) → protection non garantie en prod.
- Pas de 2FA pour les comptes staff (qui valident les retraits).
- **Notes vocales non filtrées** (canal de contournement ouvert).
- Documents KYC : chiffrement au repos à confirmer.
**Plan** : refresh token + JWT 7 j ; rendre le rate limiter fail-hard en prod ; 2FA
staff ; transcription vocaux ; chiffrement KYC ; audit d'accès systématique par PR.

## 4. Performances — **60 / 100**
**Forces** : index Mongo présents sur les collections récentes, réponses paginées
par lots, WebP pour les nouveaux assets.
**Faiblesses** :
- **Images legacy en base64 dans Mongo** → payloads lourds sur 3G, proche de la
  limite BSON par doc.
- Chat polling 3 s = charge quadratique avec les utilisateurs actifs.
- `assets/` = 32 Mo embarqués dans le bundle.
- Pas de CDN devant l'API.
**Plan** : migration Cloudinary (prioritaire) ; WebSocket ; alléger le bundle
(assets distants) ; CDN + cache HTTP.

## 5. UX / UI — **75 / 100**
**Forces** : design premium récent (cartes mobilité), navigation cohérente, chat
riche (vocaux, position, quick replies), admin très complet.
**Faiblesses** (détaillées dans doc 02) : onboarding email-first, pas de wolof, pas
de photo dans le chat (cas d'usage n°1), prix flous, 112 bookings « pending » sans
relance, incohérence visuelle des catégories.
**Plan** : cf. synthèse priorisée doc 02.

## 6. Marketing / SEO — **45 / 100**
**Forces** : site Next.js existant (base SEO), module ads/promos/partenaires,
programme ambassadeurs, pages /promo/{slug}.
**Faiblesses** : pas de SEO programmatique (« plombier à {commune} »), pas de
tracking d'acquisition (UTM/canal absent → CAC incalculable), pas de langue locale,
aucune boucle virale câblée côté client.
**Plan** : SEO programmatique par ville×catégorie, tags d'acquisition à l'inscription,
parrainage bilatéral in-app (docs 03-04).

## 7. Finances / Business model — **55 / 100**
**Forces** : plusieurs sources câblées (commission, Jokoo Pro, ads, colis), wallet +
escrow architecturé, take rate mesurable (Cockpit CEO).
**Faiblesses** : **commission cash déclarative** (revenu optionnel), **Wave/OM
mockés** (pas d'encaissement réel), plancher de dette exploitable, pas d'assurance.
**Plan** : cf. docs 01 & 05 — Wave escrow = bataille n°1.

## 8. Architecture — **70 / 100**
**Forces** : séparation front/back/DB claire, modularisation en cours réussie,
factory routers injectés (db, deps) = testable, abstractions paiement/villes.
**Faiblesses** : cœur monolithique, pas de couche service/repository homogène,
pas de file de tâches (crons `asyncio` in-process → perdus au restart).
**Plan** : achever la modularisation, introduire un worker (tâches asynchrones :
transcription, notifications, expirations) hors process web.

## 9. Coûts serveurs / Scalabilité — **58 / 100**
**Forces** : stack légère (FastAPI async + Mongo), coûts actuels faibles.
**Faiblesses** : base64 en DB gonfle stockage et RAM ; polling multiplie les
requêtes ; un seul process (pas de scaling horizontal documenté) ; pas de FinOps.
**Plan** : Cloudinary (DB allégée), WebSocket, réplication Mongo + read replicas,
autoscaling, ligne « coût infra / GMV » dans le Cockpit CEO.

## 10. Conformité — **50 / 100**
**Forces** : Centre légal administrable, positions à expiration (privacy by design),
audit ledger wallet, suppression de compte (RGPD-like, `client_id_deleted`).
**Faiblesses** : statut wallet vs **BCEAO/EME** non tranché ; déclaration **CDP
Sénégal** à faire ; KYC facultatif ; rétention/chiffrement des données sensibles à
formaliser ; CGU mobilité (transport/assurance) à border.
**Plan** : avis juridique BCEAO + CDP avant lancement ; KYC bloquant à domicile ;
politique de rétention + chiffrement KYC ; CGU mobilité.

---

## Tableau récapitulatif

| Catégorie | Note |
|---|---|
| Backend | 74 |
| Frontend | 72 |
| Sécurité | 65 |
| Performances | 60 |
| UX / UI | 75 |
| Marketing / SEO | 45 |
| Finances / Business | 55 |
| Architecture | 70 |
| Coûts / Scalabilité | 58 |
| Conformité | 50 |
| **Global (moyenne)** | **≈ 68 / 100** |

## Les 10 chantiers qui feraient passer Jokoo de 68 à 85
1. 🔴 **Wave/OM escrow en prod** (Business, Finances, UX) — débloque le revenu réel.
2. 🔴 **Migration Cloudinary** (Perf, Scalabilité, Coûts).
3. 🔴 **Transcription anti-fraude des vocaux** (Sécurité, Business).
4. 🔴 **Découper `server.py`** (Backend, Architecture, réduction des régressions).
5. 🟠 **WebSocket chat** (Perf, UX, Scalabilité).
6. 🟠 **Refresh token + rate limiter fail-hard + 2FA staff** (Sécurité).
7. 🟠 **KYC bloquant à domicile + unicité téléphone** (Sécurité, Conformité).
8. 🟠 **Tracking d'acquisition + SEO programmatique** (Marketing).
9. 🟠 **Bannir `Alert.alert` + React Query** (Frontend).
10. 🟡 **Avis juridique BCEAO/CDP** (Conformité) — à lancer en parallèle, délai long.

> Verdict : les fondations d'ingénierie sont bonnes (au-dessus de la moyenne des
> marketplaces early-stage). Le plafond de verre n'est pas technique — il est
> **business (Wave) et dette d'architecture (monolithe)**. Traiter les 4 chantiers
> rouges avant de dépenser en acquisition.
