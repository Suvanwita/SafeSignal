import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBackendRequest(
    request,
    `/intelligence/suspicious-profiles/${encodeURIComponent(id)}/analyze`,
    {
      method: 'POST',
      requireCsrf: true,
      wrapDataKey: 'profile',
      fallbackErrorCode: 'INTELLIGENCE_REQUEST_FAILED',
      fallbackErrorMessage: 'Unable to re-run similarity analysis.',
    },
  );
}
