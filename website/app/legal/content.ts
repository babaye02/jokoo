// AUTO-GENERATED — DO NOT EDIT MANUALLY
// Bundle statique du Centre juridique Jokoo. Servi côté public par Vercel sans
// dépendance au backend, pour garantir des textes juridiques COMPLETS et à
// jour même si le backend production n'a pas encore été redéployé.
//
// Source de vérité : `/app/backend/seed_legal_contents.py` (dev) puis re-seed
// via /api/seed. Pour synchroniser à nouveau ce fichier :
//   1. Assurez-vous que la DB locale contient les documents à jour.
//   2. Exécutez `python3 scripts/export_legal_bundle.py` (à ajouter si besoin).

export type LegalDocBundle = {
  slug: string;
  title: string;
  summary?: string;
  category: string;
  language: string;
  country: string;
  version: number;
  order: number;
  requires_acceptance: boolean;
  published: boolean;
  effective_date: string;
  updated_at: string;
  content: string;
};

export const LEGAL_DOCS_BUNDLE: LegalDocBundle[] = [
  {
    slug: "cgu",
    title: "Conditions générales d'utilisation",
    summary: "Document juridique de Jokoo — Conditions générales d'utilisation",
    category: "conditions",
    language: "fr",
    country: "SN",
    version: 3,
    order: 10,
    requires_acceptance: true,
    published: true,
    effective_date: "2026-08-06",
    updated_at: "2026-08-06T15:22:49.955871+00:00",
    content: `# Conditions générales d'utilisation

**Dernière mise à jour : 2026-08-06**

## 1. Présentation

Jokoo Services SAS édite l'application mobile et le site web **Jokoo**,
mettant en relation des clients et des prestataires de services qualifiés au
Sénégal (plomberie, électricité, coiffure, ménage, baby-sitting, tutorat,
covoiturage, livraison, etc.). En créant un compte, vous acceptez sans
réserve les présentes Conditions Générales d'Utilisation (« CGU »).

## 2. Compte utilisateur

Vous devez avoir au moins **13 ans**, fournir des informations exactes et
maintenir la confidentialité de votre mot de passe. Vous êtes seul
responsable des activités effectuées depuis votre compte. Un seul compte par
personne est autorisé. Vous devez nous notifier immédiatement toute
utilisation non autorisée de votre compte à **support@jokooservices.com**.

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
techniques de Jokoo sont la propriété exclusive de Jokoo Services SAS.
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
**legal@jokooservices.com**.

## 12. Contact

**legal@jokooservices.com** — Jokoo Services SAS, Dakar, Sénégal.
`,
  },
  {
    slug: "privacy",
    title: "Politique de confidentialité",
    summary: "Document juridique de Jokoo — Politique de confidentialité",
    category: "conditions",
    language: "fr",
    country: "SN",
    version: 3,
    order: 20,
    requires_acceptance: true,
    published: true,
    effective_date: "2026-08-06",
    updated_at: "2026-08-06T15:22:49.955871+00:00",
    content: `# Politique de confidentialité

**Dernière mise à jour : 2026-08-06**

## 1. Qui sommes-nous ?

Jokoo Services SAS (« Jokoo Services », « nous », « notre ») édite l'application
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
  Paramètres → Supprimer mon compte* ou en écrivant à privacy@jokooservices.com).
- **Portabilité** dans un format lisible (JSON export).
- **Opposition** au traitement marketing.
- **Limitation** du traitement dans certains cas.
- **Retrait du consentement** à tout moment sans effet rétroactif.

Pour exercer ces droits, écrivez à **privacy@jokooservices.com** ou depuis l'application
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

- Délégué à la protection des données : **privacy@jokooservices.com**
- Support général : **support@jokooservices.com**
- Adresse : Jokoo Services SAS, Dakar, Sénégal.

Vous pouvez également saisir la **CDP (Commission de protection des données
personnelles)** du Sénégal — [www.cdp.sn](https://www.cdp.sn).
`,
  },
  {
    slug: "cookies",
    title: "Politique relative aux cookies",
    summary: "Document juridique de Jokoo — Politique relative aux cookies",
    category: "conditions",
    language: "fr",
    country: "SN",
    version: 3,
    order: 30,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-08-06",
    updated_at: "2026-08-06T15:22:49.955871+00:00",
    content: `# Politique relative aux cookies

**Dernière mise à jour : 2026-08-06**

Cette politique explique quels **cookies** et **technologies de traçage
locales** sont utilisés par Jokoo Services SAS sur l'application mobile
Jokoo et le site web https://jokooservices.com.

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
| \`jokoo_web_token\` | Session utilisateur authentifié | 30 jours |
| \`jokoo_locale\` | Langue préférée | 6 mois |
| \`next-auth.csrf-token\` | Protection CSRF (sécurité) | Session |

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

- **Protection des données** : privacy@jokooservices.com
- **Support** : support@jokooservices.com
- Vous pouvez également contacter la **CDP** (Commission de Protection des
  Données personnelles) — [www.cdp.sn](https://www.cdp.sn).
`,
  },
  {
    slug: "mentions-legales",
    title: "Mentions légales",
    summary: "Document juridique de Jokoo — Mentions légales",
    category: "conditions",
    language: "fr",
    country: "SN",
    version: 3,
    order: 40,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-08-06",
    updated_at: "2026-08-06T15:22:49.955871+00:00",
    content: `# Mentions légales

**Dernière mise à jour : 2026-08-06**

## 1. Éditeur du site et de l'application

- **Raison sociale** : Jokoo Services SAS
- **Forme juridique** : Société par actions simplifiée (SAS)
- **Siège social** : Dakar, Sénégal
- **Registre du commerce** : à préciser (RCCM Dakar)
- **NINEA** : à préciser
- **Capital social** : à préciser
- **Représentant légal** : Président de Jokoo Services SAS
- **Contact général** : support@jokooservices.com
- **Contact juridique** : legal@jokooservices.com
- **DPO / Protection des données** : privacy@jokooservices.com
- **Site web** : https://jokooservices.com

## 2. Directeur de la publication

L'équipe fondatrice de Jokoo Services SAS, joignable à **legal@jokooservices.com**.

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
préalable de Jokoo Services SAS, est strictement interdite** et constitue
une contrefaçon sanctionnée par les articles pénaux applicables.

La marque « Jokoo » est en cours d'enregistrement auprès de l'OAPI
(Organisation Africaine de la Propriété Intellectuelle).

## 6. Signalement de contenu illicite (LCEN & article 15 DSA)

Conformément à la législation en vigueur (loi n° 2008-08 sur les
transactions électroniques et Digital Services Act européen lorsqu'il
s'applique), tout contenu manifestement illicite peut être signalé à :

- **E-mail** : legal@jokooservices.com
- **Objet** : « Signalement de contenu illicite »
- Fournir : URL / capture d'écran, identifiant utilisateur, motif détaillé.
- **Délai de traitement** : sous **48 heures** ouvrées.

Les signalements de mineurs en danger sont traités en **priorité absolue**
(voir *Politique de protection des enfants*).

## 7. Liens hypertextes

Jokoo peut proposer des liens vers des sites tiers. Nous ne saurions être
tenus responsables du contenu ou des politiques de confidentialité de ces
sites tiers. La création d'un lien vers jokooservices.com est libre à
condition de ne pas nuire à l'image de Jokoo Services.

## 8. Loi applicable

Les présentes mentions légales sont soumises au **droit sénégalais**. Tout
litige sera porté devant les tribunaux compétents de **Dakar**.

## 9. Contact

- Support : **support@jokooservices.com**
- Juridique : **legal@jokooservices.com**
- Protection des données : **privacy@jokooservices.com**
`,
  },
  {
    slug: "terms-prestataires",
    title: "Conditions des prestataires",
    summary: "Document juridique de Jokoo — Conditions des prestataires",
    category: "conditions",
    language: "fr",
    country: "SN",
    version: 3,
    order: 50,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-08-06",
    updated_at: "2026-08-06T15:22:49.955871+00:00",
    content: `# Conditions des prestataires

**Dernière mise à jour : 2026-08-06**

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
**support@jokooservices.com**.
Réclamations : **legal@jokooservices.com**.
`,
  },
  {
    slug: "terms-clients",
    title: "Conditions des clients",
    summary: "Document juridique de Jokoo — Conditions des clients",
    category: "conditions",
    language: "fr",
    country: "SN",
    version: 3,
    order: 60,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-08-06",
    updated_at: "2026-08-06T15:22:49.955871+00:00",
    content: `# Conditions des clients

**Dernière mise à jour : 2026-08-06**

Les présentes Conditions particulières s'appliquent à toute personne
utilisant l'application ou le site Jokoo Services en qualité de **client**
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
- **Contacter le support** à tout moment via **support@jokooservices.com** ou le chat
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

Support client : **support@jokooservices.com** — 7j/7, réponse sous 24h.
Réclamations formelles : **legal@jokooservices.com**.
`,
  },
  {
    slug: "refund-policy",
    title: "Politique de remboursement",
    summary: "Dans quels cas Jokoo procède à un remboursement, et selon quelles modalités.",
    category: "paiements",
    language: "fr",
    country: "SN",
    version: 4,
    order: 70,
    requires_acceptance: true,
    published: true,
    effective_date: "2026-08-06",
    updated_at: "2026-08-06T15:22:49.955871+00:00",
    content: `# Politique de remboursement

**Dernière mise à jour : 2026-08-06**

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
- Saisir le **service juridique** à legal@jokooservices.com.
- Recourir à la médiation externe si applicable.
- Engager une procédure judiciaire (tribunal compétent de Dakar).

## 7. Contact

Support : **support@jokooservices.com**.
Médiation : **legal@jokooservices.com**.
`,
  },
  {
    slug: "cancellation-policy",
    title: "Politique d'annulation",
    summary: "Délais et conditions pour annuler une mission Jokoo sans frais.",
    category: "paiements",
    language: "fr",
    country: "SN",
    version: 3,
    order: 80,
    requires_acceptance: true,
    published: true,
    effective_date: "2026-07-30",
    updated_at: "2026-08-04T14:20:32.106816+00:00",
    content: `## 1. Annulation par le Client

### 1.1 Annulation gratuite
- Plus de **24 heures** avant la mission (services à domicile).
- Plus de **6 heures** avant un trajet de covoiturage.
- Plus de **48 heures** avant une mission Jokoo Family (baby-sitting, tutorat).

### 1.2 Annulation partiellement facturée
- **Entre 24 h et 2 h** avant la mission : 25 % du montant conservé par le Prestataire.
- **Moins de 2 h** avant la mission : 50 % du montant conservé.
- **Absence du Client** au rendez-vous : 100 % conservé, aucun remboursement.

### 1.3 Cas de force majeure
- Une annulation liée à un cas de **force majeure** (maladie grave, décès dans la famille, catastrophe naturelle) peut être remboursée à 100 % sur présentation d'un justificatif.

## 2. Annulation par le Prestataire

- Le Prestataire peut annuler à tout moment, mais s'expose à des sanctions en cas d'abus.
- Une **annulation tardive** (< 2 h) entraîne :
  - Remboursement intégral au Client.
  - Une **pénalité** appliquée au portefeuille du Prestataire.
  - Une note interne de fiabilité impactant son classement.
- Trois annulations tardives en 3 mois entraînent une **suspension temporaire** de 30 jours.

## 3. Annulation par Jokoo

Jokoo peut annuler une mission :
- En cas de **soupçon de fraude**.
- En cas de **violation** des CGU par l'une des parties.
- En cas d'**incident technique majeur**.

Dans ces cas, le Client est **intégralement remboursé** et Jokoo peut proposer une compensation.

## 4. Trajets récurrents et abonnements

- Les trajets récurrents peuvent être annulés jusqu'à **24 h** avant chaque occurrence.
- Un abonnement peut être résilié à tout moment sans motif, avec effet à la prochaine échéance.

## 5. Procédure

1. Ouvrez la mission concernée dans l'app.
2. Cliquez sur **Annuler la mission**.
3. Sélectionnez le motif.
4. La confirmation est immédiate, un e-mail récapitulatif est envoyé.

## 6. Contact

\`support@jokooservices.com\``,
  },
  {
    slug: "payment-policy",
    title: "Politique de paiement",
    summary: "Modalités de paiement, commissions, portefeuille et retraits sur Jokoo.",
    category: "paiements",
    language: "fr",
    country: "SN",
    version: 3,
    order: 90,
    requires_acceptance: true,
    published: true,
    effective_date: "2026-07-30",
    updated_at: "2026-08-04T14:20:32.105340+00:00",
    content: `## 1. Moyens de paiement acceptés

- **Wave** — paiement mobile (Sénégal).
- **Orange Money** — paiement mobile (Sénégal).
- **Carte bancaire** via Stripe (Visa, Mastercard).
- **Espèces** — uniquement en accord direct entre Client et Prestataire, hors garantie Jokoo.

## 2. Sécurité des paiements

- Les paiements en ligne sont traités par des **prestataires certifiés PCI-DSS**.
- Jokoo **ne stocke pas** le numéro complet des cartes bancaires.
- Chaque transaction est chiffrée et signée cryptographiquement.

## 3. Fonctionnement d'une transaction

1. Le Client confirme la mission et paie le montant convenu.
2. Le paiement est **mis en séquestre** sur la plateforme (pour les catégories concernées).
3. Une fois la mission validée par le Client, Jokoo **libère les fonds** vers le portefeuille du Prestataire, déduction faite de la commission.
4. En cas de litige, les fonds restent bloqués jusqu'à résolution.

## 4. Commission Jokoo

Jokoo prélève une **commission** sur chaque mission payée via la Plateforme :
- **Services à domicile** : 12 %
- **Mobilité (covoiturage, livraison)** : 10 %
- **Jokoo Family (baby-sitting, tutorat)** : 15 %
- **Missions premium (Vérifié+)** : jusqu'à 15 %

Ces taux peuvent évoluer avec un préavis de **30 jours**.

## 5. Portefeuille Prestataire

- Chaque Prestataire dispose d'un **portefeuille virtuel** accessible dans l'app.
- Deux soldes sont affichés : **disponible** (retirable) et **en attente** (mission en cours de validation).

## 6. Retraits

- Retraits vers **Wave, Orange Money ou compte bancaire**.
- **Montant minimum** : 2 000 FCFA.
- **Délai** : 24 à 48 heures ouvrées.
- **Frais** : gratuits jusqu'à 3 retraits par mois, au-delà 100 FCFA par retrait.

## 7. Facturation

- Le Client reçoit un **reçu numérique** dans l'app pour chaque transaction.
- Le Prestataire dispose d'un **historique complet** exportable au format CSV.
- Les factures fiscales pour les professionnels sont émises par le Prestataire lui-même, Jokoo n'étant pas l'émetteur du service.

## 8. Fiscalité

Le Prestataire est **seul responsable** de ses obligations fiscales et sociales. Jokoo peut, si la loi l'exige, transmettre les données de revenus aux autorités fiscales sénégalaises.

## 9. Incidents et litiges

- Voir *Politique de remboursement* et *Politique anti-fraude*.
- Pour toute question : \`paiements@jokooservices.com\`.`,
  },
  {
    slug: "verification-policy",
    title: "Politique de vérification des prestataires",
    summary: "Comment Jokoo vérifie l'identité, les compétences et l'intégrité des prestataires.",
    category: "securite",
    language: "fr",
    country: "SN",
    version: 3,
    order: 100,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-07-30",
    updated_at: "2026-08-04T14:20:32.108289+00:00",
    content: `## 1. Objectif

Vérifier l'identité et les compétences des Prestataires pour **protéger la communauté** et bâtir la confiance.

## 2. Vérifications obligatoires (tous les prestataires)

- **Identité** : Carte Nationale d'Identité ou passeport en cours de validité.
- **Numéro de téléphone** validé par OTP.
- **E-mail** validé par lien de confirmation.
- **Photo de profil** claire et récente.
- **Adresse** : justificatif de domicile de moins de 3 mois.

## 3. Vérifications spécifiques selon la catégorie

### 3.1 Métiers techniques (plomberie, électricité, gaz)
- **Diplôme ou attestation d'expérience**.
- **Assurance de responsabilité civile professionnelle**.

### 3.2 Mobilité (covoiturage, livraison)
- **Permis de conduire** valide.
- **Carte grise** du véhicule.
- **Assurance auto** en cours de validité.
- **Contrôle technique** valide.

### 3.3 Jokoo Family (baby-sitting, tutorat, aide aux devoirs)
- **Casier judiciaire vierge** (extrait de moins de 3 mois).
- **Certificat de premiers secours** (baby-sitting).
- **Références vérifiables** (2 anciens employeurs minimum).
- Entretien téléphonique avec un membre de l'équipe Jokoo.

### 3.4 Santé, esthétique, coiffure
- **Diplôme** ou certification correspondants.
- **Autorisation d'exercice** si applicable.

## 4. Badge Vérifié

Un prestataire vérifié obtient le **badge Vérifié** ✅ affiché sur son profil.

## 5. Badge Vérifié+

Le **badge Vérifié+** ⭐ est décerné aux prestataires cumulant :
- Toutes les vérifications ci-dessus.
- **20 missions minimum** notées 4,5 ★ ou plus.
- **Casier judiciaire vierge**.
- **Formation continue** attestée.

Le badge Vérifié+ peut être **retiré** à tout moment en cas de violation des règles.

## 6. Renouvellement

- Les documents d'identité sont revérifiés à leur **date d'expiration**.
- Le casier judiciaire est **renouvelé tous les 2 ans** pour les catégories concernées.
- L'assurance auto est **vérifiée à chaque échéance**.

## 7. Contrôles ponctuels

Jokoo peut effectuer des **contrôles ponctuels** (visite mystère, appel de vérification, contrôle documentaire) à tout moment.

## 8. Sanctions en cas de fausse déclaration

Toute **fausse déclaration** ou fourniture de **faux document** entraîne :
- La **fermeture définitive** du compte.
- Le **signalement aux autorités**.
- Une **interdiction à vie** de la Plateforme.

## 9. Contact

\`verification@jokooservices.com\``,
  },
  {
    slug: "security-policy",
    title: "Politique de sécurité",
    summary: "Nos règles et bonnes pratiques pour garantir la sécurité de la communauté Jokoo.",
    category: "securite",
    language: "fr",
    country: "SN",
    version: 3,
    order: 110,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-07-30",
    updated_at: "2026-08-04T14:20:32.107565+00:00",
    content: `## 1. Notre engagement

La sécurité des Utilisateurs est la **priorité absolue** de Jokoo. Cette politique décrit les mesures que nous prenons et celles que vous devez respecter.

## 2. Sécurité du compte

- **Mot de passe fort** obligatoire (minimum 8 caractères, mélange majuscules/minuscules/chiffres).
- **Authentification à deux facteurs (2FA)** recommandée.
- **Alertes en cas de connexion suspecte** (nouvel appareil, nouvelle ville).
- **Blocage automatique** après 5 tentatives de connexion échouées.

## 3. Sécurité pendant une mission

Avant une mission :
- Vérifiez le **profil, la note et les avis** du prestataire ou du client.
- Confirmez l'**adresse et l'horaire** dans l'app.
- Partagez votre statut avec un proche (fonction *Partager mon trajet*).

Pendant la mission :
- N'acceptez pas de **paiement hors app** contraire aux CGU.
- Ne divulguez pas d'informations financières sensibles (RIB complet, code carte).
- Utilisez le **bouton SOS** en cas de danger immédiat.

Après la mission :
- Marquez-la comme **Terminée** dans l'app.
- Laissez un **avis honnête**.

## 4. Sécurité physique

- Ne restez jamais **seul(e) avec un mineur** sans autorisation parentale.
- Portez les **équipements de protection** adaptés à votre métier.
- Refusez toute mission qui semble **illégale ou dangereuse**.

## 5. Sécurité numérique

- Ne partagez **jamais** votre code OTP.
- Méfiez-vous des messages demandant vos identifiants (phishing).
- Utilisez la **messagerie in-app** plutôt que d'autres canaux non sécurisés.

## 6. Signalement d'un incident

- **Urgence** : bouton **SOS** dans l'app (24/7).
- **E-mail** : \`security@jokooservices.com\`
- **Police** : 17.
- **Pompiers** : 18.
- **SAMU** : 15.

## 7. Vulnérabilités techniques

Si vous découvrez une **faille de sécurité** dans nos systèmes, écrivez à \`security@jokooservices.com\`. Nous accueillons les chercheurs de bonne foi (*responsible disclosure*) et pouvons offrir une récompense.

## 8. Ne restez pas seul

Un doute, une inquiétude ? Contactez le support 24/7. Nous préférerons **toujours** un signalement d'excès de prudence qu'un incident non signalé.`,
  },
  {
    slug: "anti-fraud",
    title: "Politique anti-fraude",
    summary: "Notre stratégie de lutte contre la fraude sur Jokoo.",
    category: "securite",
    language: "fr",
    country: "SN",
    version: 3,
    order: 120,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-07-30",
    updated_at: "2026-08-04T14:20:32.109004+00:00",
    content: `## 1. Types de fraude combattus

- **Usurpation d'identité** (faux profils, faux documents).
- **Faux avis** (positifs ou négatifs).
- **Contournement de commission** (transactions hors app pour éviter les frais).
- **Fraude au paiement** (cartes volées, contestations abusives).
- **Blanchiment d'argent** ou financement d'activités illicites.
- **Fraude à la promo** (usage abusif de codes de réduction, comptes multiples).
- **Escroquerie** (services non réalisés, faux devis).

## 2. Détection

Jokoo combine :
- **Vérification KYC** à l'inscription (voir *Politique de vérification*).
- **Détection algorithmique** (analyse comportementale, IP, empreinte d'appareil).
- **Équipe fraude** dédiée basée à Dakar.
- **Partenariats bancaires** pour valider les moyens de paiement.
- **Signalements utilisateurs** — bouton *Signaler*.

## 3. Actions en cas de suspicion

- **Blocage préventif** du compte le temps de l'enquête.
- **Vérification renforcée** (documents complémentaires, appel vidéo).
- **Gel des fonds** en cas de suspicion sérieuse.

## 4. Sanctions en cas de fraude établie

- **Fermeture définitive** du compte.
- **Confiscation des sommes** issues de la fraude.
- **Interdiction à vie** de la Plateforme.
- **Signalement aux autorités** compétentes (police, parquet, CENTIF pour le blanchiment).
- **Poursuites judiciaires** civiles et/ou pénales.

## 5. Coopération avec les autorités

Jokoo coopère activement avec :
- La **police nationale**.
- La **Cellule nationale de traitement des informations financières (CENTIF)**.
- La **Direction de la surveillance du territoire**.
- Les **autorités judiciaires** sur réquisition motivée.

## 6. Recours

L'Utilisateur suspecté peut fournir des éléments de défense sous **15 jours**. Une décision définitive est rendue sous **15 jours ouvrés** après examen.

## 7. Signalement

Pour signaler une fraude : \`fraude@jokooservices.com\` ou bouton **Signaler** in-app.

## 8. Récompenses

Jokoo peut, à sa discrétion, récompenser les Utilisateurs dont le signalement permet de démasquer une fraude majeure.`,
  },
  {
    slug: "content-moderation",
    title: "Politique de modération des contenus",
    summary: "Comment Jokoo modère les contenus publiés (profils, messages, avis, annonces).",
    category: "communaute",
    language: "fr",
    country: "SN",
    version: 3,
    order: 130,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-07-30",
    updated_at: "2026-08-04T14:20:32.097526+00:00",
    content: `## 1. Champ d'application

La présente politique régit la modération de **tous les contenus** publiés sur Jokoo :
- Profils, photos et descriptions.
- Messages échangés via la messagerie in-app.
- Avis, commentaires et évaluations.
- Annonces de services, publicités et espaces sponsorisés.

## 2. Contenus interdits

Sont strictement interdits :

- Contenus **illicites** au regard de la loi sénégalaise.
- **Propos haineux**, racistes, xénophobes, sexistes, homophobes ou incitant à la violence.
- **Contenus à caractère sexuel** explicite, en particulier impliquant des mineurs.
- **Contenus violents, glorifiant le terrorisme, la traite ou la torture**.
- **Fausses informations** sur les qualifications, tarifs, disponibilités ou lieux.
- **Contenus commerciaux non autorisés** (démarchage, spam, arnaques).
- **Contenus violant des droits d'auteur** (photos non autorisées, logos, etc.).
- **Coordonnées personnelles** de tiers sans leur consentement.

## 3. Modération proactive

Jokoo utilise :
- Des **filtres automatiques** (mots-clés, image hashing).
- Une **équipe de modérateurs humains** basée à Dakar.
- Des **contrôles aléatoires** de profils et d'annonces.

Les contenus flaggés sont revus **sous 24 heures** en règle générale.

## 4. Modération réactive

Chaque utilisateur peut signaler un contenu via le bouton **Signaler**. Le formulaire demande :
- Le type d'infraction.
- Une description contextuelle.
- D'éventuelles pièces justificatives.

Un accusé de réception est envoyé sous 24 heures.

## 5. Décisions et sanctions

Après examen, Jokoo peut :

- **Ne prendre aucune mesure** (contenu conforme).
- **Masquer ou retirer** le contenu.
- **Adresser un avertissement** à l'auteur.
- **Suspendre** temporairement le compte.
- **Fermer définitivement** le compte.
- **Transmettre les éléments aux autorités** compétentes.

## 6. Droit de recours

L'utilisateur sanctionné est notifié par e-mail et in-app. Il peut contester sous **15 jours** en écrivant à \`legal@jokooservices.com\`. Une décision motivée finale est rendue sous 15 jours ouvrés.

## 7. Transparence

Jokoo publiera annuellement un **rapport de transparence** synthétique indiquant :
- Le nombre de signalements traités.
- Le nombre de contenus retirés.
- Le nombre de comptes suspendus / fermés.
- Les principaux motifs d'action.

## 8. Contenus émanant des autorités

Jokoo coopère de bonne foi avec les autorités judiciaires ou administratives sénégalaises dans le cadre de leurs missions légales.`,
  },
  {
    slug: "children-protection",
    title: "Politique de protection des enfants",
    summary: "Nos engagements pour protéger les mineurs dans l'utilisation de Jokoo.",
    category: "securite",
    language: "fr",
    country: "SN",
    version: 3,
    order: 140,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-07-30",
    updated_at: "2026-08-04T14:20:32.109747+00:00",
    content: `## 1. Principe fondamental

**Protéger les enfants** — mineurs de 18 ans — est une **exigence absolue** chez Jokoo. Aucune tolérance n'est accordée aux comportements qui les mettraient en danger.

## 2. Accès à la Plateforme

- L'inscription à Jokoo est réservée aux personnes **majeures** (18 ans révolus).
- Les mineurs de 16 à 17 ans peuvent utiliser Jokoo **uniquement avec l'autorisation écrite** d'un représentant légal.
- Les mineurs de moins de 16 ans ne peuvent pas ouvrir de compte.

## 3. Prestataires en contact avec des enfants

Toute mission impliquant des mineurs (baby-sitting, tutorat, activités éducatives) est encadrée par des **exigences renforcées** :

- **Casier judiciaire vierge** de moins de 3 mois.
- **Vérification renforcée** de l'identité et du domicile.
- **Références vérifiables** auprès d'anciens employeurs.
- **Entretien** avec un membre de l'équipe Jokoo Family.
- **Formation premiers secours** exigée pour le baby-sitting.

## 4. Obligations des prestataires

Les prestataires en contact avec des enfants s'engagent à :
- **Ne jamais rester seuls** avec un mineur en dehors du cadre prévu par la mission et sans consentement parental écrit.
- **Ne pas prendre de photos/vidéos** de l'enfant sans autorisation écrite des parents.
- **Ne pas partager** ces images sur les réseaux sociaux ou avec des tiers.
- **Signaler immédiatement** tout comportement inapproprié dont ils seraient témoins.

## 5. Interdictions absolues

Est **strictement interdit et sanctionné par la fermeture immédiate du compte + signalement judiciaire** :
- Toute violence physique, morale ou sexuelle sur mineur.
- Toute production, diffusion ou détention de contenu à caractère pédopornographique.
- Toute forme d'exploitation d'un mineur.
- Toute prise de contact déplacée avec un enfant.

## 6. Contenu inapproprié

Jokoo modère activement tout contenu potentiellement dangereux pour un mineur (voir *Politique de modération*). Les contenus signalés dans cette catégorie sont traités en **priorité absolue** (sous 4 heures).

## 7. Coopération avec les autorités

Jokoo signale **systématiquement** aux autorités compétentes :
- Toute suspicion sérieuse de maltraitance.
- Toute production ou diffusion de contenu pédopornographique.
- Toute mise en danger d'un mineur.

Nous coopérons avec les cellules spécialisées de la **police**, du **parquet** et des **associations de protection de l'enfance**.

## 8. Bouton SOS

Un bouton **SOS 24/7** est disponible pour tout parent ou mineur en situation de danger. Il alerte immédiatement l'équipe Jokoo et peut transmettre la géolocalisation aux secours.

## 9. Formation et sensibilisation

L'équipe Jokoo est **formée** annuellement à la détection et au signalement des abus contre les enfants.

## 10. Contact

\`family@jokooservices.com\` — bouton SOS pour les urgences.`,
  },
  {
    slug: "data-protection",
    title: "Politique de protection des données",
    summary: "Mesures techniques et organisationnelles mises en place pour protéger vos données.",
    category: "conditions",
    language: "fr",
    country: "SN",
    version: 3,
    order: 150,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-07-30",
    updated_at: "2026-08-04T14:20:32.102330+00:00",
    content: `## 1. Objet

La présente politique complète la *Politique de confidentialité* et décrit les **mesures techniques et organisationnelles** mises en œuvre par Jokoo pour protéger les données à caractère personnel.

## 2. Principes fondamentaux

- **Minimisation** : nous ne collectons que ce qui est strictement nécessaire.
- **Exactitude** : nous maintenons les données à jour.
- **Limitation de conservation** : nous supprimons les données obsolètes.
- **Intégrité et confidentialité** : nous les protégeons contre tout accès non autorisé.
- **Responsabilité** : nous documentons et auditons nos traitements.

## 3. Mesures techniques

- **Chiffrement TLS 1.2+** pour toutes les communications réseau.
- **Chiffrement au repos** des bases de données sensibles.
- **Hachage des mots de passe** via bcrypt (facteur ≥ 12).
- **Journalisation** des accès et actions administratives.
- **Isolement des environnements** (dev / staging / prod).
- **Sauvegardes chiffrées** avec redondance géographique.

## 4. Mesures organisationnelles

- **Contrôle d'accès basé sur les rôles (RBAC)**.
- **Accès administratif** limité et audité.
- **Sensibilisation** régulière des collaborateurs.
- **Clauses de confidentialité** dans tous les contrats.
- **Registre des traitements** tenu à jour.
- **DPO nommé** : \`dpo@jokooservices.com\`.

## 5. Gestion des incidents de sécurité

En cas de **violation de données personnelles**, Jokoo s'engage à :
- Détecter l'incident dans les meilleurs délais.
- Contenir et corriger la faille.
- Notifier la Commission de Protection des Données (CDP) sous 72 heures.
- Informer les Utilisateurs concernés lorsqu'un risque élevé existe.
- Documenter l'incident et les mesures correctives.

## 6. Sous-traitants

Chaque prestataire technique traitant des données pour Jokoo est encadré par un **contrat de sous-traitance** conforme à la loi sénégalaise et intégrant :
- Confidentialité stricte.
- Sécurité au moins équivalente à celle de Jokoo.
- Interdiction de sous-traitance sans accord.
- Audit à première demande.

## 7. Analyses d'impact

Pour les traitements présentant un **risque élevé** (biométrie, mineurs, données de santé), Jokoo réalise une **analyse d'impact** (PIA) avant la mise en œuvre.

## 8. Formation

L'ensemble des collaborateurs suit annuellement une **formation à la protection des données** et à la cybersécurité.

## 9. Auditabilité

Jokoo se soumet à des **audits externes annuels** portant sur la sécurité et la conformité.

## 10. Contact DPO

Pour toute question relative à la sécurité de vos données : \`dpo@jokooservices.com\`.`,
  },
  {
    slug: "geolocation-policy",
    title: "Politique de géolocalisation",
    summary: "Comment Jokoo utilise votre position pour vous proposer les meilleurs services.",
    category: "conditions",
    language: "fr",
    country: "SN",
    version: 3,
    order: 160,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-07-30",
    updated_at: "2026-08-04T14:20:32.104592+00:00",
    content: `## 1. Objectif

La **géolocalisation** permet à Jokoo de :
- Proposer les **prestataires les plus proches** de vous.
- Estimer les **délais et frais de déplacement**.
- Sécuriser les missions (trajet en covoiturage, livraison).
- Déclencher le **bouton SOS** avec position transmise à l'équipe Jokoo.

## 2. Collecte

La localisation est collectée uniquement avec votre **consentement explicite** (fenêtre native iOS/Android).

Trois niveaux sont possibles :
- **Toujours** — recommandé pour les prestataires mobiles et les urgences.
- **En cours d'utilisation** — recommandé pour les clients.
- **Jamais** — vous devrez saisir manuellement les adresses.

## 3. Précision

- Jokoo utilise le **GPS**, le **Wi-Fi** et les **antennes cellulaires**.
- La précision typique est de **10 à 50 mètres** en extérieur.

## 4. Utilisation

Votre position sert exclusivement à :
- Afficher les prestataires proches.
- Fournir des itinéraires (mobilité).
- Prévenir la fraude (détecter les incohérences).
- Assister en cas de SOS.

Votre position **n'est jamais partagée en temps réel** avec un autre Utilisateur, sauf :
- Pendant un trajet en covoiturage (partagée avec les passagers/conducteur consentants).
- Lors d'un déclenchement SOS (partagée avec l'équipe Jokoo et vos contacts d'urgence).

## 5. Modification et retrait

Vous pouvez à tout moment :
- Désactiver la géolocalisation dans les **paramètres de votre appareil**.
- La désactiver dans l'app : **Profil → Confidentialité → Géolocalisation**.

## 6. Durée de conservation

- **Positions instantanées** : conservées 30 jours pour audit et sécurité.
- **Historique des trajets covoiturage** : 3 ans (obligations légales de transport).

## 7. Sécurité

Les données de localisation sont **chiffrées** et accessibles uniquement à un nombre restreint de collaborateurs habilités.

## 8. Contact

\`dpo@jokooservices.com\``,
  },
  {
    slug: "reviews-policy",
    title: "Politique des avis et évaluations",
    summary: "Règles garantissant l'authenticité et la loyauté des avis sur Jokoo.",
    category: "communaute",
    language: "fr",
    country: "SN",
    version: 3,
    order: 170,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-07-30",
    updated_at: "2026-08-04T14:20:32.098326+00:00",
    content: `## 1. Objectif

Les avis sont au cœur de la confiance sur Jokoo. La présente politique garantit leur **authenticité, leur pertinence et leur loyauté**.

## 2. Qui peut laisser un avis ?

- Un avis ne peut être laissé qu'**après la fin effective d'une mission** validée par le paiement.
- Un utilisateur ne peut évaluer un même prestataire qu'**une fois par mission**.
- Les avis anonymes ne sont pas acceptés (le prénom du client est affiché).

## 3. Contenu des avis

Un avis se compose :
- D'une **note de 1 à 5 étoiles**.
- D'un **commentaire libre** (facultatif, 5 000 caractères max.).
- De **photos** (facultatif, non contractuelles).

## 4. Ce qui est interdit dans un avis

- Propos injurieux, haineux, discriminatoires ou diffamatoires.
- Informations personnelles sur le prestataire (adresse, téléphone, identité).
- Publicité pour un autre service.
- Contenu manifestement mensonger ou hors sujet.
- Avis **contre rémunération** (positifs ou négatifs).

## 5. Droit de réponse

Le prestataire dispose d'un **droit de réponse public** limité à 2 000 caractères, sans possibilité de modifier la note du client.

## 6. Suppression et modification

- L'auteur peut modifier son avis pendant **7 jours**, puis il est verrouillé.
- Jokoo peut supprimer un avis qui viole la présente politique.
- Un avis n'est **jamais supprimé** au seul motif qu'il est négatif.

## 7. Détection de la fraude aux avis

Jokoo lutte activement contre :
- Les **faux avis** (comptes fictifs, avis achetés).
- Les **réseaux de manipulation** entre prestataires.
- L'**auto-évaluation** (créer un compte pour se noter soi-même).

Nos algorithmes détectent les schémas suspects (bursts d'avis, adresses IP proches, comportement anormal). Les fraudes entraînent la **suppression des avis** et la **fermeture définitive du compte**.

## 8. Utilisation des avis

Jokoo peut afficher les avis :
- Sur le profil du prestataire.
- Dans les résultats de recherche.
- Dans les supports de communication (site, réseaux sociaux) en anonymisant le contenu si nécessaire.

## 9. Contact

Pour signaler un avis frauduleux : \`support@jokooservices.com\` ou bouton **Signaler** in-app.`,
  },
  {
    slug: "community-charter",
    title: "Charte de la communauté",
    summary: "Les valeurs partagées qui font de Jokoo une communauté de confiance.",
    category: "communaute",
    language: "fr",
    country: "SN",
    version: 3,
    order: 180,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-07-30",
    updated_at: "2026-08-04T14:20:32.095802+00:00",
    content: `Jokoo est bien plus qu'une application : c'est une **communauté** qui rassemble des Sénégalais autour d'un idéal commun — se rendre service, avec **respect, transparence et fierté**.

## Nos valeurs

### 1. Respect
Chaque membre — client comme prestataire — est traité avec dignité, sans distinction d'origine, de religion, de genre, d'âge, d'orientation sexuelle ou de statut social.

### 2. Confiance
Nous croyons que la confiance se construit par la transparence : profils vérifiés, avis authentiques, tarifs affichés à l'avance, paiements sécurisés.

### 3. Excellence
Nous encourageons le travail bien fait, le service ponctuel et la satisfaction du client. Les meilleurs prestataires sont mis en avant sur la plateforme.

### 4. Solidarité
Jokoo soutient les initiatives locales, les jeunes entrepreneurs et les femmes dans le secteur des services. Nous rêvons d'un Sénégal où chaque compétence trouve son marché.

### 5. Sécurité
Chaque interaction sur Jokoo doit rester sûre. Nous vérifions les prestataires, sécurisons les paiements et intervenons en cas d'incident.

## Nos engagements réciproques

En rejoignant la communauté Jokoo, vous acceptez de :

- **Communiquer avec courtoisie**, y compris en cas de désaccord.
- **Honorer vos engagements** (rendez-vous, tarifs, délais).
- **Fournir des informations exactes** (identité, tarifs, disponibilités).
- **Signaler** tout comportement contraire à cette charte.
- **Respecter les biens et les personnes** de vos interlocuteurs.

## Ce que nous refusons

- La violence physique ou verbale.
- La discrimination sous toutes ses formes.
- Les propos haineux, sexistes, racistes, homophobes.
- Le harcèlement, y compris de nature sexuelle.
- La fraude, la triche et les faux avis.

## Notre promesse

L'équipe Jokoo s'engage à :

- Écouter et prendre au sérieux chaque signalement.
- Sanctionner sans complaisance les comportements toxiques.
- Améliorer continuellement la plateforme sur la base de vos retours.

*« Jokoo » signifie « se rencontrer » en wolof. Rencontrons-nous dans le respect.*`,
  },
  {
    slug: "code-of-conduct",
    title: "Code de conduite",
    summary: "Règles de comportement obligatoires pour tous les utilisateurs de Jokoo.",
    category: "communaute",
    language: "fr",
    country: "SN",
    version: 3,
    order: 190,
    requires_acceptance: true,
    published: true,
    effective_date: "2026-07-30",
    updated_at: "2026-08-04T14:20:32.096679+00:00",
    content: `Le présent Code de conduite s'applique à **tout utilisateur** de Jokoo (client, prestataire, invité). Il complète la *Charte de la communauté* et les *Conditions générales d'utilisation*.

## 1. Comportement général

- Interdiction de tout **harcèlement**, insulte, menace, propos haineux, discriminatoire ou incitant à la violence.
- Interdiction de toute **conduite sexuelle inappropriée**, notamment envers des mineurs.
- Interdiction de la **consommation de substances illicites** durant une mission.
- Respect strict des lois sénégalaises en vigueur.

## 2. Interactions dans l'application

- Restez **courtois et respectueux** dans les messages et les commentaires.
- N'utilisez pas la messagerie pour **des propositions étrangères à la mission** (démarchage commercial, spam, propositions sexuelles).
- Ne partagez pas de **contenu illégal, choquant ou pornographique**.

## 3. Vie privée d'autrui

- Ne divulguez jamais les données personnelles d'un autre membre.
- N'enregistrez pas et ne diffusez pas d'images ou de vidéos sans consentement écrit.
- Respectez le principe **« ce que j'apprends d'un utilisateur reste chez moi »**.

## 4. Réalisation des missions

- **Ponctualité obligatoire** — prévenez au moins 30 minutes à l'avance en cas de retard.
- **Tenue et hygiène adaptées** au métier exercé.
- **Matériel conforme** aux règles de sécurité.
- **Aucune sous-traitance** non déclarée sans accord préalable du client.

## 5. Argent et paiements

- **Aucun paiement hors application** ne peut être exigé si la mission a été bookée via Jokoo.
- Le prestataire ne peut pas modifier unilatéralement le tarif convenu.
- Aucune commission occulte, pourboire imposé ou frais surprise.

## 6. Signalement et coopération

- Coopérez avec l'équipe Jokoo lors des enquêtes internes.
- Répondez de bonne foi aux demandes du support.
- Fournissez les preuves demandées (photos, captures, factures).

## 7. Sanctions

En cas de violation, Jokoo peut, selon la gravité :

- **Avertir** formellement l'utilisateur.
- **Suspendre** temporairement le compte.
- **Fermer** définitivement le compte, sans remboursement des sommes engagées.
- **Signaler aux autorités** en cas d'infraction pénale.

Voir la *Politique de modération des contenus* pour la procédure détaillée.

## 8. Recours

Tout utilisateur sanctionné peut faire appel dans un **délai de 15 jours** en écrivant à \`legal@jokooservices.com\`. Une décision motivée est rendue sous 15 jours ouvrés.

*En utilisant Jokoo, vous acceptez le présent Code de conduite.*`,
  },
  {
    slug: "faq",
    title: "Foire aux questions (FAQ)",
    summary: "Réponses aux questions les plus fréquentes des clients et prestataires Jokoo.",
    category: "aide",
    language: "fr",
    country: "SN",
    version: 5,
    order: 200,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-08-04",
    updated_at: "2026-08-04T18:43:52.784517+00:00",
    content: `## À propos de Jokoo

### Qu'est-ce que Jokoo ?
Jokoo est une plateforme sénégalaise de mise en relation entre des **clients** et des **prestataires de services** vérifiés (plomberie, électricité, coiffure, ménage, baby-sitting, tutorat, covoiturage, livraison, etc.). Jokoo agit en qualité d'**intermédiaire technique** et ne fournit pas directement les services proposés.

### Dans quels pays Jokoo est-il disponible ?
Jokoo est actuellement disponible au **Sénégal**. Une extension progressive vers d'autres pays d'Afrique de l'Ouest est prévue.

### L'application est-elle gratuite ?
Oui. L'inscription, la recherche et la mise en relation sont **gratuites** pour les clients. Jokoo se rémunère via une **commission** prélevée sur les prestations réalisées par les prestataires (voir *Politique de paiement*).

---

## Pour les clients

### Comment créer un compte ?
Téléchargez l'application, ouvrez-la, puis inscrivez-vous avec votre numéro de téléphone, votre e-mail ou votre compte Apple. Vous recevrez un code OTP pour valider votre identité.

### Comment trouver un prestataire ?
Recherchez par catégorie (plomberie, coiffure…), par mot-clé ou par proximité géographique. Consultez les profils, notes, avis et tarifs, puis contactez le prestataire choisi via la messagerie intégrée.

### Comment se déroule un paiement ?
Les paiements sont effectués via l'application : **Wave, Orange Money, carte bancaire (Stripe)** ou espèces en fin de mission (selon accord). Les paiements sécurisés sont fortement recommandés pour bénéficier de la garantie Jokoo.

### Que faire si un prestataire ne se présente pas ?
Signalez immédiatement l'incident via **Aide → Signaler un problème**. Notre équipe support intervient sous **2 heures ouvrées**. Si le paiement était sécurisé, un **remboursement intégral** est déclenché.

### Puis-je annuler une réservation ?
Oui, dans les délais prévus par la *Politique d'annulation*. Une annulation tardive peut entraîner des frais.

---

## Pour les prestataires

### Comment devenir prestataire Jokoo ?
Inscrivez-vous dans l'app, choisissez le rôle **Prestataire**, complétez votre profil (photo, métier, zone d'intervention, tarifs) et téléversez vos pièces de vérification (CNI, photos de travaux, certificats éventuels). La vérification prend **24 à 48 heures**.

### Combien coûte l'inscription ?
L'inscription est **gratuite**. Jokoo prélève une **commission de 10 à 15 %** sur chaque prestation payée via l'app (voir *Politique de paiement*).

### Comment suis-je payé ?
Vos gains sont crédités sur votre **portefeuille Jokoo**. Vous pouvez demander un retrait vers **Wave, Orange Money ou un compte bancaire**, sous 24 à 48 heures ouvrées.

### Comment obtenir le badge Vérifié+ ?
Le badge **Vérifié+** est réservé aux prestataires ayant fourni un **casier judiciaire vierge**, une **preuve de formation** (premiers secours, diplôme métier), et cumulant au moins **20 missions notées 4,5 ★ ou plus**.

---

## Sécurité, confidentialité, réclamations

### Mes données sont-elles protégées ?
Oui. Jokoo respecte la **loi n° 2008-12 du 25 janvier 2008** sur la protection des données à caractère personnel au Sénégal. Voir *Politique de confidentialité*.

### Comment signaler un abus ?
Utilisez le bouton **Signaler** sur le profil du contrevenant, ou écrivez à \`support@jokooservices.com\`. Un incident grave (agression, escroquerie) doit être signalé à la police puis à Jokoo.

### Où trouver toutes les règles ?
Le **Centre juridique** de l'app et du site web regroupe l'ensemble des politiques et conditions.

---

*Vous ne trouvez pas votre réponse ? Contactez-nous à \`support@jokooservices.com\` ou au **+221 77 000 00 00** — 7j/7 de 8h à 22h.*`,
  },
  {
    slug: "help-center",
    title: "Centre d'aide",
    summary: "Guide organisé par catégories pour utiliser Jokoo au quotidien.",
    category: "aide",
    language: "fr",
    country: "SN",
    version: 5,
    order: 210,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-07-30",
    updated_at: "2026-08-04T14:20:32.093751+00:00",
    content: `Bienvenue dans le Centre d'aide Jokoo. Ce guide est organisé **par catégories** pour trouver rapidement la réponse à votre question. Utilisez la fonction de recherche du Centre juridique pour filtrer les articles.

---

## 1. Premiers pas

### 1.1 Créer un compte
- Téléchargez Jokoo depuis le site officiel ou les stores.
- Inscrivez-vous avec téléphone, e-mail ou Apple.
- Confirmez votre numéro via le code OTP reçu.
- Complétez votre profil (nom, photo, ville).

### 1.2 Choisir votre rôle
- **Client** : réserver des services.
- **Prestataire** : proposer vos services.
- Vous pouvez changer de rôle à tout moment dans **Profil → Rôle**.

### 1.3 Sécurité du compte
- Activez la **double authentification** (Profil → Sécurité).
- Ne partagez jamais votre code OTP.
- Utilisez un mot de passe unique et fort.

---

## 2. Réserver un service (Client)

### 2.1 Trouver un prestataire
- Utilisez la barre de recherche ou parcourez les catégories.
- Filtrez par proximité, note moyenne, tarif ou disponibilité.

### 2.2 Contacter un prestataire
- Depuis le profil, cliquez sur **Discuter**.
- Décrivez précisément votre besoin (adresse, urgence, photos).

### 2.3 Confirmer une réservation
- Le prestataire vous envoie une proposition (tarif, horaire).
- Acceptez-la et effectuez le paiement sécurisé pour valider.

### 2.4 Après la mission
- Marquez la mission comme **Terminée**.
- Laissez un **avis** honnête et objectif.
- Le paiement est libéré au prestataire.

---

## 3. Proposer un service (Prestataire)

### 3.1 Créer votre profil
- Ajoutez photo, description, zones d'intervention, tarifs.
- Téléversez vos pièces (CNI, permis, diplômes).

### 3.2 Recevoir des demandes
- Activez la **disponibilité** dans le tableau de bord.
- Répondez rapidement — la réactivité influence votre classement.

### 3.3 Retirer vos gains
- **Profil → Portefeuille → Retirer**.
- Choisissez Wave, Orange Money ou virement bancaire.
- Délai : 24 à 48 heures ouvrées.

---

## 4. Paiements et facturation

- **Moyens acceptés** : Wave, Orange Money, carte (Stripe), espèces.
- **Commissions** : 10 à 15 % selon la catégorie.
- **Reçus** : disponibles dans l'historique de chaque mission.

---

## 5. Sécurité et litiges

- **Signaler un utilisateur** : cliquez sur le profil → *Signaler*.
- **Litige de paiement** : *Aide → Contester une transaction*.
- **Urgence** : bouton **SOS 24/7** dans l'app pour alerter Jokoo Family.

---

## 6. Gérer son compte

- **Modifier le profil** : Profil → Modifier.
- **Changer de mot de passe** : Profil → Sécurité.
- **Supprimer mon compte** : Profil → Confidentialité → Supprimer (délai 30 jours de rétractation).

---

## 7. Contacter le support

- **Chat in-app** — 7j/7 de 8h à 22h.
- **E-mail** : \`support@jokooservices.com\`
- **Téléphone / WhatsApp** : **+221 77 000 00 00**
- **Urgences 24/7** : bouton SOS dans l'app.

*Notre équipe répond en français, wolof, anglais et arabe.*`,
  },
  {
    slug: "legal-contact",
    title: "Contact juridique",
    summary: "Comment contacter le service juridique de Jokoo (notifications, requêtes, mises en demeure).",
    category: "aide",
    language: "fr",
    country: "SN",
    version: 5,
    order: 220,
    requires_acceptance: false,
    published: true,
    effective_date: "2026-07-30",
    updated_at: "2026-08-04T14:20:32.094820+00:00",
    content: `## Point de contact unique

Pour toute **question, notification, requête officielle ou mise en demeure** relative à Jokoo (droits d'auteur, protection des données, litiges commerciaux, réquisitions judiciaires), utilisez les canaux ci-dessous.

### Coordonnées
- **E-mail juridique** : \`legal@jokooservices.com\`
- **Protection des données (DPO)** : \`dpo@jokooservices.com\`
- **Adresse postale** : Jokoo Services SARL — Service Juridique — Dakar, Sénégal.

### Objet de votre demande
Précisez systématiquement dans l'objet :
- \`[DMCA]\` — signalement de contenu enfreignant un droit d'auteur.
- \`[RGPD/LOI SN]\` — exercice d'un droit sur vos données (accès, rectification, effacement, portabilité).
- \`[LITIGE]\` — plainte formelle ou mise en demeure.
- \`[JUDICIAIRE]\` — réquisition émanant d'une autorité compétente.

### Contenu attendu
- Identité complète du demandeur (nom, adresse, e-mail, téléphone).
- Description précise et documentée de la demande.
- Pièces justificatives (identité, procuration, décision judiciaire, etc.).

### Délais de traitement
- **Accusé de réception** : sous 3 jours ouvrés.
- **Réponse motivée** : sous 30 jours pour les requêtes RGPD ; sous 60 jours pour les autres, sauf urgence judiciaire.

Jokoo se réserve le droit de demander toute information complémentaire nécessaire à la vérification de la demande. Les demandes anonymes ou incomplètes ne sont pas traitées.`,
  },
];
