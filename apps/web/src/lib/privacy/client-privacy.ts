import { AuthApiError, ensureCsrfToken } from '@/lib/auth/client-api';
import type {
  RedactSensitiveTextPayload,
  RedactSensitiveTextResponse,
  ScanSensitiveTextPayload,
  ScanSensitiveTextResponse,
} from './types';

async function requestBff<T>(
  url: string,
  options: RequestInit & { requireCsrf?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (options.requireCsrf) {
    const csrfToken = await ensureCsrfToken();
    headers.set('x-csrf-token', csrfToken);
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const errorCode =
      payload && typeof payload === 'object' && 'error' in payload
        ? (payload.error?.code ?? 'REQUEST_FAILED')
        : 'REQUEST_FAILED';
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? (payload.error?.message ?? 'Request failed')
        : 'Request failed';
    throw new AuthApiError(errorCode, message, res.status);
  }

  return payload as T;
}

export async function scanSensitiveText(
  payload: ScanSensitiveTextPayload,
): Promise<ScanSensitiveTextResponse> {
  return requestBff<ScanSensitiveTextResponse>('/api/privacy/scan', {
    method: 'POST',
    requireCsrf: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function redactSensitiveText(
  payload: RedactSensitiveTextPayload,
): Promise<RedactSensitiveTextResponse> {
  return requestBff<RedactSensitiveTextResponse>('/api/privacy/redact', {
    method: 'POST',
    requireCsrf: true,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function scanIncidentPrivacy(
  incidentId: string,
): Promise<ScanSensitiveTextResponse> {
  return requestBff<ScanSensitiveTextResponse>(
    `/api/privacy/scan-incident/${encodeURIComponent(incidentId)}`,
    {
      method: 'POST',
      requireCsrf: true,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  );
}
