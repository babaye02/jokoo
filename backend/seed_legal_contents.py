"""
Contenu production-ready pour les documents légaux essentiels à la review
App Store / Play Store.

Chaque document couvre les exigences des stores (Apple Guideline 5.1.1 / 5.1.2,
Google Play Data Safety, RGPD/Loi Sénégalaise 2008-12).

Les documents secondaires (politique d'annulation, anti-fraude, etc.) restent
gérables via l'admin CMS et n'impactent pas la review.
"""

from datetime import datetime, timezone

# --- Contexte commun ------------------------------------------------------
COMPANY_NAME = "Jokoo Services"
COMPANY_LEGAL_NAME = "Jokoo Services SAS"
COMPANY_EMAIL = "support@jokooservices.com"
DPO_EMAIL = "privacy@jokooservices.com"
LEGAL_EMAIL = "legal@jokooservices.com"
APP_URL = "https://jokooservices.com"
COUNTRY = "Sénégal"


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


# --- Politique de confidentialité (Privacy Policy) ------------------------
PRIVACY = f"""# Politique de confidentialité

**Dernière mise à jour : {_today()}**

## 1. Qui sommes-nous ?

{COMPANY_LEGAL_NAME} (« {COMPANY_NAME} », « nous », « notre ») édite l'application
mobile et le site web **Jokoo**, une place de marché reliant des clients à des
prestataires qualifiés au Sénégal. Nous prenons la protection de vos données
personnelles très au sérieux et respectons la **loi sénégalaise n° 2008-12** sur
la protection des données à caractère personnel ainsi que le **RGPD** (UE
2016/679) lorsque celui-ci s'applique.

## 2. Données que nous collectons

Nous collectons uniquement les données strictement nécessaires au bon
fonctionnement du service :

- **Compte** : nom, e-mail, téléphone, mot de passe chiffré (bcrypt), ville,
  photo de profil (optionnelle), rôle (client / prestataire).
- **Identifiants tiers** (facultatif) : identifiant Apple/Google si vous vous
  connectez via Sign in with Apple ou Google.
- **Contenu que vous publiez** : annonces prestataires, messages de chat,
  avis et notes, images téléversées.
- **Réservations et paiements** : historique de réservations, moyens de
  paiement utilisés (Wave, Orange Money, espèces à la livraison). Nous ne
  stockons **jamais vos identifiants bancaires** — ils sont traités par nos
  prestataires agréés (Wave Business, Orange Money Sénégal, Stripe pour la
  carte).
- **Localisation** : uniquement lorsque vous acceptez explicitement le
  partage (recherche de prestataires à proximité, mobilité, suivi de
  livraison). Vous pouvez révoquer cette permission à tout moment depuis les
  réglages système.
- **Données techniques** : type d'appareil, version d'OS, langue, logs
  d'erreur anonymisés pour améliorer la stabilité de l'application.
- **Notifications push** : jeton d'appareil FCM/APNs pour vous envoyer des
  alertes de réservation, messages et campagnes marketing (opt-in).

## 3. Finalités du traitement

Vos données servent exclusivement à :

1. Créer et gérer votre compte utilisateur.
2. Vous mettre en relation avec des prestataires ou clients pertinents.
3. Traiter vos paiements et sécuriser les transactions (escrow).
4. Vous notifier des événements liés à vos réservations et messages.
5. Assurer la sécurité, prévenir la fraude et modérer les contenus.
6. Améliorer nos services (statistiques agrégées et anonymisées).
7. Répondre à nos obligations légales (comptabilité, KYC).

## 4. Base légale

Nous traitons vos données sur la base :

- Du **contrat** que vous acceptez en créant un compte (CGU).
- De votre **consentement** explicite pour la localisation, les notifications
  marketing et l'accès à vos photos/caméra.
- De nos **obligations légales** (comptabilité, lutte anti-blanchiment,
  vérification d'identité KYC).
- De notre **intérêt légitime** à sécuriser la plateforme et prévenir la
  fraude.

## 5. Partage des données

Nous ne vendons **jamais** vos données. Elles peuvent être partagées avec :

- Le **prestataire ou client** que vous choisissez de contacter (nom, photo,
  téléphone après confirmation d'une réservation, adresse de la mission).
- Nos **sous-traitants techniques**, chacun soumis à un accord de traitement
  conforme au RGPD :
  - Hébergement Backend : cloud managed sécurisé (UE).
  - Cloudinary Inc. (USA) — stockage d'images, transfert encadré par des
    Clauses Contractuelles Types.
  - Wave, Orange Money, Stripe — traitement des paiements.
  - Firebase Cloud Messaging (Google) — notifications push.
  - Resend / SMTP — envoi d'e-mails transactionnels.
  - Apple, Google — Sign in with Apple/Google (si utilisé).
- Les **autorités judiciaires** en cas de réquisition légale.

Aucun transfert commercial vers des tiers n'a lieu.

## 6. Durée de conservation

- **Compte actif** : tant que le compte existe.
- **Compte supprimé** : suppression sous 30 jours (sauf obligation légale de
  conservation comptable — 10 ans pour les factures conformément au Code
  général des impôts sénégalais).
- **Logs techniques** : 12 mois maximum.
- **Messages de chat** : 24 mois après la dernière activité.
- **Données de paiement / KYC** : 5 à 10 ans après clôture (obligation
  anti-blanchiment).

## 7. Vos droits

Conformément à la **loi 2008-12** et au RGPD, vous disposez des droits
suivants :

- **Accès** à vos données.
- **Rectification** des données inexactes.
- **Suppression** de votre compte et de vos données (via *Profil →
  Paramètres → Supprimer mon compte* ou en écrivant à {DPO_EMAIL}).
- **Portabilité** dans un format lisible (JSON export).
- **Opposition** au traitement marketing.
- **Limitation** du traitement dans certains cas.
- **Retrait du consentement** à tout moment sans effet rétroactif.

Pour exercer ces droits, écrivez à **{DPO_EMAIL}** ou depuis l'application
via *Profil → Confidentialité → Gérer mes données*. Nous répondons sous
**30 jours** maximum.

## 8. Sécurité

Vos mots de passe sont hachés avec **bcrypt** (jamais stockés en clair). Les
échanges sont chiffrés en **TLS 1.3**. Nos serveurs sont hébergés dans
l'Union européenne. Nous appliquons le principe du moindre privilège pour
l'accès interne, et disposons d'une procédure de notification de violation
sous 72 heures conforme à l'article 33 du RGPD.

## 9. Cookies & traceurs

L'application mobile n'utilise **pas** de cookies traceurs publicitaires. Le
site web utilise uniquement des cookies techniques et de mesure d'audience
anonymisée (voir *Politique cookies*).

## 10. Enfants

Jokoo est réservé aux personnes de **13 ans et plus**. Certains services
(Jokoo Family : baby-sitting, tutorat) impliquent des mineurs, qui sont
sous la responsabilité de l'adulte réservataire. Voir *Politique de
protection des enfants*.

## 11. Modifications

Nous pouvons faire évoluer cette politique. Toute modification substantielle
vous sera notifiée dans l'application et par e-mail au moins **30 jours**
avant sa prise d'effet.

## 12. Contact

- Délégué à la protection des données : **{DPO_EMAIL}**
- Support général : **{COMPANY_EMAIL}**
- Adresse : {COMPANY_LEGAL_NAME}, Dakar, {COUNTRY}.

Vous pouvez également saisir la **CDP (Commission de protection des données
personnelles)** du Sénégal — [www.cdp.sn](https://www.cdp.sn).
"""

# --- CGU (Conditions générales d'utilisation) -----------------------------
CGU = f"""# Conditions générales d'utilisation

**Dernière mise à jour : {_today()}**

## 1. Présentation

{COMPANY_LEGAL_NAME} édite l'application mobile et le site web **Jokoo**,
mettant en relation des clients et des prestataires de services qualifiés au
Sénégal (plomberie, électricité, coiffure, ménage, baby-sitting, tutorat,
covoiturage, livraison, etc.). En créant un compte, vous acceptez sans
réserve les présentes Conditions Générales d'Utilisation (« CGU »).

## 2. Compte utilisateur

Vous devez avoir au moins **13 ans**, fournir des informations exactes et
maintenir la confidentialité de votre mot de passe. Vous êtes seul
responsable des activités effectuées depuis votre compte. Un seul compte par
personne est autorisé. Vous devez nous notifier immédiatement toute
utilisation non autorisée de votre compte à **{COMPANY_EMAIL}**.

## 3. Rôle de Jokoo

Jokoo est un **intermédiaire technique** de mise en relation. Nous ne sommes
pas partie au contrat conclu entre le client et le prestataire, sauf pour la
partie paiement encaissée en escrow. Chaque prestataire est un professionnel
indépendant, seul responsable de la qualité de sa prestation, du respect de
la législation applicable (déclaration fiscale, sécurité sociale, permis
professionnels) et de sa relation contractuelle avec le client.

## 4. Prestations et réservations

Le client choisit un prestataire, définit la mission et confirme la
réservation. Le prestataire accepte, effectue la prestation, puis le
paiement est libéré. Les délais, prix et zones d'intervention sont ceux
affichés dans l'application. Les tarifs peuvent être :

- **Fixes** : prix ferme affiché à la réservation.
- **À partir de…** : prix indicatif, susceptible d'ajustement post-mission.
- **Sur devis** : le prestataire envoie un devis validé par le client avant
  intervention.

## 5. Paiements

Les paiements sont traités via **Wave**, **Orange Money**, **carte bancaire
(Stripe)** ou en **espèces à la livraison** selon les cas. Un système
d'entiercement (escrow) protège les deux parties : les fonds sont libérés au
prestataire une fois la mission validée par le client (ou 48h après la
prestation si aucune contestation n'est ouverte). Une commission de service
est prélevée sur chaque transaction, dont le taux est affiché lors de la
réservation.

## 6. Annulation & remboursement

- **Client** : annulation gratuite jusqu'à 24h avant la mission. Ensuite,
  jusqu'à 50 % du montant peut être retenu au prestataire pour dédommagement.
- **Prestataire** : toute annulation tardive impacte sa note et peut
  déclencher un rappel qualité, voire une suspension en cas de récidive.
- **Force majeure** : remboursement intégral (maladie certifiée, catastrophe
  naturelle, décès d'un proche, ordre gouvernemental).

Détails complets : *Politique d'annulation* & *Politique de remboursement*.

## 7. Comportement acceptable

Il est strictement interdit de :

- Publier du contenu illicite, haineux, discriminatoire, à caractère
  sexuel non-sollicité ou trompeur.
- Contourner le système de paiement (paiement hors application, escroquerie,
  fraude).
- Créer de faux comptes, de fausses annonces ou de faux avis.
- Harceler ou menacer d'autres utilisateurs.
- Utiliser Jokoo à des fins illégales (blanchiment, travail dissimulé,
  exploitation de mineurs, prostitution).
- Extraire massivement les données de la plateforme (scraping, botting).

Toute violation peut entraîner la suspension immédiate ou la suppression du
compte, sans préavis ni remboursement.

## 8. Propriété intellectuelle

Le logo, le nom, le design, le code source et l'ensemble des éléments
techniques de Jokoo sont la propriété exclusive de {COMPANY_LEGAL_NAME}.
Vous conservez vos droits sur les contenus que vous publiez, mais nous
accordez une licence **mondiale, non-exclusive et gratuite** pour les
afficher dans l'application, le site web et notre communication marketing
(dans le respect de votre droit à l'image).

## 9. Responsabilité

Jokoo ne peut être tenue responsable des prestations effectuées par les
prestataires indépendants, qui restent seuls responsables de la qualité, de
la sécurité et de la légalité de leur travail. Nous mettons tout en œuvre
pour vérifier les identités (KYC) et modérer les contenus, mais garantissons
uniquement le bon fonctionnement de la plateforme. Aucune garantie de
résultat n'est promise sur les prestations.

## 10. Résiliation

Vous pouvez supprimer votre compte à tout moment depuis *Profil →
Paramètres → Supprimer mon compte*. Nous pouvons suspendre ou supprimer un
compte en cas de violation des CGU, après notification (sauf urgence
sécuritaire). Les données seront effacées conformément à notre *Politique de
confidentialité*.

## 11. Droit applicable & juridiction

Les présentes CGU sont régies par le **droit sénégalais**. Tout litige
relève des tribunaux compétents de **Dakar**, sauf disposition légale
contraire ou recours à la médiation amiable préalable via
**{LEGAL_EMAIL}**.

## 12. Contact

**{LEGAL_EMAIL}** — {COMPANY_LEGAL_NAME}, Dakar, {COUNTRY}.
"""

# --- Mentions légales -----------------------------------------------------
MENTIONS_LEGALES = f"""# Mentions légales

**Dernière mise à jour : {_today()}**

## 1. Éditeur du site et de l'application

- **Raison sociale** : {COMPANY_LEGAL_NAME}
- **Forme juridique** : Société par actions simplifiée (SAS)
- **Siège social** : Dakar, {COUNTRY}
- **Registre du commerce** : à préciser (RCCM Dakar)
- **NINEA** : à préciser
- **Capital social** : à préciser
- **Représentant légal** : Président de {COMPANY_LEGAL_NAME}
- **Contact général** : {COMPANY_EMAIL}
- **Contact juridique** : {LEGAL_EMAIL}
- **DPO / Protection des données** : {DPO_EMAIL}
- **Site web** : {APP_URL}

## 2. Directeur de la publication

L'équipe fondatrice de {COMPANY_LEGAL_NAME}, joignable à **{LEGAL_EMAIL}**.

## 3. Hébergement

### Application mobile
- **iOS** : Apple Inc., One Apple Park Way, Cupertino, CA 95014, USA
  (distribution via App Store).
- **Android** : Google LLC, 1600 Amphitheatre Parkway, Mountain View,
  CA 94043, USA (distribution via Google Play Store).

### Backend & API
- Infrastructure cloud managée (Kubernetes) hébergée dans l'Union européenne
  et conforme aux exigences de sécurité ISO 27001.

### Site web (jokooservices.com)
- Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA.

### Stockage des images utilisateurs
- **Cloudinary Inc.**, 3400 Central Expressway, Suite 110, Santa Clara,
  CA 95051, USA — transfert de données encadré par des Clauses Contractuelles
  Types (CCT) validées par la Commission européenne.

### Base de données
- MongoDB Atlas géré dans une région UE, chiffrement au repos AES-256.

## 4. Prestataires de paiement

- **Wave Digital Finance Inc.** — Wave Business Sénégal
- **Orange Money Sénégal** — Sonatel Mobile Money SA
- **Stripe Inc.** — 510 Townsend Street, San Francisco, CA 94103, USA
  (utilisé pour les paiements par carte bancaire, si activé).

## 5. Propriété intellectuelle

L'ensemble des éléments composant l'application et le site (logo, nom Jokoo,
marque, textes, images, illustrations, code source, base de données) est
protégé par le droit d'auteur sénégalais et international. **Toute
reproduction, représentation, adaptation ou exploitation, totale ou
partielle, par quelque procédé que ce soit, sans autorisation écrite
préalable de {COMPANY_LEGAL_NAME}, est strictement interdite** et constitue
une contrefaçon sanctionnée par les articles pénaux applicables.

La marque « Jokoo » est en cours d'enregistrement auprès de l'OAPI
(Organisation Africaine de la Propriété Intellectuelle).

## 6. Signalement de contenu illicite (LCEN & article 15 DSA)

Conformément à la législation en vigueur (loi n° 2008-08 sur les
transactions électroniques et Digital Services Act européen lorsqu'il
s'applique), tout contenu manifestement illicite peut être signalé à :

- **E-mail** : {LEGAL_EMAIL}
- **Objet** : « Signalement de contenu illicite »
- Fournir : URL / capture d'écran, identifiant utilisateur, motif détaillé.
- **Délai de traitement** : sous **48 heures** ouvrées.

Les signalements de mineurs en danger sont traités en **priorité absolue**
(voir *Politique de protection des enfants*).

## 7. Liens hypertextes

Jokoo peut proposer des liens vers des sites tiers. Nous ne saurions être
tenus responsables du contenu ou des politiques de confidentialité de ces
sites tiers. La création d'un lien vers jokooservices.com est libre à
condition de ne pas nuire à l'image de {COMPANY_NAME}.

## 8. Loi applicable

Les présentes mentions légales sont soumises au **droit sénégalais**. Tout
litige sera porté devant les tribunaux compétents de **Dakar**.

## 9. Contact

- Support : **{COMPANY_EMAIL}**
- Juridique : **{LEGAL_EMAIL}**
- Protection des données : **{DPO_EMAIL}**
"""

# --- Politique cookies (mobile = minimal, web = détaillé) ----------------
COOKIES = f"""# Politique relative aux cookies

**Dernière mise à jour : {_today()}**

Cette politique explique quels **cookies** et **technologies de traçage
locales** sont utilisés par {COMPANY_LEGAL_NAME} sur l'application mobile
Jokoo et le site web {APP_URL}.

## 1. Qu'est-ce qu'un cookie ?

Un cookie est un petit fichier texte déposé sur votre appareil (smartphone,
tablette ou ordinateur) par un site web ou une application. Il permet de
reconnaître votre appareil lors de visites ultérieures et de mémoriser
certaines informations (préférences, session, statistiques).

## 2. Application mobile Jokoo

L'application mobile Jokoo **n'utilise pas de cookies publicitaires ni de
traceurs tiers à des fins marketing**. Elle stocke uniquement, sur votre
appareil, des données techniques strictement nécessaires au fonctionnement :

| Type de donnée | Finalité | Durée | Effacement |
|----|----|----|----|
| Jeton de session JWT | Vous garder connecté(e) | Jusqu'à déconnexion | *Profil → Se déconnecter* |
| Préférences (langue, thème) | Personnaliser l'expérience | Persistante | Désinstallation ou *Vider le cache* |
| Cache d'images | Chargement rapide | 7 jours max | *Profil → Paramètres → Vider le cache* |
| Identifiant push (FCM/APNs) | Recevoir les notifications | Persistante | *Réglages système → Notifications → Désactiver* |

Aucune donnée n'est partagée avec des annonceurs. Aucun identifiant
publicitaire (IDFA, GAID) n'est utilisé.

## 3. Site web (jokooservices.com)

Le site web utilise trois catégories de cookies :

### 3.1 Cookies strictement nécessaires (sans consentement)

| Cookie | Finalité | Durée |
|---|---|---|
| `jokoo_web_token` | Session utilisateur authentifié | 30 jours |
| `jokoo_locale` | Langue préférée | 6 mois |
| `next-auth.csrf-token` | Protection CSRF (sécurité) | Session |

Ces cookies sont indispensables au fonctionnement du site. Les désactiver
rendrait la connexion impossible.

### 3.2 Cookies de mesure d'audience anonymisée (consentement soft opt-in)

Nous mesurons l'utilisation agrégée du site pour améliorer l'expérience —
**aucun profil individuel n'est constitué**, aucune donnée n'est vendue.
L'IP est anonymisée avant transmission. Vous pouvez refuser via la bannière
cookies affichée à la première visite.

### 3.3 Aucun cookie tiers publicitaire

Nous **n'utilisons pas** : Google Ads, Facebook Pixel, TikTok Pixel,
retargeting, DoubleClick, ni aucun autre traceur commercial.

## 4. Gestion de votre consentement

- **Application mobile** : les seules données stockées sont techniques. Vous
  pouvez tout effacer via *Profil → Paramètres → Vider le cache* ou en
  désinstallant l'application.
- **Site web** : une bannière cookies s'affiche à la première visite. Vous
  pouvez modifier vos préférences à tout moment via le lien *Cookies* en
  pied de page.
- **Navigateur** : vous pouvez également bloquer/supprimer les cookies via
  les paramètres de votre navigateur (Chrome, Safari, Firefox, Edge).

## 5. Base légale

Le dépôt de cookies non-essentiels est soumis à votre **consentement libre,
éclairé et univoque**, conformément à l'article 82 de la loi Informatique et
Libertés (RGPD) et à la loi sénégalaise n° 2008-12. Le consentement est
enregistré et peut être retiré à tout moment sans effet rétroactif.

## 6. Durée de conservation

- Cookies techniques : durée de la session ou 30 jours max.
- Cookies de mesure : 13 mois maximum (recommandation CNIL et CDP Sénégal).
- Le choix de consentement (accepter / refuser) est conservé 6 mois.

## 7. Modifications

Cette politique peut évoluer en cas de changement technique ou légal. La
version en vigueur est toujours celle disponible sur cette page.

## 8. Contact

Pour toute question concernant les cookies :

- **Protection des données** : {DPO_EMAIL}
- **Support** : {COMPANY_EMAIL}
- Vous pouvez également contacter la **CDP** (Commission de Protection des
  Données personnelles) — [www.cdp.sn](https://www.cdp.sn).
"""

# --- Conditions Clients ---------------------------------------------------
TERMS_CLIENTS = f"""# Conditions des clients

**Dernière mise à jour : {_today()}**

Les présentes Conditions particulières s'appliquent à toute personne
utilisant l'application ou le site {COMPANY_NAME} en qualité de **client**
(recherche, réservation, paiement d'une prestation). Elles complètent les
*Conditions Générales d'Utilisation*.

## 1. Éligibilité

Pour utiliser Jokoo en tant que client, vous devez :

- Avoir au moins **13 ans** (les mineurs doivent obtenir l'accord d'un parent
  ou tuteur légal).
- Résider ou effectuer une opération au **Sénégal**.
- Fournir des informations exactes et à jour (nom, téléphone, adresse).
- Ne pas être sous le coup d'une suspension antérieure de compte Jokoo.

## 2. Votre engagement

En tant que client, vous vous engagez à :

- Fournir des informations **exactes** lors de la réservation (adresse,
  horaires, description précise du besoin).
- **Payer** les prestations aux conditions convenues (méthode, montant,
  délais).
- **Respecter** le prestataire : ponctualité, courtoisie, conditions de
  travail décentes et sécurisées (accès au site, éclairage, matériel adéquat
  lorsque nécessaire).
- Publier des **avis sincères** et non-diffamatoires — la fabrication d'avis
  ou la manipulation de notes entraîne la suspension immédiate.
- Ne pas contacter le prestataire pour contourner Jokoo (paiement hors
  plateforme interdit — voir *Politique anti-fraude*).

## 3. Réservation et devis

- Vous pouvez réserver un prestataire directement (prix fixe / à partir de)
  ou demander un **devis personnalisé**.
- Le devis émis par le prestataire est valable **7 jours** sauf mention
  contraire.
- La confirmation vaut engagement contractuel avec le prestataire.

## 4. Paiement

Vous pouvez régler via :

- **Wave** (paiement mobile Sénégal).
- **Orange Money** (paiement mobile Sénégal).
- **Carte bancaire** (via Stripe, si activé).
- **Espèces à la fin de la prestation** (« cash on delivery »).

Les paiements en ligne sont sécurisés (chiffrement TLS 1.3, PCI-DSS pour
Stripe) et déposés en **entiercement (escrow)** jusqu'à la finalisation de
la mission.

## 5. Annulation par le client

- **Plus de 24h avant** la mission : annulation **gratuite**, remboursement
  intégral sous 3 à 10 jours ouvrés selon le moyen de paiement.
- **Moins de 24h avant** : jusqu'à **50 % du montant** peut être retenu au
  bénéfice du prestataire.
- **Après le début** de la prestation : montant non-remboursable, sauf
  litige avéré (voir *Politique de remboursement*).

## 6. Vos droits

- **Choisir librement** un prestataire parmi ceux référencés.
- **Comparer** les tarifs, notes, avis et zones de couverture.
- **Annuler** dans les conditions prévues.
- **Obtenir un remboursement** en cas de prestation non conforme ou de
  litige résolu en votre faveur.
- **Bloquer / signaler** un prestataire jugé inapproprié.
- **Supprimer votre compte** à tout moment.
- **Contacter le support** à tout moment via **{COMPANY_EMAIL}** ou le chat
  in-app.

## 7. Litiges

En cas de litige avec un prestataire :

1. **Tentez d'abord une résolution amiable** via le chat in-app (les
   échanges sont horodatés et archivés).
2. **Ouvrez un ticket** via *Profil → Aide → Signaler un problème* dans les
   **72 heures** suivant la prestation.
3. **Fournissez les preuves** (photos, factures, messages).
4. L'équipe de médiation Jokoo statue sous **7 jours ouvrés**.

## 8. Cas particulier — Jokoo Family (garde d'enfants, tutorat)

Les prestations impliquant des mineurs exigent :

- La présence d'un **adulte responsable** (vous ou un délégué majeur).
- La vérification préalable des documents du prestataire (carte étudiante
  active pour tutorat, **PSC1** – Prévention Secours Civique niveau 1 – pour
  la garde d'enfants).
- Un **briefing préalable** obligatoire (allergies, urgences, contacts).
- La signature d'une **décharge de responsabilité** pour toute activité hors
  domicile.

Voir *Politique de protection des enfants* pour les détails.

## 9. Suspension et bannissement

Nous pouvons suspendre ou supprimer votre compte en cas de :

- Faux avis ou manipulation de notes.
- Comportement irrespectueux ou menaçant.
- Non-paiement récurrent.
- Tentative de contournement de commission.
- Toute violation des CGU ou des lois en vigueur.

## 10. Contact

Support client : **{COMPANY_EMAIL}** — 7j/7, réponse sous 24h.
Réclamations formelles : **{LEGAL_EMAIL}**.
"""

# --- Conditions Prestataires ----------------------------------------------
TERMS_PRESTATAIRES = f"""# Conditions des prestataires

**Dernière mise à jour : {_today()}**

Les présentes Conditions particulières s'appliquent à toute personne
utilisant Jokoo en qualité de **prestataire** (offre de services aux
clients). Elles complètent les *Conditions Générales d'Utilisation*.

## 1. Statut du prestataire

En rejoignant Jokoo en tant que prestataire, vous exercez à titre
**indépendant et à vos risques**. Jokoo :

- N'est **ni votre employeur**, ni votre agent, ni un intermédiaire de
  placement salarial.
- N'établit **aucun lien de subordination** avec vous.
- **Ne fixe pas vos tarifs** — vous les définissez librement.
- **Ne garantit aucun volume** de missions.

Vous êtes seul responsable de votre **statut légal** (auto-entrepreneur,
GIE, société), de vos **déclarations fiscales**, de vos **cotisations
sociales** (IPRES, CSS) et de la souscription d'une **assurance
responsabilité civile professionnelle** appropriée.

## 2. Éligibilité

Pour devenir prestataire, vous devez :

- Avoir au moins **18 ans**.
- Résider et exercer votre activité au **Sénégal**.
- Fournir une **pièce d'identité valide** (CNI, passeport, carte de séjour).
- Justifier des **compétences professionnelles** (diplômes, certifications,
  photos de réalisations, références).
- Pour Jokoo Family : fournir **carte étudiante** (tutorat) ou **certificat
  PSC1** (garde d'enfants).
- Pour la mobilité (chauffeur / livreur) : **permis de conduire valide**,
  carte grise, assurance véhicule à jour.

## 3. Vérification KYC (Know Your Customer)

Chaque prestataire fait l'objet d'une **vérification d'identité** avant
activation :

1. Envoi des documents (CNI recto-verso, selfie de vérification).
2. Contrôle manuel par l'équipe Jokoo Verification (sous 24-72h).
3. Attribution du badge **Verified** (identité) puis **Verified+** après
   contrôle des références et — le cas échéant — des certifications
   professionnelles.

Voir *Politique de vérification des prestataires*.

## 4. Obligations professionnelles

- **Décrire honnêtement** vos compétences, expérience et tarifs.
- Ne pas surestimer vos capacités ni tromper les clients.
- **Respecter les créneaux** confirmés (ponctualité, disponibilité).
- Réaliser les prestations conformément aux **règles de l'art** et à la
  **législation sénégalaise** (normes techniques, sécurité, hygiène).
- Émettre les **factures** demandées par les clients.
- Payer vos **cotisations sociales et fiscales**.
- Respecter la **confidentialité** des clients (informations, adresses,
  données de santé, contenus des conversations).
- Ne jamais discriminer sur un motif prohibé (race, religion, genre,
  handicap, etc.).

## 5. Tarification et commission Jokoo

- Vous fixez vos tarifs librement (fixe, « à partir de », sur devis).
- Une **commission de service** est prélevée sur chaque transaction. Le taux
  est **affiché lors de votre inscription** et communiqué avant chaque
  transaction. Toute évolution est notifiée avec un préavis de 30 jours.
- La commission couvre : l'hébergement, la mise en relation, le paiement
  sécurisé, la modération, le support client et le marketing.

## 6. Escrow (paiement sécurisé)

- Les paiements clients sont conservés en **entiercement (escrow)** par
  Jokoo via nos partenaires financiers agréés.
- Les fonds sont **libérés au prestataire** :
  - **48 heures après la fin** de la prestation, si aucune contestation
    n'est ouverte.
  - Immédiatement si le client valide manuellement la fin de mission.
- En cas de **litige**, les fonds restent bloqués jusqu'à décision de
  l'équipe de médiation Jokoo (sous 7 jours ouvrés).

## 7. Annulation par le prestataire

- Toute annulation moins de 24h avant la prestation impacte votre **note de
  fiabilité** et déclenche un rappel qualité.
- **3 annulations tardives en 30 jours** entraînent une suspension
  temporaire de 7 jours.
- Cas de force majeure : sur justificatif, aucun impact sur la note.

## 8. Notes et avis clients

- Les clients notent chaque prestation (1 à 5 étoiles + commentaire).
- Les avis sont **publics**, modérés a posteriori (voir *Politique des
  avis*).
- Vous pouvez répondre publiquement à un avis.
- Manipulation d'avis (faux clients, échange de notes) = **bannissement
  immédiat**.

## 9. Abonnement Jokoo Pro (optionnel, Android uniquement)

Jokoo Pro est un abonnement mensuel offrant :

- Badge **Pro** sur votre profil.
- Priorité dans les résultats de recherche.
- Statistiques avancées.
- Support prioritaire.

L'abonnement est facturé mensuellement, résiliable à tout moment sans
préavis. La résiliation prend effet à la fin de la période payée.
**Non disponible sur iOS** pour se conformer aux règles de l'App Store.

## 10. Suspension et exclusion

Nous pouvons suspendre ou exclure un prestataire en cas de :

- Fraude d'identité, faux diplômes ou fausses certifications.
- Vol, escroquerie, agression envers un client.
- Non-respect grave des obligations professionnelles.
- Contournement de la commission (paiement direct).
- Fausse déclaration lors du KYC.
- Note moyenne < 3/5 après 20 prestations et absence d'amélioration après
  rappel qualité.
- Toute violation des CGU ou des lois sénégalaises.

## 11. Fin de collaboration

Vous pouvez fermer votre compte prestataire à tout moment via *Profil →
Paramètres → Supprimer mon compte*. Les paiements en escrow seront
libérés selon les règles standard. Les données restent conservées
conformément aux obligations légales (10 ans pour la comptabilité).

## 12. Contact

Support prestataires : **prestataires@jokooservices.com** ou
**{COMPANY_EMAIL}**.
Réclamations : **{LEGAL_EMAIL}**.
"""


# --- Politique de remboursement (renforcée) -------------------------------
REFUND_POLICY = f"""# Politique de remboursement

**Dernière mise à jour : {_today()}**

Cette politique décrit les conditions dans lesquelles un client peut obtenir
le **remboursement** total ou partiel d'une prestation payée via Jokoo.

## 1. Principe général

Un remboursement est possible lorsque **la mission n'a pas été réalisée**,
lorsqu'elle est **non conforme** à la description ou au devis, ou en cas de
**force majeure** empêchant l'exécution.

## 2. Cas de remboursement intégral (100 %)

- Mission **annulée par le prestataire**.
- Mission **non commencée** dans le délai convenu (retard > 2h non justifié).
- Mission **manifestement non conforme** au devis (constatée sur photos ou
  témoignages).
- **Force majeure** : maladie grave, décès d'un proche, catastrophe
  naturelle, ordre gouvernemental (justificatif requis).
- **Erreur technique de Jokoo** ayant entraîné un double-paiement.

## 3. Cas de remboursement partiel (50 % ou plus)

- Annulation par le client **entre 12h et 24h** avant la mission.
- Prestation **partiellement exécutée** (le prestataire a débuté mais n'a
  pas terminé pour raison légitime).
- **Litige résolu partiellement** en faveur du client.

## 4. Cas de non-remboursement

- Annulation par le client **moins de 12h** avant la mission (sauf force
  majeure).
- Prestation **complètement exécutée** conformément au devis.
- **Insatisfaction subjective** non-étayée par des preuves (photos, avis
  d'un tiers).
- Demande de remboursement au-delà de **72 heures** après la fin de la
  prestation.
- **Fraude ou tentative de fraude** avérée du client.

## 5. Procédure

1. Ouvrez un **ticket** dans les 72h suivant la mission via
   *Profil → Aide → Demander un remboursement*.
2. Décrivez précisément le problème et joignez des **preuves** (photos,
   messages, factures).
3. L'équipe de médiation Jokoo étudie la demande sous **7 jours ouvrés**.
4. La décision est notifiée par e-mail et in-app.
5. En cas d'accord, le **remboursement** est effectué :
   - **Wave / Orange Money** : sous 24 à 72 heures.
   - **Carte bancaire (Stripe)** : sous 5 à 10 jours ouvrés (délai bancaire).
   - **Espèces** : crédit sur le portefeuille Jokoo, utilisable pour une
     future prestation ou remboursable sur demande.

## 6. Recours

Si vous contestez la décision de médiation, vous pouvez :

- Demander un **réexamen** avec de nouvelles preuves.
- Saisir le **service juridique** à {LEGAL_EMAIL}.
- Recourir à la médiation externe si applicable.
- Engager une procédure judiciaire (tribunal compétent de Dakar).

## 7. Contact

Support : **{COMPANY_EMAIL}**.
Médiation : **{LEGAL_EMAIL}**.
"""


def _build_seed_legal_contents():
    """Retourne le dictionnaire slug -> contenu markdown production."""
    return {
        "privacy": PRIVACY,
        "cgu": CGU,
        "mentions-legales": MENTIONS_LEGALES,
        "cookies": COOKIES,
        "terms-clients": TERMS_CLIENTS,
        "terms-prestataires": TERMS_PRESTATAIRES,
        "refund-policy": REFUND_POLICY,
    }
