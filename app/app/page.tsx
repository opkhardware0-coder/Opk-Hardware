import { requireAuth } from '@/lib/supabase-server';
import App from '@/components/App';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const profile = await requireAuth();
  return <App profile={profile} />;
}