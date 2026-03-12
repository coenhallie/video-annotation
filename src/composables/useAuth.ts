import { ref, computed, readonly } from 'vue';
import type { Ref } from 'vue';
import { supabase } from './useSupabase';
import { useNotifications } from './useNotifications';
import type { User, Session } from '@supabase/supabase-js';

const user: Ref<User | null> = ref(null);
const session: Ref<Session | null> = ref(null);
const isLoading = ref(true);

export function useAuth() {
  const { error: notifyError } = useNotifications();
  const isAuthenticated = computed(() => !!user.value);

  const signInWithSSO = async () => {
    try {
      // Preserve outputVideo param through the OAuth redirect
      let redirectTo = window.location.origin;
      const pendingOutputVideo = sessionStorage.getItem('pendingOutputVideo');
      if (pendingOutputVideo) {
        redirectTo = `${window.location.origin}?outputVideo=${encodeURIComponent(pendingOutputVideo)}`;
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'keycloak',
        options: {
          scopes: 'openid email profile',
          redirectTo,
        },
      });
      console.log('🔐 [useAuth] Redirect URL:', redirectTo);
      if (error) throw error;
      return data;
    } catch (error: unknown) {
      notifyError(
        'Login failed',
        error instanceof Error ? error.message : 'Unable to redirect to Keycloak login.'
      );
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    // Clear local state immediately
    session.value = null;
    user.value = null;

    // Redirect to Keycloak Logout
    const keycloakUrl = import.meta.env.VITE_KEYCLOAK_REALM_URL;
    const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID;
    
    if (keycloakUrl && clientId) {
      const logoutUrl = `${keycloakUrl}/protocol/openid-connect/logout?post_logout_redirect_uri=${encodeURIComponent(
        window.location.origin
      )}&client_id=${clientId}`;
      window.location.href = logoutUrl;
    }
  };

  // Initialize auth state
  const initAuth = async () => {
    try {
      isLoading.value = true;

      const {
        data: { session: currentSession },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      session.value = currentSession;
      user.value = currentSession?.user ?? null;

      // Listen for auth changes
      supabase.auth.onAuthStateChange((event, newSession) => {
        console.log('🔐 [useAuth] Auth state change:', {
          event,
          newSession: newSession
            ? {
                user: newSession.user
                  ? {
                      id: newSession.user.id,
                      email: newSession.user.email,
                    }
                  : null,
                access_token: newSession.access_token ? 'present' : 'missing',
              }
            : null,
        });

        session.value = newSession;
        user.value = newSession?.user ?? null;
      });
    } catch (error) {
      session.value = null;
      user.value = null;
    } finally {
      isLoading.value = false;
    }
  };

  return {
    user: readonly(user),
    session: readonly(session),
    isAuthenticated,
    isLoading: readonly(isLoading),
    signInWithSSO,
    signOut,
    initAuth,
  };
}
