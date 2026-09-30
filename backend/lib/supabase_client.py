"""Minimal async Supabase Auth/PostgREST client.

User requests forward the verified Supabase access token so RLS remains the
authoritative isolation layer. Service-role requests are reserved for server-
managed entitlement and usage records and always include an explicit user_id.
"""

from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException, status

from lib.supabase_config import get_supabase_config, require_supabase_runtime


class SupabaseAPIError(Exception):
    def __init__(self, response_status: int, detail: str) -> None:
        super().__init__(detail)
        self.response_status = response_status
        self.detail = detail


def _safe_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
        return str(body.get("msg") or body.get("message") or body.get("error_description") or body.get("error") or "Supabase request failed")
    except Exception:
        return "Supabase request failed"


async def _request(
    method: str,
    url: str,
    headers: dict[str, str],
    *,
    params: dict[str, str] | None = None,
    json: Any = None,
    content: bytes | None = None,
) -> Any:
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.request(method, url, headers=headers, params=params, json=json, content=content)
    except httpx.HTTPError as exc:
        raise SupabaseAPIError(502, "Supabase is temporarily unreachable") from exc
    if response.status_code >= 400:
        raise SupabaseAPIError(response.status_code, _safe_detail(response))
    if response.status_code == 204 or not response.content:
        return None
    return response.json()


def _rest_headers(access_token: str | None, *, service: bool, prefer: str | None) -> dict[str, str]:
    config = require_supabase_runtime()
    api_key = config.service_role_key if service else config.anon_key
    bearer = config.service_role_key if service else access_token
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {bearer}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


async def user_rest(
    method: str,
    path: str,
    access_token: str,
    *,
    params: dict[str, str] | None = None,
    json: Any = None,
    prefer: str | None = None,
) -> Any:
    config = require_supabase_runtime()
    return await _request(
        method,
        f"{config.url.rstrip('/')}/rest/v1/{path.lstrip('/')}",
        _rest_headers(access_token, service=False, prefer=prefer),
        params=params,
        json=json,
    )


async def service_rest(
    method: str,
    path: str,
    *,
    params: dict[str, str] | None = None,
    json: Any = None,
    prefer: str | None = None,
) -> Any:
    config = require_supabase_runtime()
    return await _request(
        method,
        f"{config.url.rstrip('/')}/rest/v1/{path.lstrip('/')}",
        _rest_headers(None, service=True, prefer=prefer),
        params=params,
        json=json,
    )


async def auth_request(
    method: str,
    path: str,
    *,
    json: Any = None,
    access_token: str | None = None,
    service: bool = False,
) -> Any:
    config = get_supabase_config()
    if not config.url or not config.anon_key:
        raise SupabaseAPIError(503, "Supabase Auth is not configured")
    api_key = config.service_role_key if service else config.anon_key
    bearer = config.service_role_key if service else (access_token or config.anon_key)
    return await _request(
        method,
        f"{config.url.rstrip('/')}/auth/v1/{path.lstrip('/')}",
        {"apikey": api_key, "Authorization": f"Bearer {bearer}", "Content-Type": "application/json"},
        json=json,
    )


async def user_storage_upload(path: str, access_token: str, content: bytes, content_type: str) -> Any:
    config = require_supabase_runtime()
    return await _request(
        "POST",
        f"{config.url.rstrip('/')}/storage/v1/object/ai-documents/{quote(path, safe='/')}",
        {
            "apikey": config.anon_key,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": content_type,
            "x-upsert": "false",
        },
        content=content,
    )


async def user_storage_delete(path: str, access_token: str) -> Any:
    config = require_supabase_runtime()
    return await _request(
        "DELETE",
        f"{config.url.rstrip('/')}/storage/v1/object/ai-documents",
        {
            "apikey": config.anon_key,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json={"prefixes": [path]},
    )


def raise_http(error: SupabaseAPIError) -> None:
    if error.response_status in {400, 401, 403, 404, 409, 422, 429}:
        raise HTTPException(status_code=error.response_status, detail=error.detail)
    raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=error.detail)