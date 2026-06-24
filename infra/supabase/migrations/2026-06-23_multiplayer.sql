-- Multiplayer challenges + notifications.
-- Idempotent — safe to re-run.

-- ============================================================
-- Challenges: extend for true multiplayer
-- ============================================================
-- New status values + columns to support pending/accept/decline flow,
-- server-owned question set, and server-owned per-player progress.

do $$ begin
  alter type public.challenge_status add value if not exists 'accepted';
exception when others then null; end $$;
do $$ begin
  alter type public.challenge_status add value if not exists 'in_progress';
exception when others then null; end $$;
do $$ begin
  alter type public.challenge_status add value if not exists 'cancelled';
exception when others then null; end $$;
do $$ begin
  alter type public.challenge_status add value if not exists 'expired';
exception when others then null; end $$;

alter table public.challenges
  add column if not exists quiz_items     jsonb,                         -- frozen question set, identical for both players
  add column if not exists subject        text,                          -- display subject for the battle
  add column if not exists question_count int not null default 5,
  add column if not exists time_limit_s   int not null default 15,
  add column if not exists started_at     timestamptz,
  add column if not exists expires_at     timestamptz not null default (now() + interval '24 hours'),
  add column if not exists accepted_at    timestamptz,
  add column if not exists declined_at    timestamptz,
  add column if not exists progress_from  jsonb not null default '{"answers":[],"correct":0,"wrong":0,"completed":0,"time_taken_ms":0,"score":0,"done":false}'::jsonb,
  add column if not exists progress_to    jsonb not null default '{"answers":[],"correct":0,"wrong":0,"completed":0,"time_taken_ms":0,"score":0,"done":false}'::jsonb;

create index if not exists idx_challenges_status_expires
  on public.challenges(status, expires_at);

-- ============================================================
-- Notifications
-- ============================================================
do $$ begin
  create type public.notification_kind as enum (
    'follow',
    'friend_request',
    'friend_accept',
    'challenge_request',
    'challenge_accepted',
    'challenge_declined',
    'challenge_finished'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,  -- recipient
  actor_id      uuid references auth.users(id) on delete cascade,           -- who caused it
  kind          public.notification_kind not null,
  challenge_id  uuid references public.challenges(id) on delete cascade,
  payload       jsonb not null default '{}'::jsonb,
  read          boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_notifications_user
  on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications(user_id, read, created_at desc) where read = false;

alter table public.notifications enable row level security;
drop policy if exists notifications_read_self on public.notifications;
drop policy if exists notifications_update_self on public.notifications;
drop policy if exists notifications_delete_self on public.notifications;
create policy notifications_read_self on public.notifications
  for select using (auth.uid() = user_id);
create policy notifications_update_self on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy notifications_delete_self on public.notifications
  for delete using (auth.uid() = user_id);
