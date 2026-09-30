"""Supabase Auth proxy using httpOnly cookies for browser sessions."""

from fastapi import APIRouter, Cookie, Depends, Response, status

from lib.auth import AuthenticatedUser, require_user
from lib.ai_access import entitlement_is_active, get_entitlement
from lib.supabase_client import SupabaseAPIError, auth_request, raise_http
from models.auth import AuthCredentials, AuthResult, AuthUser

router = APIRouter(prefix="/auth", tags=["auth"])

ACCESS_COOKIE = "uno_session"
REFRESH_COOKIE = "uno_refresh"


def _set_session_cookies(response: Response, session: dict) -> None:
    access_token = session.get("access_token")
    refresh_token = session.get("refresh_token")
    expires_in = max(60, int(session.get("expires_in") or 3600))
    if access_token:
        response.set_cookie(ACCESS_COOKIE, access_token, max_age=expires_in, httponly=True, secure=True, samesite="none", path="/")
    if refresh_token:
        response.set_cookie(REFRESH_COOKIE, refresh_token, max_age=60 * 60 * 24 * 30, httponly=True, secure=True, samesite="none", path="/api/auth")


def _result(data: dict, fallback_email: str) -> AuthResult:
    user = data.get("user") or {}
    authenticated = bool(data.get("access_token"))
    return AuthResult(
        user=AuthUser(id=str(user.get("id") or "pending-confirmation"), email=user.get("email") or fallback_email, plan=None, ai_access=False),
        authenticated=authenticated,
        message="Signed in." if authenticated else "Check your email to confirm your account.",
    )


@router.post("/signup", response_model=AuthResult, status_code=status.HTTP_201_CREATED)
async def signup(payload: AuthCredentials, response: Response) -> AuthResult:
    try:
        data = await auth_request("POST", "signup", json=payload.model_dump(mode="json"))
    except SupabaseAPIError as error:
        raise_http(error)
    _set_session_cookies(response, data)
    return _result(data, payload.email)


@router.post("/login", response_model=AuthResult)
async def login(payload: AuthCredentials, response: Response) -> AuthResult:
    try:
        data = await auth_request("POST", "token?grant_type=password", json=payload.model_dump(mode="json"))
    except SupabaseAPIError as error:
        raise_http(error)
    _set_session_cookies(response, data)
    return _result(data, payload.email)


@router.post("/refresh", response_model=AuthResult)
async def refresh_session(response: Response, uno_refresh: str | None = Cookie(default=None)) -> AuthResult:
    if not uno_refresh:
        from fastapi import HTTPException
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh session required")
    try:
        data = await auth_request("POST", "token?grant_type=refresh_token", json={"refresh_token": uno_refresh})
    except SupabaseAPIError as error:
        raise_http(error)
    _set_session_cookies(response, data)
    return _result(data, "")


@router.get("/me", response_model=AuthUser)
async def me(user: AuthenticatedUser = Depends(require_user)) -> AuthUser:
    entitlement = await get_entitlement(user.id)
    return AuthUser(
        id=user.id,
        email=user.email,
        plan=entitlement.get("plan") if entitlement else None,
        ai_access=entitlement_is_active(entitlement),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, uno_session: str | None = Cookie(default=None)) -> None:
    if uno_session:
        try:
            await auth_request("POST", "logout", access_token=uno_session)
        except SupabaseAPIError:
            pass
    response.delete_cookie(ACCESS_COOKIE, path="/", secure=True, samesite="none")
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth", secure=True, samesite="none")