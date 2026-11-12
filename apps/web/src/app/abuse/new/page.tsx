import { NewReportForm } from '@/components/abuse/new-report-form';
import { getServerIncidents } from '@/lib/abuse/server-abuse';
import { requireServerSession } from '@/lib/auth/server-api';

export const dynamic = 'force-dynamic';

export default async function NewAbuseReportPage() {
  const user = await requireServerSession('/abuse/new');
  const incidents = await getServerIncidents();

  return <NewReportForm user={user} incidents={incidents} />;
}
