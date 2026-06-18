-- NeuroFeed Postgres schema (Supabase). Run once on a fresh project.
-- Requires: extension pgvector. Embedding dim 384 (BAAI/bge-small-en-v1.5).

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------- Profiles (extends auth.users) ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  xp int not null default 0,
  streak int not null default 0,
  last_active_date date,
  created_at timestamptz not null default now()
);

-- ---------- Documents ----------
do $$ begin
  create type public.doc_status as enum (
    'uploaded', 'parsing', 'embedding', 'generating', 'ready', 'error'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.doc_source as enum ('pdf', 'docx', 'pptx', 'audio', 'text');
exception when duplicate_object then null; end $$;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_type public.doc_source not null,
  storage_path text not null,
  status public.doc_status not null default 'uploaded',
  error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_documents_user on public.documents(user_id, created_at desc);

-- ---------- Chunks (embedding vector(384)) ----------
create table if not exists public.chunks (
  id bigserial primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  ord int not null,
  text text not null,
  page_ref jsonb not null default '{}'::jsonb,
  embedding vector(384)
);
create index if not exists idx_chunks_doc on public.chunks(document_id, ord);
-- Approximate ANN index (lists tuned later)
create index if not exists idx_chunks_embedding
  on public.chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ---------- Concepts ----------
create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  name text not null,
  summary text
);
create index if not exists idx_concepts_doc on public.concepts(document_id);

-- ---------- Artifacts ----------
do $$ begin
  create type public.artifact_type as enum (
    'summary', 'swipe_card', 'flashcard', 'quiz', 'reel_script', 'learning_path_step'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  concept_id uuid references public.concepts(id) on delete set null,
  type public.artifact_type not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_artifacts_doc_type on public.artifacts(document_id, type);
create index if not exists idx_artifacts_concept on public.artifacts(concept_id);

-- ---------- Feed items ----------
create table if not exists public.feed_items (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  score double precision not null default 0,
  reason jsonb not null default '{}'::jsonb,
  served_at timestamptz not null default now()
);
create index if not exists idx_feed_items_user_served
  on public.feed_items(user_id, served_at desc);

-- ---------- Learning events (event-sourced gamification + analytics) ----------
do $$ begin
  create type public.event_type as enum (
    'upload', 'view', 'like', 'save', 'quiz_answer',
    'flashcard_review', 'reel_complete', 'tutor_query', 'explain_simpler'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.learning_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type public.event_type not null,
  payload jsonb not null default '{}'::jsonb,
  ts timestamptz not null default now()
);
create index if not exists idx_events_user_ts on public.learning_events(user_id, ts desc);
create index if not exists idx_events_user_type_ts
  on public.learning_events(user_id, type, ts desc);

-- ---------- Mastery (EMA per concept) ----------
create table if not exists public.mastery (
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  score double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, concept_id)
);
create index if not exists idx_mastery_user on public.mastery(user_id);

-- ---------- Achievements ----------
create table if not exists public.achievements (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  earned_at timestamptz not null default now(),
  unique (user_id, code)
);

-- ===================================================================
-- Row Level Security: every row scoped to auth.uid()
-- ===================================================================
alter table public.profiles         enable row level security;
alter table public.documents        enable row level security;
alter table public.chunks           enable row level security;
alter table public.concepts         enable row level security;
alter table public.artifacts        enable row level security;
alter table public.feed_items       enable row level security;
alter table public.learning_events  enable row level security;
alter table public.mastery          enable row level security;
alter table public.achievements     enable row level security;

-- Profiles: user can see/update own row
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Documents: own only
drop policy if exists docs_self on public.documents;
create policy docs_self on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Chunks / concepts / artifacts: filtered via parent document ownership
drop policy if exists chunks_self on public.chunks;
create policy chunks_self on public.chunks
  for all using (
    exists (select 1 from public.documents d
            where d.id = chunks.document_id and d.user_id = auth.uid())
  );

drop policy if exists concepts_self on public.concepts;
create policy concepts_self on public.concepts
  for all using (
    exists (select 1 from public.documents d
            where d.id = concepts.document_id and d.user_id = auth.uid())
  );

drop policy if exists artifacts_self on public.artifacts;
create policy artifacts_self on public.artifacts
  for all using (
    exists (select 1 from public.documents d
            where d.id = artifacts.document_id and d.user_id = auth.uid())
  );

-- Per-user tables
drop policy if exists feed_self on public.feed_items;
create policy feed_self on public.feed_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists events_self on public.learning_events;
create policy events_self on public.learning_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists mastery_self on public.mastery;
create policy mastery_self on public.mastery
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists achievements_self on public.achievements;
create policy achievements_self on public.achievements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===================================================================
-- Storage: 'uploads' bucket for user-uploaded source files.
-- Frontend writes to uploads/<user_id>/<uuid>-<filename>.
-- ===================================================================
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

drop policy if exists uploads_insert_own on storage.objects;
create policy uploads_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists uploads_read_own on storage.objects;
create policy uploads_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists uploads_delete_own on storage.objects;
create policy uploads_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
