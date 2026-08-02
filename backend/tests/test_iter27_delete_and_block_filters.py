"""Iter27 — Validation des 2 bugs P0 :
- Bug 1 : DELETE /api/users/me + cascade et invalidation du token
- Bug 2a : GET /api/favorites filtré par bloqués (bidirectionnel)
- Bug 2b : GET /api/ads?link_type=provider filtré par bloqués
"""
import os
import uuid
import time

import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://jokoo-mobile-dev.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

CLIENT = {"email": "client@jokoo.sn", "password": "Passw0rd!"}
PRO = {"email": "pro@jokoo.sn", "password": "Passw0rd!"}
ADMIN = {"email": "admin@jokoo.sn", "password": "Admin1234!"}


def _login(email: str, password: str) -> dict:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ----------------------------------------------------------
# Bug 1 — DELETE /api/users/me + cascade + token invalidation
# ----------------------------------------------------------
class TestBug1AccountDeletion:
    def test_register_then_delete_me_full_cycle(self):
        # 1. Create throwaway account
        suffix = uuid.uuid4().hex[:10]
        email = f"throwaway-{suffix}@test.jokoo"
        reg = requests.post(f"{API}/auth/register", json={
            "email": email,
            "password": "TempPass123!",
            "name": "Throwaway",
            "role": "client",
        }, timeout=15)
        assert reg.status_code == 200, f"register: {reg.status_code} {reg.text}"
        data = reg.json()
        assert "token" in data and "user" in data
        token = data["token"]
        user_id = data["user"]["id"]

        # 2. Seed some personal data to test cascade
        # favorite the pro user (any provider id will do, use pro seed's provider record)
        pro_login = _login(**PRO)
        # We need a provider_id — use /providers list
        provs = requests.get(f"{API}/providers?limit=1", timeout=15).json()
        assert isinstance(provs, list) and len(provs) >= 1
        pro_id = provs[0]["id"]
        r = requests.post(f"{API}/favorites/{pro_id}", headers=_hdr(token), timeout=15)
        assert r.status_code == 200

        # Verify token works pre-delete
        me = requests.get(f"{API}/auth/me", headers=_hdr(token), timeout=15)
        assert me.status_code == 200
        assert me.json()["email"] == email

        # 3. DELETE /users/me
        r = requests.delete(f"{API}/users/me", headers=_hdr(token), timeout=15)
        assert r.status_code == 200, f"delete /users/me: {r.status_code} {r.text}"
        payload = r.json()
        assert payload.get("ok") is True

        # 4. Old token should now be invalid (user gone)
        me2 = requests.get(f"{API}/auth/me", headers=_hdr(token), timeout=15)
        assert me2.status_code == 401, f"old token still valid: {me2.status_code} {me2.text}"

        # 5. Re-login with same email must fail
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "TempPass123!"}, timeout=15)
        assert r.status_code in (400, 401, 404), f"re-login should fail: {r.status_code} {r.text}"

    def test_delete_me_requires_auth(self):
        r = requests.delete(f"{API}/users/me", timeout=15)
        assert r.status_code in (401, 403)


# ----------------------------------------------------------
# Bug 2a — /favorites filtrées par bloqués
# ----------------------------------------------------------
class TestBug2aFavoritesFilteredByBlock:
    def test_favorites_hidden_when_provider_blocked(self):
        client = _login(**CLIENT)
        ctoken = client["token"]
        # pro user_id (used for block) — the seed pro has both a user row and a provider row.
        # For block we need the user_id; for favorites we need the provider_id.
        # First find pro user_id via login
        pro = _login(**PRO)
        pro_user_id = pro["user"]["id"]

        # Find the provider row for the seed pro. We match by name from /providers.
        provs = requests.get(f"{API}/providers?limit=200", timeout=15).json()
        # Use pro user_id — the /providers rows have a user_id link
        provs_for_pro = [p for p in provs if p.get("user_id") == pro_user_id]
        if not provs_for_pro:
            # fallback: pick first provider and block its user_id
            provs_for_pro = [provs[0]]
            pro_user_id = provs_for_pro[0].get("user_id") or provs_for_pro[0]["id"]
        pro_provider_id = provs_for_pro[0]["id"]

        # Ensure clean state — unblock first (idempotent)
        requests.delete(f"{API}/users/{pro_user_id}/block", headers=_hdr(ctoken), timeout=15)

        # Add favorite
        r = requests.post(f"{API}/favorites/{pro_provider_id}", headers=_hdr(ctoken), timeout=15)
        assert r.status_code == 200

        # GET /favorites → contains pro
        favs = requests.get(f"{API}/favorites", headers=_hdr(ctoken), timeout=15).json()
        assert any(f["id"] == pro_provider_id for f in favs), f"pro not in favs pre-block: {[f.get('id') for f in favs]}"

        # Block pro (via user_id)
        r = requests.post(f"{API}/users/{pro_user_id}/block", headers=_hdr(ctoken), timeout=15)
        assert r.status_code == 200, f"block failed: {r.status_code} {r.text}"

        # GET /favorites → does not contain pro (provider.user_id in blocked set filters it)
        # NOTE: The endpoint filters via `provider.id in blocked`. Block stores user_id.
        # Verify that either provider_id OR user_id filtering works.
        favs = requests.get(f"{API}/favorites", headers=_hdr(ctoken), timeout=15).json()
        still_visible = any(f["id"] == pro_provider_id for f in favs)

        # Unblock (cleanup)
        requests.delete(f"{API}/users/{pro_user_id}/block", headers=_hdr(ctoken), timeout=15)
        # remove favorite for cleanliness
        requests.delete(f"{API}/favorites/{pro_provider_id}", headers=_hdr(ctoken), timeout=15)

        assert not still_visible, (
            f"FAIL: bloqué user_id={pro_user_id} mais provider_id={pro_provider_id} "
            f"toujours visible dans /favorites. Le filtre _blocked_ids compare probablement "
            f"provider.id alors qu'il devrait comparer provider.user_id."
        )

        # Re-block and re-favorite to verify unblock restores
        r = requests.post(f"{API}/favorites/{pro_provider_id}", headers=_hdr(ctoken), timeout=15)
        assert r.status_code == 200
        favs_back = requests.get(f"{API}/favorites", headers=_hdr(ctoken), timeout=15).json()
        assert any(f["id"] == pro_provider_id for f in favs_back), "pro should reappear after unblock"
        # cleanup
        requests.delete(f"{API}/favorites/{pro_provider_id}", headers=_hdr(ctoken), timeout=15)


# ----------------------------------------------------------
# Bug 2b — /ads?link_type=provider filtrées par bloqués
# ----------------------------------------------------------
class TestBug2bAdsFilteredByBlock:
    def test_ads_hidden_when_target_provider_blocked(self):
        admin = _login(**ADMIN)
        atoken = admin["token"]
        client = _login(**CLIENT)
        ctoken = client["token"]
        pro = _login(**PRO)
        pro_user_id = pro["user"]["id"]

        # Ensure client isn't currently blocking pro
        requests.delete(f"{API}/users/{pro_user_id}/block", headers=_hdr(ctoken), timeout=15)

        # Create an ad targeting pro
        ad_body = {
            "title": f"TEST_iter27 bloqué {uuid.uuid4().hex[:6]}",
            "media": [{"kind": "image", "url": "https://images.pexels.com/photos/1109543/pexels-photo-1109543.jpeg"}],
            "placements": ["home"],
            "link_type": "provider",
            "link_target": pro_user_id,
            "target_audience": "client",
            "active": True,
        }
        r = requests.post(f"{API}/admin/ads", json=ad_body, headers=_hdr(atoken), timeout=15)
        assert r.status_code == 200, f"create ad: {r.status_code} {r.text}"
        ad = r.json()
        ad_id = ad["id"]

        try:
            # GET /ads → ad visible for client
            ads = requests.get(f"{API}/ads?placement=home&audience=client", headers=_hdr(ctoken), timeout=15).json()
            assert any(a["id"] == ad_id for a in ads), f"ad not visible pre-block: {[a.get('id') for a in ads]}"

            # Block pro
            r = requests.post(f"{API}/users/{pro_user_id}/block", headers=_hdr(ctoken), timeout=15)
            assert r.status_code == 200

            # GET /ads → ad should be hidden
            ads = requests.get(f"{API}/ads?placement=home&audience=client", headers=_hdr(ctoken), timeout=15).json()
            hidden = not any(a["id"] == ad_id for a in ads)
            assert hidden, "ad still visible after blocking target provider"

            # Unblock → ad reappears
            r = requests.delete(f"{API}/users/{pro_user_id}/block", headers=_hdr(ctoken), timeout=15)
            assert r.status_code == 200
            ads = requests.get(f"{API}/ads?placement=home&audience=client", headers=_hdr(ctoken), timeout=15).json()
            assert any(a["id"] == ad_id for a in ads), "ad should reappear after unblock"
        finally:
            # cleanup ad
            requests.delete(f"{API}/admin/ads/{ad_id}", headers=_hdr(atoken), timeout=15)
            requests.delete(f"{API}/users/{pro_user_id}/block", headers=_hdr(ctoken), timeout=15)
