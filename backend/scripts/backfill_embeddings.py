"""Backfill embeddings for UnoWord's private chunk and memory tables.

Runs against Supabase with the service-role key. For every row where
`embedding` is null, generates a `text-embedding-3-small` vector and writes it
back along with `embedding_model`/`embedding_version` provenance. Idempotent:
already-embedded rows are skipped.

Usage: `/root/.venv/bin/python -m scripts.backfill_embeddings`.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv

load_dotenv(BACKEND_DIR / ".env")

from lib.embeddings import get_embeddings_service  # noqa: E402
from lib.supabase_client import SupabaseAPIError, service_rest  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill")


TABLES: list[tuple[str, str]] = [
    ("ai_document_chunks", "content"),
    ("ai_writing_chunks", "content"),
    ("ai_memories", "memory"),
]


async def _fetch_page(table: str, text_column: str, limit: int) -> list[dict]:
    return await service_rest(
        "GET",
        table,
        params={
            "select": f"id,user_id,{text_column}",
            "embedding": "is.null",
            "limit": str(limit),
            "order": "id.asc",
        },
    )


async def _backfill_table(table: str, text_column: str, page_size: int = 25) -> int:
    embeddings = get_embeddings_service()
    if not embeddings.enabled:
        logger.error("OPENAI_API_KEY is not configured; cannot backfill %s", table)
        return 0
    total = 0
    while True:
        try:
            rows = await _fetch_page(table, text_column, page_size)
        except SupabaseAPIError as error:
            logger.error(
                "fetch_failed table=%s status=%s detail=%s",
                table,
                error.response_status,
                error.detail,
            )
            return total
        if not rows:
            break
        for row in rows:
            text = row.get(text_column) or ""
            embedded = await embeddings.embed(text)
            if not embedded:
                logger.warning("skip_empty table=%s id=%s", table, row.get("id"))
                continue
            try:
                await service_rest(
                    "PATCH",
                    table,
                    params={"id": f"eq.{row['id']}"},
                    json={
                        "embedding": embedded.embedding,
                        "embedding_model": embedded.model,
                        "embedding_version": embedded.version,
                    },
                    prefer="return=minimal",
                )
                total += 1
            except SupabaseAPIError as error:
                logger.error(
                    "update_failed table=%s id=%s status=%s detail=%s",
                    table,
                    row.get("id"),
                    error.response_status,
                    error.detail,
                )
        logger.info("progress table=%s embedded=%d", table, total)
        if len(rows) < page_size:
            break
    return total


async def main() -> None:
    if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    grand_total = 0
    for table, text_column in TABLES:
        embedded = await _backfill_table(table, text_column)
        logger.info("done table=%s embedded=%d", table, embedded)
        grand_total += embedded
    logger.info("backfill_complete embedded=%d", grand_total)


if __name__ == "__main__":
    asyncio.run(main())
