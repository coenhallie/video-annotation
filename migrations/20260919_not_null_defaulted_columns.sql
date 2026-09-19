-- Make always-present columns NOT NULL (2026-09-19)
--
-- Applied to production 2026-09-20 and verified read-only afterwards.
--
-- Why: these 21 columns all have a DEFAULT but were created without NOT NULL,
-- so the schema says they may be null. No row holds a null in any of them
-- (checked read-only against production on 2026-09-19: 0 nulls in all 21), the
-- app has always treated them as present, and nothing writes null to them.
--
-- The cost of leaving it is in the types. `npm run gen:types` reads the schema,
-- so every one of these comes out as `T | null`, and switching the Supabase
-- client to the generated types reports 58 errors - nearly all of them these
-- columns. Typed database access is what would have caught the two calls fixed
-- alongside this file (a wrong RPC parameter name and an RPC that does not
-- exist), so the constraint is worth having for that alone.
--
-- Safe to run on live data: SET NOT NULL scans each table once and fails,
-- changing nothing, if a null has appeared since the check. Every statement is
-- idempotent.

ALTER TABLE public.annotation_comments ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE public.annotation_comments ALTER COLUMN "isAnonymous" SET NOT NULL;
ALTER TABLE public.annotation_comments ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE public.annotation_labels ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE public.annotations ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE public.annotations ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE public.anonymous_sessions ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE public.anonymous_sessions ALTER COLUMN "lastActive" SET NOT NULL;
ALTER TABLE public.comparison_videos ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE public.comparison_videos ALTER COLUMN "isPublic" SET NOT NULL;
ALTER TABLE public.comparison_videos ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE public.labels ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE public.labels ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE public.labels ALTER COLUMN "usageCount" SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE public.users ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE public.video_sessions ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE public.video_sessions ALTER COLUMN "isActive" SET NOT NULL;
ALTER TABLE public.videos ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE public.videos ALTER COLUMN "isPublic" SET NOT NULL;
ALTER TABLE public.videos ALTER COLUMN "updatedAt" SET NOT NULL;

-- Rollback, per column:
--   ALTER TABLE public.<table> ALTER COLUMN "<column>" DROP NOT NULL;
