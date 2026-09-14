function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Add it to .env.local or Vercel Project Settings > Environment Variables.`);
  }
  return value;
}

export function getSupabasePublicEnv() {
  return {
    url: requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  };
}

export function getSupabaseAdminEnv() {
  return {
    url: requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    serviceRoleKey: requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  };
}