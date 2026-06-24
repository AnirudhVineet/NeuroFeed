-- Add 'interested' and 'not_interested' to the learning event enum.
-- Powers the Interested / Not Interested feed ranking signals.
--
-- Idempotent: safe to re-run. Must execute outside a transaction block
-- (ALTER TYPE ADD VALUE limitation), so do NOT wrap in BEGIN/COMMIT.
--
-- How to apply: Supabase Dashboard → SQL Editor → New query → paste → Run.

alter type public.event_type add value if not exists 'interested';
alter type public.event_type add value if not exists 'not_interested';
