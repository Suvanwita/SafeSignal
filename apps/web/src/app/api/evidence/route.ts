import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/cookies';
import { getBackendApiBaseUrl } from '@/lib/auth/server-api';

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';

  try {
    const res = await fetch(`${getBackendApiBaseUrl()}/api/v1/evidence${qs}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const payload = await res.json().catch(() => null);
    return NextResponse.json(payload, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'EVIDENCE_REQUEST_FAILED',
          message: 'Unable to load evidence records.',
        },
      },
      { status: 503 },
    );
  }
}
