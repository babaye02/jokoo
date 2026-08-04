"""Iteration 39 — CRM Push Campaigns backend tests.

Covers:
  - /api/admin/push/dashboard, /preview, /campaigns (CRUD + send), /templates
  - Access control (admin-only)
  - Non-regression: /register-push persistence, chat, booking, KYC auto-triggers
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_BACKEND_URL",
    "https://868fd53e-1f85-41aa-80f4-13c6ad7575b7.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@jokoo.sn", "Admin1234!")
PRO = ("pro@jokoo.sn", "Passw0rd!")
CLIENT = ("client@jokoo.sn", "Passw0rd!")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    data = r.json()
    return data.get("token") or data.get("access_token")


@pytest.fixture(scope="session")
def admin_headers():
    # Seed base data (idempotent) so counts > 0
    try:
        requests.post(f"{API}/seed", timeout=60)
    except Exception:
        pass
    token = _login(*ADMIN)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def pro_headers():
    token = _login(*PRO)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def client_headers():
    token = _login(*CLIENT)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# 1. Dashboard
# ---------------------------------------------------------------------------
class TestDashboard:
    def test_dashboard_structure(self, admin_headers):
        r = requests.get(f"{API}/admin/push/dashboard", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("counts", "totals", "rates", "recent_campaigns"):
            assert k in data, f"missing key {k}"
        for ck in ("total_users", "clients", "prestataires", "devices",
                   "campaigns_total", "campaigns_sent", "campaigns_scheduled"):
            assert ck in data["counts"], f"missing counts.{ck}"
        assert data["counts"]["total_users"] > 0
        assert isinstance(data["recent_campaigns"], list)


# ---------------------------------------------------------------------------
# 2. Segment preview (10 types)
# ---------------------------------------------------------------------------
class TestSegmentPreview:
    def _preview(self, headers, segment):
        r = requests.post(f"{API}/admin/push/preview", headers=headers,
                          json={"segment": segment}, timeout=20)
        assert r.status_code == 200, f"{segment} → {r.status_code} {r.text}"
        data = r.json()
        assert "count" in data and "sample" in data
        return data

    def test_all(self, admin_headers):
        assert self._preview(admin_headers, {"type": "all"})["count"] > 0

    def test_clients(self, admin_headers):
        assert self._preview(admin_headers, {"type": "clients"})["count"] > 0

    def test_prestataires(self, admin_headers):
        assert self._preview(admin_headers, {"type": "prestataires"})["count"] > 0

    def test_verified(self, admin_headers):
        d = self._preview(admin_headers, {"type": "verified"})
        assert isinstance(d["sample"], list)

    def test_unverified(self, admin_headers):
        d = self._preview(admin_headers, {"type": "unverified"})
        assert isinstance(d["sample"], list)

    def test_category(self, admin_headers):
        d = self._preview(admin_headers, {"type": "category", "params": {"category": "plombier"}})
        assert isinstance(d["sample"], list)

    def test_city_dakar_case_insensitive(self, admin_headers):
        assert self._preview(admin_headers, {"type": "city", "params": {"city": "Dakar"}})["count"] > 0
        # case-insensitive
        assert self._preview(admin_headers, {"type": "city", "params": {"city": "dakar"}})["count"] > 0

    def test_new_signups(self, admin_headers):
        d = self._preview(admin_headers, {"type": "new_signups"})
        assert isinstance(d["sample"], list)

    def test_inactive(self, admin_headers):
        d = self._preview(admin_headers, {"type": "inactive"})
        assert isinstance(d["sample"], list)

    def test_manual(self, admin_headers):
        d = self._preview(admin_headers,
                          {"type": "manual", "params": {"user_ids": ["fake_id_1", "fake_id_2"]}})
        assert d["count"] == 2


# ---------------------------------------------------------------------------
# 3 & 4. Templates
# ---------------------------------------------------------------------------
class TestTemplates:
    DEFAULT_KEYS = {"welcome", "eid", "christmas", "new_year", "promo",
                    "new_service", "app_update", "booking_reminder",
                    "review_request", "new_promo_codes"}

    def test_default_templates_seeded(self, admin_headers):
        r = requests.get(f"{API}/admin/push/templates", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        tpls = r.json()
        keys = {t["key"] for t in tpls}
        missing = self.DEFAULT_KEYS - keys
        assert not missing, f"missing default templates: {missing}"

    def test_template_crud_and_default_protection(self, admin_headers):
        # Create custom
        payload = {
            "key": f"TEST_key_{uuid.uuid4().hex[:8]}",
            "category": "custom",
            "title_template": "TEST title",
            "message_template": "TEST message body",
        }
        r = requests.post(f"{API}/admin/push/templates", headers=admin_headers,
                          json=payload, timeout=15)
        assert r.status_code == 201, r.text
        tid = r.json()["id"]

        # Update
        payload["title_template"] = "TEST title updated"
        r = requests.put(f"{API}/admin/push/templates/{tid}", headers=admin_headers,
                         json=payload, timeout=15)
        assert r.status_code == 200, r.text

        # Delete default → 400
        r = requests.get(f"{API}/admin/push/templates", headers=admin_headers, timeout=15)
        default_id = next(t["id"] for t in r.json() if t.get("is_default"))
        r = requests.delete(f"{API}/admin/push/templates/{default_id}",
                            headers=admin_headers, timeout=15)
        assert r.status_code == 400, f"expected 400 for default delete, got {r.status_code}"

        # Delete custom → 200
        r = requests.delete(f"{API}/admin/push/templates/{tid}",
                            headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("deleted", 0) == 1


# ---------------------------------------------------------------------------
# 5. Campaign lifecycle
# ---------------------------------------------------------------------------
class TestCampaigns:
    def test_full_lifecycle(self, admin_headers):
        # 5.a Immediate campaign
        body = {
            "title": "TEST immediate",
            "message": "TEST message",
            "segment": {"type": "manual", "params": {"user_ids": ["u1", "u2"]}},
            "mode": "immediate",
        }
        r = requests.post(f"{API}/admin/push/campaigns", headers=admin_headers,
                          json=body, timeout=15)
        assert r.status_code == 201, r.text
        immediate = r.json()
        assert immediate["status"] in ("sending", "sent")
        imm_id = immediate["id"]

        # 5.b Scheduled campaign (future)
        body_sched = {
            "title": "TEST scheduled",
            "message": "TEST message sched",
            "segment": {"type": "manual", "params": {"user_ids": ["u1"]}},
            "mode": "scheduled",
            "scheduled_at": "2030-01-01T12:00:00Z",
        }
        r = requests.post(f"{API}/admin/push/campaigns", headers=admin_headers,
                          json=body_sched, timeout=15)
        assert r.status_code == 201, r.text
        sched = r.json()
        assert sched["status"] == "scheduled"
        sched_id = sched["id"]

        # 5.c Scheduled past date → 400
        body_past = {**body_sched, "scheduled_at": "2020-01-01T12:00:00Z"}
        r = requests.post(f"{API}/admin/push/campaigns", headers=admin_headers,
                          json=body_past, timeout=15)
        assert r.status_code == 400, f"expected 400 for past date, got {r.status_code}"

        # 5.d Scheduled without scheduled_at → 400
        body_missing = {k: v for k, v in body_sched.items() if k != "scheduled_at"}
        r = requests.post(f"{API}/admin/push/campaigns", headers=admin_headers,
                          json=body_missing, timeout=15)
        assert r.status_code == 400

        # 5.e List includes our created campaigns
        r = requests.get(f"{API}/admin/push/campaigns", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        ids = {c["id"] for c in r.json()}
        assert imm_id in ids and sched_id in ids

        # 5.f Detail with live_stats
        r = requests.get(f"{API}/admin/push/campaigns/{sched_id}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert "live_stats" in r.json()

        # 5.g PATCH scheduled → 200
        r = requests.patch(f"{API}/admin/push/campaigns/{sched_id}",
                           headers=admin_headers,
                           json={"title": "TEST scheduled updated"}, timeout=15)
        assert r.status_code == 200, r.text

        # 5.h DELETE
        r = requests.delete(f"{API}/admin/push/campaigns/{sched_id}",
                            headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        # cleanup immediate
        requests.delete(f"{API}/admin/push/campaigns/{imm_id}", headers=admin_headers, timeout=10)


# ---------------------------------------------------------------------------
# 6. Access control
# ---------------------------------------------------------------------------
class TestAccessControl:
    ENDPOINTS = [
        ("GET", "/admin/push/dashboard", None),
        ("POST", "/admin/push/preview", {"segment": {"type": "all"}}),
        ("GET", "/admin/push/campaigns", None),
        ("GET", "/admin/push/templates", None),
    ]

    @pytest.mark.parametrize("method,path,body", ENDPOINTS)
    def test_non_admin_forbidden(self, pro_headers, method, path, body):
        url = f"{API}{path}"
        if method == "GET":
            r = requests.get(url, headers=pro_headers, timeout=15)
        else:
            r = requests.post(url, headers=pro_headers, json=body, timeout=15)
        assert r.status_code == 403, f"{method} {path} → {r.status_code}, expected 403"


# ---------------------------------------------------------------------------
# 7. Non-regression auto-triggers
# ---------------------------------------------------------------------------
class TestAutoTriggers:
    def test_chat_message_still_200(self, client_headers):
        # Find pro user id
        r = requests.get(f"{API}/providers?limit=5", timeout=15)
        assert r.status_code == 200
        provs = r.json()
        peer_id = None
        for p in provs:
            if p.get("user_id"):
                peer_id = p["user_id"]
                break
        if not peer_id:
            pytest.skip("No provider with user_id found")
        r = requests.post(f"{API}/chat/{peer_id}/messages", headers=client_headers,
                          json={"text": "TEST hello (iter39)"}, timeout=15)
        assert r.status_code in (200, 201), f"chat message: {r.status_code} {r.text}"

    def test_booking_patch_accepted(self, admin_headers, client_headers, pro_headers):
        # Create a fresh booking as client for pro@jokoo.sn's provider, then accept as pro
        # Find pro's provider id
        r = requests.get(f"{API}/providers?limit=50", timeout=15)
        provs = r.json()
        pro_prov = next(
            (p for p in provs if (p.get("email") or "").lower() == "pro@jokoo.sn"),
            None,
        )
        # Fallback: use first provider (still validates endpoint)
        target_pid = pro_prov["id"] if pro_prov else provs[0]["id"]
        payload = {
            "provider_id": target_pid,
            "date": "2030-06-15",
            "time": "10:00",
            "address": "Dakar",
            "description": "TEST iter39 non-regression",
            "price": 10000,
            "price_type": "fixed",
        }
        r = requests.post(f"{API}/bookings", headers=client_headers, json=payload, timeout=15)
        if r.status_code not in (200, 201):
            pytest.skip(f"booking create failed: {r.status_code} {r.text[:200]}")
        bid = r.json()["id"]
        # Accept as pro
        r = requests.patch(f"{API}/bookings/{bid}", headers=pro_headers,
                           json={"status": "accepted"}, timeout=15)
        assert r.status_code in (200, 201), f"booking accept: {r.status_code} {r.text[:200]}"

    def test_kyc_approve_or_reject_returns_200(self, admin_headers):
        # Non-regression: KYC approve/reject endpoints still return 200 (+ auto-trigger push)
        r = requests.get(f"{API}/admin/kyc-requests?status=pending&limit=5",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        pending = r.json()
        if not pending:
            pytest.skip("no pending KYC request available")
        kyc_id = pending[0]["id"]
        # Prefer reject with reason (safer, keeps pro non-verified)
        r = requests.post(f"{API}/admin/kyc-requests/{kyc_id}/reject",
                          headers=admin_headers,
                          json={"reason": "TEST iter39 non-regression"}, timeout=15)
        assert r.status_code == 200, f"kyc reject: {r.status_code} {r.text[:200]}"


# ---------------------------------------------------------------------------
# 8. register-push persistence
# ---------------------------------------------------------------------------
class TestRegisterPush:
    def test_register_persists_in_db(self, admin_headers):
        # Get a real user id (client)
        r = requests.post(f"{API}/auth/login",
                          json={"email": CLIENT[0], "password": CLIENT[1]}, timeout=15)
        assert r.status_code == 200
        uid = r.json()["user"]["id"]

        # Snapshot devices count BEFORE
        before = requests.get(f"{API}/admin/push/dashboard", headers=admin_headers, timeout=15).json()
        devices_before = before["counts"]["devices"]

        token = f"TEST_iter39_token_{uuid.uuid4().hex[:8]}"
        body = {"user_id": uid, "platform": "android", "device_token": token}
        r = requests.post(f"{API}/register-push", json=body, timeout=15)
        # In dev, upstream SuprSend returns 500 (EMERGENT_PUSH_KEY missing).
        # Persistence occurs BEFORE relay → accept 200/201/500/502.
        assert r.status_code in (200, 201, 500, 502), f"register-push: {r.status_code} {r.text}"

        # Verify persistence: devices count must have increased by 1
        after = requests.get(f"{API}/admin/push/dashboard", headers=admin_headers, timeout=15).json()
        devices_after = after["counts"]["devices"]
        assert devices_after >= devices_before + 1, (
            f"device not persisted: before={devices_before} after={devices_after}"
        )
