"""Supabase configuration shared by Auth, PostgREST, and migrations."""

import os
from dataclasses import dataclass

from fastapi import HTTPException, status


@dataclass(frozen=True)
class SupabaseConfig:
    url: str
    anon_key: str
    service_role_key: str
    db_url: str
    jwt_audience: str
    jwt_secret: str

    @property
    def configured(self) -> bool:
        return bool(self.url and self.anon_key and self.service_role_key)

    @property
    def auth_configured(self) -> bool:
        return bool(self.url and self.anon_key and (self.jwt_secret or self.jwks_url))

    @property
    def jwks_url(self) -> str:
        return f"{self.url.rstrip('/')}/auth/v1/.well-known/jwks.json" if self.url else ""

    @property
    def issuer(self) -> str:
        return f"{self.url.rstrip('/')}/auth/v1" if self.url else ""


def get_supabase_config() -> SupabaseConfig:
    return SupabaseConfig(
        url=os.environ.get("SUPABASE_URL", "").strip(),
        anon_key=os.environ.get("SUPABASE_ANON_KEY", "").strip(),
        service_role_key=os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
        db_url=os.environ.get("SUPABASE_DB_URL", "").strip(),
        jwt_audience=os.environ.get("SUPABASE_JWT_AUDIENCE", "authenticated").strip(),
        jwt_secret=os.environ.get("SUPABASE_JWT_SECRET", "").strip(),
    )


def supabase_is_configured() -> bool:
    return get_supabase_config().configured


def require_supabase_runtime() -> SupabaseConfig:
    config = get_supabase_config()
    if not config.configured:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Supabase is not configured")
    return config