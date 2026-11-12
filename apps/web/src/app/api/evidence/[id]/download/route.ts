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
    const backendResponse = await fetch(
      `${getBackendApiBaseUrl()}/api/v1/evidence/${encodeURIComponent(id)}/download`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      },
    );

    if (!backendResponse.ok) {
      const err = await backendResponse.json().catch(() => null);
      return NextResponse.json(
        err || {
          success: false,
          error: {
            code: 'DOWNLOAD_FAILED',
            message: 'Failed to download evidence file',
          },
        },
        { status: backendResponse.status },
      );
    }

    const headers = new Headers();
    const contentType = backendResponse.headers.get('content-type');
    const contentDisposition = backendResponse.headers.get('content-disposition');
    const contentLength = backendResponse.headers.get('content-length');

    if (contentType) headers.set('content-type', contentType);
    if (contentDisposition) headers.set('content-disposition', contentDisposition);
    if (contentLength) headers.set('content-length', contentLength);
    headers.set('x-content-type-options', 'nosniff');

    return new NextResponse(backendResponse.body, {
      status: 200,
      headers,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'DOWNLOAD_FAILED',
          message: 'Unable to stream evidence file from vault',
        },
      },
      { status: 500 },
    );
  }
}
