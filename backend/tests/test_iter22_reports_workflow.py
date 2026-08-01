"""Iter22 backend tests — reports workflow with reporter confirmation.

Coverage:
 1. Create report as client
 2. Support -> awaiting_reporter_confirm -> notif to client author
 3. GET /admin/reports hydrated with author_phone/author_email/target_name/target_phone
 4. Reporter confirms resolved=True -> status resolved + history + notif to support (report_confirmed)
 5. Rebond : resolved=False -> status back to open + notif support (report_reopened)
 6. Security 403 : non-author cannot confirm
 7. 400 if report not in awaiting_reporter_confirm
 8. 400 if invalid status in PATCH
 9. Regression: open -> investigating -> resolved chain still works
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://jokoo-mobile-dev.preview.emergentagent.com",
).rstrip("/")

CLIENT_EMAIL = "client@jokoo.sn"
CLIENT_PWD = "Passw0rd!"
PROVIDER_EMAIL = "pro@jokoo.sn"
PROVIDER_PWD = "Passw0rd!"
SUPPORT_EMAIL = "support@jokoo.sn"
SUPPORT_PWD = "Staff1234!"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def _me(t: str) -> dict:
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(t), timeout=15)
    assert r.status_code == 200, f"/auth/me failed: {r.status_code} {r.text}"
    return r.json()


# ---------- shared fixtures ----------
@pytest.fixture(scope="module")
def client_token():
    return _login(CLIENT_EMAIL, CLIENT_PWD)


@pytest.fixture(scope="module")
def provider_token():
    return _login(PROVIDER_EMAIL, PROVIDER_PWD)


@pytest.fixture(scope="module")
def support_token():
    return _login(SUPPORT_EMAIL, SUPPORT_PWD)


@pytest.fixture(scope="module")
def client_id(client_token):
    return _me(client_token)["id"]


@pytest.fixture(scope="module")
def provider_id(provider_token):
    return _me(provider_token)["id"]


# ---------- helpers ----------
def _create_report(client_token: str, target_id: str, reason: str = "TEST_iter22 workflow"):
    r = requests.post(
        f"{BASE_URL}/api/reports",
        headers=_auth(client_token),
        json={"target_id": target_id, "target_type": "user", "reason": reason},
        timeout=15,
    )
    assert r.status_code == 200, f"create report failed: {r.status_code} {r.text}"
    return r.json()


def _patch_admin(support_token: str, rid: str, payload: dict, expected: int = 200):
    r = requests.patch(
        f"{BASE_URL}/api/admin/reports/{rid}",
        headers=_auth(support_token),
        json=payload,
        timeout=15,
    )
    assert r.status_code == expected, f"PATCH admin/reports expected {expected} got {r.status_code} {r.text}"
    return r.json() if r.status_code == 200 else r


# ---------- 1. create report ----------
class TestCreateReport:
    def test_client_creates_report(self, client_token, provider_id):
        rep = _create_report(client_token, provider_id, "TEST_iter22 création")
        assert rep["status"] == "open"
        assert rep["target_id"] == provider_id
        assert rep["target_type"] == "user"
        assert rep["author_id"]
        assert isinstance(rep.get("history"), list) and len(rep["history"]) >= 1
        assert rep["history"][0]["action"] == "created"


# ---------- 2. support -> awaiting + notif client ----------
class TestAwaitingConfirmFlow:
    def test_status_awaiting_sends_notif_to_reporter(self, client_token, provider_id, support_token):
        rep = _create_report(client_token, provider_id, "TEST_iter22 awaiting")
        rid = rep["id"]
        marker_note = f"TEST_iter22 merci confirmer {int(time.time())}"
        updated = _patch_admin(
            support_token, rid,
            {"status": "awaiting_reporter_confirm", "note": marker_note},
        )
        assert updated["status"] == "awaiting_reporter_confirm"
        # history entry status_changed
        actions = [h.get("action") for h in updated.get("history", [])]
        assert "status_changed" in actions

        # client should now have a fresh notif of type report_awaiting_confirm
        r = requests.get(f"{BASE_URL}/api/notifications", headers=_auth(client_token), timeout=15)
        assert r.status_code == 200, r.text
        notifs = r.json()
        matches = [n for n in notifs if n.get("type") == "report_awaiting_confirm" and n.get("report_id") == rid]
        assert matches, f"No report_awaiting_confirm notif for report {rid}. Got types: {[n.get('type') for n in notifs[:10]]}"

    def test_admin_reports_hydration(self, support_token, client_token, provider_id):
        # ensure at least one exists
        _create_report(client_token, provider_id, "TEST_iter22 hydration")
        r = requests.get(f"{BASE_URL}/api/admin/reports", headers=_auth(support_token), timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        sample = items[0]
        # hydration keys should be present (values may be None if user missing but keys should appear when author found)
        assert "author_phone" in sample or "author_email" in sample, f"missing hydration keys: {list(sample.keys())}"
        # Look for a report with user target -> should have target_name
        user_target_reports = [x for x in items if x.get("target_type") == "user" and x.get("target_id")]
        if user_target_reports:
            first = user_target_reports[0]
            # target_name/target_phone should be present when target user exists
            assert "target_name" in first or "target_phone" in first, f"missing target hydration: {list(first.keys())}"


# ---------- 3+4. reporter confirms resolved=True ----------
class TestReporterConfirmsResolved:
    def test_full_resolution_confirmed_by_reporter(self, client_token, provider_id, support_token):
        rep = _create_report(client_token, provider_id, "TEST_iter22 resolve OK")
        rid = rep["id"]
        _patch_admin(support_token, rid, {"status": "awaiting_reporter_confirm", "note": "prêt à clore"})

        # Now client confirms resolved=True
        r = requests.post(
            f"{BASE_URL}/api/reports/{rid}/confirm-resolution",
            headers=_auth(client_token),
            json={"resolved": True, "note": "TEST_iter22 problème réglé"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "resolved"

        # Support GET admin/reports?status_filter=resolved contient ce report avec resolved_by_reporter=True
        r = requests.get(
            f"{BASE_URL}/api/admin/reports?status_filter=resolved",
            headers=_auth(support_token),
            timeout=15,
        )
        assert r.status_code == 200
        items = r.json()
        found = [x for x in items if x["id"] == rid]
        assert found, f"Resolved report {rid} not in filtered list"
        rep_full = found[0]
        assert rep_full.get("resolved_by_reporter") is True
        actions = [h.get("action") for h in rep_full.get("history", [])]
        assert "reporter_confirmed" in actions

        # Support notif report_confirmed
        r = requests.get(f"{BASE_URL}/api/notifications", headers=_auth(support_token), timeout=15)
        assert r.status_code == 200
        notifs = r.json()
        matches = [n for n in notifs if n.get("type") == "report_confirmed" and n.get("report_id") == rid]
        assert matches, f"Support did not receive report_confirmed notif for {rid}"


# ---------- 5. rebond : reporter rejects ----------
class TestReporterRejects:
    def test_rejected_confirmation_reopens_report(self, client_token, provider_id, support_token):
        rep = _create_report(client_token, provider_id, "TEST_iter22 rebond")
        rid = rep["id"]
        _patch_admin(support_token, rid, {"status": "awaiting_reporter_confirm", "note": "vraiment clos ?"})

        r = requests.post(
            f"{BASE_URL}/api/reports/{rid}/confirm-resolution",
            headers=_auth(client_token),
            json={"resolved": False, "note": "TEST_iter22 toujours bloqué"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "open"

        # history has reporter_rejected
        r = requests.get(f"{BASE_URL}/api/admin/reports", headers=_auth(support_token), timeout=15)
        items = r.json()
        found = [x for x in items if x["id"] == rid]
        assert found
        actions = [h.get("action") for h in found[0].get("history", [])]
        assert "reporter_rejected" in actions

        # Support notif report_reopened
        r = requests.get(f"{BASE_URL}/api/notifications", headers=_auth(support_token), timeout=15)
        notifs = r.json()
        matches = [n for n in notifs if n.get("type") == "report_reopened" and n.get("report_id") == rid]
        assert matches, f"Support did not receive report_reopened notif for {rid}"


# ---------- 6+7. security / bad state ----------
class TestSecurityAndBadStates:
    def test_non_author_cannot_confirm(self, client_token, provider_token, provider_id, support_token):
        rep = _create_report(client_token, provider_id, "TEST_iter22 sécurité")
        rid = rep["id"]
        _patch_admin(support_token, rid, {"status": "awaiting_reporter_confirm", "note": "..."})
        # provider (not author) attempts to confirm
        r = requests.post(
            f"{BASE_URL}/api/reports/{rid}/confirm-resolution",
            headers=_auth(provider_token),
            json={"resolved": True},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_confirm_when_not_awaiting_returns_400(self, client_token, provider_id):
        rep = _create_report(client_token, provider_id, "TEST_iter22 wrong state")
        rid = rep["id"]  # still open
        r = requests.post(
            f"{BASE_URL}/api/reports/{rid}/confirm-resolution",
            headers=_auth(client_token),
            json={"resolved": True},
            timeout=15,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"

    def test_invalid_status_in_patch(self, client_token, provider_id, support_token):
        rep = _create_report(client_token, provider_id, "TEST_iter22 invalid status")
        rid = rep["id"]
        r = requests.patch(
            f"{BASE_URL}/api/admin/reports/{rid}",
            headers=_auth(support_token),
            json={"status": "foo"},
            timeout=15,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"


# ---------- 9. regression : direct resolve flow ----------
class TestDirectResolveRegression:
    def test_open_investigating_resolved_chain(self, client_token, provider_id, support_token):
        rep = _create_report(client_token, provider_id, "TEST_iter22 direct resolve")
        rid = rep["id"]
        r1 = _patch_admin(support_token, rid, {"status": "investigating", "note": "en cours"})
        assert r1["status"] == "investigating"
        r2 = _patch_admin(support_token, rid, {"status": "resolved", "note": "clos"})
        assert r2["status"] == "resolved"
        assert r2.get("resolved_by")
        assert r2.get("resolved_at")


# ---------- 12. regression : logins ----------
class TestLoginRegression:
    def test_client_login(self):
        assert _login(CLIENT_EMAIL, CLIENT_PWD)

    def test_provider_login(self):
        assert _login(PROVIDER_EMAIL, PROVIDER_PWD)

    def test_support_login(self):
        assert _login(SUPPORT_EMAIL, SUPPORT_PWD)
