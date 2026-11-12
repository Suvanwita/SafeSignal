export type IncidentStatus =
  | 'OPEN'
  | 'IN_REVIEW'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'info';

export interface DashboardSummary {
  totalIncidents: number;
  openIncidents: number;
  escalatedIncidents: number;
  evidenceRecords: number;
  suspiciousProfiles: number;
  officialAccounts: number;
}

export interface DashboardActivityItem {
  id: string;
  incidentId: string;
  incidentTitle: string;
  eventType: string;
  title: string;
  description: string | null;
  occurredAt: string;
}

export interface DashboardIncidentItem {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  category: string;
  platform: string | null;
  suspiciousHandle: string | null;
  evidenceCount: number;
  reportCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardRecommendation {
  id: string;
  priority: RecommendationPriority;
  category: string;
  title: string;
  description: string;
  actionLabel: string;
}

export interface DashboardOverview {
  summary: DashboardSummary;
  recentActivity: DashboardActivityItem[];
  recentIncidents: DashboardIncidentItem[];
  recommendations: DashboardRecommendation[];
}
