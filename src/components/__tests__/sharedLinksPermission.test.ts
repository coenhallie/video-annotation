// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';

const updateSharePermissions = vi.fn();
vi.mock('@/services/shareService', () => ({
  ShareService: {
    getAllSharedVideos: vi.fn(async () => ({
      videos: [
        { id: 'v1', type: 'video', title: 'Clip', allowAnnotations: false, createdAt: '2026-01-01T00:00:00Z' },
      ],
    })),
    updateSharePermissions: (...a: unknown[]) => updateSharePermissions(...a),
    revokeShare: vi.fn(),
  },
}));
vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({ user: ref({ id: 'u1' }) }),
}));

import SharedLinksManagement from '@/components/SharedLinksManagement.vue';

const settle = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

async function mountList() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const app = createApp({ render: () => h(SharedLinksManagement) });
  app.mount(root);
  await settle();
  // The list has a sort select too; the permission one owns the 'annotate' option.
  const select = () =>
    root.querySelector('option[value="annotate"]')!.parentElement as HTMLSelectElement;
  const choose = async (value: string) => {
    select().value = value;
    select().dispatchEvent(new Event('change'));
    await settle();
  };
  const button = (name: RegExp) =>
    [...document.body.querySelectorAll('button')].find((b) =>
      name.test((b.textContent ?? '').trim())
    )!;
  return { select, choose, button, unmount: () => (app.unmount(), root.remove()) };
}

beforeEach(() => {
  updateSharePermissions.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// The select is an access-control display. It must never show a permission the
// link does not have.
describe('shared link permission select', () => {
  it('goes back to the real permission when the change is cancelled', async () => {
    const l = await mountList();
    await l.choose('annotate');
    l.button(/^cancel$/i).click();
    await settle();

    expect(l.select().value).toBe('view-only');
    l.unmount();
  });

  it('goes back to the real permission when the update fails', async () => {
    updateSharePermissions.mockRejectedValue(new Error('denied'));
    const l = await mountList();
    await l.choose('annotate');
    l.button(/change permission/i).click();
    await settle();

    expect(l.select().value).toBe('view-only');
    l.unmount();
  });

  it('shows the new permission once the update succeeded, and sends it once', async () => {
    let finish!: () => void;
    updateSharePermissions.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const l = await mountList();
    await l.choose('annotate');
    l.button(/change permission/i).click();
    l.button(/change permission/i)?.click();
    finish();
    await settle();

    expect(updateSharePermissions).toHaveBeenCalledTimes(1);
    expect(l.select().value).toBe('annotate');
    l.unmount();
  });
});
