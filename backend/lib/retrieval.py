"""User-scoped retrieval over private embeddings with feedback-aware reranking.

Called from `/api/ai/suggestion`. Every call embeds the query, invokes the
`match_user_chunks` RPC with an explicit `p_user_id`, applies a bias built
from the user's accepted / rejected suggestion history (positive for accepted
`source_ids`, negative for rejected ones), deduplicates by parent, and
returns typed chunks. Retrieved content is treated as untrusted context
inside the suggestion prompt.
"""

from __future__ import annotations

import logging
import math
from collections import defaultdict
from dataclasses import dataclass

from lib.embeddings import get_embeddings_service
from lib.supabase_client import SupabaseAPIError, service_rest

logger = logging.getLogger(__name__)

# How strongly feedback bends similarity. Kept small so a highly-relevant new
# chunk can still surface over a stale accepted one, but large enough that a
# rejected source visibly drops down the ranking.
FEEDBACK_WEIGHT = 0.12
# Parent-level bias (siblings in the same document or writing session)
# receives a softened share of the parent's signal.
PARENT_WEIGHT = 0.5
# Rejection is a stronger explicit signal than acceptance.
ACCEPT_INC = 1.0
REJECT_INC = -1.5
# Clamp per-source score before feeding into tanh so a few noisy rejections
# don't permanently blacklist a chunk.
BIAS_CLAMP = 3.0
# Drop candidates whose adjusted similarity is clearly below the retrieval
# threshold after bias — otherwise a rejected chunk with a slightly higher
# raw similarity would still slip in.
MIN_ADJUSTED_SIMILARITY = 0.35
# How many past accepted/rejected suggestions to consider.
FEEDBACK_LOOKBACK = 100


@dataclass(frozen=True)
class RetrievedChunk:
    source_type: str
    source_id: str
    parent_id: str | None
    content: str
    similarity: float


async def _fetch_feedback_bias(user_id: str) -> tuple[dict[str, float], dict[str, float]]:
    """Return ({source_id: score}, {parent_id: score}) clamped to [-CLAMP, CLAMP]."""

    try:
        rows = await service_rest(
            "GET",
            "ai_suggestions",
            params={
                "select": "status,source_ids",
                "user_id": f"eq.{user_id}",
                "status": "in.(accepted,rejected)",
                "order": "created_at.desc",
                "limit": str(FEEDBACK_LOOKBACK),
            },
        )
    except SupabaseAPIError as error:
        logger.warning(
            "feedback_bias_fetch_failed status=%s detail=%s",
            error.response_status,
            error.detail,
        )
        return {}, {}
    source_score: dict[str, float] = defaultdict(float)
    for row in rows or []:
        inc = ACCEPT_INC if row.get("status") == "accepted" else REJECT_INC
        for sid in row.get("source_ids") or []:
            source_score[str(sid)] += inc
    # Parents inherit an averaged share of their children's scores; if the
    # `parent_id` is itself referenced directly it's already in source_score.
    parent_score: dict[str, float] = {}
    clamped_source = {
        sid: max(-BIAS_CLAMP, min(BIAS_CLAMP, score))
        for sid, score in source_score.items()
    }
    return clamped_source, parent_score


def _bias_for(
    source_id: str,
    parent_id: str | None,
    source_scores: dict[str, float],
    parent_scores: dict[str, float],
) -> float:
    direct = source_scores.get(source_id, 0.0)
    parent = source_scores.get(parent_id, 0.0) if parent_id else 0.0
    parent = parent or parent_scores.get(parent_id or "", 0.0)
    combined = direct + PARENT_WEIGHT * parent
    if combined == 0.0:
        return 0.0
    return FEEDBACK_WEIGHT * math.tanh(combined / BIAS_CLAMP)


async def retrieve_user_chunks(
    user_id: str,
    query: str,
    *,
    match_count: int = 8,
    match_threshold: float = 0.55,
) -> list[RetrievedChunk]:
    embeddings = get_embeddings_service()
    if not embeddings.enabled:
        return []
    embedded = await embeddings.embed(query)
    if not embedded:
        return []
    # Overfetch so feedback-driven reranking has room to drop losers without
    # returning fewer results than requested.
    fetch_count = min(20, max(match_count * 2, match_count))
    try:
        rows = await service_rest(
            "POST",
            "rpc/match_user_chunks",
            json={
                "p_user_id": user_id,
                "p_query_embedding": embedded.embedding,
                "p_match_threshold": match_threshold,
                "p_match_count": fetch_count,
            },
        )
    except SupabaseAPIError as error:
        logger.warning("retrieval_rpc_failed status=%s detail=%s", error.response_status, error.detail)
        return []
    if not rows:
        return []

    source_scores, parent_scores = await _fetch_feedback_bias(user_id)

    scored: list[tuple[float, float, dict]] = []
    for row in rows:
        source_id = str(row.get("source_id"))
        parent = row.get("parent_id")
        parent_id = str(parent) if parent else None
        base = float(row.get("similarity") or 0.0)
        bias = _bias_for(source_id, parent_id, source_scores, parent_scores)
        adjusted = base + bias
        if adjusted < MIN_ADJUSTED_SIMILARITY:
            continue
        scored.append((adjusted, base, row))
    if not scored:
        return []
    scored.sort(key=lambda item: item[0], reverse=True)

    seen: set[str] = set()
    chunks: list[RetrievedChunk] = []
    for adjusted, base, row in scored:
        source_id = str(row.get("source_id"))
        parent = row.get("parent_id")
        dedupe_key = str(parent) if parent else source_id
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        chunks.append(
            RetrievedChunk(
                source_type=str(row.get("source_type") or "unknown"),
                source_id=source_id,
                parent_id=str(parent) if parent else None,
                content=str(row.get("content") or ""),
                similarity=adjusted,
            )
        )
        if len(chunks) >= match_count:
            break
    return chunks
