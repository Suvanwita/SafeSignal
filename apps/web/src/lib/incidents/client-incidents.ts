import { AuthApiError, ensureCsrfToken } from '@/lib/auth/client-api';
import type {
  IncidentDetail,
  IncidentSummary,
  ListTimelineQuery,
  PaginatedTimelineResponse,
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

export async function fetchIncidents(
  query: {
    status?: string;
    severity?: string;
    category?: string;
    search?: string;
  } = {},
): Promise<IncidentSummary[]> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.severity) params.set('severity', query.severity);
  if (query.category) params.set('category', query.category);
  if (query.search) params.set('search', query.search);

  const qs = params.toString();
  const res = await requestBff<{ incidents: IncidentSummary[] }>(
    `/api/incidents${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
  );
  return res.incidents ?? [];
}

export async function fetchIncidentById(id: string): Promise<IncidentDetail> {
  const res = await requestBff<{ incident: IncidentDetail }>(
    `/api/incidents/${encodeURIComponent(id)}`,
    { method: 'GET' },
  );
  return res.incident;
}

export async function createIncident(
  input: Record<string, unknown>,
): Promise<IncidentDetail> {
  const res = await requestBff<{ incident: IncidentDetail }>(
    '/api/incidents',
    {
      method: 'POST',
      requireCsrf: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return res.incident;
}

export async function updateIncidentStatus(
  id: string,
  input: { status?: string; severity?: string; reason?: string },
): Promise<IncidentDetail> {
  const res = await requestBff<{ incident: IncidentDetail }>(
    `/api/incidents/${encodeURIComponent(id)}/status`,
    {
      method: 'PATCH',
      requireCsrf: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return res.incident;
}

export async function closeIncident(
  id: string,
  input: { reason?: string; resolutionNotes?: string } = {},
): Promise<IncidentDetail> {
  const res = await requestBff<{ incident: IncidentDetail }>(
    `/api/incidents/${encodeURIComponent(id)}/close`,
    {
      method: 'POST',
      requireCsrf: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return res.incident;
}

export async function reopenIncident(
  id: string,
  input: { reason?: string } = {},
): Promise<IncidentDetail> {
  const res = await requestBff<{ incident: IncidentDetail }>(
    `/api/incidents/${encodeURIComponent(id)}/reopen`,
    {
      method: 'POST',
      requireCsrf: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return res.incident;
}

export async function linkReportsToIncident(
  incidentId: string,
  reportIds: string[],
): Promise<IncidentDetail> {
  const res = await requestBff<{ incident: IncidentDetail }>(
    `/api/incidents/${encodeURIComponent(incidentId)}/reports`,
    {
      method: 'POST',
      requireCsrf: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportIds }),
    },
  );
  return res.incident;
}

export async function unlinkReportFromIncident(
  incidentId: string,
  reportId: string,
): Promise<IncidentDetail> {
  const res = await requestBff<{ incident: IncidentDetail }>(
    `/api/incidents/${encodeURIComponent(incidentId)}/reports/${encodeURIComponent(reportId)}`,
    {
      method: 'DELETE',
      requireCsrf: true,
    },
  );
  return res.incident;
}

export async function linkProfilesToIncident(
  incidentId: string,
  profileIds: string[],
  notes?: string,
): Promise<IncidentDetail> {
  const res = await requestBff<{ incident: IncidentDetail }>(
    `/api/incidents/${encodeURIComponent(incidentId)}/profiles`,
    {
      method: 'POST',
      requireCsrf: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileIds, notes }),
    },
  );
  return res.incident;
}

export async function unlinkProfileFromIncident(
  incidentId: string,
  profileId: string,
): Promise<IncidentDetail> {
  const res = await requestBff<{ incident: IncidentDetail }>(
    `/api/incidents/${encodeURIComponent(incidentId)}/profiles/${encodeURIComponent(profileId)}`,
    {
      method: 'DELETE',
      requireCsrf: true,
    },
  );
  return res.incident;
}

export async function fetchIncidentTimeline(
  incidentId: string,
  query: ListTimelineQuery = {},
): Promise<PaginatedTimelineResponse> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.order) params.set('order', query.order);
  if (query.eventType) params.set('eventType', query.eventType);
  if (query.search) params.set('search', query.search);

  const qs = params.toString();
  return requestBff<PaginatedTimelineResponse>(
    `/api/incidents/${encodeURIComponent(incidentId)}/timeline${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
  );
}
