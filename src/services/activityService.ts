import { supabase } from '@/composables/useSupabase';
import { fetchOwners, UNKNOWN_OWNER_NAME } from '@/services/ownerEnrichmentService';
import { UNKNOWN_ACTOR } from '@/utils/activityPhrasing';
import type { ActivityEntry, DatabaseActivityEvent } from '@/types/database';

export type ActivityTarget = { videoId: string } | { comparisonVideoId: string };

/**
 * Safety bound on the read. The busiest video has 19 annotations today, so this
 * is far above anything real; it exists so a pathological row count can never
 * turn opening a tab into a big query. There is deliberately no pagination:
 * when a single video's history genuinely exceeds this, that is a real question
 * and answering it now would be guessing.
 */
const DEFAULT_LIMIT = 100;

const COLUMNS =
  'id, videoId, comparisonVideoId, actorId, actorName, entityType, entityId, action, summary, createdAt';

/**
 * The annotation an event points at. For a comment that is its parent, which
 * the trigger snapshots into the summary, because seeking to a comment means
 * seeking to the annotation it hangs from.
 */
function annotationIdFor(row: DatabaseActivityEvent): string | null {
  if (row.entityType === 'annotation') return row.entityId;
  return row.summary?.annotationId ?? null;
}

/**
 * This video's activity, newest first, with actor names resolved.
 *
 * Three reads, all on indexed keys. The liveness read is separate rather than a
 * PostgREST embed because "entityId" deliberately carries no foreign key, so
 * there is nothing to embed through. It also cannot be answered from the
 * annotations the editor already holds: those are filtered by the active
 * surface, so a video-surface annotation would read as deleted whenever the
 * pipeline tab is open.
 *
 * Failures are warned and swallowed, returning an empty list, matching
 * watchProgressService and recentOpensService. A history panel that cannot load
 * must not take the editor down with it.
 */
export async function getActivity(
  target: ActivityTarget,
  limit: number = DEFAULT_LIMIT
): Promise<ActivityEntry[]> {
  try {
    const isSingle = 'videoId' in target;
    const column = isSingle ? 'videoId' : 'comparisonVideoId';
    const value = isSingle ? target.videoId : target.comparisonVideoId;

    const { data, error } = await supabase
      .from('activity_events')
      .select(COLUMNS)
      .eq(column, value)
      .order('createdAt', { ascending: false })
      .limit(limit);

    if (error || !data) {
      if (error) console.warn('⚠️ [activity] getActivity error:', error);
      return [];
    }

    const rows = data as DatabaseActivityEvent[];
    if (rows.length === 0) return [];

    const annotationIds = [
      ...new Set(rows.map(annotationIdFor).filter((id): id is string => !!id)),
    ];

    const [liveIds, owners] = await Promise.all([
      fetchLiveAnnotationIds(annotationIds),
      fetchOwners(
        rows.map((r) => r.actorId).filter((id): id is string => !!id)
      ),
    ]);

    return rows.map((row) => {
      const annotationId = annotationIdFor(row);
      // Liveness is a fact about the target, not about the action. A deleted
      // annotation simply cannot come back from the liveness read, while a
      // removed comment on a surviving annotation still has somewhere to seek
      // to. Special-casing `action === 'deleted'` would break the second case.
      return {
        ...row,
        actor: resolveActor(row, owners),
        live: !!annotationId && liveIds.has(annotationId),
      };
    });
  } catch (err) {
    console.warn('⚠️ [activity] getActivity failed:', err);
    return [];
  }
}

async function fetchLiveAnnotationIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from('annotations')
    .select('id')
    .in('id', ids);

  if (error || !data) {
    if (error) console.warn('⚠️ [activity] liveness lookup error:', error);
    // Unknown liveness degrades to inert entries rather than to seeks that
    // silently do nothing.
    return new Set();
  }
  return new Set((data as Array<{ id: string }>).map((r) => r.id));
}

/**
 * The id wins when it resolves, so a rename propagates through the whole feed.
 * The snapshot name is the fallback for the two cases with no id: an anonymous
 * share-link commenter, and a deleted user.
 */
function resolveActor(
  row: DatabaseActivityEvent,
  owners: Record<string, { name: string }>
): string {
  if (row.actorId) {
    const name = owners[row.actorId]?.name;
    if (name && name !== UNKNOWN_OWNER_NAME) return name;
  }
  return row.actorName || UNKNOWN_ACTOR;
}
