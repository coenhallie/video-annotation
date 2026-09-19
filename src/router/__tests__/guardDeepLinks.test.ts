// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/composables/useSupabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: signedIn ? { user: { id: 'u1' } } : null },
      }),
    },
  },
}));
let signedIn = true;
const stubView = { default: { render: () => null } };
vi.mock('../../views/DashboardView.vue', () => stubView);
vi.mock('../../views/EditorView.vue', () => stubView);
vi.mock('../../views/LoginView.vue', () => stubView);

import router from '@/router';

describe('router guard deep links', () => {
  beforeEach(() => {
    sessionStorage.clear();
    signedIn = true;
    // The local .env turns the dev auth bypass on, which would sign everyone in.
    vi.stubEnv('VITE_DEV_AUTH_BYPASS', 'false');
  });

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

  // Login is a full-page round trip through Keycloak that always comes back to
  // the site root, so the page the visitor was sent away from has to be kept
  // somewhere that survives it.
  it('returns to the page a signed-out visitor asked for, once, after login', async () => {
    signedIn = false;
    await router.push('/video/abc123?t=42');
    expect(router.currentRoute.value.name).toBe('login');

    signedIn = true;
    await router.push('/');

    expect(router.currentRoute.value.fullPath).toBe('/video/abc123?t=42');

    await router.push('/');
    expect(router.currentRoute.value.name).toBe('dashboard');
  });

  it('never follows a stored path that leaves the site', async () => {
    await router.push('/video/somewhere'); // so the push below is a real navigation
    sessionStorage.setItem('postLoginPath', '//evil.example/steal');
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('dashboard');
    expect(sessionStorage.getItem('postLoginPath')).toBeNull();
  });
});
