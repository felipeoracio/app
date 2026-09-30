"""Phase 15 — Performance & Cost guards.

Unit tests (no network, no live server): prove the embedding cache avoids
paying to embed identical text twice, and that the composed AI context is
hard-bounded so a long draft or a growing memory set can never inflate cost.
"""

import asyncio
import types

from lib.embeddings import EMBEDDING_DIMENSIONS, EmbeddingsService
from models.ai import AISuggestionRequest
from routers.ai import MAX_CONTEXT_CHARS, MAX_DRAFT_CHARS, _compose_prompt_context


class _FakeEmbeddings:
    def __init__(self) -> None:
        self.calls = 0

    async def create(self, *, model, input, encoding_format):  # noqa: A002 - matches SDK
        self.calls += 1
        data = types.SimpleNamespace(embedding=[0.01] * EMBEDDING_DIMENSIONS)
        return types.SimpleNamespace(data=[data])


class _FakeClient:
    def __init__(self) -> None:
        self.embeddings = _FakeEmbeddings()


def test_embedding_cache_avoids_duplicate_calls():
    svc = EmbeddingsService(api_key="x", model="text-embedding-3-small")
    fake = _FakeClient()
    svc._client = fake  # inject a counting stub

    async def run():
        a = await svc.embed("write about the farm")
        b = await svc.embed("write about the farm")  # identical -> served from cache
        c = await svc.embed("a different query")
        return a, b, c

    a, b, c = asyncio.run(run())
    assert a and b and c
    assert fake.embeddings.calls == 2  # 2 unique texts; the repeat is cached
    assert svc.cache_hits == 1
    assert svc.cache_misses == 2
    assert a.embedding == b.embedding


def test_context_budget_caps_draft_and_total():
    huge_draft = "word " * 3000  # 15k chars (under the model's 20k input bound)
    memories = [
        {"memory_type": "note", "memory": "m" * 500, "id": f"id{i}"} for i in range(50)
    ]
    req = AISuggestionRequest(current_writing=huge_draft, current_project="memoir")

    context, source_ids = _compose_prompt_context(req, [], [], memories, [], [])

    # Total composed context never exceeds the budget (+ short truncation marker).
    assert len(context) <= MAX_CONTEXT_CHARS + 60
    # The raw draft is bounded and the full draft is never shipped.
    assert huge_draft[:MAX_DRAFT_CHARS] in context
    assert huge_draft not in context
