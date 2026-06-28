-- Direct-message layer: 1:1 conversations between friends, with text + reel
-- share messages. Builds on the existing friendships table.
--
-- Idempotent: safe to re-run.

-- ---------- Conversations (canonical ordered pair) ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique(user_a, user_b),
  check (user_a < user_b)
);
create index if not exists idx_conversations_user_a
  on public.conversations(user_a, last_message_at desc);
create index if not exists idx_conversations_user_b
  on public.conversations(user_b, last_message_at desc);

-- Helper: insert-or-fetch a conversation between two users (canonical order).
create or replace function public.upsert_conversation(p_user1 uuid, p_user2 uuid)
returns uuid language plpgsql as $$
declare
  a uuid := least(p_user1, p_user2);
  b uuid := greatest(p_user1, p_user2);
  cid uuid;
begin
  if p_user1 = p_user2 then
    raise exception 'cannot start a conversation with yourself';
  end if;
  insert into public.conversations(user_a, user_b)
  values (a, b)
  on conflict (user_a, user_b) do nothing;
  select id into cid from public.conversations where user_a = a and user_b = b;
  return cid;
end $$;

-- ---------- Messages ----------
do $$ begin
  create type public.message_kind as enum ('text', 'reel_share');
exception when duplicate_object then null; end $$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  kind public.message_kind not null default 'text',
  body text,
  artifact_id uuid references public.artifacts(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (
    (kind = 'text' and body is not null and length(body) > 0)
    or (kind = 'reel_share' and artifact_id is not null)
  )
);
create index if not exists idx_messages_conv_ts
  on public.messages(conversation_id, created_at desc);
create index if not exists idx_messages_unread
  on public.messages(conversation_id, sender_id, read_at)
  where read_at is null;

-- Bump conversations.last_message_at on every new message so the conv list
-- can sort by recency without a per-row aggregate.
create or replace function public.bump_conversation_ts()
returns trigger language plpgsql as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists trg_bump_conv_ts on public.messages;
create trigger trg_bump_conv_ts
  after insert on public.messages
  for each row execute function public.bump_conversation_ts();

-- ===================================================================
-- Row Level Security
-- ===================================================================
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- Conversations: readable by either party.
drop policy if exists conv_read on public.conversations;
create policy conv_read on public.conversations
  for select using (auth.uid() in (user_a, user_b));

-- Insert restricted to one of the parties AND they must be friends.
drop policy if exists conv_insert on public.conversations;
create policy conv_insert on public.conversations
  for insert with check (
    auth.uid() in (user_a, user_b)
    and exists (
      select 1 from public.friendships f
      where f.user_a = least(conversations.user_a, conversations.user_b)
        and f.user_b = greatest(conversations.user_a, conversations.user_b)
    )
  );

-- Messages: readable by either conversation party.
drop policy if exists msg_read on public.messages;
create policy msg_read on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and auth.uid() in (c.user_a, c.user_b)
    )
  );

-- Insert: only the sender; sender must be a party.
drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and auth.uid() in (c.user_a, c.user_b)
    )
  );

-- Update (used for marking read_at). Either party can update — guard at
-- application level so senders don't accidentally mark their own messages
-- read on the other side.
drop policy if exists msg_update on public.messages;
create policy msg_update on public.messages
  for update using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and auth.uid() in (c.user_a, c.user_b)
    )
  );

-- ===================================================================
-- Enable Realtime so the chat UI gets live INSERTs without polling.
-- Idempotent: skip if the publication already contains the table.
-- ===================================================================
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
