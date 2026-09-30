"""Supabase access-token verification for protected UnoWord routes."""

import asyncio
import os
from dataclasses import dataclass

import jwt
from fastapi import Cookie, Header, HTTPException, status
from jwt import PyJWKClient

from lib.supabase_config import get_supabase_config


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    plan: str
    access_token: str
    email: str | None = None


def auth_is_configured() -> bool:
    config = get_supabase_config()
    return os.environ.get("AI_AUTH_MODE", "supabase").lower() == "supabase" and config.auth_configured


def _verify_supabase_token(token: str) -> dict:
    config = get_supabase_config()
    algorithm = jwt.get_unverified_header(token).get("alg")
    if algorithm == "HS256":
        if not config.jwt_secret:
            raise ValueError("SUPABASE_JWT_SECRET is required for legacy HS256 tokens")
        key = config.jwt_secret
        algorithms = ["HS256"]
    else:
        key = PyJWKClient(config.jwks_url, cache_keys=True).get_signing_key_from_jwt(token).key
        algorithms = ["RS256", "ES256"]
    return jwt.decode(
        token,
        key,
        algorithms=algorithms,
        audience=config.jwt_audience,
        issuer=config.issuer,
    )


async def require_user(
    authorization: str | None = Header(default=None),
    uno_session: str | None = Cookie(default=None),
    x_uno_user_id: str | None = Header(default=None),
) -> AuthenticatedUser:
    mode = os.environ.get("AI_AUTH_MODE", "supabase").lower()
    if mode == "supabase":
        if not auth_is_configured():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase Auth is not configured for this deployment",
            )
        header_token = authorization.removeprefix("Bearer ").strip() if authorization and authorization.startswith("Bearer ") else None
        token = header_token or uno_session
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
        try:
            claims = await asyncio.to_thread(_verify_supabase_token, token)
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Supabase access token") from exc
        user_id = claims.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Supabase access token")
        # Entitlement is intentionally unresolved until the Supabase runtime
        # adapter can read ai_entitlements server-side.
        return AuthenticatedUser(id=str(user_id), plan="unverified", access_token=token, email=claims.get("email"))

    if mode == "development_header" and os.environ.get("AI_DEV_AUTH_ENABLED", "false").lower() == "true":
        if not x_uno_user_id or len(x_uno_user_id) > 200:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
        # The plan is server-configured in this adapter, never accepted from the client.
        plan = os.environ.get("AI_DEV_PLAN", "free")
        return AuthenticatedUser(id=x_uno_user_id, plan=plan, access_token="", email=None)

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="AI authentication is not configured for this deployment",
    )


def require_subscription(user: AuthenticatedUser) -> None:
    if os.environ.get("AI_REQUIRE_SUBSCRIPTION", "true").lower() == "true" and user.plan not in {"pro", "premium"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="An eligible UnoWord plan is required")