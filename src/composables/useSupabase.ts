import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'supabase.auth.token',
    // Add debug logging for Chrome-specific issues
    debug: process.env.NODE_ENV === 'development',
  },
});

// Add some debugging for browser-specific issues
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
