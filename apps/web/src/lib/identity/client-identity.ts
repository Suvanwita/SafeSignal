'use client';

import { AuthApiError, ensureCsrfToken } from '@/lib/auth/client-api';
import type { ApiErrorDetail, ApiFailureEnvelope } from '@/lib/auth/types';
import type {
  CreateOfficialAccountInput,
  OfficialAccount,
  UpdateOfficialAccountInput,
} from './types';

async function requestIdentityJson<TResponse>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<TResponse> {
  const csrfToken = await ensureCsrfToken();

  const headers: Record<string, string> = {
    'x-csrf-token': csrfToken,
    Accept: 'application/json',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = (await response.json().catch(() => null)) as
    | TResponse
    | ApiFailureEnvelope
    | null;

  if (!response.ok) {
    if (
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      payload.error
    ) {
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
      'Unable to complete official account request. Please try again.',
      'IDENTITY_REQUEST_FAILED',
      response.status,
    );
  }

  return payload as TResponse;
}

export async function createOfficialAccount(
  input: CreateOfficialAccountInput,
): Promise<OfficialAccount> {
  const payload = await requestIdentityJson<{ account: OfficialAccount }>(
    '/api/identity/accounts',
    'POST',
    input,
  );
  return payload.account;
}

export async function updateOfficialAccount(
  id: string,
  input: UpdateOfficialAccountInput,
): Promise<OfficialAccount> {
  const payload = await requestIdentityJson<{ account: OfficialAccount }>(
    `/api/identity/accounts/${encodeURIComponent(id)}`,
    'PATCH',
    input,
  );
  return payload.account;
}

export async function setPrimaryOfficialAccount(
  id: string,
): Promise<OfficialAccount> {
  const payload = await requestIdentityJson<{ account: OfficialAccount }>(
    `/api/identity/accounts/${encodeURIComponent(id)}/primary`,
    'PATCH',
  );
  return payload.account;
}

export async function deleteOfficialAccount(
  id: string,
): Promise<{ deleted: true; id: string }> {
  return requestIdentityJson<{ deleted: true; id: string }>(
    `/api/identity/accounts/${encodeURIComponent(id)}`,
    'DELETE',
  );
}
