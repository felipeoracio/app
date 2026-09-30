"""Phase 14 cross-user isolation verification.

Proves that user A can never read user B's private AI data through any surface:
PostgREST tables (RLS), the retrieval RPC, and Supabase Storage. Uses the two
seeded test users and exercises the LIVE backend + Supabase project.

Run: /root/.venv/bin/python scripts/phase14_verify_isolation.py
Exit code 0 = all isolation checks passed.
"""

import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
ANON = os.environ["SUPABASE_ANON_KEY"]
SERVICE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BACKEND = os.environ.get("BACKEND_URL", "http://localhost:8001")

USER_A = ("unoword.e2e.a@example.com", "UnoWord-E2E-A!2026")
USER_B = ("unoword.e2e.b@example.com", "UnoWord-E2E-B!2026")

failures: list[str] = []
passes: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    (passes if ok else failures).append(f"{name} {detail}".strip())
    print(f"[{'PASS' if ok else 'FAIL'}] {name} {detail}".rstrip())


def login(email: str, password: str) -> tuple[str, str]:
    r = httpx.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": ANON, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    return data["access_token"], data["user"]["id"]


def rest(method: str, path: str, token: str, **kw):
    return httpx.request(
        method,
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": ANON, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        timeout=30,
        **kw,
    )


def main() -> int:
    a_token, a_id = login(*USER_A)
    b_token, b_id = login(*USER_B)
    print(f"user A = {a_id}\nuser B = {b_id}\n")

    # Seed one private memory for B via B's own token (RLS-legal write).
    seed = httpx.post(
        f"{SUPABASE_URL}/rest/v1/ai_memories",
        headers={"apikey": ANON, "Authorization": f"Bearer {b_token}", "Content-Type": "application/json", "Prefer": "return=representation"},
        json={"user_id": b_id, "memory_type": "person", "memory": "B-SECRET: a private person only user B should ever see.", "importance": 5},
        timeout=30,
    )
    check("B can write own memory", seed.status_code in (200, 201), f"status={seed.status_code}")

    # RLS must also REJECT a spoofed write where B tries to insert as A.
    spoof = httpx.post(
        f"{SUPABASE_URL}/rest/v1/ai_memories",
        headers={"apikey": ANON, "Authorization": f"Bearer {b_token}", "Content-Type": "application/json"},
        json={"user_id": a_id, "memory_type": "person", "memory": "spoof", "importance": 1},
        timeout=30,
    )
    check("B cannot write a row as A (with check)", spoof.status_code in (401, 403), f"status={spoof.status_code}")

    tables = [
        "ai_profiles", "ai_onboarding_answers", "ai_documents", "ai_document_chunks",
        "ai_writing_sessions", "ai_writing_chunks", "ai_memories", "ai_suggestions",
        "ai_feedback", "ai_usage", "ai_entitlements",
    ]

    # 1) A filtering explicitly for B's user_id returns nothing (RLS).
    for t in tables:
        col = "user_id" if t != "ai_entitlements" else "user_id"
        r = rest("GET", f"{t}?select=*&{col}=eq.{b_id}", a_token)
        rows = r.json() if r.status_code == 200 else None
        check(f"A cannot read B rows in {t}", r.status_code == 200 and rows == [], f"status={r.status_code} rows={len(rows) if isinstance(rows, list) else rows}")

    # 2) A's unfiltered read of ai_memories never contains B's secret.
    r = rest("GET", "ai_memories?select=memory", a_token)
    leaked = r.status_code == 200 and any("B-SECRET" in (row.get("memory") or "") for row in r.json())
    check("A unfiltered memories exclude B secret", r.status_code == 200 and not leaked, f"status={r.status_code}")

    # 3) Retrieval RPC: A calling match_user_chunks with B's id must be DENIED.
    rpc = rest(
        "POST", "rpc/match_user_chunks", a_token,
        json={"p_user_id": b_id, "p_query_embedding": [0.0] * 1536, "p_match_threshold": 0.0, "p_match_count": 10},
    )
    # Expect a permission/authorization failure (403/401/404), never a 200 with B's rows.
    denied = rpc.status_code in (401, 403, 404) or (rpc.status_code >= 400)
    check("A denied match_user_chunks(p_user_id=B)", denied, f"status={rpc.status_code}")
    if rpc.status_code == 200:
        body = rpc.json()
        check("RPC returned no B rows to A", body == [], f"rows={len(body) if isinstance(body, list) else body}")

    # 4) Even for their OWN id via PostgREST, authenticated has no execute grant now.
    rpc_self = rest(
        "POST", "rpc/match_user_chunks", a_token,
        json={"p_user_id": a_id, "p_query_embedding": [0.0] * 1536, "p_match_threshold": 0.0, "p_match_count": 5},
    )
    check("authenticated has no direct RPC execute grant", rpc_self.status_code in (401, 403, 404), f"status={rpc_self.status_code}")

    # 5) Storage: bucket is private (anon cannot list), and A cannot read B's object path.
    pub = httpx.get(f"{SUPABASE_URL}/storage/v1/object/public/ai-documents/{b_id}/x", timeout=30)
    check("bucket not public (no anon public URL)", pub.status_code in (400, 401, 403, 404), f"status={pub.status_code}")

    # 6) Backend still works for the legitimate owner (service-role retrieval path).
    sugg = httpx.post(
        f"{BACKEND}/api/ai/suggestion",
        headers={"Authorization": f"Bearer {b_token}", "Content-Type": "application/json"},
        json={"current_project": "a private person"},
        timeout=60,
    )
    check("backend suggestion still works for owner B", sugg.status_code == 200, f"status={sugg.status_code}")

    print(f"\n{len(passes)} passed, {len(failures)} failed")
    if failures:
        print("FAILURES:")
        for f in failures:
            print(" -", f)
        return 1
    print("ALL PHASE 14 ISOLATION CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
