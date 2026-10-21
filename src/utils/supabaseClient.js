import { createClient } from '@supabase/supabase-js';

const env = (typeof import.meta !== 'undefined' && import.meta?.env)
  ? import.meta.env
  : (typeof process !== 'undefined' && process?.env ? process.env : {});

const supabaseUrl = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

if (isSupabaseConfigured) {
  console.log('✅ Supabase Collaborative Mode is ACTIVE!');
} else {
  console.log('⚠️ Supabase credentials missing. Running in local IndexedDB mode.');
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
