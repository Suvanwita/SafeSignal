import { AbuseHistoryView } from '@/components/abuse/abuse-history-view';
import {
  getServerAbuseReports,
  getServerIncidents,
} from '@/lib/abuse/server-abuse';
import { requireServerSession } from '@/lib/auth/server-api';

export const dynamic = 'force-dynamic';

export default async function AbuseHistoryPage() {
  const user = await requireServerSession('/abuse');
  const [initialReports, incidents] = await Promise.all([
    getServerAbuseReports(),
    getServerIncidents(),
  ]);

  return (
    <AbuseHistoryView
      user={user}
      initialReports={initialReports}
      incidents={incidents}
    />
  );
}
