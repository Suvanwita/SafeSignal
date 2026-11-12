import { ApiProperty } from '@nestjs/swagger';
import type {
  AbuseCategory,
  IncidentStatus,
  Platform,
  Severity,
} from '@prisma/client';

export class DashboardSummaryDto {
  @ApiProperty({ example: 12 })
  totalIncidents!: number;

  @ApiProperty({ example: 3 })
  openIncidents!: number;

  @ApiProperty({ example: 1 })
  escalatedIncidents!: number;

  @ApiProperty({ example: 24 })
  evidenceRecords!: number;

  @ApiProperty({ example: 5 })
  suspiciousProfiles!: number;

  @ApiProperty({ example: 2 })
  officialAccounts!: number;
}

export class DashboardActivityItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  incidentId!: string;

  @ApiProperty({ example: 'Impersonation report filed' })
  incidentTitle!: string;

  @ApiProperty({ example: 'EVIDENCE_ADDED' })
  eventType!: string;

  @ApiProperty({ example: 'Screenshot evidence uploaded' })
  title!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty()
  occurredAt!: Date;
}

export class DashboardIncidentItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Brand impersonation on X' })
  title!: string;

  @ApiProperty({ enum: ['OPEN', 'IN_REVIEW', 'ESCALATED', 'RESOLVED', 'CLOSED'] })
  status!: IncidentStatus;

  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  severity!: Severity;

  @ApiProperty({
    enum: [
      'IMPERSONATION',
      'HARASSMENT',
      'SCAM_FRAUD',
      'PHISHING',
      'DOXXING',
      'EXTORTION',
      'HATE_SPEECH',
      'NON_CONSENSUAL_CONTENT',
      'COPYRIGHT_TRADEMARK',
      'OTHER',
    ],
  })
  category!: AbuseCategory;

  @ApiProperty({ nullable: true })
  platform!: Platform | null;

  @ApiProperty({ nullable: true })
  suspiciousHandle!: string | null;

  @ApiProperty({ example: 2 })
  evidenceCount!: number;

  @ApiProperty({ example: 1 })
  reportCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'info';

export class DashboardRecommendationDto {
  @ApiProperty({ example: 'register-official-accounts' })
  id!: string;

  @ApiProperty({ enum: ['critical', 'high', 'medium', 'info'] })
  priority!: RecommendationPriority;

  @ApiProperty({ example: 'Identity Protection' })
  category!: string;

  @ApiProperty({ example: 'Register your official accounts' })
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ example: 'Add official profile' })
  actionLabel!: string;
}

export class DashboardOverviewDto {
  @ApiProperty({ type: DashboardSummaryDto })
  summary!: DashboardSummaryDto;

  @ApiProperty({ type: [DashboardActivityItemDto] })
  recentActivity!: DashboardActivityItemDto[];

  @ApiProperty({ type: [DashboardIncidentItemDto] })
  recentIncidents!: DashboardIncidentItemDto[];

  @ApiProperty({ type: [DashboardRecommendationDto] })
  recommendations!: DashboardRecommendationDto[];
}
