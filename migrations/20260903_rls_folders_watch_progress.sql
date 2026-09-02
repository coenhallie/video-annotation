-- Enable RLS on the three tables that never had it (2026-09-03)
--
-- folders, project_folders and video_watch_progress were the last tables in
-- `public` with row level security off, so every row in them was readable and
-- writable by anyone holding the anon key. The concrete hole was in folders:
-- FolderService.updateFolder, moveFolder and deleteFolder all key on `id` alone
-- with no owner filter, so knowing a folder id was enough to rename, re-parent
-- or delete somebody else's folder.
--
-- The policies below are written to match what the app already does, so nothing
-- it does today starts failing:
--
-- folders - owner scoped for all four verbs. Every read in FolderService already
--   filters `owner_id = userId`; the writes did not, and now the database does
--   it for them.
--
-- project_folders - a junction with no owner column of its own, so authority
--   comes from the folder side: you may act on an assignment when you own the
--   folder it points into. This also fixes getUnfiledProjects, which reads every
--   assignment row and subtracts it from the caller's own projects - with RLS it
--   sees only the caller's assignments, so a project someone else filed in their
--   folder no longer disappears from the caller's unfiled list.
--
-- video_watch_progress - deliberately NOT owner scoped for SELECT.
--   getProgressForVideo reads every user's row for a video, and
--   VideoDetailsPanel renders that as team coverage ("who has watched this").
--   Restricting SELECT to your own rows would silently empty that panel.
--   Writes are owner scoped, which is what was actually missing: nothing stopped
--   one user overwriting another's progress. The service upserts, so both INSERT
--   and UPDATE policies are required.
--
-- anon gets no policy on any of these, which is the intent: none of the three is
-- reached from a share link or any other unauthenticated path.
--
-- Rollback is at the bottom.

-- ── folders ────────────────────────────────────────────────────────────────
alter table public.folders enable row level security;

-- An earlier migration had already written owner-scoped policies here, but with
-- RLS off they never took effect. Their predicates are identical to the ones
-- below (`auth.uid() = owner_id`); the only difference is that they target role
-- `public` rather than `authenticated`, which changes nothing in practice since
-- auth.uid() is null for anon. Dropped so there is one set to read, not two
-- saying the same thing.
drop policy if exists "Users can view their own folders" on public.folders;
drop policy if exists "Users can create their own folders" on public.folders;
drop policy if exists "Users can update their own folders" on public.folders;
drop policy if exists "Users can delete their own folders" on public.folders;

drop policy if exists folders_select_own on public.folders;
create policy folders_select_own on public.folders
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists folders_insert_own on public.folders;
create policy folders_insert_own on public.folders
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists folders_update_own on public.folders;
create policy folders_update_own on public.folders
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists folders_delete_own on public.folders;
create policy folders_delete_own on public.folders
  for delete to authenticated using (owner_id = auth.uid());

-- ── project_folders ────────────────────────────────────────────────────────
alter table public.project_folders enable row level security;

-- The earlier migration's policies are KEPT here, unlike on folders above,
-- because they are not duplicates: they grant authority from the project side
-- (`videos.ownerId = auth.uid()`) where the ones below grant it from the folder
-- side. Policies are OR'd, so the effective rule is "you may manage an
-- assignment if you own either end of it" - which is what the app does.
-- moveProjectsToFolder, for instance, clears a project's existing assignments by
-- project_id, and the caller owns the project rather than every folder it might
-- have been filed into.

drop policy if exists project_folders_select_own on public.project_folders;
create policy project_folders_select_own on public.project_folders
  for select to authenticated using (
    exists (select 1 from public.folders f
             where f.id = project_folders.folder_id and f.owner_id = auth.uid())
  );

drop policy if exists project_folders_insert_own on public.project_folders;
create policy project_folders_insert_own on public.project_folders
  for insert to authenticated with check (
    exists (select 1 from public.folders f
             where f.id = project_folders.folder_id and f.owner_id = auth.uid())
  );

drop policy if exists project_folders_update_own on public.project_folders;
create policy project_folders_update_own on public.project_folders
  for update to authenticated using (
    exists (select 1 from public.folders f
             where f.id = project_folders.folder_id and f.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.folders f
             where f.id = project_folders.folder_id and f.owner_id = auth.uid())
  );

drop policy if exists project_folders_delete_own on public.project_folders;
create policy project_folders_delete_own on public.project_folders
  for delete to authenticated using (
    exists (select 1 from public.folders f
             where f.id = project_folders.folder_id and f.owner_id = auth.uid())
  );

-- ── video_watch_progress ───────────────────────────────────────────────────
alter table public.video_watch_progress enable row level security;

-- Read is intentionally open to any signed-in user: the dashboard shows how far
-- everyone has watched a shared video. See the header note.
drop policy if exists video_watch_progress_select_authenticated on public.video_watch_progress;
create policy video_watch_progress_select_authenticated on public.video_watch_progress
  for select to authenticated using (true);

drop policy if exists video_watch_progress_insert_own on public.video_watch_progress;
create policy video_watch_progress_insert_own on public.video_watch_progress
  for insert to authenticated with check ("userId" = auth.uid());

drop policy if exists video_watch_progress_update_own on public.video_watch_progress;
create policy video_watch_progress_update_own on public.video_watch_progress
  for update to authenticated
  using ("userId" = auth.uid()) with check ("userId" = auth.uid());

drop policy if exists video_watch_progress_delete_own on public.video_watch_progress;
create policy video_watch_progress_delete_own on public.video_watch_progress
  for delete to authenticated using ("userId" = auth.uid());

-- Rollback:
--
-- alter table public.folders              disable row level security;
-- alter table public.project_folders      disable row level security;
-- alter table public.video_watch_progress disable row level security;
-- (policies may be left in place; they are inert while RLS is off)
