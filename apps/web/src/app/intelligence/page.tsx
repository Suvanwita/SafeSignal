import type { Metadata } from 'next';
import { IntelligenceView } from '@/components/intelligence/intelligence-view';
import { requireServerSession } from '@/lib/auth/server-api';
import { getServerOfficialAccounts } from '@/lib/identity/server-identity';
import { getServerIncidents } from '@/lib/incidents/server-incidents';
import { getServerSuspiciousProfiles } from '@/lib/intelligence/server-intelligence';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Suspicious Profiles & Intelligence — SafeSignal',
};

export default async function IntelligencePage() {
  const [user, initialProfiles, officialAccounts, incidents] = await Promise.all([
    requireServerSession('/intelligence'),
    getServerSuspiciousProfiles(),
    getServerOfficialAccounts(),
    getServerIncidents(),
  ]);

  return (
    <IntelligenceView
      user={user}
      initialProfiles={initialProfiles}
      officialAccountCount={officialAccounts?.length ?? 0}
      incidents={incidents}
    />
  );
}
