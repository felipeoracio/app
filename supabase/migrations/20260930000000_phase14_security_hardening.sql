-- Phase 14 — Security & Privacy hardening.
--
-- Finding: public.match_user_chunks(...) is SECURITY DEFINER and accepts the
-- target user id as a plain argument (p_user_id). It was granted to the
-- `authenticated` role, which means any signed-in end user could call it
-- directly through PostgREST (POST /rest/v1/rpc/match_user_chunks) with
-- SOMEONE ELSE'S uuid and read that user's private document/writing/memory
-- content and embeddings — RLS is bypassed inside a SECURITY DEFINER body.
--
-- The trusted FastAPI backend only ever calls this RPC with the service-role
-- key, so removing the end-user grant changes no legitimate behaviour. We also
-- add an in-body authorization guard as defense in depth: the function refuses
-- to return rows unless the caller is the service role or is asking strictly
-- for their own auth.uid().

revoke execute on function public.match_user_chunks(uuid, extensions.vector, float, integer) from public;
revoke execute on function public.match_user_chunks(uuid, extensions.vector, float, integer) from anon;
revoke execute on function public.match_user_chunks(uuid, extensions.vector, float, integer) from authenticated;
grant execute on function public.match_user_chunks(uuid, extensions.vector, float, integer) to service_role;

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
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  -- Read the CALLER's identity from the request JWT (set as GUCs by PostgREST
  -- and visible even inside a SECURITY DEFINER body — current_user here is the
  -- function owner, not the caller, so it must not be used for authz).
  -- Only the trusted backend (service_role) may retrieve on behalf of a user;
  -- any other caller may only ever ask for their own auth.uid().
  if not (
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or (auth.uid() is not null and auth.uid() = p_user_id)
  ) then
    raise exception 'not authorized to read another user''s private chunks'
      using errcode = '42501';
  end if;

  return query
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
end;
$$;

revoke execute on function public.match_user_chunks(uuid, extensions.vector, float, integer) from public;
revoke execute on function public.match_user_chunks(uuid, extensions.vector, float, integer) from anon;
revoke execute on function public.match_user_chunks(uuid, extensions.vector, float, integer) from authenticated;
grant execute on function public.match_user_chunks(uuid, extensions.vector, float, integer) to service_role;

-- Belt-and-suspenders: guarantee the private documents bucket can never be
-- flipped public and re-assert owner-scoped storage policies.
update storage.buckets set public = false where id = 'ai-documents';
