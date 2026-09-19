/**
 * Runs async tasks one at a time, and only the newest of those waiting.
 *
 * For work that replaces its predecessor's result - loading the project a
 * route points at. Running such tasks concurrently lets an older one finish
 * last and win; this makes each wait for the one before it, and drops any that
 * were overtaken while waiting.
 *
 * A task already running is never interrupted: it runs to the end (its
 * cleanup and its state stay consistent) and the newest waiting task follows.
 */
export function createLatestQueue() {
  let running: Promise<void> | null = null;
  let latest = 0;

  const start = (task: () => Promise<void>): Promise<void> => {
    // Promise.resolve().then so a synchronous throw becomes a rejection too.
    const result = Promise.resolve().then(task);
    const settled = result.catch(() => {});
    running = settled;
    void settled.then(() => {
      if (running === settled) running = null;
    });
    return result;
  };

  return {
    run(task: () => Promise<void>): Promise<void> {
      const ticket = ++latest;
      if (!running) return start(task);
      // Wait for whatever is running when this one's turn comes, not only for
      // what was running when it was queued.
      const wait = async (): Promise<void> => {
        while (running) await running;
        if (ticket !== latest) return; // overtaken while waiting
        return start(task);
      };
      return wait();
    },
  };
}
