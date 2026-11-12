import type { NextRequest } from 'next/server';
import { proxyIdentityRequest } from '@/lib/identity/bff-proxy';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyIdentityRequest(
    request,
    `/identity/accounts/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      requireCsrf: true,
      includeBody: true,
      wrapDataKey: 'account',
    },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyIdentityRequest(
    request,
    `/identity/accounts/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      requireCsrf: true,
    },
  );
}
