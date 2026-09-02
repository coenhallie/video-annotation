-- Drop the owner-scoped folder policies superseded by the shared workspace
-- (2026-09-03, run immediately after 20260819_shared_folders.sql)
--
-- 20260903_rls_folders_watch_progress.sql turned RLS on for folders and
-- project_folders and gave them owner-scoped policies. That matched the client
-- deployed at the time: FolderService filtered every read by owner_id, so
-- owner-scoped RLS changed nothing visible while closing the real hole - the
-- update/move/delete paths keyed on `id` alone, so a folder id was enough to
-- modify someone else's folder.
--
-- The product decision is now a shared workspace: every signed-in user sees and
-- manages every folder. 20260819_shared_folders.sql expresses that, and this
-- drops the owner-scoped set so the schema states one rule instead of two.
--
-- Policies are OR'd, so leaving these in place would not have changed behaviour
-- - `USING (true)` already subsumes `owner_id = auth.uid()`. They are removed
-- because a reader inspecting the schema would otherwise find owner scoping and
-- reasonably conclude folders are private.
--
-- INSERT is the one verb that stays restricted, and that comes from the shared
-- migration, not here: `auth.uid() = owner_id` keeps a folder's attribution
-- honest by stopping a client from creating rows owned by someone else.
--
-- video_watch_progress policies are deliberately untouched - that table is not
-- part of this decision.

drop policy if exists folders_select_own on public.folders;
drop policy if exists folders_insert_own on public.folders;
drop policy if exists folders_update_own on public.folders;
drop policy if exists folders_delete_own on public.folders;

drop policy if exists project_folders_select_own on public.project_folders;
drop policy if exists project_folders_insert_own on public.project_folders;
drop policy if exists project_folders_update_own on public.project_folders;
drop policy if exists project_folders_delete_own on public.project_folders;

-- Rollback: re-run migrations/20260903_rls_folders_watch_progress.sql, which
-- recreates all eight. Note it would then coexist with the shared policies and
-- the permissive ones would still win.
