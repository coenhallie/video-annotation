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
  const isAuthenticated = !!session?.user;
  
  // Check for share URL
  // Note: We use window.location because usage of 'to' might be complex if params are query based
  // But ShareService.parseShareUrl uses window.location.search and hash
  // We can let it run.
  const shareInfo = ShareService.parseShareUrl();
  const isSharedLink = !!(shareInfo.type && shareInfo.id);

  if (to.name === 'login') {
    if (isAuthenticated) {
      next({ name: 'dashboard' });
    } else {
      next();
    }
    return;
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
