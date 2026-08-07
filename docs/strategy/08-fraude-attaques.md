# 08 — Red team fraude : « comment je volerais Jokoo », et les contre-mesures

> Posture : fraudeur professionnel. Chaque attaque est décrite, puis évaluée
> contre l'état RÉEL du code (✅ déjà protégé · ⚠️ partiellement · ❌ ouvert),
> avec la contre-mesure à mettre en place.

## A. Voler la commission (l'attaque de masse)

### A1. Ne jamais déclarer le cash ❌
Je termine la mission, j'encaisse en liquide, je ne clique jamais « paiement reçu ».
Coût pour moi : zéro. Détection : aucune.
**Contre-mesures** : clôture par le client (double confirmation) ; avis impossible
sans clôture ; « taux de déclaration » surveillé (dashboard) ; mystery shopping ;
à terme escrow Wave = prélèvement à la source.

### A2. Sous-déclarer le montant ❌
Mission à 50 000 F, je déclare 5 000 F → commission divisée par 10.
**Contre-mesures** : le devis accepté in-app (quote_amount existe ✅) devient le
montant de référence ; écart déclaré vs devis > 30 % → flag automatique.

### A3. Sortir la relation de la plateforme ⚠️
Je glisse mon numéro au premier contact et tout passe par WhatsApp ensuite.
**État réel** : messages ✅ filtrés (`_sanitize_message`), points de repère ✅
filtrés + journalisés (`contact_flags`), **notes vocales ❌ non filtrées**.
**Contre-mesures** : transcription Whisper des vocaux → même pipeline ; numéros
« déguisés » (en toutes lettres, wolof) détectés par LLM ; scoring récidivistes
(les données `contact_flags` existent déjà, il manque l'écran d'action admin).

## B. Attaques sur le wallet

### B1. Farm de dette multi-comptes ⚠️
J'endette un compte jusqu'au plancher (−50 000 F), j'abandonne, je recrée un compte.
**État réel** : plancher ✅ (le débit qui franchirait −50 000 F est refusé, testé),
blocage réservations ✅ (bug v1→v2 corrigé). Mais la ré-inscription est libre ❌.
**Contre-mesures** : plancher progressif lié à l'ancienneté/KYC ; unicité
téléphone vérifié OTP ; dette rattachée à la pièce d'identité.

### B2. Recharge frauduleuse / chargeback ⚠️
Je recharge par carte volée (Stripe), je vide en retrait avant le chargeback.
**Contre-mesures** : délai de disponibilité des fonds rechargés par carte (72 h)
avant retrait ; plafond de retrait progressif ; retraits validés manuellement au
début (la file `withdrawal_requests` existe ✅).

### B3. Abus de promo/parrainage ❌
Je crée 50 comptes filleuls fantômes pour toucher les primes ambassadeur.
**Contre-mesures** : prime versée seulement à la **première mission payée** du
filleul (pas à l'inscription) ; device fingerprint ; limite de filleuls/jour ;
détection de graphes (même IP, mêmes horaires).

## C. Attaques sur les personnes

### C1. Faux prestataire (vol au domicile) ⚠️
Je crée un profil plombier avec de fausses photos, j'entre chez les gens.
**État réel** : KYC existe ✅ mais optionnel ❌.
**Contre-mesures** : KYC bloquant pour catégories à domicile ; vérification
pièce↔selfie ; badge visible ; premier client informé (« nouveau pro, 0 mission »).

### C2. Faux client (mise en danger du pro / de la conductrice) ⚠️
**Contre-mesures** : téléphone vérifié OTP obligatoire pour réserver ; partage de
position pendant mission (existe ✅ côté chat) ; bouton urgence.

### C3. Arnaque au colis ❌
J'envoie un « colis » qui est de la contrebande, ou je prétends que le colis livré
était endommagé pour me faire rembourser.
**Contre-mesures** : photo du colis scellé au départ + à l'arrivée (preuves photo
✅ existent côté livraison) ; interdiction colis fermés inconnus dans les CGU ;
plafond de valeur déclarée ; remboursement conditionné aux deux photos.

### C4. Faux trajets covoiturage (no-show payant) ⚠️
Je publie des trajets fantômes pour récolter des acomptes.
**Contre-mesures** : pas d'acompte vers des conducteurs non-KYC ; annulations
répétées → suspension auto ; les trajets « Jokoo Vérifié » ✅ crédibilisent le
marché sans risque.

## D. Attaques techniques

### D1. Brute force / credential stuffing ⚠️
**État réel** : rate limiting slowapi présent ✅ (mais désactivable silencieusement
en cas d'erreur d'import — à surveiller), JWT 30 jours ⚠️ (long).
**Contre-mesures** : verrouillage progressif par compte ; alerte connexion
nouvelle ; réduire JWT à 7 j + refresh token.

### D2. IDOR / accès aux données d'autrui ✅ (globalement)
Testé sur les nouveaux endpoints : média vocal inaccessible aux tiers (403),
dashboards admin protégés par permissions.
**Contre-mesures continues** : tests d'accès systématiques pour chaque nouvel
endpoint (règle d'équipe) ; audit périodique.

### D3. Abus de l'upload (base64 volumineux) ✅ partiel
Vocaux plafonnés (400 Ko, 413 testé ✅).
**Contre-mesures** : plafond global body-size au niveau proxy ; quotas par
utilisateur/jour sur tous les uploads.

### D4. Escalade via un compte staff volé ⚠️
Un opérateur compromis peut valider des retraits.
**Contre-mesures** : permissions granulaire ✅ (déjà en place) ; 2FA pour les
rôles staff ; double validation des retraits > seuil ; journal d'audit (audit.py
existe ✅ côté wallet) étendu à toutes les actions admin.

## Plan de défense priorisé
1. **Transcription des vocaux** (protège la commission — l'actif n°1).
2. **KYC bloquant à domicile + unicité téléphone** (protège les personnes ET la dette).
3. **Prime parrainage à la première mission payée** (avant d'ouvrir le referral client).
4. **Délai 72 h sur fonds carte + double validation retraits**.
5. **Écran admin « contournements »** exploitant `contact_flags` (données déjà là).
6. **2FA staff + réduction durée JWT**.
