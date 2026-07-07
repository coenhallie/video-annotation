# AWS Pipeline Video Thumbnails — Design

**Date:** 2026-07-07
**Status:** Approved

## Problem

Videos imported from the external pipeline platform via the `?outputVideo=` URL param
(AWS-backed, `videoId` = `aws:{outputVideoId}`) have no thumbnail on the dashboard.
Manually uploaded videos do: `videoUploadService` generates a base64 JPEG client-side
at upload time (`ThumbnailGenerator.generateThumbnailFromFile`) and stores it in the
`thumbnailUrl` column. `VideoService.findOrCreateOutputVideo` inserts AWS video
records without a `thumbnailUrl`.

## Design

Client-side thumbnail generation in `VideoService.findOrCreateOutputVideo`
(`src/services/videoService.ts`), reusing the existing
`ThumbnailGenerator.generateSmallThumbnail(url)` utility.

1. **New records:** after fetching the fresh presigned URL, generate a thumbnail from
   it and include `thumbnailUrl` in the insert.
2. **Existing records missing a thumbnail:** generate one and include it in the
   URL-refresh update that already runs on every open. This backfills previously
   created AWS videos the next time they are opened — no migration needed.
3. **Non-fatal failure:** if generation fails (network, CORS, codec), log a warning
   and proceed without a thumbnail, matching the upload flow's behavior.

## Constraints / risks

- **CORS:** canvas capture from the presigned S3 URL requires the bucket to send
  `Access-Control-Allow-Origin`. If it does not, the canvas is tainted,
  `toDataURL` throws, and generation fails gracefully (video still loads, no
  thumbnail). Remedy in that case: add a CORS rule to the bucket. Server-side
  generation (ffmpeg in a function) was considered and rejected as
  disproportionate infrastructure.
- **Timing:** thumbnails are generated when the video is first opened via the
  deep link, not when it appears in a list — consistent with how these records
  are created today.

## Testing

- Unit test: `findOrCreateOutputVideo` includes `thumbnailUrl` in the insert when
  generation succeeds, omits it when generation returns null.
- Unit test: existing record without thumbnail gets `thumbnailUrl` added in the
  update; existing record that already has one is not regenerated.
- Manual QA: open an `?outputVideo=` link, confirm dashboard card shows a
  thumbnail afterward (validates the CORS assumption).
