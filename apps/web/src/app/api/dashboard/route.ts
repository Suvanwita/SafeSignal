import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE, clearAuthCookies } from '@/lib/auth/cookies';
import { getBackendApiBaseUrl } from '@/lib/auth/server-api';
import type { ApiSuccessEnvelope } from '@/lib/auth/types';
import type { DashboardOverview } from '@/lib/dashboard/types';

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
      `${getBackendApiBaseUrl()}/api/v1/dashboard`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      },
    );

    if (backendResponse.status === 401) {
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

    if (!backendResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DASHBOARD_FETCH_FAILED',
            message: 'Unable to load dashboard data',
          },
        },
        { status: backendResponse.status },
      );
    }

    const payload =
      (await backendResponse.json()) as ApiSuccessEnvelope<DashboardOverview>;
    return NextResponse.json({ overview: payload.data }, { status: 200 });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Dashboard service is temporarily unavailable',
        },
      },
      { status: 503 },
    );
  }
}
