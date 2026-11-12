import type { Metadata } from 'next';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { requireServerSession } from '@/lib/auth/server-api';
import { getServerDashboardOverview } from '@/lib/dashboard/server-dashboard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard — SafeSignal',
};

export default async function DashboardPage() {
  const [user, initialOverview] = await Promise.all([
    requireServerSession('/dashboard'),
    getServerDashboardOverview(),
  ]);

  return <DashboardView user={user} initialOverview={initialOverview} />;
}
