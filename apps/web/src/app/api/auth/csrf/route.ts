import { NextResponse, type NextRequest } from 'next/server';
import { CSRF_TOKEN_COOKIE, setCsrfCookie } from '@/lib/auth/cookies';
import { generateCsrfToken } from '@/lib/auth/csrf';

export function GET(request: NextRequest) {
  const existingToken = request.cookies.get(CSRF_TOKEN_COOKIE)?.value;
  const csrfToken = existingToken || generateCsrfToken();

  const response = NextResponse.json({ csrfToken }, { status: 200 });
  if (!existingToken) {
    setCsrfCookie(response, request, csrfToken);
  }
  return response;
}
