-- migrations/20260825_user_display_names.sql
-- Let signed-in users see each other's names.
--
-- `public.users` has RLS enabled with exactly one SELECT policy,
-- `auth.uid() = id`, so every client could read only its own row. Every
-- feature that names a person therefore showed the caller's own name and
-- "Unknown" for everybody else: the dashboard's project owners, the per-user
-- watch-coverage breakdown, and now the history timeline, whose whole purpose
-- is attribution.
--
-- Why a function instead of widening the SELECT policy: row-level security is
-- row level, not column level. A policy permissive enough to expose a name
-- also exposes `email` and `metadata` to every signed-in account. The same
-- reasoning already produced `set_video_qa_status` in
-- migrations/20260821_video_qa_status.sql, and this follows it.
--
-- What the display name is, and why it is derived here rather than in the
-- client: `fullName` is NULL for all 15 rows in production today, so returning
-- it alone would hand back nothing and leave every entry reading "Unknown".
-- The fallback is the email's LOCAL PART only - `split_part(email, '@', 1)` -
-- so a reviewer is identifiable without the address itself, or its domain,
-- crossing the boundary. Deriving it in SQL is what keeps that promise: if the
-- client did the splitting, the full address would have to be sent first.
--
-- Nothing here widens what the anon role can see. Share-link visitors are not
-- granted EXECUTE.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_user_display_names(p_ids uuid[])
RETURNS TABLE (
    id            uuid,
    "displayName" text,
    "avatarUrl"   text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    -- SECURITY DEFINER bypasses RLS, so this and the EXECUTE grant are the
    -- only gates. Belt and braces: the grant already excludes anon.
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Display names require a signed-in user'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        u.id,
        COALESCE(
            NULLIF(u."fullName", ''),
            NULLIF(split_part(u.email, '@', 1), ''),
            'Unknown'
        ),
        u."avatarUrl"
    FROM public.users u
    WHERE u.id = ANY(p_ids);
END;
$$;

-- Callable by signed-in users only.
--
-- `REVOKE ... FROM PUBLIC` alone is not enough here, verified 2026-08-25:
-- this project's default privileges grant EXECUTE to `anon` directly, not via
-- PUBLIC, so that grant survives the revoke and
-- has_function_privilege('anon', ...) still reports true. Name `anon`
-- explicitly.
--
-- The `auth.uid()` guard in the body would refuse an anonymous caller anyway.
-- Both stay: the guard is what makes the refusal correct, the revoke is what
-- makes it unreachable.
REVOKE ALL ON FUNCTION public.get_user_display_names(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_display_names(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_display_names(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Rollback:
--
-- DROP FUNCTION IF EXISTS public.get_user_display_names(uuid[]);
--
-- The `users` SELECT policy is untouched, so dropping this restores the
-- previous behaviour exactly: names resolve for yourself and read "Unknown"
-- for everyone else.
