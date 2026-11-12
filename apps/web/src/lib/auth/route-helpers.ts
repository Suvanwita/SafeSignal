import { NextResponse, type NextRequest } from 'next/server';
import { setAuthCookies } from './cookies';
import { generateCsrfToken, validateCsrfRequest } from './csrf';
import { getBackendApiBaseUrl } from './server-api';
import type {
  ApiFailureEnvelope,
  ApiSuccessEnvelope,
  AuthUser,
} from './types';

interface BackendAuthData {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
}

export function buildCsrfErrorResponse(reason = 'CSRF validation failed') {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'CSRF_VALIDATION_FAILED',
        message: reason,
      },
    },
    { status: 403 },
  );
}

export async function handleCredentialAuthRoute(
  request: NextRequest,
  backendPath: '/api/v1/auth/login' | '/api/v1/auth/register',
  successStatus: 200 | 201,
): Promise<NextResponse> {
  const csrfCheck = validateCsrfRequest(request);
  if (!csrfCheck.valid) {
    return buildCsrfErrorResponse(csrfCheck.reason);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid JSON request body',
        },
      },
      { status: 400 },
    );
  }

  const forwardedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const userAgent = request.headers.get('user-agent');
  if (userAgent) {
    forwardedHeaders['user-agent'] = userAgent;
  }

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    forwardedHeaders['x-forwarded-for'] = forwardedFor;
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${getBackendApiBaseUrl()}${backendPath}`, {
      method: 'POST',
      headers: forwardedHeaders,
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Authentication service is temporarily unavailable',
        },
      },
      { status: 503 },
    );
  }

  const payload = (await backendResponse.json().catch(() => null)) as
    | ApiSuccessEnvelope<BackendAuthData>
    | ApiFailureEnvelope
    | null;

  if (!backendResponse.ok || !payload || !payload.success) {
    return NextResponse.json(
      payload ?? {
        success: false,
        error: {
          code: 'AUTH_FAILED',
          message: 'Authentication failed',
        },
      },
      { status: backendResponse.status || 500 },
    );
  }

  const { accessToken, expiresIn, user } = payload.data;
  const response = NextResponse.json({ user }, { status: successStatus });

  setAuthCookies(response, request, {
    accessToken,
    expiresInSeconds: expiresIn,
    csrfToken: generateCsrfToken(),
  });

  return response;
}
