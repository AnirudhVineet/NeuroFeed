-- Add a per-document "hidden from owner" flag so a user can remove a doc from
-- their own My Feed / dashboard library without unpublishing it from Global
-- Feed. Owners can still see the row in their library (rendered with a Hidden
-- badge + an Unhide action) and can fully delete later.
--
-- Idempotent: safe to re-run.

alter table public.documents
  add column if not exists hidden_from_owner boolean not null default false;

-- Partial index: most queries care about the visible-to-owner subset.
create index if not exists idx_documents_owner_visible
  on public.documents(user_id, created_at desc)
  where hidden_from_owner = false;
