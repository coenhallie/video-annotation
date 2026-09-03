import type {
  ActivityDayGroup,
  ActivityEntry,
  ActivityAction,
  ActivityEntityType,
} from '@/types/database';

/** The single spelling of an actor we could not resolve to a name. */
export const UNKNOWN_ACTOR = 'Unknown';

const FALLBACK_SUBJECT = 'an annotation';
const FALLBACK_VIDEO_SUBJECT = 'this video';

/**
 * The verb table. Keyed "entityType:action" because the two dimensions do not
 * compose: a deleted annotation is "removed", a deleted comment is "removed a
 * comment on" the annotation it hung from, and the sentence has to keep naming
 * the annotation either way.
 */
const VERBS: Record<string, string> = {
  'annotation:created': 'added',
  'annotation:updated': 'edited',
  'annotation:deleted': 'removed',
  'comment:created': 'commented on',
  'comment:deleted': 'removed a comment on',
  // Unreachable today: the comment trigger has no UPDATE branch. Present so
  // that adding one later degrades to a readable sentence rather than a blank.
  'comment:updated': 'changed a comment on',
  // A video event is about the video itself. Only a rename writes one today,
  // which is why 'updated' can be spelled with the specific verb.
  'video:updated': 'renamed',
};

const verbKey = (t: ActivityEntityType, a: ActivityAction) => `${t}:${a}`;

export function activityVerb(entry: ActivityEntry): string {
  return VERBS[verbKey(entry.entityType, entry.action)] ?? 'changed';
}

/**
 * What the sentence is about, always the annotation. A comment entry names its
 * parent, so a reader scanning the feed sees one subject vocabulary rather than
 * annotations and comment bodies alternating.
 */
export function activitySubject(entry: ActivityEntry): string {
  // A video event names the title the video is moving away from, not the one it
  // has now. The new name goes in the excerpt, so the sentence reads in the
  // order the change happened.
  if (entry.entityType === 'video') {
    const from = entry.summary.from ?? '';
    return from.length > 0 ? from : FALLBACK_VIDEO_SUBJECT;
  }
  const title =
    entry.entityType === 'comment'
      ? entry.summary.annotationTitle
      : entry.summary.title;
  return title && title.length > 0 ? title : FALLBACK_SUBJECT;
}

/**
 * The second line, under the sentence: a comment's body, or a rename's new
 * name. Empty for annotations.
 */
export function activityExcerpt(entry: ActivityEntry): string {
  if (entry.entityType === 'video') {
    const to = entry.summary.to ?? '';
    return to.length > 0 ? `Now "${to}"` : '';
  }
  if (entry.entityType !== 'comment') return '';
  return entry.summary.excerpt ?? '';
}

/**
 * Clicking this entry seeks somewhere. Only an entry naming a surviving
 * annotation does.
 */
export function activityIsSeekable(entry: ActivityEntry): boolean {
  return entry.entityType !== 'video' && entry.live;
}

/**
 * The thing this entry names is gone, so the timeline strikes it through.
 *
 * Deliberately not the negation of activityIsSeekable. A video event is not
 * live - there is no annotation behind it to be live - but the video it names
 * is very much still there, and striking it through would say otherwise.
 */
export function activityIsDefunct(entry: ActivityEntry): boolean {
  return entry.entityType !== 'video' && !entry.live;
}

/**
 * Local calendar day, not UTC. Grouping by UTC would put an evening's work
 * under tomorrow's heading for anyone west of Greenwich.
 */
export function activityDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function activityDayLabel(key: string, now: Date = new Date()): string {
  if (!key) return 'UNDATED';

  const today = activityDayKey(now.toISOString());
  if (key === today) return 'TODAY';

  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  if (key === activityDayKey(yesterdayDate.toISOString())) return 'YESTERDAY';

  // Parsed as local midnight rather than through Date(key), which reads a bare
  // yyyy-mm-dd as UTC and can print the previous day.
  const [y, m, d] = key.split('-').map(Number);
  // A key that is not yyyy-mm-dd is shown as it came rather than being turned
  // into an Invalid Date.
  if (y === undefined || m === undefined || d === undefined) return key;
  return new Date(y, m - 1, d).toLocaleDateString();
}

/**
 * Entries arrive newest first from the service, so day order and within-day
 * order both fall out of insertion order. No sorting here: re-sorting would let
 * this module disagree with the query's ORDER BY.
 */
export function groupActivityByDay(
  entries: ActivityEntry[],
  now: Date = new Date()
): ActivityDayGroup[] {
  const groups: ActivityDayGroup[] = [];
  const byKey = new Map<string, ActivityDayGroup>();

  for (const entry of entries) {
    const key = activityDayKey(entry.createdAt);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: activityDayLabel(key, now), entries: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }

  return groups;
}
