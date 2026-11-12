import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string }> },
) {
  const { id, reportId } = await params;
  return proxyBackendRequest(
    request,
    `/incidents/${encodeURIComponent(id)}/reports/${encodeURIComponent(reportId)}`,
    {
      method: 'DELETE',
      requireCsrf: true,
      wrapDataKey: 'incident',
      fallbackErrorCode: 'INCIDENT_REQUEST_FAILED',
      fallbackErrorMessage: 'Unable to unlink abuse report.',
    },
  );
}
