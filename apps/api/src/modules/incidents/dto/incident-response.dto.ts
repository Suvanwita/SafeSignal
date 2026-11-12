import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AbuseCategory,
  IncidentStatus,
  Platform,
  Severity,
  SuspiciousProfileStatus,
} from '@prisma/client';

export class IncidentOfficialAccountDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: Platform })
  platform!: Platform;

  @ApiProperty()
  handle!: string;

  @ApiProperty({ nullable: true })
  displayName!: string | null;

  @ApiProperty({ nullable: true })
  profileUrl!: string | null;

  @ApiProperty()
  verified!: boolean;

  @ApiProperty()
  isPrimary!: boolean;
}

export class IncidentSuspiciousProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: Platform })
  platform!: Platform;

  @ApiProperty()
  handle!: string;

  @ApiProperty({ nullable: true })
  displayName!: string | null;

  @ApiProperty({ nullable: true })
  profileUrl!: string | null;

  @ApiProperty({ enum: SuspiciousProfileStatus })
  reviewStatus!: SuspiciousProfileStatus;
}

export class IncidentAbuseReportSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: AbuseCategory })
  category!: AbuseCategory;

  @ApiProperty({ enum: Platform })
  platform!: Platform;

  @ApiProperty({ enum: Severity })
  severity!: Severity;

  @ApiProperty()
  incidentDate!: Date;

  @ApiProperty({ nullable: true })
  targetUrl!: string | null;

  @ApiProperty({ nullable: true })
  referenceNumber!: string | null;

  @ApiProperty()
  reportStatus!: string;

  @ApiProperty({ nullable: true })
  submittedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

export class IncidentEvidenceSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  incidentId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  abuseReportId!: string | null;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sourceUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  storageKey!: string | null;

  @ApiPropertyOptional({ nullable: true })
  fileName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  mimeType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  fileSize!: number | null;

  @ApiPropertyOptional({ nullable: true })
  sha256!: string | null;

  @ApiPropertyOptional({ nullable: true })
  capturedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class IncidentTimelineEventDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  incidentId!: string;

  @ApiProperty()
  eventType!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true })
  metadata!: unknown;

  @ApiProperty()
  occurredAt!: Date;

  @ApiProperty()
  createdAt!: Date;
}

export class IncidentSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  officialAccountId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  suspiciousProfileId!: string | null;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: IncidentStatus })
  status!: IncidentStatus;

  @ApiProperty({ enum: Severity })
  severity!: Severity;

  @ApiProperty({ enum: AbuseCategory })
  category!: AbuseCategory;

  @ApiProperty({ nullable: true })
  occurredAt!: Date | null;

  @ApiProperty({ nullable: true })
  resolvedAt!: Date | null;

  @ApiProperty()
  reportCount!: number;

  @ApiProperty()
  evidenceCount!: number;

  @ApiProperty()
  timelineEventCount!: number;

  @ApiProperty()
  suspiciousProfileCount!: number;

  @ApiPropertyOptional({ type: IncidentOfficialAccountDto, nullable: true })
  officialAccount?: IncidentOfficialAccountDto | null;

  @ApiPropertyOptional({ type: IncidentSuspiciousProfileDto, nullable: true })
  suspiciousProfile?: IncidentSuspiciousProfileDto | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class IncidentDetailResponseDto extends IncidentSummaryResponseDto {
  @ApiProperty({ type: [IncidentAbuseReportSummaryDto] })
  abuseReports!: IncidentAbuseReportSummaryDto[];

  @ApiProperty({ type: [IncidentSuspiciousProfileDto] })
  suspiciousProfiles!: IncidentSuspiciousProfileDto[];

  @ApiProperty({ type: [IncidentEvidenceSummaryDto] })
  evidence!: IncidentEvidenceSummaryDto[];

  @ApiProperty({ type: [IncidentTimelineEventDto] })
  timelineEvents!: IncidentTimelineEventDto[];
}
