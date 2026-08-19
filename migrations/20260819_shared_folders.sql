-- Folders become a single shared workspace (2026-08-19)
--
-- Until now folders were per-user, but only in the client: FolderService applied
-- `.eq('owner_id', userId)` and nothing else scoped them. RLS was never switched
-- on for either table, so `folders` and `project_folders` were readable AND
-- writable by anyone holding the anon key, which ships in the client bundle.
--
-- Both tables already carry four owner-gated policies apiece. They have never
-- been in effect. `migrations/20260817_open_annotations_to_all_users.sql` kept
-- its superseded policies as an OR'd fallback, but that precedent does not apply
-- here: there is no working behaviour to fall back to, so these are dropped.
--
-- The product decision is that folders are one shared tree. Any signed-in user
-- sees every folder and may create, rename, delete and reparent any of them, and
-- file any video into any of them. `owner_id` is retained as attribution and is
-- filtered on nowhere.
--
-- Scoping every policy TO authenticated (the old ones were TO public, which
-- includes anon) is what closes the anonymous hole. Verified safe: the only path
-- to either table is FolderService -> useDashboardFolders -> DashboardView, which
-- requires a session. No anonymous share-link path resolves folder membership.
--
-- The replacement policies are flat `true` and reference no other table. That is
-- deliberate, not laziness: RLS applies to tables named inside a policy
-- expression, which is why the old project_folders policies had to reach into
-- `videos` with EXISTS subqueries. These do not, so the hazard disappears.
--
-- Design: docs/superpowers/specs/2026-08-19-shared-folders-design.md

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can create their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can update their own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can delete their own folders" ON public.folders;

DROP POLICY IF EXISTS "Users can view project-folder associations for their projects" ON public.project_folders;
DROP POLICY IF EXISTS "Users can create project-folder associations for their projects" ON public.project_folders;
DROP POLICY IF EXISTS "Users can update project-folder associations for their projects" ON public.project_folders;
DROP POLICY IF EXISTS "Users can delete project-folder associations for their projects" ON public.project_folders;

-- folders

DROP POLICY IF EXISTS "Signed-in users can view all folders" ON public.folders;
CREATE POLICY "Signed-in users can view all folders" ON public.folders
  FOR SELECT TO authenticated
  USING (true);

-- The only non-trivial check in the migration. It does not gate anything: it
-- keeps a folder's attribution honest by stopping a client from claiming the row
-- was created by somebody else.
DROP POLICY IF EXISTS "Signed-in users can create folders" ON public.folders;
CREATE POLICY "Signed-in users can create folders" ON public.folders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

-- USING and WITH CHECK are both spelled out rather than letting Postgres default
-- the check to the USING expression. owner_id therefore stays rewritable by
-- anyone, which is acceptable because it carries no authority.
DROP POLICY IF EXISTS "Signed-in users can update any folder" ON public.folders;
CREATE POLICY "Signed-in users can update any folder" ON public.folders
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Signed-in users can delete any folder" ON public.folders;
CREATE POLICY "Signed-in users can delete any folder" ON public.folders
  FOR DELETE TO authenticated
  USING (true);

-- project_folders

DROP POLICY IF EXISTS "Signed-in users can view all folder contents" ON public.project_folders;
CREATE POLICY "Signed-in users can view all folder contents" ON public.project_folders
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Signed-in users can file any video into any folder" ON public.project_folders;
CREATE POLICY "Signed-in users can file any video into any folder" ON public.project_folders
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Signed-in users can update any folder filing" ON public.project_folders;
CREATE POLICY "Signed-in users can update any folder filing" ON public.project_folders
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Signed-in users can unfile any video" ON public.project_folders;
CREATE POLICY "Signed-in users can unfile any video" ON public.project_folders
  FOR DELETE TO authenticated
  USING (true);

-- Rollback. Restores the exact pre-change state: RLS off, plus the eight policies
-- captured verbatim from pg_policies on 2026-08-19 before the drop.
--
-- DROP POLICY IF EXISTS "Signed-in users can view all folders" ON public.folders;
-- DROP POLICY IF EXISTS "Signed-in users can create folders" ON public.folders;
-- DROP POLICY IF EXISTS "Signed-in users can update any folder" ON public.folders;
-- DROP POLICY IF EXISTS "Signed-in users can delete any folder" ON public.folders;
-- DROP POLICY IF EXISTS "Signed-in users can view all folder contents" ON public.project_folders;
-- DROP POLICY IF EXISTS "Signed-in users can file any video into any folder" ON public.project_folders;
-- DROP POLICY IF EXISTS "Signed-in users can update any folder filing" ON public.project_folders;
-- DROP POLICY IF EXISTS "Signed-in users can unfile any video" ON public.project_folders;
--
-- ALTER TABLE public.folders DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.project_folders DISABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Users can view their own folders" ON public.folders
--   FOR SELECT TO public USING (auth.uid() = owner_id);
-- CREATE POLICY "Users can create their own folders" ON public.folders
--   FOR INSERT TO public WITH CHECK (auth.uid() = owner_id);
-- CREATE POLICY "Users can update their own folders" ON public.folders
--   FOR UPDATE TO public USING (auth.uid() = owner_id);
-- CREATE POLICY "Users can delete their own folders" ON public.folders
--   FOR DELETE TO public USING (auth.uid() = owner_id);
--
-- CREATE POLICY "Users can view project-folder associations for their projects" ON public.project_folders
--   FOR SELECT TO public USING (EXISTS (
--     SELECT 1 FROM videos
--      WHERE videos.id = project_folders.project_id AND videos."ownerId" = auth.uid()));
-- CREATE POLICY "Users can create project-folder associations for their projects" ON public.project_folders
--   FOR INSERT TO public WITH CHECK (
--     EXISTS (SELECT 1 FROM videos
--              WHERE videos.id = project_folders.project_id AND videos."ownerId" = auth.uid())
--     AND EXISTS (SELECT 1 FROM folders
--                  WHERE folders.id = project_folders.folder_id AND folders.owner_id = auth.uid()));
-- CREATE POLICY "Users can update project-folder associations for their projects" ON public.project_folders
--   FOR UPDATE TO public USING (EXISTS (
--     SELECT 1 FROM videos
--      WHERE videos.id = project_folders.project_id AND videos."ownerId" = auth.uid()));
-- CREATE POLICY "Users can delete project-folder associations for their projects" ON public.project_folders
--   FOR DELETE TO public USING (EXISTS (
--     SELECT 1 FROM videos
--      WHERE videos.id = project_folders.project_id AND videos."ownerId" = auth.uid()));
