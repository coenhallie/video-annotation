// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createApp, h } from 'vue';

vi.mock('@/components/CommentSection.vue', () => ({
  default: { render: () => null },
}));

import AnnotationCard from '@/components/AnnotationCard.vue';
import type { PanelAnnotation } from '@/types/component-interfaces';

function cardText(annotation: Partial<PanelAnnotation>, isDualMode: boolean) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp({
    render: () =>
      h(AnnotationCard, {
        annotation: {
          id: 'a1',
          content: 'note',
          labels: [],
          timestamp: 0,
          ...annotation,
        },
        isDualMode,
        fps: 30,
      }),
  });
  app.mount(root);
  const text = root.textContent ?? '';
  app.unmount();
  root.remove();
  return text;
}

// Comparison annotations saved before the stamp fix carry timestamp 0 next to a
// correct per-video position, and showed 0:00 beside a frame token of F00647.
describe('AnnotationCard time in a comparison', () => {
  it("shows video A's stored timestamp", () => {
    const text = cardText(
      { timestamp: 0, frame: 647, videoAFrame: 647, videoATimestamp: 21.5667 },
      true
    );
    expect(text).toContain('0:21');
  });

  it("falls back to video A's frame when no per-video timestamp was stored", () => {
    const text = cardText(
      { timestamp: 0, frame: 308, videoAFrame: 291, videoATimestamp: null },
      true
    );
    expect(text).toContain('0:09');
  });

  it('keeps the plain timestamp outside a comparison', () => {
    const text = cardText({ timestamp: 5, frame: 150, videoAFrame: 900 }, false);
    expect(text).toContain('0:05');
  });
});
