"""Supabase Auth proxy using httpOnly cookies for browser sessions."""

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status

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


async def _password_grant(email: str, password: str) -> dict:
    return await auth_request(
        "POST", "token?grant_type=password", json={"email": email, "password": password}
    )


async def _admin_find_user_id(email: str) -> str | None:
    target = (email or "").strip().lower()
    if not target:
        return None
    try:
        data = await auth_request("GET", "admin/users?page=1&per_page=1000", service=True)
    except SupabaseAPIError:
        return None
    users = data.get("users") if isinstance(data, dict) else (data if isinstance(data, list) else [])
    for user in users or []:
        if (user.get("email") or "").lower() == target:
            return user.get("id")
    return None


async def _admin_confirm_email(email: str, user_id: str | None = None) -> bool:
    """Auto-confirm a user's email with the service-role key so they can sign in
    immediately. The product intentionally treats sign-up as sign-in (no email
    verification step), so a fresh account is never left stranded unconfirmed."""
    uid = user_id or await _admin_find_user_id(email)
    if not uid:
        return False
    try:
        await auth_request("PUT", f"admin/users/{uid}", json={"email_confirm": True}, service=True)
        return True
    except SupabaseAPIError:
        return False


@router.post("/signup", response_model=AuthResult, status_code=status.HTTP_201_CREATED)
async def signup(payload: AuthCredentials, response: Response) -> AuthResult:
    # Create the account server-side, pre-confirmed (email_confirm=true), so no
    # verification email is sent (avoids GoTrue email rate limits) and the user
    # is signed in immediately — sign-up is treated as sign-in by design.
    created: dict | None = None
    try:
        created = await auth_request(
            "POST",
            "admin/users",
            json={"email": payload.email, "password": payload.password, "email_confirm": True},
            service=True,
        )
    except SupabaseAPIError as error:
        detail = (error.detail or "").lower()
        if error.response_status in {400, 409, 422} and any(k in detail for k in ("regist", "already", "exist")):
            return await login(payload, response)
        created = None  # Admin API unavailable → fall through to public signup.

    if created is not None:
        try:
            session = await _password_grant(payload.email, payload.password)
        except SupabaseAPIError:
            return AuthResult(
                user=AuthUser(
                    id=str(created.get("id") or "pending-confirmation"),
                    email=created.get("email") or payload.email,
                    plan=None,
                    ai_access=False,
                ),
                authenticated=False,
                message="Account created. Please sign in.",
            )
        _set_session_cookies(response, session)
        return _result(session, payload.email)

    # Fallback: public signup then auto-confirm + session (environments without
    # the service-role admin API).
    try:
        data = await auth_request("POST", "signup", json=payload.model_dump(mode="json"))
    except SupabaseAPIError as error:
        if error.response_status in {400, 422} and "regist" in (error.detail or "").lower():
            return await login(payload, response)
        raise_http(error)
    if data.get("access_token"):
        _set_session_cookies(response, data)
        return _result(data, payload.email)
    user = data.get("user") or {}
    uid = user.get("id")
    await _admin_confirm_email(payload.email, uid if uid and uid != "pending-confirmation" else None)
    try:
        session = await _password_grant(payload.email, payload.password)
    except SupabaseAPIError:
        return _result(data, payload.email)
    _set_session_cookies(response, session)
    return _result(session, payload.email)


@router.post("/login", response_model=AuthResult)
async def login(payload: AuthCredentials, response: Response) -> AuthResult:
    try:
        data = await _password_grant(payload.email, payload.password)
    except SupabaseAPIError as error:
        # An account created before auto-confirm (or with confirmation on) can be
        # stuck "Email not confirmed": confirm it server-side and retry once.
        if "confirm" in (error.detail or "").lower() and await _admin_confirm_email(payload.email):
            try:
                data = await _password_grant(payload.email, payload.password)
            except SupabaseAPIError as retry_error:
                raise_http(retry_error)
            _set_session_cookies(response, data)
            return _result(data, payload.email)
        # Normalize Supabase's native 400 for bad credentials to a REST-correct 401.
        if error.response_status == 400 and "invalid login credentials" in (error.detail or "").lower():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error.detail)
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