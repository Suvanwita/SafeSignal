export interface EvidenceRecord {
  id: string;
  userId: string;
  incidentId: string;
  abuseReportId: string | null;
  title: string;
  description: string | null;
  sourceUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  sha256: string | null;
  capturedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadEvidenceInput {
  file: File;
  incidentId: string;
  title?: string;
  description?: string;
  abuseReportId?: string;
  sourceUrl?: string;
  capturedAt?: string;
}

export const ALLOWED_EVIDENCE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.pdf',
  '.txt',
  '.docx',
] as const;

export const ALLOWED_EVIDENCE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const MAX_EVIDENCE_SIZE_MB = 15;
export const MAX_EVIDENCE_SIZE_BYTES = MAX_EVIDENCE_SIZE_MB * 1024 * 1024;

export type EvidenceIntegrityStatus = 'VERIFIED' | 'INTEGRITY_MISMATCH';

export const EVIDENCE_INTEGRITY_DISCLAIMER =
  'Cryptographic hash verification establishes file integrity relative to the recorded upload (confirming the file has remained unmodified in vault custody since upload), not the authenticity, accuracy, or truthfulness of the original content.';

export interface VerifyEvidenceResult {
  evidenceId: string;
  status: EvidenceIntegrityStatus;
  verified: boolean;
  algorithm: string;
  originalHash: string;
  recalculatedHash: string;
  originalFileSize: number | null;
  currentFileSize: number;
  mimeType: string | null;
  uploadedAt: string;
  verifiedAt: string;
  disclaimer: string;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) {
    return '—';
  }
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getFileFormatCategory(
  fileName: string | null,
  mimeType: string | null,
): 'PNG' | 'JPG' | 'PDF' | 'TXT' | 'DOCX' | 'OTHER' {
  const ext = (fileName || '').split('.').pop()?.toLowerCase();
  if (ext === 'png' || mimeType === 'image/png') return 'PNG';
  if (ext === 'jpg' || ext === 'jpeg' || mimeType === 'image/jpeg') return 'JPG';
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'PDF';
  if (ext === 'txt' || mimeType === 'text/plain') return 'TXT';
  if (
    ext === 'docx' ||
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'DOCX';
  }
  return 'OTHER';
}
