-- Fix the folders updated-at trigger, which made every folder UPDATE throw
-- (2026-09-03)
--
-- `folders` carries a BEFORE UPDATE trigger pointing at the shared
-- public.update_updated_at_column(), whose body is:
--
--   NEW."updatedAt" = NOW();
--
-- Every other table using that function - annotations, comparison_videos, users,
-- videos - has a camelCase `updatedAt` column. `folders` does not: its column is
-- `updated_at`, snake_case, matching the rest of that table (owner_id,
-- parent_id, sort_order) and matching what FolderService reads. So the
-- assignment referenced a field that does not exist and every UPDATE on folders
-- failed with:
--
--   42703: record "new" has no field "updatedAt"
--
-- That means renaming, moving and reordering a folder have been broken in
-- production, not intermittently but always. It went unnoticed because until
-- 2026-09-03 folders had no RLS and then briefly had owner-scoped policies; the
-- error only surfaces once an UPDATE is actually permitted to reach the trigger,
-- which is what enabling the shared workspace did.
--
-- The shared function is left alone - it is correct for the four camelCase
-- tables. `folders` gets a snake_case counterpart instead.

CREATE OR REPLACE FUNCTION public.update_updated_at_snake_case()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_folders_updated_at ON public.folders;
CREATE TRIGGER update_folders_updated_at
  BEFORE UPDATE ON public.folders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_snake_case();

-- Rollback:
--
-- DROP TRIGGER IF EXISTS update_folders_updated_at ON public.folders;
-- CREATE TRIGGER update_folders_updated_at
--   BEFORE UPDATE ON public.folders
--   FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- DROP FUNCTION IF EXISTS public.update_updated_at_snake_case();
-- (this restores the broken behaviour)
