import { ApiProperty } from '@nestjs/swagger';
import {
  AbuseCategory,
  IncidentStatus,
  Platform,
  Severity,
} from '@prisma/client';

export class RelatedIncidentSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: IncidentStatus })
  status!: IncidentStatus;
}

export class AbuseReportResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  incidentId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  suspiciousProfileId!: string | null;

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

  @ApiProperty({ type: RelatedIncidentSummaryDto, nullable: true })
  incident!: RelatedIncidentSummaryDto | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class DeleteAbuseReportResponseDto {
  @ApiProperty({ example: true })
  deleted!: true;

  @ApiProperty({ format: 'uuid' })
  id!: string;
}
