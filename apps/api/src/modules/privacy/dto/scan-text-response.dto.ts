import { ApiProperty } from '@nestjs/swagger';
import {
  ConfidenceLevel,
  SensitiveCategory,
} from './sensitive-category.enum';

export class SensitiveDetectionDto {
  @ApiProperty({
    enum: SensitiveCategory,
    example: SensitiveCategory.EMAIL,
    description: 'High-level category of detected sensitive information',
  })
  category!: SensitiveCategory;

  @ApiProperty({
    example: 'EMAIL_STANDARD',
    description: 'Specific classification rule or detector sub-type',
  })
  detectionType!: string;

  @ApiProperty({
    example: 'john.doe@example.org',
    description: 'The exact sensitive string detected in the input',
  })
  text!: string;

  @ApiProperty({
    example: 32,
    description: 'Zero-based character index where match begins (inclusive)',
  })
  start!: number;

  @ApiProperty({
    example: 52,
    description: 'Zero-based character index where match ends (exclusive)',
  })
  end!: number;

  @ApiProperty({
    enum: ConfidenceLevel,
    example: ConfidenceLevel.HIGH,
    description: 'Detection confidence level (HIGH, MEDIUM, LOW)',
  })
  confidence!: ConfidenceLevel;

  @ApiProperty({
    example: 'Valid email address matching RFC standard format',
    description: 'Human-readable explanation of the pattern match rationale',
  })
  explanation!: string;
}

export class ScanSensitiveTextResponseDto {
  @ApiProperty({
    example: true,
    description: 'Flag indicating whether at least one sensitive entity was detected',
  })
  hasSensitiveData!: boolean;

  @ApiProperty({
    example: 3,
    description: 'Total number of sensitive items detected',
  })
  totalDetections!: number;

  @ApiProperty({
    type: [SensitiveDetectionDto],
    description: 'List of all detected sensitive information entities',
  })
  detections!: SensitiveDetectionDto[];

  @ApiProperty({
    example: {
      EMAIL: 1,
      PHONE_INDIAN: 1,
      PHONE_INTERNATIONAL: 0,
      ADDRESS: 1,
    },
    description: 'Count breakdown grouped by sensitive category',
  })
  categoryBreakdown!: Record<SensitiveCategory, number>;

  @ApiProperty({
    example: 154,
    description: 'Total character length of scanned input',
  })
  scannedLength!: number;

  @ApiProperty({
    example: 2,
    description: 'Detection execution time in milliseconds',
  })
  executionTimeMs!: number;
}
