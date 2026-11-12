import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class LinkIncidentDto {
  @ApiProperty({ format: 'uuid', description: 'Incident to associate this suspicious profile with' })
  @IsUUID('4', { message: 'Incident ID must be a valid UUID' })
  incidentId!: string;

  @ApiPropertyOptional({ example: 'Coordinated impersonator alt account' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
