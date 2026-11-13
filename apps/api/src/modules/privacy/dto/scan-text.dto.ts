import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  ConfidenceLevel,
  SensitiveCategory,
} from './sensitive-category.enum';

export const MAX_PRIVACY_TEXT_LENGTH = 50_000;

export class ScanSensitiveTextDto {
  @ApiProperty({
    description: 'Raw text content to inspect for sensitive information (max 50,000 characters)',
    example:
      'Please send the settlement to john.doe@example.org or call +91 98765 43210. Address: Flat 402, Green Glen Layout, Bellandur, Bangalore 560103.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Input text cannot be empty' })
  @MaxLength(MAX_PRIVACY_TEXT_LENGTH, {
    message: `Input text cannot exceed ${MAX_PRIVACY_TEXT_LENGTH} characters.`,
  })
  text!: string;

  @ApiPropertyOptional({
    description:
      'Optional subset of sensitive categories to scan for. If omitted, all categories are scanned.',
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
      'Minimum confidence threshold to include in results (LOW, MEDIUM, HIGH). Defaults to LOW.',
    enum: ConfidenceLevel,
    default: ConfidenceLevel.LOW,
  })
  @IsOptional()
  @IsEnum(ConfidenceLevel)
  minConfidence?: ConfidenceLevel;
}
