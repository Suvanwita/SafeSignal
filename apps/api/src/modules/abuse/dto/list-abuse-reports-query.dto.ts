import { ApiPropertyOptional } from '@nestjs/swagger';
import { AbuseCategory, Platform, Severity } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import {
  ABUSE_REPORT_STATUSES,
  type AbuseReportStatus,
} from './update-abuse-report.dto';

export class ListAbuseReportsQueryDto {
  @ApiPropertyOptional({ enum: AbuseCategory })
  @IsOptional()
  @IsEnum(AbuseCategory)
  category?: AbuseCategory;

  @ApiPropertyOptional({ enum: Platform })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiPropertyOptional({ enum: Severity })
  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  incidentId?: string;

  @ApiPropertyOptional({ enum: ABUSE_REPORT_STATUSES })
  @IsOptional()
  @IsIn(ABUSE_REPORT_STATUSES)
  reportStatus?: AbuseReportStatus;
}
