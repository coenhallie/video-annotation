import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Session cache to reduce excessive calls
let sessionCache = null;
let sessionCacheTime = 0;
const SESSION_CACHE_DURATION = 5000; // 5 seconds

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'supabase.auth.token',
    // Reduce debug logging in production
    debug: false,
  },
});

// Optimized session getter with caching
export const getOptimizedSession = async () => {
  const now = Date.now();

  // Return cached session if still valid
  if (sessionCache && now - sessionCacheTime < SESSION_CACHE_DURATION) {
    return sessionCache;
  }

  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (!error) {
      sessionCache = session;
      sessionCacheTime = now;
    }

    return session;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
};

// Clear session cache when auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  sessionCache = session;
  sessionCacheTime = Date.now();
});

// Add some debugging for browser-specific issues (only in development)
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 [useSupabase] Supabase client initialized:', {
    url: supabaseUrl,
    userAgent: navigator.userAgent,
    isChrome: navigator.userAgent.includes('Chrome'),
    isSafari:
      navigator.userAgent.includes('Safari') &&
      !navigator.userAgent.includes('Chrome'),
    localStorage: {
      available: typeof window.localStorage !== 'undefined',
      supabaseToken: window.localStorage.getItem('supabase.auth.token')
        ? 'present'
        : 'missing',
    },
  });
}
