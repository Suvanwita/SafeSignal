import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBackendRequest(
    request,
    `/abuse/reports/${encodeURIComponent(id)}`,
    {
      method: 'GET',
      wrapDataKey: 'report',
      fallbackErrorCode: 'ABUSE_REQUEST_FAILED',
      fallbackErrorMessage: 'Unable to load abuse report details.',
    },
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBackendRequest(
    request,
    `/abuse/reports/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      requireCsrf: true,
      includeBody: true,
      wrapDataKey: 'report',
      fallbackErrorCode: 'ABUSE_REQUEST_FAILED',
      fallbackErrorMessage: 'Unable to update abuse report.',
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
    `/abuse/reports/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      requireCsrf: true,
      fallbackErrorCode: 'ABUSE_REQUEST_FAILED',
      fallbackErrorMessage: 'Unable to delete abuse report.',
    },
  );
}
