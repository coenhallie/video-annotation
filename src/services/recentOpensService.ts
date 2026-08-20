import { supabase } from '@/composables/useSupabase';

export type OpenTarget = { videoId: string } | { comparisonVideoId: string };

interface ProjectOpenRow {
  videoId: string | null;
  comparisonVideoId: string | null;
  openedAt: string;
}

/**
 * Safety bound on the read. A user's own recents are small; this exists so a
 * pathological row count can never turn the dashboard load into a big query.
 */
const RECENT_OPENS_LIMIT = 500;

/**
 * Record that this user just opened this project. Informational only -
 * failures are warned and swallowed, never surfaced, exactly like
 * watchProgressService.
 */
export async function recordOpen(
  userId: string,
  target: OpenTarget
): Promise<boolean> {
  try {
    const isSingle = 'videoId' in target;
    const row = {
      userId,
      videoId: isSingle ? target.videoId : null,
      comparisonVideoId: isSingle ? null : target.comparisonVideoId,
      // Sent explicitly rather than left to the column's DEFAULT now(): the
      // default fires on INSERT only, and PostgREST builds DO UPDATE SET from
      // the columns actually sent, so omitting it would leave every re-open
      // stuck at the project's first-open timestamp.
      openedAt: new Date().toISOString(),
    };

    const { error } = await supabase.from('project_opens').upsert(row, {
      onConflict: isSingle ? 'userId,videoId' : 'userId,comparisonVideoId',
    });

    if (error) {
      console.warn('⚠️ [recentOpens] recordOpen error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('⚠️ [recentOpens] recordOpen failed:', err);
    return false;
  }
}

/**
 * This user's opens, keyed by project id - video id for single projects,
 * comparison id for dual ones, matching Project.id from mapToProjects.
 *
 * One query keyed on the user rather than an `.in(projectIds)` over every
 * loaded project: the user's own recents are small and bounded, and the
 * ("userId", "openedAt" DESC) index serves this directly.
 */
export async function getRecentOpens(
  userId: string
): Promise<Record<string, string>> {
  try {
    const { data, error } = await supabase
      .from('project_opens')
      .select('videoId, comparisonVideoId, openedAt')
      .eq('userId', userId)
      .order('openedAt', { ascending: false })
      .limit(RECENT_OPENS_LIMIT);

    if (error || !data) {
      if (error) {
        console.warn('⚠️ [recentOpens] getRecentOpens error:', error);
      }
      return {};
    }

    const byProject: Record<string, string> = {};
    for (const row of data as ProjectOpenRow[]) {
      const projectId = row.videoId ?? row.comparisonVideoId;
      if (projectId) byProject[projectId] = row.openedAt;
    }
    return byProject;
  } catch (err) {
    console.warn('⚠️ [recentOpens] getRecentOpens failed:', err);
    return {};
  }
}
