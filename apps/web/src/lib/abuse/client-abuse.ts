'use client';

import { AuthApiError, ensureCsrfToken } from '@/lib/auth/client-api';
import type { ApiErrorDetail, ApiFailureEnvelope } from '@/lib/auth/types';
import type {
  AbuseReport,
  CreateAbuseReportInput,
  IncidentOption,
  UpdateAbuseReportInput,
} from './types';

async function requestAbuseJson<TResponse>(
  url: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<TResponse> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (method !== 'GET') {
    headers['x-csrf-token'] = await ensureCsrfToken();
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: method === 'GET' ? 'no-store' : undefined,
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
      'Unable to complete abuse report request. Please try again.',
      'ABUSE_REQUEST_FAILED',
      response.status,
    );
  }

  return payload as TResponse;
}

export async function fetchAbuseReports(): Promise<AbuseReport[]> {
  const payload = await requestAbuseJson<{ reports: AbuseReport[] }>(
    '/api/abuse/reports',
    'GET',
  );
  return payload.reports ?? [];
}

export async function fetchIncidents(): Promise<IncidentOption[]> {
  const payload = await requestAbuseJson<{ incidents: IncidentOption[] }>(
    '/api/incidents',
    'GET',
  );
  return payload.incidents ?? [];
}

export async function createAbuseReport(
  input: CreateAbuseReportInput,
): Promise<AbuseReport> {
  const payload = await requestAbuseJson<{ report: AbuseReport }>(
    '/api/abuse/reports',
    'POST',
    input,
  );
  return payload.report;
}

export async function updateAbuseReport(
  id: string,
  input: UpdateAbuseReportInput,
): Promise<AbuseReport> {
  const payload = await requestAbuseJson<{ report: AbuseReport }>(
    `/api/abuse/reports/${encodeURIComponent(id)}`,
    'PATCH',
    input,
  );
  return payload.report;
}

export async function deleteAbuseReport(
  id: string,
): Promise<{ deleted: true; id: string }> {
  return requestAbuseJson<{ deleted: true; id: string }>(
    `/api/abuse/reports/${encodeURIComponent(id)}`,
    'DELETE',
  );
}
