'use client';

import { AuthApiError, ensureCsrfToken } from '@/lib/auth/client-api';
import type {
  EvidenceRecord,
  UploadEvidenceInput,
  VerifyEvidenceResult,
} from './types';

export async function uploadEvidence(
  input: UploadEvidenceInput,
): Promise<EvidenceRecord> {
  const csrfToken = await ensureCsrfToken();
  const formData = new FormData();
  formData.append('file', input.file);
  formData.append('incidentId', input.incidentId);

  if (input.title && input.title.trim().length > 0) {
    formData.append('title', input.title.trim());
  }
  if (input.description && input.description.trim().length > 0) {
    formData.append('description', input.description.trim());
  }
  if (input.abuseReportId) {
    formData.append('abuseReportId', input.abuseReportId);
  }
  if (input.sourceUrl && input.sourceUrl.trim().length > 0) {
    formData.append('sourceUrl', input.sourceUrl.trim());
  }
  if (input.capturedAt) {
    formData.append('capturedAt', input.capturedAt);
  }

  const res = await fetch('/api/evidence/upload', {
    method: 'POST',
    headers: {
      'x-csrf-token': csrfToken,
    },
    body: formData,
  });

  if (!res.ok) {
    const errPayload = await res.json().catch(() => null);
    const msg =
      errPayload?.error?.message ||
      errPayload?.message ||
      'Failed to upload evidence file.';
    const code = errPayload?.error?.code || 'UPLOAD_FAILED';
    throw new AuthApiError(msg, code);
  }

  const payload = await res.json();
  return payload.data;
}

export async function fetchEvidence(
  query: {
    incidentId?: string;
    abuseReportId?: string;
  } = {},
): Promise<EvidenceRecord[]> {
  const params = new URLSearchParams();
  if (query.incidentId) params.set('incidentId', query.incidentId);
  if (query.abuseReportId) params.set('abuseReportId', query.abuseReportId);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`/api/evidence${qs}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) {
    const errPayload = await res.json().catch(() => null);
    throw new AuthApiError(
      errPayload?.error?.message || 'Failed to fetch evidence records',
      errPayload?.error?.code || 'FETCH_FAILED',
    );
  }

  const payload = await res.json();
  return payload.data || [];
}

export async function deleteEvidence(
  id: string,
): Promise<{ deleted: boolean; id: string }> {
  const csrfToken = await ensureCsrfToken();
  const res = await fetch(`/api/evidence/${id}`, {
    method: 'DELETE',
    headers: {
      'x-csrf-token': csrfToken,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errPayload = await res.json().catch(() => null);
    throw new AuthApiError(
      errPayload?.error?.message || 'Failed to delete evidence record',
      errPayload?.error?.code || 'DELETE_FAILED',
    );
  }

  const payload = await res.json();
  return payload.data;
}

export async function verifyEvidence(id: string): Promise<VerifyEvidenceResult> {
  const csrfToken = await ensureCsrfToken();
  const res = await fetch(`/api/evidence/${id}/verify`, {
    method: 'POST',
    headers: {
      'x-csrf-token': csrfToken,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errPayload = await res.json().catch(() => null);
    throw new AuthApiError(
      errPayload?.error?.message || 'Failed to verify evidence file integrity',
      errPayload?.error?.code || 'VERIFICATION_FAILED',
    );
  }

  const payload = await res.json();
  return payload.data;
}

export async function fetchEvidenceMetadata(
  id: string,
): Promise<EvidenceRecord['metadata']> {
  const res = await fetch(`/api/evidence/${id}/metadata`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) {
    const errPayload = await res.json().catch(() => null);
    throw new AuthApiError(
      errPayload?.error?.message || 'Failed to fetch evidence metadata',
      errPayload?.error?.code || 'METADATA_FETCH_FAILED',
    );
  }

  const payload = await res.json();
  return payload.data ?? null;
}
