import { describe, it, expect } from 'vitest';
import {
  QA_STATUSES,
  isQaStatus,
  qaStatusLabel,
  qaStatusPillClass,
  qaStatusToneClass,
  resolveQaStatusTarget,
} from '@/utils/qaStatus';

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
    expect(qaStatusLabel('not_started')).toBe('NOT STARTED');
    expect(qaStatusLabel('in_review')).toBe('IN REVIEW');
    expect(qaStatusLabel('failed')).toBe('FAILED');
    expect(qaStatusLabel('staging')).toBe('STAGING');
    expect(qaStatusLabel('production')).toBe('PRODUCTION');
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

describe('resolveQaStatusTarget', () => {
  const loadedVideo = {
    id: 'video-1',
    qaStatus: 'in_review' as const,
    qaStatusUpdatedAt: '2026-08-20T00:00:00.000Z',
  };

  it('narrows a loaded, non-shared video to its QA target', () => {
    expect(resolveQaStatusTarget(loadedVideo, false, false)).toEqual({
      id: 'video-1',
      qaStatus: 'in_review',
      qaStatusUpdatedAt: '2026-08-20T00:00:00.000Z',
    });
  });

  it('returns null on a shared video, regardless of what loaded', () => {
    expect(resolveQaStatusTarget(loadedVideo, true, false)).toBeNull();
  });

  it('returns null on a shared comparison, regardless of what loaded', () => {
    expect(resolveQaStatusTarget(loadedVideo, false, true)).toBeNull();
  });

  it('returns null while no video has loaded', () => {
    expect(resolveQaStatusTarget(null, false, false)).toBeNull();
    expect(resolveQaStatusTarget(undefined, false, false)).toBeNull();
  });

  it('returns null for a partial video with no id or no qaStatus yet', () => {
    expect(resolveQaStatusTarget({ qaStatus: 'staging' as const }, false, false)).toBeNull();
    expect(resolveQaStatusTarget({ id: 'video-1' }, false, false)).toBeNull();
  });

  it('omits qaStatusUpdatedAt rather than setting it to undefined', () => {
    const target = resolveQaStatusTarget({ id: 'video-1', qaStatus: 'not_started' }, false, false);
    expect(target).toEqual({ id: 'video-1', qaStatus: 'not_started' });
    expect(target && 'qaStatusUpdatedAt' in target).toBe(false);
  });
});
