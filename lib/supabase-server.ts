import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabasePublicEnv } from './env';

export type Role = 'manager' | 'staff';

export interface Profile {
  id: string;
  auth_user_id: string;
  full_name: string;
  staff_id: string;
  email: string;
  role: Role;
  status: 'active' | 'disabled';
  created_at: string;
}

export function createServerSupabase() {
  const { url, anonKey } = getSupabasePublicEnv();
  const store = cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cs: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => {
        try {
          cs.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {}
      },
    },
  });
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();

  return (data as Profile) ?? null;
}

export async function requireAuth(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.status === 'disabled') {
    await createServerSupabase().auth.signOut();
    redirect('/login?error=disabled');
  }
  return profile;
}
