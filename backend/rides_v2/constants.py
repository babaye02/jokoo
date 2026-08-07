"""rides_v2.constants — Constantes du module marketplace covoiturage."""

# ─── Statuts ────────────────────────────────────────────────────────

REQUEST_STATUS_OPEN = "open"
REQUEST_STATUS_MATCHED = "matched"          # a reçu au moins une offre en attente/acceptée
REQUEST_STATUS_BOOKED = "booked"            # une offre est acceptée + réservation créée
REQUEST_STATUS_EXPIRED = "expired"
REQUEST_STATUS_CANCELLED = "cancelled"

REQUEST_STATUSES = {
    REQUEST_STATUS_OPEN,
    REQUEST_STATUS_MATCHED,
    REQUEST_STATUS_BOOKED,
    REQUEST_STATUS_EXPIRED,
    REQUEST_STATUS_CANCELLED,
}

OFFER_STATUS_PENDING = "pending"
OFFER_STATUS_ACCEPTED = "accepted"
OFFER_STATUS_REFUSED = "refused"
OFFER_STATUS_WITHDRAWN = "withdrawn"
OFFER_STATUS_EXPIRED = "expired"

OFFER_STATUSES = {
    OFFER_STATUS_PENDING,
    OFFER_STATUS_ACCEPTED,
    OFFER_STATUS_REFUSED,
    OFFER_STATUS_WITHDRAWN,
    OFFER_STATUS_EXPIRED,
}


# ─── Expiration ─────────────────────────────────────────────────────

# Après combien d'heures une demande "sans date passée" expire ?
DEFAULT_REQUEST_TTL_HOURS = 24 * 3  # 3 jours par défaut (ou date du trajet, au plus tôt)

# Avant expiration, à combien d'heures on notifie le passager pour proposer republish ?
EXPIRATION_REMINDER_HOURS = 6


# ─── Matching ───────────────────────────────────────────────────────

# Fenêtre horaire par défaut (minutes autour de l'heure demandée) pour le matching
DEFAULT_TIME_WINDOW_MIN = 120

# Nombre max d'items à traiter/notifier par match
MAX_MATCHES_PER_TRIGGER = 20


# ─── Notifications ──────────────────────────────────────────────────

NOTIF_CHANNEL_MOBILITY = "mobility"

NOTIF_KIND_NEW_REQUEST_MATCH = "ride_new_request_match"           # → conducteur
NOTIF_KIND_NEW_RIDE_MATCH = "ride_new_ride_match"                 # → passager
NOTIF_KIND_NEW_OFFER = "ride_new_offer"                           # → passager
NOTIF_KIND_OFFER_ACCEPTED = "ride_offer_accepted"                 # → conducteur
NOTIF_KIND_OFFER_REFUSED = "ride_offer_refused"                   # → conducteur
NOTIF_KIND_OFFER_CLOSED = "ride_offer_closed"                     # → autres conducteurs (demande déjà pourvue)
NOTIF_KIND_BOOKING_CREATED = "ride_booking_created"               # → passager
NOTIF_KIND_DEPARTURE_REMINDER = "ride_departure_reminder"         # → passager + conducteur
NOTIF_KIND_REQUEST_EXPIRING = "ride_request_expiring"             # → passager
NOTIF_KIND_REQUEST_EXPIRED = "ride_request_expired"               # → passager


# ─── Roles ──────────────────────────────────────────────────────────

VERIFIED_LABEL = "Trajet vérifié Jokoo"
