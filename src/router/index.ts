import { createRouter, createWebHistory } from 'vue-router';
import { supabase } from '@/composables/useSupabase';
import { ShareService } from '@/services/shareService';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
    },
    {
      path: '/video/:id',
      name: 'editor-single',
      component: () => import('../views/EditorView.vue'),
    },
    {
      path: '/comparison/:id',
      name: 'editor-dual',
      component: () => import('../views/EditorView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
    },
    // Catch all
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
});

router.beforeEach(async (to, from, next) => {
  // Check auth state
  const { data: { session } } = await supabase.auth.getSession();
  // DEV-ONLY: treat as authenticated when the local bypass flag is set. Compile-time
  // dead in production (`import.meta.env.DEV` is false in `vite build`) and requires
  // the explicit VITE_DEV_AUTH_BYPASS flag (local, gitignored .env). See useAuth.ts.
  const devAuthBypass =
    import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';
  const isAuthenticated = !!session?.user || devAuthBypass;

  // Check for share URL
  // Note: We use window.location because usage of 'to' might be complex if params are query based
  // But ShareService.parseShareUrl uses window.location.search and hash
  // We can let it run.
  const shareInfo = ShareService.parseShareUrl();
  const isSharedLink = !!(shareInfo.type && shareInfo.id);

  // Check for AWS project link - store in sessionStorage so it survives auth redirects
  const params = new URLSearchParams(window.location.search);
  const outputVideo = params.get('outputVideo');
  if (outputVideo) {
    sessionStorage.setItem('pendingOutputVideo', outputVideo);
  }

  if (to.name === 'login') {
    if (isAuthenticated) {
      next({ name: 'dashboard' });
    } else {
      next();
    }
    return;
  }

  // Deep-link redirect: the dashboard home (route '/') renders the library, which
  // has no share/AWS handling — that logic lives in EditorView.onMounted. When a
  // share or AWS deep-link lands on the dashboard, redirect to the editor route so
  // EditorView mounts and reads window.location.search. We preserve `to.query` so
  // the query string survives the redirect.
  //
  // No infinite loop: this block is gated on `to.name === 'dashboard'`. After the
  // redirect the guard re-runs with `to.name` = 'editor-single'/'editor-dual', so
  // this block is skipped.
  if (to.name === 'dashboard') {
    // Share links are allowed even when unauthenticated (isSharedLink gate below).
    if (shareInfo.type === 'video' && shareInfo.id) {
      next({ name: 'editor-single', params: { id: shareInfo.id }, query: to.query });
      return;
    } else if (shareInfo.type === 'comparison' && shareInfo.id) {
      next({ name: 'editor-dual', params: { id: shareInfo.id }, query: to.query });
      return;
    } else if (isAuthenticated) {
      // AWS videos require a logged-in user (loadOutputVideo needs `user`). When not
      // authenticated we deliberately fall through to the access check below, which
      // sends the user to login; pendingOutputVideo is already stashed and survives
      // the OAuth round-trip.
      const awsId = outputVideo || sessionStorage.getItem('pendingOutputVideo');
      if (awsId) {
        next({ name: 'editor-single', params: { id: awsId }, query: to.query });
        return;
      }
    }
  }

  // Determine if we can access dashboard
  // Access if: Authenticated OR Shared Link
  if (isAuthenticated || isSharedLink) {
    next();
  } else {
    next({ name: 'login' });
  }
});

export default router;
