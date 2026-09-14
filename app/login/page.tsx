import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/supabase-server';
import { LoginForm } from '@/components/App';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const profile = await getCurrentProfile();
  if (profile) redirect('/app');

  return (
    <div className="min-h-screen bg-[#efefef] p-3 sm:p-5 lg:p-8">
      <div className="mx-auto flex max-w-[1260px] overflow-hidden rounded-[30px] bg-white shadow-[0_24px_60px_rgba(0,0,0,0.08)] ring-1 ring-[#f1f1f1]">
        <div className="flex flex-1 items-center justify-center p-6 sm:p-8 lg:p-12">
          <div className="w-full max-w-[420px]">
            <div className="mb-10 flex items-center gap-3">
              <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0">
                <path d="M20 2L4 11v18l16 9 16-9V11L20 2z" fill="#F57C32" />
                <path d="M20 6L8 13v14l12 7 12-7V13L20 6z" fill="#fff" />
                <path d="M22 12l-8 10h5l-1 8 8-10h-5l1-8z" fill="#F57C32" />
              </svg>
              <div>
                <div className="text-[19px] font-extrabold leading-none tracking-tight">OPK <span className="text-brand-500">HARDWARE</span></div>
                <div className="mt-1 text-[11px] font-medium text-gray-500">Build Better • Stronger • Together</div>
              </div>
            </div>

            <h1 className="mb-2 text-[2.2rem] font-extrabold tracking-[-0.04em] text-[#1f1f1f]">Welcome Back!</h1>
            <p className="mb-8 text-sm text-gray-500">Sign in to your OPK Hardware account</p>

            <Suspense fallback={<div className="h-64" />}>
              <LoginForm />
            </Suspense>
          </div>
        </div>

        <div className="relative hidden w-[52%] min-h-[760px] lg:block">
          <img
            src="https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=1200&q=80"
            alt="OPK Hardware"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />
          <div className="absolute right-8 top-8 rounded-xl bg-[#1a1a1a]/85 px-4 py-3 text-white shadow-[0_15px_30px_rgba(0,0,0,0.22)]">
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 40 40" className="h-8 w-8 shrink-0">
                <path d="M20 2L4 11v18l16 9 16-9V11L20 2z" fill="#F57C32" />
                <path d="M20 6L8 13v14l12 7 12-7V13L20 6z" fill="#fff" />
                <path d="M22 12l-8 10h5l-1 8 8-10h-5l1-8z" fill="#F57C32" />
              </svg>
              <div>
                <div className="text-[15px] font-black leading-none">OPK</div>
                <div className="text-[10px] uppercase tracking-tight text-orange-200">Hardware</div>
              </div>
            </div>
            <div className="mt-2 text-right text-[11px] font-medium text-orange-200 leading-snug">Quality Materials<br />for Every Project</div>
          </div>
        </div>
      </div>
    </div>
  );
}