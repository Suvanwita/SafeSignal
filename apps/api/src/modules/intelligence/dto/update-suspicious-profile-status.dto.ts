import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SuspiciousProfileStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateSuspiciousProfileStatusDto {
  @ApiProperty({
    enum: SuspiciousProfileStatus,
    example: SuspiciousProfileStatus.UNDER_REVIEW,
    description: 'Manual review status set by the workspace owner',
  })
  @IsEnum(SuspiciousProfileStatus, {
    message: 'Please provide a valid manual review status',
  })
  reviewStatus!: SuspiciousProfileStatus;

  @ApiPropertyOptional({
    example: 'Confirmed user is monitoring handle activity; no automated verdict.',
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
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(1000, { message: 'Notes must not exceed 1000 characters' })
  notes?: string | null;
}
