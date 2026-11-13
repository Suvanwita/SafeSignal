import { NextResponse, type NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const backendRes = await proxyBackendRequest(
    request,
    `/intelligence/safety/analyses/${encodeURIComponent(id)}`,
    {
      method: 'GET',
      fallbackErrorCode: 'GET_SAFETY_ANALYSIS_FAILED',
      fallbackErrorMessage: 'Unable to retrieve safety analysis.',
    },
  );

  if (!backendRes.ok) {
    return backendRes;
  }

  const payload = await backendRes.json().catch(() => null);
  return NextResponse.json({
    success: true,
    analysis: payload?.data || payload,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBackendRequest(
    request,
    `/intelligence/safety/analyses/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      requireCsrf: true,
      fallbackErrorCode: 'DELETE_SAFETY_ANALYSIS_FAILED',
      fallbackErrorMessage: 'Unable to delete safety analysis.',
    },
  );
}
