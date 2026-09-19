-- Why a document failed, so the UI can say more than "failed".
--
-- Processing moved out of the request cycle: the endpoint returns 202 and the
-- pipeline runs in the background, so the error can no longer be delivered in
-- the HTTP response.

alter table public.project_files
  add column if not exists processing_error text;

-- Startup reaper looks for rows stuck in processing.
create index if not exists idx_project_files_status
  on public.project_files (status)
  where status = 'processing';
