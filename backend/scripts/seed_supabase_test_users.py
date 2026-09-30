"""Idempotently create two Supabase Auth users for RLS verification."""

import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

url = os.environ["SUPABASE_URL"].rstrip("/")
service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
headers = {
    "apikey": service_key,
    "Authorization": f"Bearer {service_key}",
    "Content-Type": "application/json",
}
accounts = [
    ("unoword.e2e.a@example.com", "UnoWord-E2E-A!2026"),
    ("unoword.e2e.b@example.com", "UnoWord-E2E-B!2026"),
]

with httpx.Client(timeout=30.0) as client:
    listed = client.get(f"{url}/auth/v1/admin/users", headers=headers, params={"page": "1", "per_page": "1000"})
    listed.raise_for_status()
    existing = {user["email"]: user for user in listed.json().get("users", [])}
    user_ids: list[str] = []
    for email, password in accounts:
        current = existing.get(email)
        if current:
            response = client.put(
                f"{url}/auth/v1/admin/users/{current['id']}",
                headers=headers,
                json={"password": password, "email_confirm": True},
            )
        else:
            response = client.post(
                f"{url}/auth/v1/admin/users",
                headers=headers,
                json={"email": email, "password": password, "email_confirm": True},
            )
        response.raise_for_status()
        user = response.json()
        user_ids.append(user["id"])
        print(f"ready {email} {user['id']}")

    entitlements = [
        {"user_id": user_id, "plan": "pro", "status": "active", "daily_request_limit": 100}
        for user_id in user_ids
    ]
    response = client.post(
        f"{url}/rest/v1/ai_entitlements",
        headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
        params={"on_conflict": "user_id"},
        json=entitlements,
    )
    response.raise_for_status()

print("Supabase RLS test users and entitlements ready")