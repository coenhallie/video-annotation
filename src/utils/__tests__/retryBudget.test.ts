import { describe, it, expect } from 'vitest';
import { createRetryBudget } from '@/utils/retryBudget';

// A player error on an AWS video triggers a URL refresh and a reload. With a
// persistently failing object (deleted, 404) that chain ran forever:
// presign, attach, error, presign...
describe('createRetryBudget', () => {
  it('allows a fixed number of attempts per key, then refuses', () => {
    const budget = createRetryBudget(3);
    expect([1, 2, 3, 4].map(() => budget.take('video-1'))).toEqual([true, true, true, false]);
  });

  it('counts each key on its own', () => {
    const budget = createRetryBudget(1);
    expect(budget.take('a')).toBe(true);
    expect(budget.take('b')).toBe(true);
    expect(budget.take('a')).toBe(false);
  });

  it('starts over once the key has recovered', () => {
    const budget = createRetryBudget(1);
    budget.take('a');
    budget.reset('a');
    expect(budget.take('a')).toBe(true);
  });
});
