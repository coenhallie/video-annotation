import { describe, it, expect } from 'vitest';
import { annotationRealtimeScope } from '@/utils/annotationRealtimeScope';
import type { Annotation } from '@/types/database';

const row = (over: Record<string, unknown>) =>
  ({ id: 'r1', timestamp: 1, projectId: null, ...over }) as unknown as Annotation;

const comparison = { id: 'c1', videoAId: 'va', videoBId: 'vb' };

describe('annotationRealtimeScope', () => {
  it('is null with nothing open', () => {
    expect(
      annotationRealtimeScope({ playerMode: 'single', videoId: '', surface: 'video', comparison: null })
    ).toBeNull();
    expect(
      annotationRealtimeScope({ playerMode: 'dual', videoId: 'v1', surface: 'video', comparison: null })
    ).toBeNull();
  });

  it('listens to the one video in single mode and keeps the surface guard', () => {
    const scope = annotationRealtimeScope({
      playerMode: 'single',
      videoId: 'v1',
      surface: 'pipeline',
      comparison,
    })!;
    expect(scope.sources.map((s) => s.filter)).toEqual(['videoId=eq.v1']);
    const [source] = scope.sources;
    expect(source!.accept(row({ surface: 'pipeline' }))).not.toBeNull();
    expect(source!.accept(row({ surface: 'video' }))).toBeNull();
    // Rows from before the column existed are 'video' by its default.
    expect(source!.accept(row({}))).toBeNull();
  });

  // A comparison shows three lists at once: its own annotations and each
  // video's individual ones. A realtime binding takes one filter, so it needs
  // three of them.
  it('listens to the comparison and to both of its videos', () => {
    const scope = annotationRealtimeScope({
      playerMode: 'dual',
      videoId: '',
      surface: 'video',
      comparison,
    })!;
    expect(scope.sources.map((s) => s.filter)).toEqual([
      'comparisonVideoId=eq.c1',
      'videoId=eq.va',
      'videoId=eq.vb',
    ]);
  });

  it("tags a video's own annotation with its side, as the loader does", () => {
    const [own, a, b] = annotationRealtimeScope({
      playerMode: 'dual',
      videoId: '',
      surface: 'video',
      comparison,
    })!.sources;
    expect(own!.accept(row({ videoContext: 'comparison' }))).toMatchObject({ videoContext: 'comparison' });
    expect(a!.accept(row({ videoId: 'va' }))).toMatchObject({ videoContext: 'video_a' });
    expect(b!.accept(row({ videoId: 'vb' }))).toMatchObject({ videoContext: 'video_b' });
  });

  // The loader reads a video's individual annotations with projectId null, so a
  // project-scoped row on the same video is not part of this list.
  it("drops a project-scoped annotation on one of the comparison's videos", () => {
    const [, a] = annotationRealtimeScope({
      playerMode: 'dual',
      videoId: '',
      surface: 'video',
      comparison,
    })!.sources;
    expect(a!.accept(row({ videoId: 'va', projectId: 'p9' }))).toBeNull();
  });

  it('names the channel after what is open, so a switch resubscribes', () => {
    const single = annotationRealtimeScope({ playerMode: 'single', videoId: 'v1', surface: 'video', comparison: null })!;
    const dual = annotationRealtimeScope({ playerMode: 'dual', videoId: '', surface: 'video', comparison })!;
    expect(single.channel).toBe('video_annotations:v1');
    expect(dual.channel).toBe('comparison_annotations:c1');
  });
});
