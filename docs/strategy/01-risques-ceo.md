# 01 — Analyse « Directeur général » : les 20 risques qui peuvent tuer Jokoo

> Posture : fondateur ayant investi 100 M$ dans Jokoo. Analyse fondée sur le code
> et le produit réels (juin 2026), pas sur des généralités. Aucune complaisance.

---

## A. Modèle économique — là où l'argent fuit

### 1. La commission cash est déclarative → le revenu est optionnel
Le prestataire *déclare* avoir reçu du cash, et c'est à ce moment que les ~15 % sont
débités de son wallet. Un prestataire rationnel ne déclare jamais. C'est un péage
avec une route de contournement gratuite juste à côté.
**Plan** : confirmation croisée client obligatoire pour clôturer la mission ; avis
conditionné à la clôture ; « taux de déclaration » par prestataire visible admin ;
non-déclarants dépriorisés dans le classement de recherche.

### 2. Wave / Orange Money toujours mockés
Au Sénégal, **Wave EST le système bancaire**. Sans Wave en production : pas de
recharge wallet, pas d'escrow, pas de paiement in-app. Jokoo devient un annuaire.
**Plan** : obtenir les clés API Wave Business + OM **avant tout marketing**. C'est
le blocker n°1 de l'entreprise.

### 3. Plancher de dette −50 000 F = crédit gratuit sans recouvrement
Un prestataire peut accumuler 50 000 F de dette puis abandonner le compte.
× 5 000 prestataires = 250 M F CFA de créances irrécouvrables potentielles.
**Plan** : plancher progressif (−5 000 F nouveau compte → élargi avec ancienneté +
KYC) ; dette rattachée à la pièce d'identité + numéro de téléphone ; ré-inscription
bloquée.

### 4. Le contournement vocal
Les numéros de téléphone sont filtrés dans les messages et les points de repère —
mais les **notes vocales sont un canal non filtré** (« appelle-moi au 77… » se dit
à voix haute).
**Plan** : transcription Whisper asynchrone des vocaux → même pipeline
`_sanitize_message` → flag `contact_flags` (source: voice).

### 5. Aucune assurance / garantie
Un plombier qui inonde un appartement, une nounou et un accident : le premier fait
divers non couvert détruit la marque.
**Plan** : partenariat assureur local (Askia, AXA SN) + fonds de garantie plafonné
financé par 1 point de commission (« Garantie Jokoo »).

---

## B. Marché & croissance — le vrai concurrent s'appelle WhatsApp

### 6. Le concurrent n'est pas une app
C'est le bouche-à-oreille + WhatsApp : gratuit, instantané, avec la confiance de la
famille. La proposition de valeur doit battre « ma tante connaît un bon plombier ».
**Plan** : vendre ce que WhatsApp n'a pas — identité vérifiée, avis réels, prix
affichés, recours en cas de litige. Le badge « Vérifié » = cœur du marketing.

### 7. Poule-et-œuf sur DEUX marketplaces simultanément
Services + mobilité en même temps = forces divisées. L'anti-ghost mobilité existe,
rien d'équivalent côté services.
**Plan** : lancement séquencé — 3 catégories de services × 2 quartiers de Dakar.
Densité avant largeur. La mobilité suit quand les services tournent.

### 8. Français uniquement, marché wolophone
60 %+ des utilisateurs cibles pensent en wolof, beaucoup lisent peu. L'i18n est en
« P2 » — erreur de priorisation.
**Plan** : wolof d'abord (avant l'anglais et l'arabe) ; interfaces audio-first (les
vocaux du chat sont un excellent début) ; icônes > texte.

### 9. Cold start de la confiance
Des profils seedés avec 5,0/5 et zéro historique réel sentent le faux.
**Plan** : programme « 100 premiers pros » — missions réelles subventionnées pour
générer 5-10 vrais avis/pro avant l'ouverture publique.

### 10. Pas de moteur viral câblé au produit
Le parrainage ambassadeurs existe mais est enfoui dans l'admin. Aucune boucle K>1
côté client.
**Plan** : crédit bilatéral (1 000 F parrain / 1 000 F filleul à la première mission
payée via wallet) ; partage de trajet avec deep link ; avis partageables.

---

## C. Produit & technique — ce qui casse à 10 000 utilisateurs/jour

### 11. `server.py` = 8 500 lignes
Chaque feature augmente le risque de régression silencieuse (exemple réel : le
blocage dette était cassé depuis la migration wallet v2 et personne ne l'a vu).
**Plan** : poursuivre l'extraction en modules (wallet, rides_v2, chat_voice,
admin_mobility, admin_ceo l'ont déjà fait — il reste le cœur : auth, bookings,
providers, chat).

### 12. Chat en polling 3 s
10 000 utilisateurs actifs ≈ 3 300 req/s rien que pour le chat. Mongo fond.
**Plan** : WebSockets ou long-polling adaptatif (backoff en arrière-plan) avant
tout pic marketing.

### 13. Images legacy en Base64 dans Mongo
Des mégaoctets transportés sur de la 3G à chaque liste de prestataires. Coût
serveur + churn.
**Plan** : finir la migration Cloudinary **avant** le lancement, pas après.

### 14. Push iOS bloqué, Apple Sign-In bloqué
La rétention mobile sans push est une hémorragie. Blockers côté fondateur
(`GoogleService-Info.plist`, clés `.p8`) depuis des semaines.
**Plan** : fournir les fichiers cette semaine. Non négociable.

### 15. Pas de monitoring / alerting production
Si Jokoo tombe un samedi 9 h (pic réservations), on l'apprend par un tweet.
**Plan** : healthchecks + alertes 5xx + backup Mongo quotidien testé + runbook
incident.

---

## D. Confiance, fraude & légal — ce qui vous ferme

### 16. KYC facultatif pour des gens qui entrent chez les clients
Babysitting sans vérification d'identité solide = risque humain et médiatique
maximal.
**Plan** : KYC obligatoire (pièce + selfie) pour Jokoo Family et toute catégorie
« à domicile », avant toute première mission.

### 17. Le wallet frôle le statut d'émetteur de monnaie électronique (BCEAO)
Stocker la valeur des utilisateurs sans agrément peut fermer l'entreprise.
**Plan** : avis juridique avant lancement ; structurer le wallet comme compte de
passage adossé à Wave/OM (agrégateurs licenciés), pas comme porte-monnaie autonome.

### 18. Mobilité rémunérée : zone grise réglementaire
Transport public de personnes, assurance passagers, colis interurbains.
**Plan** : CGU « partage de frais » claires, plafond prix/km, assurance conducteur
exigée au KYC, exclusions colis (pas de valeurs, pas de colis scellé inconnu).

### 19. Litiges sans arbitrage structuré
Un remboursement contesté mal géré = 1★ sur le Play Store + bad buzz WhatsApp.
**Plan** : flux litige avec SLA 48 h, preuves photo (la livraison l'a déjà),
politique de remboursement publiée au Centre légal.

### 20. Conformité données (CDP Sénégal) et modération
Identités, positions, vocaux stockés. Une fuite = fin de la confiance.
**Plan** : déclaration CDP, rétention limitée (les positions expirent déjà — bien),
chiffrement au repos des documents KYC, procédure de signalement 24 h.

---

## 🗓 Plan d'élimination avant lancement (8 semaines)

| Semaines | Front | Actions |
|---|---|---|
| **S1-S2** | 💰 Argent réel | Clés Wave/OM prod · plancher de dette progressif · confirmation client du cash |
| **S2-S3** | 🛡 Confiance | KYC obligatoire Family/domicile · transcription anti-fraude des vocaux · avis juridique BCEAO + CDP |
| **S3-S5** | 📱 Rétention | Push iOS · migration Cloudinary · chat WebSocket · monitoring + backups |
| **S4-S6** | 🚀 Offre | « 100 premiers pros » (2 quartiers, 3 catégories) · anti-ghost mobilité actif |
| **S6-S8** | 📈 Croissance | Parrainage client bilatéral in-app · wolof sur les 10 écrans critiques · ambassadeurs terrain |

**Verdict brutal** : le produit est techniquement au-dessus de la moyenne du marché
(wallet atomique, anti-contournement, admin sérieux). Mais aujourd'hui Jokoo **ne
peut ni encaisser (Wave absent), ni forcer sa commission (cash déclaratif), ni
retenir (push iOS mort)**. Régler ces trois-là avant de dépenser 1 F en marketing.
