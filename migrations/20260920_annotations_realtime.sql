-- Publish annotation changes to Supabase Realtime.
--
-- The editor has subscribed to postgres_changes on public.annotations since the
-- realtime feature was written, but the table was never added to the
-- supabase_realtime publication (only annotation_comments was), so no event was
-- ever delivered: a teammate's annotation only appeared after a reload.
--
-- Row level security still applies. Realtime checks each change against the
-- subscriber's SELECT policies, so a client only receives rows it could read.
-- Deletes are the documented exception: they carry the primary key only and are
-- not filtered, which leaks nothing beyond an id the client cannot resolve.
--
-- Idempotent: safe to run twice.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'annotations'
  ) then
    alter publication supabase_realtime add table public.annotations;
  end if;
end
$$;
