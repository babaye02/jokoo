# 02 — Revue Product Manager : frictions écran par écran

> Hypothèse : 10 000 utilisateurs/jour. Chaque friction est classée par **impact
> croissance** : 🔴 bloque l'activation ou le revenu · 🟠 dégrade la conversion ·
> 🟡 irritant, à traiter ensuite.

## Parcours 1 — Onboarding & inscription

| # | Friction | Impact | Correctif |
|---|---|---|---|
| 1 | Inscription email+mot de passe en premier : au Sénégal, beaucoup d'utilisateurs n'ont pas d'email actif. L'OTP téléphone existe mais n'est pas le chemin par défaut. | 🔴 | Inverser : téléphone+OTP par défaut, email optionnel. |
| 2 | Aucune valeur montrée avant l'inscription (pas de mode invité complet sur recherche/prix). | 🔴 | Laisser chercher, voir profils et prix sans compte ; exiger le compte à la réservation seulement. |
| 3 | Pas de choix de langue au premier écran (wolof absent). | 🟠 | Sélecteur FR/Wolof à l'onboarding. |
| 4 | Le rôle (client / prestataire) est demandé tôt ; un client qui hésite abandonne. | 🟡 | Tout le monde entre en client ; « Devenir prestataire » en une action depuis le profil (existe déjà — le rendre plus visible). |

## Parcours 2 — Accueil & recherche

| # | Friction | Impact | Correctif |
|---|---|---|---|
| 5 | La recherche exige de savoir quoi taper ; pas de suggestions par problème (« fuite d'eau » → plombier). | 🔴 | Mapping problème→catégorie + recherches populaires cliquables. |
| 6 | Résultats sans tri explicite (prix, note, distance). | 🟠 | Barre de tri persistante + filtre « Vérifié uniquement ». |
| 7 | Photos base64 → listes lentes en 3G. | 🔴 | Finir migration Cloudinary + placeholders blurhash. |
| 8 | Les cartes Covoiturage/Livraison premium (bien !) mais le reste des catégories reste statique — incohérence visuelle. | 🟡 | Étendre le style photo aux 4-6 catégories du haut, mesurer le CTR. |

## Parcours 3 — Profil prestataire → réservation

| # | Friction | Impact | Correctif |
|---|---|---|---|
| 9 | Prix « à partir de » sans fourchette ni devis-type → peur du prix final = 1er motif d'abandon. | 🔴 | Fourchettes par prestation + exemples de devis réels anonymisés. |
| 10 | La réservation demande date+heure+adresse+description d'un coup (4 champs, 1 écran). | 🟠 | Découper en 2 étapes max, adresse via GPS par défaut. |
| 11 | Aucune indication du délai de réponse du pro (« répond en ~2 h »). | 🟠 | Afficher le temps de réponse médian calculé (données bookings disponibles). |
| 12 | Après réservation : écran de confirmation sans prochaine étape claire. | 🟠 | CTA « Envoyer un message » + timeline d'étapes (envoyée → acceptée → en cours). |
| 13 | 112 réservations « pending » en base : les pros ne répondent pas, les clients ne le savent pas. | 🔴 | Expiration auto à 24 h + re-dispatch vers 3 pros similaires + push de relance au pro à H+2. |

## Parcours 4 — Chat

| # | Friction | Impact | Correctif |
|---|---|---|---|
| 14 | Polling 3 s : latence perçue + batterie. | 🟠 | WebSocket ; à défaut backoff intelligent. |
| 15 | Vocaux ✅, position ✅, quick replies ✅ — mais pas d'envoi de photo du problème (le cas d'usage n°1 d'un dépannage !). | 🔴 | Upload photo dans le chat (Cloudinary, pipeline existant côté ads). |
| 16 | Pas d'indicateur « vu / en train d'écrire ». | 🟡 | Read receipts simples (le champ `read` existe déjà). |

## Parcours 5 — Paiement & wallet

| # | Friction | Impact | Correctif |
|---|---|---|---|
| 17 | Recharge wallet : Wave/OM absents en prod → seul le cash fonctionne vraiment. | 🔴 | Cf. risque CEO n°2 — clés API. |
| 18 | Le prestataire découvre la commission au moment du débit → sentiment de ponction. | 🟠 | Afficher la commission estimée AVANT d'accepter la mission. |
| 19 | Aucune facture/reçu téléchargeable après paiement. | 🟡 | Reçu PDF simple (utile aussi pour les pros semi-formels). |

## Parcours 6 — Mobilité

| # | Friction | Impact | Correctif |
|---|---|---|---|
| 20 | Deux entrées (« je cherche » / « je propose ») claires ✅, mais le passager ne voit pas le taux de réussite de sa demande (« 83 % des demandes Dakar→Thiès trouvent un conducteur »). | 🟠 | Injecter les stats de matching dans le formulaire de demande. |
| 21 | Réservation de trajet sans paiement in-app → no-show sans coût. | 🔴 | Acompte wallet (500 F) remboursable à l'embarquement, dès que Wave est actif. |
| 22 | Badge « Jokoo Vérifié » ✅ — mais rien n'explique ce qu'il garantit. | 🟡 | Bottom sheet « Ce que vérifie Jokoo » au tap sur le badge. |

## Parcours 7 — Côté prestataire

| # | Friction | Impact | Correctif |
|---|---|---|---|
| 23 | Le dashboard pro ne dit pas quoi faire pour gagner plus (profil incomplet, photos manquantes, réponses lentes). | 🔴 | Score de profil + 3 recommandations actionnables (« ajoutez 2 photos = +30 % de contacts »). |
| 24 | Pas de gestion de disponibilité/calendrier → double réservation. | 🟠 | Toggle « disponible aujourd'hui » minimal d'abord. |
| 25 | La dette wallet est visible mais sans chemin de sortie évident quand Wave est absent. | 🔴 | Écran « Régler ma dette » avec toutes les options + échéancier. |

## Synthèse priorisée (à faire dans l'ordre)

1. 🔴 Wave/OM en prod (#17, #21, #25)
2. 🔴 Pending bookings : expiration + re-dispatch (#13)
3. 🔴 Photos dans le chat (#15) + migration Cloudinary (#7)
4. 🔴 Téléphone-first à l'inscription + mode invité (#1, #2)
5. 🔴 Score de profil pro actionnable (#23)
6. 🟠 Fourchettes de prix (#9) + temps de réponse (#11)
7. 🟠 Commission visible avant acceptation (#18)
