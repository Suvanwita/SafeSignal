import type { Platform } from '@/lib/identity/types';

export const SUSPICIOUS_PROFILE_STATUSES = [
  'PENDING_REVIEW',
  'UNDER_REVIEW',
  'MONITORING',
  'ESCALATED',
  'DISMISSED',
] as const;

export type SuspiciousProfileStatus =
  (typeof SUSPICIOUS_PROFILE_STATUSES)[number];

export interface ReviewStatusMeta {
  value: SuspiciousProfileStatus;
  label: string;
  description: string;
  badgeVariant: 'warning' | 'info' | 'neutral' | 'alert' | 'verified';
}

export const SUSPICIOUS_PROFILE_STATUS_OPTIONS: readonly ReviewStatusMeta[] = [
  {
    value: 'PENDING_REVIEW',
    label: 'Pending Review',
    description: 'Newly submitted; waiting for manual inspection.',
    badgeVariant: 'warning',
  },
  {
    value: 'UNDER_REVIEW',
    label: 'Under Review',
    description: 'User is actively reviewing indicators and context.',
    badgeVariant: 'info',
  },
  {
    value: 'MONITORING',
    label: 'Monitoring',
    description: 'Keeping on watchlist for changes or escalation.',
    badgeVariant: 'neutral',
  },
  {
    value: 'ESCALATED',
    label: 'Escalated',
    description: 'Marked by user for formal incident or platform reporting.',
    badgeVariant: 'alert',
  },
  {
    value: 'DISMISSED',
    label: 'Dismissed',
    description: 'Reviewed and determined benign or non-actionable by user.',
    badgeVariant: 'verified',
  },
] as const;

export const SUSPICIOUS_PROFILE_STATUS_MAP: Record<
  SuspiciousProfileStatus,
  ReviewStatusMeta
> = SUSPICIOUS_PROFILE_STATUS_OPTIONS.reduce(
  (acc, item) => {
    acc[item.value] = item;
    return acc;
  },
  {} as Record<SuspiciousProfileStatus, ReviewStatusMeta>,
);

export type SimilarityLevel =
  | 'NO_BASELINE'
  | 'LOW_SIMILARITY'
  | 'MODERATE_SIMILARITY'
  | 'HIGH_SIMILARITY';

export type IndicatorLevel = 'INFO' | 'MODERATE' | 'HIGH';

export type IndicatorCategory =
  | 'USERNAME'
  | 'DISPLAY_NAME'
  | 'BIO'
  | 'PROFILE_URL'
  | 'PLATFORM'
  | 'BASELINE';

export interface DimensionBreakdown {
  score: number | null;
  available: boolean;
  weight: number;
  explanation: string;
  indicators: string[];
}

export interface ImpersonationIndicator {
  id: string;
  category: IndicatorCategory;
  level: IndicatorLevel;
  title: string;
  explanation: string;
}

export interface OfficialAccountComparison {
  officialAccountId: string;
  platform: Platform;
  username: string;
  displayName: string | null;
  profileUrl: string | null;
  isPrimary: boolean;
  overallScore: number;
  level: Exclude<SimilarityLevel, 'NO_BASELINE'>;
  dimensions: {
    username: DimensionBreakdown;
    displayName: DimensionBreakdown;
    bio: DimensionBreakdown;
    profileUrl: DimensionBreakdown;
  };
  indicators: ImpersonationIndicator[];
  explanationSummary: string;
}

export interface SimilarityAnalysis {
  id: string;
  type: string;
  overallScore: number;
  level: SimilarityLevel;
  matchedOfficialAccountId: string | null;
  summary: string;
  disclaimer: string;
  evaluatedAccountCount: number;
  bestMatch: OfficialAccountComparison | null;
  comparisons: OfficialAccountComparison[];
  indicators: ImpersonationIndicator[];
  createdAt: string;
}

export interface SuspiciousProfile {
  id: string;
  userId: string;
  platform: Platform;
  username: string;
  displayName: string | null;
  profileUrl: string | null;
  bio: string | null;
  profileImageUrl: string | null;
  reviewStatus: SuspiciousProfileStatus;
  reviewedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  latestAnalysis: SimilarityAnalysis | null;
  incidents?: { id: string; title: string; status: string }[];
}

export interface SuspiciousProfileDetail extends SuspiciousProfile {
  analyses: SimilarityAnalysis[];
}

export interface CreateSuspiciousProfileInput {
  platform: Platform;
  username: string;
  profileUrl: string;
  displayName?: string;
  bio?: string;
  profileImageUrl?: string;
  notes?: string;
  incidentId?: string;
  newIncidentTitle?: string;
}

export interface UpdateSuspiciousProfileStatusInput {
  reviewStatus: SuspiciousProfileStatus;
  notes?: string | null;
}

export type SafetyRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type SafetyCategory =
  | 'THREATS'
  | 'HARASSMENT'
  | 'ABUSIVE_LANGUAGE'
  | 'SENSITIVE_INFO'
  | 'REPEATED_ACTIVITY'
  | 'MULTI_VECTOR'
  | 'BENIGN';

export interface SafetyIndicator {
  id: string;
  category: string;
  severity: SafetyRiskLevel;
  title: string;
  explanation: string;
  matchedTerms: string[];
  occurrences: number;
  snippet?: string;
}

export interface SafetyAnalysisMetrics {
  textLength: number;
  wordCount: number;
  repeatedActivity: {
    repeatedPhrasesCount?: number;
    duplicateSentences?: string[];
    highCapsRatio?: boolean;
    capsRatio?: number;
    punctuationAggression?: boolean;
    incidentReportCount?: number;
    incidentProfileCount?: number;
    rapidTimelineEscalation?: boolean;
  };
}

export interface SafetyAnalysisResult {
  id?: string;
  category: SafetyCategory;
  secondaryCategories: SafetyCategory[];
  riskLevel: SafetyRiskLevel;
  overallScore: number;
  summary: string;
  indicators: SafetyIndicator[];
  explanations: string[];
  suggestedActions: string[];
  disclaimer: string;
  incidentId?: string | null;
  evidenceId?: string | null;
  abuseReportId?: string | null;
  metrics: SafetyAnalysisMetrics;
  analyzedAt: string;
  createdAt?: string;
}

export interface AnalyzeSafetyTextInput {
  text: string;
  incidentId?: string;
  evidenceId?: string;
  abuseReportId?: string;
  persist?: boolean;
  customAbuseKeywords?: string[];
  customThreatKeywords?: string[];
  customHarassmentKeywords?: string[];
}

export const SAFETY_INTELLIGENCE_DISCLAIMER =
  'SafeSignal Safety Intelligence provides automated heuristic pattern matching and rule-based risk classification to assist users with case documentation and triage. This analysis does not establish criminal intent, legal liability, or evidentiary proof of guilt, nor does it determine whether an allegation is true or false. Automated indicators should be reviewed and corroborated by qualified legal, law enforcement, or platform safety personnel.';

