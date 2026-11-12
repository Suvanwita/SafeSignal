import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Platform } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSuspiciousProfileDto {
  @ApiProperty({
    example: 'https://x.com/safes1gnal_support',
    maxLength: 500,
    description: 'Submitted profile URL (http:// or https://)',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Profile URL is required' })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'Profile URL must be a valid http:// or https:// URL' },
  )
  @MaxLength(500, { message: 'Profile URL must not exceed 500 characters' })
  profileUrl!: string;

  @ApiProperty({
    enum: Platform,
    example: Platform.X,
    description: 'Platform of the reported suspicious profile',
  })
  @IsEnum(Platform, { message: 'Please select a valid supported platform' })
  platform!: Platform;

  @ApiProperty({
    example: 'safes1gnal_support',
    maxLength: 100,
    description: 'Submitted username or handle of the suspicious profile',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  @MaxLength(100, { message: 'Username must not exceed 100 characters' })
  username!: string;

  @ApiPropertyOptional({
    example: 'SafeSignal Official Support',
    maxLength: 100,
    description: 'Submitted display name shown on the suspicious profile',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @MaxLength(100, { message: 'Display name must not exceed 100 characters' })
  displayName?: string;

  @ApiPropertyOptional({
    example: 'Official customer support channel for SafeSignal users. DM for assistance.',
    maxLength: 2000,
    description: 'Submitted bio text copied by the user',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @MaxLength(2000, { message: 'Bio text must not exceed 2000 characters' })
  bio?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.org/avatars/lookalike.png',
    maxLength: 1000,
    description: 'Optional profile image URL provided by the user',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'Profile image URL must be a valid http:// or https:// URL' },
  )
  @MaxLength(1000, {
    message: 'Profile image URL must not exceed 1000 characters',
  })
  profileImageUrl?: string;

  @ApiPropertyOptional({
    example: 'Observed messaging followers from impersonated display name',
    maxLength: 1000,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @MaxLength(1000, { message: 'Notes must not exceed 1000 characters' })
  notes?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Optional incident UUID to associate this suspicious profile with',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsUUID('4', { message: 'Incident ID must be a valid UUID' })
  incidentId?: string;

  @ApiPropertyOptional({
    example: 'Coordinated impersonator campaign targeting brand',
    minLength: 3,
    maxLength: 200,
    description: 'Optional new incident title to create and link atomically',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @MinLength(3, { message: 'New incident title must be at least 3 characters' })
  @MaxLength(200, { message: 'New incident title must not exceed 200 characters' })
  newIncidentTitle?: string;
}
