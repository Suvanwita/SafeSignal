import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBackendRequest(
    request,
    `/evidence/${encodeURIComponent(id)}/download-token`,
    {
      method: 'POST',
      requireCsrf: true,
      fallbackErrorCode: 'DOWNLOAD_TOKEN_FAILED',
      fallbackErrorMessage: 'Unable to issue evidence download authorization token.',
    },
  );
}
