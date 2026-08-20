import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '@/utils/relativeTime';

const NOW = new Date('2026-08-21T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it('reads anything under a minute as JUST NOW', () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe('JUST NOW');
    expect(formatRelativeTime(ago(59 * SECOND), NOW)).toBe('JUST NOW');
  });

  it('counts whole minutes up to the hour boundary', () => {
    expect(formatRelativeTime(ago(MINUTE), NOW)).toBe('1M AGO');
    expect(formatRelativeTime(ago(5 * MINUTE), NOW)).toBe('5M AGO');
    expect(formatRelativeTime(ago(59 * MINUTE), NOW)).toBe('59M AGO');
  });

  it('counts whole hours up to the day boundary', () => {
    expect(formatRelativeTime(ago(HOUR), NOW)).toBe('1H AGO');
    expect(formatRelativeTime(ago(23 * HOUR), NOW)).toBe('23H AGO');
  });

  it('names the first day boundary rather than counting it', () => {
    expect(formatRelativeTime(ago(DAY), NOW)).toBe('YESTERDAY');
    expect(formatRelativeTime(ago(2 * DAY), NOW)).toBe('2 DAYS AGO');
    expect(formatRelativeTime(ago(6 * DAY), NOW)).toBe('6 DAYS AGO');
  });

  it('falls back to a plain date once the relative form stops helping', () => {
    const iso = ago(7 * DAY);
    expect(formatRelativeTime(iso, NOW)).toBe(new Date(iso).toLocaleDateString());
  });

  it('treats a future timestamp as JUST NOW rather than a negative age', () => {
    const future = new Date(NOW.getTime() + 5 * MINUTE).toISOString();
    expect(formatRelativeTime(future, NOW)).toBe('JUST NOW');
  });

  it('returns an empty string for an unparseable timestamp', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('');
  });
});
