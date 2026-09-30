"""OpenAI embeddings service for UnoWord's private-per-user RAG pipeline.

All calls run server-side. The API key never leaves FastAPI, and callers pass
already-authorised text (a user's own document chunk, saved writing chunk, or
memory) or a query. The embedding model and version stamped on each vector let
future model swaps be identified and backfilled selectively.
"""

from __future__ import annotations

import logging
import os
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
    ) -> None:
        self._model = model
        self._version = version
        self._client: AsyncOpenAI | None = AsyncOpenAI(api_key=api_key) if api_key else None

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
        try:
            response = await self._client.embeddings.create(
                model=self._model,
                input=value[:8000],
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
        )
    return _service
