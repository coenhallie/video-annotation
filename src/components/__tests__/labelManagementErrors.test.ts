// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';

const getLabels = vi.fn();
const getLabelStats = vi.fn();
const updateLabel = vi.fn();
vi.mock('@/services/labelService', () => ({
  LabelService: {
    initializeDefaultLabels: vi.fn(async () => {}),
    getLabels: (...a: unknown[]) => getLabels(...a),
    getLabelStats: (...a: unknown[]) => getLabelStats(...a),
    updateLabel: (...a: unknown[]) => updateLabel(...a),
    createLabel: vi.fn(),
    deleteLabel: vi.fn(),
  },
}));
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ user: ref({ id: 'u1' }), isAuthenticated: ref(true) }),
}));

import LabelManagement from '@/components/LabelManagement.vue';

async function mountPanel() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp({ render: () => h(LabelManagement) });
  app.mount(root);
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await nextTick();
  }
  return { root, unmount: () => (app.unmount(), root.remove()) };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  getLabels.mockReset();
  getLabelStats.mockReset().mockResolvedValue([]);
  updateLabel.mockReset();
});

describe('LabelManagement failures', () => {
  // The error ref was set and never rendered, and a failed load filled the list
  // with made-up "fallback-N" rows that looked real and could not be saved.
  it('says the labels could not be loaded, and invents none', async () => {
    getLabels.mockRejectedValue({ message: 'permission denied for table labels' });
    const p = await mountPanel();

    expect(p.root.querySelector('[role="alert"]')?.textContent ?? '').toContain(
      'permission denied for table labels'
    );
    expect(p.root.textContent).not.toContain('EVT MISSED');
    p.unmount();
  });

  // Write failures were caught into a parameter that shadowed the error ref and
  // only logged, so a refused save looked like nothing had been clicked.
  it('says when a label change was refused', async () => {
    getLabels.mockResolvedValue([
      { id: 'l1', name: 'Footwork', color: '#111111', isActive: true, isDefault: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
    ]);
    updateLabel.mockRejectedValue(new Error('not allowed'));
    const p = await mountPanel();

    const toggle = [...p.root.querySelectorAll('button')].find((b) =>
      /deactivate|disable|activate|enable/i.test(`${b.title} ${b.textContent}`)
    );
    expect(toggle, 'a toggle-active control for the label').toBeTruthy();
    toggle!.click();
    for (let i = 0; i < 6; i++) { await Promise.resolve(); await nextTick(); }

    expect(p.root.querySelector('[role="alert"]')?.textContent ?? '').toContain('not allowed');
    p.unmount();
  });
});
