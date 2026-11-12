import { ApiPropertyOptional } from '@nestjs/swagger';
import { AbuseCategory, IncidentStatus, Severity } from '@prisma/client';
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
  ValidateIf,
} from 'class-validator';

export class UpdateIncidentDto {
  @ApiPropertyOptional({ example: 'Updated incident title' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Title cannot be empty' })
  @MinLength(3, { message: 'Incident title must be at least 3 characters' })
  @MaxLength(200, { message: 'Incident title must not exceed 200 characters' })
  title?: string;

  @ApiPropertyOptional({ example: 'Updated incident narrative.' })
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

  @ApiPropertyOptional({ enum: AbuseCategory })
  @IsOptional()
  @IsEnum(AbuseCategory, { message: 'Please select a valid category' })
  category?: AbuseCategory;

  @ApiPropertyOptional({ enum: Severity })
  @IsOptional()
  @IsEnum(Severity, { message: 'Please select a valid severity level' })
  severity?: Severity;

  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus, { message: 'Please select a valid incident status' })
  status?: IncidentStatus;

  @ApiPropertyOptional({ example: '2026-11-12T10:00:00.000Z' })
  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'Occurred date must be a valid ISO 8601 date string' },
  )
  occurredAt?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Set or change associated official account, or null to unlink',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID('4', { message: 'Official account ID must be a valid UUID' })
  officialAccountId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Set or change associated suspicious profile, or null to unlink',
  })
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
}
