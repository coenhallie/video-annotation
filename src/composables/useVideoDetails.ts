import { ref, type Ref } from 'vue';
import type { Project } from '@/types/project';
import type { Annotation } from '@/types/database';
import type { Label } from '@/types/labels';
import { AnnotationService } from '@/services/annotationService';

export type PanelAnnotation = Annotation & { labels: string[] };

export interface LabelSummaryEntry {
  id: string;
  name: string;
  color: string;
  count: number;
}

/** Merge the three comparison annotation groups into one list sorted by timestamp. */
export function mergeComparisonAnnotations(groups: {
  comparison: PanelAnnotation[];
  videoA: PanelAnnotation[];
  videoB: PanelAnnotation[];
}): PanelAnnotation[] {
  return [...groups.comparison, ...groups.videoA, ...groups.videoB].sort(
    (a, b) => a.timestamp - b.timestamp
  );
}

/**
 * Count each label id across annotations, resolving name/color from labelMap.
 * Ids not present in labelMap are skipped. Result is sorted by count descending.
 */
export function summarizeLabels(
  annotations: PanelAnnotation[],
  labelMap: Map<string, Label>
): LabelSummaryEntry[] {
  const counts = new Map<string, number>();
  for (const ann of annotations) {
    for (const id of ann.labels || []) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  const entries: LabelSummaryEntry[] = [];
  for (const [id, count] of counts) {
    const label = labelMap.get(id);
    if (!label) continue;
    entries.push({ id, name: label.name, color: label.color, count });
  }
  return entries.sort((a, b) => b.count - a.count);
}

export interface UseVideoDetails {
  annotations: Ref<PanelAnnotation[]>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  selectProject: (project: Project) => Promise<void>;
  clear: () => void;
}

export function useVideoDetails(): UseVideoDetails {
  const annotations = ref<PanelAnnotation[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const cache = new Map<string, PanelAnnotation[]>();
  // Guards against a slow earlier fetch overwriting a newer selection.
  let requestId = 0;

  async function fetchAnnotations(project: Project): Promise<PanelAnnotation[]> {
    if (project.projectType === 'single') {
      return (await AnnotationService.getVideoAnnotations(
        project.video.id,
        project.id
      )) as PanelAnnotation[];
    }
    const groups = await AnnotationService.getAllComparisonVideoAnnotations(
      project.comparisonVideo.id,
      project.videoA.id,
      project.videoB.id
    );
    return mergeComparisonAnnotations(
      groups as unknown as {
        comparison: PanelAnnotation[];
        videoA: PanelAnnotation[];
        videoB: PanelAnnotation[];
      }
    );
  }

  async function selectProject(project: Project): Promise<void> {
    error.value = null;
    const token = ++requestId;

    const cached = cache.get(project.id);
    if (cached) {
      annotations.value = cached;
      loading.value = false;
      return;
    }

    loading.value = true;
    annotations.value = [];
    try {
      const result = await fetchAnnotations(project);
      cache.set(project.id, result);
      if (token !== requestId) return; // a newer selection superseded this one
      annotations.value = result;
    } catch (e) {
      if (token !== requestId) return;
      error.value = e instanceof Error ? e.message : String(e);
      annotations.value = [];
    } finally {
      if (token === requestId) loading.value = false;
    }
  }

  function clear(): void {
    annotations.value = [];
    loading.value = false;
    error.value = null;
  }

  return { annotations, loading, error, selectProject, clear };
}
