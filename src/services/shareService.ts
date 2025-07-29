import { supabase } from '../composables/useSupabase';
import { CommentService } from './commentService';
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
  static async createShareableLink(videoId: string): Promise<string> {
    try {
      // First, make the video public
      console.log(
        '✅ [DEBUG] ShareService - Using camelCase column: isPublic (not is_public)'
      );
      await supabase
        .from('videos')
        .update({ isPublic: true })
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
      console.log(
        '🔍 [ShareService] Loading shared video with comment permissions:',
        videoId
      );

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
      console.log('📹 [ShareService] Found video:', video);

      if (!video) {
        throw new Error('Video not found or not public');
      }

      // Get the annotations for this video
      const { data: annotations, error: annotationsError } = await supabase
        .from('annotations')
        .select('*')
        .eq('videoId', videoId)
        .order('timestamp', { ascending: true });

      if (annotationsError) {
        console.error(
          '❌ [ShareService] Error loading annotations:',
          annotationsError
        );
        throw annotationsError;
      }

      console.log('📝 [ShareService] Raw annotations from DB:', annotations);
      console.log(
        '📝 [ShareService] Annotations count:',
        annotations?.length || 0
      );

      // Database columns are already in camelCase, no mapping needed
      const mappedAnnotations = annotations || [];

      console.log('📝 [ShareService] Mapped annotations:', mappedAnnotations);
      console.log(
        '📝 [ShareService] Drawing annotations:',
        mappedAnnotations.filter((ann) => ann.annotationType === 'drawing')
      );

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

      console.log('✅ [ShareService] Returning shared video data:', result);
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
    comparisonId: string
  ): Promise<string> {
    try {
      // Make the comparison video public
      await supabase
        .from('comparison_videos')
        .update({ isPublic: true })
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
      console.log(
        '🔍 [ShareService] Loading shared comparison video with comment permissions:',
        comparisonId
      );

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
      console.log('📹 [ShareService] Found comparison:', comparison);

      if (!comparison) {
        throw new Error('Comparison video not found or not public');
      }

      // Get both videos (may be public or private)
      const [videoAResult, videoBResult] = await Promise.all([
        supabase.from('videos').select('*').eq('id', comparison.videoAId),
        supabase.from('videos').select('*').eq('id', comparison.videoBId),
      ]);

      console.log('📹 [ShareService] Video A result:', videoAResult);
      console.log('📹 [ShareService] Video B result:', videoBResult);

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

      console.log('📹 [ShareService] Processed Video A:', videoA);
      console.log('📹 [ShareService] Processed Video B:', videoB);

      // Get all annotations for the comparison context (comparison-specific + individual video annotations)
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

      console.log('📝 [ShareService] Querying annotations with IDs:', {
        comparisonId,
        videoAId: comparison.videoAId,
        videoBId: comparison.videoBId,
      });

      console.log(
        '📝 [ShareService] Comparison annotations result:',
        comparisonAnnotationsResult
      );
      console.log(
        '📝 [ShareService] Video A annotations result:',
        videoAAnnotationsResult
      );
      console.log(
        '📝 [ShareService] Video B annotations result:',
        videoBAnnotationsResult
      );

      console.log(
        '📝 [ShareService] Comparison annotations:',
        comparisonAnnotationsResult.data
      );
      console.log(
        '📝 [ShareService] Video A annotations:',
        videoAAnnotationsResult.data
      );
      console.log(
        '📝 [ShareService] Video B annotations:',
        videoBAnnotationsResult.data
      );

      console.log(
        '📝 [ShareService] Comparison annotations error:',
        comparisonAnnotationsResult.error
      );
      console.log(
        '📝 [ShareService] Video A annotations error:',
        videoAAnnotationsResult.error
      );
      console.log(
        '📝 [ShareService] Video B annotations error:',
        videoBAnnotationsResult.error
      );

      // Combine all annotations
      const allAnnotations = [
        ...(comparisonAnnotationsResult.data || []),
        ...(videoAAnnotationsResult.data || []),
        ...(videoBAnnotationsResult.data || []),
      ];

      console.log(
        '📝 [ShareService] All combined annotations:',
        allAnnotations
      );
      console.log(
        '📝 [ShareService] Total annotations count:',
        allAnnotations.length
      );

      // Database columns are already in camelCase, no mapping needed
      const mappedAnnotations = allAnnotations || [];

      console.log(
        '📝 [ShareService] Drawing annotations:',
        mappedAnnotations.filter((ann) => ann.annotationType === 'drawing')
      );

      // Comment permissions for comparison videos
      const canComment = comparison.isPublic;

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

      console.log(
        '✅ [ShareService] Returning shared comparison data:',
        result
      );
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
   */
  static canCommentOnSharedVideo(video: any): boolean {
    try {
      // For now, all public shared videos allow commenting
      // This can be extended to check specific video settings or user permissions
      return video.isPublic === true;
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
      console.log('🔍 [ShareService] Getting comment permission context:', {
        videoId,
        sessionId,
      });

      // Get the video to check if it's public
      const { data: videos, error: videoError } = await supabase
        .from('videos')
        .select('id, isPublic')
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
      // For shared public videos, anonymous users can comment even without a session yet
      // They will create a session when they actually post a comment
      const isAnonymous = sessionId ? true : false;

      return {
        canComment,
        isAnonymous,
        sessionId,
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
      console.log(
        '🔍 [ShareService] Creating anonymous session for shared video:',
        { videoId, displayName }
      );

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

      console.log(
        '✅ [ShareService] Successfully created anonymous session for shared video'
      );
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
      console.log('🔍 [ShareService] Video access validation result:', {
        videoId,
        isValid,
      });
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
      // Get the comparison video to check if it's public
      const { data: comparisons, error } = await supabase
        .from('comparison_videos')
        .select('id, isPublic')
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

      const canComment = comparison.isPublic;
      // For shared public comparison videos, anonymous users can comment even without a session yet
      // They will create a session when they actually post a comment
      const isAnonymous = sessionId ? true : false;

      return {
        canComment,
        isAnonymous,
        sessionId,
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
      console.log(
        '🔍 [ShareService] Creating anonymous session for shared comparison:',
        { comparisonId, displayName }
      );

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

      console.log(
        '✅ [ShareService] Successfully created anonymous session for shared comparison'
      );
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
        .select('id, isPublic')
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
      console.log('🔍 [ShareService] Comparison access validation result:', {
        comparisonId,
        isValid,
      });
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
