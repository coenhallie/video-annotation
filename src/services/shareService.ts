import { supabase } from '../composables/useSupabase';
import { CommentService } from './commentService';
import { AnnotationService } from './annotationService';
import type {
  AnonymousSession,
  SharedComparisonVideoWithCommentPermissions,
} from '../types/database';

export interface SharedVideoWithCommentPermissions {
  id: string;
  title: string;
  description?: string;
  url?: string;
  filePath?: string;
  videoType: string;
  isPublic: boolean;
  canComment: boolean;
  annotations: any[];
}

export interface CommentPermissionContext {
  canComment: boolean;
  isAnonymous: boolean;
  sessionId?: string;
  reason?: string;
}

export class ShareService {
  // Generate a shareable link for a video
  static async createShareableLink(
    videoId: string,
    allowAnnotations: boolean = false
  ): Promise<string> {
    try {
      // Make the video public and set annotation permissions
      await supabase
        .from('videos')
        .update({ isPublic: true, allowAnnotations })
        .eq('id', videoId);

      // Generate the shareable URL with video ID
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}?share=${videoId}`;

      return shareUrl;
    } catch (error) {
      console.error('❌ [ShareService] Error creating shareable link:', error);
      throw error;
    }
  }

  // Get shared video data with comment permissions (public videos only)
  static async getSharedVideoWithCommentPermissions(
    videoId: string
  ): Promise<SharedVideoWithCommentPermissions> {
    try {
      // Get the video (must be public)
      const { data: videos, error: videoError } = await supabase
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .eq('isPublic', true);

      if (videoError) {
        console.error(
          '❌ [ShareService] Error loading shared video:',
          videoError
        );
        throw videoError;
      }

      const video = videos && videos.length > 0 ? videos[0] : null;

      if (!video) {
        throw new Error('Video not found or not public');
      }

      // Get the annotations for this video with comment counts
      let mappedAnnotations = [];
      try {
        // Use AnnotationService to get annotations with comment counts
        // Pass videoId as projectId since annotations might be associated with the video as a project
        mappedAnnotations = await AnnotationService.getVideoAnnotations(
          videoId,
          videoId, // Use videoId as projectId for shared videos
          true // includeCommentCounts
        );
      } catch (annotationsError) {
        console.error(
          '❌ [ShareService] Error loading annotations:',
          annotationsError
        );
        // Fallback to basic annotation fetch without comment counts
        const { data: annotations } = await supabase
          .from('annotations')
          .select('*')
          .eq('videoId', videoId)
          .order('timestamp', { ascending: true });

        mappedAnnotations = annotations || [];
      }

      // Determine comment permissions for shared videos
      const canComment = this.canCommentOnSharedVideo(video);

      const result = {
        id: video.id,
        title: video.title,
        description: video.description,
        url: video.url,
        filePath: video.filePath,
        videoType: video.videoType,
        isPublic: video.isPublic,
        canComment: canComment,
        annotations: mappedAnnotations,
      };

      return result;
    } catch (error) {
      console.error(
        '❌ [ShareService] Error getting shared video with comment permissions:',
        error
      );
      throw error;
    }
  }

  // Legacy method for backward compatibility
  static async getSharedVideo(videoId: string) {
    const result = await this.getSharedVideoWithCommentPermissions(videoId);
    return {
      video: {
        id: result.id,
        title: result.title,
        description: result.description,
        url: result.url,
        filePath: result.filePath,
        videoType: result.videoType,
        isPublic: result.isPublic,
      },
      annotations: result.annotations,
    };
  }

  // Make a video private again
  static async makeVideoPrivate(videoId: string): Promise<void> {
    try {
      await supabase
        .from('videos')
        .update({ isPublic: false })
        .eq('id', videoId);
    } catch (error) {
      console.error('❌ [ShareService] Error making video private:', error);
      throw error;
    }
  }

  // Copy text to clipboard
  static async copyToClipboard(text: string): Promise<void> {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
    } catch (error) {
      console.error('❌ [ShareService] Error copying to clipboard:', error);
      throw error;
    }
  }

  // Parse share URL parameters with type detection
  static parseShareUrl(): {
    type: 'video' | 'comparison' | null;
    id: string | null;
  } {
    const urlParams = new URLSearchParams(window.location.search);

    const videoId = urlParams.get('share');
    const comparisonId = urlParams.get('shareComparison');

    if (videoId) {
      return { type: 'video', id: videoId };
    }

    if (comparisonId) {
      return { type: 'comparison', id: comparisonId };
    }

    return { type: null, id: null };
  }

  // Legacy method for backward compatibility
  static parseShareUrlLegacy(): string | null {
    const result = this.parseShareUrl();
    return result.type === 'video' ? result.id : null;
  }

  // ===== COMPARISON VIDEO SHARING METHODS =====

  /**
   * Create shareable link for comparison video
   */
  static async createComparisonShareableLink(
    comparisonId: string,
    allowAnnotations: boolean = false
  ): Promise<string> {
    try {
      // Make the comparison video public and set annotation permissions
      await supabase
        .from('comparison_videos')
        .update({ isPublic: true, allowAnnotations })
        .eq('id', comparisonId);

      // Generate the shareable URL
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}?shareComparison=${comparisonId}`;

      return shareUrl;
    } catch (error) {
      console.error(
        '❌ [ShareService] Error creating comparison shareable link:',
        error
      );
      throw error;
    }
  }

  /**
   * Get shared comparison video with comment permissions
   */
  static async getSharedComparisonVideoWithCommentPermissions(
    comparisonId: string
  ): Promise<SharedComparisonVideoWithCommentPermissions> {
    try {
      // Get the comparison video (must be public)
      const { data: comparisons, error: comparisonError } = await supabase
        .from('comparison_videos')
        .select('*')
        .eq('id', comparisonId)
        .eq('isPublic', true);

      if (comparisonError) {
        console.error(
          '❌ [ShareService] Error loading shared comparison video:',
          comparisonError
        );
        throw comparisonError;
      }

      const comparison =
        comparisons && comparisons.length > 0 ? comparisons[0] : null;

      if (!comparison) {
        throw new Error('Comparison video not found or not public');
      }

      // Get both videos (may be public or private)
      const [videoAResult, videoBResult] = await Promise.all([
        supabase.from('videos').select('*').eq('id', comparison.videoAId),
        supabase.from('videos').select('*').eq('id', comparison.videoBId),
      ]);

      // Transform results to handle arrays and maintain compatibility with createVideoForComparison
      const videoATransformed = {
        data:
          videoAResult.data && videoAResult.data.length > 0
            ? videoAResult.data[0]
            : null,
        error: videoAResult.error,
      };
      const videoBTransformed = {
        data:
          videoBResult.data && videoBResult.data.length > 0
            ? videoBResult.data[0]
            : null,
        error: videoBResult.error,
      };

      // Handle missing videos (but allow private videos in comparison context)
      const videoA = this.createVideoForComparison(
        videoATransformed,
        'Video A'
      );
      const videoB = this.createVideoForComparison(
        videoBTransformed,
        'Video B'
      );

      // Get all annotations for the comparison context with comment counts
      let mappedAnnotations = [];
      try {
        // Fetch annotations with comment counts using AnnotationService
        const [comparisonAnnotations, videoAAnnotations, videoBAnnotations] =
          await Promise.all([
            // For comparison-specific annotations, we need to fetch them directly
            // then add comment counts separately
            (async () => {
              const { data } = await supabase
                .from('annotations')
                .select('*')
                .eq('comparisonVideoId', comparisonId)
                .order('timestamp', { ascending: true });

              if (data && data.length > 0) {
                // Add comment counts to comparison annotations
                const annotationIds = data.map((annotation) => annotation.id);
                const commentCounts = await Promise.all(
                  annotationIds.map((id) => CommentService.getCommentCount(id))
                );

                return data.map((annotation, index) => ({
                  ...annotation,
                  commentCount: commentCounts[index] || 0,
                }));
              }
              return [];
            })(),
            // Use AnnotationService for individual video annotations
            AnnotationService.getVideoAnnotations(
              comparison.videoAId,
              undefined,
              true // includeCommentCounts
            ),
            AnnotationService.getVideoAnnotations(
              comparison.videoBId,
              undefined,
              true // includeCommentCounts
            ),
          ]);

        // Combine all annotations
        mappedAnnotations = [
          ...comparisonAnnotations,
          ...videoAAnnotations,
          ...videoBAnnotations,
        ];
      } catch (error) {
        console.error(
          '❌ [ShareService] Error loading annotations with comment counts:',
          error
        );
        // Fallback to basic annotation fetch without comment counts
        const [
          comparisonAnnotationsResult,
          videoAAnnotationsResult,
          videoBAnnotationsResult,
        ] = await Promise.all([
          supabase
            .from('annotations')
            .select('*')
            .eq('comparisonVideoId', comparisonId)
            .order('timestamp', { ascending: true }),
          supabase
            .from('annotations')
            .select('*')
            .eq('videoId', comparison.videoAId)
            .order('timestamp', { ascending: true }),
          supabase
            .from('annotations')
            .select('*')
            .eq('videoId', comparison.videoBId)
            .order('timestamp', { ascending: true }),
        ]);

        mappedAnnotations = [
          ...(comparisonAnnotationsResult.data || []),
          ...(videoAAnnotationsResult.data || []),
          ...(videoBAnnotationsResult.data || []),
        ];
      }

      // Comment permissions for comparison videos - requires both isPublic and allowAnnotations
      const canComment = comparison.isPublic && comparison.allowAnnotations;

      const result = {
        id: comparison.id,
        title: comparison.title,
        description: comparison.description,
        videoA: videoA,
        videoB: videoB,
        isPublic: comparison.isPublic,
        canComment: canComment,
        annotations: mappedAnnotations,
        thumbnailUrl: comparison.thumbnailUrl,
        duration: comparison.duration,
        fps: comparison.fps,
        totalFrames: comparison.totalFrames,
      };

      return result;
    } catch (error) {
      console.error(
        '❌ [ShareService] Error getting shared comparison video:',
        error
      );
      throw error;
    }
  }

  /**
   * Create video data for comparison sharing (allows private videos)
   */
  private static createVideoForComparison(
    videoResult: any,
    fallbackTitle: string
  ): SharedVideoWithCommentPermissions | null {
    const { data: video, error } = videoResult;

    if (error || !video) {
      return {
        id: 'placeholder',
        title: `${fallbackTitle} (Unavailable)`,
        description: 'This video is no longer available or has been deleted',
        url: '',
        filePath: '',
        videoType: 'placeholder',
        isPublic: false,
        canComment: false,
        annotations: [],
      };
    }

    // For comparison sharing, allow both public and private videos
    // The comparison itself being public is sufficient for access control
    return {
      id: video.id,
      title: video.title,
      description: video.description,
      url: video.url,
      filePath: video.filePath,
      videoType: video.videoType,
      isPublic: video.isPublic,
      canComment: false, // Comments are handled at comparison level
      annotations: [], // Will be loaded separately if needed
    };
  }

  /**
   * Create placeholder for missing/private videos (legacy method)
   */
  private static createVideoPlaceholderIfNeeded(
    videoResult: any,
    fallbackTitle: string
  ): SharedVideoWithCommentPermissions | null {
    const { data: video, error } = videoResult;

    if (error || !video) {
      return {
        id: 'placeholder',
        title: `${fallbackTitle} (Unavailable)`,
        description:
          'This video is no longer available or has been made private',
        url: '',
        filePath: '',
        videoType: 'placeholder',
        isPublic: false,
        canComment: false,
        annotations: [],
      };
    }

    // Check if video is public for shared access
    if (!video.isPublic) {
      return {
        id: 'placeholder',
        title: `${video.title} (Private)`,
        description:
          'This video has been made private and is no longer accessible',
        url: '',
        filePath: '',
        videoType: 'placeholder',
        isPublic: false,
        canComment: false,
        annotations: [],
      };
    }

    // Return full video data with comment permissions
    return {
      id: video.id,
      title: video.title,
      description: video.description,
      url: video.url,
      filePath: video.filePath,
      videoType: video.videoType,
      isPublic: video.isPublic,
      canComment: this.canCommentOnSharedVideo(video),
      annotations: [], // Will be loaded separately if needed
    };
  }

  /**
   * Make comparison video private
   */
  static async makeComparisonVideoPrivate(comparisonId: string): Promise<void> {
    try {
      await supabase
        .from('comparison_videos')
        .update({ isPublic: false })
        .eq('id', comparisonId);
    } catch (error) {
      console.error(
        '❌ [ShareService] Error making comparison video private:',
        error
      );
      throw error;
    }
  }

  // ===== COMMENT PERMISSION METHODS =====

  /**
   * Check if commenting is allowed on a shared video
   * Note: Commenting on annotations requires the allowAnnotations flag to be true
   */
  static canCommentOnSharedVideo(video: any): boolean {
    try {
      // Video must be public AND have annotations allowed
      // When allowAnnotations is true, only authenticated users can access and comment
      // When allowAnnotations is false, anonymous viewing is allowed but no commenting
      return video.isPublic === true && video.allowAnnotations === true;
    } catch (error) {
      console.error(
        '❌ [ShareService] Error checking comment permissions:',
        error
      );
      return false;
    }
  }

  /**
   * Get comment permission context for a shared video
   */
  static async getCommentPermissionContext(
    videoId: string,
    sessionId?: string
  ): Promise<CommentPermissionContext> {
    try {
      // Get the video to check if it's public and annotation permissions
      const { data: videos, error: videoError } = await supabase
        .from('videos')
        .select('id, isPublic, allowAnnotations')
        .eq('id', videoId)
        .eq('isPublic', true);

      if (videoError) {
        return {
          canComment: false,
          isAnonymous: false,
          reason: 'Database error checking video',
        };
      }

      const video = videos && videos.length > 0 ? videos[0] : null;
      if (!video) {
        return {
          canComment: false,
          isAnonymous: false,
          reason: 'Video not found or not public',
        };
      }

      const canComment = this.canCommentOnSharedVideo(video);
      // For shared public videos with allowAnnotations, users need authentication
      // Anonymous commenting is not allowed when allowAnnotations is true
      const isAnonymous = sessionId ? true : false;

      return {
        canComment,
        isAnonymous,
        ...(sessionId && { sessionId }),
      };
    } catch (error) {
      console.error(
        '❌ [ShareService] Error getting comment permission context:',
        error
      );
      return {
        canComment: false,
        isAnonymous: false,
        reason: 'Error checking permissions',
      };
    }
  }

  /**
   * Create an anonymous session for shared video commenting
   */
  static async createAnonymousSessionForSharedVideo(
    videoId: string,
    displayName: string
  ): Promise<AnonymousSession> {
    try {
      // Enhanced validation
      const validation = await this.validateAnonymousSessionCreation(
        videoId,
        displayName
      );
      if (!validation.valid) {
        throw new Error(validation.reason || 'Validation failed');
      }

      // Create the anonymous session using the comment service
      const session = await CommentService.createAnonymousSession({
        displayName: displayName.trim(),
        videoId: videoId,
      });

      return session;
    } catch (error) {
      console.error(
        '❌ [ShareService] Error creating anonymous session for shared video:',
        error
      );
      throw error;
    }
  }

  /**
   * Validate shared video access for commenting
   */
  static async validateSharedVideoAccess(videoId: string): Promise<boolean> {
    try {
      // Validate video ID format
      if (!videoId || typeof videoId !== 'string') {
        console.error('❌ [ShareService] Invalid video ID format:', videoId);
        return false;
      }

      const { data: videos, error } = await supabase
        .from('videos')
        .select('id, isPublic')
        .eq('id', videoId)
        .eq('isPublic', true);

      if (error) {
        console.error(
          '❌ [ShareService] Database error validating video access:',
          error
        );
        return false;
      }

      const video = videos && videos.length > 0 ? videos[0] : null;
      const isValid = !!video;
      return isValid;
    } catch (error) {
      console.error(
        '❌ [ShareService] Error validating shared video access:',
        error
      );
      return false;
    }
  }

  /**
   * Enhanced validation for anonymous session creation
   */
  static async validateAnonymousSessionCreation(
    videoId: string,
    displayName: string
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Validate inputs
      if (!videoId || typeof videoId !== 'string') {
        return { valid: false, reason: 'Invalid video ID' };
      }

      if (
        !displayName ||
        typeof displayName !== 'string' ||
        displayName.trim().length === 0
      ) {
        return { valid: false, reason: 'Display name is required' };
      }

      if (displayName.trim().length > 50) {
        return {
          valid: false,
          reason: 'Display name must be 50 characters or less',
        };
      }

      // Validate video access
      const hasAccess = await this.validateSharedVideoAccess(videoId);
      if (!hasAccess) {
        return { valid: false, reason: 'Video not found or not accessible' };
      }

      // Check comment permissions
      const permissionContext = await this.getCommentPermissionContext(videoId);
      if (!permissionContext.canComment) {
        return {
          valid: false,
          reason:
            permissionContext.reason || 'Commenting not allowed on this video',
        };
      }

      return { valid: true };
    } catch (error) {
      console.error(
        '❌ [ShareService] Error validating anonymous session creation:',
        error
      );
      return { valid: false, reason: 'Validation error occurred' };
    }
  }

  /**
   * Get comment permission context for comparison videos
   */
  static async getComparisonCommentPermissionContext(
    comparisonId: string,
    sessionId?: string
  ): Promise<CommentPermissionContext> {
    try {
      // Get the comparison video to check if it's public and annotation permissions
      const { data: comparisons, error } = await supabase
        .from('comparison_videos')
        .select('id, isPublic, allowAnnotations')
        .eq('id', comparisonId)
        .eq('isPublic', true);

      if (error) {
        return {
          canComment: false,
          isAnonymous: false,
          reason: 'Database error checking comparison video',
        };
      }

      const comparison =
        comparisons && comparisons.length > 0 ? comparisons[0] : null;
      if (!comparison) {
        return {
          canComment: false,
          isAnonymous: false,
          reason: 'Comparison video not found or not public',
        };
      }

      // Check if comparison allows annotations (must be public AND allow annotations)
      const canComment = comparison.isPublic && comparison.allowAnnotations;
      // For shared public comparison videos with allowAnnotations, users need authentication
      // Anonymous commenting is not allowed when allowAnnotations is true
      const isAnonymous = sessionId ? true : false;

      return {
        canComment,
        isAnonymous,
        ...(sessionId && { sessionId }),
      };
    } catch (error) {
      console.error(
        '❌ [ShareService] Error getting comparison comment permissions:',
        error
      );
      return {
        canComment: false,
        isAnonymous: false,
        reason: 'Error checking permissions',
      };
    }
  }

  /**
   * Create an anonymous session for shared comparison video commenting
   */
  static async createAnonymousSessionForSharedComparison(
    comparisonId: string,
    displayName: string
  ): Promise<AnonymousSession> {
    try {
      // Enhanced validation
      const validation =
        await this.validateAnonymousSessionCreationForComparison(
          comparisonId,
          displayName
        );
      if (!validation.valid) {
        throw new Error(validation.reason || 'Validation failed');
      }

      // Create the anonymous session using the comment service
      const session = await CommentService.createAnonymousSession({
        displayName: displayName.trim(),
        comparisonVideoId: comparisonId,
      });

      return session;
    } catch (error) {
      console.error(
        '❌ [ShareService] Error creating anonymous session for shared comparison:',
        error
      );
      throw error;
    }
  }

  /**
   * Validate shared comparison video access for commenting
   */
  static async validateSharedComparisonAccess(
    comparisonId: string
  ): Promise<boolean> {
    try {
      // Validate comparison ID format
      if (!comparisonId || typeof comparisonId !== 'string') {
        console.error(
          '❌ [ShareService] Invalid comparison ID format:',
          comparisonId
        );
        return false;
      }

      const { data: comparisons, error } = await supabase
        .from('comparison_videos')
        .select('id, isPublic, allowAnnotations')
        .eq('id', comparisonId)
        .eq('isPublic', true);

      if (error) {
        console.error(
          '❌ [ShareService] Database error validating comparison access:',
          error
        );
        return false;
      }

      const comparison =
        comparisons && comparisons.length > 0 ? comparisons[0] : null;
      const isValid = !!comparison;
      return isValid;
    } catch (error) {
      console.error(
        '❌ [ShareService] Error validating shared comparison access:',
        error
      );
      return false;
    }
  }

  /**
   * Enhanced validation for anonymous session creation for comparisons
   */
  static async validateAnonymousSessionCreationForComparison(
    comparisonId: string,
    displayName: string
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Validate inputs
      if (!comparisonId || typeof comparisonId !== 'string') {
        return { valid: false, reason: 'Invalid comparison ID' };
      }

      if (
        !displayName ||
        typeof displayName !== 'string' ||
        displayName.trim().length === 0
      ) {
        return { valid: false, reason: 'Display name is required' };
      }

      if (displayName.trim().length > 50) {
        return {
          valid: false,
          reason: 'Display name must be 50 characters or less',
        };
      }

      // Validate comparison access
      const hasAccess = await this.validateSharedComparisonAccess(comparisonId);
      if (!hasAccess) {
        return {
          valid: false,
          reason: 'Comparison not found or not accessible',
        };
      }

      // Check comment permissions
      const permissionContext =
        await this.getComparisonCommentPermissionContext(comparisonId);
      if (!permissionContext.canComment) {
        return {
          valid: false,
          reason:
            permissionContext.reason ||
            'Commenting not allowed on this comparison',
        };
      }

      return { valid: true };
    } catch (error) {
      console.error(
        '❌ [ShareService] Error validating anonymous session creation for comparison:',
        error
      );
      return { valid: false, reason: 'Validation error occurred' };
    }
  }
}
