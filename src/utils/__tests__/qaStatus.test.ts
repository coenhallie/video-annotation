import { describe, it, expect } from 'vitest';
import {
  QA_STATUSES,
  isQaStatus,
  qaStatusLabel,
  qaStatusPillClass,
  qaStatusToneClass,
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
