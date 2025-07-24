import { VideoService } from './videoService';
import { ComparisonVideoService } from './comparisonVideoService';
import type { Project } from '../types/project';

export class ProjectService {
  /**
   * Check if a video has a valid URL for playback
   */
  private static isVideoValid(video: any): boolean {
    if (!video) return false;

    // For URL videos, check if URL is not empty
    if (video.video_type === 'url') {
      return video.url && video.url.trim() !== '';
    }

    // For uploaded videos, check if either URL or file_path exists
    if (video.video_type === 'upload') {
      return (
        (video.url && video.url.trim() !== '') ||
        (video.file_path && video.file_path.trim() !== '')
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
      console.log('🎬 [ProjectService] Loading projects for user:', userId);

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
        for (const video of videos) {
          if (this.isVideoValid(video)) {
            projects.push({
              id: video.id,
              project_type: 'single',
              title: video.title,
              thumbnail_url: video.thumbnail_url,
              created_at: video.created_at,
              video: video,
            });
          } else {
            console.warn(
              '🚨 [ProjectService] Skipping single video with invalid URL:',
              {
                id: video.id,
                title: video.title,
                video_type: video.video_type,
                url: video.url,
                file_path: video.file_path,
              }
            );
          }
        }
      }

      // Map comparison videos to dual projects
      if (comparisonVideos) {
        for (const comparisonVideo of comparisonVideos) {
          // Ensure we have the related videos and they have valid URLs
          if (comparisonVideo.video_a && comparisonVideo.video_b) {
            const videoAValid = this.isVideoValid(comparisonVideo.video_a);
            const videoBValid = this.isVideoValid(comparisonVideo.video_b);

            if (videoAValid && videoBValid) {
              projects.push({
                id: comparisonVideo.id,
                project_type: 'dual',
                title: comparisonVideo.title,
                thumbnail_url: comparisonVideo.thumbnail_url,
                created_at: comparisonVideo.created_at,
                video_a: comparisonVideo.video_a,
                video_b: comparisonVideo.video_b,
                comparison_video: comparisonVideo,
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

      // Sort projects by created_at in descending order (newest first)
      projects.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
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
        project.project_type
      );

      if (project.project_type === 'single') {
        // Delete single video project
        await VideoService.deleteVideo(project.video.id);
        console.log(
          '✅ [ProjectService] Single video project deleted successfully'
        );
      } else {
        // Delete dual video comparison project
        await ComparisonVideoService.deleteComparisonVideo(
          project.comparison_video.id
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
}
