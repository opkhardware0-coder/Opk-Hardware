'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { createClient } from '@/lib/supabase/client';
import { UserRole } from '@/types';

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const getUserRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('auth_user_id', session.user.id)
        .single();
      if (profile) {
        setRole(profile.role as UserRole);
      } else {
        router.push('/login');
      }
      setLoading(false);
    };
    getUserRole();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!role) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar userRole={role} />
      <div className="lg:ml-64 min-h-screen">
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}