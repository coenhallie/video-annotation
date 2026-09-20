import { describe, it, expect, vi } from 'vitest';
import { resolveRouteProject } from '@/utils/routeProject';

const video = { id: 'v1' };
const comparison = { id: 'c1', videoA: { id: 'a' }, videoB: { id: 'b' } };

function deps(over: Partial<Parameters<typeof resolveRouteProject>[1]> = {}) {
  return {
    getVideo: vi.fn(async () => video),
    getComparison: vi.fn(async () => comparison),
    ...over,
  } as Parameters<typeof resolveRouteProject>[1];
}

describe('resolveRouteProject', () => {
  it('is null for a route that is not an editor', async () => {
    expect(await resolveRouteProject({ name: 'dashboard', id: undefined }, deps())).toBeNull();
  });

  it('resolves a single video', async () => {
    expect(await resolveRouteProject({ name: 'editor-single', id: 'v1' }, deps())).toEqual({
      projectType: 'single',
      video,
    });
  });

  it('resolves a comparison with its two videos', async () => {
    expect(await resolveRouteProject({ name: 'editor-dual', id: 'c1' }, deps())).toEqual({
      projectType: 'dual',
      comparisonVideo: comparison,
      videoA: comparison.videoA,
      videoB: comparison.videoB,
    });
  });

  // RLS hides a comparison the viewer may not see as "no row", not an error.
  // Treating that as nothing-to-do left the editor on "Loading video..." forever.
  it('throws when the comparison cannot be seen', async () => {
    await expect(
      resolveRouteProject({ name: 'editor-dual', id: 'c1' }, deps({ getComparison: async () => null }))
    ).rejects.toThrow(/not found/i);
  });

  it('throws when the video cannot be seen', async () => {
    await expect(
      resolveRouteProject({ name: 'editor-single', id: 'v1' }, deps({ getVideo: async () => null }))
    ).rejects.toThrow(/not found/i);
  });
});
