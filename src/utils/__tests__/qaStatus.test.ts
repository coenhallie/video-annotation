import { describe, it, expect } from 'vitest';
import {
  QA_STATUSES,
  isQaStatus,
  qaStatusLabel,
  qaStatusPillClass,
  qaStatusToneClass,
  mergeQaStatusUpdate,
  toQaStatus,
} from '@/utils/qaStatus';
import type { Video } from '@/types/database';

describe('qaStatus vocabulary', () => {
  it('lists the five values in workflow order', () => {
    expect(QA_STATUSES).toEqual([
      'not_started',
      'in_review',
      'failed',
      'staging',
      'production',
    ]);
  });

  it('renders labels as uppercase display text', () => {
    expect(qaStatusLabel('not_started')).toBe('UNREVIEWED');
    expect(qaStatusLabel('in_review')).toBe('IN REVIEW');
    expect(qaStatusLabel('failed')).toBe('FAILED');
    expect(qaStatusLabel('staging')).toBe('STAGING');
    expect(qaStatusLabel('production')).toBe('PRODUCTION');
  });

  // A pill with no text is a 96px empty outline that reads as a progress bar.
  // These three are what stop that shipping again, whatever the input.
  it('never renders an empty label, whatever it is handed', () => {
    for (const absent of [undefined, null, '', 'shipped', 7, {}]) {
      expect(qaStatusLabel(absent as never)).toBe('UNREVIEWED');
    }
  });

  it('gives an absent status the same pill treatment as not started', () => {
    expect(qaStatusPillClass(undefined)).toBe(qaStatusPillClass('not_started'));
    expect(qaStatusToneClass(undefined)).toBe(qaStatusToneClass('not_started'));
  });

  it('normalises an absent status to not started', () => {
    expect(toQaStatus(undefined)).toBe('not_started');
    expect(toQaStatus(null)).toBe('not_started');
    expect(toQaStatus('staging')).toBe('staging');
  });

  it('accepts only the five values', () => {
    expect(isQaStatus('staging')).toBe(true);
    expect(isQaStatus('shipped')).toBe(false);
    expect(isQaStatus(null)).toBe(false);
    expect(isQaStatus(undefined)).toBe(false);
    expect(isQaStatus(3)).toBe(false);
  });

  it('gives the accent to failed and to nothing else', () => {
    expect(qaStatusToneClass('failed')).toBe('text-red-600 dark:text-red-400');
    for (const status of QA_STATUSES.filter((s) => s !== 'failed')) {
      expect(qaStatusToneClass(status)).toBe('text-gray-500 dark:text-gray-400');
    }
  });

  it('gives every status a bordered pill treatment', () => {
    for (const status of QA_STATUSES) {
      expect(qaStatusPillClass(status)).toMatch(/\bborder-\S+/);
      expect(qaStatusPillClass(status)).toMatch(/\btext-\S+/);
    }
  });

  // Three weights, not five colours. These two assertions are what stop a later
  // change from quietly turning the column into a rainbow.
  it('fills only production and accents only failed', () => {
    expect(qaStatusPillClass('production')).toContain('bg-gray-900');
    for (const status of QA_STATUSES.filter((s) => s !== 'production')) {
      expect(qaStatusPillClass(status)).not.toContain('bg-');
    }

    expect(qaStatusPillClass('failed')).toContain('text-red-600');
    for (const status of QA_STATUSES.filter((s) => s !== 'failed')) {
      expect(qaStatusPillClass(status)).not.toContain('red');
    }
  });
});

describe('mergeQaStatusUpdate', () => {
  const fullVideo = (overrides: Partial<Video> = {}): Video =>
    ({
      id: 'video-1',
      title: 'Match 1',
      url: 'http://v',
      videoId: 'aws:abc',
      fps: 30,
      duration: 10,
      totalFrames: 300,
      isPublic: false,
      allowAnnotations: true,
      ownerId: 'u1',
      videoType: 'url',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
      qaStatus: 'not_started',
      ...overrides,
    }) as Video;

  // The exact failure this closes: a store ref holding a partial, pre-save
  // video (e.g. after an AWS presigned URL refresh spreads a stale copy)
  // must pick up the saved status rather than keep showing the old one.
  it('folds the saved QA fields onto the current video when ids match', () => {
    const current = {
      id: 'video-1',
      qaStatus: 'not_started' as const,
      duration: 10,
      title: 'Match 1',
      url: 'http://v',
    };
    const updated = fullVideo({
      qaStatus: 'staging',
      qaStatusUpdatedAt: '2026-08-21T00:00:00Z',
      qaStatusUpdatedBy: 'u2',
      updatedAt: '2026-08-21T00:00:01Z',
      // Deliberately different from `current`, to prove these do NOT jump
      // onto the merged result: only the QA fields and updatedAt should.
      duration: 999,
      title: 'Renamed elsewhere',
      url: 'http://different-video',
    });

    const merged = mergeQaStatusUpdate(current, updated);

    expect(merged?.qaStatus).toBe('staging');
    expect(merged?.qaStatusUpdatedAt).toBe('2026-08-21T00:00:00Z');
    expect(merged?.qaStatusUpdatedBy).toBe('u2');
    expect(merged?.updatedAt).toBe('2026-08-21T00:00:01Z');
    // Everything outside the QA write survives from `current` unchanged; a
    // full-row spread would have let `updated`'s values win here instead.
    expect(merged?.duration).toBe(10);
    expect(merged?.title).toBe('Match 1');
    expect(merged?.url).toBe('http://v');
  });

  // A write that resolves after the viewer has already moved to a different
  // video must not stamp that video's fields onto this one.
  it('leaves a different video untouched', () => {
    const current = { id: 'video-2', qaStatus: 'not_started' as const };
    const updated = fullVideo({ id: 'video-1', qaStatus: 'production' });

    expect(mergeQaStatusUpdate(current, updated)).toBe(current);
  });

  it('stays null when nothing is loaded', () => {
    expect(mergeQaStatusUpdate(null, fullVideo())).toBeNull();
  });
});
