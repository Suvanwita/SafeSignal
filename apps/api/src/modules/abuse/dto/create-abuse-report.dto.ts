import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AbuseCategory, Platform, Severity } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAbuseReportDto {
  @ApiProperty({
    example: 'Repeated threatening direct messages',
    minLength: 3,
    maxLength: 200,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MinLength(3, { message: 'Title must be at least 3 characters' })
  @MaxLength(200, { message: 'Title must not exceed 200 characters' })
  title!: string;

  @ApiProperty({
    example:
      'Received multiple direct messages containing explicit threats across three consecutive evenings.',
    minLength: 10,
    maxLength: 5000,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Description is required' })
  @MinLength(10, { message: 'Description must be at least 10 characters' })
  @MaxLength(5000, { message: 'Description must not exceed 5000 characters' })
  description!: string;

  @ApiProperty({
    enum: AbuseCategory,
    example: AbuseCategory.HARASSMENT,
  })
  @IsEnum(AbuseCategory, { message: 'Please select a valid abuse category' })
  category!: AbuseCategory;

  @ApiProperty({
    enum: Platform,
    example: Platform.X,
  })
  @IsEnum(Platform, { message: 'Please select a valid supported platform' })
  platform!: Platform;

  @ApiProperty({
    example: '2026-11-12T10:30:00.000Z',
    description: 'ISO 8601 timestamp when the reported abuse occurred',
  })
  @IsDateString(
    { strict: true },
    { message: 'Incident date must be a valid ISO 8601 date string' },
  )
  incidentDate!: string;

  @ApiProperty({
    enum: Severity,
    example: Severity.HIGH,
  })
  @IsEnum(Severity, { message: 'Please select a valid severity level' })
  severity!: Severity;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional related incident UUID owned by the current user',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsUUID('4', { message: 'Related incident ID must be a valid UUID' })
  incidentId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Optional suspicious profile UUID owned by the current user',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsUUID('4', { message: 'Suspicious profile ID must be a valid UUID' })
  suspiciousProfileId?: string;

  @ApiPropertyOptional({
    example: 'https://x.com/offender/status/123456789',
    maxLength: 500,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'Target URL must be a valid http:// or https:// URL' },
  )
  @MaxLength(500, { message: 'Target URL must not exceed 500 characters' })
  targetUrl?: string;

  @ApiPropertyOptional({
    example: 'CASE-2026-0091',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @MaxLength(100, { message: 'Reference number must not exceed 100 characters' })
  referenceNumber?: string;
}
