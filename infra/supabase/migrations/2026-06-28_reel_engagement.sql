-- Public engagement on reels in the Global Feed: persistent likes (one per
-- user per reel) and threaded-flat comments. Likes and comments are visible
-- to anyone who can read the artifact (i.e. the artifact's document must be
-- visibility='public') but the API also gates by document visibility so
-- writes can't leak engagement onto private content.
--
-- Idempotent: safe to re-run.

-- ---------- Reel likes ----------
create table if not exists public.reel_likes (
  user_id     uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, artifact_id)
);
create index if not exists idx_reel_likes_artifact
  on public.reel_likes(artifact_id, created_at desc);

-- ---------- Reel comments ----------
create table if not exists public.reel_comments (
  id          uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  body        text not null check (length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists idx_reel_comments_artifact_ts
  on public.reel_comments(artifact_id, created_at desc);

-- ===================================================================
-- Row Level Security
-- ===================================================================
alter table public.reel_likes    enable row level security;
alter table public.reel_comments enable row level security;

-- Likes: anyone authenticated can read; user manages their own row.
drop policy if exists reel_likes_read on public.reel_likes;
create policy reel_likes_read on public.reel_likes for select using (true);

drop policy if exists reel_likes_insert_self on public.reel_likes;
create policy reel_likes_insert_self on public.reel_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists reel_likes_delete_self on public.reel_likes;
create policy reel_likes_delete_self on public.reel_likes
  for delete using (auth.uid() = user_id);

-- Comments: anyone authenticated can read; author can write/edit/delete own.
drop policy if exists reel_comments_read on public.reel_comments;
create policy reel_comments_read on public.reel_comments for select using (true);

drop policy if exists reel_comments_insert_self on public.reel_comments;
create policy reel_comments_insert_self on public.reel_comments
  for insert with check (auth.uid() = user_id);

drop policy if exists reel_comments_update_self on public.reel_comments;
create policy reel_comments_update_self on public.reel_comments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists reel_comments_delete_self on public.reel_comments;
create policy reel_comments_delete_self on public.reel_comments
  for delete using (auth.uid() = user_id);

-- ===================================================================
-- Realtime: stream new comments + likes to open chat surfaces.
-- ===================================================================
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reel_comments'
  ) then
    alter publication supabase_realtime add table public.reel_comments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reel_likes'
  ) then
    alter publication supabase_realtime add table public.reel_likes;
  end if;
end $$;
