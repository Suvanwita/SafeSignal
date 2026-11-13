import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBackendRequest(
    request,
    `/evidence/${encodeURIComponent(id)}/verify`,
    {
      method: 'POST',
      requireCsrf: true,
      fallbackErrorCode: 'VERIFICATION_FAILED',
      fallbackErrorMessage: 'Unable to verify evidence integrity.',
    },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBackendRequest(
    request,
    `/evidence/${encodeURIComponent(id)}/verify`,
    {
      method: 'GET',
      fallbackErrorCode: 'VERIFICATION_FAILED',
      fallbackErrorMessage: 'Unable to verify evidence integrity.',
    },
  );
}
