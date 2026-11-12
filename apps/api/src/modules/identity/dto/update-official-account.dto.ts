import { ApiPropertyOptional } from '@nestjs/swagger';
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
  ValidateIf,
} from 'class-validator';

export class UpdateOfficialAccountDto {
  @ApiPropertyOptional({ enum: Platform, example: Platform.X })
  @IsOptional()
  @IsEnum(Platform, { message: 'Please select a valid supported platform' })
  platform?: Platform;

  @ApiPropertyOptional({ example: 'safesignal_hq', maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Username cannot be empty' })
  @MaxLength(100, { message: 'Username must not exceed 100 characters' })
  username?: string;

  @ApiPropertyOptional({
    example: 'https://x.com/safesignal_hq',
    nullable: true,
    maxLength: 500,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  })
  @ValidateIf((_, value: unknown) => value !== null && value !== undefined)
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'Profile URL must be a valid http:// or https:// URL' },
  )
  @MaxLength(500, { message: 'Profile URL must not exceed 500 characters' })
  profileUrl?: string | null;

  @ApiPropertyOptional({
    example: 'SafeSignal Official',
    nullable: true,
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  })
  @ValidateIf((_, value: unknown) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(100, { message: 'Display name must not exceed 100 characters' })
  displayName?: string | null;

  @ApiPropertyOptional({
    example: 'Updated description',
    nullable: true,
    maxLength: 1000,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  })
  @ValidateIf((_, value: unknown) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(1000, { message: 'Notes must not exceed 1000 characters' })
  notes?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: 'isPrimary must be a boolean' })
  isPrimary?: boolean;
}
