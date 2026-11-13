import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ incidentId: string }> },
) {
  const { incidentId } = await params;
  return proxyBackendRequest(
    request,
    `/privacy/scan-incident/${encodeURIComponent(incidentId)}`,
    {
      method: 'POST',
      requireCsrf: true,
      includeBody: false,
      fallbackErrorCode: 'PRIVACY_SCAN_FAILED',
      fallbackErrorMessage: 'Unable to run privacy scan on incident case.',
    },
  );
}
