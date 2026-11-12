import type { SafeSignalStatus } from '@/components/ui/status-badge';
import type { Platform } from '@/lib/identity/types';

export const ABUSE_CATEGORY_OPTIONS = [
  {
    value: 'CYBERBULLYING',
    label: 'Cyberbullying',
    description: 'Coordinated mockery, intimidation, or targeted online abuse.',
  },
  {
    value: 'HARASSMENT',
    label: 'Harassment',
    description: 'Repeated unwanted, abusive, or hostile behavior.',
  },
  {
    value: 'STALKING',
    label: 'Stalking',
    description: 'Persistent monitoring, tracking, or following across accounts.',
  },
  {
    value: 'THREATS',
    label: 'Threats',
    description: 'Direct or implied threats of harm, violence, or coercion.',
  },
  {
    value: 'IMPERSONATION',
    label: 'Impersonation',
    description: 'Fake or lookalike profile pretending to be you or your org.',
  },
  {
    value: 'UNWANTED_CONTACT',
    label: 'Unwanted Contact',
    description: 'Unsolicited messages, calls, or bypass attempts after blocking.',
  },
  {
    value: 'PRIVACY_VIOLATION',
    label: 'Privacy Violation',
    description: 'Non-consensual sharing of personal contact or private records.',
  },
  {
    value: 'DOXXING',
    label: 'Doxxing',
    description: 'Publishing private identifying information to invite harm.',
  },
  {
    value: 'SCAM_FRAUD',
    label: 'Scam / Fraud',
    description: 'Deceptive solicitation or financial fraud using your identity.',
  },
  {
    value: 'PHISHING',
    label: 'Phishing',
    description: 'Credential harvesting links or malicious spoofing attempts.',
  },
  {
    value: 'EXTORTION',
    label: 'Extortion',
    description: 'Coercion or blackmail demanding money, silence, or actions.',
  },
  {
    value: 'HATE_SPEECH',
    label: 'Hate Speech',
    description: 'Abusive attacks targeting protected identity attributes.',
  },
  {
    value: 'NON_CONSENSUAL_CONTENT',
    label: 'Non-Consensual Content',
    description: 'Intimate or private media distributed without permission.',
  },
  {
    value: 'COPYRIGHT_TRADEMARK',
    label: 'Copyright / Trademark',
    description: 'Unauthorized use of protected logos, content, or marks.',
  },
  {
    value: 'OTHER',
    label: 'Other',
    description: 'Safety or platform abuse outside listed categories.',
  },
] as const;

export type AbuseCategory = (typeof ABUSE_CATEGORY_OPTIONS)[number]['value'];

export const ABUSE_CATEGORY_LABEL_MAP: Record<AbuseCategory, string> =
  ABUSE_CATEGORY_OPTIONS.reduce(
    (acc, item) => {
      acc[item.value] = item.label;
      return acc;
    },
    {} as Record<AbuseCategory, string>,
  );

export const SEVERITY_OPTIONS = [
  {
    value: 'LOW',
    label: 'Low',
    description: 'Minor policy violation or isolated nuisance.',
    statusBadge: 'low' as SafeSignalStatus,
  },
  {
    value: 'MEDIUM',
    label: 'Medium',
    description: 'Repeated unwanted behavior or active impersonation risk.',
    statusBadge: 'medium' as SafeSignalStatus,
  },
  {
    value: 'HIGH',
    label: 'High',
    description: 'Serious harassment, privacy exposure, or escalating abuse.',
    statusBadge: 'high' as SafeSignalStatus,
  },
  {
    value: 'CRITICAL',
    label: 'Critical',
    description: 'Immediate safety threat, extortion, or severe doxxing.',
    statusBadge: 'critical' as SafeSignalStatus,
  },
] as const;

export type Severity = (typeof SEVERITY_OPTIONS)[number]['value'];

export const SEVERITY_MAP: Record<
  Severity,
  (typeof SEVERITY_OPTIONS)[number]
> = SEVERITY_OPTIONS.reduce(
  (acc, item) => {
    acc[item.value] = item;
    return acc;
  },
  {} as Record<Severity, (typeof SEVERITY_OPTIONS)[number]>,
);

export const ABUSE_REPORT_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending', badgeVariant: 'warning' as const },
  { value: 'SUBMITTED', label: 'Submitted', badgeVariant: 'info' as const },
  {
    value: 'UNDER_REVIEW',
    label: 'Under Review',
    badgeVariant: 'info' as const,
  },
  { value: 'RESOLVED', label: 'Resolved', badgeVariant: 'verified' as const },
  { value: 'DISMISSED', label: 'Dismissed', badgeVariant: 'neutral' as const },
] as const;

export type AbuseReportStatus =
  (typeof ABUSE_REPORT_STATUS_OPTIONS)[number]['value'];

export const ABUSE_REPORT_STATUS_MAP: Record<
  AbuseReportStatus,
  (typeof ABUSE_REPORT_STATUS_OPTIONS)[number]
> = ABUSE_REPORT_STATUS_OPTIONS.reduce(
  (acc, item) => {
    acc[item.value] = item;
    return acc;
  },
  {} as Record<AbuseReportStatus, (typeof ABUSE_REPORT_STATUS_OPTIONS)[number]>,
);

export interface IncidentOption {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: string;
  severity: Severity;
  category: AbuseCategory;
  occurredAt: string | null;
  reportCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AbuseReport {
  id: string;
  userId: string;
  incidentId: string | null;
  suspiciousProfileId: string | null;
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
  incident: {
    id: string;
    title: string;
    status: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAbuseReportInput {
  title: string;
  description: string;
  category: AbuseCategory;
  platform: Platform;
  incidentDate: string;
  severity: Severity;
  incidentId?: string;
  newIncidentTitle?: string;
  targetUrl?: string;
  referenceNumber?: string;
}

export interface UpdateAbuseReportInput {
  title?: string;
  description?: string;
  category?: AbuseCategory;
  platform?: Platform;
  incidentDate?: string;
  severity?: Severity;
  incidentId?: string | null;
  newIncidentTitle?: string;
  targetUrl?: string | null;
  referenceNumber?: string | null;
  reportStatus?: AbuseReportStatus;
}
