# Load UnoWord v2, reconnect it, then harden it (Phase 14: Security & Privacy)

Load the existing `unowordv2` project into this workspace (replacing the default template), reconnect it to your Supabase project and OpenAI, then run the Phase 14 security & privacy work: a full audit and hardening so no user can ever reach another user's AI data, verified with cross-user tests.

## Who it's for
The owner of UnoWord — an AI Writing Coach delivered through a Chrome extension plus a FastAPI backend and Supabase data layer. The end users are writers whose private documents, memories, and writing must stay strictly isolated from one another.

## Core features and experience
The repo already implements Phases 1–13 (accounts, AI profile/onboarding data, document upload, chunking + embeddings, saved-writing memory, long-term memories, suggestions, feedback, usage tracking, RAG retrieval, real AI suggestions, and a basic-prompt fallback). This task does two things on top of that:

1. **Make the loaded project actually run here** — reconnected to your live Supabase project and your OpenAI key, with the basic (non-AI) prompt experience still working when AI is unavailable.
2. **Phase 14 — Security & Privacy hardening** across every AI surface:
   - Every AI table (profiles, onboarding answers, documents, document chunks, writing sessions, writing chunks, memories, suggestions, feedback, usage, entitlements) enforces strict per-user access.
   - Uploaded documents in private Storage are reachable only by their owner; no public/guessable URLs.
   - The retrieval layer can never mix one user's private content into another user's AI context.
   - AI provider keys and the Supabase service-role key stay server-side only, never in the extension or web client.
   - Server-side verification of the signed-in user on every AI request.

## User flow (unchanged by this task, protected by it)
1. A writer signs in.
2. They upload documents / save writing / answer onboarding; it's stored privately and embedded.
3. They ask "What should I write about next?" and the coach retrieves only their own relevant context and returns one personalized suggestion.
4. They give feedback; usage is tracked against their plan.
Phase 14 guarantees every step above only ever touches the signed-in user's own data.

## UI/UX feel
Preserved exactly as it exists in the repo. This task is load + reconnect + security hardening — no redesign, no new screens. The existing extension popup, word counting, sessions, progress, and prompt UI stay as they are.

## Implementation phases

### Phase 1 — MVP (built now)
- Replace the current default template with the `unowordv2` repo contents (backend, frontend, extension, supabase, memory, tests, config).
- Reconnect to your existing Supabase project (`jvcbpnmtnjhftpukgppw`) using the credentials you provided; confirm all migrations are applied.
- Wire your OpenAI key so real suggestions/embeddings run, with the basic-prompt fallback intact if AI is unavailable.
- Confirm backend and frontend come up cleanly and the app opens.
- **Phase 14 Security & Privacy:** audit every AI table and Storage bucket, harden per-user isolation (row-level access + storage access + retrieval scoping + server-side auth), keep all secret keys server-side, then verify with cross-user tests proving user A cannot read user B's documents, memories, writing, profile, onboarding, suggestions, feedback, or embeddings.

### Phase 2 — later
- Wire the extension popup to the personalized suggestion output and the feedback controls (the repo's own listed next step).
- Backfill embeddings for any rows created during the earlier mocked phase.

### Phase 3 — later
- Usage meter in AI settings, richer onboarding UI, and any further phases (15–20) you prioritize after the loaded app is confirmed healthy and locked down.

## Assumptions
- "Load the repo" means the current default template is discarded and the repo's `main` branch becomes the workspace content.
- The existing Supabase project is reused as-is; its 4 migrations already define the schema, RLS, pgvector, and the private `ai-documents` bucket. Phase 14 tightens/verifies these rather than rebuilding them.
- The `SUPABASE_JWT_AUDIENCE` value you provided will be reconciled against what the backend expects (the repo assumes `authenticated`); if it's actually a different setting, I'll correct it during reconnect. This does not change scope.
- The OpenAI key you provided is used server-side only; models stay `gpt-5.4-mini` (suggestions) and `text-embedding-3-small` (embeddings), configurable via environment.
- The browser extension is loaded and wired at the backend/API level; packaging/installing it into a browser is out of scope for this task.
- Cross-user isolation is verified with test accounts (the repo already ships test credentials); no real user data is required.
- All secrets you shared are stored only in server-side environment configuration, never committed or exposed to the client.
