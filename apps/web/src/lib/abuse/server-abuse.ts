import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth/cookies';
import { getBackendApiBaseUrl } from '@/lib/auth/server-api';
import type { ApiSuccessEnvelope } from '@/lib/auth/types';
import type { AbuseReport, IncidentOption } from './types';

async function fetchBackendJson<T>(path: string): Promise<{
  status: number;
  data: T | null;
}> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    return { status: 401, data: null };
  }

  try {
    const response = await fetch(`${getBackendApiBaseUrl()}/api/v1${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return { status: response.status, data: null };
    }

    const payload = (await response.json()) as ApiSuccessEnvelope<T>;
    if (!payload?.success || payload.data === undefined) {
      return { status: response.status, data: null };
    }

    return { status: response.status, data: payload.data };
  } catch {
    return { status: 503, data: null };
  }
}

export async function getServerAbuseReports(): Promise<AbuseReport[] | null> {
  const res = await fetchBackendJson<AbuseReport[]>('/abuse/reports');
  return res.data;
}

export async function getServerAbuseReportById(id: string): Promise<{
  report: AbuseReport | null;
  status: number;
}> {
  const res = await fetchBackendJson<AbuseReport>(
    `/abuse/reports/${encodeURIComponent(id)}`,
  );
  return { report: res.data, status: res.status };
}

export async function getServerIncidents(): Promise<IncidentOption[]> {
  const res = await fetchBackendJson<IncidentOption[]>('/incidents');
  return res.data ?? [];
}
