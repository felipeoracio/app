"""RLS-backed AI profile, memory, suggestion, feedback, and usage routes.

Phase 11 turns the suggestion path into a real per-user RAG pipeline:
embeddings on ingest for saved writing chunks and memories, private retrieval
via `match_user_chunks`, and an OpenAI-backed provider with a Phase-13 basic
fallback if retrieval or the model fails.
"""

import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from lib.ai_provider import (
    MockSuggestionProvider,
    SuggestionProviderResponse,
    get_suggestion_provider,
)
from lib.ai_access import get_entitlement, require_ai_user
from lib.auth import AuthenticatedUser, auth_is_configured
from lib.chunking import chunk_text
from lib.dates import today_iso
from lib.embeddings import get_embeddings_service
from lib.prompts import UNO_WORD_COACH_SYSTEM_PROMPT
from lib.retrieval import RetrievedChunk, retrieve_user_chunks
from lib.supabase_client import SupabaseAPIError, raise_http, service_rest, user_rest
from lib.supabase_config import supabase_is_configured
from models.ai import (
    AIFeedback,
    AIMemory,
    AIMemoryCreate,
    AIOnboardingAnswer,
    AIOnboardingAnswerUpsert,
    AIProfile,
    AIProfileUpdate,
    AIStatus,
    AISuggestion,
    AISuggestionFeedbackCreate,
    AISuggestionRequest,
    AIUsageEvent,
    AIWritingChunk,
    AIWritingSession,
    AIWritingSessionCreate,
)

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger(__name__)


async def _user_rows(
    table: str,
    user: AuthenticatedUser,
    *,
    extra: dict[str, str] | None = None,
) -> list[dict]:
    params = {"select": "*", "user_id": f"eq.{user.id}", **(extra or {})}
    try:
        return await user_rest("GET", table, user.access_token, params=params)
    except SupabaseAPIError as error:
        raise_http(error)


async def _entitlement(user_id: str) -> dict:
    entitlement = await get_entitlement(user_id)
    if not entitlement:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="An eligible UnoWord AI plan is required",
        )
    return entitlement


def _compose_prompt_context(
    payload: AISuggestionRequest,
    profile: list[dict],
    answers: list[dict],
    memories: list[dict],
    previous: list[dict],
    retrieved: list[RetrievedChunk],
) -> tuple[str, list[str]]:
    """Build the composed context string and the list of related source ids.

    Retrieved chunks are delimited so the model treats them as untrusted
    evidence and does not follow any instructions embedded in them.
    """

    parts: list[str] = []
    source_ids: list[str] = []
    if payload.current_writing:
        parts.append(f"Current writing draft:\n{payload.current_writing}")
    if payload.current_project:
        parts.append(f"Current project focus: {payload.current_project}")
    if profile:
        item = profile[0]
        fields = " | ".join(
            f"{name}: {item.get(name)}"
            for name in (
                "writing_goal",
                "writing_style",
                "audience",
                "primary_topics",
                "current_projects",
                "favorite_subjects",
                "avoid_topics",
                "personal_context",
            )
            if item.get(name)
        )
        if fields:
            parts.append(f"Profile — {fields}")
        source_ids.append(item["id"])
    for answer in answers[:10]:
        parts.append(f"Onboarding — {answer.get('question')}: {answer.get('answer')}")
        source_ids.append(answer["id"])
    for memory in memories[:10]:
        parts.append(f"Memory ({memory.get('memory_type')}): {memory.get('memory')}")
        source_ids.append(memory["id"])
    for suggestion in previous[:5]:
        parts.append(
            f"Previous suggestion ({suggestion.get('status')}): {suggestion.get('suggestion')}"
        )
    if retrieved:
        parts.append("Retrieved private chunks:")
        for chunk in retrieved:
            parts.append(
                f"- [{chunk.source_type} sim={chunk.similarity:.2f}] {chunk.content[:600]}"
            )
            source_ids.append(chunk.source_id)
    joined = "\n".join(parts[:80])
    return joined or "No saved user context is available yet.", source_ids[:50]


async def _record_usage(
    user_id: str,
    *,
    request_type: str,
    model: str,
    input_tokens: int | None,
    output_tokens: int | None,
    provider: str,
) -> None:
    body: dict = {
        "user_id": user_id,
        "date": today_iso(),
        "request_type": request_type,
    }
    if input_tokens is not None:
        body["input_tokens"] = input_tokens
    if output_tokens is not None:
        body["output_tokens"] = output_tokens
    if input_tokens is not None and output_tokens is not None:
        # Rough cost estimate for gpt-5.4-mini class models; kept as a small
        # heuristic. Not used for billing.
        body["estimated_cost"] = round(
            (input_tokens * 0.15 + output_tokens * 0.60) / 1_000_000,
            6,
        )
    try:
        await service_rest("POST", "ai_usage", json=body, prefer="return=minimal")
    except SupabaseAPIError as error:
        logger.warning(
            "usage_write_failed provider=%s model=%s status=%s detail=%s",
            provider,
            model,
            error.response_status,
            error.detail,
        )


@router.get("/status", response_model=AIStatus)
async def ai_status() -> AIStatus:
    provider = get_suggestion_provider()
    embeddings = get_embeddings_service()
    configured = supabase_is_configured()
    ready = configured and embeddings.enabled
    detail = "Supabase Auth, PostgREST, RLS, and pgvector are connected."
    if not configured:
        detail = "Supabase is not configured."
    elif not embeddings.enabled:
        detail = "OpenAI embeddings key is not configured; retrieval will fall back."
    return AIStatus(
        auth_configured=auth_is_configured(),
        database="supabase",
        database_configured=configured,
        provider=provider.name,
        model=provider.model,
        retrieval_ready=ready,
        message=detail,
    )


@router.get("/profile", response_model=AIProfile)
async def get_profile(user: AuthenticatedUser = Depends(require_ai_user)) -> AIProfile:
    rows = await _user_rows("ai_profiles", user, extra={"limit": "1"})
    if rows:
        return AIProfile(**rows[0])
    try:
        created = await user_rest(
            "POST",
            "ai_profiles",
            user.access_token,
            json={"user_id": user.id},
            prefer="return=representation",
        )
    except SupabaseAPIError as error:
        raise_http(error)
    return AIProfile(**created[0])


@router.put("/profile", response_model=AIProfile)
async def update_profile(
    payload: AIProfileUpdate,
    user: AuthenticatedUser = Depends(require_ai_user),
) -> AIProfile:
    body = {"user_id": user.id, **payload.model_dump()}
    try:
        rows = await user_rest(
            "POST",
            "ai_profiles",
            user.access_token,
            params={"on_conflict": "user_id"},
            json=body,
            prefer="resolution=merge-duplicates,return=representation",
        )
    except SupabaseAPIError as error:
        raise_http(error)
    return AIProfile(**rows[0])


@router.get("/onboarding", response_model=list[AIOnboardingAnswer])
async def list_onboarding(
    user: AuthenticatedUser = Depends(require_ai_user),
) -> list[AIOnboardingAnswer]:
    rows = await _user_rows(
        "ai_onboarding_answers",
        user,
        extra={"order": "updated_at.desc", "limit": "100"},
    )
    return [AIOnboardingAnswer(**row) for row in rows]


@router.put("/onboarding", response_model=AIOnboardingAnswer)
async def upsert_onboarding(
    payload: AIOnboardingAnswerUpsert,
    user: AuthenticatedUser = Depends(require_ai_user),
) -> AIOnboardingAnswer:
    try:
        rows = await user_rest(
            "POST",
            "ai_onboarding_answers",
            user.access_token,
            params={"on_conflict": "user_id,question_id"},
            json={"user_id": user.id, **payload.model_dump()},
            prefer="resolution=merge-duplicates,return=representation",
        )
    except SupabaseAPIError as error:
        raise_http(error)
    return AIOnboardingAnswer(**rows[0])


@router.get("/memories", response_model=list[AIMemory])
async def list_memories(user: AuthenticatedUser = Depends(require_ai_user)) -> list[AIMemory]:
    rows = await _user_rows(
        "ai_memories",
        user,
        extra={"order": "updated_at.desc", "limit": "200"},
    )
    return [AIMemory(**row) for row in rows]


@router.post("/memories", response_model=AIMemory, status_code=status.HTTP_201_CREATED)
async def create_memory(
    payload: AIMemoryCreate,
    user: AuthenticatedUser = Depends(require_ai_user),
) -> AIMemory:
    body: dict = {"user_id": user.id, **payload.model_dump()}
    embeddings = get_embeddings_service()
    if embeddings.enabled:
        embedded = await embeddings.embed(payload.memory)
        if embedded:
            body["embedding"] = embedded.embedding
            body["embedding_model"] = embedded.model
            body["embedding_version"] = embedded.version
    try:
        rows = await user_rest(
            "POST",
            "ai_memories",
            user.access_token,
            json=body,
            prefer="return=representation",
        )
    except SupabaseAPIError as error:
        raise_http(error)
    return AIMemory(**rows[0])


@router.delete("/memories/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory(
    memory_id: str,
    user: AuthenticatedUser = Depends(require_ai_user),
) -> None:
    try:
        rows = await user_rest(
            "DELETE",
            "ai_memories",
            user.access_token,
            params={"id": f"eq.{memory_id}", "user_id": f"eq.{user.id}"},
            prefer="return=representation",
        )
    except SupabaseAPIError as error:
        raise_http(error)
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory not found")


@router.post(
    "/writing-sessions",
    response_model=AIWritingSession,
    status_code=status.HTTP_201_CREATED,
)
async def save_writing_session(
    payload: AIWritingSessionCreate,
    user: AuthenticatedUser = Depends(require_ai_user),
) -> AIWritingSession:
    session: AIWritingSession | None = None
    if payload.existing_session_ref:
        existing = await _user_rows(
            "ai_writing_sessions",
            user,
            extra={
                "existing_session_ref": f"eq.{payload.existing_session_ref}",
                "limit": "1",
            },
        )
        if existing:
            session = AIWritingSession(**existing[0])
    try:
        if session is None:
            session_body = {**payload.model_dump(), "user_id": user.id}
            if not payload.save_to_memory:
                session_body["content"] = None
            sessions = await user_rest(
                "POST",
                "ai_writing_sessions",
                user.access_token,
                json=session_body,
                prefer="return=representation",
            )
            session = AIWritingSession(**sessions[0])
        if payload.save_to_memory and payload.content:
            embeddings = get_embeddings_service()
            chunks: list[dict] = []
            for index, content in enumerate(chunk_text(payload.content)):
                row = AIWritingChunk(
                    user_id=user.id,
                    writing_session_id=session.id,
                    chunk_index=index,
                    content=content,
                ).model_dump(mode="json")
                if embeddings.enabled:
                    embedded = await embeddings.embed(content)
                    if embedded:
                        row["embedding"] = embedded.embedding
                        row["embedding_model"] = embedded.model
                        row["embedding_version"] = embedded.version
                chunks.append(row)
            await user_rest(
                "POST",
                "ai_writing_chunks",
                user.access_token,
                params={"on_conflict": "writing_session_id,chunk_index"},
                json=chunks,
                prefer="resolution=merge-duplicates,return=minimal",
            )
    except SupabaseAPIError as error:
        raise_http(error)
    return session


@router.post("/suggestion", response_model=AISuggestion)
async def create_suggestion(
    payload: AISuggestionRequest,
    user: AuthenticatedUser = Depends(require_ai_user),
) -> AISuggestion:
    entitlement = await _entitlement(user.id)
    date_key = today_iso()
    daily_limit = int(
        entitlement.get("daily_request_limit")
        or os.environ.get("AI_DAILY_REQUEST_LIMIT", "0")
    )
    if daily_limit:
        try:
            used = await service_rest(
                "GET",
                "ai_usage",
                params={
                    "select": "id",
                    "user_id": f"eq.{user.id}",
                    "date": f"eq.{date_key}",
                    "request_type": "eq.suggestion",
                },
            )
        except SupabaseAPIError as error:
            raise_http(error)
        if len(used) >= daily_limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Daily AI suggestion limit reached",
            )

    profile = await _user_rows("ai_profiles", user, extra={"limit": "1"})
    answers = await _user_rows(
        "ai_onboarding_answers",
        user,
        extra={"order": "updated_at.desc", "limit": "20"},
    )
    memories = await _user_rows(
        "ai_memories",
        user,
        extra={"order": "importance.desc,updated_at.desc", "limit": "30"},
    )
    previous = await _user_rows(
        "ai_suggestions",
        user,
        extra={"order": "created_at.desc", "limit": "15"},
    )

    query_parts = [
        payload.current_writing or "",
        payload.current_project or "",
    ]
    if not any(query_parts):
        # Seed retrieval with the user's stated goal so a first-time suggestion
        # still surfaces relevant private context.
        if profile:
            query_parts.append(profile[0].get("writing_goal") or "")
            query_parts.extend(profile[0].get("primary_topics") or [])
    query = "\n".join(part for part in query_parts if part).strip()
    retrieved = await retrieve_user_chunks(user.id, query) if query else []

    context, source_ids = _compose_prompt_context(
        payload, profile, answers, memories, previous, retrieved
    )

    # Phase-13 cold-start seam: if the user's private knowledge base is empty
    # (no profile fields, no onboarding answers, no memories, no retrieval
    # results) skip the model call entirely and return a friendly basic
    # suggestion. This saves tokens and gives a better first-time experience
    # than a hallucinated "personalized" response.
    profile_populated = bool(profile) and any(
        (profile[0].get(field) for field in (
            "writing_goal", "writing_style", "audience", "personal_context",
            "primary_topics", "current_projects", "favorite_subjects",
        ))
    )
    knowledge_empty = (
        not retrieved
        and not memories
        and not answers
        and not profile_populated
        and not (payload.current_writing or payload.current_project)
    )

    provider = get_suggestion_provider()
    response: SuggestionProviderResponse
    used_fallback = False
    fallback_reason: str | None = None
    if knowledge_empty:
        response = await MockSuggestionProvider(provider.model).generate_suggestion(context)
        used_fallback = True
        fallback_reason = "cold_start"
    else:
        try:
            response = await provider.generate_suggestion(context)
        except Exception as error:  # noqa: BLE001 - explicit fallback surface
            logger.warning(
                "suggestion_provider_failed provider=%s model=%s error=%s",
                provider.name,
                provider.model,
                error,
            )
            # Phase-13 basic fallback: never let the endpoint 5xx for the extension.
            response = await MockSuggestionProvider(provider.model).generate_suggestion(context)
            used_fallback = True
            fallback_reason = "provider_error"

    try:
        rows = await user_rest(
            "POST",
            "ai_suggestions",
            user.access_token,
            json={
                "user_id": user.id,
                "title": response.result.title,
                "suggestion": response.result.suggestion,
                "reason": response.result.why,
                "context_summary": context[:2000],
                "related_topics": response.result.related_topics,
                "source_ids": source_ids,
                "status": "shown",
            },
            prefer="return=representation",
        )
    except SupabaseAPIError as error:
        raise_http(error)

    if used_fallback:
        request_type = f"suggestion_fallback_{fallback_reason}" if fallback_reason else "suggestion_fallback"
    else:
        request_type = "suggestion"
    await _record_usage(
        user.id,
        request_type=request_type,
        model=provider.model,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
        provider="mock" if used_fallback else provider.name,
    )
    return AISuggestion(**rows[0])


@router.post("/feedback", response_model=AIFeedback, status_code=status.HTTP_201_CREATED)
async def create_feedback(
    payload: AISuggestionFeedbackCreate,
    user: AuthenticatedUser = Depends(require_ai_user),
) -> AIFeedback:
    owned = await _user_rows(
        "ai_suggestions",
        user,
        extra={"id": f"eq.{payload.suggestion_id}", "limit": "1"},
    )
    if not owned:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Suggestion not found")
    try:
        rows = await user_rest(
            "POST",
            "ai_feedback",
            user.access_token,
            json={"user_id": user.id, **payload.model_dump()},
            prefer="return=representation",
        )
        await user_rest(
            "PATCH",
            "ai_suggestions",
            user.access_token,
            params={
                "id": f"eq.{payload.suggestion_id}",
                "user_id": f"eq.{user.id}",
            },
            json={"status": "accepted" if payload.helpful else "rejected"},
            prefer="return=minimal",
        )
    except SupabaseAPIError as error:
        raise_http(error)
    return AIFeedback(**rows[0])


@router.get("/usage", response_model=list[AIUsageEvent])
async def list_usage(
    user: AuthenticatedUser = Depends(require_ai_user),
) -> list[AIUsageEvent]:
    rows = await _user_rows(
        "ai_usage",
        user,
        extra={"order": "created_at.desc", "limit": "200"},
    )
    return [AIUsageEvent(**row) for row in rows]
