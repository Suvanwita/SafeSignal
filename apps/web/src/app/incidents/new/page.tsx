import { IncidentCreateView } from '@/components/incidents/incident-create-view';
import { requireServerSession } from '@/lib/auth/server-api';
import { getServerOfficialAccounts } from '@/lib/identity/server-identity';
import { getServerSuspiciousProfiles } from '@/lib/intelligence/server-intelligence';

export const dynamic = 'force-dynamic';

export default async function NewIncidentPage() {
  const user = await requireServerSession('/incidents/new');

  const [officialAccounts, suspiciousProfiles] = await Promise.all([
    getServerOfficialAccounts(),
    getServerSuspiciousProfiles(),
  ]);

  return (
    <IncidentCreateView
      user={user}
      officialAccounts={officialAccounts ?? []}
      suspiciousProfiles={suspiciousProfiles ?? []}
    />
  );
}
