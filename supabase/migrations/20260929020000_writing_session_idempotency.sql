-- A queued extension retry must not duplicate the same completed session.
create unique index if not exists ai_writing_sessions_user_ref_unique
  on public.ai_writing_sessions (user_id, existing_session_ref)
  where existing_session_ref is not null;