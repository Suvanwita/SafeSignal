import type { SafeSignalStatus } from '@/components/ui/status-badge';
import type { AbuseCategory, Severity } from '@/lib/abuse/types';
import type { Platform } from '@/lib/identity/types';
import type { SuspiciousProfileStatus } from '@/lib/intelligence/types';

export type IncidentStatus =
  | 'OPEN'
  | 'IN_REVIEW'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED';

export interface IncidentOfficialAccount {
  id: string;
  platform: Platform;
  handle: string;
  displayName: string | null;
  profileUrl: string | null;
  verified: boolean;
  isPrimary: boolean;
}

export interface IncidentSuspiciousProfile {
  id: string;
  platform: Platform;
  handle: string;
  displayName: string | null;
  profileUrl: string | null;
  reviewStatus: SuspiciousProfileStatus;
}

export interface IncidentAbuseReport {
  id: string;
  title: string;
  description: string;
  category: AbuseCategory;
  platform: Platform;
  severity: Severity;
  incidentDate: string;
  targetUrl: string | null;
  referenceNumber: string | null;
  reportStatus: string;
  submittedAt: string | null;
  createdAt: string;
}

export interface IncidentEvidence {
  id: string;
  incidentId: string;
  abuseReportId: string | null;
  title: string;
  description: string | null;
  sourceUrl: string | null;
  storageKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  sha256: string | null;
  capturedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentTimelineEvent {
  id: string;
  incidentId: string;
  eventType: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
  createdAt: string;
}

export interface IncidentSummary {
  id: string;
  userId: string;
  officialAccountId: string | null;
  suspiciousProfileId: string | null;
  title: string;
  description: string | null;
  status: IncidentStatus;
  severity: Severity;
  category: AbuseCategory;
  occurredAt: string | null;
  resolvedAt: string | null;
  reportCount: number;
  evidenceCount: number;
  timelineEventCount: number;
  suspiciousProfileCount: number;
  officialAccount?: IncidentOfficialAccount | null;
  suspiciousProfile?: IncidentSuspiciousProfile | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentDetail extends IncidentSummary {
  abuseReports: IncidentAbuseReport[];
  suspiciousProfiles: IncidentSuspiciousProfile[];
  evidence: IncidentEvidence[];
  timelineEvents: IncidentTimelineEvent[];
}

export interface CreateIncidentInput {
  title: string;
  description?: string;
  category: AbuseCategory;
  severity?: Severity;
  occurredAt?: string;
  officialAccountId?: string;
  suspiciousProfileId?: string;
}

export const INCIDENT_STATUS_OPTIONS: {
  value: IncidentStatus;
  label: string;
  statusBadge: SafeSignalStatus;
}[] = [
  { value: 'OPEN', label: 'Open', statusBadge: 'open' },
  { value: 'IN_REVIEW', label: 'In Review', statusBadge: 'in_review' },
  { value: 'ESCALATED', label: 'Escalated', statusBadge: 'escalated' },
  { value: 'RESOLVED', label: 'Resolved', statusBadge: 'resolved' },
  { value: 'CLOSED', label: 'Closed', statusBadge: 'closed' },
];

export const INCIDENT_STATUS_MAP: Record<
  IncidentStatus,
  {
    label: string;
    statusBadge: SafeSignalStatus;
  }
> = {
  OPEN: { label: 'Open', statusBadge: 'open' },
  IN_REVIEW: { label: 'In Review', statusBadge: 'in_review' },
  ESCALATED: { label: 'Escalated', statusBadge: 'escalated' },
  RESOLVED: { label: 'Resolved', statusBadge: 'resolved' },
  CLOSED: { label: 'Closed', statusBadge: 'closed' },
};

export interface ListTimelineQuery {
  page?: number;
  limit?: number;
  order?: 'asc' | 'desc';
  eventType?: string;
  search?: string;
}

export interface TimelinePaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PaginatedTimelineResponse {
  events: IncidentTimelineEvent[];
  pagination: TimelinePaginationMeta;
}
