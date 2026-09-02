import type { QaStatus, Video } from '@/types/database';

/**
 * The five values in workflow order. This array is the source of truth for the
 * order options appear in the select; it must stay in step with the
 * videos_qa_status_check constraint in migrations/20260821_video_qa_status.sql.
 */
export const QA_STATUSES: readonly QaStatus[] = [
  'not_started',
  'in_review',
  'failed',
  'staging',
  'production',
] as const;

const LABELS: Record<QaStatus, string> = {
  not_started: 'UNREVIEWED',
  in_review: 'IN REVIEW',
  failed: 'FAILED',
  staging: 'STAGING',
  production: 'PRODUCTION',
};

/**
 * What an absent status renders as.
 *
 * Absent is not the same as `not_started`, but it looks the same on purpose: a
 * pill with no text is a 96px empty outline that reads as a progress bar, which
 * is worse than a label that is merely approximate. And it is not approximate
 * in the case that actually produces it - a video whose status has never been
 * written has not been reviewed.
 *
 * The status can be absent for one real reason: the frontend is running against
 * a database where the `qaStatus` column does not exist yet. That is a
 * deployment error, so `qaStatusLabel` warns once rather than papering over it
 * in silence.
 */
const ABSENT_FALLBACK: QaStatus = 'not_started';

let warnedAboutAbsentStatus = false;

export function toQaStatus(status: QaStatus | null | undefined): QaStatus {
  if (status && isQaStatus(status)) return status;

  if (!warnedAboutAbsentStatus) {
    warnedAboutAbsentStatus = true;
    console.warn(
      '[qaStatus] A video arrived with no qaStatus. Rendering it as ' +
        `${LABELS[ABSENT_FALLBACK]}. If every video is doing this, the ` +
        'migration adding videos.qaStatus has not been applied to this database.'
    );
  }

  return ABSENT_FALLBACK;
}

/**
 * Total by design: every caller renders a pill or a select option, and there is
 * no value of `status` for which returning nothing is better than returning a
 * word.
 */
export function qaStatusLabel(status: QaStatus | null | undefined): string {
  return LABELS[toQaStatus(status)];
}

export function isQaStatus(value: unknown): value is QaStatus {
  return (
    typeof value === 'string' && (QA_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Text colour for the select, which sits among grey meta tokens. `failed` gets
 * the one accent the app already uses for destructive and error states.
 */
export function qaStatusToneClass(status: QaStatus | null | undefined): string {
  return toQaStatus(status) === 'failed'
    ? 'text-red-600 dark:text-red-400'
    : 'text-gray-500 dark:text-gray-400';
}

/**
 * Border, fill and text for the dashboard pill.
 *
 * Three weights, not five colours: recedes (not_started), outlined
 * (in_review, staging, and failed in the accent), filled (production, the
 * terminal state). Five hues would scan marginally faster and would add five
 * accents to an app whose header comment says three were already too many.
 * Weight also survives colour-blind viewing, which hue does not.
 *
 * Production inverts in dark mode. A dark fill on a dark page is invisible.
 */
const PILL_CLASSES: Record<QaStatus, string> = {
  not_started: 'border-gray-200 text-gray-400 dark:border-white/10 dark:text-gray-500',
  in_review: 'border-gray-300 text-gray-500 dark:border-white/15 dark:text-gray-400',
  failed: 'border-red-300 text-red-600 dark:border-red-400/40 dark:text-red-400',
  staging: 'border-gray-300 text-gray-900 dark:border-white/20 dark:text-white',
  production:
    'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900',
};

export function qaStatusPillClass(status: QaStatus | null | undefined): string {
  return PILL_CLASSES[toQaStatus(status)];
}

/**
 * The narrow shape the select needs, rather than a whole `Video`.
 *
 * EditorView holds the loaded video as `Ref<Partial<Video> | null>`, so a
 * `Video`-typed prop would force a cast at that call site and hide the fact
 * that `qaStatus` really can be absent there. Three fields, all required to be
 * present by the time the control renders.
 */
export interface QaStatusTarget {
  id: string;
  qaStatus: QaStatus;
  qaStatusUpdatedAt?: string;
}

/**
 * Folds a successful QA status write back into the loaded video object the
 * store still holds, so a later unrelated reassignment of the same ref (an
 * AWS presigned URL refresh after a playback error, say) does not carry the
 * pre-save qaStatus forward and quietly revert the control that already
 * reported the new value.
 *
 * Guarded on id rather than applied unconditionally: if the viewer has moved
 * on to a different video by the time a write resolves, that video's fields
 * must not land on this one.
 *
 * Merges only the QA fields plus `updatedAt`, not the whole returned row. A
 * full-row spread would also overwrite fields the QA write never touched -
 * `url`, `duration`, `title` and the like - with whatever `updated` happened
 * to hold, which is one more way a stale or racing write could corrupt the
 * currently displayed video.
 */
export function mergeQaStatusUpdate(
  current: Partial<Video> | null,
  updated: Video
): Partial<Video> | null {
  if (!current || current.id !== updated.id) return current;
  return {
    ...current,
    qaStatus: updated.qaStatus,
    updatedAt: updated.updatedAt,
    // Conditional spreads, not literal assignments: with
    // exactOptionalPropertyTypes, assigning undefined to an optional field is
    // not the same as omitting it.
    ...(updated.qaStatusUpdatedAt !== undefined
      ? { qaStatusUpdatedAt: updated.qaStatusUpdatedAt }
      : {}),
    ...(updated.qaStatusUpdatedBy !== undefined
      ? { qaStatusUpdatedBy: updated.qaStatusUpdatedBy }
      : {}),
  };
}
