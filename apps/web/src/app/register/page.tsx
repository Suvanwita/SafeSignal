import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/auth/register-form';
import { getServerSession } from '@/lib/auth/server-api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create Account — SafeSignal',
};

export default async function RegisterPage() {
  const user = await getServerSession();
  if (user) {
    redirect('/dashboard');
  }

  return <RegisterForm />;
}
