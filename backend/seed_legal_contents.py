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

{COMPANY_LEGAL_NAME} (« {COMPANY_NAME} », « nous ») édite l'application mobile
et le site web **Jokoo**, une place de marché reliant des clients à des
prestataires qualifiés au Sénégal. Nous prenons la protection de vos données
personnelles très au sérieux et respectons la loi sénégalaise n° 2008-12 sur
la protection des données à caractère personnel ainsi que le RGPD (UE
2016/679) lorsque celui-ci s'applique.

## 2. Données que nous collectons

Nous collectons uniquement les données strictement nécessaires au bon
fonctionnement du service :

- **Compte** : nom, e-mail, téléphone, mot de passe chiffré, ville, photo
  de profil (optionnelle).
- **Contenu que vous publiez** : annonces prestataires, messages de chat,
  avis, images téléversées.
- **Réservations et paiements** : historique de réservations, moyens de
  paiement utilisés (Wave, Orange Money, espèces). Nous ne stockons **jamais
  vos identifiants bancaires** — ils sont traités par nos prestataires
  agréés (Wave Business, Orange Money Sénégal).
- **Localisation** : uniquement lorsque vous acceptez explicitement le
  partage (recherche de prestataires à proximité, mobilité, suivi de
  livraison). Vous pouvez révoquer cette permission à tout moment depuis
  les réglages système.
- **Données techniques** : type d'appareil, version d'OS, logs d'erreur
  anonymisés pour améliorer la stabilité de l'application.
- **Notifications push** : jeton d'appareil FCM/APNs pour vous envoyer
  des alertes de réservation, messages et campagnes marketing (opt-in).

## 3. Finalités du traitement

Vos données servent exclusivement à :

1. Créer et gérer votre compte utilisateur.
2. Vous mettre en relation avec des prestataires ou clients pertinents.
3. Traiter vos paiements et sécuriser les transactions.
4. Vous notifier des événements liés à vos réservations et messages.
5. Assurer la sécurité, prévenir la fraude et modérer les contenus.
6. Améliorer nos services (statistiques agrégées et anonymisées).

## 4. Base légale

Nous traitons vos données sur la base :
- Du **contrat** que vous acceptez en créant un compte (CGU).
- De votre **consentement** explicite pour la localisation et les
  notifications marketing.
- De nos **obligations légales** (comptabilité, lutte anti-blanchiment).
- De notre **intérêt légitime** à sécuriser la plateforme.

## 5. Partage des données

Nous ne vendons jamais vos données. Elles peuvent être partagées avec :

- Le **prestataire ou client** que vous choisissez de contacter (nom,
  photo, téléphone après confirmation d'une réservation).
- Nos **sous-traitants techniques** (hébergeur, Cloudinary pour les
  images, Wave/Orange Money pour les paiements, Firebase pour les
  notifications, Resend pour les e-mails). Chacun est soumis à un accord
  de traitement conforme au RGPD.
- Les **autorités judiciaires** en cas de réquisition légale.

Aucun transfert commercial vers des tiers n'a lieu.

## 6. Durée de conservation

- Compte actif : tant que le compte existe.
- Compte supprimé : suppression sous 30 jours (sauf obligation légale de
  conservation comptable — 10 ans pour les factures).
- Logs techniques : 12 mois maximum.

## 7. Vos droits

Conformément à la loi sénégalaise 2008-12 et au RGPD, vous disposez
des droits suivants :

- **Accès** à vos données.
- **Rectification** des données inexactes.
- **Suppression** de votre compte et de vos données.
- **Portabilité** dans un format lisible.
- **Opposition** au traitement marketing.
- **Retrait du consentement** à tout moment.

Pour exercer ces droits, écrivez à **{DPO_EMAIL}** ou depuis l'application
via *Profil → Confidentialité → Gérer mes données*. Nous répondons sous
30 jours.

## 8. Sécurité

Vos mots de passe sont hachés avec **bcrypt**. Les échanges sont chiffrés
en TLS 1.3. Nos serveurs sont hébergés dans l'Union européenne.
Nous appliquons le principe du moindre privilège pour l'accès interne.

## 9. Cookies & traceurs

L'application mobile n'utilise pas de cookies traceurs publicitaires.
Le site web utilise uniquement des cookies techniques et de mesure
d'audience anonymisée (voir *Politique cookies*).

## 10. Enfants

Jokoo est réservé aux personnes de **13 ans et plus**. Certains services
(Jokoo Family) impliquent des mineurs, qui sont sous la responsabilité de
l'adulte réservataire.

## 11. Modifications

Nous pouvons faire évoluer cette politique. Toute modification substantielle
vous sera notifiée dans l'application et par e-mail au moins 30 jours
avant sa prise d'effet.

## 12. Contact

Délégué à la protection des données : **{DPO_EMAIL}**
Support général : **{COMPANY_EMAIL}**
Adresse : {COMPANY_LEGAL_NAME}, Dakar, {COUNTRY}.

Vous pouvez également saisir la **CDP (Commission de protection des
données personnelles)** du Sénégal — [www.cdp.sn](https://www.cdp.sn).
"""

# --- CGU (Conditions générales d'utilisation) -----------------------------
CGU = f"""# Conditions générales d'utilisation

**Dernière mise à jour : {_today()}**

## 1. Présentation

{COMPANY_LEGAL_NAME} édite l'application **Jokoo**, mettant en relation
des clients et des prestataires de services qualifiés au Sénégal. En
créant un compte, vous acceptez sans réserve les présentes CGU.

## 2. Compte utilisateur

Vous devez avoir au moins **13 ans**, fournir des informations exactes
et maintenir la confidentialité de votre mot de passe. Vous êtes seul
responsable des activités effectuées depuis votre compte.

## 3. Rôle de Jokoo

Jokoo est un **intermédiaire technique**. Nous ne sommes pas partie au
contrat conclu entre le client et le prestataire, sauf pour la partie
paiement encaissée en escrow. Chaque prestataire est un professionnel
indépendant.

## 4. Prestations et réservations

Le client choisit un prestataire, définit la mission et confirme la
réservation. Le prestataire accepte, effectue la prestation, puis le
paiement est libéré. Les délais et prix sont ceux affichés dans
l'application.

## 5. Paiements

Les paiements sont traités via **Wave**, **Orange Money** ou en
**espèces à la livraison** selon les cas. Un système d'entiercement
(escrow) protège les deux parties : les fonds sont libérés au
prestataire une fois la mission validée par le client (ou 48h après la
prestation si aucune contestation n'est ouverte).

## 6. Annulation & remboursement

- **Client** : annulation gratuite jusqu'à 24h avant la mission.
  Ensuite, 50 % du montant peut être retenu.
- **Prestataire** : toute annulation tardive impacte sa note et peut
  déclencher un rappel qualité.
- **Force majeure** : remboursement intégral.

Détails complets : *Politique d'annulation* & *Politique de remboursement*.

## 7. Comportement acceptable

Il est interdit de :
- Publier du contenu illicite, haineux, discriminatoire ou trompeur.
- Contourner le système de paiement (paiement hors application).
- Créer de faux comptes ou de faux avis.
- Harceler d'autres utilisateurs.

Toute violation peut entraîner la suspension ou la suppression du compte.

## 8. Propriété intellectuelle

Le logo, le design et le code source de Jokoo sont notre propriété.
Vous conservez vos droits sur les contenus que vous publiez, mais nous
accordez une licence non-exclusive pour les afficher dans l'application.

## 9. Responsabilité

Jokoo ne peut être tenue responsable des prestations effectuées par
les prestataires indépendants. Nous mettons tout en œuvre pour vérifier
les identités (KYC) et modérer les contenus, mais garantissons
uniquement le bon fonctionnement de la plateforme.

## 10. Résiliation

Vous pouvez supprimer votre compte à tout moment depuis *Profil →
Paramètres → Supprimer mon compte*. Nous pouvons suspendre un compte en
cas de violation des CGU, après notification.

## 11. Droit applicable

Ces CGU sont régies par le **droit sénégalais**. Les litiges relèvent
des tribunaux compétents de Dakar, sauf disposition légale contraire.

## 12. Contact

**{LEGAL_EMAIL}** — {COMPANY_LEGAL_NAME}, Dakar, {COUNTRY}.
"""

# --- Mentions légales -----------------------------------------------------
MENTIONS_LEGALES = f"""# Mentions légales

**Dernière mise à jour : {_today()}**

## Éditeur

- **Raison sociale** : {COMPANY_LEGAL_NAME}
- **Forme juridique** : Société par actions simplifiée
- **Siège social** : Dakar, {COUNTRY}
- **Contact** : {COMPANY_EMAIL}
- **Site web** : {APP_URL}

## Directeur de la publication

L'équipe fondatrice de Jokoo Services.

## Hébergement

- **Application mobile** : Apple App Store & Google Play Store.
- **Backend & API** : hébergement cloud sécurisé (Kubernetes managed).
- **Images utilisateurs** : Cloudinary Inc., 3400 Central Expressway,
  Santa Clara, CA 95051, USA.

## Propriété intellectuelle

L'ensemble des éléments (logo, textes, images, code source) est protégé.
Toute reproduction sans autorisation est interdite.

## Signalement de contenu illicite

**{LEGAL_EMAIL}** — traitement sous 48 heures.
"""

# --- Politique cookies (mobile = minimal) ---------------------------------
COOKIES = f"""# Politique relative aux cookies

**Dernière mise à jour : {_today()}**

## Application mobile

L'application mobile Jokoo **n'utilise pas de cookies publicitaires**.
Elle stocke uniquement, sur votre appareil, des données techniques
nécessaires au fonctionnement :

- Jeton de session (déconnexion possible à tout moment).
- Préférences (langue, thème).
- Cache d'images pour la performance.

Vous pouvez effacer ces données via *Profil → Paramètres → Vider le
cache* ou en désinstallant l'application.

## Site web

Le site web utilise :

- **Cookies strictement nécessaires** (session, préférences) — pas de
  consentement requis.
- **Cookies de mesure d'audience anonymisée** — aucun profil individuel.

Vous pouvez ajuster votre consentement via la bannière cookies du site.

## Aucun cookie tiers publicitaire

Nous n'utilisons **ni Google Ads, ni Facebook Pixel, ni retargeting**.

Contact : {DPO_EMAIL}
"""

# --- Conditions Clients ---------------------------------------------------
TERMS_CLIENTS = f"""# Conditions des clients

**Dernière mise à jour : {_today()}**

## Votre engagement

En tant que client sur Jokoo, vous vous engagez à :

- Fournir des informations exactes lors de la réservation.
- Payer les prestations aux conditions convenues.
- Respecter le prestataire (ponctualité, courtoisie, sécurité).
- Publier des avis sincères et non-diffamatoires.

## Vos droits

- Choisir librement un prestataire.
- Annuler dans les délais prévus par la *Politique d'annulation*.
- Obtenir un remboursement en cas de prestation non conforme.
- Contacter le support à **{COMPANY_EMAIL}** à tout moment.

## Cas particulier — Jokoo Family

Les prestations impliquant des mineurs (garde d'enfants, tutorat) exigent
la présence d'un adulte responsable et la vérification préalable des
documents (carte étudiante, PSC1 pour la garde).

Contact : {COMPANY_EMAIL}
"""

# --- Conditions Prestataires ----------------------------------------------
TERMS_PRESTATAIRES = f"""# Conditions des prestataires

**Dernière mise à jour : {_today()}**

## Statut

En rejoignant Jokoo en tant que prestataire, vous exercez à titre
**indépendant**. Jokoo n'est ni votre employeur, ni un intermédiaire de
placement salarial.

## Obligations

- Fournir des documents d'identité valides (KYC).
- Décrire honnêtement vos compétences et tarifs.
- Réaliser les prestations conformément aux règles de l'art et de la
  législation sénégalaise.
- Émettre les factures et payer vos cotisations sociales/fiscales.
- Respecter la confidentialité des clients.

## Commission Jokoo

Une commission de service est prélevée sur chaque transaction (taux
affiché lors de l'inscription et pouvant évoluer avec préavis).

## Escrow

Les paiements clients sont conservés en entiercement puis libérés
48 heures après la fin de la prestation, sauf litige.

## Vérification & confiance

Les prestataires vérifiés bénéficient du badge **Verified+** après
contrôle d'identité, de références et — le cas échéant — de
certifications professionnelles.

Contact : {LEGAL_EMAIL}
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
    }
