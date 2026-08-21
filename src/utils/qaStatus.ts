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
  not_started: 'NOT STARTED',
  in_review: 'IN REVIEW',
  failed: 'FAILED',
  staging: 'STAGING',
  production: 'PRODUCTION',
};

export function qaStatusLabel(status: QaStatus): string {
  return LABELS[status];
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
export function qaStatusToneClass(status: QaStatus): string {
  return status === 'failed'
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

export function qaStatusPillClass(status: QaStatus): string {
  return PILL_CLASSES[status];
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
 * The QA control's target, or null when it must not render.
 *
 * Shared and anonymous viewers are outside the QA process, and the RPC that
 * backs the control would refuse them anyway, so hiding it beats showing a
 * control that always fails. A video with no id or no qaStatus yet loaded is
 * not a usable target either.
 *
 * Pulled out as a pure function - mirroring isPipelineSurfaceVisible in
 * pipelineSurface.ts - so EditorView's computed is testable without mounting
 * the view.
 */
export function resolveQaStatusTarget(
  video: Partial<Video> | null | undefined,
  isSharedVideo: boolean,
  isSharedComparison: boolean
): QaStatusTarget | null {
  if (isSharedVideo || isSharedComparison) return null;
  if (!video?.id || !video.qaStatus) return null;
  return {
    id: video.id,
    qaStatus: video.qaStatus,
    // Not a literal `qaStatusUpdatedAt: video.qaStatusUpdatedAt`: with
    // exactOptionalPropertyTypes, assigning undefined to an optional field is
    // not the same as omitting it.
    ...(video.qaStatusUpdatedAt !== undefined
      ? { qaStatusUpdatedAt: video.qaStatusUpdatedAt }
      : {}),
  };
}
