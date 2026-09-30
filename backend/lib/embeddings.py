"""OpenAI embeddings service for UnoWord's private-per-user RAG pipeline.

All calls run server-side. The API key never leaves FastAPI, and callers pass
already-authorised text (a user's own document chunk, saved writing chunk, or
memory) or a query. The embedding model and version stamped on each vector let
future model swaps be identified and backfilled selectively.
"""

from __future__ import annotations

import hashlib
import logging
import os
from collections import OrderedDict
from dataclasses import dataclass

from openai import AsyncOpenAI, OpenAIError

logger = logging.getLogger(__name__)

EMBEDDING_DIMENSIONS = 1536
DEFAULT_EMBED_MODEL = "text-embedding-3-small"
DEFAULT_EMBED_VERSION = "v1"


@dataclass(frozen=True)
class EmbeddingResult:
    embedding: list[float]
    model: str
    version: str


class EmbeddingsService:
    def __init__(
        self,
        *,
        api_key: str | None,
        model: str,
        version: str = DEFAULT_EMBED_VERSION,
        cache_size: int = 512,
    ) -> None:
        self._model = model
        self._version = version
        self._client: AsyncOpenAI | None = AsyncOpenAI(api_key=api_key) if api_key else None
        # Bounded LRU so we never pay to embed identical text twice (e.g. the
        # same suggestion query or a re-processed chunk). Cleared on restart.
        self._cache: "OrderedDict[str, list[float]]" = OrderedDict()
        self._cache_size = max(0, cache_size)
        self.cache_hits = 0
        self.cache_misses = 0

    def _cache_key(self, value: str) -> str:
        return f"{self._model}:{hashlib.sha256(value.encode('utf-8')).hexdigest()}"

    @property
    def enabled(self) -> bool:
        return self._client is not None

    @property
    def model(self) -> str:
        return self._model

    @property
    def version(self) -> str:
        return self._version

    async def embed(self, text: str) -> EmbeddingResult | None:
        if not self._client:
            return None
        value = (text or "").strip()
        if not value:
            return None
        value = value[:8000]
        key = self._cache_key(value)
        if self._cache_size and key in self._cache:
            self._cache.move_to_end(key)
            self.cache_hits += 1
            return EmbeddingResult(
                embedding=list(self._cache[key]), model=self._model, version=self._version
            )
        try:
            response = await self._client.embeddings.create(
                model=self._model,
                input=value,
                encoding_format="float",
            )
        except OpenAIError as error:
            logger.warning("embedding_failed model=%s error=%s", self._model, error)
            return None
        vector = response.data[0].embedding
        if len(vector) != EMBEDDING_DIMENSIONS:
            logger.error(
                "embedding_dimension_mismatch expected=%d got=%d model=%s",
                EMBEDDING_DIMENSIONS,
                len(vector),
                self._model,
            )
            return None
        self.cache_misses += 1
        if self._cache_size:
            self._cache[key] = list(vector)
            self._cache.move_to_end(key)
            while len(self._cache) > self._cache_size:
                self._cache.popitem(last=False)
        return EmbeddingResult(embedding=list(vector), model=self._model, version=self._version)

    async def embed_many(self, texts: list[str]) -> list[EmbeddingResult | None]:
        return [await self.embed(text) for text in texts]


_service: EmbeddingsService | None = None


def get_embeddings_service() -> EmbeddingsService:
    global _service
    if _service is None:
        _service = EmbeddingsService(
            api_key=os.environ.get("OPENAI_API_KEY") or None,
            model=os.environ.get("OPENAI_EMBED_MODEL", DEFAULT_EMBED_MODEL),
            cache_size=int(os.environ.get("AI_EMBED_CACHE_SIZE", "512")),
        )
    return _service
