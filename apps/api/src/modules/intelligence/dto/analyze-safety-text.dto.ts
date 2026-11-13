import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AnalyzeSafetyTextDto {
  @ApiProperty({
    description: 'The raw text content or communication to analyze for safety threats',
    example:
      'Listen you coward, I know where you live at MG Road. Pay me or I will leak your photos!',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(15000)
  text!: string;

  @ApiPropertyOptional({
    description: 'Optional incident UUID to associate this safety analysis with',
  })
  @IsOptional()
  @IsUUID('4')
  incidentId?: string;

  @ApiPropertyOptional({
    description: 'Optional evidence UUID to associate this safety analysis with',
  })
  @IsOptional()
  @IsUUID('4')
  evidenceId?: string;

  @ApiPropertyOptional({
    description: 'Optional abuse report UUID to associate this safety analysis with',
  })
  @IsOptional()
  @IsUUID('4')
  abuseReportId?: string;

  @ApiPropertyOptional({
    description:
      'Whether to store the analysis result in PostgreSQL (defaults to true)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  persist?: boolean;

  @ApiPropertyOptional({
    description: 'Optional custom abusive keywords to include in analysis',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customAbuseKeywords?: string[];

  @ApiPropertyOptional({
    description: 'Optional custom threat keywords to include in analysis',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customThreatKeywords?: string[];

  @ApiPropertyOptional({
    description: 'Optional custom harassment keywords to include in analysis',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customHarassmentKeywords?: string[];
}
