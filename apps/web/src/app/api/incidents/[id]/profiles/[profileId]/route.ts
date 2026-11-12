import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; profileId: string }> },
) {
  const { id, profileId } = await params;
  return proxyBackendRequest(
    request,
    `/incidents/${encodeURIComponent(id)}/profiles/${encodeURIComponent(profileId)}`,
    {
      method: 'DELETE',
      requireCsrf: true,
      wrapDataKey: 'incident',
      fallbackErrorCode: 'INCIDENT_REQUEST_FAILED',
      fallbackErrorMessage: 'Unable to unlink suspicious profile.',
    },
  );
}
