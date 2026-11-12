import { ApiPropertyOptional } from '@nestjs/swagger';
import { AbuseCategory, IncidentStatus, Severity } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListIncidentsQueryDto {
  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus, { message: 'Invalid status filter' })
  status?: IncidentStatus;

  @ApiPropertyOptional({ enum: Severity })
  @IsOptional()
  @IsEnum(Severity, { message: 'Invalid severity filter' })
  severity?: Severity;

  @ApiPropertyOptional({ enum: AbuseCategory })
  @IsOptional()
  @IsEnum(AbuseCategory, { message: 'Invalid category filter' })
  category?: AbuseCategory;

  @ApiPropertyOptional({ example: 'harassment' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @MaxLength(100, { message: 'Search query must not exceed 100 characters' })
  search?: string;
}
