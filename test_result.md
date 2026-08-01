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
  version: "1.5"
  test_sequence: 6
  run_ui: true

test_plan:
  current_focus:
    - "AUDIT COMPLET #2 — vérification post-fixes iter25"
    - "Chasse aux liens cassés + boutons non fonctionnels"
  stuck_tasks: []
  test_all: true
  test_priority: "critical_first"

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
