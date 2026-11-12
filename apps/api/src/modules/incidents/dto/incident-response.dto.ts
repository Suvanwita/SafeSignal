import { ApiProperty } from '@nestjs/swagger';
import { AbuseCategory, IncidentStatus, Severity } from '@prisma/client';

export class IncidentSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

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
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
