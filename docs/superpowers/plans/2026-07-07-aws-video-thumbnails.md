# AWS Pipeline Video Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AWS pipeline videos (created via the `?outputVideo=` deep link) get a dashboard thumbnail, generated client-side from the presigned URL, exactly like manually uploaded videos.

**Architecture:** `VideoService.findOrCreateOutputVideo` (`src/services/videoService.ts`) already fetches a fresh presigned URL on every open, then either inserts a new `videos` row or updates the existing row's `url`. We hook thumbnail generation into that same function: generate a base64 JPEG with the existing `ThumbnailGenerator.generateSmallThumbnail(url)` utility whenever the record has no `thumbnailUrl` yet — covering both brand-new records and backfill of previously created ones. Generation failure is non-fatal (warn and continue), matching the upload flow.

**Tech Stack:** Vue 3 + TypeScript, Supabase (`videos` table, `thumbnailUrl` text column holding base64 data URLs), Vitest (node environment — browser APIs unavailable, so `ThumbnailGenerator` is mocked in service tests).

**Spec:** `docs/superpowers/specs/2026-07-07-aws-video-thumbnails-design.md`

## Global Constraints

- Source files in `src/services/` import siblings with **relative paths** (`'../utils/thumbnailGenerator'`); tests mock via the **`@` alias** (`'@/utils/thumbnailGenerator'`) — both resolve to the same module, this is the established pattern.
- Tests follow the repo's existing pattern: top-level `const` mocks, `vi.mock(...)` factories referencing them, and **dynamic `await import(...)` of the service inside each test** (see `src/services/__tests__/comparisonById.test.ts`).
- Vitest runs with `environment: 'node'` and picks up `src/**/*.test.ts` (see `vitest.config.ts`). Run tests with `npx vitest run <path>`.
- Thumbnail generation must never make `findOrCreateOutputVideo` fail — errors are caught, logged with `console.warn`, and the flow continues without a thumbnail.

---

### Task 1: Thumbnail generation + backfill in `findOrCreateOutputVideo`

**Files:**
- Modify: `src/services/videoService.ts:588-635` (the `findOrCreateOutputVideo` method)
- Test (create): `src/services/__tests__/outputVideoThumbnail.test.ts`

**Interfaces:**
- Consumes: `ThumbnailGenerator.generateSmallThumbnail(videoUrl: string): Promise<string | null>` (already imported at `videoService.ts:11`); `AwsStorageService.getVideoUrlForProject(outputVideoId: string): Promise<string>`; `supabase` client.
- Produces: no signature changes — `findOrCreateOutputVideo(outputVideoId: string, ownerId: string): Promise<Video>` keeps its contract; inserted/updated rows may now carry `thumbnailUrl`.

- [ ] **Step 1: Write the failing tests**

Create `src/services/__tests__/outputVideoThumbnail.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateSmallThumbnail = vi.fn();
vi.mock('@/utils/thumbnailGenerator', () => ({
  ThumbnailGenerator: { generateSmallThumbnail },
}));

const getVideoUrlForProject = vi.fn(async () => 'https://s3.example.com/presigned.mp4');
vi.mock('@/services/awsStorageService', () => ({
  AwsStorageService: {
    getVideoUrlForProject,
    buildFilepath: (id: string) => `pipeline-output/${id}/streams/generated.mp4`,
  },
}));

// Captures what findOrCreateOutputVideo reads and writes through supabase.
const state: { existing: any; inserted: any; updated: any } = {
  existing: null,
  inserted: null,
  updated: null,
};

vi.mock('@/composables/useSupabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.existing, error: null }),
        }),
      }),
      insert: (row: any) => {
        state.inserted = row;
        return {
          select: () => ({
            single: async () => ({ data: { id: 'v1', ...row }, error: null }),
          }),
        };
      },
      update: (row: any) => {
        state.updated = row;
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({
                data: { ...state.existing, ...row },
                error: null,
              }),
            }),
          }),
        };
      },
    }),
  },
}));

async function callFindOrCreate() {
  const { VideoService } = await import('@/services/videoService');
  return VideoService.findOrCreateOutputVideo('proj-123', 'user-1');
}

describe('findOrCreateOutputVideo thumbnails', () => {
  beforeEach(() => {
    state.existing = null;
    state.inserted = null;
    state.updated = null;
    generateSmallThumbnail.mockReset();
  });

  it('includes a generated thumbnail when creating a new record', async () => {
    generateSmallThumbnail.mockResolvedValue('data:image/jpeg;base64,abc');

    await callFindOrCreate();

    expect(generateSmallThumbnail).toHaveBeenCalledWith(
      'https://s3.example.com/presigned.mp4'
    );
    expect(state.inserted.thumbnailUrl).toBe('data:image/jpeg;base64,abc');
  });

  it('creates the record without a thumbnail when generation returns null', async () => {
    generateSmallThumbnail.mockResolvedValue(null);

    await callFindOrCreate();

    expect(state.inserted).not.toBeNull();
    expect('thumbnailUrl' in state.inserted).toBe(false);
  });

  it('creates the record without a thumbnail when generation throws', async () => {
    generateSmallThumbnail.mockRejectedValue(new Error('canvas tainted'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await callFindOrCreate();

    expect(state.inserted).not.toBeNull();
    expect('thumbnailUrl' in state.inserted).toBe(false);
    warn.mockRestore();
  });

  it('backfills the thumbnail on an existing record that has none', async () => {
    state.existing = { id: 'v1', videoId: 'aws:proj-123', thumbnailUrl: null };
    generateSmallThumbnail.mockResolvedValue('data:image/jpeg;base64,backfilled');

    await callFindOrCreate();

    expect(state.inserted).toBeNull();
    expect(state.updated.url).toBe('https://s3.example.com/presigned.mp4');
    expect(state.updated.thumbnailUrl).toBe('data:image/jpeg;base64,backfilled');
  });

  it('does not regenerate when the existing record already has a thumbnail', async () => {
    state.existing = {
      id: 'v1',
      videoId: 'aws:proj-123',
      thumbnailUrl: 'data:image/jpeg;base64,existing',
    };

    await callFindOrCreate();

    expect(generateSmallThumbnail).not.toHaveBeenCalled();
    expect(state.updated).toEqual({ url: 'https://s3.example.com/presigned.mp4' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/services/__tests__/outputVideoThumbnail.test.ts`

Expected: the 2 "without a thumbnail" tests may pass incidentally (current code never sets `thumbnailUrl`), but these MUST fail:
- `includes a generated thumbnail when creating a new record` — `state.inserted.thumbnailUrl` is `undefined`
- `backfills the thumbnail on an existing record that has none` — `state.updated.thumbnailUrl` is `undefined`
- `does not regenerate ...` — passes trivially now; it exists to pin behavior after the change.

- [ ] **Step 3: Implement thumbnail generation in `findOrCreateOutputVideo`**

In `src/services/videoService.ts`, replace the body of `findOrCreateOutputVideo` (currently lines 588-635) with:

```typescript
  static async findOrCreateOutputVideo(outputVideoId: string, ownerId: string): Promise<Video> {
    // Always fetch a fresh presigned URL
    const presignedUrl = await AwsStorageService.getVideoUrlForProject(outputVideoId);
    const filepath = AwsStorageService.buildFilepath(outputVideoId);

    // Check for existing record
    const existing = await this.findVideoByOutputVideoId(outputVideoId);

    // Generate a thumbnail whenever the record has none yet: new records, plus
    // backfill for AWS videos created before thumbnails existed. Requires CORS
    // on the S3 bucket; failure is non-fatal and leaves the video without one.
    let thumbnailUrl: string | null = null;
    if (!existing?.thumbnailUrl) {
      try {
        thumbnailUrl = await ThumbnailGenerator.generateSmallThumbnail(presignedUrl);
      } catch (error) {
        console.warn('⚠️ Failed to generate thumbnail for AWS video:', error);
      }
    }

    if (existing) {
      // Update the URL with the fresh presigned URL (and backfilled thumbnail, if any)
      const { data, error } = await supabase
        .from('videos')
        .update({
          url: presignedUrl,
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        handleServiceError('VideoService.findOrCreateOutputVideo', error);
        return existing;
      }
      return data;
    }

    // Create new video record
    const { data, error } = await supabase
      .from('videos')
      .insert({
        ownerId,
        url: presignedUrl,
        title: `Pipeline Output - ${outputVideoId.substring(0, 8)}`,
        videoType: 'url',
        videoId: `aws:${outputVideoId}`,
        isPublic: false,
        fps: 30,
        duration: 1,
        totalFrames: 30,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      })
      .select()
      .single();

    if (error) {
      handleServiceError('VideoService.findOrCreateOutputVideo', error);
      throw error;
    }

    return data;
  }
```

Everything outside the two spread additions and the thumbnail block is identical to the current code (including the unused-looking `filepath` line and the JSDoc comment above the method — leave both as they are).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/services/__tests__/outputVideoThumbnail.test.ts`

Expected: 5 passed.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`

Expected: all tests pass (same pass count as before this change, plus 5 new).

- [ ] **Step 6: Commit**

```bash
git add src/services/videoService.ts src/services/__tests__/outputVideoThumbnail.test.ts
git commit -m "feat: generate thumbnails for AWS pipeline videos

Generated client-side from the presigned URL in findOrCreateOutputVideo,
matching the upload flow. Existing AWS videos are backfilled on next open.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Manual QA (after Task 1, by the user — validates the CORS assumption)

1. Open an `?outputVideo=<id>` deep link for a pipeline video in the browser.
2. Return to the dashboard; the video's card should now show a thumbnail.
3. If it does not, check the console for `⚠️ Failed to generate thumbnail for AWS video` — a SecurityError there means the S3 bucket needs a CORS rule (`Access-Control-Allow-Origin` for the app origin); the code path is still correct.
