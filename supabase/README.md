# UnoWord Supabase Setup

Phase 1 is migration/configuration only. No project credentials are stored in
the repository and the backend fails closed until a project is connected.

## Apply the schema

1. Create/select the UnoWord Supabase project.
2. Link the Supabase CLI to it, then run `supabase db push`, or apply
   `migrations/20260929010000_ai_writing_coach_foundation.sql` in the SQL editor.
3. Confirm the `vector` extension, private `ai-documents` bucket, tables, HNSW
   indexes, `match_ai_context` RPC, and RLS policies were created.
4. Never expose the service-role key in the Chrome extension or web frontend.

## Runtime values needed later

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (backend PostgREST calls made with the user's JWT)
- `SUPABASE_SERVICE_ROLE_KEY` (backend-only jobs such as usage writes/processors)
- `SUPABASE_DB_URL` (Transaction Pooler URI, port 6543, for migrations/admin)
- `SUPABASE_JWT_AUDIENCE=authenticated`

The future FastAPI adapter will verify Supabase access tokens against
`$SUPABASE_URL/auth/v1/.well-known/jwks.json`, then forward the user token to
PostgREST so RLS remains authoritative. Subscription access comes from
`ai_entitlements`, never from extension-local settings.