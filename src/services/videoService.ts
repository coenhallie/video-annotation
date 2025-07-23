import { supabase } from '../composables/useSupabase';
import type { VideoInsert, VideoUpdate } from '../types/database';
import { VideoUploadService } from './videoUploadService';

export class VideoService {
  static async createVideo(videoData: VideoInsert) {
    console.log(
      '🔍 [VideoService] Creating/updating video with data:',
      videoData
    );

    console.log('🐛 [DEBUG] VideoService.createVideo called with:', {
      url: videoData.url,
      video_id: videoData.video_id,
      video_type: videoData.video_type,
      owner_id: videoData.owner_id,
      title: videoData.title,
    });

    // For uploaded videos, always create new records (no deduplication)
    if (videoData.video_type === 'upload') {
      console.log('🔍 [VideoService] Creating new uploaded video record');
      const { data, error } = await supabase
        .from('videos')
        .insert(videoData)
        .select()
        .single();

      if (error) {
        console.error(
          '❌ [VideoService] Failed to create uploaded video:',
          error
        );
        throw error;
      }
      console.log(
        '✅ [VideoService] Successfully created uploaded video:',
        data
      );
      return data;
    }

    // For URL videos, check for existing videos by URL and owner
    console.log('🐛 [DEBUG] Checking for existing URL video with:', {
      url: videoData.url,
      owner_id: videoData.owner_id,
      video_type: 'url',
    });

    const { data: existingVideo } = await supabase
      .from('videos')
      .select('*')
      .eq('url', videoData.url)
      .eq('owner_id', videoData.owner_id)
      .eq('video_type', 'url')
      .single();

    console.log('🐛 [DEBUG] Existing video query result:', existingVideo);

    if (existingVideo) {
      console.log(
        '🔍 [VideoService] Found existing URL video, updating:',
        existingVideo.id
      );
      console.log('🐛 [DEBUG] Existing video details:', {
        id: existingVideo.id,
        url: existingVideo.url,
        video_id: existingVideo.video_id,
        video_type: existingVideo.video_type,
      });

      // Update existing video with new data
      const { data, error } = await supabase
        .from('videos')
        .update({
          title: videoData.title,
          fps: videoData.fps,
          duration: videoData.duration,
          total_frames: videoData.total_frames,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingVideo.id)
        .select()
        .single();

      if (error) {
        console.error('❌ [VideoService] Failed to update video:', error);
        throw error;
      }
      console.log('✅ [VideoService] Successfully updated video:', data);
      console.log('🐛 [DEBUG] Updated video details:', {
        id: data.id,
        url: data.url,
        video_id: data.video_id,
        video_type: data.video_type,
      });
      return data;
    }

    console.log(
      '🔍 [VideoService] No existing URL video found, creating new one'
    );
    // Create new video if none exists
    const { data, error } = await supabase
      .from('videos')
      .insert(videoData)
      .select()
      .single();

    if (error) {
      console.error('❌ [VideoService] Failed to create video:', error);
      console.error('❌ [VideoService] Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw error;
    }
    console.log('✅ [VideoService] Successfully created video:', data);
    console.log('🐛 [DEBUG] New video details:', {
      id: data.id,
      url: data.url,
      video_id: data.video_id,
      video_type: data.video_type,
    });
    return data;
  }

  static async getUserVideos(userId: string) {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  static async getMostRecentUserVideo(userId: string) {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
    return data;
  }

  static async getVideoById(videoId: string) {
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('id', videoId)
      .single();

    if (error) throw error;
    return data;
  }

  static async updateVideo(videoId: string, updates: VideoUpdate) {
    const { data, error } = await supabase
      .from('videos')
      .update(updates)
      .eq('id', videoId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteVideo(videoId: string) {
    // First get the video to check if it's an uploaded video
    const { data: video, error: fetchError } = await supabase
      .from('videos')
      .select('video_type, file_path')
      .eq('id', videoId)
      .single();

    if (fetchError) throw fetchError;

    // If it's an uploaded video, use the upload service to delete it
    if (video && video.video_type === 'upload' && video.file_path) {
      await VideoUploadService.deleteUploadedVideo(videoId, video.file_path);
    } else {
      // For URL videos, just delete the database record
      const { error } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId);
      if (error) throw error;
    }
  }
}
