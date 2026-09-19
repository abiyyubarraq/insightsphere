-- RLS for document_pages and the three chat tables.
--
-- These policies already existed in the hosted project but had never been
-- committed, so a database built from this repo came up with them disabled.
-- Written as drop-then-create so it is idempotent: a no-op in effect on the
-- live database, and correct on a fresh one.
--
-- Ownership is indirect for every table here, so each policy walks back to
-- project_files.user_id or chat_conversations.user_id rather than storing a
-- duplicate user_id column.

begin;

alter table public.document_pages     enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages      enable row level security;
alter table public.chat_citations     enable row level security;

-- document_pages -----------------------------------------------------------
drop policy if exists "Users can read pages of their documents"   on public.document_pages;
drop policy if exists "Users can insert pages for their documents" on public.document_pages;
drop policy if exists "Users can update pages of their documents" on public.document_pages;
drop policy if exists "Users can delete pages of their documents" on public.document_pages;
drop policy if exists "Service role can do anything with document_pages" on public.document_pages;
drop policy if exists document_pages_own on public.document_pages;

create policy document_pages_own on public.document_pages
  for all to authenticated
  using (
    exists (
      select 1 from public.project_files f
      where f.id = document_id and f.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.project_files f
      where f.id = document_id and f.user_id = auth.uid()
    )
  );

-- chat_conversations -------------------------------------------------------
drop policy if exists "Users can view their own conversations"   on public.chat_conversations;
drop policy if exists "Users can insert their own conversations" on public.chat_conversations;
drop policy if exists "Users can update their own conversations" on public.chat_conversations;
drop policy if exists "Users can delete their own conversations" on public.chat_conversations;
drop policy if exists chat_conversations_own on public.chat_conversations;

create policy chat_conversations_own on public.chat_conversations
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- chat_messages ------------------------------------------------------------
drop policy if exists "Users can view messages in their conversations"   on public.chat_messages;
drop policy if exists "Users can insert messages in their conversations" on public.chat_messages;
drop policy if exists chat_messages_own on public.chat_messages;

create policy chat_messages_own on public.chat_messages
  for all to authenticated
  using (
    exists (
      select 1 from public.chat_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.chat_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- chat_citations -----------------------------------------------------------
drop policy if exists "Users can view citations for their messages" on public.chat_citations;
drop policy if exists chat_citations_select_own on public.chat_citations;

create policy chat_citations_select_own on public.chat_citations
  for select to authenticated
  using (
    exists (
      select 1
      from public.chat_messages m
      join public.chat_conversations c on c.id = m.conversation_id
      where m.id = message_id and c.user_id = auth.uid()
    )
  );

commit;
