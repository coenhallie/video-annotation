import { supabase } from '@/composables/useSupabase';
import {
  fetchOwners,
  type ProjectOwner,
} from '@/services/ownerEnrichmentService';
import {
  mergeRanges,
  percentFromRanges,
  type WatchedRange,
} from '@/utils/watchedRanges';

export interface WatchProgressRow {
  userId: string;
  videoId: string;
  watchedRanges: WatchedRange[];
  percentWatched: number;
  updatedAt?: string;
}

export interface UserWatchProgress extends WatchProgressRow {
  user: ProjectOwner;
}

const COLUMNS = 'userId, videoId, watchedRanges, percentWatched, updatedAt';

export async function getProgress(
  videoId: string,
  userId: string
): Promise<WatchProgressRow | null> {
  try {
    const { data, error } = await supabase
      .from('video_watch_progress')
      .select(COLUMNS)
      .eq('videoId', videoId)
      .eq('userId', userId)
      .maybeSingle();

    if (error) {
      console.warn('⚠️ [watchProgress] getProgress error:', error);
      return null;
    }
    return (data as WatchProgressRow | null) ?? null;
  } catch (err) {
    console.warn('⚠️ [watchProgress] getProgress failed:', err);
    return null;
  }
}

export async function getProgressForVideo(
  videoId: string
): Promise<UserWatchProgress[]> {
  try {
    const { data, error } = await supabase
      .from('video_watch_progress')
      .select(COLUMNS)
      .eq('videoId', videoId)
      .order('percentWatched', { ascending: false });

    if (error || !data) {
      if (error) {
        console.warn('⚠️ [watchProgress] getProgressForVideo error:', error);
      }
      return [];
    }

    const rows = data as WatchProgressRow[];
    const owners = await fetchOwners(rows.map((r) => r.userId));
    return rows.map((r) => ({
      ...r,
      user: owners[r.userId] ?? { id: r.userId, name: 'Unknown' },
    }));
  } catch (err) {
    console.warn('⚠️ [watchProgress] getProgressForVideo failed:', err);
    return [];
  }
}

export async function upsertProgress(
  userId: string,
  videoId: string,
  ranges: WatchedRange[],
  duration: number
): Promise<boolean> {
  try {
    const watchedRanges = mergeRanges(ranges);
    const { error } = await supabase.from('video_watch_progress').upsert(
      {
        userId,
        videoId,
        watchedRanges,
        percentWatched: percentFromRanges(watchedRanges, duration),
        updatedAt: new Date().toISOString(),
      },
      { onConflict: 'userId,videoId' }
    );

    if (error) {
      console.warn('⚠️ [watchProgress] upsertProgress error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('⚠️ [watchProgress] upsertProgress failed:', err);
    return false;
  }
}

/**
 * Per-user progress for a dual project: a user's coverage is the LOWER of
 * their two per-video percentages (not watching one video at all = 0).
 */
export function mergeDualProgress(
  a: UserWatchProgress[],
  b: UserWatchProgress[]
): UserWatchProgress[] {
  const aPercent = new Map(a.map((r) => [r.userId, r.percentWatched]));
  const bPercent = new Map(b.map((r) => [r.userId, r.percentWatched]));
  const byUser = new Map<string, UserWatchProgress>();
  for (const row of [...a, ...b]) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, row);
  }
  return [...byUser.values()]
    .map((row) => ({
      ...row,
      percentWatched: Math.min(
        aPercent.get(row.userId) ?? 0,
        bPercent.get(row.userId) ?? 0
      ),
    }))
    .sort((x, y) => y.percentWatched - x.percentWatched);
}
