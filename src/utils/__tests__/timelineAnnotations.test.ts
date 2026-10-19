import { describe, it, expect } from 'vitest';
import { timelineAnnotations } from '@/utils/timelineAnnotations';

const a = (id: string | number) => ({ id, timestamp: 0 });

describe('timelineAnnotations', () => {
  it('passes every annotation through when no filter is active', () => {
    const list = [a('x'), a('y')];
    expect(timelineAnnotations(list, null)).toBe(list);
  });

  it('keeps only the annotations the list filter shows', () => {
    expect(timelineAnnotations([a('x'), a('y'), a('z')], ['z', 'x'])).toEqual([a('x'), a('z')]);
  });

  // Rows can carry numeric ids; the panel reports them as strings.
  it('matches numeric ids against their string form', () => {
    expect(timelineAnnotations([a(1), a(2)], ['2'])).toEqual([a(2)]);
  });

  it('shows nothing when the filter matches nothing', () => {
    expect(timelineAnnotations([a('x')], [])).toEqual([]);
  });
});
