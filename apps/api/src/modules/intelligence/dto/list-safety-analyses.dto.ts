import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class ListSafetyAnalysesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by associated incident UUID' })
  @IsOptional()
  @IsUUID('4')
  incidentId?: string;

  @ApiPropertyOptional({ description: 'Filter by associated evidence UUID' })
  @IsOptional()
  @IsUUID('4')
  evidenceId?: string;

  @ApiPropertyOptional({ description: 'Filter by associated abuse report UUID' })
  @IsOptional()
  @IsUUID('4')
  abuseReportId?: string;

  @ApiPropertyOptional({
    description: 'Filter by risk level',
    enum: ['LOW', 'MEDIUM', 'HIGH'],
  })
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  riskLevel?: string;

  @ApiPropertyOptional({
    description: 'Filter by primary safety category',
  })
  @IsOptional()
  @IsString()
  category?: string;
}
