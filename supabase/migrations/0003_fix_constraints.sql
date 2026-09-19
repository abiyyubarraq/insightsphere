-- Two problems the live schema had.
--
-- 1. chat_citations.document_id is NOT NULL, but its foreign key said
--    ON DELETE SET NULL. Postgres therefore refused to delete any document that
--    had ever been cited: "null value in column document_id violates not-null
--    constraint" (SQLSTATE 23502). Reproduced against the live database; it made
--    6 of 9 real files undeletable.
--
--    Cascading is the right resolution rather than making the column nullable:
--    clicking a citation opens that document's page image, and the image is
--    deleted with the document, so a citation pointing at nothing is already
--    broken from the user's point of view.
--
-- 2. project_files carried two older policies alongside the ones added in
--    0002_rls.sql. Permissive policies are OR'd together, so the pair were
--    redundant rather than harmful, but two overlapping definitions of "may I
--    read this file" is not something to leave in place.

begin;

alter table public.chat_citations
  drop constraint if exists chat_citations_document_id_fkey;

alter table public.chat_citations
  add constraint chat_citations_document_id_fkey
  foreign key (document_id) references public.project_files (id) on delete cascade;

drop policy if exists "Project member can add files"  on public.project_files;
drop policy if exists "Project member can read files" on public.project_files;

-- Was `with check (true)`: any signed-in user could attach a citation to any
-- message, including someone else's. Scope it the same way chat_messages is.
drop policy if exists "System can insert citations" on public.chat_citations;

create policy chat_citations_insert_own on public.chat_citations
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.chat_messages m
      join public.chat_conversations c on c.id = m.conversation_id
      where m.id = message_id and c.user_id = auth.uid()
    )
  );

commit;
