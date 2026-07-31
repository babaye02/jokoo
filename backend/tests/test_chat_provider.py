"""Regression tests for chat with providers (bug: 404 on send to seeded providers)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://jokoo-mobile-dev.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@jokoo.sn"
ADMIN_PASSWORD = "Admin1234!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data, f"no token field in login response: {list(data.keys())}"
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def a_provider(auth_headers):
    r = requests.get(f"{API}/providers", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    provs = r.json()
    assert isinstance(provs, list) and len(provs) > 0, "no providers seeded"
    return provs[0]


# ---- chat send: previously always 404, must now be 200 ----
def test_send_message_to_seeded_provider_returns_200(auth_headers, a_provider):
    pid = a_provider["id"]
    r = requests.post(
        f"{API}/chat/{pid}/messages",
        headers=auth_headers,
        json={"text": "Bonjour test", "kind": "text"},
        timeout=15,
    )
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
    body = r.json()
    # to_name enriched from providers
    assert body.get("to_name") == a_provider.get("name"), body
    assert body.get("to_id") == pid
    assert body.get("conv_id"), "conv_id missing"
    assert body.get("text") == "Bonjour test"
    assert body.get("kind") == "text"
    assert body.get("read") is False


def test_conversations_lists_provider_with_enriched_name(auth_headers, a_provider):
    r = requests.get(f"{API}/chat/conversations", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    convs = r.json()
    match = next((c for c in convs if c["peer_id"] == a_provider["id"]), None)
    assert match is not None, f"conversation for provider {a_provider['id']} not listed"
    assert match["peer_name"] == a_provider.get("name"), match
    assert match["peer_role"] == "prestataire", match
    # peer_avatar might be None if provider has no photo, so just check key exists
    assert "peer_avatar" in match


def test_get_messages_returns_to_name(auth_headers, a_provider):
    pid = a_provider["id"]
    r = requests.get(f"{API}/chat/{pid}/messages", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    msgs = r.json()
    assert isinstance(msgs, list)
    assert len(msgs) >= 1
    latest = msgs[-1]
    assert latest.get("to_name") == a_provider.get("name"), latest


# ---- validation ----
def test_send_empty_text_returns_400(auth_headers, a_provider):
    pid = a_provider["id"]
    r = requests.post(
        f"{API}/chat/{pid}/messages",
        headers=auth_headers,
        json={"text": "   ", "kind": "text"},
        timeout=15,
    )
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"


def test_send_to_nonexistent_peer_returns_404(auth_headers):
    r = requests.post(
        f"{API}/chat/fake-uuid-nonexistent/messages",
        headers=auth_headers,
        json={"text": "hello", "kind": "text"},
        timeout=15,
    )
    assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"


def test_send_without_auth_returns_401(a_provider):
    r = requests.post(
        f"{API}/chat/{a_provider['id']}/messages",
        json={"text": "hello", "kind": "text"},
        timeout=15,
    )
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"
