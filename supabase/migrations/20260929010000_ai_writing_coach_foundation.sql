-- UnoWord AI Writing Coach — Supabase/Postgres foundation
-- Apply with `supabase db push` after linking a project, or paste into the
-- Supabase SQL editor. All private data is protected by auth.uid()-scoped RLS.

create extension if not exists vector with schema extensions;

do $$ begin
  create type public.ai_document_type as enum (
    'memoir', 'journal', 'book', 'research', 'outline', 'notes',
    'personal_history', 'reference', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ai_processing_status as enum ('pending', 'processing', 'ready', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ai_memory_type as enum (
    'person', 'place', 'event', 'experience', 'interest', 'goal', 'project',
    'theme', 'unfinished_idea', 'preference', 'writing_pattern'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ai_suggestion_status as enum ('shown', 'accepted', 'rejected', 'ignored', 'written');
exception when duplicate_object then null; end $$;

create table if not exists public.ai_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  writing_goal text,
  writing_style text,
  audience text,
  primary_topics text[] not null default '{}',
  current_projects text[] not null default '{}',
  favorite_subjects text[] not null default '{}',
  avoid_topics text[] not null default '{}',
  personal_context text,
  ai_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_onboarding_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);

create table if not exists public.ai_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  file_type text not null,
  storage_path text not null,
  document_title text not null,
  document_type public.ai_document_type not null default 'other',
  processing_status public.ai_processing_status not null default 'pending',
  summary text,
  word_count integer not null default 0 check (word_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, storage_path)
);

create table if not exists public.ai_document_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.ai_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  embedding extensions.vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create table if not exists public.ai_writing_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  existing_session_ref text,
  word_count integer not null default 0 check (word_count >= 0),
  writing_duration_seconds integer not null default 0 check (writing_duration_seconds >= 0),
  content text,
  save_to_memory boolean not null default false,
  created_at timestamptz not null default now(),
  check (save_to_memory or content is null)
);

create table if not exists public.ai_writing_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  writing_session_id uuid not null references public.ai_writing_sessions(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  unique (writing_session_id, chunk_index)
);

create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_type public.ai_memory_type not null,
  memory text not null,
  importance smallint not null default 3 check (importance between 1 and 5),
  source_id uuid,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  suggestion text not null,
  reason text not null,
  context_summary text not null,
  related_topics text[] not null default '{}',
  source_ids uuid[] not null default '{}',
  status public.ai_suggestion_status not null default 'shown',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  suggestion_id uuid not null references public.ai_suggestions(id) on delete cascade,
  helpful boolean not null,
  reason text check (reason is null or reason in (
    'already_written', 'not_interested', 'wrong_direction',
    'too_personal', 'too_vague', 'other'
  )),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  request_type text not null,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost numeric(12, 6) check (estimated_cost is null or estimated_cost >= 0),
  created_at timestamptz not null default now()
);

-- Server-managed entitlement record. Clients may read their own record, but
-- only trusted backend/service-role jobs may write it.
create table if not exists public.ai_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'premium')),
  status text not null default 'inactive' check (status in ('active', 'trialing', 'inactive', 'past_due', 'canceled')),
  daily_request_limit integer not null default 0 check (daily_request_limit >= 0),
  valid_until timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$ begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists ai_profiles_set_updated_at on public.ai_profiles;
create trigger ai_profiles_set_updated_at before update on public.ai_profiles
for each row execute function public.set_updated_at();
drop trigger if exists ai_onboarding_set_updated_at on public.ai_onboarding_answers;
create trigger ai_onboarding_set_updated_at before update on public.ai_onboarding_answers
for each row execute function public.set_updated_at();
drop trigger if exists ai_documents_set_updated_at on public.ai_documents;
create trigger ai_documents_set_updated_at before update on public.ai_documents
for each row execute function public.set_updated_at();
drop trigger if exists ai_memories_set_updated_at on public.ai_memories;
create trigger ai_memories_set_updated_at before update on public.ai_memories
for each row execute function public.set_updated_at();
drop trigger if exists ai_entitlements_set_updated_at on public.ai_entitlements;
create trigger ai_entitlements_set_updated_at before update on public.ai_entitlements
for each row execute function public.set_updated_at();

create index if not exists ai_onboarding_user_updated_idx on public.ai_onboarding_answers (user_id, updated_at desc);
create index if not exists ai_documents_user_updated_idx on public.ai_documents (user_id, updated_at desc);
create index if not exists ai_document_chunks_user_document_idx on public.ai_document_chunks (user_id, document_id, chunk_index);
create index if not exists ai_writing_sessions_user_created_idx on public.ai_writing_sessions (user_id, created_at desc);
create index if not exists ai_writing_chunks_user_session_idx on public.ai_writing_chunks (user_id, writing_session_id, chunk_index);
create index if not exists ai_memories_user_updated_idx on public.ai_memories (user_id, updated_at desc);
create index if not exists ai_suggestions_user_created_idx on public.ai_suggestions (user_id, created_at desc);
create index if not exists ai_feedback_user_suggestion_idx on public.ai_feedback (user_id, suggestion_id);
create index if not exists ai_usage_user_date_idx on public.ai_usage (user_id, date desc);

create index if not exists ai_document_chunks_embedding_idx
  on public.ai_document_chunks using hnsw (embedding vector_cosine_ops)
  where embedding is not null;
create index if not exists ai_writing_chunks_embedding_idx
  on public.ai_writing_chunks using hnsw (embedding vector_cosine_ops)
  where embedding is not null;
create index if not exists ai_memories_embedding_idx
  on public.ai_memories using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

alter table public.ai_profiles enable row level security;
alter table public.ai_onboarding_answers enable row level security;
alter table public.ai_documents enable row level security;
alter table public.ai_document_chunks enable row level security;
alter table public.ai_writing_sessions enable row level security;
alter table public.ai_writing_chunks enable row level security;
alter table public.ai_memories enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.ai_feedback enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_entitlements enable row level security;

create policy "users_manage_own_ai_profiles" on public.ai_profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users_manage_own_ai_onboarding" on public.ai_onboarding_answers for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users_manage_own_ai_documents" on public.ai_documents for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users_manage_own_ai_document_chunks" on public.ai_document_chunks for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users_manage_own_ai_writing_sessions" on public.ai_writing_sessions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users_manage_own_ai_writing_chunks" on public.ai_writing_chunks for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users_manage_own_ai_memories" on public.ai_memories for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users_manage_own_ai_suggestions" on public.ai_suggestions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users_manage_own_ai_feedback" on public.ai_feedback for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users_read_own_ai_usage" on public.ai_usage for select to authenticated using (auth.uid() = user_id);
create policy "users_read_own_ai_entitlement" on public.ai_entitlements for select to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.ai_profiles to authenticated;
grant select, insert, update, delete on public.ai_onboarding_answers to authenticated;
grant select, insert, update, delete on public.ai_documents to authenticated;
grant select, insert, update, delete on public.ai_document_chunks to authenticated;
grant select, insert, update, delete on public.ai_writing_sessions to authenticated;
grant select, insert, update, delete on public.ai_writing_chunks to authenticated;
grant select, insert, update, delete on public.ai_memories to authenticated;
grant select, insert, update, delete on public.ai_suggestions to authenticated;
grant select, insert, update, delete on public.ai_feedback to authenticated;
grant select on public.ai_usage, public.ai_entitlements to authenticated;

create or replace function public.match_ai_context(
  query_embedding extensions.vector(1536),
  match_threshold float default 0.55,
  match_count integer default 8
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
security invoker
set search_path = public, extensions
as $$
  select matched.source_type, matched.source_id, matched.parent_id, matched.content, matched.similarity
  from (
    select 'document_chunk'::text as source_type, c.id as source_id, c.document_id as parent_id,
      c.content, 1 - (c.embedding <=> query_embedding) as similarity
    from public.ai_document_chunks c
    where c.user_id = auth.uid() and c.embedding is not null
    union all
    select 'writing_chunk'::text, w.id, w.writing_session_id,
      w.content, 1 - (w.embedding <=> query_embedding)
    from public.ai_writing_chunks w
    where w.user_id = auth.uid() and w.embedding is not null
    union all
    select 'memory'::text, m.id, null::uuid,
      m.memory, 1 - (m.embedding <=> query_embedding)
    from public.ai_memories m
    where m.user_id = auth.uid() and m.embedding is not null
  ) matched
  where matched.similarity >= match_threshold
  order by matched.similarity desc
  limit greatest(1, least(match_count, 20));
$$;

grant execute on function public.match_ai_context(extensions.vector, float, integer) to authenticated;

-- Private Supabase Storage bucket. Object names must begin with the user's UUID.
insert into storage.buckets (id, name, public)
values ('ai-documents', 'ai-documents', false)
on conflict (id) do update set public = false;

create policy "users_read_own_ai_document_objects" on storage.objects for select to authenticated
using (bucket_id = 'ai-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users_upload_own_ai_document_objects" on storage.objects for insert to authenticated
with check (bucket_id = 'ai-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users_update_own_ai_document_objects" on storage.objects for update to authenticated
using (bucket_id = 'ai-documents' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'ai-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users_delete_own_ai_document_objects" on storage.objects for delete to authenticated
using (bucket_id = 'ai-documents' and (storage.foldername(name))[1] = auth.uid()::text);