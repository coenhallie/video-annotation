-- migrations/20260817_rename_ply_player_labels.sql
-- Standardise the player default labels on the PLR prefix.
--
-- The 22-label set introduced by 20260709_replace_default_labels.sql shipped with a
-- split prefix: PLR MISSED/DUPLICATE/TELEPORT/ID SWITCH alongside PLY WRONG POS/
-- AS NPL/KEEPER WRONG POS. PLR is the majority and the conventional abbreviation,
-- so the three PLY labels are renamed to match.
--
-- Renaming in place (UPDATE, never delete-and-reinsert) preserves labels.id, so every
-- annotation_labels row keeps pointing at the same label and no annotation history is
-- lost. public.labels has no unique constraint on name (verified 2026-08-17: only
-- labels_pkey on id, CHECKs on name/color/description, and the userId FK), so these
-- updates cannot collide.
--
-- Idempotent: a second run matches no rows. On a fresh database that ran the corrected
-- 20260709 there are no PLY rows at all and this is a clean no-op.
--
-- ORDERING: if you are re-running 20260709 as well, run THIS FILE FIRST. 20260709
-- inserts by name when absent, so on a database still holding PLY rows it would add a
-- second PLR row alongside them -- and with no unique constraint the database will not
-- stop it. Renaming first makes 20260709's insert guard find the PLR names and skip.

UPDATE public.labels
SET name = 'PLR WRONG POS'
WHERE name = 'PLY WRONG POS' AND "isDefault" = true;

UPDATE public.labels
SET name = 'PLR AS NPL'
WHERE name = 'PLY AS NPL' AND "isDefault" = true;

UPDATE public.labels
SET name = 'PLR KEEPER WRONG POS'
WHERE name = 'PLY KEEPER WRONG POS' AND "isDefault" = true;

-- Verify -- expect exactly 7 rows, every name starting PLR, no duplicates:
--   SELECT name, count(*), bool_and("isActive") AS all_active
--   FROM public.labels
--   WHERE "isDefault" = true AND (name LIKE 'PLR %' OR name LIKE 'PLY %')
--   GROUP BY name ORDER BY name;

-- Rollback:
--   UPDATE public.labels SET name = 'PLY WRONG POS'
--     WHERE name = 'PLR WRONG POS' AND "isDefault" = true;
--   UPDATE public.labels SET name = 'PLY AS NPL'
--     WHERE name = 'PLR AS NPL' AND "isDefault" = true;
--   UPDATE public.labels SET name = 'PLY KEEPER WRONG POS'
--     WHERE name = 'PLR KEEPER WRONG POS' AND "isDefault" = true;
