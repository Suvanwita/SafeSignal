import { ApiPropertyOptional } from '@nestjs/swagger';
import { AbuseCategory, Platform, Severity } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const ABUSE_REPORT_STATUSES = [
  'PENDING',
  'SUBMITTED',
  'UNDER_REVIEW',
  'RESOLVED',
  'DISMISSED',
] as const;

export type AbuseReportStatus = (typeof ABUSE_REPORT_STATUSES)[number];

export class UpdateAbuseReportDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 200 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Title cannot be empty' })
  @MinLength(3, { message: 'Title must be at least 3 characters' })
  @MaxLength(200, { message: 'Title must not exceed 200 characters' })
  title?: string;

  @ApiPropertyOptional({ minLength: 10, maxLength: 5000 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Description cannot be empty' })
  @MinLength(10, { message: 'Description must be at least 10 characters' })
  @MaxLength(5000, { message: 'Description must not exceed 5000 characters' })
  description?: string;

  @ApiPropertyOptional({ enum: AbuseCategory })
  @IsOptional()
  @IsEnum(AbuseCategory, { message: 'Please select a valid abuse category' })
  category?: AbuseCategory;

  @ApiPropertyOptional({ enum: Platform })
  @IsOptional()
  @IsEnum(Platform, { message: 'Please select a valid supported platform' })
  platform?: Platform;

  @ApiPropertyOptional({ example: '2026-11-12T10:30:00.000Z' })
  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'Incident date must be a valid ISO 8601 date string' },
  )
  incidentDate?: string;

  @ApiPropertyOptional({ enum: Severity })
  @IsOptional()
  @IsEnum(Severity, { message: 'Please select a valid severity level' })
  severity?: Severity;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Set or change related incident UUID, or null to unlink',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID('4', { message: 'Related incident ID must be a valid UUID' })
  incidentId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID('4', { message: 'Suspicious profile ID must be a valid UUID' })
  suspiciousProfileId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'Target URL must be a valid http:// or https:// URL' },
  )
  @MaxLength(500, { message: 'Target URL must not exceed 500 characters' })
  targetUrl?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(100, { message: 'Reference number must not exceed 100 characters' })
  referenceNumber?: string | null;

  @ApiPropertyOptional({ enum: ABUSE_REPORT_STATUSES })
  @IsOptional()
  @IsIn(ABUSE_REPORT_STATUSES, {
    message: 'Report status must be PENDING, SUBMITTED, UNDER_REVIEW, RESOLVED, or DISMISSED',
  })
  reportStatus?: AbuseReportStatus;
}
