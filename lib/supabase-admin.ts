import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdminEnv } from './env';

export function createAdminSupabase() {
  const { url, serviceRoleKey } = getSupabaseAdminEnv();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
