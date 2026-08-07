"""Tests pour AUDIT MARKETPLACE — protection commissions et anti-contournement.

Couvre :
- _sanitize_message (phone, email, url, social, hint, obfuscated-digits)
- Provider list/detail contact masking
- Wallet /me + history
- Cash payment flow v2 (booking → cash-payment → commission auto-débitée du wallet)
- Règlement de la dette via ajustement admin (wallet v2)
- Auto-block quand le solde passe sous le plancher négatif (can_receive_bookings)
- Admin marketplace stats + fraud alerts
- Régression (get_messages, list_conversations, provider detail admin)
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "https://jokoo-mobile-dev.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@jokoo.sn"
ADMIN_PASSWORD = "Admin1234!"
CLIENT_EMAIL = "client@jokoo.sn"
CLIENT_PASSWORD = "Passw0rd!"

THRESHOLD = 10000  # FCFA


# ---------- helpers ----------
def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _login(email: str, password: str) -> dict:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()


def _register(role: str, name_prefix: str = "TEST") -> dict:
    email = f"test_{uuid.uuid4().hex[:10]}@jokootest.com"
    r = requests.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": "Passw0rd!",
            "name": f"{name_prefix} {role}",
            "role": role,
            "phone": "+221771234567",
            "city": "Dakar",
        },
        timeout=15,
    )
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    data["password"] = "Passw0rd!"
    return data


# ---------- session fixtures ----------
@pytest.fixture(scope="session")
def admin_auth():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def client_auth():
    return _login(CLIENT_EMAIL, CLIENT_PASSWORD)


@pytest.fixture(scope="session")
def seed_provider_id():
    """Récupère un provider seed (pro@jokoo.sn) pour les tests de messagerie."""
    r = requests.get(f"{API}/providers", timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert items, "no providers seeded"
    return items[0]["id"]


# ===== TEST 1: phone + social filter =====
def test_1_message_filter_phone_and_social(client_auth, seed_provider_id):
    text = "Salut appelle-moi au 77 123 45 67 ou WhatsApp"
    r = requests.post(
        f"{API}/chat/{seed_provider_id}/messages",
        headers=_headers(client_auth["token"]),
        json={"text": text},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "•••[masqué par Jokoo]" in data["text"], f"phone not masked: {data['text']}"
    assert "77 123 45 67" not in data["text"]
    assert "phone" in data["flags"], data["flags"]
    assert "social" in data["flags"], data["flags"]
    # hint aussi possible (appelle-moi) mais non requis par TEST 1


# ===== TEST 2: email masking =====
def test_2_message_filter_email(client_auth, seed_provider_id):
    r = requests.post(
        f"{API}/chat/{seed_provider_id}/messages",
        headers=_headers(client_auth["token"]),
        json={"text": "Contactez test@gmail.com"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "test@gmail.com" not in data["text"]
    assert "•••[masqué par Jokoo]" in data["text"]
    assert "email" in data["flags"]


# ===== TEST 3: obfuscated digits =====
def test_3_message_filter_obfuscated_digits(client_auth, seed_provider_id):
    r = requests.post(
        f"{API}/chat/{seed_provider_id}/messages",
        headers=_headers(client_auth["token"]),
        json={"text": "Mon numéro est sept sept un deux trois quatre cinq"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "obfuscated-digits" in data["flags"], data["flags"]


# ===== TEST 4: hint sans coordonnées =====
def test_4_message_filter_hint(client_auth, seed_provider_id):
    r = requests.post(
        f"{API}/chat/{seed_provider_id}/messages",
        headers=_headers(client_auth["token"]),
        json={"text": "contacte-moi directement en dehors"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "hint" in data["flags"], data["flags"]


# ===== TEST 5: message propre =====
def test_5_message_clean(client_auth, seed_provider_id):
    r = requests.post(
        f"{API}/chat/{seed_provider_id}/messages",
        headers=_headers(client_auth["token"]),
        json={"text": "Bonjour je suis intéressé par vos services"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    flags = data.get("flags") or []
    assert flags == [], f"expected empty flags, got {flags}"
    assert data.get("flagged") is False


# ===== TEST 6: provider list phones masqués =====
def test_6_provider_list_masks_phones():
    r = requests.get(f"{API}/providers", timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert items
    for p in items:
        if p.get("phone"):
            assert "••" in p["phone"], f"phone not masked in list: {p['phone']}"
        assert "email" not in p or not p.get("email"), f"email leaked in list: {p.get('email')}"


# ===== TEST 7: provider detail masked for client without booking =====
def test_7_provider_detail_masked_for_client(client_auth, seed_provider_id):
    r = requests.get(
        f"{API}/providers/{seed_provider_id}",
        headers=_headers(client_auth["token"]),
        timeout=15,
    )
    assert r.status_code == 200
    p = r.json()
    assert p.get("contact_visible") is False, f"contact_visible should be False: {p.get('contact_visible')}"
    if p.get("phone"):
        assert "••" in p["phone"], f"phone not masked: {p['phone']}"
    assert not p.get("email"), f"email leaked: {p.get('email')}"


# ===== TEST 8: wallet me =====
def test_8_wallet_me(client_auth):
    r = requests.get(f"{API}/wallet/me", headers=_headers(client_auth["token"]), timeout=15)
    assert r.status_code == 200, r.text
    w = r.json()
    for k in [
        "user_id",
        "balance_available",
        "balance_pending",
        "commission_due",
        "commission_paid",
        "gross_earnings",
        "is_blocked_debt",
    ]:
        assert k in w, f"missing wallet field: {k} ({list(w.keys())})"


# ---------- E2E fixtures for cash payment / block ----------
@pytest.fixture(scope="module")
def cash_flow_ctx(admin_auth):
    """Crée un client jetable + un provider jetable avec un profil."""
    client = _register("client", "CashClient")
    provider = _register("prestataire", "CashPro")

    # Provider setup profile
    r = requests.post(
        f"{API}/providers/me",
        headers=_headers(provider["token"]),
        json={
            "service": "Plombier",
            "description": "Test provider",
            "price_type": "fixed",
            "price_amount": 5000,
            "city": "Dakar",
            "zones": ["Plateau"],
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    provider_id = provider["user"]["id"]

    return {
        "client": client,
        "provider": provider,
        "provider_id": provider_id,
        "admin": admin_auth,
    }


def _create_booking(client_token: str, provider_id: str) -> str:
    r = requests.post(
        f"{API}/bookings",
        headers=_headers(client_token),
        json={
            "provider_id": provider_id,
            "date": "2026-02-15",
            "time": "14:00",
            "address": "TEST addr",
            "description": "TEST booking",
        },
        timeout=15,
    )
    assert r.status_code == 200, f"booking creation failed: {r.status_code} {r.text}"
    return r.json()["id"]


# ===== TEST 9: cash payment E2E (Wallet v2) =====
def test_9_cash_payment_flow(cash_flow_ctx):
    """La commission est auto-débitée du wallet v2 du prestataire lors d'un
    paiement cash, puis la dette est réglée par un ajustement admin."""
    ctx = cash_flow_ctx
    client_tok = ctx["client"]["token"]
    prov_tok = ctx["provider"]["token"]
    provider_id = ctx["provider_id"]
    admin_tok = ctx["admin"]["token"]

    # (a) create booking
    bid = _create_booking(client_tok, provider_id)

    # (b) provider quotes then accepts
    r = requests.patch(
        f"{API}/bookings/{bid}",
        headers=_headers(prov_tok),
        json={"quote_amount": 5000},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    r = requests.patch(
        f"{API}/bookings/{bid}",
        headers=_headers(prov_tok),
        json={"status": "accepted"},
        timeout=15,
    )
    assert r.status_code == 200, r.text

    # (c) cash-payment → commission débitée automatiquement (Wallet v2)
    r = requests.post(
        f"{API}/bookings/{bid}/cash-payment",
        headers=_headers(prov_tok),
        json={"amount": 5000, "category": "services"},
        timeout=15,
    )
    assert r.status_code == 200, f"cash-payment failed: {r.text}"
    data = r.json()
    assert data["ok"] is True
    commission = int(data["commission_xof"])
    assert 0 < commission <= 5000, data
    # Prestataire jetable : wallet à 0 avant → solde = −commission après débit
    assert int(data["wallet_balance_after_xof"]) == -commission, data
    assert data["wallet_can_receive_bookings"] is True, data
    assert data.get("transaction_id"), data

    # (c-bis) idempotence : re-déclarer le même paiement → 400 "déjà payée"
    r = requests.post(
        f"{API}/bookings/{bid}/cash-payment",
        headers=_headers(prov_tok),
        json={"amount": 5000, "category": "services"},
        timeout=15,
    )
    assert r.status_code == 400, f"double cash-payment should be rejected: {r.status_code} {r.text}"

    # (d) wallet v2 reflects (champs canoniques + alias legacy)
    r = requests.get(f"{API}/wallet/me", headers=_headers(prov_tok), timeout=15)
    assert r.status_code == 200
    w = r.json()
    assert int(w["balance_available_xof"]) == -commission, w
    assert w["can_receive_bookings"] is True, w
    # alias legacy : dette = solde négatif
    assert int(w["commission_due"]) == commission, w
    assert w["is_blocked_debt"] is False, w

    # (e) règlement de la dette : ajustement admin (crédit wallet v2)
    r = requests.post(
        f"{API}/admin/wallet/wallet/{provider_id}/adjust",
        headers=_headers(admin_tok),
        json={"owner_id": provider_id, "amount_xof": commission, "reason": "TEST règlement dette cash"},
        timeout=15,
    )
    assert r.status_code == 200, r.text

    r = requests.get(f"{API}/wallet/me", headers=_headers(prov_tok), timeout=15)
    w = r.json()
    assert int(w["balance_available_xof"]) == 0, w
    assert int(w["commission_due"]) == 0, w
    assert w["is_blocked_debt"] is False, w


# ===== TEST 10: auto-block (Wallet v2) =====
def test_10_auto_block_on_debt(admin_auth):
    """Le prestataire est bloqué quand son solde passe SOUS le plancher négatif
    (`can_receive_bookings` = False), puis débloqué après recrédit admin."""
    client = _register("client", "BlockClient")
    provider = _register("prestataire", "BlockPro")
    admin_tok = admin_auth["token"]

    r = requests.post(
        f"{API}/providers/me",
        headers=_headers(provider["token"]),
        json={
            "service": "Plombier",
            "description": "block test",
            "price_type": "fixed",
            "price_amount": 8500,
            "city": "Dakar",
            "zones": ["Plateau"],
        },
        timeout=15,
    )
    assert r.status_code == 200

    client_tok = client["token"]
    prov_tok = provider["token"]
    provider_id = provider["user"]["id"]

    # Plancher négatif configuré côté admin (défaut −50 000 F)
    r = requests.get(f"{API}/admin/wallet/settings", headers=_headers(admin_tok), timeout=15)
    assert r.status_code == 200, r.text
    max_neg = int(r.json()["wallet_max_negative_xof"]["value"])
    assert max_neg < 0, f"plancher négatif attendu, obtenu {max_neg}"

    # Empile la dette (gros montants cash). Sémantique v2 : un débit de commission
    # qui FRANCHIRAIT le plancher est refusé (402 insufficient_funds) — la dette
    # ne peut jamais dépasser le plancher via les commissions.
    hit_protection = False
    blocked = False
    balance = 0
    for _ in range(40):  # borne de sécurité
        bid = _create_booking(client_tok, provider_id)
        requests.patch(
            f"{API}/bookings/{bid}",
            headers=_headers(prov_tok),
            json={"status": "accepted"},
            timeout=15,
        )
        r = requests.post(
            f"{API}/bookings/{bid}/cash-payment",
            headers=_headers(prov_tok),
            json={"amount": 200000, "category": "services"},
            timeout=15,
        )
        if r.status_code == 402:
            # Protection plancher : le débit qui passerait sous le plancher est refusé.
            assert "insufficient_funds" in r.text, r.text
            hit_protection = True
            break
        assert r.status_code == 200, r.text
        d = r.json()
        balance = int(d["wallet_balance_after_xof"])
        if d["wallet_can_receive_bookings"] is False:
            blocked = True
            break

    assert blocked or hit_protection, (
        f"ni blocage ni protection plancher atteints, balance={balance}, floor={max_neg}"
    )

    # Le plancher effectif tient compte du min_balance du wallet.
    r = requests.get(f"{API}/wallet/me", headers=_headers(prov_tok), timeout=15)
    w = r.json()
    floor = min(int(w["min_balance_xof"]), max_neg)
    balance = int(w["balance_available_xof"])

    if not blocked:
        # Amène le solde EXACTEMENT au plancher (autorisé) via un débit admin :
        # c'est l'état "bloqué" (can_receive = balance > plancher → False).
        to_debit = balance - floor
        assert to_debit > 0, f"balance {balance} déjà sous le plancher {floor} ?"
        r = requests.post(
            f"{API}/admin/wallet/wallet/{provider_id}/adjust",
            headers=_headers(admin_tok),
            json={"owner_id": provider_id, "amount_xof": -to_debit, "reason": "TEST descente au plancher"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        balance = floor

    # Wallet v2 : is_blocked_debt (alias) = True
    r = requests.get(f"{API}/wallet/me", headers=_headers(prov_tok), timeout=15)
    w = r.json()
    assert int(w["balance_available_xof"]) == balance, w
    assert w["is_blocked_debt"] is True, w
    assert w["can_receive_bookings"] is False, w

    # Nouveau booking → 403 avec message 'commissions impayées'
    r = requests.post(
        f"{API}/bookings",
        headers=_headers(client_tok),
        json={
            "provider_id": provider_id,
            "date": "2026-03-01",
            "time": "10:00",
            "address": "TEST",
            "description": "should be blocked",
        },
        timeout=15,
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
    assert "commissions impayées" in r.text.lower() or "commissions impayees" in r.text.lower(), r.text

    # Règlement : l'admin recrédite la totalité de la dette (wallet v2)
    debt = -balance
    r = requests.post(
        f"{API}/admin/wallet/wallet/{provider_id}/adjust",
        headers=_headers(admin_tok),
        json={"owner_id": provider_id, "amount_xof": debt, "reason": "TEST règlement dette auto-block"},
        timeout=15,
    )
    assert r.status_code == 200, r.text

    r = requests.get(f"{API}/wallet/me", headers=_headers(prov_tok), timeout=15)
    w = r.json()
    assert int(w["balance_available_xof"]) == 0, w
    assert w["is_blocked_debt"] is False, w

    # Un nouveau booking doit passer
    r = requests.post(
        f"{API}/bookings",
        headers=_headers(client_tok),
        json={
            "provider_id": provider_id,
            "date": "2026-03-02",
            "time": "10:00",
            "address": "TEST",
            "description": "should pass after payment",
        },
        timeout=15,
    )
    assert r.status_code == 200, f"expected 200 after payment, got {r.status_code}: {r.text}"


# ===== TEST 11: admin marketplace stats =====
def test_11_admin_marketplace_stats(admin_auth):
    r = requests.get(
        f"{API}/admin/stats/marketplace",
        headers=_headers(admin_auth["token"]),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ["online", "cash", "wallets", "top_providers", "contact_flags_total", "threshold_fcfa"]:
        assert k in d, f"missing {k}"
    assert d["threshold_fcfa"] == THRESHOLD
    assert isinstance(d["top_providers"], list)


# ===== TEST 12: fraud alerts =====
def test_12_admin_fraud_alerts(admin_auth):
    r = requests.get(
        f"{API}/admin/fraud-alerts",
        headers=_headers(admin_auth["token"]),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "suspects" in d
    assert isinstance(d["suspects"], list)
    # Since tests 1-4 seeded flags, there should be at least 1 suspect
    if d["suspects"]:
        s = d["suspects"][0]
        assert "flag_count" in s
        assert "user" in s
        assert "flags" in s
        assert isinstance(s["flags"], list)


# ===== TEST 13: régression =====
def test_13_regression_chat_messages(client_auth, seed_provider_id):
    r = requests.get(
        f"{API}/chat/{seed_provider_id}/messages",
        headers=_headers(client_auth["token"]),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_13_regression_list_conversations(client_auth):
    r = requests.get(
        f"{API}/chat/conversations",
        headers=_headers(client_auth["token"]),
        timeout=15,
    )
    assert r.status_code == 200, r.text


def test_13_regression_booking_normal():
    """Normal booking (nouveau provider non bloqué) doit passer."""
    client = _register("client", "RegClient")
    provider = _register("prestataire", "RegPro")
    r = requests.post(
        f"{API}/providers/me",
        headers=_headers(provider["token"]),
        json={
            "service": "Plombier",
            "description": "reg",
            "price_type": "fixed",
            "price_amount": 2000,
            "city": "Dakar",
            "zones": [],
        },
        timeout=15,
    )
    assert r.status_code == 200
    r = requests.post(
        f"{API}/bookings",
        headers=_headers(client["token"]),
        json={
            "provider_id": provider["user"]["id"],
            "date": "2026-04-01",
            "time": "09:00",
            "address": "TEST",
            "description": "normal",
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text


def test_13_regression_provider_detail_admin(admin_auth, seed_provider_id):
    r = requests.get(
        f"{API}/providers/{seed_provider_id}",
        headers=_headers(admin_auth["token"]),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    p = r.json()
    assert p.get("contact_visible") is True, f"admin should see contact: {p.get('contact_visible')}"
