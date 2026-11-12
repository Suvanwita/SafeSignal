'use client';

import { AuthApiError, ensureCsrfToken } from '@/lib/auth/client-api';
import type { ApiErrorDetail, ApiFailureEnvelope } from '@/lib/auth/types';
import type {
  CreateSuspiciousProfileInput,
  SuspiciousProfile,
  UpdateSuspiciousProfileStatusInput,
} from './types';

async function requestIntelligenceJson<TResponse>(
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
      'Unable to complete suspicious profile request. Please try again.',
      'INTELLIGENCE_REQUEST_FAILED',
      response.status,
    );
  }

  return payload as TResponse;
}

export async function reportSuspiciousProfile(
  input: CreateSuspiciousProfileInput,
): Promise<SuspiciousProfile> {
  const payload = await requestIntelligenceJson<{
    profile: SuspiciousProfile;
  }>('/api/intelligence/suspicious-profiles', 'POST', input);
  return payload.profile;
}

export async function reanalyzeSuspiciousProfile(
  id: string,
): Promise<SuspiciousProfile> {
  const payload = await requestIntelligenceJson<{
    profile: SuspiciousProfile;
  }>(
    `/api/intelligence/suspicious-profiles/${encodeURIComponent(id)}/analyze`,
    'POST',
  );
  return payload.profile;
}

export async function updateSuspiciousProfileStatus(
  id: string,
  input: UpdateSuspiciousProfileStatusInput,
): Promise<SuspiciousProfile> {
  const payload = await requestIntelligenceJson<{
    profile: SuspiciousProfile;
  }>(
    `/api/intelligence/suspicious-profiles/${encodeURIComponent(id)}/status`,
    'PATCH',
    input,
  );
  return payload.profile;
}

export async function deleteSuspiciousProfile(
  id: string,
): Promise<{ deleted: true; id: string }> {
  return requestIntelligenceJson<{ deleted: true; id: string }>(
    `/api/intelligence/suspicious-profiles/${encodeURIComponent(id)}`,
    'DELETE',
  );
}
