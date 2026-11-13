import { ApiProperty } from '@nestjs/swagger';
import {
  ConfidenceLevel,
  RedactionStrategy,
  SensitiveCategory,
} from './sensitive-category.enum';

export class AppliedRedactionItemDto {
  @ApiProperty({
    enum: SensitiveCategory,
    example: SensitiveCategory.EMAIL,
    description: 'Category of sensitive information redacted',
  })
  category!: SensitiveCategory;

  @ApiProperty({
    example: 'victim@domain.com',
    description: 'Original text that was redacted',
  })
  originalText!: string;

  @ApiProperty({
    example: '[REDACTED_EMAIL]',
    description: 'Replacement string inserted into text',
  })
  replacement!: string;

  @ApiProperty({
    example: 16,
    description: 'Original start position before redaction',
  })
  start!: number;

  @ApiProperty({
    example: 33,
    description: 'Original end position before redaction',
  })
  end!: number;

  @ApiProperty({
    enum: ConfidenceLevel,
    example: ConfidenceLevel.HIGH,
    description: 'Confidence level of the detection that was redacted',
  })
  confidence!: ConfidenceLevel;
}

export class RedactSensitiveTextResponseDto {
  @ApiProperty({
    example:
      'Contact user at [REDACTED_EMAIL] or [REDACTED_PHONE]. Location: [REDACTED_ADDRESS].',
    description: 'The sanitized text with sensitive information redacted',
  })
  redactedText!: string;

  @ApiProperty({
    example: 98,
    description: 'Character length of original input text',
  })
  originalLength!: number;

  @ApiProperty({
    example: 85,
    description: 'Character length of sanitized output text',
  })
  redactedLength!: number;

  @ApiProperty({
    example: 3,
    description: 'Total number of sensitive entities redacted',
  })
  redactionCount!: number;

  @ApiProperty({
    enum: RedactionStrategy,
    example: RedactionStrategy.CATEGORY_LABEL,
    description: 'The masking strategy applied to the output',
  })
  appliedStrategy!: RedactionStrategy;

  @ApiProperty({
    type: [AppliedRedactionItemDto],
    description: 'List of individual redactions performed',
  })
  redactions!: AppliedRedactionItemDto[];

  @ApiProperty({
    example: 3,
    description: 'Redaction processing time in milliseconds',
  })
  executionTimeMs!: number;
}
