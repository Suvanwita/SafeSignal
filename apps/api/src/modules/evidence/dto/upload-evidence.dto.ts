import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UploadEvidenceDto {
  @ApiProperty({
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
    description: 'UUID of the safety incident to associate this evidence with',
  })
  @IsUUID('4', { message: 'Incident ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Incident ID is required' })
  incidentId!: string;

  @ApiPropertyOptional({
    example: 'Threatening direct message screenshot',
    description:
      'Human-readable title for the evidence item (defaults to original filename if omitted)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1, { message: 'Evidence title must not be empty' })
  @MaxLength(200, { message: 'Evidence title must not exceed 200 characters' })
  title?: string;

  @ApiPropertyOptional({
    example: 'Extracted from mobile app on 2026-11-12 at 22:30 UTC.',
    description: 'Detailed description, context, or chain-of-custody notes',
  })
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

  @ApiPropertyOptional({
    format: 'uuid',
    example: '22222222-2222-4222-8222-222222222222',
    description: 'Optional related abuse report under the same incident',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsUUID('4', { message: 'Abuse report ID must be a valid UUID' })
  abuseReportId?: string;

  @ApiPropertyOptional({
    example: 'https://x.com/impersonator/status/123456789',
    description: 'Source URL where the abusive evidence was captured',
  })
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

  @ApiPropertyOptional({
    example: '2026-11-12T10:00:00.000Z',
    description: 'Date and time when the evidence was captured (ISO 8601)',
  })
  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: 'Captured date must be a valid ISO 8601 date string' },
  )
  capturedAt?: string;
}
