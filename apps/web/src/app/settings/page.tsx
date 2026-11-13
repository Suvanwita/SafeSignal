import type { Metadata } from 'next';
import { SettingsView } from '@/components/settings/settings-view';
import { requireServerSession } from '@/lib/auth/server-api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Settings — SafeSignal',
};

export default async function SettingsPage() {
  const user = await requireServerSession('/settings');
  return <SettingsView user={user} />;
}
