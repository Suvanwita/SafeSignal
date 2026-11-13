import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const qs = request.nextUrl.search;
  return proxyBackendRequest(
    request,
    `/incidents/${encodeURIComponent(id)}/timeline${qs}`,
    {
      method: 'GET',
      fallbackErrorCode: 'TIMELINE_FETCH_FAILED',
      fallbackErrorMessage: 'Unable to load incident timeline.',
    },
  );
}
