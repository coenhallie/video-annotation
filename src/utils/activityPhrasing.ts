import type {
  ActivityDayGroup,
  ActivityEntry,
  ActivityAction,
  ActivityEntityType,
} from '@/types/database';

/** The single spelling of an actor we could not resolve to a name. */
export const UNKNOWN_ACTOR = 'Unknown';

const FALLBACK_SUBJECT = 'an annotation';

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
  const title =
    entry.entityType === 'comment'
      ? entry.summary.annotationTitle
      : entry.summary.title;
  return title && title.length > 0 ? title : FALLBACK_SUBJECT;
}

/** The comment body, shown under the sentence. Empty for annotations. */
export function activityExcerpt(entry: ActivityEntry): string {
  if (entry.entityType !== 'comment') return '';
  return entry.summary.excerpt ?? '';
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
