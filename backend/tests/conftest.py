"""Pre-scaffolded pytest fixtures for the FastAPI backend.

Tests hit the live uvicorn process managed by supervisor (not an in-process ASGI app), so
the app under test is the same one the frontend and Playwright see. Do NOT re-create this
file — add app-specific fixtures below the marker at the bottom.
"""

import os

import httpx
import pytest
import pytest_asyncio

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API_URL = f"{BACKEND_URL}/api"


def api_url(path: str = "") -> str:
    """Absolute URL for an /api route: api_url("/status") -> http://localhost:8001/api/status."""
    return f"{API_URL}{path}"


@pytest.fixture(scope="session")
def backend_url() -> str:
    return BACKEND_URL


@pytest.fixture
def client():
    """Sync httpx client rooted at /api — the default for endpoint tests.

    Example:
        def test_status(client):
            assert client.get("/status").status_code == 200
    """
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        yield c


@pytest_asyncio.fixture
async def aclient():
    """Async variant, for tests that also await motor/backend helpers directly."""
    async with httpx.AsyncClient(base_url=API_URL, timeout=30.0) as c:
        yield c


# --- app-specific fixtures below this line ---

USER_A_EMAIL = "unoword.e2e.a@example.com"
USER_A_PASSWORD = "UnoWord-E2E-A!2026"
USER_B_EMAIL = "unoword.e2e.b@example.com"
USER_B_PASSWORD = "UnoWord-E2E-B!2026"


def _login_access_token(email: str, password: str) -> str:
    """Logs in against the live Supabase-auth-backed API and returns the bearer
    access token straight from the login response's httpOnly cookie -- the
    `require_user` dependency accepts the same token via `Authorization: Bearer`.
    """
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        response = c.post("/auth/login", json={"email": email, "password": password})
        response.raise_for_status()
        token = response.cookies.get("uno_session")
        assert token, "login did not set uno_session cookie"
        return token


@pytest.fixture(scope="session")
def user_a_token() -> str:
    return _login_access_token(USER_A_EMAIL, USER_A_PASSWORD)


@pytest.fixture(scope="session")
def user_b_token() -> str:
    return _login_access_token(USER_B_EMAIL, USER_B_PASSWORD)


@pytest.fixture
def client_a(user_a_token):
    with httpx.Client(
        base_url=API_URL, timeout=30.0, headers={"Authorization": f"Bearer {user_a_token}"}
    ) as c:
        yield c


@pytest.fixture
def client_b(user_b_token):
    with httpx.Client(
        base_url=API_URL, timeout=30.0, headers={"Authorization": f"Bearer {user_b_token}"}
    ) as c:
        yield c
