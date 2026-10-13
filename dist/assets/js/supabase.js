// Single shared Supabase client. Uses ONLY the publishable anon key injected at build time (env.js).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const env = window.__OPK_ENV__ || {};
export const isConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);

export const supabase = isConfigured
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
