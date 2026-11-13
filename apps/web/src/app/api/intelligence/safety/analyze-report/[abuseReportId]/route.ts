import { NextResponse, type NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/auth/backend-proxy';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ abuseReportId: string }> },
) {
  const { abuseReportId } = await params;
  const backendRes = await proxyBackendRequest(
    request,
    `/intelligence/safety/analyze-report/${encodeURIComponent(abuseReportId)}`,
    {
      method: 'POST',
      requireCsrf: true,
      includeBody: true,
      fallbackErrorCode: 'REPORT_SAFETY_ANALYSIS_FAILED',
      fallbackErrorMessage: 'Unable to analyze abuse report safety.',
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
