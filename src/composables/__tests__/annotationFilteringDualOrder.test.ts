import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useAnnotationFiltering } from '@/composables/useAnnotationFiltering';
import type { PanelAnnotation } from '@/types/component-interfaces';

const rows = [
  { id: 'late', timestamp: 0, videoAFrame: 647, videoATimestamp: 21.5 },
  { id: 'early', timestamp: 0, videoAFrame: 90, videoATimestamp: null },
  { id: 'middle', timestamp: 9, videoAFrame: 270, videoATimestamp: 9 },
] as unknown as PanelAnnotation[];

describe('useAnnotationFiltering order in a comparison', () => {
  // The row shows video A's time, so the list has to be ordered by it too:
  // sorting on the stored timestamp put two 0:00-era rows first regardless.
  it("orders by video A's position", () => {
    const { sortedAnnotations } = useAnnotationFiltering({
      annotations: ref(rows),
      labelsById: ref({}),
      isDualMode: ref(true),
      fps: ref(30),
    });
    expect(sortedAnnotations.value.map((a) => a.id)).toEqual(['early', 'middle', 'late']);
  });

  it('keeps timestamp order for a single video', () => {
    const { sortedAnnotations } = useAnnotationFiltering({
      annotations: ref(rows),
      labelsById: ref({}),
    });
    expect(sortedAnnotations.value.map((a) => a.id)).toEqual(['late', 'early', 'middle']);
  });
});
