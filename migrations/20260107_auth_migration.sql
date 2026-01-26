-- ============================================================================
-- Auth Migration Script: Supabase Auth -> Keycloak (Bulk Update)
-- ============================================================================
-- Description:
-- This script updates the `userId` and `ownerId` columns in various tables
-- to map from the old Supabase Auth UUID to the new Keycloak UUID.
--
-- PREREQUISITE:
-- You must first create and populate the `migration_user_map` table with data.
-- See `migration_guide.md` for instructions on how to generate the CSV data.
--
-- Usage:
-- 1. Create the `migration_user_map` table (Section 1).
-- 2. Import your pairing CSV into this table using Supabase Studio or COPY command.
-- 3. Run the Update Transaction (Section 2).
-- ============================================================================

-- SECTION 1: Setup Mapping Table
CREATE TABLE IF NOT EXISTS public.migration_user_map (
    old_user_id UUID PRIMARY KEY,
    new_user_id UUID NOT NULL,
    email TEXT
);

-- Enable RLS (locking it down by default) or keep it open if running as admin only.
-- Ideally this table is temporary and should be dropped after use.

-- ... STOP HERE AND IMPORT DATA ... 
-- Import your CSV (old_user_id, new_user_id) into 'migration_user_map'
-- ... THEN CONTINUE ...

-- SECTION 2: Execute Migration
BEGIN;

    -- 1. Migrate Videos
    RAISE NOTICE 'Migrating videos...';
    UPDATE public.videos v
    SET "ownerId" = m.new_user_id
    FROM public.migration_user_map m
    WHERE v."ownerId" = m.old_user_id;

    -- 2. Migrate Annotations
    RAISE NOTICE 'Migrating annotations...';
    UPDATE public.annotations a
    SET "userId" = m.new_user_id
    FROM public.migration_user_map m
    WHERE a."userId" = m.old_user_id;

    -- 3. Migrate Comparison Videos
    RAISE NOTICE 'Migrating comparison videos...';
    UPDATE public.comparison_videos c
    SET "userId" = m.new_user_id
    FROM public.migration_user_map m
    WHERE c."userId" = m.old_user_id;

    -- 4. Migrate Labels
    RAISE NOTICE 'Migrating labels...';
    UPDATE public.labels l
    SET "userId" = m.new_user_id
    FROM public.migration_user_map m
    WHERE l."userId" = m.old_user_id;

    -- 5. Migrate Comments
    -- Note: 'userDisplayName' is not updated here as it's a string cache.
    -- If you need to refresh names from Keycloak, that requires a separate step.
    RAISE NOTICE 'Migrating comments...';
    UPDATE public.annotation_comments ac
    SET "userId" = m.new_user_id
    FROM public.migration_user_map m
    WHERE ac."userId" = m.old_user_id;

    -- Optional: Migrate Anonymous Sessions
    -- If any anonymous sessions are linked to registered users (rare/unlikely but possible based on schema)
    -- Skipping as schema suggests these are ephemeral.

    RAISE NOTICE 'Migration complete. Please verify row counts.';

COMMIT;

-- SECTION 3: Cleanup (Optional - Run after verification)
-- DROP TABLE public.migration_user_map;
