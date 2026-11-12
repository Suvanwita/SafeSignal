import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { CSRF_TOKEN_COOKIE } from './cookies';

export const CSRF_HEADER = 'x-csrf-token';

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

function safeTokenEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export function validateCsrfRequest(request: NextRequest): {
  valid: boolean;
  reason?: string;
} {
  const origin = request.headers.get('origin');
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');

  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return { valid: false, reason: 'Invalid request origin' };
      }
    } catch {
      return { valid: false, reason: 'Malformed request origin' };
    }
  }

  const cookieToken = request.cookies.get(CSRF_TOKEN_COOKIE)?.value;
  const headerToken = request.headers.get(CSRF_HEADER);

  if (!cookieToken || !headerToken) {
    return { valid: false, reason: 'Missing CSRF token' };
  }

  if (!safeTokenEquals(cookieToken, headerToken)) {
    return { valid: false, reason: 'Invalid CSRF token' };
  }

  return { valid: true };
}
