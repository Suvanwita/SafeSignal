import { IncidentHistoryView } from '@/components/incidents/incident-history-view';
import { requireServerSession } from '@/lib/auth/server-api';
import { getServerIncidents } from '@/lib/incidents/server-incidents';

export const dynamic = 'force-dynamic';

export default async function IncidentsPage() {
  const user = await requireServerSession('/incidents');
  const incidents = await getServerIncidents();

  return <IncidentHistoryView user={user} initialIncidents={incidents} />;
}
