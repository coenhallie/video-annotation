// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';

const getLabels = vi.fn();
const getLabelStats = vi.fn();
const updateLabel = vi.fn();
const createLabel = vi.fn();
vi.mock('@/services/labelService', () => ({
  LabelService: {
    initializeDefaultLabels: vi.fn(async () => {}),
    getLabels: (...a: unknown[]) => getLabels(...a),
    getLabelStats: (...a: unknown[]) => getLabelStats(...a),
    updateLabel: (...a: unknown[]) => updateLabel(...a),
    createLabel: (...a: unknown[]) => createLabel(...a),
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
  createLabel.mockReset();
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

  // The form is a full-screen overlay. The panel's own error line sits behind
  // its backdrop, so a refused save looked like the button had done nothing.
  it('shows a refused save inside the form that is still open', async () => {
    getLabels.mockResolvedValue([]);
    createLabel.mockRejectedValue(new Error('duplicate key value'));
    const p = await mountPanel();

    [...p.root.querySelectorAll('button')]
      .find((b) => /new label|add label|create/i.test(b.textContent ?? ''))!
      .click();
    await nextTick();
    const form = p.root.querySelector('form')!;
    const name = form.querySelector('input')!;
    name.value = 'Footwork';
    name.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    for (let i = 0; i < 6; i++) { await Promise.resolve(); await nextTick(); }

    expect(form.querySelector('[role="alert"]')?.textContent ?? '').toContain(
      'duplicate key value'
    );
    p.unmount();
  });

  it('names each colour swatch for a screen reader', async () => {
    getLabels.mockResolvedValue([]);
    const p = await mountPanel();
    [...p.root.querySelectorAll('button')]
      .find((b) => /new label|add label|create/i.test(b.textContent ?? ''))!
      .click();
    await nextTick();

    const swatches = [...p.root.querySelectorAll('form button[type="button"]')].filter(
      (b) => (b as HTMLElement).style.backgroundColor
    );
    expect(swatches.length).toBeGreaterThan(5);
    for (const swatch of swatches) {
      expect(swatch.getAttribute('aria-label')).toBeTruthy();
    }
    expect(swatches.filter((b) => b.getAttribute('aria-pressed') === 'true').length).toBe(1);
    p.unmount();
  });
});
