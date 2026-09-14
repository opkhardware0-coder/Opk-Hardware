import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/supabase';
import { LoginForm } from '@/components/App';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const profile = await getCurrentProfile();
  if (profile) redirect('/app');

  return (
    <div className="min-h-screen flex bg-gray-50">
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-10">
            <svg viewBox="0 0 40 40" className="w-10 h-10">
              <path d="M20 2L4 11v18l16 9 16-9V11L20 2z" fill="#F97316" />
              <path d="M20 6L8 13v14l12 7 12-7V13L20 6z" fill="#fff" />
              <path d="M22 12l-8 10h5l-1 8 8-10h-5l1-8z" fill="#F97316" />
            </svg>
            <div>
              <div className="font-extrabold text-xl leading-none">OPK <span className="text-brand-500">HARDWARE</span></div>
              <div className="text-[11px] text-gray-500 mt-1">Build Better • Stronger • Together</div>
            </div>
          </div>
          <h1 className="text-3xl font-extrabold mb-2">Welcome Back!</h1>
          <p className="text-sm text-gray-500 mb-8">Sign in to your OPK Hardware account</p>
          <Suspense fallback={<div className="h-64" />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
      <div className="hidden lg:block lg:w-1/2 relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=1200&q=80"
          alt="OPK Hardware"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute bottom-8 left-8 right-8 text-white">
          <p className="text-sm font-semibold">Quality Materials</p>
          <p className="text-xs opacity-90">for Every Project</p>
        </div>
      </div>
    </div>
  );
}