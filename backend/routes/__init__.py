"""
Jokoo · Backend routes package
────────────────────────────────
Vise à découper `server.py` (6400 lignes) en modules par domaine.

État actuel (Sprint 1 - fondations) :
    server.py contient toujours l'intégralité des routes. Cette structure de
    dossiers est prête à recevoir les routes une par une.

Ordre d'extraction recommandé (le plus isolé d'abord, le plus couplé à la fin) :

    ┌──── 1. auth          — login/register/reset/change (peu de dépendances)
    ├──── 2. notifications — indépendant, endpoints simples
    ├──── 3. legal         — statique, cms-like
    ├──── 4. reviews       — dépend de bookings mais isolé côté écriture
    ├──── 5. wallet/payments (Stripe, Wave, OM) — plus critique
    ├──── 6. bookings      — cœur métier
    ├──── 7. chat/messages — WebSocket + REST
    └──── 8. admin         — permissions, cross-domain

Pattern par module :
    routes/xxx.py:
        router = APIRouter(prefix="/xxx", tags=["xxx"])
        # tous les @router.get / @router.post…
        # dépendances communes injectées via services/*, models/*, security/*

    Dans server.py après extraction :
        from routes.xxx import router as xxx_router
        api.include_router(xxx_router)

Contrat pour chaque extraction :
    1) Aucune régression fonctionnelle (tests smoke curl passant)
    2) L'ordre des routes doit être préservé (route literal AVANT route paramétrique)
    3) Les imports circulaires DOIVENT être évités via injection de dépendances
    4) Les tests backend doivent passer après chaque extraction

État Sprint 1 :
    [X] Structure de packages créée (routes/, services_v2/, models_v2/, security/)
    [X] Security constants extraites (security/__init__.py)
    [ ] auth.py à extraire
    [ ] notifications.py à extraire
    [ ] etc.
"""
