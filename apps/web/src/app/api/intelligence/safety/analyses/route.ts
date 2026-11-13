import { NextResponse, type NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams.toString();
  const path = searchParams
    ? `/intelligence/safety/analyses?${searchParams}`
    : '/intelligence/safety/analyses';

  const backendRes = await proxyBackendRequest(request, path, {
    method: 'GET',
    fallbackErrorCode: 'LIST_SAFETY_ANALYSES_FAILED',
    fallbackErrorMessage: 'Unable to load safety analyses.',
  });

  if (!backendRes.ok) {
    return backendRes;
  }

  const payload = await backendRes.json().catch(() => null);
  return NextResponse.json({
    success: true,
    analyses: payload?.data || payload || [],
  });
}
