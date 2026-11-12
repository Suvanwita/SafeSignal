import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE, clearAuthCookies } from '@/lib/auth/cookies';
import { validateCsrfRequest } from '@/lib/auth/csrf';
import { buildCsrfErrorResponse } from '@/lib/auth/route-helpers';
import { getBackendApiBaseUrl } from '@/lib/auth/server-api';

export async function POST(request: NextRequest) {
  const csrfCheck = validateCsrfRequest(request);
  if (!csrfCheck.valid) {
    return buildCsrfErrorResponse(csrfCheck.reason);
  }

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (accessToken) {
    try {
      await fetch(`${getBackendApiBaseUrl()}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      });
    } catch {
      // Proceed with clearing browser cookies even if backend revocation fails
    }
  }

  const response = NextResponse.json({ loggedOut: true }, { status: 200 });
  clearAuthCookies(response, request);
  return response;
}
