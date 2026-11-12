'use client';

import type {
  ApiErrorDetail,
  ApiFailureEnvelope,
  AuthUser,
} from './types';

export class AuthApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: ApiErrorDetail[];

  constructor(
    message: string,
    code = 'AUTH_ERROR',
    statusCode = 400,
    details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'AuthApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie
    .split('; ')
    .find((part) => part.startsWith('safesignal_csrf_token='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

export async function ensureCsrfToken(): Promise<string> {
  const existing = readCsrfCookie();
  if (existing) {
    return existing;
  }

  const response = await fetch('/api/auth/csrf', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new AuthApiError(
      'Unable to initialize security token. Please refresh and try again.',
      'CSRF_INIT_FAILED',
      response.status,
    );
  }

  const payload = (await response.json()) as { csrfToken: string };
  return payload.csrfToken;
}

async function postAuthJson<TResponse>(
  url: string,
  body?: unknown,
): Promise<TResponse> {
  const csrfToken = await ensureCsrfToken();

  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = (await response.json().catch(() => null)) as
    | (TResponse & { success?: boolean })
    | ApiFailureEnvelope
    | null;

  if (!response.ok) {
    if (payload && 'error' in payload && payload.error) {
      const details = Array.isArray(payload.error.details)
        ? (payload.error.details as ApiErrorDetail[])
        : undefined;
      throw new AuthApiError(
        payload.error.message,
        payload.error.code,
        response.status,
        details,
      );
    }

    throw new AuthApiError(
      'Authentication request failed. Please try again.',
      'AUTH_REQUEST_FAILED',
      response.status,
    );
  }

  return payload as TResponse;
}

export function registerAccount(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ user: AuthUser }> {
  return postAuthJson<{ user: AuthUser }>('/api/auth/register', input);
}

export function loginAccount(input: {
  email: string;
  password: string;
}): Promise<{ user: AuthUser }> {
  return postAuthJson<{ user: AuthUser }>('/api/auth/login', input);
}

export function logoutAccount(): Promise<{ loggedOut: true }> {
  return postAuthJson<{ loggedOut: true }>('/api/auth/logout');
}

export function sanitizeRedirectPath(rawNext: string | null | undefined): string {
  if (!rawNext || !rawNext.startsWith('/') || rawNext.startsWith('//')) {
    return '/dashboard';
  }
  if (rawNext === '/login' || rawNext === '/register') {
    return '/dashboard';
  }
  return rawNext;
}
