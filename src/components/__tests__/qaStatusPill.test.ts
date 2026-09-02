// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createApp, defineComponent, h } from 'vue';
import QaStatusPill from '@/components/QaStatusPill.vue';
import { QA_STATUSES } from '@/utils/qaStatus';
import type { QaStatus } from '@/types/database';

function mountPill(status: QaStatus) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp(
    defineComponent({ setup: () => () => h(QaStatusPill, { status }) })
  );
  app.mount(root);
  return {
    pill: () => root.querySelector<HTMLElement>('[data-testid="qa-status-pill"]'),
    unmount: () => {
      app.unmount();
      root.remove();
    },
  };
}

describe('QaStatusPill', () => {
  // Not suppressed at not_started, unlike the watch chip. The column exists to
  // tell states apart at a glance, and an empty slot cannot be told from a row
  // whose data has not loaded.
  it('renders a pill for all five values', () => {
    for (const status of QA_STATUSES) {
      const p = mountPill(status);
      expect(p.pill()).not.toBeNull();
      p.unmount();
    }
  });

  it('renders the uppercase label', () => {
    for (const [status, label] of [
      ['not_started', 'UNREVIEWED'],
      ['in_review', 'IN REVIEW'],
      ['failed', 'FAILED'],
      ['staging', 'STAGING'],
      ['production', 'PRODUCTION'],
    ] as [QaStatus, string][]) {
      const p = mountPill(status);
      expect(p.pill()?.textContent?.trim()).toBe(label);
      p.unmount();
    }
  });

  // The load-bearing assertion for the column. Without one width, the left
  // edges stagger and you are back to reading row by row.
  it('gives every pill the same fixed width', () => {
    const widths = new Set<string>();
    for (const status of QA_STATUSES) {
      const p = mountPill(status);
      const className = p.pill()?.className ?? '';
      const match = className.match(/\bw-\S+/);
      expect(match).not.toBeNull();
      widths.add(match![0]);
      p.unmount();
    }
    expect(widths.size).toBe(1);
  });

  it('accents only failed and fills only production', () => {
    const failed = mountPill('failed');
    expect(failed.pill()?.className).toContain('text-red-600');
    failed.unmount();

    const production = mountPill('production');
    expect(production.pill()?.className).toContain('bg-gray-900');
    production.unmount();

    for (const status of ['not_started', 'in_review', 'staging'] as QaStatus[]) {
      const p = mountPill(status);
      expect(p.pill()?.className).not.toContain('red');
      expect(p.pill()?.className).not.toContain('bg-gray-900');
      p.unmount();
    }
  });

  // The state the user actually hit: frontend ahead of the migration, so every
  // row's qaStatus is undefined. The pill must still read as a pill.
  it('renders a label when the status is absent, not an empty capsule', () => {
    const p = mountPill(undefined as never);
    expect(p.pill()?.textContent?.trim()).toBe('UNREVIEWED');
    expect(p.pill()?.className).toContain('text-gray-400');
    expect(p.pill()?.getAttribute('title')).toBe('QA status: UNREVIEWED');
    p.unmount();
  });

  it('does not shrink when the row is tight', () => {
    const p = mountPill('production');
    expect(p.pill()?.className).toContain('shrink-0');
    p.unmount();
  });
});
