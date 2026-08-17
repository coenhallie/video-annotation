-- migrations/20260709_replace_default_labels.sql
-- Replace the 7 priority/category default labels with the 22 football-tracking
-- QA labels (must stay in sync with DEFAULT_LABELS in src/types/labels.ts).
-- Old defaults referenced by annotations are deactivated (kept for history);
-- unreferenced ones are deleted. Idempotent: safe to re-run.

-- 1. Deactivate old defaults that are still attached to annotations
UPDATE public.labels l
SET "isActive" = false
WHERE l."isDefault" = true
  AND l.name IN ('Low Priority', 'Medium Priority', 'High Priority', 'Urgent',
                 'Review Needed', 'Technical Issue', 'Improvement')
  AND EXISTS (
    SELECT 1 FROM public.annotation_labels al WHERE al."labelId" = l.id
  );

-- 2. Delete old defaults that no annotation references
DELETE FROM public.labels l
WHERE l."isDefault" = true
  AND l.name IN ('Low Priority', 'Medium Priority', 'High Priority', 'Urgent',
                 'Review Needed', 'Technical Issue', 'Improvement')
  AND NOT EXISTS (
    SELECT 1 FROM public.annotation_labels al WHERE al."labelId" = l.id
  );

-- 3. Insert the new default label set (skip any that already exist by name)
INSERT INTO public.labels (name, description, color, "isDefault", "isActive")
SELECT v.name, v.description, v.color, true, true
FROM (VALUES
  ('EVT MISSED', 'Clear event in the video but no corresponding event in output.', '#ef4444'),
  ('EVT FALSE', 'Event output when no event is present.', '#dc2626'),
  ('EVT TYPE WRONG', 'Event timing is roughly correct, but the type of event is wrong (e.g., throw-in vs corner, cross vs shot, goal vs saved shot).', '#f87171'),
  ('EVT TIME ERROR', 'Event type is correct, but the timestamp is significantly early/late by at least 2 seconds.', '#b91c1c'),
  ('PITCH LINES MISMATCH', 'Projected pitch lines (touchline, halfway, boxes) clearly don''t align with the real lines in the video.', '#8b5cf6'),
  ('PITCH PROJECTION OFF', 'Players/ball consistently appear off the playable area or in wrong zones due to projection or camera model errors (e.g., players "in the stands" or ball outside field when it is clearly inside).', '#7c3aed'),
  ('TEAM ASSIGN WRONG', 'Player assigned to wrong team (kit/colour vs label disagree) - e.g., "players switching teams because of shadows / far end of pitch".', '#ec4899'),
  ('TEAM COLOR WRONG', 'Team colours mis-detected and/or misclassified.', '#db2777'),
  ('NPL MISSED', 'A clearly visible non-player official is not tracked/rendered for a noticeable period.', '#6b7280'),
  ('NPL WRONG POS', 'The non-player official exists but is clearly in the wrong position on the pitch.', '#374151'),
  ('PLR MISSED', 'A clearly visible player on the pitch is not tracked/rendered for a noticeable period.', '#3b82f6'),
  ('PLR DUPLICATE', 'Duplicate or "ghost" player appears (same real player represented twice, or phantom player with no real counterpart).', '#2563eb'),
  ('PLR TELEPORT', 'Player jumps an implausible distance between frames (no continuous motion in the video).', '#60a5fa'),
  ('PLR ID SWITCH', 'IDs of two players swap (e.g., #9 and #10 exchange tracks mid-sequence) or a single real player gets a new ID mid-clip.', '#1d4ed8'),
  ('PLR WRONG POS', 'The player exists but is clearly in the wrong position on the pitch.', '#06b6d4'),
  ('PLR AS NPL', 'The player has been incorrectly categorized as a non-player official.', '#0891b2'),
  ('PLR KEEPER WRONG POS', 'A goal keeper class player is in a seriously wrong position.', '#0e7490'),
  ('BALL MISSED', 'Ball is clearly visible in the video but not tracked/rendered for a noticeable segment.', '#f97316'),
  ('BALL WRONG POS', 'Ball marker exists but is clearly in the wrong place on the pitch (several metres off, wrong side of line, off the field).', '#ea580c'),
  ('BALL TRAJ IMPLAUSIBLE', 'Trajectory is physically impossible or clearly wrong (e.g., teleport jumps, sharp kinks mid-air, long high ball drawn along the ground).', '#eab308'),
  ('BALL HIGH MISCLASS', 'High ball vs ground ball classification clearly wrong (e.g., lob shown as ground pass, or ground ball shown "flying anywhere").', '#ca8a04'),
  ('BALL WRONG OWNER', 'Ball is visually with one player/team but the system''s ball-owner / possession assignment says otherwise (e.g., keeper always ends up with the ball or intermediate non-touching player gets it).', '#c2410c')
) AS v(name, description, color)
WHERE NOT EXISTS (
  SELECT 1 FROM public.labels l
  WHERE l.name = v.name AND l."isDefault" = true
);
