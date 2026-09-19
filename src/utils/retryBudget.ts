/**
 * A per-key cap on automatic retries. `take` spends one attempt and says
 * whether it was available; `reset` is for when the thing being retried has
 * worked again, so a later, unrelated failure gets a full budget.
 */
export function createRetryBudget(maxAttempts: number) {
  const spent = new Map<string, number>();
  return {
    take(key: string): boolean {
      const used = spent.get(key) ?? 0;
      if (used >= maxAttempts) return false;
      spent.set(key, used + 1);
      return true;
    },
    reset(key: string): void {
      spent.delete(key);
    },
  };
}
