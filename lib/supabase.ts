import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ---------- TYPES ----------
export type Role = 'manager' | 'staff';

export interface Profile {
  id: string; auth_user_id: string; full_name: string;
  staff_id: string; email: string; role: Role;
  status: 'active' | 'disabled'; created_at: string;
}
export interface Category { id: string; name: string; description: string | null; }
export interface Product {
  id: string; category_id: string | null; name: string;
  sku: string | null; unit: string;
  cost_price: number; selling_price: number;
  stock_quantity: number; low_stock_threshold: number;
  image_path: string | null; active: boolean;
}
export interface CartItem { product: Product; quantity: number; }
export interface Sale {
  id: string; receipt_number: string; staff_id: string;
  subtotal: number; discount: number; total: number;
  payment_method: string; created_at: string;
  staff?: { full_name: string };
}

// ---------- CLIENTS ----------
export function createClient() {
  return createBrowserClient(URL, ANON);
}

export function createServerSupabase() {
  const store = cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cs) => { try { cs.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {} },
    },
  });
}

export function createAdminSupabase() {
  return createAdminClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------- AUTH ----------
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('auth_user_id', user.id).single();
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