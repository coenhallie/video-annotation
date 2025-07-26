import { supabase } from '../composables/useSupabase';
import type {
  Comment,
  CommentInsert,
  CommentUpdate,
  AnonymousSession,
  AnonymousSessionInsert,
  AnonymousSessionUpdate,
} from '../types/database';
import {
  transformDatabaseCommentToApp,
  transformAppCommentToDatabase,
  transformDatabaseAnonymousSessionToApp,
} from '../types/database';

export interface CreateCommentParams {
  annotation_id: string;
  content: string;
  user_id?: string;
  session_id?: string;
  user_display_name?: string;
  is_anonymous?: boolean;
}

export interface UpdateCommentParams {
  content: string;
}

export interface CreateAnonymousSessionParams {
  display_name: string;
  video_id?: string;
  comparison_video_id?: string;
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
    console.log('🔍 [CommentService] Creating comment:', params);

    try {
      // Validate required parameters
      if (!params.annotation_id || !params.content) {
        throw new Error('annotation_id and content are required');
      }

      // Validate content length
      if (!this.validateCommentContent(params.content)) {
        throw new Error(
          'Comment content must be between 1 and 2000 characters'
        );
      }

      // Determine if this is an anonymous comment
      const isAnonymous = Boolean(
        params.is_anonymous || (!params.user_id && params.session_id)
      );

      // Validate user identification
      if (!params.user_id && !params.session_id) {
        throw new Error('Either user_id or session_id must be provided');
      }

      if (isAnonymous && !params.user_display_name) {
        throw new Error('user_display_name is required for anonymous comments');
      }

      // Set session context for anonymous users
      if (params.session_id) {
        await supabase.rpc('set_session_context', {
          session_id: params.session_id,
        });
      }

      const commentData: CommentInsert = {
        annotation_id: params.annotation_id,
        content: params.content,
        user_id: params.user_id || null,
        session_id: params.session_id || null,
        user_display_name: params.user_display_name || null,
        is_anonymous: isAnonymous,
      };

      const { data, error } = await supabase
        .from('annotation_comments')
        .insert(commentData)
        .select(
          `
          *,
          user:users(id, email, full_name, avatar_url)
        `
        )
        .single();

      if (error) {
        console.error('❌ [CommentService] Failed to create comment:', error);
        throw error;
      }

      console.log('✅ [CommentService] Successfully created comment:', data);
      return transformDatabaseCommentToApp(data);
    } catch (error) {
      console.error('❌ [CommentService] Error creating comment:', error);
      throw error;
    }
  }

  /**
   * Get all comments for a specific annotation
   */
  static async getAnnotationComments(annotationId: string): Promise<Comment[]> {
    console.log(
      '🔍 [CommentService] Getting comments for annotation:',
      annotationId
    );

    try {
      const { data, error } = await supabase
        .from('annotation_comments')
        .select(
          `
          *,
          user:users(id, email, full_name, avatar_url)
        `
        )
        .eq('annotation_id', annotationId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ [CommentService] Error getting comments:', error);
        throw error;
      }

      console.log('✅ [CommentService] Retrieved comments:', data?.length || 0);
      return data?.map(transformDatabaseCommentToApp) || [];
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
    console.log('🔍 [CommentService] Updating comment:', { commentId, params });

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
            comment_id: commentId,
            new_content: params.content,
            user_session_id: sessionId,
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
            user:users(id, email, full_name, avatar_url)
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

        console.log(
          '✅ [CommentService] Successfully updated comment:',
          commentWithUser
        );
        return transformDatabaseCommentToApp(commentWithUser);
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
            user:users(id, email, full_name, avatar_url)
          `
          )
          .single();

        if (error) {
          console.error('❌ [CommentService] Error updating comment:', error);
          throw error;
        }

        console.log('✅ [CommentService] Successfully updated comment:', data);
        return transformDatabaseCommentToApp(data);
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
    console.log('🔍 [CommentService] Deleting comment:', commentId);

    try {
      // Set session context for anonymous users
      if (sessionId) {
        await supabase.rpc('set_session_context', { session_id: sessionId });
      }

      const { error } = await supabase
        .from('annotation_comments')
        .delete()
        .eq('id', commentId);

      if (error) {
        console.error('❌ [CommentService] Error deleting comment:', error);
        throw error;
      }

      console.log('✅ [CommentService] Successfully deleted comment');
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
    console.log('🔍 [CommentService] Creating anonymous session:', params);

    try {
      if (!params.display_name) {
        throw new Error('display_name is required');
      }

      if (!params.video_id && !params.comparison_video_id) {
        throw new Error('Either video_id or comparison_video_id is required');
      }

      // Generate a unique session ID
      const sessionId = `anon_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const sessionData: AnonymousSessionInsert = {
        session_id: sessionId,
        display_name: params.display_name,
        video_id: params.video_id || null,
        comparison_video_id: params.comparison_video_id || null,
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

      console.log(
        '✅ [CommentService] Successfully created anonymous session:',
        data
      );
      return transformDatabaseAnonymousSessionToApp(data);
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
    console.log('🔍 [CommentService] Getting anonymous session:', sessionId);

    try {
      const { data, error } = await supabase
        .from('anonymous_sessions')
        .select('*')
        .eq('session_id', sessionId)
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

      console.log('✅ [CommentService] Retrieved anonymous session:', data);
      return transformDatabaseAnonymousSessionToApp(data);
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
    console.log('🔍 [CommentService] Updating session activity:', sessionId);

    try {
      // Set session context
      await supabase.rpc('set_session_context', { session_id: sessionId });

      const { error } = await supabase
        .from('anonymous_sessions')
        .update({ last_active: new Date().toISOString() })
        .eq('session_id', sessionId);

      if (error) {
        console.error(
          '❌ [CommentService] Error updating session activity:',
          error
        );
        throw error;
      }

      console.log('✅ [CommentService] Successfully updated session activity');
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
    console.log('🔍 [CommentService] Checking comment permissions:', {
      annotationId,
      userId,
    });

    try {
      // Get annotation and video details
      const { data: annotation, error } = await supabase
        .from('annotations')
        .select(
          `
          id,
          user_id,
          videos!inner(id, is_public, owner_id)
        `
        )
        .eq('id', annotationId)
        .single();

      if (error) {
        console.error('❌ [CommentService] Error getting annotation:', error);
        return {
          canComment: false,
          canModerate: false,
          reason: 'Annotation not found',
        };
      }

      const video = Array.isArray(annotation.videos)
        ? annotation.videos[0]
        : annotation.videos;
      if (!video) {
        return {
          canComment: false,
          canModerate: false,
          reason: 'Video not found',
        };
      }

      // Check if user can comment
      const canComment =
        video.is_public || // Public video
        (userId && video.owner_id === userId) || // Video owner
        (userId && annotation.user_id === userId); // Annotation owner

      // Check if user can moderate (annotation owner)
      const canModerate = userId && annotation.user_id === userId;

      console.log('✅ [CommentService] Permission check result:', {
        canComment,
        canModerate,
      });
      return { canComment, canModerate };
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
    console.log('🔍 [CommentService] Checking moderation permissions:', {
      commentId,
      userId,
      sessionId,
    });

    try {
      const { data: comment, error } = await supabase
        .from('annotation_comments')
        .select(
          `
          id,
          user_id,
          session_id,
          annotations!inner(id, user_id)
        `
        )
        .eq('id', commentId)
        .single();

      if (error) {
        console.error('❌ [CommentService] Error getting comment:', error);
        return false;
      }

      // User can moderate if:
      // 1. They are the comment author (authenticated)
      // 2. They are the comment author (anonymous with matching session)
      // 3. They are the annotation owner
      const annotation = Array.isArray(comment.annotations)
        ? comment.annotations[0]
        : comment.annotations;
      const canModerate =
        (userId && comment.user_id === userId) || // Comment author (authenticated)
        (sessionId && comment.session_id === sessionId) || // Comment author (anonymous)
        (userId && annotation?.user_id === userId); // Annotation owner

      console.log('✅ [CommentService] Moderation check result:', canModerate);
      return canModerate;
    } catch (error) {
      console.error(
        '❌ [CommentService] Error checking moderation permissions:',
        error
      );
      return false;
    }
  }

  /**
   * Moderate (delete) a comment - allows annotation owners to delete comments
   */
  static async moderateComment(
    commentId: string,
    userId: string,
    reason?: string
  ): Promise<void> {
    console.log('🔍 [CommentService] Moderating comment:', {
      commentId,
      userId,
      reason,
    });

    try {
      // Check if user can moderate
      const canModerate = await this.canUserModerateComment(commentId, userId);
      if (!canModerate) {
        throw new Error(
          'User does not have permission to moderate this comment'
        );
      }

      // Delete the comment
      await this.deleteComment(commentId);

      console.log('✅ [CommentService] Successfully moderated comment');
    } catch (error) {
      console.error('❌ [CommentService] Error moderating comment:', error);
      throw error;
    }
  }

  // ===== UTILITY FUNCTIONS =====

  /**
   * Get total comment count for an annotation
   */
  static async getCommentCount(annotationId: string): Promise<number> {
    console.log(
      '🔍 [CommentService] Getting comment count for annotation:',
      annotationId
    );

    try {
      const { count, error } = await supabase
        .from('annotation_comments')
        .select('*', { count: 'exact', head: true })
        .eq('annotation_id', annotationId);

      if (error) {
        console.error(
          '❌ [CommentService] Error getting comment count:',
          error
        );
        throw error;
      }

      console.log('✅ [CommentService] Comment count:', count);
      return count || 0;
    } catch (error) {
      console.error('❌ [CommentService] Error getting comment count:', error);
      throw error;
    }
  }

  /**
   * Get total comment count for a project (single or dual video)
   */
  static async getProjectCommentCount(project: any): Promise<number> {
    console.log(
      '🔍 [CommentService] Getting comment count for project:',
      project.id
    );

    try {
      let totalCount = 0;

      if (project.project_type === 'single') {
        // For single video projects, first get all annotation IDs for the video
        const { data: annotations, error: annotationsError } = await supabase
          .from('annotations')
          .select('id')
          .eq('video_id', project.video.id);

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
          .in('annotation_id', annotationIds);

        if (error) {
          console.error(
            '❌ [CommentService] Error getting single project comment count:',
            error
          );
          return 0;
        }

        totalCount = count || 0;
      } else if (project.project_type === 'dual') {
        // For dual video projects, get comments for annotations of both videos
        const videoAId = project.video_a?.id;
        const videoBId = project.video_b?.id;

        if (videoAId && videoBId) {
          // First get all annotation IDs for both videos
          const { data: annotations, error: annotationsError } = await supabase
            .from('annotations')
            .select('id')
            .in('video_id', [videoAId, videoBId]);

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
            .in('annotation_id', annotationIds);

          if (error) {
            console.error(
              '❌ [CommentService] Error getting dual project comment count:',
              error
            );
            return 0;
          }

          totalCount = count || 0;
        }
      }

      console.log('✅ [CommentService] Project comment count:', totalCount);
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
  static async getProjectCommentCounts(
    projects: any[]
  ): Promise<Record<string, number>> {
    console.log(
      '🔍 [CommentService] Getting comment counts for multiple projects:',
      projects.length
    );

    try {
      const commentCounts: Record<string, number> = {};

      // Process projects in parallel for better performance
      const countPromises = projects.map(async (project) => {
        const count = await this.getProjectCommentCount(project);
        return { projectId: project.id, count };
      });

      const results = await Promise.all(countPromises);

      results.forEach(({ projectId, count }) => {
        commentCounts[projectId] = count;
      });

      console.log(
        '✅ [CommentService] Retrieved comment counts for all projects'
      );
      return commentCounts;
    } catch (error) {
      console.error(
        '❌ [CommentService] Error getting project comment counts:',
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
    console.log('🔍 [CommentService] Cleaning up old anonymous sessions');

    try {
      const { error } = await supabase.rpc('cleanup_old_anonymous_sessions');

      if (error) {
        console.error('❌ [CommentService] Error cleaning up sessions:', error);
        throw error;
      }

      console.log('✅ [CommentService] Successfully cleaned up old sessions');
    } catch (error) {
      console.error('❌ [CommentService] Error cleaning up sessions:', error);
      throw error;
    }
  }

  // ===== BATCH OPERATIONS =====

  /**
   * Get comments with user data for multiple annotations
   */
  static async getCommentsForAnnotations(
    annotationIds: string[]
  ): Promise<Record<string, Comment[]>> {
    console.log(
      '🔍 [CommentService] Getting comments for multiple annotations:',
      annotationIds
    );

    try {
      if (annotationIds.length === 0) {
        return {};
      }

      const { data, error } = await supabase
        .from('annotation_comments')
        .select(
          `
          *,
          user:users(id, email, full_name, avatar_url)
        `
        )
        .in('annotation_id', annotationIds)
        .order('created_at', { ascending: true });

      if (error) {
        console.error(
          '❌ [CommentService] Error getting batch comments:',
          error
        );
        throw error;
      }

      // Group comments by annotation_id
      const commentsByAnnotation: Record<string, Comment[]> = {};

      annotationIds.forEach((id) => {
        commentsByAnnotation[id] = [];
      });

      data?.forEach((comment) => {
        const transformedComment = transformDatabaseCommentToApp(comment);
        if (!commentsByAnnotation[comment.annotation_id]) {
          commentsByAnnotation[comment.annotation_id] = [];
        }
        commentsByAnnotation[comment.annotation_id].push(transformedComment);
      });

      console.log(
        '✅ [CommentService] Retrieved batch comments for',
        Object.keys(commentsByAnnotation).length,
        'annotations'
      );
      return commentsByAnnotation;
    } catch (error) {
      console.error('❌ [CommentService] Error getting batch comments:', error);
      throw error;
    }
  }

  /**
   * Delete all comments for an annotation (used when annotation is deleted)
   */
  static async deleteAnnotationComments(annotationId: string): Promise<void> {
    console.log(
      '🔍 [CommentService] Deleting all comments for annotation:',
      annotationId
    );

    try {
      const { error } = await supabase
        .from('annotation_comments')
        .delete()
        .eq('annotation_id', annotationId);

      if (error) {
        console.error(
          '❌ [CommentService] Error deleting annotation comments:',
          error
        );
        throw error;
      }

      console.log(
        '✅ [CommentService] Successfully deleted all comments for annotation'
      );
    } catch (error) {
      console.error(
        '❌ [CommentService] Error deleting annotation comments:',
        error
      );
      throw error;
    }
  }

  // ===== REAL-TIME BROADCASTING =====

  /**
   * Broadcast comment event to real-time subscribers
   */
  static async broadcastCommentEvent(
    event: 'INSERT' | 'UPDATE' | 'DELETE',
    annotationId: string,
    comment: Comment,
    oldComment?: Comment
  ): Promise<void> {
    try {
      const channel = supabase.channel(`annotation_comments:${annotationId}`);

      const payload = {
        event,
        annotation_id: annotationId,
        comment,
        old_comment: oldComment,
        timestamp: new Date().toISOString(),
      };

      await channel.send({
        type: 'broadcast',
        event: `comment_${event.toLowerCase()}`,
        payload,
      });

      console.log(
        `📡 [CommentService] Broadcasted ${event} event for comment:`,
        comment.id
      );
    } catch (error) {
      console.error(
        '❌ [CommentService] Error broadcasting comment event:',
        error
      );
      // Don't throw error to avoid breaking the main operation
    }
  }

  /**
   * Broadcast typing status to real-time subscribers
   */
  static async broadcastTypingStatus(
    annotationId: string,
    userId: string,
    userName: string,
    isTyping: boolean
  ): Promise<void> {
    try {
      const channel = supabase.channel(`presence:annotation:${annotationId}`);

      const event = isTyping ? 'typing_start' : 'typing_stop';
      const payload = {
        user_id: userId,
        user_name: userName,
        annotation_id: annotationId,
        typing: isTyping,
        timestamp: new Date().toISOString(),
      };

      await channel.send({
        type: 'broadcast',
        event,
        payload,
      });

      console.log(
        `⌨️ [CommentService] Broadcasted typing ${
          isTyping ? 'start' : 'stop'
        } for user:`,
        userId
      );
    } catch (error) {
      console.error(
        '❌ [CommentService] Error broadcasting typing status:',
        error
      );
      // Don't throw error to avoid breaking the main operation
    }
  }

  /**
   * Subscribe to real-time comment changes for an annotation
   */
  static subscribeToCommentChanges(
    annotationId: string,
    callbacks: {
      onInsert?: (comment: Comment) => void;
      onUpdate?: (comment: Comment, oldComment?: Comment) => void;
      onDelete?: (comment: Comment) => void;
    }
  ) {
    console.log(
      '🔄 [CommentService] Subscribing to comment changes for annotation:',
      annotationId
    );

    const channel = supabase
      .channel(`annotation_comments:${annotationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'annotation_comments',
          filter: `annotation_id=eq.${annotationId}`,
        },
        (payload) => {
          if (callbacks.onInsert) {
            const comment = transformDatabaseCommentToApp(payload.new);
            callbacks.onInsert(comment);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'annotation_comments',
          filter: `annotation_id=eq.${annotationId}`,
        },
        (payload) => {
          if (callbacks.onUpdate) {
            const comment = transformDatabaseCommentToApp(payload.new);
            const oldComment = payload.old
              ? transformDatabaseCommentToApp(payload.old)
              : undefined;
            callbacks.onUpdate(comment, oldComment);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'annotation_comments',
          filter: `annotation_id=eq.${annotationId}`,
        },
        (payload) => {
          if (callbacks.onDelete) {
            const comment = transformDatabaseCommentToApp(payload.old);
            callbacks.onDelete(comment);
          }
        }
      )
      .subscribe();

    return {
      unsubscribe: () => {
        console.log('🔌 [CommentService] Unsubscribing from comment changes');
        supabase.removeChannel(channel);
      },
    };
  }

  /**
   * Subscribe to user presence for an annotation
   */
  static subscribeToUserPresence(
    annotationId: string,
    userId: string,
    userName: string,
    callbacks: {
      onUserJoin?: (userId: string, presence: any) => void;
      onUserLeave?: (userId: string, presence: any) => void;
      onTypingStart?: (userId: string, userName: string) => void;
      onTypingStop?: (userId: string) => void;
    }
  ) {
    console.log(
      '👥 [CommentService] Subscribing to user presence for annotation:',
      annotationId
    );

    const channel = supabase.channel(`presence:annotation:${annotationId}`, {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        console.log('👥 [CommentService] Presence synced:', Object.keys(state));
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('👋 [CommentService] User joined:', key);
        if (callbacks.onUserJoin) {
          callbacks.onUserJoin(key, newPresences[0]);
        }
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('👋 [CommentService] User left:', key);
        if (callbacks.onUserLeave) {
          callbacks.onUserLeave(key, leftPresences[0]);
        }
      })
      .on('broadcast', { event: 'typing_start' }, ({ payload }) => {
        if (payload.user_id !== userId && callbacks.onTypingStart) {
          callbacks.onTypingStart(payload.user_id, payload.user_name);
        }
      })
      .on('broadcast', { event: 'typing_stop' }, ({ payload }) => {
        if (payload.user_id !== userId && callbacks.onTypingStop) {
          callbacks.onTypingStop(payload.user_id);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            user_name: userName,
            annotation_id: annotationId,
            typing: false,
            online_at: new Date().toISOString(),
          });
        }
      });

    return {
      unsubscribe: () => {
        console.log('🔌 [CommentService] Unsubscribing from user presence');
        supabase.removeChannel(channel);
      },
      updateTypingStatus: (isTyping: boolean) => {
        this.broadcastTypingStatus(annotationId, userId, userName, isTyping);
      },
    };
  }

  /**
   * Get real-time permission validation for comment operations
   */
  static async validateRealtimePermissions(
    annotationId: string,
    userId?: string,
    sessionId?: string
  ): Promise<{
    canComment: boolean;
    canModerate: boolean;
    canSubscribe: boolean;
    reason?: string;
  }> {
    try {
      // Check basic comment permissions
      const permissions = await this.canUserCommentOnAnnotation(
        annotationId,
        userId
      );

      // Real-time subscription is allowed if user can view the annotation
      // This includes public videos, video owners, and annotation owners
      const canSubscribe = permissions.canComment || Boolean(userId);

      return {
        canComment: permissions.canComment,
        canModerate: permissions.canModerate,
        canSubscribe,
        reason: permissions.reason,
      };
    } catch (error) {
      console.error(
        '❌ [CommentService] Error validating real-time permissions:',
        error
      );
      return {
        canComment: false,
        canModerate: false,
        canSubscribe: false,
        reason: 'Permission validation failed',
      };
    }
  }

  /**
   * Enhanced create comment with real-time broadcasting
   */
  static async createCommentWithRealtime(
    params: CreateCommentParams
  ): Promise<Comment> {
    try {
      // Create comment using existing method
      const comment = await this.createComment(params);

      // Broadcast the event to real-time subscribers
      await this.broadcastCommentEvent('INSERT', params.annotation_id, comment);

      return comment;
    } catch (error) {
      console.error(
        '❌ [CommentService] Error creating comment with real-time:',
        error
      );
      throw error;
    }
  }

  /**
   * Enhanced update comment with real-time broadcasting
   */
  static async updateCommentWithRealtime(
    commentId: string,
    params: UpdateCommentParams,
    sessionId?: string
  ): Promise<Comment> {
    try {
      // Get the old comment for broadcasting
      const { data: oldCommentData } = await supabase
        .from('annotation_comments')
        .select('*')
        .eq('id', commentId)
        .single();

      const oldComment = oldCommentData
        ? transformDatabaseCommentToApp(oldCommentData)
        : undefined;

      // Update comment using existing method
      const updatedComment = await this.updateComment(
        commentId,
        params,
        sessionId
      );

      // Broadcast the event to real-time subscribers
      if (oldComment) {
        await this.broadcastCommentEvent(
          'UPDATE',
          updatedComment.annotation_id,
          updatedComment,
          oldComment
        );
      }

      return updatedComment;
    } catch (error) {
      console.error(
        '❌ [CommentService] Error updating comment with real-time:',
        error
      );
      throw error;
    }
  }

  /**
   * Enhanced delete comment with real-time broadcasting
   */
  static async deleteCommentWithRealtime(
    commentId: string,
    sessionId?: string
  ): Promise<void> {
    try {
      // Get the comment before deletion for broadcasting
      const { data: commentData } = await supabase
        .from('annotation_comments')
        .select('*')
        .eq('id', commentId)
        .single();

      if (!commentData) {
        throw new Error('Comment not found');
      }

      const comment = transformDatabaseCommentToApp(commentData);

      // Delete comment using existing method
      await this.deleteComment(commentId, sessionId);

      // Broadcast the event to real-time subscribers
      await this.broadcastCommentEvent(
        'DELETE',
        comment.annotation_id,
        comment
      );
    } catch (error) {
      console.error(
        '❌ [CommentService] Error deleting comment with real-time:',
        error
      );
      throw error;
    }
  }
}
