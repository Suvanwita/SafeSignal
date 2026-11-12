import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBackendRequest(request, `/incidents/${encodeURIComponent(id)}`, {
    method: 'GET',
    wrapDataKey: 'incident',
    fallbackErrorCode: 'INCIDENT_REQUEST_FAILED',
    fallbackErrorMessage: 'Unable to load incident details.',
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBackendRequest(request, `/incidents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    requireCsrf: true,
    includeBody: true,
    wrapDataKey: 'incident',
    fallbackErrorCode: 'INCIDENT_REQUEST_FAILED',
    fallbackErrorMessage: 'Unable to update incident.',
  });
}
