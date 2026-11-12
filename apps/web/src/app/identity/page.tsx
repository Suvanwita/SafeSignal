import type { Metadata } from 'next';
import { IdentityView } from '@/components/identity/identity-view';
import { requireServerSession } from '@/lib/auth/server-api';
import { getServerOfficialAccounts } from '@/lib/identity/server-identity';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Identity Protection — SafeSignal',
};

export default async function IdentityPage() {
  const [user, initialAccounts] = await Promise.all([
    requireServerSession('/identity'),
    getServerOfficialAccounts(),
  ]);

  return <IdentityView user={user} initialAccounts={initialAccounts} />;
}
