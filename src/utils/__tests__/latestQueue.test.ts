import { describe, it, expect } from 'vitest';
import { createLatestQueue } from '@/utils/latestQueue';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

// Editor project loads are long async chains (cleanup, fetch, URL refresh, load).
// Back/Forward fired them concurrently: the first project's fetch could finish
// last and overwrite the second, or its cleanup could wipe the second's state.
describe('createLatestQueue', () => {
  it('never runs two tasks at once', async () => {
    const queue = createLatestQueue();
    const first = deferred();
    const log: string[] = [];
    void queue.run(async () => { log.push('a:start'); await first.promise; log.push('a:end'); });
    void queue.run(async () => { log.push('b:start'); });
    await tick();
    expect(log).toEqual(['a:start']);

    first.resolve();
    await tick();
    expect(log).toEqual(['a:start', 'a:end', 'b:start']);
  });

  it('skips a waiting task that a newer one has replaced', async () => {
    const queue = createLatestQueue();
    const first = deferred();
    const log: string[] = [];
    void queue.run(async () => { await first.promise; log.push('a'); });
    void queue.run(async () => { log.push('b'); });
    void queue.run(async () => { log.push('c'); });

    first.resolve();
    await tick();
    expect(log).toEqual(['a', 'c']);
  });

  it('keeps going after a task throws', async () => {
    const queue = createLatestQueue();
    const log: string[] = [];
    await queue.run(async () => { throw new Error('boom'); }).catch(() => log.push('caught'));
    await queue.run(async () => { log.push('next'); });
    expect(log).toEqual(['caught', 'next']);
  });
});
