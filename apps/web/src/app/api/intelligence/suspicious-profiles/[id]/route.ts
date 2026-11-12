import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBackendRequest(
    request,
    `/intelligence/suspicious-profiles/${encodeURIComponent(id)}`,
    {
      method: 'GET',
      wrapDataKey: 'profile',
      fallbackErrorCode: 'INTELLIGENCE_REQUEST_FAILED',
      fallbackErrorMessage: 'Unable to load suspicious profile details.',
    },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBackendRequest(
    request,
    `/intelligence/suspicious-profiles/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      requireCsrf: true,
      fallbackErrorCode: 'INTELLIGENCE_REQUEST_FAILED',
      fallbackErrorMessage: 'Unable to delete suspicious profile report.',
    },
  );
}
