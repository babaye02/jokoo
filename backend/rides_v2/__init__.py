"""
Rides v2 — Marketplace Covoiturage bidirectionnelle
====================================================

Package additif à l'existant `db.rides`. Introduit :
- ride_requests   (demandes des passagers)
- ride_offers     (offres des conducteurs vers une demande)
- Matching engine (city-based v1, radius-km ready v2)
- Notifications temps réel (push + in-app)
- Auto-expiration + relance
- Trajets vérifiés Jokoo (flotte partenaires)
- Admin dashboard mobility

L'existant (`db.rides`, endpoints `/api/rides/*`) reste inchangé.
Le module s'y greffe via matching + extensions de schéma non destructives.
"""

__all__ = ["router", "service", "matching", "cities", "notify", "expiration"]
