import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBackendRequest(
    request,
    `/evidence/${encodeURIComponent(id)}/metadata`,
    {
      method: 'GET',
      fallbackErrorCode: 'EVIDENCE_METADATA_FAILED',
      fallbackErrorMessage: 'Unable to load evidence metadata.',
    },
  );
}
