-- Base schema, reconstructed from the live database.
-- Ordering follows the foreign keys: projects -> project_files -> everything else.

create extension if not exists "uuid-ossp";

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz default now()
);

create table if not exists public.project_files (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  file_name        text not null,
  storage_path     text not null,
  file_id          text not null,
  status           text,
  summary          text,
  is_summary_exist boolean not null default false,
  metadata         jsonb default '{}'::jsonb,
  image_paths      jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);

-- One row per OCR'd page. The unique constraint is required: storeDocumentPages
-- upserts with onConflict "document_id,page_number" and silently writes nothing
-- without it.
create table if not exists public.document_pages (
  id                 uuid primary key default gen_random_uuid(),
  document_id        uuid not null references public.project_files (id) on delete cascade,
  page_number        integer not null,
  ocr_text           text not null,
  char_count         integer not null,
  extraction_method  text not null default 'ocr',
  image_storage_path text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint unique_document_page unique (document_id, page_number)
);

create index if not exists idx_document_pages_document_id on public.document_pages (document_id);
create index if not exists idx_document_pages_page_number on public.document_pages (document_id, page_number);
create index if not exists idx_document_pages_created_at  on public.document_pages (created_at desc);

-- One conversation per user per project; getOrCreateConversation relies on this.
create table if not exists public.chat_conversations (
  id         uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text default 'New Conversation',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint unique_user_project_conversation unique (project_id, user_id)
);

create index if not exists idx_conversations_project on public.chat_conversations (project_id);
create index if not exists idx_conversations_user    on public.chat_conversations (user_id);
create index if not exists idx_conversations_updated on public.chat_conversations (updated_at desc);

create table if not exists public.chat_messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  role            text not null,
  content         text not null,
  query_embedding jsonb,
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz default now()
);

create index if not exists idx_messages_conversation on public.chat_messages (conversation_id, created_at);
create index if not exists idx_messages_created      on public.chat_messages (created_at desc);
create index if not exists idx_messages_role         on public.chat_messages (role);

-- file_name and text_snippet are denormalised on purpose so a transcript still
-- reads correctly after the source file changes.
create table if not exists public.chat_citations (
  id               uuid primary key default uuid_generate_v4(),
  message_id       uuid not null references public.chat_messages (id) on delete cascade,
  document_id      uuid not null references public.project_files (id) on delete cascade,
  file_name        text not null,
  page_number      integer,
  chunk_index      integer not null,
  similarity_score real not null,
  text_snippet     text not null,
  created_at       timestamptz default now()
);

create index if not exists idx_citations_message    on public.chat_citations (message_id);
create index if not exists idx_citations_document   on public.chat_citations (document_id);
create index if not exists idx_citations_similarity on public.chat_citations (similarity_score desc);
