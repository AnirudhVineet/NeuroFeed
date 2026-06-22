-- Social layer: profiles, follows, friends, challenges, bookmarks,
-- path progress, doc visibility, privacy, social activity. Idempotent so the
-- file can be re-run; intended for both fresh projects and projects that
-- already have the base schema.
--
-- Run after infra/supabase/schema.sql.

-- ---------- Profiles: extend the existing table with social fields ----------
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists college text;
alter table public.profiles add column if not exists pronouns text;
alter table public.profiles add column if not exists subjects text[] default '{}';
alter table public.profiles add column if not exists avatar_seed text;
alter table public.profiles add column if not exists is_public boolean not null default true;
alter table public.profiles add column if not exists hidden_activity boolean not null default false;

create unique index if not exists idx_profiles_username
  on public.profiles (lower(username))
  where username is not null;

-- Helpful index for discover-by-subject.
create index if not exists idx_profiles_subjects on public.profiles using gin (subjects);

-- ---------- Follows ----------
create table if not exists public.follows (
  follower uuid not null references auth.users(id) on delete cascade,
  followee uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index if not exists idx_follows_followee on public.follows(followee, created_at desc);
create index if not exists idx_follows_follower on public.follows(follower, created_at desc);

-- ---------- Friend requests ----------
do $$ begin
  create type public.friend_req_status as enum ('pending', 'accepted', 'declined', 'canceled');
exception when duplicate_object then null; end $$;

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  status public.friend_req_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user <> to_user)
);
create unique index if not exists idx_friend_req_pending_unique
  on public.friend_requests (from_user, to_user)
  where status = 'pending';
create index if not exists idx_friend_req_to on public.friend_requests(to_user, status, created_at desc);
create index if not exists idx_friend_req_from on public.friend_requests(from_user, status, created_at desc);

-- ---------- Friendships (canonical ordered pair) ----------
create table if not exists public.friendships (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create or replace function public.add_friendship(p_user1 uuid, p_user2 uuid)
returns void language plpgsql as $$
begin
  if p_user1 = p_user2 then return; end if;
  insert into public.friendships (user_a, user_b)
  values (least(p_user1, p_user2), greatest(p_user1, p_user2))
  on conflict do nothing;
end $$;

-- ---------- Challenges ----------
do $$ begin
  create type public.challenge_mode as enum ('1v1', 'timed', 'random', 'document', 'chapter');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.challenge_status as enum ('pending', 'accepted', 'declined', 'finished');
exception when duplicate_object then null; end $$;

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  mode public.challenge_mode not null default '1v1',
  document_id uuid references public.documents(id) on delete set null,
  chapter text,
  status public.challenge_status not null default 'pending',
  wins_from int,
  wins_to int,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check (from_user <> to_user)
);
create index if not exists idx_challenges_from on public.challenges(from_user, created_at desc);
create index if not exists idx_challenges_to on public.challenges(to_user, created_at desc);

-- ---------- Bookmarks ----------
create table if not exists public.bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, artifact_id)
);
create index if not exists idx_bookmarks_user on public.bookmarks(user_id, created_at desc);

-- ---------- Document visibility ----------
do $$ begin
  create type public.visibility as enum ('private', 'friends', 'public');
exception when duplicate_object then null; end $$;

alter table public.documents add column if not exists visibility public.visibility not null default 'private';
create index if not exists idx_documents_public on public.documents(visibility, created_at desc) where visibility = 'public';

-- ---------- Path progress ----------
do $$ begin
  create type public.path_step_status as enum ('not_started', 'in_progress', 'completed');
exception when duplicate_object then null; end $$;

create table if not exists public.path_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  step_order int not null,
  status public.path_step_status not null default 'not_started',
  pct int not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, document_id, step_order)
);
create index if not exists idx_path_progress_user on public.path_progress(user_id, updated_at desc);

-- ---------- Privacy settings ----------
create table if not exists public.privacy_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile public.visibility not null default 'public',
  uploads public.visibility not null default 'public',
  followers public.visibility not null default 'public',
  activity public.visibility not null default 'public',
  quiz_records public.visibility not null default 'public',
  achievements public.visibility not null default 'public',
  leaderboard boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------- Social activity (separate from analytics learning_events) ----------
create table if not exists public.social_activity (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null references auth.users(id) on delete cascade,
  verb text not null,
  object_text text not null,
  ts timestamptz not null default now(),
  hidden boolean not null default false
);
create index if not exists idx_social_activity_actor on public.social_activity(actor, ts desc);
create index if not exists idx_social_activity_ts on public.social_activity(ts desc);

-- ===================================================================
-- Row Level Security
-- ===================================================================
alter table public.follows           enable row level security;
alter table public.friend_requests   enable row level security;
alter table public.friendships       enable row level security;
alter table public.challenges        enable row level security;
alter table public.bookmarks         enable row level security;
alter table public.path_progress     enable row level security;
alter table public.privacy_settings  enable row level security;
alter table public.social_activity   enable row level security;

-- Profiles: relax "self-only" so other users can read public profiles.
-- Writes still restricted to self.
drop policy if exists profiles_self on public.profiles;
drop policy if exists profiles_read_public on public.profiles;
drop policy if exists profiles_write_self on public.profiles;
create policy profiles_read_public on public.profiles
  for select using (
    is_public = true or auth.uid() = user_id
  );
create policy profiles_write_self on public.profiles
  for insert with check (auth.uid() = user_id);
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy profiles_delete_self on public.profiles
  for delete using (auth.uid() = user_id);

-- Documents: also expose public docs to others (read-only).
drop policy if exists docs_self on public.documents;
drop policy if exists docs_read on public.documents;
drop policy if exists docs_write_self on public.documents;
create policy docs_read on public.documents
  for select using (
    auth.uid() = user_id
    or visibility = 'public'
    or (visibility = 'friends' and exists (
      select 1 from public.friendships f
      where (f.user_a = auth.uid() and f.user_b = documents.user_id)
         or (f.user_b = auth.uid() and f.user_a = documents.user_id)
    ))
  );
create policy docs_write_self on public.documents
  for insert with check (auth.uid() = user_id);
create policy docs_update_self on public.documents
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy docs_delete_self on public.documents
  for delete using (auth.uid() = user_id);

-- Follows: anyone can read who follows whom; users only manage their own row.
drop policy if exists follows_read on public.follows;
drop policy if exists follows_write_self on public.follows;
create policy follows_read on public.follows for select using (true);
create policy follows_write_self on public.follows
  for insert with check (auth.uid() = follower);
create policy follows_delete_self on public.follows
  for delete using (auth.uid() = follower);

-- Friend requests: only the two parties can read; only sender can write.
drop policy if exists friend_req_read on public.friend_requests;
drop policy if exists friend_req_write_self on public.friend_requests;
drop policy if exists friend_req_update_recipient on public.friend_requests;
create policy friend_req_read on public.friend_requests
  for select using (auth.uid() in (from_user, to_user));
create policy friend_req_write_self on public.friend_requests
  for insert with check (auth.uid() = from_user);
create policy friend_req_update_recipient on public.friend_requests
  for update using (auth.uid() in (from_user, to_user));

-- Friendships: visible to both parties.
drop policy if exists friendships_read on public.friendships;
create policy friendships_read on public.friendships
  for select using (auth.uid() in (user_a, user_b));

-- Challenges: visible to either party; either can update (e.g. accept).
drop policy if exists challenges_read on public.challenges;
drop policy if exists challenges_write_self on public.challenges;
drop policy if exists challenges_update_party on public.challenges;
create policy challenges_read on public.challenges
  for select using (auth.uid() in (from_user, to_user));
create policy challenges_write_self on public.challenges
  for insert with check (auth.uid() = from_user);
create policy challenges_update_party on public.challenges
  for update using (auth.uid() in (from_user, to_user));

-- Bookmarks: self only.
drop policy if exists bookmarks_self on public.bookmarks;
create policy bookmarks_self on public.bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Path progress: self only.
drop policy if exists path_progress_self on public.path_progress;
create policy path_progress_self on public.path_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Privacy settings: self only.
drop policy if exists privacy_settings_self on public.privacy_settings;
create policy privacy_settings_self on public.privacy_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Social activity: actor manages their own rows; readers see rows whose
-- actor profile is public (and not individually hidden).
drop policy if exists social_activity_read on public.social_activity;
drop policy if exists social_activity_write_self on public.social_activity;
create policy social_activity_read on public.social_activity
  for select using (
    auth.uid() = actor
    or (
      not hidden
      and exists (
        select 1 from public.profiles p
        where p.user_id = social_activity.actor and p.is_public = true
      )
    )
  );
create policy social_activity_write_self on public.social_activity
  for insert with check (auth.uid() = actor);
create policy social_activity_update_self on public.social_activity
  for update using (auth.uid() = actor) with check (auth.uid() = actor);
create policy social_activity_delete_self on public.social_activity
  for delete using (auth.uid() = actor);

-- ===================================================================
-- Convenience: auto-create profile row on first sign-in
-- ===================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uname text;
begin
  -- Username = email local-part, lower-cased, alphanumeric + underscore.
  uname := lower(regexp_replace(split_part(coalesce(new.email, new.id::text), '@', 1),
                                '[^a-z0-9_]', '', 'g'));
  if uname = '' then uname := 'learner'; end if;

  insert into public.profiles (user_id, username, display_name, avatar_seed)
  values (new.id, uname, uname, new.id::text)
  on conflict (user_id) do nothing;

  insert into public.privacy_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles + privacy for existing users.
insert into public.profiles (user_id, username, display_name, avatar_seed)
select u.id,
       lower(regexp_replace(split_part(coalesce(u.email, u.id::text), '@', 1), '[^a-z0-9_]', '', 'g')),
       lower(regexp_replace(split_part(coalesce(u.email, u.id::text), '@', 1), '[^a-z0-9_]', '', 'g')),
       u.id::text
from auth.users u
on conflict (user_id) do update
set username = coalesce(public.profiles.username, excluded.username),
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    avatar_seed = coalesce(public.profiles.avatar_seed, excluded.avatar_seed);

insert into public.privacy_settings (user_id)
select user_id from public.profiles
on conflict do nothing;
