-- Row Level Security for projects and project_files.
--
-- These two tables had RLS disabled. The anon key is public by design (it ships
-- in the frontend bundle), so with RLS off any visitor could read and write every
-- row. The .eq('user_id', ...) filters in the frontend are convenience, not a
-- control: a caller can simply omit them.
--
-- The API uses the service-role key, which bypasses RLS, so backend behaviour
-- does not change.

begin;

-- An owner column that can be null cannot be enforced. Verified 0 null rows before adding this.
alter table public.projects
  alter column user_id set not null;

alter table public.projects       enable row level security;
alter table public.project_files  enable row level security;

-- Deny access even to the table owner unless a policy matches.
alter table public.projects       force row level security;
alter table public.project_files  force row level security;

drop policy if exists projects_select_own on public.projects;
drop policy if exists projects_insert_own on public.projects;
drop policy if exists projects_update_own on public.projects;
drop policy if exists projects_delete_own on public.projects;

create policy projects_select_own on public.projects
  for select to authenticated
  using (auth.uid() = user_id);

-- with check stops a client claiming a row for someone else: the frontend
-- sends user_id itself when creating a project.
create policy projects_insert_own on public.projects
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy projects_update_own on public.projects
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy projects_delete_own on public.projects
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists project_files_select_own on public.project_files;
drop policy if exists project_files_insert_own on public.project_files;
drop policy if exists project_files_update_own on public.project_files;
drop policy if exists project_files_delete_own on public.project_files;

create policy project_files_select_own on public.project_files
  for select to authenticated
  using (auth.uid() = user_id);

-- The project must also belong to the caller, otherwise a user could attach a
-- file they own to someone else's project.
create policy project_files_insert_own on public.project_files
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

create policy project_files_update_own on public.project_files
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy project_files_delete_own on public.project_files
  for delete to authenticated
  using (auth.uid() = user_id);

commit;
