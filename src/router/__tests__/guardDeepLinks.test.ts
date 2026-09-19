// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/composables/useSupabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
    },
  },
}));
const stubView = { default: { render: () => null } };
vi.mock('../../views/DashboardView.vue', () => stubView);
vi.mock('../../views/EditorView.vue', () => stubView);
vi.mock('../../views/LoginView.vue', () => stubView);

import router from '@/router';

describe('router guard deep links', () => {
  beforeEach(() => sessionStorage.clear());

  it('lets the user go back to the dashboard after an ?outputVideo= link', async () => {
    await router.push('/?outputVideo=abc123');
    expect(router.currentRoute.value.name).toBe('editor-single');
    // EditorView consumes the stash once it has loaded the output video.
    sessionStorage.removeItem('pendingOutputVideo');

    await router.push({ name: 'dashboard' });

    expect(router.currentRoute.value.name).toBe('dashboard');
    expect(sessionStorage.getItem('pendingOutputVideo')).toBeNull();
  });

  it('lets the user go back to the dashboard after a ?share= link', async () => {
    await router.push('/?share=vid1');
    expect(router.currentRoute.value.name).toBe('editor-single');

    await router.push({ name: 'dashboard' });

    expect(router.currentRoute.value.name).toBe('dashboard');
  });
});
