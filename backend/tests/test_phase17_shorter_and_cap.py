"""Phase 17: shorter suggestions + daily cap = 25.

- Verifies /api/ai/usage/summary reports daily_limit==25 for both seeded Pro users
  (env cap AI_DAILY_REQUEST_LIMIT=25 must win over entitlement value 100).
- Verifies used_today/remaining math consistency.
- Makes at most ONE real /api/ai/suggestion call (on the user with more remaining
  budget) to check suggestion<=400 chars and reason<=300 chars.
- If both users are already capped, observes the 429 response instead.
"""

import pytest


def _summary(client):
    r = client.get("/ai/usage/summary")
    assert r.status_code == 200, r.text
    return r.json()


def test_usage_summary_daily_limit_is_25_user_a(client_a):
    data = _summary(client_a)
    assert data["daily_limit"] == 25, data
    assert data["used_today"] >= 0
    if data["daily_limit"]:
        assert data["remaining"] == max(0, data["daily_limit"] - data["used_today"])
        assert data["remaining"] >= 0


def test_usage_summary_daily_limit_is_25_user_b(client_b):
    data = _summary(client_b)
    assert data["daily_limit"] == 25, data
    assert data["used_today"] >= 0
    if data["daily_limit"]:
        assert data["remaining"] == max(0, data["daily_limit"] - data["used_today"])
        assert data["remaining"] >= 0


def test_shorter_suggestion_or_429_enforcement(client_a, client_b):
    """Single real suggestion call to bound tokens/cost.

    Pick the user with the most remaining budget. If both are at 0, verify the
    429 enforcement path instead of forcing more calls.
    """
    sum_a = _summary(client_a)
    sum_b = _summary(client_b)
    rem_a = sum_a.get("remaining") or 0
    rem_b = sum_b.get("remaining") or 0

    if rem_a == 0 and rem_b == 0:
        # Both capped — verify enforcement.
        r = client_a.post("/ai/suggestion", json={"current_writing": "hi"})
        assert r.status_code == 429, r.text
        assert "Daily AI suggestion limit reached" in r.text
        pytest.skip("Both users at cap; verified 429 enforcement instead of length.")

    client = client_a if rem_a >= rem_b else client_b
    payload = {
        "current_writing": "I am drafting a short blog intro about morning routines.",
        "current_project": "blog post",
    }
    r = client.post("/ai/suggestion", json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    suggestion = body.get("suggestion") or ""
    reason = body.get("reason") or ""
    assert 0 < len(suggestion) <= 400, f"suggestion length={len(suggestion)}: {suggestion!r}"
    assert len(reason) <= 300, f"reason length={len(reason)}: {reason!r}"


def test_429_when_capped_if_applicable(client_a, client_b):
    """If either user is already at cap, one extra call must return 429."""
    for client, label in ((client_a, "A"), (client_b, "B")):
        data = _summary(client)
        if (data.get("remaining") or 0) == 0 and data.get("daily_limit"):
            r = client.post("/ai/suggestion", json={"current_writing": "hi"})
            assert r.status_code == 429, f"user {label}: {r.status_code} {r.text}"
            assert "Daily AI suggestion limit reached" in r.text
            return
    pytest.skip("Neither user is currently at cap; enforcement covered by summary math.")
