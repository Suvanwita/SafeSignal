import { ApiPropertyOptional } from '@nestjs/swagger';
import { IncidentStatus, Severity } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateIncidentStatusDto {
  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus, { message: 'Please select a valid incident status' })
  status?: IncidentStatus;

  @ApiPropertyOptional({ enum: Severity })
  @IsOptional()
  @IsEnum(Severity, { message: 'Please select a valid severity level' })
  severity?: Severity;

  @ApiPropertyOptional({
    example: 'Escalated due to direct physical threat discovered in new evidence.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @MaxLength(500, { message: 'Reason must not exceed 500 characters' })
  reason?: string;
}
