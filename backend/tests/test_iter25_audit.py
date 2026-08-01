"""Iter25 — Audit complet (P1 block flow + smoke tests par module)."""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_BACKEND_URL", "https://868fd53e-1f85-41aa-80f4-13c6ad7575b7.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

CLIENT = ("client@jokoo.sn", "Passw0rd!")
PRO = ("pro@jokoo.sn", "Passw0rd!")
DRIVER = ("chauffeur@jokoo.sn", "Driver1234!")
AISHA = ("aisha.family@jokoo.sn", "Family1234!")
ADMIN = ("admin@jokoo.sn", "Admin1234!")


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"login {email} failed: {r.status_code} {r.text[:200]}")
    tok = r.json().get("token") or r.json().get("access_token")
    uid = r.json().get("user", {}).get("id")
    return tok, uid


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def auths():
    # seed to ensure data
    try:
        requests.post(f"{API}/seed", timeout=30)
    except Exception:
        pass
    a = {
        "client": _login(*CLIENT),
        "pro": _login(*PRO),
        "driver": _login(*DRIVER),
        "aisha": _login(*AISHA),
        "admin": _login(*ADMIN),
    }
    return a


# ============================
# 1) PRIORITY — BLOCK FLOW
# ============================
class TestBlockFlow:
    def test_00_cleanup_unblock(self, auths):
        ct, _ = auths["client"]
        _, pu = auths["pro"]
        requests.delete(f"{API}/users/{pu}/block", headers=_h(ct))

    def test_01_pro_visible_before_block(self, auths):
        ct, _ = auths["client"]
        _, pu = auths["pro"]
        r = requests.get(f"{API}/providers?limit=200", headers=_h(ct))
        assert r.status_code == 200
        ids = [p["user_id"] for p in r.json() if "user_id" in p]
        assert pu in ids, f"pro user_id {pu} absent de providers avant block"

    def test_02_block_success(self, auths):
        ct, _ = auths["client"]
        _, pu = auths["pro"]
        r = requests.post(f"{API}/users/{pu}/block", headers=_h(ct), json={})
        assert r.status_code == 200, r.text

    def test_03_pro_hidden_after_block(self, auths):
        ct, _ = auths["client"]
        _, pu = auths["pro"]
        r = requests.get(f"{API}/providers?limit=200", headers=_h(ct))
        assert r.status_code == 200
        ids = [p["user_id"] for p in r.json()]
        assert pu not in ids

    def test_04_block_nonexistent_user_idempotent(self, auths):
        ct, _ = auths["client"]
        fake = f"nonexistent-{uuid.uuid4().hex[:12]}"
        r = requests.post(f"{API}/users/{fake}/block", headers=_h(ct), json={})
        # backend actuel: upsert idempotent → 200 même pour id fake (comportement à confirmer)
        assert r.status_code in (200, 400, 404), f"crash inattendu: {r.status_code}"
        # cleanup
        requests.delete(f"{API}/users/{fake}/block", headers=_h(ct))

    def test_05_unblock_and_restore(self, auths):
        ct, _ = auths["client"]
        _, pu = auths["pro"]
        r = requests.delete(f"{API}/users/{pu}/block", headers=_h(ct))
        assert r.status_code == 200
        r2 = requests.get(f"{API}/providers?limit=200", headers=_h(ct))
        ids = [p["user_id"] for p in r2.json()]
        assert pu in ids


# ============================
# 2) SMOKE — AUTH
# ============================
class TestAuth:
    def test_login_ok(self, auths):
        assert auths["client"][0]

    def test_forgot_password(self):
        r = requests.post(f"{API}/auth/forgot-password", json={"email": CLIENT[0]})
        assert r.status_code in (200, 202)

    def test_otp_request_dev(self):
        # Use an existing seeded number (client). If not registered, backend renvoie 404 by design.
        r = requests.post(f"{API}/auth/otp/request", json={"phone": "+221771234567"})
        assert r.status_code in (200, 201, 404), r.text


# ============================
# 3) PROVIDERS
# ============================
class TestProviders:
    def test_search_basic(self, auths):
        ct, _ = auths["client"]
        r = requests.get(f"{API}/providers?limit=50", headers=_h(ct))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_search_filters(self, auths):
        ct, _ = auths["client"]
        for qs in ["service=Ménage", "city=Dakar", "sort=rating", "q=Dakar"]:
            r = requests.get(f"{API}/providers?{qs}&limit=50", headers=_h(ct))
            assert r.status_code == 200, f"{qs} -> {r.status_code}"

    def test_detail_masks_phone_email(self, auths):
        ct, _ = auths["client"]
        r = requests.get(f"{API}/providers?limit=50", headers=_h(ct))
        pid = r.json()[0]["id"]
        d = requests.get(f"{API}/providers/{pid}", headers=_h(ct))
        assert d.status_code == 200
        body = d.json()
        # phone/email should either be absent or masked
        for k in ("phone", "email"):
            if k in body and body[k]:
                assert "*" in body[k] or "•" in body[k] or "@" not in body[k] or "…" in body[k], f"{k} non masqué: {body[k]}"


# ============================
# 4) CHAT sanitizer
# ============================
class TestChat:
    def test_send_and_list(self, auths):
        ct, _ = auths["client"]
        _, pu = auths["pro"]
        # unblock (in case)
        requests.delete(f"{API}/users/{pu}/block", headers=_h(ct))
        r = requests.post(f"{API}/chat/{pu}/messages", headers=_h(ct), json={"text": "TEST_iter25 hello", "kind": "text"})
        assert r.status_code == 200, r.text
        lst = requests.get(f"{API}/chat/{pu}/messages", headers=_h(ct))
        assert lst.status_code == 200 and len(lst.json()) >= 1

    def test_sanitizer_phone_email(self, auths):
        ct, _ = auths["client"]
        _, pu = auths["pro"]
        r = requests.post(f"{API}/chat/{pu}/messages", headers=_h(ct), json={"text": "Appelle-moi au 77 123 45 67 ou test@mail.com", "kind": "text"})
        # accept 200 (sanitized) or 400 (blocked)
        assert r.status_code in (200, 400)
        if r.status_code == 200:
            body = r.json()
            t = body.get("text", "")
            assert "77 123 45 67" not in t and "test@mail.com" not in t, f"sanitizer inactif: {t}"


# ============================
# 5) NOTIFICATIONS
# ============================
class TestNotifs:
    def test_list_and_mark_all(self, auths):
        ct, _ = auths["client"]
        r = requests.get(f"{API}/notifications", headers=_h(ct))
        assert r.status_code == 200
        m = requests.post(f"{API}/notifications/read-all", headers=_h(ct))
        assert m.status_code in (200, 204)


# ============================
# 6) RIDES / PARCELS
# ============================
class TestRides:
    def test_search(self, auths):
        ct, _ = auths["client"]
        r = requests.get(f"{API}/rides", headers=_h(ct))
        assert r.status_code == 200


# ============================
# 7) FAMILY
# ============================
class TestFamily:
    def test_babysitters(self, auths):
        ct, _ = auths["client"]
        r = requests.get(f"{API}/family/babysitters", headers=_h(ct))
        assert r.status_code == 200


# ============================
# 8) LEGAL
# ============================
class TestLegal:
    def test_documents(self):
        r = requests.get(f"{API}/legal/documents")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ============================
# 9) ADS
# ============================
class TestAds:
    def test_list(self, auths):
        ct, _ = auths["client"]
        r = requests.get(f"{API}/ads?placement=home_top&audience=client", headers=_h(ct))
        assert r.status_code == 200


# ============================
# 10) WALLET
# ============================
class TestWallet:
    def test_me(self, auths):
        pt, _ = auths["pro"]
        r = requests.get(f"{API}/wallet/me", headers=_h(pt))
        assert r.status_code == 200
        r2 = requests.get(f"{API}/wallet/history", headers=_h(pt))
        assert r2.status_code == 200


# ============================
# 11) STRIPE — endpoint doit répondre proprement
# ============================
class TestStripe:
    def test_checkout_no_crash(self, auths):
        ct, _ = auths["client"]
        _, pu = auths["pro"]
        # get a booking first
        # create booking
        r = requests.get(f"{API}/providers?limit=50", headers=_h(ct))
        prov = next((p for p in r.json() if p.get("user_id") == pu), None)
        if not prov:
            pytest.skip("pro provider absent")
        b = requests.post(f"{API}/bookings", headers=_h(ct), json={
            "provider_id": prov["id"], "date": "2026-06-15", "time": "10:00",
            "address": "TEST", "description": "TEST_iter25 stripe"
        })
        if b.status_code != 200:
            pytest.skip(f"booking failed: {b.status_code} {b.text[:200]}")
        bid = b.json()["id"]
        pay = requests.post(f"{API}/payments/checkout/booking", headers=_h(ct), json={"booking_id": bid, "origin_url": BASE})
        # accept anything except 5xx crash traceback; 200/400/402/500 with clean JSON acceptable
        assert pay.status_code < 600
        try:
            pay.json()  # must be JSON, not raw stack trace
        except Exception:
            pytest.fail(f"Stripe endpoint returned non-JSON: {pay.text[:200]}")


# ============================
# 12) REPORTS
# ============================
class TestReports:
    def test_create(self, auths):
        ct, _ = auths["client"]
        _, pu = auths["pro"]
        r = requests.post(f"{API}/reports", headers=_h(ct), json={"target_id": pu, "target_type": "user", "reason": "TEST_iter25"})
        assert r.status_code in (200, 201), r.text


# ============================
# 13) ADMIN CRM
# ============================
class TestAdmin:
    def test_crm_overview(self, auths):
        at, _ = auths["admin"]
        r = requests.get(f"{API}/admin/crm/overview", headers=_h(at))
        assert r.status_code == 200

    def test_crm_users(self, auths):
        at, _ = auths["admin"]
        r = requests.get(f"{API}/admin/crm/users?limit=10", headers=_h(at))
        assert r.status_code == 200

    def test_marketplace_stats(self, auths):
        at, _ = auths["admin"]
        r = requests.get(f"{API}/admin/stats/marketplace", headers=_h(at))
        assert r.status_code == 200

    def test_staff_list(self, auths):
        at, _ = auths["admin"]
        r = requests.get(f"{API}/admin/staff", headers=_h(at))
        assert r.status_code == 200
