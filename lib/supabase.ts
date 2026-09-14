export type { Role, Profile, Category, Product, CartItem, Sale } from './supabase-client';
export { createClient } from './supabase-client';
export { createServerSupabase, getCurrentProfile, requireAuth } from './supabase-server';
export { createAdminSupabase } from './supabase-admin';