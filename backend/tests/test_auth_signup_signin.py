"""Tests for the sign-up-is-sign-in flow and seeded Pro user AI access."""

import time
import pytest
import requests

BASE_URL = "http://localhost:8001"

SEEDED_A = {"email": "unoword.e2e.a@example.com", "password": "UnoWord-E2E-A!2026"}
SEEDED_B = {"email": "unoword.e2e.b@example.com", "password": "UnoWord-E2E-B!2026"}


def _unique_email() -> str:
    return f"uno.qa.{int(time.time() * 1000)}@gmail.com"


@pytest.fixture(scope="module")
def new_user():
    return {"email": _unique_email(), "password": "TestPass!2026A"}


class TestSignupIsSignin:
    def test_signup_new_user_signs_in_immediately(self, new_user):
        r = requests.post(f"{BASE_URL}/api/auth/signup", json=new_user, timeout=30)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data.get("authenticated") is True, data
        assert data.get("message") == "Signed in.", data
        # Set-Cookie header for uno_session
        set_cookie = r.headers.get("set-cookie", "")
        assert "uno_session=" in set_cookie, f"missing uno_session cookie: {set_cookie}"
        assert data.get("user", {}).get("email") == new_user["email"]

    def test_login_same_credentials_after_signup(self, new_user):
        r = requests.post(f"{BASE_URL}/api/auth/login", json=new_user, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("authenticated") is True, data
        assert "uno_session=" in r.headers.get("set-cookie", "")

    def test_signup_again_same_email_signs_in(self, new_user):
        r = requests.post(f"{BASE_URL}/api/auth/signup", json=new_user, timeout=30)
        # Route implementation returns login() result (200) on existing user path
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data.get("authenticated") is True, data

    def test_login_wrong_password_401(self, new_user):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": new_user["email"], "password": "WrongPass!2026Z"},
            timeout=30,
        )
        assert r.status_code == 401, r.text
        body = r.json()
        assert "detail" in body


class TestSeededProUsers:
    @pytest.mark.parametrize("creds", [SEEDED_A, SEEDED_B])
    def test_login_and_ai_access(self, creds):
        # login
        r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("authenticated") is True
        # Access token is not in JSON body per _result; we need it for Bearer.
        # It's in the Set-Cookie header (uno_session=<token>).
        set_cookie = r.headers.get("set-cookie", "")
        assert "uno_session=" in set_cookie
        token = None
        for part in set_cookie.split(","):
            for kv in part.split(";"):
                kv = kv.strip()
                if kv.startswith("uno_session="):
                    token = kv.split("=", 1)[1]
                    break
            if token:
                break
        assert token, f"couldn't parse uno_session from: {set_cookie}"

        headers = {"Authorization": f"Bearer {token}"}
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=30)
        assert me.status_code == 200, me.text
        me_data = me.json()
        assert me_data.get("plan") == "pro", me_data
        assert me_data.get("ai_access") is True, me_data

        usage = requests.get(f"{BASE_URL}/api/ai/usage/summary", headers=headers, timeout=30)
        assert usage.status_code == 200, usage.text
        u = usage.json()
        for k in ("daily_limit", "used_today", "remaining"):
            assert k in u, u


class TestAiUsageUnauth:
    def test_usage_summary_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/ai/usage/summary", timeout=30)
        assert r.status_code == 401, r.text
