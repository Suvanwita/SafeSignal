import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/cookies';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/incidents',
  '/identity',
  '/abuse',
  '/evidence',
  '/intelligence',
  '/reports',
  '/privacy',
  '/settings',
];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = Boolean(
    request.cookies.get(ACCESS_TOKEN_COOKIE)?.value,
  );

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !hasSessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/incidents/:path*',
    '/identity/:path*',
    '/abuse/:path*',
    '/evidence/:path*',
    '/intelligence/:path*',
    '/reports/:path*',
    '/privacy/:path*',
    '/settings/:path*',
  ],
};
