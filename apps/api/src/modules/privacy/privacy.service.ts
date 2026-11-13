import { Injectable, Logger } from '@nestjs/common';
import { RedactSensitiveTextResponseDto } from './dto/redact-text-response.dto';
import { RedactSensitiveTextDto } from './dto/redact-text.dto';
import { ScanSensitiveTextResponseDto } from './dto/scan-text-response.dto';
import { ScanSensitiveTextDto } from './dto/scan-text.dto';
import {
  RedactionStrategy,
  SensitiveCategory,
} from './dto/sensitive-category.enum';
import { redactSensitiveData } from './sensitive-detector/redactor';
import { scanSensitiveData } from './sensitive-detector/sensitive-data-detector';

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  /**
   * Scans text content for sensitive personal data (emails, Indian phones, international phones, addresses).
   *
   * Note: Pure in-memory processing. Text content is NEVER sent to external APIs or stored in DB tables.
   */
  async scanText(dto: ScanSensitiveTextDto): Promise<ScanSensitiveTextResponseDto> {
    const startTime = performance.now();

    const matches = scanSensitiveData(dto.text, {
      categories: dto.categories,
      minConfidence: dto.minConfidence,
    });

    const categoryBreakdown: Record<SensitiveCategory, number> = {
      [SensitiveCategory.EMAIL]: 0,
      [SensitiveCategory.PHONE_INDIAN]: 0,
      [SensitiveCategory.PHONE_INTERNATIONAL]: 0,
      [SensitiveCategory.ADDRESS]: 0,
    };

    for (const match of matches) {
      categoryBreakdown[match.category] =
        (categoryBreakdown[match.category] || 0) + 1;
    }

    const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

    return {
      hasSensitiveData: matches.length > 0,
      totalDetections: matches.length,
      detections: matches.map((m) => ({
        category: m.category,
        detectionType: m.detectionType,
        text: m.text,
        start: m.start,
        end: m.end,
        confidence: m.confidence,
        explanation: m.explanation,
      })),
      categoryBreakdown,
      scannedLength: dto.text.length,
      executionTimeMs,
    };
  }

  /**
   * Scans and redacts sensitive information according to configurable strategies.
   *
   * Note: Pure in-memory processing. Text content is NEVER sent to external APIs or stored in DB tables.
   */
  async redactText(
    dto: RedactSensitiveTextDto,
  ): Promise<RedactSensitiveTextResponseDto> {
    const startTime = performance.now();

    const matches = scanSensitiveData(dto.text, {
      categories: dto.categories,
      minConfidence: dto.minConfidence,
    });

    const strategy = dto.strategy ?? RedactionStrategy.CATEGORY_LABEL;

    const { redactedText, appliedRedactions } = redactSensitiveData(
      dto.text,
      matches,
      {
        strategy,
        customPlaceholder: dto.customPlaceholder,
        customCategoryPlaceholders: dto.customCategoryPlaceholders,
      },
    );

    const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

    return {
      redactedText,
      originalLength: dto.text.length,
      redactedLength: redactedText.length,
      redactionCount: appliedRedactions.length,
      appliedStrategy: strategy,
      redactions: appliedRedactions,
      executionTimeMs,
    };
  }
}
