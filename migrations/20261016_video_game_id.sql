-- videos."gameId": DALF's id for the game a video shows (2026-10-16).
--
-- DALF's "Open in Perspecto" link carries `gameId=` next to the match name,
-- competition and date (see src/utils/pipelineTitle.ts). It is shown in every
-- dashboard row so a video can be matched back to its game in DALF.
--
-- Text, not a number: DALF's format is not ours to assume. The CHECK keeps
-- what the client already enforces - an id-shaped value, at most 64
-- characters - because it comes from a URL anyone can write and is printed in
-- every row.
--
-- No backfill: no video carries the id anywhere else.
--
-- Idempotent: safe to run twice.

BEGIN;

ALTER TABLE public.videos
    ADD COLUMN IF NOT EXISTS "gameId" text;

ALTER TABLE public.videos
    DROP CONSTRAINT IF EXISTS videos_game_id_shape;
ALTER TABLE public.videos
    ADD CONSTRAINT videos_game_id_shape
    CHECK ("gameId" ~ '^[A-Za-z0-9_.:-]{1,64}$');

-- The write path, for the same reason as set_video_match_date: the videos
-- UPDATE policy is owner-only, and DALF links are opened by whoever is on
-- duty. Every video is visible to every signed-in account, so the gate is
-- "signed in, and the video exists".
CREATE OR REPLACE FUNCTION public.set_video_game_id(
    p_video_id uuid,
    p_game_id text
)
RETURNS public.videos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row public.videos;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Setting a game id requires a signed-in user'
            USING ERRCODE = '42501';
    END IF;

    -- The CHECK constraint would catch this too, but as a constraint violation
    -- rather than something the caller can act on.
    IF p_game_id IS NULL OR p_game_id !~ '^[A-Za-z0-9_.:-]{1,64}$' THEN
        RAISE EXCEPTION 'Not a game id: %', p_game_id
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.videos v
       SET "gameId" = p_game_id
     WHERE v.id = p_video_id
    RETURNING * INTO v_row;

    -- Not a no-op: a write that matched no row must not report success.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video % is not visible to the caller', p_video_id
            USING ERRCODE = '42501';
    END IF;

    RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_video_game_id(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_video_game_id(uuid, text) TO authenticated;

COMMIT;

-- Rollback:
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.set_video_game_id(uuid, text);
-- ALTER TABLE public.videos DROP COLUMN IF EXISTS "gameId";
-- COMMIT;
