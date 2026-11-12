import type { Metadata } from 'next';
import { IntelligenceView } from '@/components/intelligence/intelligence-view';
import { requireServerSession } from '@/lib/auth/server-api';
import { getServerOfficialAccounts } from '@/lib/identity/server-identity';
import { getServerSuspiciousProfiles } from '@/lib/intelligence/server-intelligence';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Suspicious Profiles & Intelligence — SafeSignal',
};

export default async function IntelligencePage() {
  const [user, initialProfiles, officialAccounts] = await Promise.all([
    requireServerSession('/intelligence'),
    getServerSuspiciousProfiles(),
    getServerOfficialAccounts(),
  ]);

  return (
    <IntelligenceView
      user={user}
      initialProfiles={initialProfiles}
      officialAccountCount={officialAccounts?.length ?? 0}
    />
  );
}
