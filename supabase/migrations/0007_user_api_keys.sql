-- A user's own OpenAI key, one per user.
--
-- The key is encrypted by the API (AES-256-GCM, secret in KEY_ENCRYPTION_SECRET)
-- before it reaches this table, so the database only ever holds ciphertext.
-- Losing or changing that secret makes every row here unreadable; users then
-- save their key again.
--
-- Undo: drop table public.user_api_keys;  (run by hand; nothing else uses it)

begin;

create table if not exists public.user_api_keys (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  provider   text not null check (provider = 'openai'),
  -- both base64; iv is 12 random bytes, new on every save
  ciphertext text not null,
  iv         text not null,
  -- last 4 characters of the key, shown as sk-…abcd
  key_hint   text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only the API touches this, with the service-role key, which bypasses RLS.
-- RLS is on with no policy at all, on purpose: the browser's anon and
-- authenticated roles can neither read nor write it.
alter table public.user_api_keys enable row level security;
alter table public.user_api_keys force row level security;

revoke all on public.user_api_keys from anon, authenticated;

commit;
