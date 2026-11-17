import { createClient } from '@supabase/supabase-js';

const runtimeEnv = (typeof window !== 'undefined' && (window as any).__ENV__) || {};

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  runtimeEnv.VITE_SUPABASE_URL ||
  'https://placeholder.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  runtimeEnv.VITE_SUPABASE_ANON_KEY ||
  'placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

