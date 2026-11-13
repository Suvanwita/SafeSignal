import { notFound } from 'next/navigation';
import { EvidenceDetailView } from '@/components/evidence/evidence-detail-view';
import { getServerAbuseReportById } from '@/lib/abuse/server-abuse';
import { requireServerSession } from '@/lib/auth/server-api';
import { getServerEvidenceById } from '@/lib/evidence/server-evidence';
import { getServerIncidentById } from '@/lib/incidents/server-incidents';

export const dynamic = 'force-dynamic';

interface EvidenceDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function EvidenceDetailPage({
  params,
}: EvidenceDetailPageProps) {
  const { id } = await params;
  const user = await requireServerSession(`/evidence/${id}`);

  const evidence = await getServerEvidenceById(id);
  if (!evidence) {
    notFound();
  }

  const [incidentRes, abuseReportRes] = await Promise.all([
    evidence.incidentId
      ? getServerIncidentById(evidence.incidentId)
      : Promise.resolve({ incident: null }),
    evidence.abuseReportId
      ? getServerAbuseReportById(evidence.abuseReportId)
      : Promise.resolve({ report: null }),
  ]);

  return (
    <EvidenceDetailView
      user={user}
      evidence={evidence}
      incidentTitle={incidentRes.incident?.title}
      abuseReportTitle={abuseReportRes.report?.title}
    />
  );
}
