-- Phase 11: user-scoped, service-role-safe retrieval RPC and embedding provenance columns.
-- The existing match_ai_context RPC relies on auth.uid() (security invoker) and cannot
-- be called with a service-role key. The new function is security definer with an
-- explicit p_user_id predicate inside the SQL body, so it works whether FastAPI
-- forwards the user JWT or uses the service role, without ever leaking cross-user rows.

alter table public.ai_document_chunks
  add column if not exists embedding_model text,
  add column if not exists embedding_version text;

alter table public.ai_writing_chunks
  add column if not exists embedding_model text,
  add column if not exists embedding_version text;

alter table public.ai_memories
  add column if not exists embedding_model text,
  add column if not exists embedding_version text;

create or replace function public.match_user_chunks(
  p_user_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_threshold float default 0.55,
  p_match_count integer default 8
)
returns table (
  source_type text,
  source_id uuid,
  parent_id uuid,
  content text,
  similarity float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select matched.source_type, matched.source_id, matched.parent_id, matched.content, matched.similarity
  from (
    select 'document_chunk'::text as source_type, c.id as source_id, c.document_id as parent_id,
      c.content, 1 - (c.embedding <=> p_query_embedding) as similarity
    from public.ai_document_chunks c
    where c.user_id = p_user_id and c.embedding is not null
    union all
    select 'writing_chunk'::text, w.id, w.writing_session_id,
      w.content, 1 - (w.embedding <=> p_query_embedding)
    from public.ai_writing_chunks w
    where w.user_id = p_user_id and w.embedding is not null
    union all
    select 'memory'::text, m.id, null::uuid,
      m.memory, 1 - (m.embedding <=> p_query_embedding)
    from public.ai_memories m
    where m.user_id = p_user_id and m.embedding is not null
  ) matched
  where matched.similarity >= p_match_threshold
  order by matched.similarity desc
  limit greatest(1, least(p_match_count, 20));
$$;

grant execute on function public.match_user_chunks(uuid, extensions.vector, float, integer) to authenticated;
grant execute on function public.match_user_chunks(uuid, extensions.vector, float, integer) to service_role;
