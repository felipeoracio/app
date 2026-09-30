# Uno Word — PRD

## Source
- Repo cloned from https://github.com/felipeoracio/unowordv2.git into `/app` on 2026-09-29.
- Mongo removed (per user instruction). Persistence is Supabase Postgres (RLS + pgvector) + Supabase Auth + Supabase Storage (`ai-documents`).

## Stack
- Backend: FastAPI (uvicorn), async httpx, pyjwt, openai==1.99.9. Runs on `0.0.0.0:8001` under supervisor.
- Frontend: Vite + React 19 + TS + Tailwind v4 + shadcn (Base UI). Runs on `:3000` via `yarn start` (aliased to `vite`) under supervisor.
- DB: Supabase project `jvcbpnmtnjhftpukgppw` (pooler URL configured, migrations current: foundation + writing-session idempotency + document-processing-errors + `20260929040000_rag_match_user_chunks`).

## Phase 11 — RAG / Personalized Context (implemented 2026-09-29)
- New migration `20260929040000_rag_match_user_chunks.sql`:
  - Added `embedding_model` / `embedding_version` columns to `ai_document_chunks`, `ai_writing_chunks`, `ai_memories`.
  - Added `public.match_user_chunks(uuid, vector(1536), float, int)` — `security definer`, unions the 3 sources, enforces `user_id` predicate inside SQL so it works with the service-role key without cross-user leakage.
- `backend/lib/embeddings.py`: async OpenAI embeddings service (`text-embedding-3-small`, 1536-dim, provenance stamped).
- `backend/lib/retrieval.py`: embeds the query, calls `match_user_chunks` via service-role REST, dedupes by parent, returns typed chunks. Retrieved text is delimited and instructed as untrusted context.
- `backend/lib/ai_provider.py`: OpenAI Responses/Chat structured-outputs provider (JSON schema for `title` / `suggestion` / `why` / `related_topics[]`) + Mock provider for the Phase-13 fallback.
- `routers/ai.py`:
  - `/api/ai/memories POST` embeds on ingest.
  - `/api/ai/writing-sessions POST` embeds each chunk on ingest.
  - `/api/ai/suggestion POST`: auth → entitlement + daily-limit check → retrieve → compose (Phase-12 system prompt) → OpenAI structured output → persist `ai_suggestions` with `source_ids` from retrieval → write `ai_usage` row (`suggestion` or `suggestion_fallback`). Any provider/embedding failure falls back silently to the mock provider (Phase-13 basic prompt).
  - `/api/ai/status` reports `retrieval_ready` based on both Supabase and OPENAI_API_KEY presence.
  - `/api/ai/usage GET` returns per-user usage.
- `routers/documents.py`: document chunks embedded on upload.
- `backend/scripts/backfill_embeddings.py`: one-shot backfill for pre-Phase-11 rows in `ai_document_chunks`, `ai_writing_chunks`, `ai_memories`.

## Verification
- `python -c "import server"` — OK.
- `yarn typecheck` — OK.
- `/api/` returns 200. `/api/ai/status` reports `provider=openai`, `retrieval_ready=true`.
- `/api/ai/suggestion` end-to-end with a Pro-entitled test user: memory persisted, retrieval executed, OpenAI call attempted, response persisted with `source_ids`, usage row written.
- **BLOCKER**: the provided `OPENAI_API_KEY` returns HTTP 429 `credit_balance_exhausted` for both `text-embedding-3-small` and `gpt-5.4-mini`, so retrieval silently returns empty and the suggestion currently comes from the mock fallback path. Add credits at platform.openai.com/settings/organization/billing/ or switch to the Emergent Universal LLM key to enable real embeddings + suggestions.

## Users / auth
- Two Pro-entitled Supabase Auth users seeded via `scripts/seed_supabase_test_users.py`. Credentials in `/app/memory/test_credentials.md`.

## Deferred (per user's plan, out of scope for Phase 11)
- Document Preview UI, Memory Review UI (Phases 17-18).
- OCR / image ingestion (Phase 16).
- Feedback UI wiring (Phase 7).
- New onboarding UI (Phase 17).
- Un-mocking anything outside the suggestion + embeddings path.

## Phase 12 — Extension wiring (implemented 2026-09-29)
- Extension bumped to `0.8.0`.
- `background.js`: added `requestAISuggestion({currentWriting, currentProject})` and `GET_AI_SUGGESTION` message that authenticates via existing session cookie, POSTs `/api/ai/suggestion`, and returns `{ ok, suggestion, reason }`. Non-fatal failures map to `auth_required` / `plan_required` / `rate_limited` / `offline`.
- `popup.html` / `popup.css`: added an AI card inside the existing prompt panel (title, suggestion, expandable "Why this", related-topic chips, subtle loading + fallback status line). All new elements have `data-testid`.
- `popup.js`: `renderPrompt()` now tries the AI endpoint first for authenticated + AI-entitled + online users, and silently falls back to the existing static prompt library on any failure (Phase-13 seam). The "Another" button re-requests a personalized suggestion in AI mode, or picks a new static prompt otherwise.
- i18n (en + es): added `prompt.ai.eyebrow`, `prompt.ai.why`, `prompt.ai.loading`, `prompt.ai.another`, `prompt.ai.fallback`, `prompt.ai.error`.
- Smoke test with the Pro-entitled test user confirms `/api/ai/suggestion` returns `title` / `suggestion` / `reason` / `related_topics` populated with real personalized RAG content.

## Phase 13 — Basic-prompt fallback seam (implemented 2026-09-29)
- Extension bumped to `0.8.1`.
- Backend cold-start seam in `routers/ai.py`: if the user has no profile fields, no onboarding answers, no memories, no retrieval results and no current draft/project, `/api/ai/suggestion` skips the OpenAI call entirely, returns the deterministic basic suggestion, and records `ai_usage.request_type='suggestion_fallback_cold_start'`. Existing runtime failures now record `suggestion_fallback_provider_error`.
- Backend `OpenAISuggestionProvider` now uses a 15-second SDK timeout so slow OpenAI responses trigger the same silent fallback instead of hanging the popup.
- Extension `popup.js` now has a single `getNextPrompt({draft, project})` seam. `renderPrompt()` and the "Another" handler both go through it. The status line is only shown for genuinely noisy failures (`offline`, `rate_limited`, `request_failed`); expected states (unauthenticated, non-entitled) render the plain static path silently.
- Smoke test: seeded a brand-new cold-start user; empty-payload `/api/ai/suggestion` returned the basic prompt with `suggestion_fallback_cold_start` usage row and zero OpenAI cost. Populated user still returns real personalized RAG output with token counts.

## Pricing + Feedback Loop (implemented 2026-09-29)
- Extension bumped to `0.9.0`.
- Pro plan is now `$20 / month with a 7-day free trial`. Free plan no longer lists AI features — AI is Pro-only (already enforced server-side via `require_ai_user` → `ai_entitlements.plan in {pro, premium}` with `status in {active, trialing}`). Updated `upgrade.pro.price`, `upgrade.pro.trial`, and added `upgrade.pro.f7` (AI Writing Coach feature) in both English and Spanish. "Try Pro" button relabeled to "Start free 7-day trial".
- Feedback UI wired on the AI card:
  - Thumbs-up posts `{ helpful: true }` to `/api/ai/feedback` and flips `ai_suggestions.status` to `accepted`.
  - Thumbs-down reveals a chip picker (already_written, not_interested, wrong_direction, too_personal, too_vague, other); selecting a chip posts `{ helpful: false, reason }` and flips `ai_suggestions.status` to `rejected`.
  - Success shows a subtle thanks line; error is retryable.
  - All new elements have `data-testid` attributes (thumbs, reason chips, thanks line).
  - Background service worker exposes a `SEND_AI_FEEDBACK` message that routes through the existing cookie-authenticated `WCApi.post('/ai/feedback', ...)`.
- End-to-end smoke test confirmed: thumbs-up creates an `ai_feedback` row with `helpful=true`; thumbs-down + reason creates an `ai_feedback` row with the correct reason and flips the parent `ai_suggestions.status` to `rejected`.

## Feedback-aware retrieval (implemented 2026-09-29)
- `lib/retrieval.py` now builds a per-source-id score map from the user's last 100 accepted/rejected suggestions (`ACCEPT_INC=+1.0`, `REJECT_INC=-1.5`, clamped to ±3.0), then reranks retrieval candidates by `adjusted = similarity + FEEDBACK_WEIGHT * tanh(score / CLAMP)`. `FEEDBACK_WEIGHT=0.12`, `MIN_ADJUSTED_SIMILARITY=0.35` (drops candidates whose adjusted score falls below the retrieval floor). Parents share a softened bias with their siblings.
- Retrieval overfetches (`match_count * 2`, capped at 20) so the reranker has room to drop losers without returning fewer chunks than requested.
- End-to-end verified: on an isolated Pro test user with 3 seeded memories, a **thumbs-down** dropped the two weaker matches entirely and left only the top one (still relevant enough to survive); a **thumbs-up** on the same suggestion (state reset) boosted the top match's adjusted similarity from ~0.66 to 0.71.

## Env keys (all in backend/.env)
`CORS_ORIGINS`, `AI_AUTH_MODE=supabase`, `AI_PROVIDER=openai`, `AI_MODEL=gpt-5.4-mini`, `OPENAI_CHAT_MODEL`, `OPENAI_EMBED_MODEL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_DB_URL`, `SUPABASE_JWT_AUDIENCE`, `OPENAI_API_KEY`, `AI_REQUIRE_SUBSCRIPTION`, optional `AI_DAILY_REQUEST_LIMIT`.

## Reload + reconnect (2026-06, this workspace)
- Loaded `unowordv2` repo into `/app`, replacing the default farm-ts template. Frontend = Vite+React 19+TS (`yarn start` → vite on :3000, proxies `/api` → :8001). Backend deps + frontend deps installed.
- Reconnected to Supabase project `jvcbpnmtnjhftpukgppw` and OpenAI. `SUPABASE_JWT_AUDIENCE` reconciled to `authenticated` (user-provided value was the JWT secret).
- Migrations current (foundation + idempotency + processing-errors + rag + Phase 14). Two Pro test users re-seeded.
- Verified live: `/api/ai/status` → provider=openai, database_configured=true, retrieval_ready=true; login→me→embed memory→**real** gpt-5.4-mini RAG suggestion (not fallback); frontend System Status card reads the live backend. Basic-prompt (mock) fallback seam intact for cold-start / provider-error / offline.

## Phase 14 — Security & Privacy hardening (implemented 2026-06)
- **Audit findings**: all 11 AI tables have RLS + owner-only (`auth.uid()=user_id`) policies; `ai_usage`/`ai_entitlements` are select-only for authenticated (writes via service role). Storage bucket `ai-documents` is private with 4 owner-scoped (`foldername[1]=auth.uid()`) policies. Secrets (OpenAI + service-role) live only in backend/.env; frontend uses relative `/api`, no client-side secrets. Every AI request verifies the Supabase JWT server-side (`require_user`) + entitlement (`require_ai_user`).
- **Fixed cross-user leak vector**: `match_user_chunks` (SECURITY DEFINER, takes `p_user_id`) was granted to `authenticated`, letting any signed-in user call it via PostgREST with another user's UUID and bypass RLS. New migration `20260930000000_phase14_security_hardening.sql` revokes execute from public/anon/authenticated (leaving only `service_role`) and adds an in-body authz guard (caller must be `service_role` per `auth.jwt()->>'role'`, else `auth.uid()=p_user_id`). Also re-asserts the bucket as private.
- **Verification** (`scripts/phase14_verify_isolation.py`, live against Supabase): 18/18 pass — A cannot read B's rows in any of the 11 tables (RLS), A's unfiltered reads exclude B's secret, B cannot spoof-write as A (with check), A is denied the retrieval RPC for B's id AND for its own id (no authenticated grant), bucket has no public URL, and the backend service-role retrieval still works for the legitimate owner. Backend pytest: 23 passed.

## Phase 2 — Extension AI wiring + embedding backfill (2026-06)
- Confirmed the extension popup is already wired to the personalized suggestion output + feedback controls: `getNextPrompt` fetch-vs-static seam, `renderAISuggestion` AI card, thumbs up/down + reason chips → `SEND_AI_FEEDBACK` → `/api/ai/feedback`. All 85 extension unit tests pass (engine/api-client/ai-profile/history/memory-queue).
- Ran `scripts/backfill_embeddings.py`: embedded 6 pre-Phase-11 rows (2 `ai_document_chunks` + 4 `ai_memories`). Now 0 rows missing embeddings; provenance (`embedding_model`/`embedding_version`) stamped on all. Live suggestion for a test user retrieves the backfilled content (5 sources).

## Phase 3 (part) — Usage meter + richer onboarding (2026-06)
- **Usage meter**: new backend `GET /api/ai/usage/summary` (`require_ai_user`) → `{date, plan, daily_limit, used_today, total_today, remaining}`; only real `suggestion` events count toward the limit (matches enforcement). Extension AI Settings shows an "AI usage today" row with meta + progress bar (`ai-usage-meta`/`ai-usage-bar`), loaded in `openSettings`, rendered in `renderSettings`; i18n en+es. Verified live: 2/100 used, 98 left; unauth→401; pytest 23 passed.
- **Richer onboarding**: extended the local AI profile draft + `toApiProfile`/`fromApiProfile`/`hasPersonalization` with `writingStyle`, `primaryTopics`, `favoriteSubjects`, `personalContext`; added the four guided fields to the pro-onboarding AI step (`onboard-ai-style/topics/subjects/context`) with populate/capture + i18n en+es. Backend `PUT /api/ai/profile` round-trips all richer fields. Extension unit tests: 89 pass (ai-profile now 14). JS syntax + testids verified.
- NOTE: the Chrome extension cannot be browser-loaded in this environment (packaging is out of scope), so these were verified via backend curl, extension unit tests, JS syntax checks, and testid presence — not a live in-browser click-through.

## Phase 15 — Performance & Cost (2026-06)
- **Inspection result**: most Phase-15 requirements already existed — pgvector semantic retrieval (`match_user_chunks`), chunking, relevance filtering (`match_threshold`, `MIN_ADJUSTED_SIMILARITY`, feedback rerank), limited context (top-K=8, per-chunk `[:600]`, `parts[:80]`), configurable model (env), and AI only on meaningful events (suggestion is an explicit POST; embeddings run on document processing / writing-save / memory — never per keystroke; extension counts words locally). The full document collection is never sent.
- **Added (2 gaps closed, no redesign)**:
  1. **Embedding cache** (`lib/embeddings.py`): bounded in-memory LRU keyed by `model:sha256(text)` so identical text (e.g. the repeated suggestion query, re-processed chunks) is never re-embedded. Env `AI_EMBED_CACHE_SIZE` (default 512). Exposes `cache_hits`/`cache_misses`.
  2. **Context budget** (`routers/ai.py::_compose_prompt_context`): `current_writing` capped to `AI_MAX_DRAFT_CHARS` (2000) and the total composed prompt hard-capped to `AI_MAX_CONTEXT_CHARS` (6000), so a long draft or growing memory set can't inflate token cost. (The request model already bounds `current_writing` at 20k.)
- Deliberately NOT added: response caching / summaries (would break "Give Me Another" variety and over-engineer, against Phase 20).
- New env: `AI_EMBED_CACHE_SIZE`, `AI_MAX_DRAFT_CHARS`, `AI_MAX_CONTEXT_CHARS`.
- **Verified**: `tests/test_phase15_cost.py` — identical query embeds once (cache hit), context stays ≤ budget and full draft is never shipped. Full backend suite 32 passed. Live suggestion still returns a real personalized result.

## Phase 16 — Future Document Support (2026-06)
- **Inspection**: `lib/document_processing.py` had a monolithic `extract_document()` with an if/elif over extensions (TXT/MD/PDF/DOCX). No OCR/image infra (scanned docs already returned a "future OCR processor" message).
- **Refactor (pluggable, no behavior change)**: introduced a processor registry — `DocumentProcessor` base + `TextProcessor`/`PdfProcessor`/`DocxProcessor`, `register_processor()` and `supported_extensions()`. `extract_document()` now only dispatches by extension. A new format (RTF, or a future OCR/image processor) plugs in by subclassing + registering — no change to the dispatcher, router, storage, chunking, or embedding flow. All constants (`MAX_UPLOAD_BYTES`, `MAX_PDF_PAGES`, `MIME_BY_EXTENSION`) and error messages preserved.
- **OCR/images intentionally NOT implemented** (no such infrastructure); images/unknown formats reject with "Supported formats … Images/scanned documents need a future OCR processor".
- **Verified**: `tests/test_phase16_pipeline.py` (default processors registered, images/unknown rejected, a new `.unotest` processor plugs in and dispatches). Full backend suite 36 passed. Live `.md` upload processed to `ready` (text/markdown) end-to-end.

## Phase 17 — User Experience: AI onboarding flow (2026-06)
- **Inspection**: the paid onboarding already had a dedicated AI step (step 4 of 5, `pro-step-ai`) with the 8 questions, a privacy note, and Skip. Phase-17 gaps were copy/UX only.
- **Changes (copy/UX, no redesign, reuse existing `wc__privacy-note` styling)** in `extension/popup/popup.html` + `shared/i18n.js` (EN+ES):
  - Welcome heading → "Welcome to UnoWord AI" + subtitle "Let's get to know your writing. Share only what you'd like — it's optional."
  - Reworded the open reflection question to "What experiences have shaped your perspective — or anything else UnoWord should understand?" (maps to `personal_context`).
  - Added a **document-upload explainer** box (`onboard-ai-upload-note/title/copy`): you can upload PDF/Word/text/Markdown in AI settings to give UnoWord more context.
  - **Exact privacy wording**: "UnoWord uses the information you provide to build your private writing context and personalize suggestions." + "It does not train the underlying AI model on your personal information." + the local-draft note.
- **Verified**: i18n valid, EN/ES parity for new keys, new testids present, all 5 extension test suites pass. (Extension isn't browser-loadable here — verified by inspection + syntax/tests; reload at chrome://extensions to see it.)
