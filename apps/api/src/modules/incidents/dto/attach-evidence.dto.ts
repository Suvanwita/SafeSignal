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

export class AttachEvidenceDto {
  @ApiProperty({ example: 'Threatening DM screenshot from Nov 12' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Evidence title is required' })
  @MinLength(3, { message: 'Evidence title must be at least 3 characters' })
  @MaxLength(200, { message: 'Evidence title must not exceed 200 characters' })
  title!: string;

  @ApiPropertyOptional({ example: 'Captured raw screenshot with metadata.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @MaxLength(5000, {
    message: 'Evidence description must not exceed 5000 characters',
  })
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'Abuse report ID must be a valid UUID' })
  abuseReportId?: string;

  @ApiPropertyOptional({ example: 'https://x.com/badactor/status/12345' })
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

  @ApiPropertyOptional({ example: 'evidence/user-123/screenshot.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  storageKey?: string;

  @ApiPropertyOptional({ example: 'dm-threat-screenshot.png' })
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

  @ApiPropertyOptional({ example: 102400 })
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
