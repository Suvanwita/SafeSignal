import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MAX_PRIVACY_TEXT_LENGTH } from './scan-text.dto';
import {
  ConfidenceLevel,
  RedactionStrategy,
  SensitiveCategory,
} from './sensitive-category.enum';

export class RedactSensitiveTextDto {
  @ApiProperty({
    description: 'Raw text content to redact (max 50,000 characters)',
    example:
      'Contact user at victim@domain.com or +91 98765 43210. Location: 123 Main Street, Bangalore 560001.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Input text cannot be empty' })
  @MaxLength(MAX_PRIVACY_TEXT_LENGTH, {
    message: `Input text cannot exceed ${MAX_PRIVACY_TEXT_LENGTH} characters.`,
  })
  text!: string;

  @ApiPropertyOptional({
    description:
      'Categories to redact. If omitted, all detected sensitive categories are redacted.',
    enum: SensitiveCategory,
    isArray: true,
    example: [
      SensitiveCategory.EMAIL,
      SensitiveCategory.PHONE_INDIAN,
      SensitiveCategory.PHONE_INTERNATIONAL,
      SensitiveCategory.ADDRESS,
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(SensitiveCategory, { each: true })
  categories?: SensitiveCategory[];

  @ApiPropertyOptional({
    description:
      'Redaction masking strategy (CATEGORY_LABEL, PARTIAL_MASK, FULL_MASK, HASH, CUSTOM, REMOVE). Defaults to CATEGORY_LABEL.',
    enum: RedactionStrategy,
    default: RedactionStrategy.CATEGORY_LABEL,
  })
  @IsOptional()
  @IsEnum(RedactionStrategy)
  strategy?: RedactionStrategy;

  @ApiPropertyOptional({
    description:
      'Custom placeholder string used when strategy is set to CUSTOM (e.g. "[CONFIDENTIAL]"). Max 50 characters.',
    example: '[CONFIDENTIAL]',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  customPlaceholder?: string;

  @ApiPropertyOptional({
    description:
      'Per-category custom placeholder mapping (e.g. { EMAIL: "[PRIVATE_EMAIL]", ADDRESS: "[REDACTED_LOCATION]" }).',
    example: {
      EMAIL: '[PRIVATE_EMAIL]',
      ADDRESS: '[REDACTED_LOCATION]',
    },
  })
  @IsOptional()
  @IsObject()
  customCategoryPlaceholders?: Partial<Record<SensitiveCategory, string>>;

  @ApiPropertyOptional({
    description:
      'Minimum confidence threshold required to trigger redaction. Defaults to LOW.',
    enum: ConfidenceLevel,
    default: ConfidenceLevel.LOW,
  })
  @IsOptional()
  @IsEnum(ConfidenceLevel)
  minConfidence?: ConfidenceLevel;
}
