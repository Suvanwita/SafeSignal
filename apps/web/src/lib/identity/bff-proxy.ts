import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE, clearAuthCookies } from '@/lib/auth/cookies';
import { validateCsrfRequest } from '@/lib/auth/csrf';
import { buildCsrfErrorResponse } from '@/lib/auth/route-helpers';
import { getBackendApiBaseUrl } from '@/lib/auth/server-api';
import type { ApiFailureEnvelope, ApiSuccessEnvelope } from '@/lib/auth/types';

interface IdentityProxyOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  requireCsrf?: boolean;
  includeBody?: boolean;
  wrapDataKey?: 'account' | 'accounts';
}

export async function proxyIdentityRequest(
  request: NextRequest,
  backendPath: string,
  options: IdentityProxyOptions,
): Promise<NextResponse> {
  if (options.requireCsrf) {
    const csrfCheck = validateCsrfRequest(request);
    if (!csrfCheck.valid) {
      return buildCsrfErrorResponse(csrfCheck.reason);
    }
  }

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

  let bodyText: string | undefined;
  if (options.includeBody) {
    let parsedBody: unknown;
    try {
      parsedBody = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid JSON request payload',
          },
        },
        { status: 400 },
      );
    }
    bodyText = JSON.stringify(parsedBody);
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };
    if (bodyText !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const backendResponse = await fetch(
      `${getBackendApiBaseUrl()}/api/v1${backendPath}`,
      {
        method: options.method,
        headers,
        body: bodyText,
        cache: 'no-store',
      },
    );

    const payload = (await backendResponse.json().catch(() => null)) as
      | ApiSuccessEnvelope<unknown>
      | ApiFailureEnvelope
      | null;

    if (!backendResponse.ok) {
      const errorBody =
        payload && 'error' in payload && payload.error
          ? payload
          : {
              success: false,
              error: {
                code: 'IDENTITY_REQUEST_FAILED',
                message: 'Unable to complete official account request.',
              },
            };

      const response = NextResponse.json(errorBody, {
        status: backendResponse.status,
      });
      if (backendResponse.status === 401) {
        clearAuthCookies(response, request);
      }
      return response;
    }

    const data =
      payload && 'data' in payload ? payload.data : undefined;

    if (options.wrapDataKey) {
      return NextResponse.json(
        { [options.wrapDataKey]: data },
        { status: backendResponse.status },
      );
    }

    return NextResponse.json(data ?? { ok: true }, {
      status: backendResponse.status,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Identity protection service is temporarily unavailable',
        },
      },
      { status: 503 },
    );
  }
}
