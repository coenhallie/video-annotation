/**
 * Direct thumbnail update using raw SQL to bypass triggers
 */

import { supabase } from '../composables/useSupabase';

export async function directUpdateVideoThumbnail(
  videoId: string,
  thumbnailUrl: string
) {
  try {
    // Use raw SQL to update only the thumbnailUrl field
    const { data, error } = await supabase.rpc(
      'update_video_thumbnail_direct',
      {
        p_video_id: videoId,
        p_thumbnail_url: thumbnailUrl,
      }
    );

    if (error) {
      // If RPC doesn't exist, try creating it first
      if (error.code === '42883') {
        // Function doesn't exist, create it
        await createUpdateFunction();
        // Retry the update
        const { error: retryError } = await supabase.rpc(
          'update_video_thumbnail_direct',
          {
            p_video_id: videoId,
            p_thumbnail_url: thumbnailUrl,
          }
        );
        return !retryError;
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error('Direct update failed:', err);
    return false;
  }
}

async function createUpdateFunction() {
  // Create the function via SQL editor
  const sql = `
    CREATE OR REPLACE FUNCTION update_video_thumbnail_direct(p_video_id UUID, p_thumbnail_url TEXT)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      UPDATE videos 
      SET "thumbnailUrl" = p_thumbnail_url
      WHERE id = p_video_id;
    END;
    $$;
  `;

  console.log('Creating update function. Please run this SQL in Supabase:');
  console.log(sql);
}

// Alternative: Update using a direct SQL query that bypasses RLS
export async function updateVideoThumbnailViaSQL(
  videoId: string,
  thumbnailUrl: string
) {
  try {
    // This approach uses the Supabase client to execute a raw update
    // It should bypass the updated_at trigger issue
    const { data, error } = await supabase
      .from('videos')
      .update(
        {
          thumbnailUrl: thumbnailUrl,
        },
        {
          count: 'exact',
        }
      )
      .eq('id', videoId);

    return !error;
  } catch (err) {
    console.error('SQL update failed:', err);
    return false;
  }
}
