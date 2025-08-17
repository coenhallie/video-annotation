import { supabase } from '../composables/useSupabase';
import type {
  Comment,
  CommentInsert,
  CommentUpdate,
  AnonymousSession,
  AnonymousSessionInsert,
} from '../types/database';

export interface CreateCommentParams {
  annotationId: string;
  content: string;
  userId?: string;
  sessionId?: string;
  userDisplayName?: string;
  isAnonymous?: boolean;
}

export interface UpdateCommentParams {
  content: string;
}

export interface CreateAnonymousSessionParams {
  displayName: string;
  videoId?: string;
  comparisonVideoId?: string;
}

export interface CommentPermissions {
  canComment: boolean;
  canModerate: boolean;
  reason?: string;
}

export class CommentService {
  // ===== CORE CRUD OPERATIONS =====

  /**
   * Create a new comment (authenticated or anonymous)
   */
  static async createComment(params: CreateCommentParams): Promise<Comment> {
    try {
      // Validate required parameters
      if (!params.annotationId || !params.content) {
        throw new Error('annotationId and content are required');
      }

      // Validate content length
      if (!this.validateCommentContent(params.content)) {
        throw new Error(
          'Comment content must be between 1 and 2000 characters'
        );
      }

      // Determine if this is an anonymous comment
      const isAnonymous = Boolean(
        params.isAnonymous || (!params.userId && params.sessionId)
      );

      // Validate user identification
      if (!params.userId && !params.sessionId) {
        throw new Error('Either userId or sessionId must be provided');
      }

      if (isAnonymous && !params.userDisplayName) {
        throw new Error('userDisplayName is required for anonymous comments');
      }

      // Set session context for anonymous users
      if (params.sessionId) {
        await supabase.rpc('set_session_context', {
          sessionId: params.sessionId,
        });
      }

      const commentData: CommentInsert = {
        annotationId: params.annotationId,
        content: params.content,
        userId: params.userId || null,
        sessionId: params.sessionId || null,
        userDisplayName: params.userDisplayName || null,
        isAnonymous: isAnonymous,
      };

      const { data, error } = await supabase
        .from('annotation_comments')
        .insert(commentData)
        .select(
          `
          *,
          user:users(id, email, fullName, avatarUrl)
        `
        )
        .single();

      if (error) {
        console.error('❌ [CommentService] Failed to create comment:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ [CommentService] Error creating comment:', error);
      throw error;
    }
  }

  /**
   * Get all comments for a specific annotation
   */
  static async getAnnotationComments(annotationId: string): Promise<Comment[]> {
    try {
      const { data, error } = await supabase
        .from('annotation_comments')
        .select(
          `
          *,
          user:users(id, email, fullName, avatarUrl)
        `
        )
        .eq('annotationId', annotationId)
        .order('createdAt', { ascending: true });

      if (error) {
        console.error('❌ [CommentService] Error getting comments:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error(
        '❌ [CommentService] Error getting annotation comments:',
        error
      );
      throw error;
    }
  }

  /**
   * Update an existing comment (user can only update their own)
   */
  static async updateComment(
    commentId: string,
    params: UpdateCommentParams,
    sessionId?: string
  ): Promise<Comment> {
    try {
      // Validate content
      if (!this.validateCommentContent(params.content)) {
        throw new Error(
          'Comment content must be between 1 and 2000 characters'
        );
      }

      // For anonymous users, use the special database function
      if (sessionId) {
        const { data, error } = await supabase.rpc(
          'update_comment_with_session',
          {
            commentId: commentId,
            newContent: params.content,
            userSessionId: sessionId,
          }
        );

        if (error) {
          console.error('❌ [CommentService] Error updating comment:', error);
          throw error;
        }

        if (!data || data.length === 0) {
          throw new Error('Comment not found or permission denied');
        }

        // Get the updated comment with user data
        const { data: commentWithUser, error: fetchError } = await supabase
          .from('annotation_comments')
          .select(
            `
            *,
            user:users(id, email, fullName, avatarUrl)
          `
          )
          .eq('id', commentId)
          .single();

        if (fetchError) {
          console.error(
            '❌ [CommentService] Error fetching updated comment:',
            fetchError
          );
          throw fetchError;
        }

        return commentWithUser;
      } else {
        // For authenticated users, use regular update
        const updates: CommentUpdate = {
          content: params.content,
        };

        const { data, error } = await supabase
          .from('annotation_comments')
          .update(updates)
          .eq('id', commentId)
          .select(
            `
            *,
            user:users(id, email, fullName, avatarUrl)
          `
          )
          .single();

        if (error) {
          console.error('❌ [CommentService] Error updating comment:', error);
          throw error;
        }

        return data;
      }
    } catch (error) {
      console.error('❌ [CommentService] Error updating comment:', error);
      throw error;
    }
  }

  /**
   * Delete a comment (soft delete with deleted_at timestamp)
   * Note: The current schema doesn't have deleted_at, so this performs hard delete
   * Users can delete their own comments, annotation owners can moderate
   */
  static async deleteComment(
    commentId: string,
    sessionId?: string
  ): Promise<void> {
    try {
      // Set session context for anonymous users
      if (sessionId) {
        await supabase.rpc('set_session_context', { sessionId: sessionId });
      }

      const { error } = await supabase
        .from('annotation_comments')
        .delete()
        .eq('id', commentId);

      if (error) {
        console.error('❌ [CommentService] Error deleting comment:', error);
        throw error;
      }
    } catch (error) {
      console.error('❌ [CommentService] Error deleting comment:', error);
      throw error;
    }
  }

  // ===== ANONYMOUS USER MANAGEMENT =====

  /**
   * Create a new anonymous session
   */
  static async createAnonymousSession(
    params: CreateAnonymousSessionParams
  ): Promise<AnonymousSession> {
    try {
      if (!params.displayName) {
        throw new Error('displayName is required');
      }

      if (!params.videoId && !params.comparisonVideoId) {
        throw new Error('Either videoId or comparisonVideoId is required');
      }

      // Generate a unique session ID
      const sessionId = `anon_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const sessionData: AnonymousSessionInsert = {
        sessionId: sessionId,
        displayName: params.displayName,
        videoId: params.videoId || null,
        comparisonVideoId: params.comparisonVideoId || null,
      };

      const { data, error } = await supabase
        .from('anonymous_sessions')
        .insert(sessionData)
        .select()
        .single();

      if (error) {
        console.error(
          '❌ [CommentService] Error creating anonymous session:',
          error
        );
        throw error;
      }

      return data;
    } catch (error) {
      console.error(
        '❌ [CommentService] Error creating anonymous session:',
        error
      );
      throw error;
    }
  }

  /**
   * Get an existing anonymous session
   */
  static async getAnonymousSession(
    sessionId: string
  ): Promise<AnonymousSession | null> {
    try {
      const { data, error } = await supabase
        .from('anonymous_sessions')
        .select('*')
        .eq('sessionId', sessionId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        console.error(
          '❌ [CommentService] Error getting anonymous session:',
          error
        );
        throw error;
      }

      return data;
    } catch (error) {
      console.error(
        '❌ [CommentService] Error getting anonymous session:',
        error
      );
      throw error;
    }
  }

  /**
   * Update anonymous session activity (last_active timestamp)
   */
  static async updateAnonymousSessionActivity(
    sessionId: string
  ): Promise<void> {
    try {
      // Set session context
      await supabase.rpc('set_session_context', { sessionId: sessionId });

      const { error } = await supabase
        .from('anonymous_sessions')
        .update({ lastActive: new Date().toISOString() })
        .eq('sessionId', sessionId);

      if (error) {
        console.error(
          '❌ [CommentService] Error updating session activity:',
          error
        );
        throw error;
      }
    } catch (error) {
      console.error(
        '❌ [CommentService] Error updating session activity:',
        error
      );
      throw error;
    }
  }

  // ===== PERMISSION AND MODERATION =====

  /**
   * Check if user can comment on annotation
   */
  static async canUserCommentOnAnnotation(
    annotationId: string,
    userId?: string
  ): Promise<CommentPermissions> {
    try {
      // First, get the annotation to determine if it's individual or comparison
      const { data: annotation, error: annotationError } = await supabase
        .from('annotations')
        .select('id, userId, videoId, comparisonVideoId')
        .eq('id', annotationId)
        .single();

      if (annotationError) {
        console.error(
          '❌ [CommentService] Error getting annotation:',
          annotationError
        );
        return {
          canComment: false,
          canModerate: false,
          reason: 'Annotation not found',
        };
      }

      let videoData: { isPublic: boolean; ownerId: string } | null = null;

      // Check if it's a comparison annotation
      if (annotation.comparisonVideoId) {
        const { data: comparisonVideo, error: comparisonError } = await supabase
          .from('comparison_videos')
          .select('isPublic, userId')
          .eq('id', annotation.comparisonVideoId)
          .single();

        if (comparisonError) {
          console.error(
            '❌ [CommentService] Error getting comparison video:',
            comparisonError
          );
          return {
            canComment: false,
            canModerate: false,
            reason: 'Comparison video not found',
          };
        }

        videoData = {
          isPublic: comparisonVideo.isPublic,
          ownerId: comparisonVideo.userId,
        };
      } else if (annotation.videoId) {
        const { data: video, error: videoError } = await supabase
          .from('videos')
          .select('isPublic, ownerId')
          .eq('id', annotation.videoId)
          .single();

        if (videoError) {
          console.error('❌ [CommentService] Error getting video:', videoError);
          return {
            canComment: false,
            canModerate: false,
            reason: 'Video not found',
          };
        }

        videoData = {
          isPublic: video.isPublic,
          ownerId: video.ownerId,
        };
      } else {
        console.error(
          '❌ [CommentService] Annotation has neither videoId nor comparisonVideoId'
        );
        return {
          canComment: false,
          canModerate: false,
          reason: 'Invalid annotation: no associated video',
        };
      }

      if (!videoData) {
        return {
          canComment: false,
          canModerate: false,
          reason: 'Video data not found',
        };
      }

      // Check if user can comment
      // For public videos/comparisons, anyone can comment (including anonymous users)
      // For private videos/comparisons, only owners and annotation owners can comment
      const canComment =
        videoData.isPublic || // Public video/comparison - allows anyone including anonymous users
        (userId && videoData.ownerId === userId) || // Video/comparison owner
        (userId && annotation.userId === userId); // Annotation owner

      // Check if user can moderate (annotation owner)
      const canModerate = userId && annotation.userId === userId;

      return {
        canComment: canComment === true,
        canModerate: canModerate === true,
      };
    } catch (error) {
      console.error('❌ [CommentService] Error checking permissions:', error);
      return {
        canComment: false,
        canModerate: false,
        reason: 'Permission check failed',
      };
    }
  }

  /**
   * Check if user can moderate (delete) comments
   */
  static async canUserModerateComment(
    commentId: string,
    userId?: string,
    sessionId?: string
  ): Promise<boolean> {
    try {
      // Get the comment and its associated annotation
      const { data: comment, error: commentError } = await supabase
        .from('annotation_comments')
        .select(
          `
          id,
          userId,
          sessionId,
          annotationId,
          annotation:annotations(id, userId)
        `
        )
        .eq('id', commentId)
        .single();

      if (commentError) {
        console.error(
          '❌ [CommentService] Error getting comment:',
          commentError
        );
        return false;
      }

      // User can moderate if:
      // 1. They are the comment author (authenticated user)
      // 2. They are the comment author (anonymous user with matching session)
      // 3. They are the annotation owner
      const isCommentAuthor =
        (userId && comment.userId === userId) ||
        (sessionId && comment.sessionId === sessionId);

      const isAnnotationOwner =
        userId &&
        comment.annotation &&
        (comment.annotation as any).userId === userId;

      return Boolean(isCommentAuthor || isAnnotationOwner);
    } catch (error) {
      console.error('❌ [CommentService] Error checking moderation:', error);
      return false;
    }
  }

  /**
   * Moderate (delete) a comment with permission check
   */
  static async moderateComment(
    commentId: string,
    userId?: string,
    sessionId?: string
  ): Promise<void> {
    try {
      const canModerate = await this.canUserModerateComment(
        commentId,
        userId,
        sessionId
      );

      if (!canModerate) {
        throw new Error('Permission denied: cannot moderate this comment');
      }

      await this.deleteComment(commentId, sessionId);
    } catch (error) {
      console.error('❌ [CommentService] Error moderating comment:', error);
      throw error;
    }
  }

  // ===== COMMENT COUNTING =====

  /**
   * Get comment count for a specific annotation
   */
  static async getCommentCount(annotationId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('annotation_comments')
        .select('*', { count: 'exact', head: true })
        .eq('annotationId', annotationId);

      if (error) {
        console.error(
          '❌ [CommentService] Error getting comment count:',
          error
        );
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('❌ [CommentService] Error getting comment count:', error);
      return 0;
    }
  }

  /**
   * Get comment count for a project (video or comparison)
   */
  static async getProjectCommentCount(project: any): Promise<number> {
    try {
      let totalCount = 0;

      if (project.projectType === 'single') {
        // For single video projects, first get all annotation IDs for the video
        const { data: annotations, error: annotationsError } = await supabase
          .from('annotations')
          .select('id')
          .eq('videoId', project.video.id);

        if (annotationsError) {
          console.error(
            '❌ [CommentService] Error getting annotations:',
            annotationsError
          );
          return 0;
        }

        if (!annotations || annotations.length === 0) {
          return 0;
        }

        const annotationIds = annotations.map((a) => a.id);

        // Then get comment count for those annotations
        const { count, error } = await supabase
          .from('annotation_comments')
          .select('*', { count: 'exact', head: true })
          .in('annotationId', annotationIds);

        if (error) {
          console.error(
            '❌ [CommentService] Error getting single project comment count:',
            error
          );
          return 0;
        }

        totalCount = count || 0;
      } else if (project.projectType === 'dual') {
        // For dual video projects, get comments for annotations of the comparison video
        // and also annotations of the individual videos that make up the comparison
        const videoAId = project.videoA?.id;
        const videoBId = project.videoB?.id;
        const comparisonVideoId = project.comparisonVideo?.id;

        let allAnnotationIds: string[] = [];

        // Get annotations for the comparison video itself
        if (comparisonVideoId) {
          const { data: comparisonAnnotations, error: comparisonError } =
            await supabase
              .from('annotations')
              .select('id')
              .eq('comparisonVideoId', comparisonVideoId);

          if (comparisonError) {
            console.error(
              '❌ [CommentService] Error getting comparison annotations:',
              comparisonError
            );
          } else if (comparisonAnnotations) {
            allAnnotationIds.push(...comparisonAnnotations.map((a) => a.id));
          }
        }

        // Get annotations for both individual videos
        if (videoAId && videoBId) {
          const { data: videoAnnotations, error: videoError } = await supabase
            .from('annotations')
            .select('id')
            .in('videoId', [videoAId, videoBId]);

          if (videoError) {
            console.error(
              '❌ [CommentService] Error getting video annotations:',
              videoError
            );
          } else if (videoAnnotations) {
            allAnnotationIds.push(...videoAnnotations.map((a) => a.id));
          }
        }

        if (allAnnotationIds.length === 0) {
          return 0;
        }

        // Then get comment count for all those annotations
        const { count, error } = await supabase
          .from('annotation_comments')
          .select('*', { count: 'exact', head: true })
          .in('annotationId', allAnnotationIds);

        if (error) {
          console.error(
            '❌ [CommentService] Error getting dual project comment count:',
            error
          );
          return 0;
        }

        totalCount = count || 0;
      }

      return totalCount;
    } catch (error) {
      console.error(
        '❌ [CommentService] Error getting project comment count:',
        error
      );
      return 0;
    }
  }

  /**
   * Get comment counts for multiple projects
   */
  static async getCommentCountsForProjects(
    projectIds: string[]
  ): Promise<Record<string, number>> {
    if (projectIds.length === 0) {
      return {};
    }

    try {
      const counts: Record<string, number> = {};

      // For each project ID, count comments by getting all annotations for that video
      // and then counting comments for those annotations
      for (const projectId of projectIds) {
        try {
          // Get all annotation IDs for this video (project)
          const { data: annotations, error: annotationsError } = await supabase
            .from('annotations')
            .select('id')
            .eq('videoId', projectId);

          if (annotationsError) {
            console.error(
              `❌ [CommentService] Error getting annotations for project ${projectId}:`,
              annotationsError
            );
            counts[projectId] = 0;
            continue;
          }

          if (!annotations || annotations.length === 0) {
            counts[projectId] = 0;
            continue;
          }

          const annotationIds = annotations.map((a) => a.id);

          // Count comments for these annotations
          const { count, error: countError } = await supabase
            .from('annotation_comments')
            .select('*', { count: 'exact', head: true })
            .in('annotationId', annotationIds);

          if (countError) {
            console.error(
              `❌ [CommentService] Error counting comments for project ${projectId}:`,
              countError
            );
            counts[projectId] = 0;
          } else {
            counts[projectId] = count || 0;
          }
        } catch (projectError) {
          console.error(
            `❌ [CommentService] Error processing project ${projectId}:`,
            projectError
          );
          counts[projectId] = 0;
        }
      }

      return counts;
    } catch (error) {
      console.error(
        '❌ [CommentService] Error fetching comment counts:',
        error
      );
      return {};
    }
  }

  /**
   * Validate comment content
   */
  static validateCommentContent(content: string): boolean {
    if (!content || typeof content !== 'string') {
      return false;
    }

    const trimmedContent = content.trim();
    return trimmedContent.length > 0 && trimmedContent.length <= 2000;
  }

  // ===== CLEANUP AND MAINTENANCE =====

  /**
   * Cleanup old anonymous sessions (called periodically)
   */
  static async cleanupOldAnonymousSessions(): Promise<void> {
    try {
      const { error } = await supabase.rpc('cleanup_old_anonymous_sessions');

      if (error) {
        console.error('❌ [CommentService] Error cleaning up sessions:', error);
        throw error;
      }
    } catch (error) {
      console.error('❌ [CommentService] Error cleaning up sessions:', error);
      throw error;
    }
  }

  // ===== BULK OPERATIONS =====

  /**
   * Get comments for multiple annotations at once
   */
  static async getCommentsForAnnotations(
    annotationIds: string[]
  ): Promise<Record<string, Comment[]>> {
    try {
      if (annotationIds.length === 0) {
        return {};
      }

      const { data, error } = await supabase
        .from('annotation_comments')
        .select(
          `
          *,
          user:users(id, email, fullName, avatarUrl)
        `
        )
        .in('annotationId', annotationIds)
        .order('createdAt', { ascending: true });

      if (error) {
        console.error('❌ [CommentService] Error getting comments:', error);
        throw error;
      }

      // Group comments by annotation ID
      const commentsByAnnotation: Record<string, Comment[]> = {};
      data?.forEach((comment) => {
        if (!commentsByAnnotation[comment.annotationId]) {
          commentsByAnnotation[comment.annotationId] = [];
        }
        commentsByAnnotation[comment.annotationId]?.push(comment);
      });

      return commentsByAnnotation;
    } catch (error) {
      console.error(
        '❌ [CommentService] Error getting comments for annotations:',
        error
      );
      throw error;
    }
  }

  /**
   * Delete all comments for an annotation (used when deleting annotation)
   */
  static async deleteAnnotationComments(annotationId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('annotation_comments')
        .delete()
        .eq('annotationId', annotationId);

      if (error) {
        console.error(
          '❌ [CommentService] Error deleting annotation comments:',
          error
        );
        throw error;
      }
    } catch (error) {
      console.error(
        '❌ [CommentService] Error deleting annotation comments:',
        error
      );
      throw error;
    }
  }

  // ===== REALTIME HELPERS =====

  /**
   * Validate permissions for realtime operations
   */
  static async validateRealtimePermissions(
    annotationId: string,
    userId?: string
  ): Promise<boolean> {
    try {
      const permissions = await this.canUserCommentOnAnnotation(
        annotationId,
        userId
      );
      return permissions.canComment;
    } catch (error) {
      console.error(
        '❌ [CommentService] Error validating realtime permissions:',
        error
      );
      return false;
    }
  }

  /**
   * Create comment with realtime broadcast
   */
  static async createCommentWithRealtime(
    params: CreateCommentParams
  ): Promise<Comment> {
    try {
      const comment = await this.createComment(params);
      // Realtime broadcasting is handled by database triggers
      return comment;
    } catch (error) {
      console.error(
        '❌ [CommentService] Error creating comment with realtime:',
        error
      );
      throw error;
    }
  }

  /**
   * Update comment with realtime broadcast
   */
  static async updateCommentWithRealtime(
    commentId: string,
    params: UpdateCommentParams,
    sessionId?: string
  ): Promise<Comment> {
    try {
      const comment = await this.updateComment(commentId, params, sessionId);
      // Realtime broadcasting is handled by database triggers
      return comment;
    } catch (error) {
      console.error(
        '❌ [CommentService] Error updating comment with realtime:',
        error
      );
      throw error;
    }
  }

  /**
   * Delete comment with realtime broadcast
   */
  static async deleteCommentWithRealtime(
    commentId: string,
    sessionId?: string
  ): Promise<void> {
    try {
      await this.deleteComment(commentId, sessionId);
      // Realtime broadcasting is handled by database triggers
    } catch (error) {
      console.error(
        '❌ [CommentService] Error deleting comment with realtime:',
        error
      );
      throw error;
    }
  }
}
