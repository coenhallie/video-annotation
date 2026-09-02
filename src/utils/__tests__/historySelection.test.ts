import { describe, it, expect } from 'vitest';
import { planHistorySelection } from '@/utils/historySelection';

describe('planHistorySelection', () => {
  it('selects immediately when the entry carries no surface (a pre-migration row)', () => {
    expect(planHistorySelection(undefined, 'video')).toEqual({
      kind: 'select-now',
    });
    expect(planHistorySelection(undefined, 'pipeline')).toEqual({
      kind: 'select-now',
    });
  });

  it('selects immediately when the entry surface matches the active surface', () => {
    expect(planHistorySelection('video', 'video')).toEqual({
      kind: 'select-now',
    });
    expect(planHistorySelection('pipeline', 'pipeline')).toEqual({
      kind: 'select-now',
    });
  });

  it('plans a surface switch when the entry belongs to the other surface', () => {
    expect(planHistorySelection('pipeline', 'video')).toEqual({
      kind: 'switch-surface',
      surface: 'pipeline',
    });
    expect(planHistorySelection('video', 'pipeline')).toEqual({
      kind: 'switch-surface',
      surface: 'video',
    });
  });
});
