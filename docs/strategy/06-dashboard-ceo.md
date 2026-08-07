# 06 — Dashboard CEO : indicateurs & seuils (référence de l'écran /admin/ceo)

> **Statut : CONSTRUIT** ✅ — écran `/admin/ceo` (Cockpit CEO) + endpoint
> `GET /api/admin/ceo/dashboard` (permission `stats:read`).
> Ce document décrit les indicateurs livrés, leurs seuils, et la phase 2.

## Principe : « bien ou mal en 30 secondes »
1. **Feu tricolore global** (ok / à surveiller / action requise) calculé par domaine.
2. **3 chiffres héros** : GMV 30 j · Revenu 30 j (take rate) · Inscrits 7 j (delta).
3. Détail par domaine, chaque ligne critique passe en orange.

## Indicateurs livrés

### 💰 Finance
| Indicateur | Source | Seuil warn | Seuil crit |
|---|---|---|---|
| GMV 30 j (services + covoit. + colis) | bookings completed, ride_bookings confirmed, parcels delivered | — | — |
| Revenu 30 j (commissions cash + Jokoo Pro) | wallet_transactions_v2 | take rate < 5 % | — |
| Take rate | revenu / GMV | < 5 % | — |
| Float wallet (soldes positifs) | wallets_v2 | — | — |
| Dette wallet + nb débiteurs | wallets_v2 (soldes négatifs) | > 20 % du float | > 100 % du float |
| Recharges 30 j (volume + nombre) | txns type recharge | — | — |
| Abonnés Jokoo Pro actifs | subscriptions | — | — |

### 📈 Croissance
| Indicateur | Seuil warn | Seuil crit |
|---|---|---|
| Nouveaux utilisateurs 24 h / 7 j / 30 j | 7 j < 7 j précédents | 0 inscrit/7 j |
| Inscriptions par jour (sparkline 7 j) | — | — |
| Ambassadeurs actifs / filleuls | — | — |

### ⚙️ Opérations
| Indicateur | Seuil warn | Seuil crit |
|---|---|---|
| Réservations 7 j / 30 j | — | — |
| Taux de complétion 30 j | < 60 % | < 40 % |
| Réservations en attente de réponse pro | — | — |
| Prestataires actifs 30 j / total | — | — |
| Files d'attente admin (KYC, signalements, remboursements, retraits, suggestions) | total > 25 | — |

### ⭐ Qualité
| Indicateur | Seuil warn | Seuil crit |
|---|---|---|
| Note moyenne 30 j (+ nb avis) | < 4,0 | < 3,5 |
| Taux d'annulation 30 j | > 25 % | — |
| Tentatives de contournement 7 j (contact_flags) | > 0 (visibilité) | — |

### 🚗 Mobilité
| Indicateur | Seuil warn |
|---|---|
| Demandes ouvertes | — |
| Taux de matching 7 j | < 30 % (si ≥ 5 demandes) |
| Trajets actifs (dont Jokoo Vérifié) | — |

## Phase 2 (à construire quand les données existeront)
- **Rétention** : D7/D30 par cohorte d'inscription (nécessite tracking `last_seen`).
- **CAC par canal** : tag d'acquisition à l'inscription (`utm`/code ambassadeur).
- **LTV / CAC** : dès 3 mois de données de revenus par cohorte.
- **Temps de réponse médian des pros** (booking créé → premier changement de statut).
- **NPS post-mission** (mini-enquête 1 question après complétion).
- **Coûts serveurs** vs GMV (unit economics infra) — import manuel mensuel.
- **Alertes push CEO** : envoyer une notification quand un domaine passe « crit »
  (module push CRM existant).
