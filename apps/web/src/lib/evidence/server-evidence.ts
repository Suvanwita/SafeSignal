import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/cookies';
import { getBackendApiBaseUrl } from '@/lib/auth/server-api';
import type { EvidenceRecord } from './types';

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
    const data =
      payload && typeof payload === 'object' && 'data' in payload
        ? (payload.data as T)
        : (payload as T);
    return { data, status: res.status };
  } catch {
    return { data: null, status: 503 };
  }
}

export async function getServerEvidence(
  query: {
    incidentId?: string;
    abuseReportId?: string;
  } = {},
): Promise<EvidenceRecord[]> {
  const params = new URLSearchParams();
  if (query.incidentId) params.set('incidentId', query.incidentId);
  if (query.abuseReportId) params.set('abuseReportId', query.abuseReportId);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const result = await fetchBackendJson<EvidenceRecord[]>(`/evidence${qs}`);
  return result.data ?? [];
}

export async function getServerEvidenceById(
  id: string,
): Promise<EvidenceRecord | null> {
  const result = await fetchBackendJson<EvidenceRecord>(`/evidence/${id}`);
  return result.data;
}
