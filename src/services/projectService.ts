import { VideoService } from './videoService';
import { ComparisonVideoService } from './comparisonVideoService';
import { AnnotationService } from './annotationService';
import { CommentService } from './commentService';
import { supabase } from '@/composables/useSupabase';
import type { Project } from '../types/project';

export class ProjectService {
  /**
   * Check if a video has a valid URL for playback
   */
  private static isVideoValid(video: any): boolean {
    if (!video) return false;

    // AWS videos are always valid (URL is fetched on demand)
    if (video.videoId && typeof video.videoId === 'string' && video.videoId.startsWith('aws:')) {
      return true;
    }

    // For URL videos, check if URL is not empty
    if (video.videoType === 'url') {
      return video.url && video.url.trim() !== '';
    }

    // For uploaded videos, check if either URL or filePath exists
    if (video.videoType === 'upload') {
      return (
        (video.url && video.url.trim() !== '') ||
        (video.filePath && video.filePath.trim() !== '')
      );
    }

    return false;
  }

  /**
   * Get all projects (single videos and dual video comparisons) for a user
   * Returns a unified list of projects sorted by creation date (newest first)
   */
  static async getUserProjects(userId: string): Promise<Project[]> {
    try {
      // Fetch all videos and comparison videos for the user
      const [videos, comparisonVideos] = await Promise.all([
        VideoService.getUserVideos(userId),
        ComparisonVideoService.getUserComparisonVideos(userId),
      ]);

      console.log(
        '🎬 [ProjectService] Loaded videos:',
        videos?.length || 0,
        'comparison videos:',
        comparisonVideos?.length || 0
      );

      const projects: Project[] = [];

      // Map individual videos to single projects
      if (videos) {
        console.log(
          '📊 [ProjectService] Processing videos for projects:',
          videos.map((v) => ({
            id: v.id,
            title: v.title,
            originalFilename: v.originalFilename,
            createdAt: v.createdAt,
            videoType: v.videoType,
            hasThumbnail: !!v.thumbnailUrl,
          }))
        );

        for (const video of videos) {
          if (this.isVideoValid(video)) {
            const project = {
              id: video.id,
              projectType: 'single' as const,
              title: video.title,
              thumbnailUrl: video.thumbnailUrl,
              createdAt: video.createdAt,
              video: video,
            };

            console.log('✅ [ProjectService] Adding project:', {
              id: project.id,
              title: project.title,
              videoTitle: video.title,
              originalFilename: video.originalFilename,
              createdAt: project.createdAt,
            });

            projects.push(project);
          } else {
            console.warn(
              '🚨 [ProjectService] Skipping single video with invalid URL:',
              {
                id: video.id,
                title: video.title,
                videoType: video.videoType,
                url: video.url,
                filePath: video.filePath,
              }
            );
          }
        }
      }

      // Map comparison videos to dual projects
      if (comparisonVideos) {
        for (const comparisonVideo of comparisonVideos) {
          // Ensure we have the related videos and they have valid URLs
          if (comparisonVideo.videoA && comparisonVideo.videoB) {
            const videoAValid = this.isVideoValid(comparisonVideo.videoA);
            const videoBValid = this.isVideoValid(comparisonVideo.videoB);

            if (videoAValid && videoBValid) {
              projects.push({
                id: comparisonVideo.id,
                projectType: 'dual',
                title: comparisonVideo.title || 'Untitled Comparison',
                thumbnailUrl: comparisonVideo.thumbnailUrl,
                createdAt:
                  comparisonVideo.createdAt || new Date().toISOString(),
                videoA: comparisonVideo.videoA,
                videoB: comparisonVideo.videoB,
                comparisonVideo: comparisonVideo as any,
              });
            } else {
              console.warn(
                '🚨 [ProjectService] Skipping comparison video with invalid videos:',
                {
                  id: comparisonVideo.id,
                  title: comparisonVideo.title,
                  videoAValid,
                  videoBValid,
                }
              );
            }
          }
        }
      }

      // Sort projects by createdAt in descending order (newest first)
      projects.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      console.log(
        '🎬 [ProjectService] Total projects loaded:',
        projects.length
      );

      return projects;
    } catch (error) {
      console.error('❌ [ProjectService] Error loading projects:', error);
      throw error;
    }
  }

  /**
   * Delete a project (single video or dual video comparison)
   * This will handle deletion of the appropriate underlying entity
   */
  static async deleteProject(project: Project): Promise<void> {
    try {
      console.log(
        '🗑️ [ProjectService] Deleting project:',
        project.title,
        'Type:',
        project.projectType
      );

      if (project.projectType === 'single') {
        // Delete single video project
        await VideoService.deleteVideo(project.video.id);
        console.log(
          '✅ [ProjectService] Single video project deleted successfully'
        );
      } else {
        // Delete dual video comparison project
        await ComparisonVideoService.deleteComparisonVideo(
          project.comparisonVideo.id
        );
        console.log(
          '✅ [ProjectService] Dual video project deleted successfully'
        );
      }
    } catch (error) {
      console.error('❌ [ProjectService] Error deleting project:', error);
      throw error;
    }
  }

  /**
   * Get annotation count for a project
   */
  static async getProjectAnnotationCount(project: Project): Promise<number> {
    try {
      if (project.projectType === 'single') {
        // For single video projects, get annotations for the video
        const annotations = await AnnotationService.getVideoAnnotations(
          project.video.id,
          project.id
        );
        return annotations.length;
      } else {
        // For dual video projects, get comparison annotations
        const annotations =
          await AnnotationService.getComparisonVideoAnnotations(
            project.comparisonVideo.id
          );
        return annotations.length;
      }
    } catch (error) {
      console.error(
        '❌ [ProjectService] Error getting annotation count:',
        error
      );
      return 0;
    }
  }

  /**
   * Get comment count for a project
   */
  static async getProjectCommentCount(project: Project): Promise<number> {
    try {
      if (project.projectType === 'single') {
        // For single video projects, get all annotations and count their comments
        const annotations = await AnnotationService.getVideoAnnotations(
          project.video.id,
          project.id
        );

        if (annotations.length === 0) return 0;

        const commentCounts = await Promise.all(
          annotations.map((annotation) =>
            CommentService.getCommentCount(annotation.id)
          )
        );

        return commentCounts.reduce((total, count) => total + count, 0);
      } else {
        // For dual video projects, get comparison annotations and count their comments
        const annotations =
          await AnnotationService.getComparisonVideoAnnotations(
            project.comparisonVideo.id
          );

        if (annotations.length === 0) return 0;

        const commentCounts = await Promise.all(
          annotations.map((annotation) =>
            CommentService.getCommentCount(annotation.id)
          )
        );

        return commentCounts.reduce((total, count) => total + count, 0);
      }
    } catch (error) {
      console.error('❌ [ProjectService] Error getting comment count:', error);
      return 0;
    }
  }

  /**
   * Get annotation and comment counts for multiple projects
   */
  static async getProjectCounts(projects: Project[]): Promise<{
    annotationCounts: Record<string, number>;
    commentCounts: Record<string, number>;
  }> {
    try {
      const annotationCounts: Record<string, number> = {};
      const commentCounts: Record<string, number> = {};

      // Get counts for all projects in parallel
      const countPromises = projects.map(async (project) => {
        const [annotationCount, commentCount] = await Promise.all([
          this.getProjectAnnotationCount(project),
          this.getProjectCommentCount(project),
        ]);

        return {
          projectId: project.id,
          annotationCount,
          commentCount,
        };
      });

      const results = await Promise.all(countPromises);

      results.forEach(({ projectId, annotationCount, commentCount }) => {
        annotationCounts[projectId] = annotationCount;
        commentCounts[projectId] = commentCount;
      });

      return { annotationCounts, commentCounts };
    } catch (error) {
      console.error('❌ [ProjectService] Error getting project counts:', error);
      return { annotationCounts: {}, commentCounts: {} };
    }
  }

  /**
   * Batched counts for a page of projects — bounded number of grouped
   * queries total, replacing the per-project N+1 in getProjectCounts.
   *
   * PostgREST can't express a cross-column OR in a single `.in(...)`, so
   * the annotation read is split into two column-filtered queries (one for
   * single-video projects via `videoId`, one for dual projects via
   * `comparisonVideoId`), plus one comments query — 3 queries total,
   * still O(1) in the number of projects.
   */
  static async getProjectCountsBatched(projects: Project[]): Promise<{
    annotationCounts: Record<string, number>;
    commentCounts: Record<string, number>;
  }> {
    const annotationCounts: Record<string, number> = {};
    const commentCounts: Record<string, number> = {};
    if (projects.length === 0) return { annotationCounts, commentCounts };

    const videoIds = projects
      .filter((p) => p.projectType === 'single')
      .map((p) => (p as any).video.id as string);
    const comparisonIds = projects
      .filter((p) => p.projectType === 'dual')
      .map((p) => (p as any).comparisonVideo.id as string);

    // Map annotation id -> owning project id, and seed annotation counts.
    const annToProject: Record<string, string> = {};
    const ids = [...videoIds, ...comparisonIds];
    for (const id of ids) {
      annotationCounts[id] = 0;
      commentCounts[id] = 0;
    }

    // Single-video projects: annotations filtered by videoId.
    const { data: annRowsByVideo } = await supabase
      .from('annotations')
      .select('id, videoId, comparisonVideoId')
      .in('videoId', videoIds.length ? videoIds : ['__none__']);

    // Dual projects: annotations filtered by comparisonVideoId. This is a
    // separate query (not chained as OR) because PostgREST can't express a
    // cross-column OR within a single `.in(...)`.
    const { data: annRowsByComparison } = await supabase
      .from('annotations')
      .select('id, videoId, comparisonVideoId')
      .in(
        'comparisonVideoId',
        comparisonIds.length ? comparisonIds : ['__none__']
      );

    const allAnn = [...(annRowsByVideo ?? []), ...(annRowsByComparison ?? [])];
    for (const a of allAnn) {
      const pid = a.videoId ?? a.comparisonVideoId;
      if (pid == null) continue;
      annToProject[a.id] = pid;
      annotationCounts[pid] = (annotationCounts[pid] ?? 0) + 1;
      commentCounts[pid] = commentCounts[pid] ?? 0;
    }

    const annIds = Object.keys(annToProject);
    if (annIds.length) {
      const { data: commentRows } = await supabase
        .from('annotation_comments')
        .select('annotationId')
        .in('annotationId', annIds);
      for (const c of commentRows ?? []) {
        const pid = annToProject[c.annotationId];
        if (pid) commentCounts[pid] = (commentCounts[pid] ?? 0) + 1;
      }
    }
    return { annotationCounts, commentCounts };
  }
}
