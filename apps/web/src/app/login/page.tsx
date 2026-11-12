import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { LoadingState } from '@/components/ui/loading-state';
import { getServerSession } from '@/lib/auth/server-api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in — SafeSignal',
};

export default async function LoginPage() {
  const user = await getServerSession();
  if (user) {
    redirect('/dashboard');
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <LoadingState label="Loading SafeSignal sign-in..." />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
