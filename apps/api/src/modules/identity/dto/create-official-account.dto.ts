import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Platform } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateOfficialAccountDto {
  @ApiProperty({
    enum: Platform,
    example: Platform.X,
    description: 'Social media or web platform of the user-declared official account',
  })
  @IsEnum(Platform, { message: 'Please select a valid supported platform' })
  platform!: Platform;

  @ApiProperty({
    example: 'safesignal_hq',
    maxLength: 100,
    description: 'Username or handle on the selected platform',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  @MaxLength(100, { message: 'Username must not exceed 100 characters' })
  username!: string;

  @ApiPropertyOptional({
    example: 'https://x.com/safesignal_hq',
    maxLength: 500,
    description: 'Public profile URL (must use http:// or https://)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'Profile URL must be a valid http:// or https:// URL' },
  )
  @MaxLength(500, { message: 'Profile URL must not exceed 500 characters' })
  profileUrl?: string;

  @ApiPropertyOptional({
    example: 'SafeSignal Official',
    maxLength: 100,
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
    example: 'Primary organization communications handle',
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
    example: false,
    default: false,
    description: 'Mark this user-declared account as primary',
  })
  @IsOptional()
  @IsBoolean({ message: 'isPrimary must be a boolean' })
  isPrimary?: boolean;
}
