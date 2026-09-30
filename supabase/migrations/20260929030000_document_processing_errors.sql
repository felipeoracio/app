alter table public.ai_documents
  add column if not exists processing_error text;