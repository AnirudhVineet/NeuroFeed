-- Vector search RPC. Returns top-k chunks for a given user across their documents.
-- Cosine similarity via pgvector (<=> distance, similarity = 1 - distance).

create or replace function public.match_chunks(
  query_embedding vector(384),
  match_user_id uuid,
  match_count int default 5,
  match_doc_id uuid default null
)
returns table (
  chunk_id bigint,
  document_id uuid,
  ord int,
  text text,
  page_ref jsonb,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id          as chunk_id,
    c.document_id as document_id,
    c.ord         as ord,
    c.text        as text,
    c.page_ref    as page_ref,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where d.user_id = match_user_id
    and (match_doc_id is null or c.document_id = match_doc_id)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_chunks(vector, uuid, int, uuid)
  to authenticated, service_role;
