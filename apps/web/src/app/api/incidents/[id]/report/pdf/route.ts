import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/cookies';
import { getBackendApiBaseUrl } from '@/lib/auth/server-api';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      },
      { status: 401 },
    );
  }

  try {
    const backendUrl = `${getBackendApiBaseUrl()}/api/v1/incidents/${encodeURIComponent(id)}/report/pdf`;

    const backendResponse = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/pdf',
      },
      cache: 'no-store',
    });

    if (!backendResponse.ok) {
      const err = await backendResponse.json().catch(() => null);
      return NextResponse.json(
        err || {
          success: false,
          error: {
            code: 'REPORT_GENERATION_FAILED',
            message: 'Failed to generate incident PDF report dossier',
          },
        },
        { status: backendResponse.status },
      );
    }

    const responseHeaders = new Headers();
    const contentType = backendResponse.headers.get('content-type') || 'application/pdf';
    const contentDisposition =
      backendResponse.headers.get('content-disposition') ||
      `attachment; filename="SafeSignal-Incident-${id.slice(0, 8)}.pdf"`;
    const contentLength = backendResponse.headers.get('content-length');

    responseHeaders.set('content-type', contentType);
    responseHeaders.set('content-disposition', contentDisposition);
    if (contentLength) responseHeaders.set('content-length', contentLength);
    responseHeaders.set('cache-control', 'private, no-cache, no-store, must-revalidate');
    responseHeaders.set('x-content-type-options', 'nosniff');

    return new NextResponse(backendResponse.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'REPORT_GENERATION_FAILED',
          message: 'Unable to connect to incident report service',
        },
      },
      { status: 503 },
    );
  }
}
