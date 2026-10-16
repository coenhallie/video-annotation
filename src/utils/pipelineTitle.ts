/**
 * Titles for AWS pipeline output videos.
 *
 * Perspecto cannot look up which match a pipeline id belongs to: that lives in
 * DALF, behind DALF's own login. So DALF's "Open in Perspecto" link carries it:
 *
 *   https://perspecto.ai/?outputVideo=<pipe_id>&match=<teams>&competition=<c>&date=<YYYY-MM-DD>
 *
 * and this module turns those three into the title, e.g.
 * "Manchester City vs PSG - Champions League - 14/10/2026". The format lives
 * here rather than in DALF so that DALF only has to pass fields it already has.
 */

const DEFAULT_PREFIX = 'Pipeline Output - ';

/** Matches the rename_video limit, so a link-derived title is always storable. */
const MAX_TITLE_LENGTH = 200;

const PENDING_KEY = 'pendingOutputVideoTitle';

/**
 * The title a pipeline video gets when nothing better is known. Also how an
 * untouched title is recognised: only a title still exactly equal to this is
 * ever replaced by a match title, so a name someone chose is never overwritten.
 */
export function defaultPipelineTitle(outputVideoId: string): string {
  return `${DEFAULT_PREFIX}${outputVideoId.substring(0, 8)}`;
}

export interface PipelineMatchFields {
  match?: string | null;
  competition?: string | null;
  date?: string | null;
}

/**
 * DALF fills a missing value with "N/A". Treated as absent: a title reading
 * "- N/A -" is worse than one without that part.
 */
function cleanPart(value: string | null | undefined): string | null {
  const cleaned = (value ?? '').replace(/\s+/g, ' ').trim();
  return cleaned && cleaned.toUpperCase() !== 'N/A' ? cleaned : null;
}

/**
 * DD/MM/YYYY from a string starting YYYY-MM-DD, time part ignored. Read off
 * the string rather than through Date, which would move the day by the local
 * offset.
 */
function formatDate(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((value ?? '').trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${day}/${month}/${year}`;
}

/**
 * The match title, or null when there is no match to name. Without the
 * teams, the default title (which at least carries the pipeline id) is the
 * better name.
 */
export function pipelineMatchTitle(fields: PipelineMatchFields): string | null {
  const match = cleanPart(fields.match);
  if (!match) return null;

  const parts = [match, cleanPart(fields.competition), formatDate(fields.date)].filter(
    (part): part is string => part !== null
  );
  return parts.join(' - ').slice(0, MAX_TITLE_LENGTH).trim();
}

/**
 * The Keycloak login round trip comes back to the site root with only
 * `?outputVideo=`, so the title rides in sessionStorage next to
 * pendingOutputVideo. Keyed by id so it can never name a different pipeline.
 */
export function stashPendingPipelineTitle(outputVideoId: string, title: string): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ id: outputVideoId, title }));
}

/** The stashed title for this id, removed as it is read. */
export function takePendingPipelineTitle(outputVideoId: string): string | null {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (raw === null) return null;

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    sessionStorage.removeItem(PENDING_KEY);
    return null;
  }

  const { id, title } = (stored ?? {}) as { id?: unknown; title?: unknown };
  if (id !== outputVideoId || typeof title !== 'string') return null;

  sessionStorage.removeItem(PENDING_KEY);
  return title;
}
