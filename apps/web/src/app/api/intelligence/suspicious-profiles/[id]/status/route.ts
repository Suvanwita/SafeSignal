import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBackendRequest(
    request,
    `/intelligence/suspicious-profiles/${encodeURIComponent(id)}/status`,
    {
      method: 'PATCH',
      requireCsrf: true,
      includeBody: true,
      wrapDataKey: 'profile',
      fallbackErrorCode: 'INTELLIGENCE_REQUEST_FAILED',
      fallbackErrorMessage: 'Unable to update manual review status.',
    },
  );
}
