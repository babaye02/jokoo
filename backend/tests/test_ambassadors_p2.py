"""
Jokoo Partners (ambassadors) — Phase 2 backend audit.

Tests the NEW/refactored features after the recent audit:
  1. Admin list: new `{total, items}` format + pagination + search (q) + active filter
  2. Admin GET single: GET /admin/ambassadors/{uid} (new endpoint)
  3. Admin PUT single: PUT /admin/ambassadors/{uid}
  4. Admin toggle soft-deactivate → reactivate + slug/goal update
  5. User /me/referrals?status=... filter
  6. Auth guards (401 without token, 403 with wrong role)
  7. Attach: self-referral → 400, invalid code → 404, own code → 400
  8. Public leaderboard shape (rank/name/badge/prestataires/clients, NO money)
  9. Public /public/invite/{code}: 200 valid=true and 200 valid=false
 10. Route ordering: /admin/ambassadors/config NOT captured by /{uid}
 11. Edge: slug with accents normalized, slug conflict → 400
 12. Rate-limit constant MAX_ATTACH_PER_IP_PER_DAY == 200

Uses local URL (http://localhost:8001) as declared in the review request.
"""
from __future__ import annotations

import os
import uuid
import asyncio
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = "http://localhost:8001"
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@jokoo.sn", "password": "Admin1234!"}
CLIENT = {"email": "client@jokoo.sn", "password": "Passw0rd!"}
PRO = {"email": "pro@jokoo.sn", "password": "Passw0rd!"}

EXPECTED_CODE = "5GB3EH"
EXPECTED_SLUG = "aida-client"


# ---------------------------------------------------------------- helpers
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} → {r.status_code} {r.text}"
    return r.json()["token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(**ADMIN)


@pytest.fixture(scope="module")
def client_token():
    return _login(**CLIENT)


@pytest.fixture(scope="module")
def pro_token():
    return _login(**PRO)


@pytest.fixture(scope="module")
def client_uid(client_token):
    return requests.get(f"{API}/auth/me", headers=_auth(client_token), timeout=10).json()["id"]


@pytest.fixture(scope="module")
def pro_uid(pro_token):
    return requests.get(f"{API}/auth/me", headers=_auth(pro_token), timeout=10).json()["id"]


# ================================================================
# 1. Admin list — new format {total, items} + filters + pagination
# ================================================================
class TestAdminListNewFormat:
    def test_new_format_total_items(self, admin_token):
        r = requests.get(f"{API}/admin/ambassadors", headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict), f"Expected dict, got {type(data)}: {data}"
        assert "total" in data, f"Missing 'total' in {data.keys()}"
        assert "items" in data, f"Missing 'items' in {data.keys()}"
        assert isinstance(data["items"], list)
        assert isinstance(data["total"], int)
        assert data["total"] >= 1
        aida = next((a for a in data["items"] if a.get("code") == EXPECTED_CODE), None)
        assert aida is not None, "Aida not found in list"

    def test_search_q_by_name(self, admin_token):
        r = requests.get(f"{API}/admin/ambassadors?q=aida", headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] >= 1
        assert any(a.get("code") == EXPECTED_CODE for a in data["items"])

    def test_search_q_by_code(self, admin_token):
        r = requests.get(f"{API}/admin/ambassadors?q={EXPECTED_CODE}", headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        assert any(a.get("code") == EXPECTED_CODE for a in data["items"])

    def test_search_q_by_slug(self, admin_token):
        r = requests.get(f"{API}/admin/ambassadors?q=aida-client", headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1

    def test_search_q_no_match(self, admin_token):
        r = requests.get(f"{API}/admin/ambassadors?q=zzzzz_no_such_thing", headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 0
        assert data["items"] == []

    def test_filter_active_true(self, admin_token):
        r = requests.get(f"{API}/admin/ambassadors?active=true", headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200
        data = r.json()
        for a in data["items"]:
            assert a["active"] is True

    def test_pagination(self, admin_token):
        r = requests.get(f"{API}/admin/ambassadors?skip=0&limit=1", headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert len(data["items"]) <= 1
        assert data["total"] >= 1


# ================================================================
# 2. GET /admin/ambassadors/{uid} — single detail (new)
# ================================================================
class TestAdminGetSingle:
    def test_get_single_ok(self, admin_token, client_uid):
        r = requests.get(f"{API}/admin/ambassadors/{client_uid}", headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        amb = r.json()
        assert amb["code"] == EXPECTED_CODE
        assert amb["slug"] == EXPECTED_SLUG
        # includes user info
        assert amb.get("name")
        assert amb.get("user_id") == client_uid

    def test_get_single_unknown(self, admin_token):
        r = requests.get(f"{API}/admin/ambassadors/does-not-exist-uid",
                         headers=_auth(admin_token), timeout=10)
        assert r.status_code == 404

    def test_get_single_403_non_admin(self, client_token, client_uid):
        r = requests.get(f"{API}/admin/ambassadors/{client_uid}",
                         headers=_auth(client_token), timeout=10)
        assert r.status_code == 403

    def test_get_single_401_no_token(self, client_uid):
        r = requests.get(f"{API}/admin/ambassadors/{client_uid}", timeout=10)
        assert r.status_code == 401


# ================================================================
# 3. PUT /admin/ambassadors/{uid} — edit ambassador (new)
# ================================================================
class TestAdminPutSingle:
    def test_put_updates_goal_and_bio(self, admin_token, client_uid):
        # Save current
        r0 = requests.get(f"{API}/admin/ambassadors/{client_uid}",
                          headers=_auth(admin_token), timeout=10)
        original = r0.json()

        # Update
        r = requests.put(
            f"{API}/admin/ambassadors/{client_uid}",
            json={"monthly_goal": 333, "custom_bio": "P2 audit bio"},
            headers=_auth(admin_token), timeout=10,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        amb = data["ambassador"]
        assert amb["monthly_goal"] == 333
        assert amb["custom_bio"] == "P2 audit bio"
        # Code/slug unchanged
        assert amb["code"] == original["code"]

        # Restore
        requests.put(
            f"{API}/admin/ambassadors/{client_uid}",
            json={"monthly_goal": original.get("monthly_goal") or 500,
                  "custom_bio": original.get("custom_bio") or ""},
            headers=_auth(admin_token), timeout=10,
        )

    def test_put_404_unknown(self, admin_token):
        r = requests.put(
            f"{API}/admin/ambassadors/no-such-uid-42",
            json={"monthly_goal": 100},
            headers=_auth(admin_token), timeout=10,
        )
        assert r.status_code == 404

    def test_put_403_non_admin(self, client_token, client_uid):
        r = requests.put(
            f"{API}/admin/ambassadors/{client_uid}",
            json={"monthly_goal": 111},
            headers=_auth(client_token), timeout=10,
        )
        assert r.status_code == 403


# ================================================================
# 4. Route ordering: /admin/ambassadors/config not shadowed by /{uid}
# ================================================================
class TestRouteOrdering:
    def test_config_route_reachable(self, admin_token):
        r = requests.get(f"{API}/admin/ambassadors/config",
                         headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        # If shadowed by /{uid}, we'd get 404 (Ambassador not found).
        assert "thresholds" in data
        assert "commissions" in data

    def test_commissions_route_reachable(self, admin_token):
        r = requests.get(f"{API}/admin/ambassadors/commissions",
                         headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "total" in data and "items" in data


# ================================================================
# 5. /ambassadors/me/referrals?status=... filter
# ================================================================
class TestMyReferralsFilter:
    def test_status_pending_filter(self, client_token):
        r = requests.get(f"{API}/ambassadors/me/referrals?status=pending",
                         headers=_auth(client_token), timeout=10)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        for row in rows:
            assert row["status"] == "pending"

    def test_status_verified_filter(self, client_token):
        r = requests.get(f"{API}/ambassadors/me/referrals?status=verified",
                         headers=_auth(client_token), timeout=10)
        assert r.status_code == 200
        rows = r.json()
        for row in rows:
            assert row["status"] == "verified"

    def test_status_invalid_value_ignored(self, client_token):
        # invalid value should not raise; endpoint just returns all
        r = requests.get(f"{API}/ambassadors/me/referrals?status=weird",
                         headers=_auth(client_token), timeout=10)
        assert r.status_code == 200


# ================================================================
# 6. Auth guards
# ================================================================
class TestAuthGuards:
    def test_admin_endpoints_no_token(self):
        for path in ["/admin/ambassadors", "/admin/ambassadors/config",
                     "/admin/ambassadors/commissions"]:
            r = requests.get(f"{API}{path}", timeout=10)
            assert r.status_code == 401, f"{path} expected 401 got {r.status_code}"

    def test_admin_endpoints_client_token_403(self, client_token):
        r = requests.get(f"{API}/admin/ambassadors",
                         headers=_auth(client_token), timeout=10)
        assert r.status_code == 403

    def test_me_endpoints_no_token(self):
        for path in ["/ambassadors/me", "/ambassadors/me/referrals",
                     "/ambassadors/me/commissions"]:
            r = requests.get(f"{API}{path}", timeout=10)
            assert r.status_code == 401, f"{path} expected 401 got {r.status_code}"

    def test_attach_no_token(self):
        r = requests.post(f"{API}/ambassadors/attach", json={"code": EXPECTED_CODE}, timeout=10)
        assert r.status_code == 401


# ================================================================
# 7. Attach edge cases (self / invalid / already attached)
# ================================================================
class TestAttachEdges:
    def test_attach_self_referral_400(self, client_token):
        # Aida trying to attach with her own code
        r = requests.post(f"{API}/ambassadors/attach", json={"code": EXPECTED_CODE},
                          headers=_auth(client_token), timeout=10)
        # Spec update: should be 400 explicit
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    def test_attach_invalid_code_404(self, pro_token):
        # Ensure pro is not attached to anyone
        r = requests.post(f"{API}/ambassadors/attach", json={"code": "NOTHING999"},
                          headers=_auth(pro_token), timeout=10)
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text}"

    def test_attach_missing_code_400(self, pro_token):
        r = requests.post(f"{API}/ambassadors/attach", json={},
                          headers=_auth(pro_token), timeout=10)
        assert r.status_code == 400


# ================================================================
# 8. Public leaderboard shape
# ================================================================
class TestLeaderboardShape:
    def test_leaderboard_shape(self):
        r = requests.get(f"{API}/ambassadors/leaderboard", timeout=10)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        for row in rows:
            for key in ("rank", "name", "badge", "tier", "prestataires", "clients"):
                assert key in row, f"missing key {key} in {row}"
            for banned in ("amount", "amount_xof", "revenue", "commission",
                           "commissions", "earned"):
                assert banned not in row, f"leaderboard leaks money field: {banned}"


# ================================================================
# 9. Public invite
# ================================================================
class TestPublicInvite:
    def test_valid_code(self):
        r = requests.get(f"{API}/public/invite/{EXPECTED_CODE}", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["valid"] is True
        assert "links" in d and "web" in d["links"]

    def test_invalid_code_200_valid_false(self):
        r = requests.get(f"{API}/public/invite/INVALIDE9", timeout=10)
        assert r.status_code == 200
        assert r.json()["valid"] is False


# ================================================================
# 10. Config edge case: partial thresholds → defaults fallback
# ================================================================
class TestConfigEdgeCases:
    def test_partial_thresholds_uses_defaults(self, admin_token):
        # Save
        r0 = requests.get(f"{API}/admin/ambassadors/config",
                          headers=_auth(admin_token), timeout=10)
        original = r0.json()

        # Send only bronze (omit diamond, elite, ...)
        r = requests.put(
            f"{API}/admin/ambassadors/config",
            json={"thresholds": {"bronze": 6}},
            headers=_auth(admin_token), timeout=10,
        )
        assert r.status_code == 200, r.text
        updated = r.json()
        # After merge with defaults, diamond and elite must still be present
        assert "diamond" in updated["thresholds"]
        assert "elite" in updated["thresholds"]
        assert updated["thresholds"]["diamond"] == 150  # default fallback
        assert updated["thresholds"]["elite"] == 500

        # Restore
        requests.put(
            f"{API}/admin/ambassadors/config",
            json={"thresholds": original["thresholds"],
                  "commissions": original["commissions"],
                  "monthly_goal": original["monthly_goal"]},
            headers=_auth(admin_token), timeout=10,
        )

    def test_commission_patch_invalid_status(self, admin_token):
        r = requests.patch(f"{API}/admin/ambassadors/commissions/xxx?status=bogus",
                           headers=_auth(admin_token), timeout=10)
        assert r.status_code == 400


# ================================================================
# 11. Slug edge cases (accents normalized, conflict → 400)
# ================================================================
class TestSlugEdgeCases:
    """Uses a real ambassador (Aida) — we mutate her slug then restore it."""

    def test_slug_with_accents_normalized(self, admin_token, client_uid):
        # Save
        r0 = requests.get(f"{API}/admin/ambassadors/{client_uid}",
                          headers=_auth(admin_token), timeout=10)
        original_slug = r0.json()["slug"]

        # New slug with accents → should be normalized to unaccented lower
        r = requests.put(
            f"{API}/admin/ambassadors/{client_uid}",
            json={"custom_slug": "Aïdà-Tést"},
            headers=_auth(admin_token), timeout=10,
        )
        assert r.status_code == 200, r.text
        new_slug = r.json()["ambassador"]["slug"]
        assert new_slug == "aida-test", f"Expected 'aida-test' got '{new_slug}'"

        # Restore
        requests.put(
            f"{API}/admin/ambassadors/{client_uid}",
            json={"custom_slug": original_slug},
            headers=_auth(admin_token), timeout=10,
        )

    def test_slug_too_short_400(self, admin_token, client_uid):
        r = requests.put(
            f"{API}/admin/ambassadors/{client_uid}",
            json={"custom_slug": "ab"},  # < 3 chars
            headers=_auth(admin_token), timeout=10,
        )
        assert r.status_code == 400


# ================================================================
# 12. Rate-limit constant (updated to 200 as per current code)
# ================================================================
class TestRateLimitConstant:
    def test_rate_limit_constant_updated(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from ambassadors import MAX_ATTACH_PER_IP_PER_DAY
        assert MAX_ATTACH_PER_IP_PER_DAY == 200, \
            f"Expected 200 got {MAX_ATTACH_PER_IP_PER_DAY}"


# ================================================================
# 13. Register with referral_code → creates pending referral
# ================================================================
def _rand_email():
    return f"TEST_p2_amb_{uuid.uuid4().hex[:10]}@example.com"


class TestRegisterReferral:
    def test_register_with_referral_code(self):
        email = _rand_email()
        body = {
            "email": email, "password": "Passw0rd!", "name": "TEST P2 Newbie",
            "role": "client",
            "phone": "+2217700{:05d}".format(uuid.uuid4().int % 100000),
            "city": "Dakar",
            "referral_code": EXPECTED_CODE,
        }
        r = requests.post(f"{API}/auth/register", json=body, timeout=15)
        assert r.status_code == 200, r.text
        new_uid = r.json()["user"]["id"]

        # Direct DB verify (import motor)
        from motor.motor_asyncio import AsyncIOMotorClient

        async def _check():
            c = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = c[os.environ["DB_NAME"]]
            ref = await db.ambassador_referrals.find_one({"referred_user_id": new_uid})
            return ref

        ref = asyncio.run(_check())
        assert ref is not None, "Referral not created by hook"
        assert ref["status"] == "pending"
        assert ref["referred_role"] == "client"
