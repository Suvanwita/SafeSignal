'use client';

import { AuthApiError, ensureCsrfToken } from '@/lib/auth/client-api';
import {
  formatBytes,
  type EvidenceRecord,
  type UploadEvidenceInput,
  type VerifyEvidenceResult,
} from './types';

export type UploadProgressCallback = (percent: number, message: string) => void;

export function uploadEvidence(
  input: UploadEvidenceInput,
  onProgress?: UploadProgressCallback,
): Promise<EvidenceRecord> {
  return new Promise((resolve, reject) => {
    ensureCsrfToken()
      .then((csrfToken) => {
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

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/evidence/upload', true);
        xhr.setRequestHeader('x-csrf-token', csrfToken);
        xhr.setRequestHeader('Accept', 'application/json');

        onProgress?.(5, 'Preparing evidence payload...');

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            const uploadFraction = event.loaded / event.total;
            const progress = Math.round(10 + uploadFraction * 70);
            onProgress?.(
              Math.min(progress, 80),
              `Uploading evidence to vault (${formatBytes(event.loaded)} / ${formatBytes(event.total)})...`,
            );
          } else {
            onProgress?.(45, 'Transferring file bytes...');
          }
        };

        xhr.upload.onload = () => {
          onProgress?.(85, 'Calculating SHA-256 fingerprint & extracting metadata...');
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const payload = JSON.parse(xhr.responseText);
              onProgress?.(100, 'Evidence verified and secured!');
              resolve(payload.data);
            } catch {
              reject(
                new AuthApiError(
                  'Invalid JSON response from server',
                  'INVALID_RESPONSE',
                ),
              );
            }
          } else {
            try {
              const errPayload = JSON.parse(xhr.responseText);
              const msg =
                errPayload?.error?.message ||
                errPayload?.message ||
                'Failed to upload evidence file.';
              const code = errPayload?.error?.code || 'UPLOAD_FAILED';
              reject(new AuthApiError(msg, code));
            } catch {
              reject(
                new AuthApiError(
                  `Upload request failed with status ${xhr.status}.`,
                  'UPLOAD_FAILED',
                ),
              );
            }
          }
        };

        xhr.onerror = () => {
          reject(
            new AuthApiError(
              'Network error occurred during evidence upload.',
              'NETWORK_ERROR',
            ),
          );
        };

        xhr.send(formData);
      })
      .catch((err) => {
        reject(
          err instanceof Error
            ? err
            : new AuthApiError(
                'Failed to initialize upload CSRF session',
                'CSRF_FAILED',
              ),
        );
      });
  });
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
