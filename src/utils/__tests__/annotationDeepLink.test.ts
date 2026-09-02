import { describe, it, expect } from 'vitest';
import { resolveAnnotationDeepLink } from '@/utils/annotationDeepLink';

const A = { id: 'ann-1', timestamp: 12 };
const B = { id: 'ann-2', timestamp: 34 };

const base = {
  ready: true,
  annotationId: null as string | null,
  annotations: [A, B] as const,
  seekTime: null as number | null,
};

describe('resolveAnnotationDeepLink', () => {
  it('does nothing without a deep-link target', () => {
    expect(resolveAnnotationDeepLink(base)).toEqual({ type: 'none' });
  });

  it('waits while the player is not ready', () => {
    expect(
      resolveAnnotationDeepLink({
        ...base,
        ready: false,
        annotationId: 'ann-2',
        seekTime: 34,
      })
    ).toEqual({ type: 'wait' });
  });

  it('selects the linked annotation so the sidebar highlights it', () => {
    expect(
      resolveAnnotationDeepLink({ ...base, annotationId: 'ann-2', seekTime: 34 })
    ).toEqual({ type: 'select', annotation: B });
  });

  it('matches a legacy numeric id against the string from the URL', () => {
    const legacy = { id: 1712, timestamp: 5 };
    expect(
      resolveAnnotationDeepLink({
        ...base,
        annotations: [legacy],
        annotationId: '1712',
      })
    ).toEqual({ type: 'select', annotation: legacy });
  });

  it('seeks to the linked moment while an annotation list is still arriving', () => {
    // The caller clears only the timestamp on a seek, so the id stays pending
    // and the same annotation still gets selected once the list lands.
    expect(
      resolveAnnotationDeepLink({
        ...base,
        annotations: [],
        annotationId: 'ann-2',
        seekTime: 34,
      })
    ).toEqual({ type: 'seek', time: 34 });
  });

  it('keeps waiting for a still-missing annotation once the timestamp is spent', () => {
    expect(
      resolveAnnotationDeepLink({ ...base, annotations: [], annotationId: 'ann-2' })
    ).toEqual({ type: 'wait' });
  });

  it('still seeks for a plain ?t= link with no annotation id', () => {
    expect(resolveAnnotationDeepLink({ ...base, seekTime: 7 })).toEqual({
      type: 'seek',
      time: 7,
    });
  });

  it('seeks to the start of the video for a zero timestamp', () => {
    expect(resolveAnnotationDeepLink({ ...base, seekTime: 0 })).toEqual({
      type: 'seek',
      time: 0,
    });
  });
});
