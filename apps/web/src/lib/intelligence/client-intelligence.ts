'use client';

import { AuthApiError, ensureCsrfToken } from '@/lib/auth/client-api';
import type { ApiErrorDetail, ApiFailureEnvelope } from '@/lib/auth/types';
import type {
  AnalyzeSafetyTextInput,
  CreateSuspiciousProfileInput,
  SafetyAnalysisResult,
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

export async function analyzeSafetyText(
  input: AnalyzeSafetyTextInput,
): Promise<SafetyAnalysisResult> {
  const payload = await requestIntelligenceJson<{
    analysis: SafetyAnalysisResult;
  }>('/api/intelligence/safety/analyze-text', 'POST', input);
  return payload.analysis;
}

export async function analyzeAbuseReportSafety(
  abuseReportId: string,
): Promise<SafetyAnalysisResult> {
  const payload = await requestIntelligenceJson<{
    analysis: SafetyAnalysisResult;
  }>(
    `/api/intelligence/safety/analyze-report/${encodeURIComponent(abuseReportId)}`,
    'POST',
    {},
  );
  return payload.analysis;
}

export async function analyzeIncidentSafety(
  incidentId: string,
): Promise<SafetyAnalysisResult> {
  const payload = await requestIntelligenceJson<{
    analysis: SafetyAnalysisResult;
  }>(
    `/api/intelligence/safety/analyze-incident/${encodeURIComponent(incidentId)}`,
    'POST',
    {},
  );
  return payload.analysis;
}

export async function analyzeEvidenceSafety(
  evidenceId: string,
): Promise<SafetyAnalysisResult> {
  const payload = await requestIntelligenceJson<{
    analysis: SafetyAnalysisResult;
  }>(
    `/api/intelligence/safety/analyze-evidence/${encodeURIComponent(evidenceId)}`,
    'POST',
    {},
  );
  return payload.analysis;
}

export async function fetchSafetyAnalyses(
  query: {
    incidentId?: string;
    evidenceId?: string;
    abuseReportId?: string;
    riskLevel?: string;
    category?: string;
  } = {},
): Promise<SafetyAnalysisResult[]> {
  const params = new URLSearchParams();
  if (query.incidentId) params.set('incidentId', query.incidentId);
  if (query.evidenceId) params.set('evidenceId', query.evidenceId);
  if (query.abuseReportId) params.set('abuseReportId', query.abuseReportId);
  if (query.riskLevel) params.set('riskLevel', query.riskLevel);
  if (query.category) params.set('category', query.category);

  const qs = params.toString();
  const url = `/api/intelligence/safety/analyses${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) {
    const errPayload = await res.json().catch(() => null);
    throw new AuthApiError(
      errPayload?.error?.message || 'Failed to fetch safety analyses',
      errPayload?.error?.code || 'ANALYSES_FETCH_FAILED',
      res.status,
    );
  }

  const payload = await res.json();
  return payload.analyses || payload.data || [];
}

export async function deleteSafetyAnalysis(
  id: string,
): Promise<{ deleted: true; id: string }> {
  return requestIntelligenceJson<{ deleted: true; id: string }>(
    `/api/intelligence/safety/analyses/${encodeURIComponent(id)}`,
    'DELETE',
  );
}

