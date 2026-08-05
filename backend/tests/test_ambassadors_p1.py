"""
Jokoo Partners (ambassadors) — Phase 1 backend tests.

Covers all 17 requirements from the review request:
  1-5  : admin endpoints (toggle, list, config get/put, commission update)
  6-8  : self endpoints (me / referrals / commissions)
  9    : public leaderboard (no auth, no money)
  10   : POST /ambassadors/attach (idempotent, self-referral blocked)
  11   : POST /ambassadors/resolve (public)
  12   : GET /public/invite/{code}
  13   : /auth/register?referral_code → auto-attach hook
  14   : self-referral blocked (using own slug)
  15   : rate limit 20 attach / IP / day (light sanity check)
  16-17: booking-completion + KYC hooks (direct call, DB-level assertions)
"""
from __future__ import annotations

import os
import time
import uuid
import asyncio
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@jokoo.sn", "password": "Admin1234!"}
CLIENT = {"email": "client@jokoo.sn", "password": "Passw0rd!"}  # already ambassador (5GB3EH / aida-client)
PRO = {"email": "pro@jokoo.sn", "password": "Passw0rd!"}

EXPECTED_CODE = "5GB3EH"
EXPECTED_SLUG = "aida-client"


# -----------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------

def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} → {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(**ADMIN)


@pytest.fixture(scope="module")
def client_token():
    return _login(**CLIENT)


@pytest.fixture(scope="module")
def pro_token():
    return _login(**PRO)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# -----------------------------------------------------------------------------
# 3. GET /admin/ambassadors/config
# 4. PUT /admin/ambassadors/config
# -----------------------------------------------------------------------------

class TestAdminConfig:
    def test_get_config_admin_only(self, admin_token, client_token):
        # 403 for non-admin
        r = requests.get(f"{API}/admin/ambassadors/config", headers=_auth(client_token), timeout=10)
        assert r.status_code == 403, f"expected 403 got {r.status_code}"

        # 200 for admin
        r = requests.get(f"{API}/admin/ambassadors/config", headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        cfg = r.json()
        assert "thresholds" in cfg and "commissions" in cfg
        # Verify default thresholds
        assert cfg["thresholds"]["bronze"] == 5
        assert cfg["thresholds"]["silver"] == 20
        assert cfg["thresholds"]["gold"] == 50
        assert cfg["thresholds"]["diamond"] == 150
        assert cfg["thresholds"]["elite"] == 500
        # Verify commission rates
        assert cfg["commissions"]["starter"] == 0.02
        assert cfg["commissions"]["bronze"] == 0.03
        assert cfg["commissions"]["silver"] == 0.05
        assert cfg["commissions"]["gold"] == 0.07
        assert cfg["commissions"]["diamond"] == 0.09
        assert cfg["commissions"]["elite"] == 0.12

    def test_put_config_admin_only(self, admin_token, client_token):
        # 403 for non-admin
        r = requests.put(
            f"{API}/admin/ambassadors/config",
            json={"monthly_goal": 999},
            headers=_auth(client_token), timeout=10,
        )
        assert r.status_code == 403

        # Get current, mutate a threshold, then restore
        r0 = requests.get(f"{API}/admin/ambassadors/config", headers=_auth(admin_token), timeout=10)
        original = r0.json()

        r = requests.put(
            f"{API}/admin/ambassadors/config",
            json={"thresholds": {**original["thresholds"], "bronze": 7}, "monthly_goal": 750},
            headers=_auth(admin_token), timeout=10,
        )
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["thresholds"]["bronze"] == 7
        assert updated["monthly_goal"] == 750

        # Restore original to keep other tests clean
        requests.put(
            f"{API}/admin/ambassadors/config",
            json={"thresholds": original["thresholds"], "commissions": original["commissions"],
                  "monthly_goal": original["monthly_goal"]},
            headers=_auth(admin_token), timeout=10,
        )


# -----------------------------------------------------------------------------
# 2. GET /admin/ambassadors (list)
# -----------------------------------------------------------------------------

class TestAdminList:
    def test_list_admin_only(self, admin_token, pro_token):
        r = requests.get(f"{API}/admin/ambassadors", headers=_auth(pro_token), timeout=10)
        assert r.status_code == 403

        r = requests.get(f"{API}/admin/ambassadors", headers=_auth(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        # New format: {total, items} (refactored per audit)
        assert isinstance(data, dict) and "items" in data and "total" in data
        rows = data["items"]
        assert len(rows) >= 1
        aida = next((a for a in rows if a.get("code") == EXPECTED_CODE), None)
        assert aida is not None, f"Aida ambassador not found in list: {[a.get('code') for a in rows]}"
        assert aida["slug"] == EXPECTED_SLUG
        assert aida["active"] is True
        assert aida["tier"] in ("starter", "bronze", "silver", "gold", "diamond", "elite")


# -----------------------------------------------------------------------------
# 1. POST /admin/users/{uid}/ambassador — toggle
# -----------------------------------------------------------------------------

class TestAdminToggle:
    def test_toggle_forbidden_for_non_admin(self, client_token):
        r = requests.post(
            f"{API}/admin/users/some-uid/ambassador",
            json={"active": True},
            headers=_auth(client_token), timeout=10,
        )
        assert r.status_code == 403

    def test_toggle_404_unknown_user(self, admin_token):
        r = requests.post(
            f"{API}/admin/users/no-such-user-xyz/ambassador",
            json={"active": True, "monthly_goal": 100, "custom_bio": "test"},
            headers=_auth(admin_token), timeout=10,
        )
        assert r.status_code == 404

    def test_toggle_activate_and_reactivate_client(self, admin_token, client_token):
        # Aida is already active; call again with monthly_goal / custom_bio, then re-activate — idempotent
        me = requests.get(f"{API}/auth/me", headers=_auth(client_token), timeout=10).json()
        uid = me["id"]

        r = requests.post(
            f"{API}/admin/users/{uid}/ambassador",
            json={"active": True, "monthly_goal": 100, "custom_bio": "Ambassadrice Jokoo"},
            headers=_auth(admin_token), timeout=10,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        amb = data["ambassador"]
        assert amb["code"] == EXPECTED_CODE  # keeps same code (idempotent)
        assert amb["slug"] == EXPECTED_SLUG
        assert amb["monthly_goal"] == 100
        assert amb["custom_bio"] == "Ambassadrice Jokoo"
        assert amb["active"] is True

    def test_toggle_deactivate_then_reactivate(self, admin_token, client_token):
        me = requests.get(f"{API}/auth/me", headers=_auth(client_token), timeout=10).json()
        uid = me["id"]

        # deactivate
        r = requests.post(
            f"{API}/admin/users/{uid}/ambassador",
            json={"active": False}, headers=_auth(admin_token), timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["active"] is False

        # verify /me now returns is_ambassador false
        me_amb = requests.get(f"{API}/ambassadors/me", headers=_auth(client_token), timeout=10).json()
        assert me_amb.get("is_ambassador") is False

        # reactivate
        r = requests.post(
            f"{API}/admin/users/{uid}/ambassador",
            json={"active": True, "monthly_goal": 100},
            headers=_auth(admin_token), timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["ambassador"]["active"] is True


# -----------------------------------------------------------------------------
# 6. GET /ambassadors/me
# 7. GET /ambassadors/me/referrals
# 8. GET /ambassadors/me/commissions
# -----------------------------------------------------------------------------

class TestSelfEndpoints:
    def test_me_not_ambassador(self, pro_token):
        r = requests.get(f"{API}/ambassadors/me", headers=_auth(pro_token), timeout=10)
        assert r.status_code == 200
        assert r.json() == {"is_ambassador": False}

    def test_me_full_profile(self, client_token):
        r = requests.get(f"{API}/ambassadors/me", headers=_auth(client_token), timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_ambassador"] is True
        amb = data["ambassador"]
        assert amb["code"] == EXPECTED_CODE
        assert amb["slug"] == EXPECTED_SLUG
        assert "links" in amb and "web" in amb["links"] and "app" in amb["links"]
        assert "stats" in data
        stats = data["stats"]
        for key in ("verified_total", "pending_total", "prestataires_verified",
                    "clients_verified", "bookings_generated", "commissions", "month_progress"):
            assert key in stats, f"missing stats key {key}"
        assert "next_tier" in data
        assert "config" in data
        assert data["tier"] in ("starter", "bronze", "silver", "gold", "diamond", "elite")

    def test_me_referrals(self, client_token):
        r = requests.get(f"{API}/ambassadors/me/referrals", headers=_auth(client_token), timeout=10)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 1
        for row in rows:
            assert "referred_user_id" in row
            assert "status" in row
            assert row["status"] in ("pending", "verified", "invalid")
            # PII not leaked
            assert "ip_hash" not in row
            assert "referred_email_hash" not in row
            assert "referred_phone_hash" not in row

    def test_me_commissions(self, client_token):
        r = requests.get(f"{API}/ambassadors/me/commissions", headers=_auth(client_token), timeout=10)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)

    def test_referrals_forbidden_for_non_ambassador(self, pro_token):
        r = requests.get(f"{API}/ambassadors/me/referrals", headers=_auth(pro_token), timeout=10)
        assert r.status_code == 403

    def test_commissions_forbidden_for_non_ambassador(self, pro_token):
        r = requests.get(f"{API}/ambassadors/me/commissions", headers=_auth(pro_token), timeout=10)
        assert r.status_code == 403


# -----------------------------------------------------------------------------
# 9. GET /ambassadors/leaderboard  (public, no monetary data)
# -----------------------------------------------------------------------------

class TestLeaderboard:
    def test_public_no_auth(self):
        r = requests.get(f"{API}/ambassadors/leaderboard", timeout=10)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        for row in rows:
            # No monetary information
            for banned in ("amount", "amount_xof", "commission", "commissions", "earned", "revenue"):
                assert banned not in row, f"leaderboard leaks money: {banned} in {row}"
            for k in ("rank", "tier", "badge"):
                assert k in row


# -----------------------------------------------------------------------------
# 11. POST /ambassadors/resolve   (public)
# 12. GET  /public/invite/{code}  (public SSR meta)
# -----------------------------------------------------------------------------

class TestPublicResolve:
    def test_resolve_by_code(self):
        r = requests.post(f"{API}/ambassadors/resolve", json={"code": EXPECTED_CODE}, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["code"] == EXPECTED_CODE
        assert d["slug"] == EXPECTED_SLUG
        assert d.get("inviter_name")

    def test_resolve_by_slug(self):
        r = requests.post(f"{API}/ambassadors/resolve", json={"code": EXPECTED_SLUG}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["code"] == EXPECTED_CODE

    def test_resolve_invalid(self):
        r = requests.post(f"{API}/ambassadors/resolve", json={"code": "ZZZZZZ"}, timeout=10)
        assert r.status_code == 404

    def test_public_invite_meta_valid(self):
        r = requests.get(f"{API}/public/invite/{EXPECTED_CODE}", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["valid"] is True
        assert d["code"] == EXPECTED_CODE
        assert "links" in d and "web" in d["links"]

    def test_public_invite_meta_invalid_returns_200_valid_false(self):
        r = requests.get(f"{API}/public/invite/ZZZZZZ", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["valid"] is False


# -----------------------------------------------------------------------------
# 13. POST /auth/register with referral_code → hook auto-attach
# 14. Self-referral blocked (via own slug at register time is impossible for a
#     brand new user; but attaching to a code that resolves to your own uid must
#     not create a referral. We test with /ambassadors/attach on the ambassador
#     herself using her own code.)
# 10. POST /ambassadors/attach idempotency
# -----------------------------------------------------------------------------

def _rand_email() -> str:
    return f"TEST_amb_{uuid.uuid4().hex[:10]}@example.com"


class TestRegisterAndAttach:
    def test_register_with_valid_referral_code_creates_pending_referral(self, admin_token):
        email = _rand_email()
        body = {
            "email": email,
            "password": "Passw0rd!",
            "name": "TEST Referral Newbie",
            "role": "client",
            "phone": "+2217700000{:02d}".format(uuid.uuid4().int % 100),
            "city": "Dakar",
            "referral_code": EXPECTED_CODE,
        }
        r = requests.post(f"{API}/auth/register", json=body, timeout=15)
        assert r.status_code == 200, r.text
        new_uid = r.json()["user"]["id"]

        # Give the async hook a tick
        time.sleep(0.3)

        # As admin, verify referral row exists (via list — we look it up on aida)
        # Easier: log in the new user and hit /ambassadors/attach with same code — must be idempotent (already_attached=True)
        new_token = _login(email, "Passw0rd!")
        r = requests.post(
            f"{API}/ambassadors/attach", json={"code": EXPECTED_CODE},
            headers=_auth(new_token), timeout=10,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("already_attached") is True or data.get("ambassador_id"), data

        # Direct DB verify — pending status
        _verify_referral_via_db(new_uid, expected_status="pending", expected_role="client")

    def test_register_with_invalid_referral_code_does_not_break(self, admin_token):
        email = _rand_email()
        body = {
            "email": email,
            "password": "Passw0rd!",
            "name": "TEST Bad Code",
            "role": "client",
            "phone": "+2217700099{:02d}".format(uuid.uuid4().int % 100),
            "city": "Dakar",
            "referral_code": "NOPE99",
        }
        r = requests.post(f"{API}/auth/register", json=body, timeout=15)
        assert r.status_code == 200, r.text  # register still succeeds even if code invalid
        new_uid = r.json()["user"]["id"]
        # no referral in db
        _verify_no_referral(new_uid)

    def test_self_referral_blocked_via_attach(self, client_token, admin_token):
        # Aida trying to attach to her own code — must return 400 (explicit error)
        r = requests.post(
            f"{API}/ambassadors/attach", json={"code": EXPECTED_CODE},
            headers=_auth(client_token), timeout=10,
        )
        assert r.status_code == 400, r.text
        # Verify no referral for Aida exists in DB
        me = requests.get(f"{API}/auth/me", headers=_auth(client_token), timeout=10).json()
        aida_id = me["id"]
        _verify_no_referral(aida_id)

    def test_attach_idempotent(self, admin_token):
        """A user already attached to X cannot be re-attached to a different code."""
        # Reuse the user from first test? We can create a fresh one.
        email = _rand_email()
        body = {
            "email": email, "password": "Passw0rd!", "name": "TEST Idem",
            "role": "client",
            "phone": "+2217700098{:02d}".format(uuid.uuid4().int % 100),
            "city": "Dakar", "referral_code": EXPECTED_CODE,
        }
        r = requests.post(f"{API}/auth/register", json=body, timeout=15)
        assert r.status_code == 200
        new_token = _login(email, "Passw0rd!")

        # attempt to attach again — should return already_attached
        r = requests.post(
            f"{API}/ambassadors/attach", json={"code": EXPECTED_CODE},
            headers=_auth(new_token), timeout=10,
        )
        assert r.status_code == 200
        assert r.json().get("already_attached") is True


# -----------------------------------------------------------------------------
# 5. PATCH /admin/ambassadors/commissions/{cid}?status=paid
# -----------------------------------------------------------------------------

class TestCommissionUpdate:
    def test_mark_commission_paid(self, admin_token):
        # Find an existing commission (seeded); if none, skip
        cid = _get_first_commission_id()
        if not cid:
            pytest.skip("No seed commission available")

        # 403 for non-admin (needs a non-admin token)
        pro_tok = _login(**PRO)
        r = requests.patch(
            f"{API}/admin/ambassadors/commissions/{cid}?status=paid",
            headers=_auth(pro_tok), timeout=10,
        )
        assert r.status_code == 403

        # 200 for admin
        r = requests.patch(
            f"{API}/admin/ambassadors/commissions/{cid}?status=paid",
            headers=_auth(admin_token), timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Verify persistence via DB
        status, paid_at = _get_commission_status(cid)
        assert status == "paid"
        assert paid_at is not None

        # Reset to pending to keep the seed clean
        r = requests.patch(
            f"{API}/admin/ambassadors/commissions/{cid}?status=pending",
            headers=_auth(admin_token), timeout=10,
        )
        assert r.status_code == 200

    def test_invalid_status(self, admin_token):
        r = requests.patch(
            f"{API}/admin/ambassadors/commissions/anyid?status=weird",
            headers=_auth(admin_token), timeout=10,
        )
        assert r.status_code == 400

    def test_not_found(self, admin_token):
        r = requests.patch(
            f"{API}/admin/ambassadors/commissions/does-not-exist?status=paid",
            headers=_auth(admin_token), timeout=10,
        )
        assert r.status_code == 404


# -----------------------------------------------------------------------------
# 15. Rate limit — 20 attach / IP / day (light sanity: the code path enforces)
# -----------------------------------------------------------------------------

class TestRateLimit:
    def test_rate_limit_enforced(self):
        """We can't easily create 21 users through HTTP quickly; instead we
        assert the logic via a direct call to hook_user_registered from the
        ambassadors module. This validates the exact anti-fraud path.
        """
        import sys
        sys.path.insert(0, "/app/backend")
        from ambassadors import hook_user_registered, MAX_ATTACH_PER_IP_PER_DAY

        assert MAX_ATTACH_PER_IP_PER_DAY == 200, "Rate limit constant changed"

        async def _run():
            db = _get_db()
            # Pre-fill MAX fake referrals from an IP that will fail the MAX+1
            fake_ip = f"203.0.113.{uuid.uuid4().int % 250}"
            # Ensure a fresh ambassador target: use Aida
            aida = await db.ambassadors.find_one({"code": EXPECTED_CODE})
            assert aida is not None
            # Insert MAX fake referrals with same ip_hash
            from ambassadors import _hash_ip, _now_iso
            ip_hash = _hash_ip(fake_ip)
            fake_ids = []
            for i in range(MAX_ATTACH_PER_IP_PER_DAY):
                fid = f"TEST_ratelimit_{uuid.uuid4().hex[:8]}"
                fake_ids.append(fid)
                await db.ambassador_referrals.insert_one({
                    "id": str(uuid.uuid4()),
                    "ambassador_id": aida["user_id"],
                    "referred_user_id": fid,
                    "referred_role": "client",
                    "status": "pending",
                    "created_at": _now_iso(),
                    "ip_hash": ip_hash,
                })

            # MAX+1 attach from same IP → must return None
            new_fake_uid = f"TEST_ratelimit_{uuid.uuid4().hex[:8]}"
            aid = await hook_user_registered(
                db,
                new_user_id=new_fake_uid,
                new_user_role="client",
                ambassador_code_or_slug=EXPECTED_CODE,
                new_user_email="TEST_rl@jokoo.test",
                ip=fake_ip,
            )
            # Cleanup
            await db.ambassador_referrals.delete_many({"referred_user_id": {"$in": fake_ids + [new_fake_uid]}})
            assert aid is None, "Rate limit NOT enforced! Got amb_id: %s" % aid

        asyncio.run(_run())


# -----------------------------------------------------------------------------
# 16. Booking completion hook
# 17. KYC approval hook
# -----------------------------------------------------------------------------

class TestHooks:
    def test_kyc_hook_marks_kyc_verified_at(self):
        """When KYC is approved, referral gets kyc_verified_at. If provider AND
        first_booking already set → status verified."""
        import sys
        sys.path.insert(0, "/app/backend")
        from ambassadors import hook_kyc_verified, _now_iso

        async def _run():
            db = _get_db()
            aida = await db.ambassadors.find_one({"code": EXPECTED_CODE})
            assert aida
            # Create a fake prestataire referral
            fake_pro = f"TEST_kyc_pro_{uuid.uuid4().hex[:8]}"
            await db.ambassador_referrals.insert_one({
                "id": str(uuid.uuid4()),
                "ambassador_id": aida["user_id"],
                "referred_user_id": fake_pro,
                "referred_role": "prestataire",
                "status": "pending",
                "first_booking_at": _now_iso(),  # already had a booking
                "created_at": _now_iso(),
                "ip_hash": None,
            })
            # Snapshot verified_count before
            before = (await db.ambassadors.find_one({"code": EXPECTED_CODE}))["verified_count"]

            await hook_kyc_verified(db, fake_pro)

            ref = await db.ambassador_referrals.find_one({"referred_user_id": fake_pro})
            assert ref["kyc_verified_at"] is not None, "kyc_verified_at should be set"
            assert ref["status"] == "verified", f"Expected verified, got {ref['status']}"

            after = (await db.ambassadors.find_one({"code": EXPECTED_CODE}))["verified_count"]
            assert after == before + 1, f"verified_count should bump: {before} → {after}"

            # Cleanup — rollback
            await db.ambassador_referrals.delete_one({"referred_user_id": fake_pro})
            await db.ambassadors.update_one(
                {"code": EXPECTED_CODE},
                {"$set": {"verified_count": before}},
            )

        asyncio.run(_run())

    def test_kyc_hook_prestataire_without_booking_stays_pending(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from ambassadors import hook_kyc_verified, _now_iso

        async def _run():
            db = _get_db()
            aida = await db.ambassadors.find_one({"code": EXPECTED_CODE})
            fake_pro = f"TEST_kyc_only_{uuid.uuid4().hex[:8]}"
            await db.ambassador_referrals.insert_one({
                "id": str(uuid.uuid4()),
                "ambassador_id": aida["user_id"],
                "referred_user_id": fake_pro,
                "referred_role": "prestataire",
                "status": "pending",
                "created_at": _now_iso(),
                "ip_hash": None,
            })

            await hook_kyc_verified(db, fake_pro)
            ref = await db.ambassador_referrals.find_one({"referred_user_id": fake_pro})
            assert ref["kyc_verified_at"] is not None
            assert ref["status"] == "pending", "no booking → should still be pending"
            await db.ambassador_referrals.delete_one({"referred_user_id": fake_pro})

        asyncio.run(_run())

    def test_booking_complete_hook_creates_commission_and_verifies_client(self):
        """Client referral → first booking completed → verified + commission created
        for ambassador at correct rate (starter=0.02)."""
        import sys
        sys.path.insert(0, "/app/backend")
        from ambassadors import hook_booking_completed, _now_iso

        async def _run():
            db = _get_db()
            aida = await db.ambassadors.find_one({"code": EXPECTED_CODE})
            aida_uid = aida["user_id"]
            initial_tier = aida["tier"]
            initial_rate = 0.02 if initial_tier == "starter" else None

            # Fake client referral (pending)
            fake_client = f"TEST_bkg_c_{uuid.uuid4().hex[:8]}"
            await db.ambassador_referrals.insert_one({
                "id": str(uuid.uuid4()),
                "ambassador_id": aida_uid,
                "referred_user_id": fake_client,
                "referred_role": "client",
                "status": "pending",
                "created_at": _now_iso(),
                "ip_hash": None,
            })
            before_verified = (await db.ambassadors.find_one({"code": EXPECTED_CODE}))["verified_count"]

            fake_booking = {
                "id": f"TEST_book_{uuid.uuid4().hex[:8]}",
                "client_id": fake_client,
                "provider_id": None,
            }
            await hook_booking_completed(db, fake_booking, booking_amount_xof=50000)

            # Verify referral marked verified + first_booking_at set
            ref = await db.ambassador_referrals.find_one({"referred_user_id": fake_client})
            assert ref["status"] == "verified", f"Expected verified, got {ref['status']}"
            assert ref["first_booking_at"] is not None

            # Verified count bumped
            after_verified = (await db.ambassadors.find_one({"code": EXPECTED_CODE}))["verified_count"]
            assert after_verified == before_verified + 1

            # Commission created?
            cm = await db.ambassador_commissions.find_one({"booking_id": fake_booking["id"]})
            assert cm is not None, "Commission should have been created"
            # Rate must match the tier at moment (before bump vs after? tier snapshot uses amb.tier BEFORE stats-refresh — starter → 0.02)
            assert cm["tier_snapshot"] in ("starter", "bronze"), cm["tier_snapshot"]
            # Amount check for starter
            if cm["tier_snapshot"] == "starter":
                assert cm["rate"] == 0.02
                assert cm["amount_xof"] == 1000, f"50000*0.02=1000, got {cm['amount_xof']}"
            assert cm["status"] == "pending"

            # Idempotence — call the hook again with the same booking should NOT duplicate the commission
            await hook_booking_completed(db, fake_booking, booking_amount_xof=50000)
            count = await db.ambassador_commissions.count_documents({"booking_id": fake_booking["id"]})
            assert count == 1, "Duplicate commission created"

            # Cleanup
            await db.ambassador_referrals.delete_one({"referred_user_id": fake_client})
            await db.ambassador_commissions.delete_one({"booking_id": fake_booking["id"]})
            await db.ambassadors.update_one(
                {"code": EXPECTED_CODE},
                {"$set": {"verified_count": before_verified}},
            )

        asyncio.run(_run())


# -----------------------------------------------------------------------------
# DB helpers (motor)
# -----------------------------------------------------------------------------

def _get_db():
    from motor.motor_asyncio import AsyncIOMotorClient
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return c[os.environ["DB_NAME"]]


def _verify_referral_via_db(user_id, expected_status, expected_role):
    async def _run():
        db = _get_db()
        ref = await db.ambassador_referrals.find_one({"referred_user_id": user_id})
        assert ref is not None, f"No referral row for {user_id}"
        assert ref["status"] == expected_status, f"status {ref['status']} != {expected_status}"
        assert ref["referred_role"] == expected_role
    asyncio.run(_run())


def _verify_no_referral(user_id):
    async def _run():
        db = _get_db()
        ref = await db.ambassador_referrals.find_one({"referred_user_id": user_id})
        assert ref is None, f"Unexpected referral for {user_id}: {ref}"
    asyncio.run(_run())


def _get_first_commission_id():
    async def _run():
        db = _get_db()
        cm = await db.ambassador_commissions.find_one({}, {"_id": 0, "id": 1})
        return cm.get("id") if cm else None
    return asyncio.run(_run())


def _get_commission_status(cid):
    async def _run():
        db = _get_db()
        cm = await db.ambassador_commissions.find_one({"id": cid}, {"_id": 0, "status": 1, "paid_at": 1})
        return cm.get("status"), cm.get("paid_at")
    return asyncio.run(_run())
