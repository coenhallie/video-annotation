/**
 * Utility script to generate thumbnails for existing videos in the database
 * Run this once to update all existing videos with thumbnails
 */

import { supabase } from '../composables/useSupabase';
import { ThumbnailGenerator } from './thumbnailGenerator';

export async function generateThumbnailsForExistingVideos() {
  console.log('🎬 Starting thumbnail generation for existing videos...');

  try {
    // Get all videos without thumbnails
    const { data: videos, error: videosError } = await supabase
      .from('videos')
      .select('*')
      .is('thumbnailUrl', null);

    if (videosError) {
      console.error('Error fetching videos:', videosError);
      return;
    }

    console.log(`Found ${videos?.length || 0} videos without thumbnails`);

    // Generate thumbnails for each video
    if (videos && videos.length > 0) {
      for (const video of videos) {
        try {
          console.log(`Generating thumbnail for: ${video.title}`);

          const thumbnail = await ThumbnailGenerator.generateSmallThumbnail(
            video.url,
            320
            // Removed seekTime parameter - will use smart frame selection
          );

          if (thumbnail) {
            // Update the video with the thumbnail
            // Only update the thumbnailUrl field to avoid trigger issues
            const { error: updateError } = await supabase
              .from('videos')
              .update({
                thumbnailUrl: thumbnail,
              })
              .eq('id', video.id)
              .select();

            if (updateError) {
              console.error(`Error updating video ${video.id}:`, updateError);
              // Try simpler update without select
              try {
                const { error: retryError } = await supabase
                  .from('videos')
                  .update({ thumbnailUrl: thumbnail })
                  .eq('id', video.id);

                if (!retryError) {
                  console.log(
                    `✅ Thumbnail generated for: ${video.title} (retry succeeded)`
                  );
                }
              } catch (e) {
                console.warn(`Could not update thumbnail for ${video.title}`);
              }
            } else {
              console.log(`✅ Thumbnail generated for: ${video.title}`);
            }
          } else {
            console.warn(`⚠️ Failed to generate thumbnail for: ${video.title}`);
          }
        } catch (error) {
          console.error(`Error processing video ${video.id}:`, error);
        }
      }
    }

    // Get all comparison videos without thumbnails
    const { data: comparisonVideos, error: compError } = await supabase
      .from('comparison_videos')
      .select(
        `
        *,
        videoA:videos!comparison_videos_videoAId_fkey(*),
        videoB:videos!comparison_videos_videoBId_fkey(*)
      `
      )
      .is('thumbnailUrl', null);

    if (compError) {
      console.error('Error fetching comparison videos:', compError);
      return;
    }

    console.log(
      `Found ${
        comparisonVideos?.length || 0
      } comparison videos without thumbnails`
    );

    // Generate composite thumbnails for comparison videos
    if (comparisonVideos && comparisonVideos.length > 0) {
      for (const compVideo of comparisonVideos) {
        try {
          if (compVideo.videoA && compVideo.videoB) {
            console.log(
              `Generating composite thumbnail for: ${compVideo.title}`
            );

            const thumbnail =
              await ThumbnailGenerator.generateCompositeThumbnail(
                compVideo.videoA.url,
                compVideo.videoB.url,
                320,
                2
              );

            if (thumbnail) {
              // Update the comparison video with the thumbnail
              const { error: updateError } = await supabase
                .from('comparison_videos')
                .update({ thumbnailUrl: thumbnail })
                .eq('id', compVideo.id);

              if (updateError) {
                console.error(
                  `Error updating comparison video ${compVideo.id}:`,
                  updateError
                );
              } else {
                console.log(
                  `✅ Composite thumbnail generated for: ${compVideo.title}`
                );
              }
            } else {
              console.warn(
                `⚠️ Failed to generate composite thumbnail for: ${compVideo.title}`
              );
            }
          }
        } catch (error) {
          console.error(
            `Error processing comparison video ${compVideo.id}:`,
            error
          );
        }
      }
    }

    console.log('🎉 Thumbnail generation complete!');
  } catch (error) {
    console.error('Error in thumbnail generation process:', error);
  }
}

// Function to be called from a component or console
export async function runThumbnailGeneration() {
  const confirmed = window.confirm(
    'This will generate thumbnails for all existing videos. This may take a while. Continue?'
  );

  if (confirmed) {
    await generateThumbnailsForExistingVideos();
    alert(
      'Thumbnail generation complete! Please refresh the page to see the thumbnails.'
    );
  }
}
