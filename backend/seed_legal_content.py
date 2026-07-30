"""
Seed script — Contenu légal complet Jokoo.
Usage : python3 /app/backend/seed_legal_content.py

Cette commande met à jour les 22 documents du Centre juridique avec du contenu
professionnel prêt pour la production.

Idempotent : chaque appel crée une nouvelle version (historique conservé).
"""
import os
import sys
import asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")

EFFECTIVE_DATE = "2026-07-30"
COUNTRY = "SN"
LANGUAGE = "fr"

# -------------------- CONTENU DES DOCUMENTS --------------------
# Chaque entrée : slug -> { title, summary, category, requires_acceptance, content }
# `content` en markdown.

DOCS: dict[str, dict] = {

# ============ AIDE ============
"faq": {
"title": "Foire aux questions (FAQ)",
"summary": "Réponses aux questions les plus fréquentes des clients et prestataires Jokoo.",
"category": "aide",
"requires_acceptance": False,
"content": """
## À propos de Jokoo

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
Utilisez le bouton **Signaler** sur le profil du contrevenant, ou écrivez à `support@jokooservices.com`. Un incident grave (agression, escroquerie) doit être signalé à la police puis à Jokoo.

### Où trouver toutes les règles ?
Le **Centre juridique** de l'app et du site web regroupe l'ensemble des politiques et conditions.

---

*Vous ne trouvez pas votre réponse ? Contactez-nous à `support@jokooservices.com` ou au **+221 77 000 00 00** — 7j/7 de 8h à 22h.*
""",
},

"help-center": {
"title": "Centre d'aide",
"summary": "Guide organisé par catégories pour utiliser Jokoo au quotidien.",
"category": "aide",
"requires_acceptance": False,
"content": """
Bienvenue dans le Centre d'aide Jokoo. Ce guide est organisé **par catégories** pour trouver rapidement la réponse à votre question. Utilisez la fonction de recherche du Centre juridique pour filtrer les articles.

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
- **E-mail** : `support@jokooservices.com`
- **Téléphone / WhatsApp** : **+221 77 000 00 00**
- **Urgences 24/7** : bouton SOS dans l'app.

*Notre équipe répond en français, wolof, anglais et arabe.*
""",
},

"legal-contact": {
"title": "Contact juridique",
"summary": "Comment contacter le service juridique de Jokoo (notifications, requêtes, mises en demeure).",
"category": "aide",
"requires_acceptance": False,
"content": """
## Point de contact unique

Pour toute **question, notification, requête officielle ou mise en demeure** relative à Jokoo (droits d'auteur, protection des données, litiges commerciaux, réquisitions judiciaires), utilisez les canaux ci-dessous.

### Coordonnées
- **E-mail juridique** : `legal@jokooservices.com`
- **Protection des données (DPO)** : `dpo@jokooservices.com`
- **Adresse postale** : Jokoo Services SARL — Service Juridique — Dakar, Sénégal.

### Objet de votre demande
Précisez systématiquement dans l'objet :
- `[DMCA]` — signalement de contenu enfreignant un droit d'auteur.
- `[RGPD/LOI SN]` — exercice d'un droit sur vos données (accès, rectification, effacement, portabilité).
- `[LITIGE]` — plainte formelle ou mise en demeure.
- `[JUDICIAIRE]` — réquisition émanant d'une autorité compétente.

### Contenu attendu
- Identité complète du demandeur (nom, adresse, e-mail, téléphone).
- Description précise et documentée de la demande.
- Pièces justificatives (identité, procuration, décision judiciaire, etc.).

### Délais de traitement
- **Accusé de réception** : sous 3 jours ouvrés.
- **Réponse motivée** : sous 30 jours pour les requêtes RGPD ; sous 60 jours pour les autres, sauf urgence judiciaire.

Jokoo se réserve le droit de demander toute information complémentaire nécessaire à la vérification de la demande. Les demandes anonymes ou incomplètes ne sont pas traitées.
""",
},

# ============ COMMUNAUTÉ ============
"community-charter": {
"title": "Charte de la communauté",
"summary": "Les valeurs partagées qui font de Jokoo une communauté de confiance.",
"category": "communaute",
"requires_acceptance": False,
"content": """
Jokoo est bien plus qu'une application : c'est une **communauté** qui rassemble des Sénégalais autour d'un idéal commun — se rendre service, avec **respect, transparence et fierté**.

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

*« Jokoo » signifie « se rencontrer » en wolof. Rencontrons-nous dans le respect.*
""",
},

"code-of-conduct": {
"title": "Code de conduite",
"summary": "Règles de comportement obligatoires pour tous les utilisateurs de Jokoo.",
"category": "communaute",
"requires_acceptance": True,
"content": """
Le présent Code de conduite s'applique à **tout utilisateur** de Jokoo (client, prestataire, invité). Il complète la *Charte de la communauté* et les *Conditions générales d'utilisation*.

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

Tout utilisateur sanctionné peut faire appel dans un **délai de 15 jours** en écrivant à `legal@jokooservices.com`. Une décision motivée est rendue sous 15 jours ouvrés.

*En utilisant Jokoo, vous acceptez le présent Code de conduite.*
""",
},

"content-moderation": {
"title": "Politique de modération des contenus",
"summary": "Comment Jokoo modère les contenus publiés (profils, messages, avis, annonces).",
"category": "communaute",
"requires_acceptance": False,
"content": """
## 1. Champ d'application

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

L'utilisateur sanctionné est notifié par e-mail et in-app. Il peut contester sous **15 jours** en écrivant à `legal@jokooservices.com`. Une décision motivée finale est rendue sous 15 jours ouvrés.

## 7. Transparence

Jokoo publiera annuellement un **rapport de transparence** synthétique indiquant :
- Le nombre de signalements traités.
- Le nombre de contenus retirés.
- Le nombre de comptes suspendus / fermés.
- Les principaux motifs d'action.

## 8. Contenus émanant des autorités

Jokoo coopère de bonne foi avec les autorités judiciaires ou administratives sénégalaises dans le cadre de leurs missions légales.
""",
},

"reviews-policy": {
"title": "Politique des avis et évaluations",
"summary": "Règles garantissant l'authenticité et la loyauté des avis sur Jokoo.",
"category": "communaute",
"requires_acceptance": False,
"content": """
## 1. Objectif

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

Pour signaler un avis frauduleux : `support@jokooservices.com` ou bouton **Signaler** in-app.
""",
},

# ============ CONDITIONS ============
"cgu": {
"title": "Conditions Générales d'Utilisation (CGU)",
"summary": "Conditions générales encadrant l'utilisation de la plateforme Jokoo.",
"category": "conditions",
"requires_acceptance": True,
"content": """
Les présentes Conditions Générales d'Utilisation (« **CGU** ») régissent l'accès et l'utilisation de la plateforme **Jokoo**, éditée par **Jokoo Services SARL** (« Jokoo »), société immatriculée au Registre du Commerce et du Crédit Mobilier de Dakar, dont le siège social est à Dakar, Sénégal.

**Toute utilisation de Jokoo emporte acceptation pleine et entière des présentes CGU.**

## 1. Définitions

- **« Plateforme »** : l'application mobile Jokoo, le site web `jokooservices.com` et l'ensemble des services associés.
- **« Utilisateur »** : toute personne physique ou morale utilisant la Plateforme.
- **« Client »** : Utilisateur qui recherche et réserve un service.
- **« Prestataire »** : Utilisateur qui propose un service.
- **« Contenu »** : toute information publiée par un Utilisateur (profils, messages, avis, photos…).

## 2. Nature du service

Jokoo est **un intermédiaire technique**. Jokoo ne fournit, ne réalise ni ne garantit personnellement les services proposés par les Prestataires. Le contrat de prestation est conclu **directement entre le Client et le Prestataire**.

## 3. Inscription et compte

- L'inscription est réservée aux personnes majeures (18 ans révolus) ou aux mineurs autorisés par leurs représentants légaux dans les conditions prévues par la loi.
- L'Utilisateur s'engage à fournir des **informations exactes, complètes et à jour**.
- L'Utilisateur est **seul responsable** de la confidentialité de ses identifiants.
- Jokoo peut refuser une inscription ou fermer un compte en cas d'informations frauduleuses, de violation des CGU ou de la loi.

## 4. Utilisation de la Plateforme

L'Utilisateur s'engage à :
- Utiliser Jokoo conformément à sa destination.
- Respecter les *CGU*, la *Charte de la communauté* et le *Code de conduite*.
- Ne pas dénaturer le fonctionnement de la Plateforme (bots, scraping, contournement, ingénierie inverse).
- Ne pas contourner les mécanismes de paiement en incitant à des transactions hors app pour des missions réservées via Jokoo.

## 5. Paiements

Les paiements réalisés via Jokoo font l'objet de la *Politique de paiement*. Jokoo prélève une **commission** sur les prestations réalisées via la Plateforme (10 à 15 % selon les catégories).

## 6. Contenus utilisateurs

L'Utilisateur reste titulaire de ses droits sur les contenus qu'il publie. Il concède à Jokoo une **licence mondiale, non exclusive, gratuite, transférable et sous-licenciable** pour héberger, afficher, adapter et communiquer ces contenus dans le cadre de l'exploitation de la Plateforme.

## 7. Propriété intellectuelle

La Plateforme, ses logos, marques, code, design et bases de données sont la **propriété exclusive de Jokoo** ou de ses partenaires. Toute reproduction non autorisée est interdite.

## 8. Données personnelles

Le traitement des données personnelles est régi par la *Politique de confidentialité* et la *Politique de protection des données*.

## 9. Responsabilité de Jokoo

Jokoo agit exclusivement en qualité d'**intermédiaire technique** au sens de la loi n° 2008-08 du 25 janvier 2008 sur les transactions électroniques. **Jokoo ne saurait être tenu responsable** :
- Des services réalisés par les Prestataires (qualité, sécurité, délais).
- Des dommages matériels ou corporels survenus lors d'une mission.
- Des propos, contenus ou comportements des Utilisateurs.
- Des interruptions techniques temporaires ou de la perte de données non imputables à Jokoo.

Jokoo ne garantit pas la disponibilité continue de la Plateforme mais met en œuvre les moyens raisonnables pour en assurer le bon fonctionnement.

## 10. Résiliation

L'Utilisateur peut supprimer son compte à tout moment (Profil → Confidentialité → Supprimer). Jokoo peut suspendre ou résilier un compte en cas de violation des CGU, du Code de conduite ou de la loi, sans préavis et sans indemnité.

## 11. Modification des CGU

Jokoo peut modifier les CGU à tout moment. Les modifications entrent en vigueur à la date de publication indiquée en tête de document. L'usage continu de la Plateforme vaut acceptation des nouvelles CGU.

## 12. Loi applicable et litiges

Les présentes CGU sont soumises au **droit sénégalais**. En cas de litige, une **résolution amiable** doit être tentée par écrit auprès de `legal@jokooservices.com`. À défaut d'accord dans un délai de 60 jours, les tribunaux compétents de **Dakar** seront seuls compétents.

## 13. Contact

Toute question relative aux CGU : `legal@jokooservices.com`.
""",
},

"terms-clients": {
"title": "Conditions des clients",
"summary": "Conditions spécifiques applicables aux clients de Jokoo.",
"category": "conditions",
"requires_acceptance": True,
"content": """
Les présentes conditions s'appliquent à tout **Client** utilisant Jokoo, en complément des *CGU*.

## 1. Compte client

- Le Client s'inscrit avec des informations exactes et maintient son profil à jour.
- Le Client est majeur ou dispose de l'autorisation d'un représentant légal.
- Le Client s'engage à ne créer qu'**un seul compte** actif.

## 2. Réservation d'un service

- Le Client décrit précisément son besoin (nature, adresse, urgence, contraintes).
- Le Client s'engage à fournir les informations et accès nécessaires à la réalisation de la mission.
- Le Client accepte les tarifs et conditions convenus avec le Prestataire avant la confirmation.

## 3. Obligations du Client

- **Ponctualité et disponibilité** au moment convenu.
- **Accueil respectueux** du Prestataire, y compris à domicile.
- **Fourniture des matériaux/accès** convenus si applicable.
- **Paiement dans les délais** selon la modalité choisie.

## 4. Paiement

- Le paiement s'effectue via l'application (Wave, Orange Money, carte).
- Un paiement en espèces peut être convenu librement, à la seule discrétion des parties, en dehors de la garantie Jokoo.
- Le Client autorise Jokoo à débiter le moyen de paiement pour toute somme due.

## 5. Annulations et remboursements

Voir la *Politique d'annulation* et la *Politique de remboursement*.

## 6. Sécurité

- Le Client ne demande pas au Prestataire de réaliser des tâches **illégales ou dangereuses**.
- Le Client informe le Prestataire des risques du lieu (animaux, produits, escaliers…).
- En cas d'incident, le Client contacte immédiatement le support (bouton **SOS** disponible).

## 7. Confidentialité

Les informations partagées par le Prestataire (numéros de contact, adresses) sont strictement personnelles et ne peuvent être **redivulguées** sans son accord.

## 8. Avis

Le Client peut publier un avis honnête et vérifié après la mission (voir *Politique des avis*).

## 9. Sanctions

En cas de violation, Jokoo peut :
- Suspendre ou fermer le compte du Client.
- Retenir sur le portefeuille les sommes dues.
- Signaler aux autorités le cas échéant.

## 10. Contact

`support@jokooservices.com`
""",
},

"terms-prestataires": {
"title": "Conditions des prestataires",
"summary": "Conditions spécifiques applicables aux prestataires de services Jokoo.",
"category": "conditions",
"requires_acceptance": True,
"content": """
Les présentes conditions s'appliquent à tout **Prestataire** proposant ses services via Jokoo, en complément des *CGU*.

## 1. Statut

- Le Prestataire agit en tant que **travailleur indépendant** ou en son nom propre.
- Le Prestataire **n'est pas salarié de Jokoo**. Aucun lien de subordination n'existe.
- Le Prestataire est seul responsable de ses obligations fiscales et sociales.

## 2. Inscription et vérification

- Le Prestataire fournit une pièce d'identité valide (CNI, passeport).
- Le Prestataire téléverse les documents justifiant ses compétences (diplômes, certifications, agréments) le cas échéant.
- Certaines catégories (baby-sitting, tutorat, transport) nécessitent des documents complémentaires (voir *Politique de vérification*).

## 3. Obligations générales

- Fournir des services **conformes à la description, à la loi et aux règles de l'art**.
- Respecter les **horaires, tarifs et engagements** convenus.
- Maintenir une **hygiène professionnelle** appropriée.
- Utiliser un **matériel sécurisé et adapté**.
- Souscrire les **assurances obligatoires** liées à son activité.

## 4. Tarification et commission

- Le Prestataire fixe librement ses tarifs, dans le respect de la réglementation.
- Jokoo prélève une **commission de 10 à 15 %** sur chaque mission payée via la Plateforme.
- Aucun tarif surprise, frais caché ou pourboire imposé ne peut être exigé.

## 5. Paiement des gains

- Les gains sont crédités sur le **portefeuille Jokoo** du Prestataire.
- Le Prestataire peut retirer ses fonds via Wave, Orange Money ou virement bancaire (délai 24-48 h ouvrées).
- Voir la *Politique de paiement* pour les détails.

## 6. Interdictions

- **Aucune sollicitation hors app** pour contourner la commission Jokoo sur une mission trouvée via la Plateforme.
- **Aucune sous-traitance** sans accord préalable écrit du Client et information de Jokoo.
- **Aucun contact déplacé** avec un Client (harcèlement, propositions personnelles, rendez-vous non professionnels).
- **Aucune activité illégale** ou dangereuse.

## 7. Assurances et responsabilités

Le Prestataire garantit Jokoo contre toute réclamation liée aux prestations qu'il fournit. Le Prestataire assume l'**intégralité des dommages** causés à un Client ou à un tiers du fait de son intervention.

## 8. Résiliation

- Le Prestataire peut fermer son compte à tout moment.
- Jokoo peut suspendre ou résilier un compte en cas de manquements graves (fraude, plaintes récurrentes, note moyenne < 3 ★, absence répétée).

## 9. Contact

`prestataires@jokooservices.com`
""",
},

"privacy": {
"title": "Politique de confidentialité",
"summary": "Comment Jokoo collecte, utilise et protège vos données personnelles.",
"category": "conditions",
"requires_acceptance": True,
"content": """
Cette Politique de confidentialité décrit comment **Jokoo Services SARL** (« Jokoo ») collecte, utilise, partage et protège vos données personnelles, conformément à la **loi sénégalaise n° 2008-12 du 25 janvier 2008** relative à la protection des données à caractère personnel.

## 1. Responsable du traitement

**Jokoo Services SARL**, siège social à Dakar, Sénégal.  
**Délégué à la protection des données** : `dpo@jokooservices.com`.

## 2. Données que nous collectons

- **Identification** : nom, prénom, date de naissance, photo, pièce d'identité.
- **Contact** : téléphone, e-mail, adresse postale.
- **Compte** : identifiants, mot de passe (chiffré), rôle.
- **Localisation** : GPS (avec consentement, pour proposer des services proches).
- **Financières** : moyen de paiement (jamais la totalité du numéro de carte), historique des transactions.
- **Vérification** : documents fournis pour être Vérifié+ (casier, diplômes).
- **Usage** : logs, appareils, adresses IP, préférences.
- **Communications** : messages échangés dans l'app, appels au support.

## 3. Base légale du traitement

- **Exécution du contrat** (CGU).
- **Consentement** (marketing, géolocalisation fine).
- **Obligation légale** (KYC, lutte anti-fraude).
- **Intérêt légitime** (sécurité, amélioration du service).

## 4. Finalités

- Fournir et améliorer la Plateforme.
- Vérifier votre identité et lutter contre la fraude.
- Mettre en relation clients et prestataires.
- Traiter les paiements.
- Communiquer avec vous (support, notifications, promos).
- Respecter les obligations légales.

## 5. Partage des données

Vos données peuvent être partagées avec :
- **Autres Utilisateurs** — uniquement les informations nécessaires (prénom, photo, note).
- **Prestataires techniques** (hébergement, e-mail, paiement, analytics) sous contrat de confidentialité.
- **Autorités** sur réquisition judiciaire dûment motivée.

Nous ne **vendons jamais** vos données.

## 6. Transferts internationaux

Certaines données peuvent être hébergées hors du Sénégal (Union européenne, États-Unis). Dans ce cas, Jokoo s'assure que le pays destinataire assure un niveau de protection adéquat ou signe des clauses contractuelles types.

## 7. Durée de conservation

- **Compte actif** : durant toute la relation contractuelle.
- **Compte fermé** : archivage 3 ans (obligations fiscales, litiges) puis suppression.
- **Données de paiement** : 10 ans (obligations comptables).
- **Logs** : 12 mois.

## 8. Vos droits

Vous disposez des droits suivants :
- **Accès** aux données que nous détenons sur vous.
- **Rectification** en cas d'erreur.
- **Effacement** (« droit à l'oubli ») sous conditions.
- **Opposition** aux traitements pour motif légitime.
- **Portabilité** des données que vous avez fournies.
- **Retrait du consentement** à tout moment (marketing, géoloc).

Contact : `dpo@jokooservices.com`. Réponse sous 30 jours.

## 9. Sécurité

Nous protégeons vos données par :
- Chiffrement TLS 1.2+ en transit.
- Chiffrement des mots de passe (bcrypt).
- Contrôle d'accès strict (RBAC).
- Sauvegardes régulières.
- Audits de sécurité périodiques.

## 10. Cookies

Voir la *Politique relative aux cookies*.

## 11. Réclamation

En cas de désaccord, vous pouvez saisir la **Commission de Protection des Données Personnelles (CDP)** du Sénégal.

## 12. Modifications

Cette politique peut être modifiée. La date de dernière mise à jour est indiquée en tête. En cas de changement substantiel, nous vous en informerons.
""",
},

"data-protection": {
"title": "Politique de protection des données",
"summary": "Mesures techniques et organisationnelles mises en place pour protéger vos données.",
"category": "conditions",
"requires_acceptance": False,
"content": """
## 1. Objet

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
- **DPO nommé** : `dpo@jokooservices.com`.

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

Pour toute question relative à la sécurité de vos données : `dpo@jokooservices.com`.
""",
},

"cookies": {
"title": "Politique relative aux cookies",
"summary": "Utilisation des cookies et technologies similaires par Jokoo.",
"category": "conditions",
"requires_acceptance": False,
"content": """
## 1. Qu'est-ce qu'un cookie ?

Un **cookie** est un petit fichier texte déposé sur votre appareil lorsque vous visitez un site web ou utilisez une application. Il permet de reconnaître votre appareil et de mémoriser certaines informations.

## 2. Cookies utilisés par Jokoo

### 2.1 Cookies strictement nécessaires
Indispensables au fonctionnement de la Plateforme. Ils ne peuvent être désactivés.
- Session d'authentification.
- Prévention de la fraude.
- Consentement enregistré.

### 2.2 Cookies de mesure d'audience
Nous aident à comprendre l'usage de la Plateforme.
- Statistiques de visite.
- Performance et erreurs.

### 2.3 Cookies fonctionnels
Améliorent l'expérience utilisateur.
- Préférence de langue.
- Ville par défaut.

### 2.4 Cookies marketing
Utilisés uniquement avec votre consentement explicite.
- Campagnes publicitaires.
- Reciblage.

## 3. Vos choix

- Lors de votre première visite, un **bandeau de consentement** vous permet d'accepter, de refuser ou de personnaliser les cookies non essentiels.
- Vous pouvez modifier vos choix à tout moment via **Paramètres → Cookies**.

## 4. Durée

- **Cookies de session** : supprimés à la fermeture de l'app/navigateur.
- **Cookies persistants** : maximum 13 mois.

## 5. Cookies tiers

Certains cookies peuvent être déposés par nos partenaires (Stripe, analytics). Ces tiers sont contractuellement engagés à respecter la présente politique et la législation applicable.

## 6. Suppression manuelle

Vous pouvez à tout moment supprimer les cookies via les paramètres de votre navigateur ou de votre appareil.

## 7. Contact

`dpo@jokooservices.com`
""",
},

"mentions-legales": {
"title": "Mentions légales",
"summary": "Informations légales sur l'éditeur de Jokoo.",
"category": "conditions",
"requires_acceptance": False,
"content": """
## Éditeur

**Jokoo Services SARL**  
Société à Responsabilité Limitée immatriculée au Registre du Commerce et du Crédit Mobilier de Dakar.  
Siège social : Dakar, Sénégal.  
E-mail : `contact@jokooservices.com`  
Téléphone : +221 77 000 00 00

## Directeur de la publication

Le représentant légal en exercice de Jokoo Services SARL.

## Hébergement

- **Application mobile** : Emergent Cloud.
- **Site web** : Vercel Inc. — 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis.
- **Base de données** : MongoDB Atlas, hébergement en Union européenne.

## Propriété intellectuelle

L'ensemble des éléments de la Plateforme (marque « Jokoo », logo, textes, images, code source, base de données, illustrations, sons) est **protégé** par le droit sénégalais et les conventions internationales. Toute reproduction, représentation, adaptation, distribution ou exploitation, même partielle, sans autorisation écrite préalable est interdite et constitue une contrefaçon susceptible de sanctions civiles et pénales.

## Marques

« **Jokoo** » et son logo sont des marques déposées de Jokoo Services SARL.

## Contenus utilisateurs

Les avis, photos et contenus publiés par les Utilisateurs restent leur propriété. Les Utilisateurs concèdent à Jokoo une **licence** d'utilisation aux fins d'exploitation de la Plateforme (voir *CGU*).

## Responsabilité

Jokoo agit en qualité d'**intermédiaire technique**. Voir *CGU* et *Politique de sécurité* pour la limitation de responsabilité.

## Signalement de contenu

Pour signaler un contenu illégal, contrefaisant ou contraire à nos règles :  
`legal@jokooservices.com`

## Loi applicable

Les présentes mentions sont soumises au **droit sénégalais**. En cas de litige, les tribunaux de **Dakar** sont seuls compétents.

## Date de dernière mise à jour

Voir en tête de document.
""",
},

"geolocation-policy": {
"title": "Politique de géolocalisation",
"summary": "Comment Jokoo utilise votre position pour vous proposer les meilleurs services.",
"category": "conditions",
"requires_acceptance": False,
"content": """
## 1. Objectif

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

`dpo@jokooservices.com`
""",
},

# ============ PAIEMENTS ============
"payment-policy": {
"title": "Politique de paiement",
"summary": "Modalités de paiement, commissions, portefeuille et retraits sur Jokoo.",
"category": "paiements",
"requires_acceptance": True,
"content": """
## 1. Moyens de paiement acceptés

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
- Pour toute question : `paiements@jokooservices.com`.
""",
},

"refund-policy": {
"title": "Politique de remboursement",
"summary": "Dans quels cas Jokoo procède à un remboursement, et selon quelles modalités.",
"category": "paiements",
"requires_acceptance": True,
"content": """
## 1. Principe général

Un remboursement est possible lorsque **la mission n'a pas été réalisée conformément aux attentes légitimes** du Client, sous réserve des conditions ci-dessous.

## 2. Cas de remboursement intégral

Le Client obtient un **remboursement à 100 %** dans les cas suivants :

- Le Prestataire **ne s'est pas présenté** sans motif légitime.
- Le Prestataire **annule** la mission moins de 2 heures avant l'horaire prévu.
- La mission n'a pas été réalisée à cause d'une **défaillance de Jokoo** (bug, indisponibilité).
- **Fraude établie** du Prestataire.

## 3. Cas de remboursement partiel

Un remboursement partiel peut être accordé si :

- La mission a été **partiellement réalisée**.
- Le service rendu **ne correspond pas** à la description convenue.
- Un défaut significatif a été constaté (matériel défectueux, service incomplet).

Le montant est apprécié au cas par cas par l'équipe litiges.

## 4. Cas de non-remboursement

Aucun remboursement ne sera accordé si :

- Le Client **annule** la mission dans un délai non prévu par la *Politique d'annulation*.
- Le Client **empêche** la réalisation (absence, refus d'accès).
- Le Client formule un motif **frauduleux** ou manifestement infondé.
- Le Client réclame un remboursement **après la validation** de la mission et un délai de 14 jours.

## 5. Procédure

1. Le Client dépose une réclamation dans l'app : **Aide → Contester une mission**.
2. Il joint tous les éléments utiles (photos, messages, factures).
3. Jokoo notifie le Prestataire, qui dispose de **48 heures** pour répondre.
4. L'équipe litiges rend une **décision motivée sous 7 jours ouvrés**.
5. Le remboursement, s'il est accordé, est effectué sous **5 jours ouvrés** vers le moyen de paiement d'origine.

## 6. Recours

Le Client comme le Prestataire peuvent contester la décision sous **15 jours** en écrivant à `legal@jokooservices.com`. Une seconde revue est effectuée par un membre indépendant. La décision finale est rendue sous **15 jours ouvrés**.

## 7. Frais bancaires

Jokoo n'applique aucun frais sur les remboursements. Les frais éventuels de conversion appliqués par l'établissement bancaire du Client ne sont pas remboursés.

## 8. Contact

`paiements@jokooservices.com`
""",
},

"cancellation-policy": {
"title": "Politique d'annulation",
"summary": "Délais et conditions pour annuler une mission Jokoo sans frais.",
"category": "paiements",
"requires_acceptance": True,
"content": """
## 1. Annulation par le Client

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

`support@jokooservices.com`
""",
},

# ============ SÉCURITÉ ============
"security-policy": {
"title": "Politique de sécurité",
"summary": "Nos règles et bonnes pratiques pour garantir la sécurité de la communauté Jokoo.",
"category": "securite",
"requires_acceptance": False,
"content": """
## 1. Notre engagement

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
- **E-mail** : `security@jokooservices.com`
- **Police** : 17.
- **Pompiers** : 18.
- **SAMU** : 15.

## 7. Vulnérabilités techniques

Si vous découvrez une **faille de sécurité** dans nos systèmes, écrivez à `security@jokooservices.com`. Nous accueillons les chercheurs de bonne foi (*responsible disclosure*) et pouvons offrir une récompense.

## 8. Ne restez pas seul

Un doute, une inquiétude ? Contactez le support 24/7. Nous préférerons **toujours** un signalement d'excès de prudence qu'un incident non signalé.
""",
},

"verification-policy": {
"title": "Politique de vérification des prestataires",
"summary": "Comment Jokoo vérifie l'identité, les compétences et l'intégrité des prestataires.",
"category": "securite",
"requires_acceptance": False,
"content": """
## 1. Objectif

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

`verification@jokooservices.com`
""",
},

"anti-fraud": {
"title": "Politique anti-fraude",
"summary": "Notre stratégie de lutte contre la fraude sur Jokoo.",
"category": "securite",
"requires_acceptance": False,
"content": """
## 1. Types de fraude combattus

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

Pour signaler une fraude : `fraude@jokooservices.com` ou bouton **Signaler** in-app.

## 8. Récompenses

Jokoo peut, à sa discrétion, récompenser les Utilisateurs dont le signalement permet de démasquer une fraude majeure.
""",
},

"children-protection": {
"title": "Politique de protection des enfants",
"summary": "Nos engagements pour protéger les mineurs dans l'utilisation de Jokoo.",
"category": "securite",
"requires_acceptance": False,
"content": """
## 1. Principe fondamental

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

`family@jokooservices.com` — bouton SOS pour les urgences.
""",
},
}

# -------------------- IMPLÉMENTATION --------------------
async def main():
    print(f"Connexion à MongoDB : {MONGO_URL} / db={DB_NAME}")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    updated = 0
    created = 0
    for slug, data in DOCS.items():
        existing = await db.legal_documents.find_one({"slug": slug, "language": LANGUAGE, "country": COUNTRY})
        version = (existing.get("version", 0) if existing else 0) + 1
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "slug": slug,
            "title": data["title"].strip(),
            "content": data["content"].strip(),
            "summary": data["summary"].strip(),
            "category": data["category"],
            "language": LANGUAGE,
            "country": COUNTRY,
            "version": version,
            "requires_acceptance": data.get("requires_acceptance", False),
            "published": True,
            "effective_date": EFFECTIVE_DATE,
            "updated_at": now,
            "updated_by": "seed_script",
            "order": existing.get("order", 100) if existing else 100,
        }
        if existing:
            doc["created_at"] = existing.get("created_at", now)
            await db.legal_documents.update_one(
                {"slug": slug, "language": LANGUAGE, "country": COUNTRY},
                {"$set": doc},
            )
            updated += 1
            print(f"  ↻ Mise à jour : {slug} (v{version})")
        else:
            doc["created_at"] = now
            await db.legal_documents.insert_one(doc)
            created += 1
            print(f"  ✓ Créé : {slug} (v{version})")

        # Historique
        import uuid
        await db.legal_versions.insert_one({
            "id": str(uuid.uuid4()),
            **doc,
            "author_id": "seed_script",
        })

    print(f"\nTerminé : {updated} document(s) mis à jour, {created} créé(s).")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
