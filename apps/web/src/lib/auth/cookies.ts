import type { NextRequest, NextResponse } from 'next/server';

export const ACCESS_TOKEN_COOKIE = 'safesignal_access_token';
export const CSRF_TOKEN_COOKIE = 'safesignal_csrf_token';

export function isSecureCookieContext(request: NextRequest): boolean {
  if (process.env.COOKIE_SECURE === 'true') {
    return true;
  }

  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0]?.trim() === 'https';
  }

  return request.nextUrl.protocol === 'https:';
}

export function setAuthCookies(
  response: NextResponse,
  request: NextRequest,
  input: {
    accessToken: string;
    expiresInSeconds: number;
    csrfToken: string;
  },
): void {
  const secure = isSecureCookieContext(request);

  response.cookies.set(ACCESS_TOKEN_COOKIE, input.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: input.expiresInSeconds,
  });

  response.cookies.set(CSRF_TOKEN_COOKIE, input.csrfToken, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: input.expiresInSeconds,
  });
}

export function setCsrfCookie(
  response: NextResponse,
  request: NextRequest,
  csrfToken: string,
): void {
  response.cookies.set(CSRF_TOKEN_COOKIE, csrfToken, {
    httpOnly: false,
    secure: isSecureCookieContext(request),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60,
  });
}

export function clearAuthCookies(
  response: NextResponse,
  request: NextRequest,
): void {
  const secure = isSecureCookieContext(request);

  response.cookies.set(ACCESS_TOKEN_COOKIE, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  response.cookies.set(CSRF_TOKEN_COOKIE, '', {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
