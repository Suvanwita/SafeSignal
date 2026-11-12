import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE, clearAuthCookies } from '@/lib/auth/cookies';
import { getBackendApiBaseUrl } from '@/lib/auth/server-api';
import type { ApiSuccessEnvelope, AuthUser } from '@/lib/auth/types';

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

  try {
    const backendResponse = await fetch(
      `${getBackendApiBaseUrl()}/api/v1/auth/me`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      },
    );

    if (!backendResponse.ok) {
      const response = NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Session expired or invalid' },
        },
        { status: 401 },
      );
      clearAuthCookies(response, request);
      return response;
    }

    const payload =
      (await backendResponse.json()) as ApiSuccessEnvelope<AuthUser>;
    return NextResponse.json({ user: payload.data }, { status: 200 });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Authentication service is unavailable',
        },
      },
      { status: 503 },
    );
  }
}
