#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Add a Mobility module to Jokoo with two services: Covoiturage (Carpooling) and Livraison (Delivery).
  Phase 1+2 focus: Backend foundations + Covoiturage complete (drivers publish rides, passengers search & book, my rides & bookings screens, home hub, cancel flows, messaging integration).

backend:
  - task: "Parcels · Livraison longue distance"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Extended Ride model with accepts_parcels (bool), parcel_price_xof (int), parcel_max_kg (int), parcel_payment_mode ("app_only"|"app_or_cash"|"cash_only"). New endpoints:
          - POST /api/rides/{rid}/parcel — create parcel request (requires ride.accepts_parcels && ride.distance_type=='long'; blocks self-driver, over-weight, incompatible payment mode)
          - GET /api/parcels/mine — sender view
          - GET /api/parcels/received — driver view
          - GET /api/parcels/{pid} — auth: sender OR driver OR admin
          - PATCH /api/parcels/{pid} — status transitions with per-role guards.
      - working: true
        agent: "main"
        comment: "24/24 pytest tests passed after fixing test-file issues (min_length constraint expected 400 but got 422 with 'A'/'B' strings; test-file updated to use ≥ 2-char strings). Report at /app/test_reports/iteration_3.json."

  - task: "Rides CRUD + booking"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added endpoints POST/GET /api/rides, GET /api/rides/mine, GET /api/rides/{id}, PATCH /api/rides/{id}, DELETE /api/rides/{id}, POST /api/rides/{id}/book, GET /api/rides/bookings/mine, GET /api/rides/bookings/received, PATCH /api/rides/bookings/{id}. Seed adds demo driver (chauffeur@jokoo.sn / Driver1234!) with 4 sample rides. Search supports filters: from_city, to_city, date, distance_type (weekly recurrence also matches when date's weekday is in recurrence_days)."
      - working: true
        agent: "testing"
        comment: "32/32 pytest tests passed. All CRUD + booking flows including weekly recurrence matching, seat decrement/restore, notifications, and 403/404 guards work as expected. Minor optional improvements suggested (re-confirm booking flow, return updated docs)."

frontend:
  - task: "Mobility hub + Covoiturage screens"
    implemented: true
    working: "NA"
    file: "frontend/app/mobility/*"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added /mobility (hub), /mobility/rides (search), /mobility/rides/publish, /mobility/rides/[id] (detail + book), /mobility/rides/mine (passenger/driver tabs), /mobility/delivery (coming soon). Home tab now shows a 'Mobilité' section with Covoiturage + Livraison cards. Profile menu adds mobility shortcut + my rides. Uses existing chat for driver contact."

  - task: "Review notification (review_received) delivered to provider"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          POST /api/reviews now supports booking_id-only (resolves provider from booking), stamps booking.review_id, and inserts a notification of type `review_received` targeted at `user_id=provider_id` with `booking_id` and `review_id`. Ratings recomputed on providers doc.
      - working: true
        agent: "testing"
        comment: "iteration_23 PASS (22/22) — booking_id-only OK, tiers 403, dupe 400, notif livrée au prestataire, rating recomputé."

  - task: "Family session notebook (carnet) delivered to parent"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          POST /api/family/bookings/{bid}/report creates a babysitting_reports doc, sets booking.report_id + status=completed + paid=true, and inserts a notification of type `babysitting_report` targeted at parent with `family_booking_id`. GET /api/family/bookings/{bid}/report returns 200 for parent/sitter/admin, else 403; 404 if not yet submitted.
      - working: true
        agent: "testing"
        comment: "iteration_23 PASS (22/22) — parent 200 / babysitter 200 / admin 200 / tiers 403 / 404 avant soumission / 404 sur id bidon. Notif livrée correctement au parent."

  - task: "Blocked users bidirectional visibility filter"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Added `_blocked_ids(user_id)` and `_is_pair_blocked(a, b)` helpers using the `blocked_users` collection.
          Applied bidirectional filtering to:
          • GET /api/providers — list excludes providers where either party blocked the other.
          • GET /api/providers/{id} — 404 if pair blocked.
          • POST /api/bookings — 403 if pair blocked.
          • GET /api/rides — list excludes rides where driver is blocked either way.
          • GET /api/rides/{rid} — 404 if pair blocked.
          • POST /api/rides/{rid}/book — 403 if pair blocked.
          • POST /api/rides/{rid}/parcel — 403 if pair blocked.
          • GET /api/family/babysitters — list excludes babysitters blocked either way.
          • GET /api/family/babysitters/{bid} — 404 if pair blocked.
          • POST /api/family/bookings — 403 if pair blocked.
          • GET /api/chat/{peer_id}/messages — returns [] if pair blocked.
          • POST /api/chat/{peer_id}/messages — 403 if pair blocked.
          • GET /api/chat/conversations — hides peers where mutually blocked.

frontend:
  - task: "Notification routing for review_received + babysitting_report"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/notifications.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          routeForNotif() maps `review_received` → /booking/detail/{booking_id} and any `babysitting_*` → /family/booking/{family_booking_id}. /family/booking/[id]/index.tsx now loads and renders the notebook when `report_id` is set on the booking.

metadata:
  created_by: "main_agent"
  version: "1.12"
  test_sequence: 13
  run_ui: true

test_plan:
  current_focus:
    - "FAMILY NOTATION — Nouveau système de notation parent → baby-sitter (backend + UI)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Bug user : « Je n'arrive toujours pas à noter malgré que je vois "vous pouvez maintenant noter" ».

      **Cause racine** : le message vient du flux **Family / babysitting**. Le parent était notifié qu'il peut noter, MAIS aucun endpoint ni UI n'existait pour noter une baby-sitter (le système reviews existant ne couvrait QUE les prestataires).

      **Fix — Nouveau système end-to-end créé** :

      Backend (`backend/server.py`) :
      - `POST /api/family/reviews {family_booking_id, rating, comment}` — mêmes garde-fous que provider reviews : parent-only, completed-only, 1..5, un seul, pas d'auto-notation. Recompute `babysitters.rating` + `reviews_count`. Notif `review_received` livrée à la baby-sitter.
      - `GET /api/family/reviews?babysitter_id=X&limit=N` — liste publique.
      - `GET /api/family/bookings/{bid}/review-eligibility` — utilitaire UI.
      - Collection `family_reviews` (nouvelle, séparée de `reviews`).

      Frontend :
      - `frontend/app/family/booking/[id]/review.tsx` (NOUVEAU) — formulaire 5 étoiles + commentaire optionnel + submit.
      - `frontend/app/family/booking/[id]/index.tsx` — nouvelle carte CTA "Laissez un avis" (`testID=family-leave-review-btn`) visible si `isParent && status==="completed" && !review_id`.
      - `frontend/app/family/babysitter/[id].tsx` — section "Avis parents (N)" avec les 5 derniers avis (auteur, stars, commentaire).

      Tests attendus :

      **Backend** (`test_iter32_family_reviews.py`) :
      1. `POST /family/reviews` sans `family_booking_id` → 422.
      2. `POST` avec booking bidon → 404.
      3. `POST` par la baby-sitter (pas le parent) → 403.
      4. `POST` sur booking `confirmed` (pas completed) → 400.
      5. `POST` valide → 200, doc créé, `babysitters.rating` recomputé, `reviews_count += 1`, notif `review_received` chez la sitter.
      6. `POST` 2e fois → 400 "déjà laissé".
      7. Rating 0 ou 6 → 422.
      8. Self-review si sitter_user_id == parent_id → 400.
      9. `GET /family/reviews?babysitter_id=X` → liste triée récent→ancien.
      10. `GET /family/bookings/{bid}/review-eligibility` → true/false + reason.

      **Frontend UI** (playwright localhost:3000) :
      1. Login parent, ouvrir `/family/booking/{bid}` d'une session completed sans review → carte "Laissez un avis" visible + `family-leave-review-btn`.
      2. Tap → `/family/booking/{bid}/review` avec `star-1..5` + `review-comment` + `review-submit`.
      3. Publier → retour à `/family/booking/{bid}?just_reviewed=1`, carte review disparue.
      4. Aller sur `/family/babysitter/{sitter_id}` → section "Avis parents (1)" avec le nouvel avis.

      Livrable : `/app/test_reports/iteration_32.json`. Nettoyage post-run.

      Backend : `http://localhost:8001/api/*`.
      Credentials : `/app/memory/test_credentials.md`.


agent_communication:
  - agent: "main"
    message: |
      Audit exhaustif du système de notation demandé par le user. Corrections backend appliquées :

      **Fixes backend `server.py` POST /reviews** :
      - Suppression du mode legacy `provider_id`-only (contournement possible). Désormais `booking_id` **obligatoire** → 400 sans lui.
      - Vérification `booking.status == "completed"` obligatoire → 400 sinon.
      - Vérification que le provider n'est pas soi-même → 400.
      - Un seul avis par booking (via `review_id`).
      - Rating 1..5 (Pydantic Field).
      - Comment optionnel (trim + default "").
      - Notif `review_received` immédiate au prestataire.
      - Recompute exact de `providers.rating` (2 décimales) + `reviews_count`.

      **Nouveaux endpoints ajoutés** :
      - `GET /api/reviews?provider_id=X&limit=N` : liste publique des avis d'un prestataire (visible par tous, futurs clients inclus).
      - `GET /api/bookings/{bid}/review-eligibility` : indique si le client peut noter (`{eligible: bool, reason?: string}`).

      **Frontend déjà OK (audit)** :
      - `/booking/detail/[id]` : carte "Laissez un avis" visible si `isClient && status==="completed" && !review_id`.
      - `/booking/review/[id]` : formulaire stars 1-5 + commentaire optionnel, POST /reviews avec `booking_id` uniquement.
      - `/provider/[id]` : affichage rating + reviews_count + liste des 5 derniers avis.
      - `/(tabs)/index` et `/(tabs)/search` : affichage rating + reviews_count sur les cards prestataires.

      Tester **backend + frontend UI** :

      ## Backend
      1. `POST /reviews` sans booking_id → 400.
      2. `POST /reviews` avec booking pending → 400 "mission terminée".
      3. `POST /reviews` avec booking completed du bon client → 200, doc créé, providers.rating recomputé, notif review_received chez le prestataire.
      4. `POST /reviews` 2e fois sur même booking → 400.
      5. `POST /reviews` par un tiers (pas le client) → 403.
      6. `POST /reviews` où provider_id == user_id (self-review edge case) → 400.
      7. Rating 0 ou 6 → 422 (Pydantic).
      8. Comment "" → 200 (facultatif).
      9. `GET /reviews?provider_id=X` → liste triée récent→ancien.
      10. `GET /bookings/{bid}/review-eligibility` : true/false selon état.
      11. `GET /providers/{id}` → `rating` et `reviews_count` reflètent les avis existants.

      ## Frontend UI (playwright localhost:3000)
      1. Login client, ouvrir une réservation `completed` sans review → carte "Laissez un avis" visible + bouton `leave-review-btn`.
      2. Cliquer → écran `/booking/review/{id}` avec 5 étoiles cliquables (`testID=star-1..5`).
      3. Sélectionner 4 étoiles, tapper un commentaire, cliquer "Publier l'avis" (`testID=review-submit`).
      4. Retour à `/booking/detail/{id}` avec query `just_reviewed=1`. La carte review ne doit plus apparaître (review_id set).
      5. Aller sur `/provider/{provider_id}` → la nouvelle note apparaît dans la liste "Avis clients".

      Rapport dans `/app/test_reports/iteration_31.json`. Nettoyage post-run.

      Backend : `http://localhost:8001/api/*`.
      Credentials : `/app/memory/test_credentials.md`.


agent_communication:
  - agent: "main"
    message: |
      Fixes appliqués sur les 4 CRITICAL + 4 MAJOR d'iter29. À valider.

      **CRITICAL FIXES** :

      1) **POST /reviews sans check status='completed'** (server.py:1317 area)
         → Fix : ajout `if b.get("status") != "completed": raise HTTPException(400, "Vous ne pouvez noter qu'une mission terminée")`.
         → Test : POST /reviews sur booking `pending` → 400 ; sur booking `completed` → 200.

      2) **PATCH /bookings status=cancelled depuis completed** (server.py:1278 area)
         → Fix : state machine ajoutée. Transitions depuis `completed`/`refunded`/`rejected` → 400. `cancelled → *` (sauf cancelled) → 400.
         → Test : PATCH cancelled sur booking completed → 400.

      3) **POST /providers/me réinitialisant rating** (server.py:1043-1074)
         → Fix : fetch existing doc, isole `rating`/`reviews_count`/`subscription_*` des champs éditables. Ne set à 0 qu'à la **1ère création**.
         → Test : provider avec rating=5.0 fait POST /providers/me (edit desc) → rating reste 5.0.

      4) **PATCH cancel sans rollback commission cash** (server.py:1249+)
         → Fix : sur PATCH status=cancelled ET booking.paid ET paid_method="cash" → `$inc commission_due: -commission` + log wallet_transactions (`type:"refund"`).
         → Test : provider cash-paye un booking (commission_due +X), puis annule le booking → commission_due -X (0), transaction refund présente.

      **MAJOR FIXES** :

      5) **Cash-payment sans notif client** (server.py:1657+)
         → Fix : ajout notif type=`payment_received` au client après cash-payment.

      6) **push_tokens non purgés au DELETE users/me** (server.py:3210+)
         → Fix : `db.push_tokens.delete_many` + `db.notification_prefs.delete_many` + `db.password_resets.delete_many` ajoutés.

      7) **booking.paid double source of truth** (server.py:1626)
         → Fix : cash-payment set explicitement `paid: true`.

      8) **8 types notif orphelins frontend** (frontend/app/(tabs)/notifications.tsx routeForNotif + META)
         → Fix : routing ajouté pour commission_due/paid, wallet_debt_warning, account_blocked/reactivated, report_status/confirmed/reopened/awaiting_confirm, admin_action.

      **BONUS** : `booking_completed` envoyé aux 2 parties après double confirm (server.py:1195+).

      Retester **backend only** avec le script existant `/app/backend/tests/test_iter29_cross_module_audit.py`. Ajouter les cases manquants si besoin. Rapport dans `/app/test_reports/iteration_30.json`.

      Backend : `http://localhost:8001/api/*`
      Credentials : voir `/app/memory/test_credentials.md`.


agent_communication:
  - agent: "main"
    message: |
      Audit de **cohérence transversale** demandé par le user.

      Le user veut vérifier que TOUTE action déclenche automatiquement TOUTES les mises à jour nécessaires dans TOUTE l'application, sans laisser de donnée incohérente entre frontend / backend / DB.

      **Cascades à valider (backend + DB)** :

      1. **Réservation** créée → doit apparaître dans :
         - Booking client (GET /bookings côté client) ✓
         - Booking prestataire (GET /bookings côté prestataire) ✓
         - Notification `booking_new` au prestataire ✓
         - Compteurs CRM admin (GET /admin/crm/overview) ✓
         - Stats marketplace (GET /admin/stats/marketplace) ✓

      2. **Paiement** effectué → doit mettre à jour :
         - booking.status → paid, booking.paid_method, booking.amount_paid
         - Wallet du prestataire : commission perçue (POST /payments/checkout/booking + status paid)
         - wallet_transactions historique
         - Notif `payment_received` au prestataire
         - GET /wallet/me du prestataire (commission_paid ou commission_due selon online/cash)
         - GET /payments/mine (client + prestataire)
         - Stats revenus admin

      3. **Annulation** → doit :
         - Booking passer à `cancelled` avec `updated_at`
         - Notif `booking_status` aux deux parties
         - Si cash-payment déjà enregistré → wallet ajusté (rollback commission_due) ? À VÉRIFIER — c'est peut-être un trou.
         - Si covoiturage : seats_available restauré (`PATCH /rides/bookings/{id}` status=cancelled)
         - Si le prestataire annule un booking accepté → régression du planning côté client
         - Pas de notif zombie qui reste "booking_new" alors que le booking est cancelled

      4. **Complétion mission** (double confirmation) → doit :
         - Passer status=completed uniquement après les 2 confirmations (client + prestataire)
         - Débloquer l'accès à `POST /reviews` (côté client uniquement)
         - Notif `booking_completed` aux 2 parties
         - Empêcher toute modification ultérieure (PATCH doit refuser certaines transitions)

      5. **Review** → doit :
         - Mettre à jour providers.rating + providers.reviews_count via recompute
         - Persister review_id dans le booking (empêche double review)
         - Notif `review_received` au prestataire
         - Apparaître sur GET /providers/{id} (public)
         - Apparaître dans GET /providers (impact tri par rating)

      6. **Modification profil prestataire** (POST /providers/me) → doit :
         - Modifier providers doc immédiatement
         - Impact sur GET /providers (recherche) — nouveau nom/service/ville
         - Impact sur GET /providers/{id} (détail)
         - Impact sur les bookings existants (le nom du provider est-il stocké ou joint ?) — À VÉRIFIER pour incohérence

      7. **Changement de disponibilité** (statut/actif prestataire) → doit :
         - Retirer le prestataire de la recherche `GET /providers` s'il désactive son profil
         - Retirer les baby-sitters de `GET /family/babysitters` si status != active
         - Retirer les rides de `GET /rides` si status=cancelled
         - Empêcher POST /bookings, POST /rides/{id}/book, POST /family/bookings si cible désactivée

      8. **Blocage** → 15 endpoints filtrés (déjà validé iter24+27).

      9. **Suppression compte** → cascade :
         - users deleted
         - blocked_users (as user_id et blocked_id) purgés
         - favorites purgés
         - providers doc supprimé si le user était prestataire
         - babysitters doc supprimé
         - bookings anonymisés (client_name = "Utilisateur supprimé", etc.)
         - notifications purgées ?
         - messages ??
         - Token JWT invalide immédiatement

      10. **Notifications** — chaque `type` doit correspondre à un vrai événement :
          - Passer en revue les 15+ types et vérifier qu'il y a un émetteur backend pour chaque, et un routeForNotif() frontend.

      ## Instructions

      - Créer `/app/backend/tests/test_iter29_consistency_audit.py`.
      - Utiliser `httpx` async + `pytest`.
      - Créer un scénario complet : 3 users (client, prestataire, admin) qui traversent chaque cascade.
      - Après chaque action, vérifier TOUS les endpoints impactés et confirmer que la donnée est cohérente partout.
      - Rapporter :
        * **critical** : incohérence bloquante (paiement sans wallet update, review sur booking pas terminé, notif zombie)
        * **major** : incohérence UX (nom provider pas mis à jour dans booking après edit)
        * **minor** : détail cosmétique

      Livrable : `/app/test_reports/iteration_29.json` avec section `actionable_fixes` (file + line + proposed_fix pour chaque incohérence détectée).

      Backend : `http://localhost:8001/api/*`
      Credentials seed dans `/app/memory/test_credentials.md`.

      **Testing type : backend only**. Focus maximum sur cohérence, pas de UI.

      Ne PAS re-tester les modules validés en iter23-28. Focus **transversal / croisé** UNIQUEMENT.


agent_communication:
  - agent: "main"
    message: |
      Simulation à grande échelle demandée par le user.

      Ampleur : **≥ 100 utilisateurs simulés** (mix clients + prestataires), séquence complète des flows applicatifs.

      Flows à couvrir pour chaque profil (ou un sous-ensemble représentatif si trop lourd) :
        1. Inscription (`POST /auth/register`)
        2. Connexion (`POST /auth/login`)
        3. Mot de passe oublié (`POST /auth/forgot-password` → `POST /auth/reset-password` avec `dev_token`)
        4. Recherche d'un prestataire (`GET /providers` avec filtres variés)
        5. Réservation (`POST /bookings`)
        6. Paiement (`POST /payments/checkout/booking` — vérifier robustesse endpoint uniquement, sk_test_emergent peut échouer)
        7. Annulation (`PATCH /bookings/{id}` status=cancelled)
        8. Discussion / Chat (`POST /chat/{peer_id}/messages` + sanitizer + `GET`)
        9. Notifications (`GET /notifications` + `POST /notifications/{id}/read`)
        10. Favoris (`POST/DELETE/GET /favorites`)
        11. Avis (`POST /reviews` sur un booking completed)
        12. Profil (`GET /auth/me`, `POST /auth/change-password`)
        13. Changement d'infos (`POST /providers/me` upsert pour un provider ; pour un client : pas d'endpoint dédié → skip ou stocker via `POST /providers/me` avec role=client comme edge-case à signaler)
        14. Suppression compte (`DELETE /users/me`)

      Instructions générales :
      - Répondre en **français**.
      - Utiliser Python + `pytest` + `httpx` (async) ou `requests` pour la simulation → créer `/app/backend/tests/test_iter28_simulation_100users.py`.
      - Pas de rate limiter agressif sur le backend → 100 users en parallèle OK, mais pool concurrent modéré (10-20 workers max) pour ne pas saturer le pod.
      - Utiliser des emails uniques `sim-<uuid>@test.jokoo` pour éviter les collisions.
      - Pour chaque flow : capturer l'erreur (code HTTP, body) et le compter dans un rapport agrégé.
      - Nettoyer les comptes créés en fin de run (`DELETE /users/me` fait déjà la cascade — dernier flow à tester).

      Livrable dans `/app/test_reports/iteration_28.json` (structure) :
        - **summary** : nombre de users créés, taux de succès par flow (x/100)
        - **critical** : bugs bloquants (crash 500, cascade DELETE cassée, auth pétée)
        - **major** : bugs fonctionnels sans crash (mauvais 400, notif absente, filtre KO)
        - **minor** : perf lente, warnings
        - **actionable_fixes** : liste concrète des bugs avec fichier suspect + correction proposée

      Backend externe : `https://868fd53e-1f85-41aa-80f4-13c6ad7575b7.preview.emergentagent.com/api/*`
      Backend local (pour éviter latence proxy) : `http://localhost:8001/api/*` — préférer.

      Ne PAS re-tester en profondeur les modules validés iter23-27 sauf s'ils sont sur le chemin critique de la simulation.
      Testing type : **backend only** (pas de UI pour cette itération — flows trop nombreux, UI serait trop lente).


agent_communication:
  - agent: "main"
    message: |
      Le user rapporte : « ça bug après avoir bloqué un compte ou en essayant de rentrer dans le compte bloqué ».

      Cause racine identifiée :
      - Les pages détail (`provider/[id]`, `family/babysitter/[id]`, `mobility/rides/[id]`) faisaient un simple
        `api.get(...).then(setP).catch(() => setP(null))` sans exposer l'erreur.
      - Le backend renvoie **404** quand le pair est bloqué (masquage silencieux).
      - Résultat : `p/b/ride` reste `null` → écran figé sur « Chargement… » indéfiniment.

      Fix appliqué sur les 3 pages :
      - Ajout d'un état `loadError: "blocked" | "network" | null`.
      - Si erreur 404 → écran clair « Profil indisponible » avec icône ban + bouton « Retour ».
      - Si erreur réseau → « Impossible de charger » + bouton « Réessayer » (pour provider) ou « Retour ».

      À tester (frontend Playwright) :
      1. Login `client@jokoo.sn` / `Passw0rd!`.
      2. Ouvrir la conversation avec `pro@jokoo.sn`, bloquer via ⋮ → « Bloquer ».
      3. Toast vert visible → retour automatique.
      4. Depuis la page de recherche, essayer d'accéder au profil bloqué via URL directe : `http://localhost:3000/provider/{pro_id}`.
         → **Doit afficher « Profil indisponible » et le bouton « Retour »**, PAS « Chargement… » infini.
      5. Débloquer en API `DELETE /users/{pro_id}/block`, refresh la page → profil normalement chargé.

      Refaire le test similaire pour :
      - `/family/babysitter/{sitter_id}` après blocage de la baby-sitter.
      - `/mobility/rides/{ride_id}` après blocage du conducteur.

      Focus **frontend UI uniquement** — backend déjà validé en iter24-27.

      Backend : `https://868fd53e-1f85-41aa-80f4-13c6ad7575b7.preview.emergentagent.com/api/*`
      Frontend : `http://localhost:3000`

      Rapport dans `/app/test_reports/iteration_28.json`.


agent_communication:
  - agent: "main"
    message: |
      Le user rapporte 2 bugs :
      1) « je n'arrive toujours pas à supprimer un compte »
      2) « quand je bloque un utilisateur je vois toujours son compte »

      Causes racines identifiées et corrigées :

      **Bug 1 — Suppression compte** :
      - `frontend/app/(tabs)/profile.tsx` utilisait 2 `Alert.alert` imbriqués avec onPress callbacks
        → ÉCHOUE SILENCIEUSEMENT SUR WEB (le user ne voit rien se passer).
      - Fix appliqué : remplacé par `ConfirmDialog` (unique modal) + bannière d'erreur in-app rouge (`testID=delete-error`).
      - À valider frontend : Profile → « Supprimer mon compte » → ConfirmDialog visible → « Oui, supprimer » → API DELETE /users/me appelée → signOut + redirect /login.

      **Bug 2 — Blocage encore visible** :
      - `GET /api/favorites` ne filtrait PAS les bloqués → un provider mis en favori puis bloqué restait visible dans les favoris.
      - `GET /api/ads` ne filtrait PAS les pubs pointant vers un prestataire bloqué (link_type=provider).
      - Fix appliqué : `_blocked_ids(user["id"])` appelé dans les 2 endpoints ; filtres bidirectionnels.
      - À valider backend :
        a) Client fait POST /favorites/{pro_id}, puis POST /users/{pro_id}/block, puis GET /favorites → pro absent.
        b) Créer une pub avec link_type=provider et link_target=<pro_id>. Bloquer ce pro. GET /ads → pub absente.
        c) Débloquer → tout redevient visible.

      Tester ces 3 points en backend + le fix Alert.alert en frontend UI (playwright localhost:3000).
      NE PAS re-tester les modules déjà validés en iter23/24/25/26.

      Credentials : admin@jokoo.sn / Admin1234!, client@jokoo.sn / Passw0rd!, pro@jokoo.sn / Passw0rd!.
      Backend externe : https://868fd53e-1f85-41aa-80f4-13c6ad7575b7.preview.emergentagent.com/api/*
      Frontend : http://localhost:3000

      Rapport dans /app/test_reports/iteration_27.json.


agent_communication:
  - agent: "main"
    message: |
      DEUXIÈME AUDIT DEMANDÉ PAR LE USER — répondre en **français**.

      Objectif : vérifier que TOUS les correctifs iter25 tiennent, puis chercher tout bug critique / lien cassé / bouton non fonctionnel restant.

      ## Correctifs à re-vérifier (iter25)
      1. **ActionSheet + ConfirmDialog timing 350ms** (src/components/ActionSheet.tsx L47-52, L118)
         - Toute action déclenchant un ConfirmDialog depuis un ActionSheet doit fonctionner (block, unblock, cancel booking, delete partner, delete ad, delete family session, etc.).
      2. **Chat block flow** (frontend/app/chat/[id].tsx)
         - Menu → "Bloquer" → confirm → toast vert `chat-block-toast` visible → retour arrière → prestataire filtré de la recherche.
         - **Test NEW** : bloquer un peer inexistant côté API doit maintenant renvoyer 404 (validation ajoutée dans server.py L3157-L3164), la bannière rouge doit s'afficher.
      3. **Header chat** : la mention "● en ligne" hardcodée a été retirée, remplacée par "Contact".
      4. **router.back() protégé** par canGoBack() côté chat.

      ## Nouveau scope de l'audit #2

      ### A) BOUTONS & LIENS — chasser tout ce qui est mort/cassé
      Cliquer sur CHAQUE bouton visible dans les écrans clés et vérifier que l'action s'exécute (navigation, API call, feedback UI). Écrans à passer :
      - Tabs : Home, Search, Chat list, Notifications, Profile
      - Auth : Login, Register, Forgot password, Reset, OTP, Apple (skip si non testable)
      - Provider detail → boutons Réserver / Message / Favoris / Signaler
      - Booking : create → detail → complete → review → paid / cancelled
      - Chat : send msg, attach photo (si dispo), menu (⋮), retour
      - Family : babysitters list, detail, booking, SOS, carnet
      - Mobility : rides list, publish, book, parcel post
      - Legal Center : liste, doc, accepter
      - Profile : Settings, Security, Payments, Help, Supprimer le compte
      - Admin : dashboard, users, staff, ads, campaigns, partners, promos, reports, legal, marketplace stats

      Pour CHAQUE bouton : cliquable ? feedback ? navigation OK ? erreur console ? Signaler tout bouton "mort" (aucune réaction visible).

      ### B) LIENS CASSÉS
      - Deep links dans le legal (markdown liens externes)
      - Liens depuis notifications (chaque type → écran cible)
      - Liens depuis ads (`link_type=provider|category|promo|url`)
      - Liens depuis home carrousel

      ### C) BACKEND edge-cases NOUVEAUX à sonder
      Non testés en iter25 :
      - POST /users/{peer_id}/block avec peer_id bidon → doit être 404 (correctif iter25).
      - POST /users/{me.id}/block → 400 (déjà OK).
      - DELETE /users/{peer_id}/block idempotent (2 appels → 200 200).
      - GET /notifications avec 0 notifs → renvoie []
      - POST /reviews : booking pas encore completed → doit permettre ou pas ? Vérifier la règle métier attendue.
      - PATCH /bookings/{bid} : transitions interdites (ex. completed → pending) doivent 400.
      - POST /bookings avec quote_amount négatif → 400.
      - Recherche avec limit=0 ou limit>500 → défaut appliqué proprement.
      - Endpoint /admin/* accédé par un client non-admin → 403.

      ### D) FRONTEND smoke tests (playwright, localhost:3000)
      - Console browser : signaler warnings ROUGES uniquement (pas les jaunes dépréciés déjà connus).
      - Écran vide (SafeAreaView noir sans contenu) → screenshot + fichier suspect.
      - Bouton visible mais non pressable (opacity 0, disabled sans raison, hitSlop absent) → signaler.

      ## LIVRABLE

      Rapport détaillé dans `/app/test_reports/iteration_26.json` :
      - **critical** : bug bloquant (crash, auth cassée, paiement KO, écran mort)
      - **major** : bouton non-fonctionnel, lien cassé, notif manquante, régression iter25
      - **minor** : UI/UX, textes, warnings
      - **resolved_verified** : correctifs iter25 confirmés OK (block flow, timing, header chat)

      Pour chaque bug : titre, reproduction, sévérité, fichier suspect (chemin + ligne si possible), correction proposée.

      ## Credentials & URLs

      - Voir `/app/memory/test_credentials.md`
      - Backend externe : `https://868fd53e-1f85-41aa-80f4-13c6ad7575b7.preview.emergentagent.com/api/*`
      - Frontend : `http://localhost:3000`

      Testing type : **backend + frontend complet**. NE PAS mocker.

      Note : Wave/OM restent MOCKED (clés absentes). Stripe `sk_test_emergent` peut échouer, vérifier juste la robustesse serveur.


agent_communication:
  - agent: "main"
    message: |
      AUDIT COMPLET DEMANDÉ PAR LE USER — répondre en **français**.

      1) BUG PRIORITAIRE VENANT D'ÊTRE CORRIGÉ (à retester en premier)
         - "Le bouton Bloquer dans le chat ne fonctionne pas."
         - Fix appliqué : timeout 100ms → 350ms entre modals dans src/components/ActionSheet.tsx,
           `Alert.alert` remplacé par bannière/toast in-app dans app/chat/[id].tsx.
         - Scénario à valider :
           a) Login `client@jokoo.sn`/`Passw0rd!`, ouvrir une conversation avec `pro@jokoo.sn`.
           b) Menu (⋮) → "Bloquer cet utilisateur" → confirmer.
           c) Toast vert "X a été bloqué·e." doit s'afficher, backend doit avoir `blocked_users` +1.
           d) POST /api/users/{peer_id}/block doit retourner 200.
           e) Après retour, une nouvelle recherche `/api/providers` NE DOIT PLUS montrer ce prestataire.
         - Tester en frontend automation (playwright/web preview) + backend.

      2) AUDIT COMPLET — modules à passer en revue :
         a) Auth (register, login, forgot/reset password, Apple, OTP)
         b) Providers (search, detail, favorites, phone/email masking)
         c) Bookings (create, accept/reject, complete-both-sides, cancel, review)
         d) Reviews (submit, notif, rating recompute)
         e) Chat (send msg, blocked filter, sanitizer anti-contournement)
         f) Notifications (list, badges, routing types)
         g) Mobility · Covoiturage (rides search, book, cancel, seats management)
         h) Mobility · Colis longue distance (post, statuses)
         i) Jokoo Family (babysitter search, booking, SOS, carnet)
         j) Legal Center (documents publiés, acceptation, versioning admin)
         k) Ads (placement, click tracking, suspension)
         l) Wallet & commissions (cash-payment, pay-commission-due, blocked_debt threshold)
         m) Paiements Stripe (checkout booking, subscription, status endpoint) — les webhooks Wave/OM sont MOCKED (clés absentes), ne pas tester paiement bout-en-bout.
         n) Reports / Signalements (workflow awaiting_reporter → resolved)
         o) Admin CRM (users list, staff, reset password, marketplace stats, verified+)
         p) Blocages mutuels (déjà validés en iter24 — smoke test uniquement)
         q) Suppression de compte

      3) TEST FRONTEND UI (web preview) — captures d'écran des flows critiques :
         - Accueil / recherche
         - Ouverture d'un profil prestataire, réservation
         - Chat + menu Bloquer + toast
         - Onboarding + splash
         - Legal Center
         - Notifs
         - Dashboard admin (avec `admin@jokoo.sn`)
         Signaler tout écran vide, bouton mort, navigation cassée, erreur console.

      4) LIVRABLES ATTENDUS dans `/app/test_reports/iteration_25.json` :
         - Section "critical" : bugs bloquants (auth cassée, paiement KO, blocage app)
         - Section "major" : bugs fonctionnels sans crash (bouton non réactif, notif manquante)
         - Section "minor" : UI/UX, textes, doublons
         - Section "resolved" : ce qui marche
         - Pour chaque bug : reproduction pas-à-pas, sévérité, fichier suspect (server.py ligne X ou frontend/app/...), correction proposée si évidente.

      5) NE PAS re-tester en détail les items déjà validés (iter23 review notifs, iter23 family carnet, iter24 blocages bidirectionnels) — smoke test rapide suffit.

      6) NE PAS chercher à tester paiements Wave/OM sans clés (MOCKED). Test Stripe possible avec `sk_test_emergent` (échoue en dehors d'Emergent mais suffisant pour vérifier que l'endpoint construit bien la session côté serveur).

      Credentials disponibles dans /app/memory/test_credentials.md.
      Backend externe : https://868fd53e-1f85-41aa-80f4-13c6ad7575b7.preview.emergentagent.com/api/*
      Frontend preview : accessible sur le port 3000 (utiliser localhost:3000 pour playwright).


agent_communication:
  - agent: "main"
    message: |
      Nouveau correctif P1 à valider — **backend uniquement** :

      **Filtre bidirectionnel des utilisateurs bloqués** (helpers `_blocked_ids` / `_is_pair_blocked`).

      Scénario de base : deux comptes A et B.
        - A block B → POST /api/users/{B.id}/block
        - B est totalement invisible pour A, et A est totalement invisible pour B.
        - Les autres utilisateurs (C) continuent de voir A et B normalement.

      Endpoints à vérifier (bidirectionnel) :
      1. GET /api/providers → A ne voit plus B dans la liste (et vice-versa). C voit toujours les deux.
      2. GET /api/providers/{id} → 404 si pair bloqué.
      3. POST /api/bookings → 403 si tentative entre A et B.
      4. GET /api/rides → A ne voit plus les trajets de B.
      5. GET /api/rides/{id} → 404 si driver bloqué (dans les deux sens).
      6. POST /api/rides/{id}/book → 403 si pair bloqué.
      7. POST /api/rides/{id}/parcel → 403 si pair bloqué.
      8. GET /api/family/babysitters → B (sitter) invisible pour A si block. Filtre bidirectionnel.
      9. GET /api/family/babysitters/{id} → 404 si pair bloqué.
      10. POST /api/family/bookings → 403 si pair bloqué.
      11. GET /api/chat/{B.id}/messages (côté A) → [] si bloqué.
      12. POST /api/chat/{B.id}/messages → 403 si bloqué.
      13. GET /api/chat/conversations → la conversation A-B disparaît des deux côtés après block.

      Après DELETE /api/users/{B.id}/block (unblock), tout doit redevenir visible.

      Setup pour tests :
        - Utiliser deux comptes clients/prestataires (par ex. créer un compte client bis + `pro@jokoo.sn`).
        - Pour rides : `chauffeur@jokoo.sn` / `Driver1234!` a 4 trajets seedés — bloquer ce user rendra les 4 invisibles.
        - Pour family : `aisha.family@jokoo.sn` / `Family1234!` est une baby-sitter — bloquer ce user rendra son profil invisible.

      Credentials : admin@jokoo.sn / Admin1234!, client@jokoo.sn / Passw0rd!, pro@jokoo.sn / Passw0rd!, chauffeur@jokoo.sn / Driver1234!, aisha.family@jokoo.sn / Family1234!.

      Backend URL externe : https://868fd53e-1f85-41aa-80f4-13c6ad7575b7.preview.emergentagent.com/api/*

      Rapport à écrire dans /app/test_reports/iteration_24.json.

      **Skip frontend** — pas de UI ajoutée ; les endpoints existants sont maintenant tous filtrés.
      **Ne pas re-tester** les flows validés dans iteration_23.json (reviews, family notebook).

  - task: "Sponsorisation prestataires — paiements (Stripe/Wave/Orange) + tarifs admin"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        message: |
          Nouveau flow Sponsorisations à valider — **backend + frontend**.

          BACKEND (server.py) :
          1. GET /api/sponsorships/prices → renvoie [{"duration_days":7,"amount_xof":5000},{15,10000},{30,18000}] par défaut.
          2. GET /api/admin/sponsorships/prices (admin) → { prices, defaults }.
          3. PUT /api/admin/sponsorships/prices (admin) body { "prices": {"7":6000,"15":11000,"30":20000} } → applique.
             - Contrôles: admin only, montants > 0 et <= 10_000_000, days ∈ {7,15,30}.
             - Après PUT, GET /api/sponsorships/prices doit refléter les nouveaux montants.
          4. POST /api/sponsorships (prestataire) body {"duration_days":7} → crée un dossier `pending_payment`, amount_xof suit les tarifs courants.
          5. POST /api/sponsorships/{sid}/checkout (prestataire) body {"provider":"card"} → renvoie { url, session_id } (Stripe test).
             - provider="wave" → 503 si WAVE_API_KEY vide (comportement attendu), sinon renvoie {url}.
             - provider="orange" → 503 si OM non configuré (attendu), sinon {url, pay_token}.
          6. POST /api/sponsorships/{sid}/verify body {"session_id":"..."} → active la sponsorisation si Stripe indique paid.
          7. GET /api/sponsorships/mine (prestataire) → historique.
          8. GET /api/admin/sponsorships (admin) → tout l'historique.
          9. PATCH /api/admin/sponsorships/{sid} status="gift" → active sans paiement + notification prestataire.
          10. Expiration auto : une sponso `active` dont `ends_at` est passé doit passer `expired` lors du prochain GET (mine/admin) et le provider doit perdre `sponsored_until`.

          Credentials : admin@jokoo.sn / Admin1234!, pro@jokoo.sn / Passw0rd!.
          Backend URL externe : https://868fd53e-1f85-41aa-80f4-13c6ad7575b7.preview.emergentagent.com/api/*.

          Rapport dans /app/test_reports/iteration_35.json.

          **Skip frontend testing** — le frontend sera testé manuellement par l'utilisateur (choix modal Stripe/Wave/Orange et éditeur de tarifs admin déjà branchés).


  - task: "Admin Dashboard Mobile Wallet v2 — 6 écrans + intégration API"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/admin/wallet/*"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        message: |
          Nouveau bloc UI mobile pour l'administration financière (Wallet v2).
          Le backend `/api/admin/wallet/*` est déjà validé (iteration_42.json — 38/38 tests). À TESTER : **frontend only** via l'app Expo (localhost:3000).

          FICHIERS CRÉÉS :
          - `/app/frontend/app/admin/wallet/_layout.tsx` (Stack)
          - `/app/frontend/app/admin/wallet/index.tsx` — Dashboard KPIs (GET /admin/wallet/dashboard).
              * Hero solde plateforme, 4 KPI cards (Wallets / Retraits pending / Remboursements / Jokoo Pro actifs)
              * Breakdown Revenus/Sorties par type
              * Activité récente (20 dernières transactions v2)
              * Nav vers les 4 sous-écrans
          - `/app/frontend/app/admin/wallet/wallets.tsx` — Liste (GET /admin/wallet/list?kind=&status=).
              * Recherche client (nom/email/owner_id), filtres kind+status
              * Ouvre le drill-down `/admin/wallet/[ownerId]`
          - `/app/frontend/app/admin/wallet/[ownerId].tsx` — Drill-down (GET /admin/wallet/wallet/{id} + ledger).
              * Actions admin : créditer, débiter, bonus, changer plancher (min-balance), changer statut (active/frozen/closed).
              * Chaque action ouvre une modale demandant montant + motif (audit-logged côté backend).
          - `/app/frontend/app/admin/wallet/withdrawals.tsx` — File retraits + remboursements.
              * Onglets Retraits (par status) / Remboursements
              * Détail complet avec destination (phone/IBAN/banque), audit trail
              * Actions : approve, reject (motif), mark_processing, mark_paid (ref externe obligatoire)
          - `/app/frontend/app/admin/wallet/ledger.tsx` — Journal global (GET /admin/wallet/transactions).
              * Filtres par type et status
          - `/app/frontend/app/admin/wallet/settings.tsx` — Paramètres plateforme + règles commission.
              * Onglet Paramètres : édite tous les settings via SETTING_META (recharge min/max, frais retrait, prix Jokoo Pro, min balance, low balance warn…)
              * Onglet Commissions : CRUD règles par catégorie (upsert POST, delete DELETE)

          CLIENT API : `/app/frontend/src/wallet/admin.ts` (déjà existant, bug `api.delete` → `api.del` corrigé).
          NAV : entrée "Finances & Wallets" ajoutée dans `/app/frontend/app/admin/index.tsx` (super_admin uniquement).

          CE QUE LE TESTING AGENT DOIT VALIDER (frontend only, mobile viewport 390×844) :
          1. Login admin@jokoo.sn / Admin1234! puis naviguer vers /admin → clic "Finances & Wallets" doit ouvrir /admin/wallet.
          2. Dashboard : vérifie hero + 4 KPI + shortcuts fonctionnent.
          3. Wallets : la liste charge, la recherche filtre, cliquer sur un wallet ouvre le drill-down.
          4. Drill-down :
             - Test **Créditer** un wallet (ex : client@jokoo.sn) de 500 F avec motif "Test crédit auto" → recharge la page, le solde doit augmenter de 500 F, ledger doit contenir "Ajustement admin (+500 F)".
             - Test **Débiter** de 200 F avec motif "Test débit" → solde -200 F.
             - Test **Geler** puis **Réactiver** le wallet (sauf platform).
          5. Withdrawals : onglets fonctionnent, filtres par status fonctionnent. (Pas de retrait pending en env de test — c'est OK.)
          6. Ledger : filtres type + status fonctionnent, les transactions s'affichent.
          7. Settings :
             - Onglet Paramètres : cliquer sur "Recharge minimum", changer à 1500, sauver → doit se refléter au refresh.
             - Onglet Commissions : créer une règle "test_cat" 20%, min 500, max 10000, notes "test" → apparaît dans la liste. Puis la supprimer.

          AUTH : admin@jokoo.sn / Admin1234! (super_admin).
          BASE URL : http://localhost:3000 (frontend), EXPO_PUBLIC_BACKEND_URL pour API.

          NB : Certains écrans (index dashboard) affichent des chiffres réels de l'env de dev — pas de mocking. Le wallet Master a un solde négatif (-204 000 F) car c'est normal en dev (recharges Stripe créées sans commissions équivalentes).


  - task: "Marketplace Covoiturage v2 — Phase 1+2 (Requests + Offers + Matching + Notifs)"
    implemented: true
    working: "NA"
    file: "/app/backend/rides_v2/* + /app/frontend/app/mobility/*"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        message: |
          Nouveau module massif : **marketplace covoiturage bidirectionnelle**.
          À tester : **backend + frontend**.

          BACKEND — Package `/app/backend/rides_v2/` (8 modules) :
          - `cities.py`     : dictionnaire villes+quartiers Sénégal (Dakar↔Plateau/Mermoz/Almadies/etc, Thiès, Saint-Louis, Mbour, Touba, Kaolack, Ziguinchor, +40 autres). `resolve_city("plateau")` → `"dakar"`. `city_matches()` normalise.
          - `models.py`     : Pydantic RideRequestIn, RideRequestUpdate, RideOfferIn, RideOfferDecisionIn (validation HH:MM, YYYY-MM-DD, seats 1-8, budget 0-1M).
          - `service.py`    : CRUD requests + offers, `hot_routes`, `mobility_stats`, `ensure_indexes`.
          - `matching.py`   : `match_rides_for_request`, `match_requests_for_ride`, `score_match` (0..1). Filtres MongoDB avec `from_city_norm`/`to_city_norm`.
          - `notify.py`     : notify_drivers_of_new_request, notify_passenger_of_new_ride, notify_passenger_new_offer, notify_driver_offer_decision, notify_request_expiring/expired (push + in-app).
          - `expiration.py` : sweeper 5min → passe demandes expirées + envoie rappels J-6h.
          - `router.py`     : 18 endpoints sous `/api/mobility/*`.
          - `constants.py`  : statuts, TTL, seuils.

          MONTAGE server.py :
          - Import + `bind_push(send_push)`.
          - `POST /api/rides` (existant) patché : maintient `from_city_norm`/`to_city_norm` + déclenche matching → notifie passagers en attente.
          - `startup` : ensure_indexes + boucle expiration.

          ENDPOINTS EXPOSÉS (à tester) :
          - `GET  /api/mobility/cities` → liste 54 villes canoniques + aliases.
          - `GET  /api/mobility/cities/resolve?q=plateau` → { canonical: "dakar", label: "Dakar" }
          - `GET  /api/mobility/stats` → KPIs + hot_routes.
          - `POST /api/mobility/requests` (client) → crée + déclenche matching.
          - `GET  /api/mobility/requests` (public, avec filtres from_city/to_city/date/status/exclude_self/limit).
          - `GET  /api/mobility/requests/mine`
          - `GET  /api/mobility/requests/{id}` → attache la liste des offres.
          - `PATCH /api/mobility/requests/{id}` (owner) → update ou status=cancelled.
          - `POST /api/mobility/requests/{id}/republish` (owner) → réouvre.
          - `DELETE /api/mobility/requests/{id}` (owner).
          - `POST /api/mobility/requests/{id}/offers` (driver) → crée une offre (avec ride_id existant OU inline from/to/date/time/seats/vehicle).
          - `GET  /api/mobility/requests/{id}/offers`
          - `POST /api/mobility/offers/{id}/decision` (owner de la demande) → action="accept"|"refuse". Si accept: refuse les autres pending et passe la demande en "booked".
          - `POST /api/mobility/offers/{id}/withdraw` (driver).
          - `GET  /api/mobility/offers/sent` (driver).
          - `GET  /api/mobility/offers/received` (passenger).
          - `GET  /api/mobility/offers/{id}` (owner ou driver).
          - `GET  /api/mobility/rides/{ride_id}/matches` (driver) → demandes matchables pour son trajet.
          - `GET  /api/mobility/requests/{id}/rides` → trajets matchables pour cette demande.

          CE QUI A ÉTÉ VALIDÉ MANUELLEMENT (curl) :
          - `resolve_city("Plateau")` → dakar ✅
          - `resolve_city("Mermoz")` → dakar ✅
          - POST request "Plateau" → "Thiès" → from_city_norm=dakar, to_city_norm=thies ✅
          - POST offer inline avec négociation prix (7500 F pour budget 8000) → OK ✅
          - decide_offer(refuse) → status=refused ✅
          - stats → hot_routes trié par count ✅
          - indexes créés OK ✅
          - Expiration sweeper démarré ✅

          FRONTEND — écrans mobility (390×844) :
          - `/app/frontend/app/mobility/index.tsx` refait : dual CTA (bleu marine "Publier un trajet" / orange "Publier une demande"), stats bar (Trajets actifs / Demandes ouvertes / Dernières 24h), Hot Routes avec CTA "Publier ce trajet" (nudge conducteur), livraison card, grille "Mon activité" (6 quick actions dont Offres envoyées/reçues avec badges de compteurs).
          - `/mobility/requests/publish.tsx` : formulaire timeline départ→arrivée avec autocomplete villes+quartiers, date/heure, stepper places, budget optionnel, notes.
          - `/mobility/requests/index.tsx` : feed public des demandes (recherche + status pill).
          - `/mobility/requests/mine.tsx` : mes demandes + actions Republier / Annuler.
          - `/mobility/requests/[id].tsx` : détail complet, timeline route, meta, comment, liste des offres reçues (avec accept/refuse pour owner). CTA sticky "Proposer ce trajet" pour non-owner → modal avec 2 onglets : "Proposer directement" (inline) OU "Trajet publié" (sélection dans /rides/mine) + prix négocié + message.
          - `/mobility/offers/sent.tsx` : offres envoyées (driver), action Retirer si pending.
          - `/mobility/offers/received.tsx` : offres reçues (passenger).
          - Client API : `/app/frontend/src/mobility/rideRequests.ts` (all endpoints + helpers).

          FLOW À TESTER (E2E) :
          1. Passager (client@jokoo.sn / Passw0rd!) : /mobility → cliquer "Publier une demande" → formulaire → publier "Plateau → Saint-Louis" 2026-08-25 09:00, seats 2, budget 5000 → doit rediriger vers le détail.
          2. Passager : /mobility/requests/mine → sa demande est visible avec badge "Ouverte" et actions.
          3. Conducteur (pro@jokoo.sn / Passw0rd!) : /mobility → CTA "Publier une demande" en Mermoz→SL déjà notifié en push, OU aller sur /mobility/requests → voir la demande du passager → cliquer → bouton "Proposer ce trajet" (sticky) → modal onglet "Proposer directement" → prix 4500 + message + envoyer.
          4. Conducteur : /mobility/offers/sent → voir son offre "En attente" pour cette demande.
          5. Passager : /mobility/offers/received OU rouvrir sa demande → doit voir 1 offre reçue → tester "Accepter" → alert de confirmation → toutes les autres offres pending passent en "withdrawn", demande devient "booked".
          6. Passager : /mobility/requests/mine → statut "Confirmée".

          Notifications push : validées via backend (Emergent), pas testables en preview web (bloqué iOS pending .plist ; Android OK sur device réel).

          AUTH : client@jokoo.sn / Passw0rd! (passager), pro@jokoo.sn / Passw0rd! (conducteur), admin@jokoo.sn / Admin1234!.
          Base URL locale : http://localhost:3000 / http://localhost:8001.

          Rapport dans /app/test_reports/iteration_46.json.
