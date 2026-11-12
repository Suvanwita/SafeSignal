import { EvidenceVaultView } from '@/components/evidence/evidence-vault-view';
import { requireServerSession } from '@/lib/auth/server-api';
import { getServerEvidence } from '@/lib/evidence/server-evidence';
import { getServerIncidents } from '@/lib/incidents/server-incidents';

export const dynamic = 'force-dynamic';

export default async function EvidencePage() {
  const user = await requireServerSession('/evidence');
  const [evidence, incidents] = await Promise.all([
    getServerEvidence(),
    getServerIncidents(),
  ]);

  return (
    <EvidenceVaultView
      user={user}
      initialEvidence={evidence}
      incidents={incidents.map((inc) => ({ id: inc.id, title: inc.title }))}
    />
  );
}
