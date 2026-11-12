import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/cookies';
import { getBackendApiBaseUrl } from '@/lib/auth/server-api';
import type { IncidentDetail, IncidentSummary } from './types';

interface FetchBackendResult<T> {
  data: T | null;
  status: number;
}

async function fetchBackendJson<T>(path: string): Promise<FetchBackendResult<T>> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!token) {
    return { data: null, status: 401 };
  }

  try {
    const res = await fetch(`${getBackendApiBaseUrl()}/api/v1${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return { data: null, status: res.status };
    }

    const payload = await res.json();
    const data = payload && 'data' in payload ? (payload.data as T) : (payload as T);
    return { data, status: res.status };
  } catch {
    return { data: null, status: 503 };
  }
}

export async function getServerIncidents(
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
  const res = await fetchBackendJson<IncidentSummary[]>(
    `/incidents${qs ? `?${qs}` : ''}`,
  );
  return res.data ?? [];
}

export async function getServerIncidentById(
  id: string,
): Promise<{ incident: IncidentDetail | null; status: number }> {
  const res = await fetchBackendJson<IncidentDetail>(
    `/incidents/${encodeURIComponent(id)}`,
  );
  return { incident: res.data, status: res.status };
}
