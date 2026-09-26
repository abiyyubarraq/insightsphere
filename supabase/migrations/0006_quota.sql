-- Per-user daily quotas.
--
-- Signup is open and Google OAuth confirms accounts on the spot, so anyone who
-- finds the URL gets a working token. Nothing stopped one account from running
-- up OpenAI spend, filling Supabase Storage or pinning the parser. The target is
-- under $0.50 of OpenAI spend per account per day.
--
-- A user with no user_tiers row is on 'basic'. This is deliberate: the schema
-- has no profile table and no signup trigger, so a design that needs one row per
-- user would need both built and backfilled. With absence as the default, a
-- brand new account is limited correctly with no extra machinery.
--
-- Managing users:
--   lift someone     insert into user_tiers (user_id, tier) values (..., 'unlimited')
--   move someone     update that row
--   back to basic    delete that row
--   change basic     edit its rows in quota_tiers; applies on the next request
--
-- Why 'pages' exists. Document count alone bounds nothing: five 1000-page
-- documents is $0.40 of embeddings and ~1 GB of page images, which breaks both
-- the ceiling and the 1 GB storage free tier. A page budget bounds both.
--
-- Daily worst case on basic (gpt-4o-mini $0.15/1M in, $0.60/1M out;
-- text-embedding-3-small $0.02/1M):
--   chat       50 x $0.0016 (rewrite + answer + 2 embeddings)  = $0.08
--   pages     500 x $0.00008 ($0.08 per 1000 pages)             = $0.04
--   summaries   2 x ~$0.075 (large PDF)                          = $0.15
--   documents   5, bounded by pages                              =   -
--   total                                                        ~ $0.27
-- Storage: 500 pages x 215 KB ~ 107 MB per day.
--
-- The check and the increment happen in one function, called by RPC. PostgREST
-- upsert replaces values, so it cannot express count = count + 1 with a
-- conditional where; doing it from the API as read-then-write races (two
-- requests both read 49, both pass, both write 50).

begin;

create table if not exists public.quota_tiers (
  tier    text not null,
  kind    text not null check (kind in ('chat', 'documents', 'pages', 'summaries')),
  -- null means unlimited for that kind
  per_day int check (per_day is null or per_day >= 0),
  primary key (tier, kind)
);

create table if not exists public.user_tiers (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  tier       text not null,
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  kind    text not null check (kind in ('chat', 'documents', 'pages', 'summaries')),
  count   int  not null default 0,
  primary key (user_id, day, kind)
);

insert into public.quota_tiers (tier, kind, per_day) values
  ('basic',     'chat',      50),
  ('basic',     'documents', 5),
  ('basic',     'pages',     500),
  ('basic',     'summaries', 2),
  ('unlimited', 'chat',      null),
  ('unlimited', 'documents', null),
  ('unlimited', 'pages',     null),
  ('unlimited', 'summaries', null)
on conflict do nothing;

-- Only the API touches these, with the service-role key, which bypasses RLS.
-- RLS is on with no policy at all, on purpose: the browser's anon and
-- authenticated roles can neither read nor write them.
alter table public.quota_tiers    enable row level security;
alter table public.user_tiers     enable row level security;
alter table public.usage_counters enable row level security;

revoke all on public.quota_tiers    from anon, authenticated;
revoke all on public.user_tiers     from anon, authenticated;
revoke all on public.usage_counters from anon, authenticated;

create or replace function public.consume_quota(
  p_user_id uuid,
  p_kind    text,
  p_amount  int default 1
)
returns table (
  allowed    boolean,
  new_count  int,
  per_day    int,
  tier       text,
  tier_known boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_named  text;
  v_tier   text;
  v_known  boolean;
  v_limit  int;
  v_found  boolean;
  v_count  int;
  -- Explicit so the reset matches the "00:00 UTC" the user is told.
  v_day    date := (now() at time zone 'utc')::date;
begin
  if p_amount is null or p_amount < 1 then
    raise exception 'consume_quota: amount must be at least 1, got %', p_amount;
  end if;

  select ut.tier into v_named from user_tiers ut where ut.user_id = p_user_id;
  v_named := coalesce(v_named, 'basic');

  -- A typo in the dashboard must fail closed to basic, never to unlimited.
  v_known := exists (select 1 from quota_tiers qt where qt.tier = v_named);
  v_tier  := case when v_known then v_named else 'basic' end;

  select qt.per_day, true into v_limit, v_found
  from quota_tiers qt
  where qt.tier = v_tier and qt.kind = p_kind;

  -- No limit row for this kind: deny rather than guess.
  if not coalesce(v_found, false) then
    return query select false, null::int, 0, v_named, false;
    return;
  end if;

  if v_limit is null then
    -- Unlimited still counts, so heavy users stay visible.
    insert into usage_counters as uc (user_id, day, kind, count)
    values (p_user_id, v_day, p_kind, p_amount)
    on conflict (user_id, day, kind)
    do update set count = uc.count + excluded.count
    returning uc.count into v_count;

    return query select true, v_count, null::int, v_named, v_known;
    return;
  end if;

  -- The insert branch below has no where, so an amount that alone exceeds the
  -- limit (including any amount against a limit of 0) must be stopped here.
  if p_amount > v_limit then
    return query select false, null::int, v_limit, v_named, v_known;
    return;
  end if;

  -- No row back means over the limit, and nothing was incremented, so retries
  -- do not inflate the counter.
  insert into usage_counters as uc (user_id, day, kind, count)
  values (p_user_id, v_day, p_kind, p_amount)
  on conflict (user_id, day, kind)
  do update set count = uc.count + excluded.count
    where uc.count + excluded.count <= v_limit
  returning uc.count into v_count;

  return query select v_count is not null, v_count, v_limit, v_named, v_known;
end;
$$;

-- New functions are executable by PUBLIC by default, so revoking from anon and
-- authenticated alone would leave it callable through PUBLIC.
revoke execute on function public.consume_quota(uuid, text, int) from public, anon, authenticated;
grant  execute on function public.consume_quota(uuid, text, int) to service_role;

commit;
