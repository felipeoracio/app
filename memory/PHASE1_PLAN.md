# UnoWord Phase 1 Architecture Audit and Plan

## What already exists

- Manifest V3 extension with only the `storage` permission.
- Popup + background service worker + content script + in-page shadow-DOM counter.
- Local typed/pasted word-count reconciliation, writing sessions, history,
  streaks, progress views, English/Spanish localization, and static prompts.
- Local demo Free/Pro toggle and local writing goals; no real accounts or billing.
- FastAPI/Mongo skeleton and a CRA frontend shell in GitHub, with no product API.

## What is reused

The extension remains the source of truth for offline writing behavior and is
not refactored into a second prompt or session system. FastAPI's `/api` router
and Pydantic contracts are reused, while Supabase Postgres/Storage/Auth becomes
the source of truth for all new AI data. Mongo is not an AI data fallback.

## What is added in this stage

- Pydantic models and matching TypeScript interfaces for profile, onboarding,
  documents/chunks, saved writing, memories, suggestions, feedback, usage, and
  readiness status.
- Supabase SQL migration with pgvector, HNSW indexes, private Storage, RLS,
  server-managed entitlements, and a user-scoped `match_ai_context` RPC.
- Fail-closed Supabase JWT boundary, deterministic provider interface,
  structured contracts, and protected `/api/ai/*` plus `/api/documents/*` routes.
- A static-safe preview page that reports provider/auth readiness without gating
  the page on a backend fetch.

## Future migrations / integrations required

Apply the included Supabase migration, connect Supabase Auth/JWKS and PostgREST,
then enable the entitlement lookup, document processor, and embedding provider.
Only then enable an external model provider and collect its server-side key.

## Environment configuration

Phase 1 uses `AI_PROVIDER=mock`, `AI_MODEL=gpt-5.4-mini`, and Supabase auth mode.
The project still needs `SUPABASE_URL`, anon/service-role keys, a Transaction
Pooler URI for migrations, and the JWT audience. No secret belongs in the extension.

## Risks and mitigations

- Local demo plan could be mistaken for billing: AI routes reject requests until
  trusted auth is configured.
- Personal data leakage: every protected query includes `user_id`; target
  ownership is checked before feedback/deletion.
- Cost growth: retrieval is bounded, chunks are stored separately, and usage is
  recorded per request; no keystroke analysis is wired.
- AI outage: existing extension behavior is local, and the foundation uses a
  deterministic provider boundary instead of making the extension dependent on
  an external service.