import { NextResponse, type NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function POST(request: NextRequest) {
  const backendRes = await proxyBackendRequest(
    request,
    '/intelligence/safety/analyze-text',
    {
      method: 'POST',
      requireCsrf: true,
      includeBody: true,
      fallbackErrorCode: 'SAFETY_ANALYSIS_FAILED',
      fallbackErrorMessage: 'Unable to analyze text for safety indicators.',
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
