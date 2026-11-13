import { NextResponse, type NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ incidentId: string }> },
) {
  const { incidentId } = await params;
  const backendRes = await proxyBackendRequest(
    request,
    `/intelligence/safety/analyze-incident/${encodeURIComponent(incidentId)}`,
    {
      method: 'POST',
      requireCsrf: true,
      includeBody: true,
      fallbackErrorCode: 'INCIDENT_SAFETY_ANALYSIS_FAILED',
      fallbackErrorMessage: 'Unable to analyze incident safety.',
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
