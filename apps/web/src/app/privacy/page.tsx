import { PrivacyScannerView } from '@/components/privacy/privacy-scanner-view';
import { requireServerSession } from '@/lib/auth/server-api';

export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
  const user = await requireServerSession('/privacy');

  return <PrivacyScannerView user={user} />;
}
