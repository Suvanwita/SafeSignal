import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateEvidenceDto {
  @ApiProperty({ format: 'uuid', description: 'Incident to which this evidence is attached' })
  @IsUUID('4', { message: 'Incident ID must be a valid UUID' })
  incidentId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Optional related abuse report within the incident' })
  @IsOptional()
  @IsUUID('4', { message: 'Abuse report ID must be a valid UUID' })
  abuseReportId?: string;

  @ApiProperty({ example: 'Threatening direct message screenshot' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MinLength(3, { message: 'Title must be at least 3 characters' })
  @MaxLength(200, { message: 'Title must not exceed 200 characters' })
  title!: string;

  @ApiPropertyOptional({ example: 'Full screen capture showing timestamps and handle.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @MaxLength(5000, { message: 'Description must not exceed 5000 characters' })
  description?: string;

  @ApiPropertyOptional({ example: 'https://x.com/harasser/status/12345678' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsUrl(
    { require_protocol: true, protocols: ['http', 'https'] },
    { message: 'Source URL must be a valid http or https URL' },
  )
  @MaxLength(2048, { message: 'Source URL must not exceed 2048 characters' })
  sourceUrl?: string;

  @ApiPropertyOptional({ example: 'evidence/uploads/dm-capture.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  storageKey?: string;

  @ApiPropertyOptional({ example: 'dm-capture.png' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiPropertyOptional({ example: 'image/png' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  @ApiPropertyOptional({ example: 204800 })
  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;

  @ApiPropertyOptional({
    example:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'sha256 must be a valid 64-character hex string',
  })
  sha256?: string;

  @ApiPropertyOptional({ example: '2026-11-12T10:00:00.000Z' })
  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'Captured date must be a valid ISO 8601 date string' },
  )
  capturedAt?: string;
}
