export type SafetyRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type SafetyCategory =
  | 'THREATS'
  | 'HARASSMENT'
  | 'ABUSIVE_LANGUAGE'
  | 'SENSITIVE_INFO'
  | 'REPEATED_ACTIVITY'
  | 'MULTI_VECTOR'
  | 'BENIGN';

export type IndicatorCategory =
  | 'THREATS'
  | 'HARASSMENT'
  | 'ABUSIVE_LANGUAGE'
  | 'SENSITIVE_INFO'
  | 'REPEATED_ACTIVITY';

export interface SafetyIndicator {
  id: string;
  category: IndicatorCategory;
  severity: SafetyRiskLevel;
  title: string;
  explanation: string;
  matchedTerms: string[];
  occurrences: number;
  snippet?: string;
}

export interface RepeatedActivityMetrics {
  repeatedPhrasesCount: number;
  duplicateSentences: string[];
  highCapsRatio: boolean;
  capsRatio: number;
  punctuationAggression: boolean;
  incidentReportCount?: number;
  incidentProfileCount?: number;
  rapidTimelineEscalation?: boolean;
}

export interface SafetyAnalysisResult {
  category: SafetyCategory;
  secondaryCategories: SafetyCategory[];
  riskLevel: SafetyRiskLevel;
  overallScore: number; // 0 - 100
  summary: string;
  indicators: SafetyIndicator[];
  explanations: string[];
  suggestedActions: string[];
  disclaimer: string;
  metrics: {
    textLength: number;
    wordCount: number;
    repeatedActivity: RepeatedActivityMetrics;
  };
  analyzedAt: string;
}

export interface CustomSensitiveRegex {
  name: string;
  pattern: string;
  severity?: SafetyRiskLevel;
}

export interface IncidentContextMetrics {
  reportCount?: number;
  profileCount?: number;
  timeframeHours?: number;
  timelineEventCount?: number;
  highSeverityReportsCount?: number;
}

export interface SafetyEngineOptions {
  customAbuseKeywords?: string[];
  customThreatKeywords?: string[];
  customHarassmentKeywords?: string[];
  customSensitiveRegexes?: CustomSensitiveRegex[];
  incidentContext?: IncidentContextMetrics;
}

export const SAFETY_INTELLIGENCE_DISCLAIMER =
  'SafeSignal Safety Intelligence provides automated heuristic pattern matching and rule-based risk classification to assist users with case documentation and triage. This analysis does not establish criminal intent, legal liability, or evidentiary proof of guilt, nor does it determine whether an allegation is true or false. Automated indicators should be reviewed and corroborated by qualified legal, law enforcement, or platform safety personnel.';
