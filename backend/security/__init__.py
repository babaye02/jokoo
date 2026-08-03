"""
Jokoo · Security module
────────────────────────
Contient toutes les primitives de sécurité extraites de server.py.

Ce module est en cours d'extraction — actuellement server.py contient encore les
fonctions originales. Les futures features de sécurité (JWT rotation, secrets
rotation, IP allowlist admin, audit log signed…) doivent être ajoutées ICI.

Roadmap :
- [x] Rate limiting (slowapi) — dans server.py, à extraire ici
- [x] Brute-force lockout persistant — dans server.py, à extraire ici
- [x] Audit log JSON structuré — dans server.py, à extraire ici
- [ ] CAPTCHA Cloudflare Turnstile — à ajouter avec clés API
- [ ] JWT rotation + refresh tokens
- [ ] Admin IP allowlist
- [ ] Password strength policy uniforme
"""

# Constantes centrales (source de vérité)
BRUTE_MAX_ATTEMPTS = 5
BRUTE_WINDOW_SEC = 15 * 60   # 15 min
BRUTE_LOCKOUT_SEC = 30 * 60  # 30 min

# Rate limits par endpoint (canonique)
RATE_LIMITS = {
    "register": {"max": 20, "window": 3600},          # 20/h/IP
    "login_ip": {"max": 20, "window": 300},           # 20/5min/IP
    "login_email_ip": {"max": 8, "window": 300},      # 8/5min/(email,IP)
    "forgot_ip": {"max": 5, "window": 900},           # 5/15min/IP
    "forgot_email": {"max": 3, "window": 900},        # 3/15min/email
}

# Types d'événements audit (canonique)
AUDIT_EVENTS = {
    "AUTH_REGISTER":        "auth.register",
    "AUTH_LOGIN_SUCCESS":   "auth.login_success",
    "AUTH_LOGIN_FAILED":    "auth.login_failed",
    "AUTH_LOGOUT":          "auth.logout",
    "AUTH_BRUTE_LOCK":      "auth.brute_force_lock",
    "AUTH_PASSWORD_CHANGE": "auth.password_change",
    "AUTH_PASSWORD_RESET":  "auth.password_reset",
    "ACCOUNT_DELETED":      "account.deleted",
    "ACCOUNT_BLOCKED":      "account.blocked",
    "PAYMENT_INITIATED":    "payment.initiated",
    "PAYMENT_CONFIRMED":    "payment.confirmed",
    "PAYMENT_REFUNDED":     "payment.refunded",
    "PROMO_APPLIED":        "promo.applied",
    "ADMIN_ACTION":         "admin.action",
}
