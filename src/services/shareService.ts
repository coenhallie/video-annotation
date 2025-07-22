import { supabase } from '../composables/useSupabase';
import type { Database } from '../types/database';

export class ShareService {
  // Generate a shareable link for a video
  static async createShareableLink(videoId: string): Promise<string> {
    try {
      // First, make the video public
      await supabase
        .from('videos')
        .update({ is_public: true })
        .eq('id', videoId);

      // Generate the shareable URL with video ID
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}?share=${videoId}`;

      console.log('✅ [ShareService] Created shareable link:', shareUrl);
      return shareUrl;
    } catch (error) {
      console.error('❌ [ShareService] Error creating shareable link:', error);
      throw error;
    }
  }

  // Get shared video data (public videos only)
  static async getSharedVideo(videoId: string) {
    try {
      console.log('🔍 [ShareService] Loading shared video:', videoId);

      // Get the video (must be public)
      const { data: video, error: videoError } = await supabase
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .eq('is_public', true)
        .single();

      if (videoError) {
        console.error(
          '❌ [ShareService] Error loading shared video:',
          videoError
        );
        throw videoError;
      }

      if (!video) {
        throw new Error('Video not found or not public');
      }

      // Get the annotations for this video
      const { data: annotations, error: annotationsError } = await supabase
        .from('annotations')
        .select('*')
        .eq('video_id', videoId)
        .order('timestamp', { ascending: true });

      if (annotationsError) {
        console.error(
          '❌ [ShareService] Error loading annotations:',
          annotationsError
        );
        throw annotationsError;
      }

      // Map database field names to application field names
      const mappedAnnotations =
        annotations?.map((annotation) => ({
          ...annotation,
          annotationType: annotation.annotation_type,
          drawingData: annotation.drawing_data,
        })) || [];

      console.log(
        '✅ [ShareService] Loaded shared video with',
        mappedAnnotations.length,
        'annotations'
      );

      return {
        video,
        annotations: mappedAnnotations,
      };
    } catch (error) {
      console.error('❌ [ShareService] Error getting shared video:', error);
      throw error;
    }
  }

  // Make a video private again
  static async makeVideoPrivate(videoId: string): Promise<void> {
    try {
      await supabase
        .from('videos')
        .update({ is_public: false })
        .eq('id', videoId);

      console.log('✅ [ShareService] Made video private:', videoId);
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
      console.log('✅ [ShareService] Copied to clipboard:', text);
    } catch (error) {
      console.error('❌ [ShareService] Error copying to clipboard:', error);
      throw error;
    }
  }

  // Parse share URL parameters
  static parseShareUrl(): string | null {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('share');
  }
}
