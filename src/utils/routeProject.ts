// Turns an editor route into the project it names. A project the viewer cannot
// see comes back from the database as "no row" rather than an error, so that
// case throws here: the caller has one failure path instead of a silent no-op
// that leaves the editor loading forever.

export interface RouteProjectDeps<V, C> {
  getVideo: (id: string) => Promise<V | null>;
  getComparison: (id: string) => Promise<C | null>;
}

export type RouteProject<V, C> =
  | { projectType: 'single'; video: V }
  | { projectType: 'dual'; comparisonVideo: C; videoA: unknown; videoB: unknown };

export async function resolveRouteProject<
  V,
  C extends { videoA?: unknown; videoB?: unknown },
>(
  route: { name: unknown; id: string | undefined },
  deps: RouteProjectDeps<V, C>
): Promise<RouteProject<V, C> | null> {
  if (!route.id) return null;
  if (route.name === 'editor-single') {
    const video = await deps.getVideo(route.id);
    if (!video) throw new Error(`Video ${route.id} not found`);
    return { projectType: 'single', video };
  }
  if (route.name === 'editor-dual') {
    const comparisonVideo = await deps.getComparison(route.id);
    if (!comparisonVideo) throw new Error(`Comparison ${route.id} not found`);
    return {
      projectType: 'dual',
      comparisonVideo,
      videoA: comparisonVideo.videoA,
      videoB: comparisonVideo.videoB,
    };
  }
  return null;
}
