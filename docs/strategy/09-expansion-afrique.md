# 09 — Expansion : de Dakar au leadership ouest-africain

> Doctrine : **ne jamais exporter un playbook qui ne tourne pas encore parfaitement
> à Dakar.** Chaque pays exige : rail de paiement mobile dominant + densité urbaine
> + situation réglementaire lisible.

## Phase 0 (Mois 0-12) — Gagner le Sénégal d'abord
- Dakar → Thiès → Mbour → Saint-Louis → Touba (la mobilité ouvre les villes, les
  services suivent).
- Seuils avant d'ouvrir un 2e pays : 100 k utilisateurs, 2 000 pros actifs/mois,
  taux de déclaration/escrow > 60 %, unit economics ville positifs à Dakar.

## Ordre de lancement recommandé

### 1. Côte d'Ivoire — Abidjan (Mois 12-18) 🥇
**Pourquoi** : le plus grand marché francophone de la région (PIB/hab ~2× Sénégal),
Abidjan = 6 M hab., culture de services développée, diaspora sénégalaise présente.
**Rails** : Orange Money CI + Wave CI (déjà présent !) + MTN MoMo. L'intégration
Wave existante se réutilise presque telle quelle.
**Adaptations** : français OK (pas de blocage langue), nouchi dans le ton marketing ;
catégories +: coiffure à domicile, événementiel (marché énorme) ; prix ~+30 %.
**Risque** : concurrence plus structurée (des acteurs services existent) → attaquer
par la mobilité interurbaine (Abidjan↔Yamoussoukro↔Bouaké) où l'offre est faible.

### 2. Gambie + Guinée-Bissau (Mois 18-24) — extension naturelle 🥈
**Pourquoi** : corridors DÉJÀ traversés par la mobilité Jokoo (Dakar↔Banjul,
Ziguinchor↔Bissau). Coût d'entrée quasi nul : ce sont des extensions de lignes.
**Adaptations** : anglais (Gambie) → i18n EN requis ; portugais/créole (Bissau) ;
paiements : Wave Gambie, QMoney ; change XOF↔GMD à gérer sur les colis.
**Modèle** : mobilité + colis d'abord, services ensuite (Banjul est petite).

### 3. Mali — Bamako (Mois 24-30) 🥉
**Pourquoi** : liens culturels et commerciaux massifs avec Dakar (corridor
Dakar–Bamako = autoroute du colis), XOF partagé — pas de risque de change.
**Rails** : Orange Money domine.
**Risques** : contexte sécuritaire → limiter aux services urbains Bamako + colis
corridor ; pas de covoiturage longue distance au début.

### 4. Bénin / Togo — Cotonou, Lomé (Mois 30-40)
**Pourquoi** : XOF, mobile money mature (MTN/Moov/Celtis), villes denses, zone de
test réglementaire douce. Marché plus petit mais rentable vite.
**Adaptations** : zémidjans (motos-taxis) = catégorie mobilité spécifique à créer.

### 5. Guinée Conakry (Mois 40+)
Franc guinéen (multi-devises à construire), Orange Money ; forte demande de
services, faible concurrence. À faire après l'outillage multi-devises.

### À éviter avant l'année 4
- **Nigeria** : ne pas y aller « parce que c'est gros ». Concurrence féroce,
  réglementation complexe — y aller seulement avec un partenaire local fort.
- **Ghana** : anglophone + acteurs installés ; après la Gambie (test EN).

## Ce qui doit être adapté dans le produit (chantiers transverses)
1. **Multi-devises** : le wallet est en XOF partout sauf Gambie/Guinée → abstraction
   `currency` par pays (le champ existe dans wallets_v2, à généraliser).
2. **Multi-pays dans les données** : `country_code` sur users/providers/rides ;
   villes normalisées par pays (rides_v2/cities.py à répliquer par pays).
3. **i18n** : FR (fait) → Wolof → EN → PT. Architecture i18n à poser une fois.
4. **Rails de paiement par pays** : interface PaymentProvider unique (Wave/OM/MTN/
   Moov) — l'abstraction payments_local.py est un bon début.
5. **Réglementaire par pays** : Centre légal ✅ déjà administrable par documents —
   il suffit d'ajouter la dimension pays.
6. **Ops décentralisées** : un « City Launcher » par ville avec le playbook Dakar
   (doc 03), dashboard admin filtré par ville.

## Structure du siège
- Dakar = siège produit/tech pour toute la région (coûts maîtrisés, talents UCAD/ESP).
- 1 country manager + 2 ops par pays lancé, pas plus la première année.
- Entité juridique locale seulement quand le pays dépasse 10 % du GMV.

## Étoile polaire
**« Le super-app de la débrouille ouest-africaine »** : services + mobilité +
colis + (plus tard) financement des pros — sur les corridors où la diaspora et le
commerce circulent déjà.
