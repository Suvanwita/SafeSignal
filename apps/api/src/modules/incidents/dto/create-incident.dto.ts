import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AbuseCategory, Severity } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateIncidentDto {
  @ApiProperty({ example: 'Targeted Impersonation & Threats Campaign' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Incident title is required' })
  @MinLength(3, { message: 'Incident title must be at least 3 characters' })
  @MaxLength(200, { message: 'Incident title must not exceed 200 characters' })
  title!: string;

  @ApiPropertyOptional({ example: 'Consolidated incident tracking related abuse.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @MaxLength(5000, {
    message: 'Incident description must not exceed 5000 characters',
  })
  description?: string;

  @ApiProperty({ enum: AbuseCategory, example: AbuseCategory.HARASSMENT })
  @IsEnum(AbuseCategory, { message: 'Please select a valid category' })
  category!: AbuseCategory;

  @ApiPropertyOptional({ enum: Severity, default: Severity.MEDIUM })
  @IsOptional()
  @IsEnum(Severity, { message: 'Please select a valid severity level' })
  severity?: Severity;

  @ApiPropertyOptional({ example: '2026-11-12T10:00:00.000Z' })
  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'Occurred date must be a valid ISO 8601 date string' },
  )
  occurredAt?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'Official account ID must be a valid UUID' })
  officialAccountId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'Suspicious profile ID must be a valid UUID' })
  suspiciousProfileId?: string;
}
