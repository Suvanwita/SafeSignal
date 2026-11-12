import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBackendRequest(
    request,
    `/incidents/${encodeURIComponent(id)}/reopen`,
    {
      method: 'POST',
      requireCsrf: true,
      includeBody: true,
      wrapDataKey: 'incident',
      fallbackErrorCode: 'INCIDENT_REQUEST_FAILED',
      fallbackErrorMessage: 'Unable to reopen incident.',
    },
  );
}
