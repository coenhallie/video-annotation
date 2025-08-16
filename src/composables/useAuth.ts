import { ref, computed, readonly } from 'vue';
import type { Ref } from 'vue';
import { supabase } from './useSupabase';
import { useNotifications } from './useNotifications';
import type { User, Session } from '@supabase/supabase-js';

const user: Ref<User | null> = ref(null);
const session: Ref<Session | null> = ref(null);
const isLoading = ref(true);

export function useAuth() {
  const { success, error: notifyError, info } = useNotifications();
  const isAuthenticated = computed(() => !!user.value);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      success('Welcome back!', 'You have successfully signed in.');
      return data;
    } catch (error: any) {
      notifyError(
        'Sign in failed',
        error?.message || 'Please check your credentials and try again.'
      );
      throw error;
    }
  };

  const signUp = async (email: string, password: string) => {
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
    } catch (error: any) {
      notifyError('Sign up failed', error?.message || 'Please try again.');
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

  const resetPasswordForEmail = async (email: string) => {
    try {
      // Use the base URL without any hash - Supabase will append its own
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      });

      if (error) throw error;

      info(
        'Check your email',
        'We sent you a password reset link. Please check your email and click the link to reset your password.',
        10000 // Show for 10 seconds
      );

      return data;
    } catch (error: any) {
      notifyError(
        'Password reset failed',
        error?.message ||
          'Unable to send password reset email. Please try again.'
      );
      throw error;
    }
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      success(
        'Password updated!',
        'Your password has been successfully updated.'
      );
      return data;
    } catch (error: any) {
      notifyError(
        'Password update failed',
        error?.message || 'Unable to update password. Please try again.'
      );
      throw error;
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

      // Check if this is a recovery session
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const type = hashParams.get('type');
      const isRecoverySession =
        type === 'recovery' || sessionStorage.getItem('recovery_token');

      // Don't set user if it's a recovery session
      if (!isRecoverySession) {
        session.value = currentSession;
        user.value = currentSession?.user ?? null;
      }

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
          userAgent: navigator.userAgent,
        });

        // Don't update user state if it's a PASSWORD_RECOVERY event
        if (event !== 'PASSWORD_RECOVERY') {
          session.value = newSession;
          user.value = newSession?.user ?? null;
        }

        console.log('🔐 [useAuth] Updated state:', {
          userId: user.value?.id,
          isAuthenticated: !!user.value,
          userAgent: navigator.userAgent,
        });

        // Handle specific events
        if (event === 'SIGNED_OUT') {
        } else if (
          event === 'SIGNED_IN' &&
          !sessionStorage.getItem('recovery_token')
        ) {
          // Only process SIGNED_IN if not in recovery mode
        } else if (event === 'TOKEN_REFRESHED') {
        } else if (event === 'PASSWORD_RECOVERY') {
          // Don't auto-login on password recovery
          console.log(
            '🔐 [useAuth] Password recovery event - not auto-logging in'
          );
        }
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
    signIn,
    signUp,
    signOut,
    resetPasswordForEmail,
    updatePassword,
    initAuth,
  };
}
