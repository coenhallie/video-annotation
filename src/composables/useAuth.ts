import { ref, computed, readonly } from 'vue';
import { supabase } from './useSupabase';
import { useNotifications } from './useNotifications';

const user = ref(null);
const session = ref(null);
const isLoading = ref(true);

export function useAuth() {
  const { success, error: notifyError, info } = useNotifications();
  const isAuthenticated = computed(() => !!user.value);

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      success('Welcome back!', 'You have successfully signed in.');
      return data;
    } catch (error) {
      notifyError(
        'Sign in failed',
        error.message || 'Please check your credentials and try again.'
      );
      throw error;
    }
  };

  const signUp = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;

      // Check if email confirmation is required
      if (data.user && !data.session) {
        info(
          'Check your email',
          'We sent you a confirmation link. Please check your email and click the link to verify your account.',
          10000 // Show for 10 seconds
        );
      } else {
        success('Account created!', 'Welcome to the platform.');
      }

      return data;
    } catch (error) {
      notifyError('Sign up failed', error.message || 'Please try again.');
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // Clear local state immediately
    session.value = null;
    user.value = null;

    // Clear any video state to ensure clean separation between users
    // This will be handled by the App.vue component watching for user changes
  };

  // Initialize auth state
  const initAuth = async () => {
    try {
      isLoading.value = true;
      console.log('🔐 [Auth] Initializing authentication...');

      const {
        data: { session: currentSession },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error('🚨 [Auth] Error getting session:', error);
        throw error;
      }

      session.value = currentSession;
      user.value = currentSession?.user ?? null;

      console.log('🔐 [Auth] Session retrieved:', {
        hasSession: !!currentSession,
        userId: currentSession?.user?.id,
        userEmail: currentSession?.user?.email,
      });

      // Listen for auth changes
      supabase.auth.onAuthStateChange((event, newSession) => {
        console.log('🔐 [Auth] Auth state changed:', event, {
          hasSession: !!newSession,
          userId: newSession?.user?.id,
          userEmail: newSession?.user?.email,
        });

        session.value = newSession;
        user.value = newSession?.user ?? null;

        // Handle specific events
        if (event === 'SIGNED_OUT') {
          console.log('🔐 [Auth] User signed out');
        } else if (event === 'SIGNED_IN') {
          console.log('🔐 [Auth] User signed in');
        } else if (event === 'TOKEN_REFRESHED') {
          console.log('🔐 [Auth] Token refreshed');
        }
      });
    } catch (error) {
      console.error('🚨 [Auth] Failed to initialize auth:', error);
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
    signIn,
    signUp,
    signOut,
    initAuth,
  };
}
