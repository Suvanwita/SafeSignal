import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertOwnedResource } from '../../common';
import { PrismaService } from '../../prisma/prisma.service';
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

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Scans text content for sensitive personal data (emails, Indian phones, international phones, addresses).
   * If incidentId and userId are provided, records a PRIVACY_SCAN_COMPLETED timeline event.
   *
   * Note: Pure in-memory processing. Text content is NEVER sent to external APIs or stored in DB tables.
   */
  async scanText(
    dto: ScanSensitiveTextDto,
    userId?: string,
  ): Promise<ScanSensitiveTextResponseDto> {
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

    const executionTimeMs =
      Math.round((performance.now() - startTime) * 100) / 100;

    // Log timeline event if incidentId is provided and user is authenticated
    if (dto.incidentId && userId) {
      const incident = await this.prisma.incident.findUnique({
        where: { id: dto.incidentId },
      });
      assertOwnedResource(incident, userId, 'Incident');

      const detectedSummary = Object.entries(categoryBreakdown)
        .filter(([_, count]) => count > 0)
        .map(([cat, count]) => `${cat}: ${count}`)
        .join(', ');

      const now = new Date();

      await this.prisma.timelineEvent.create({
        data: {
          userId,
          incidentId: dto.incidentId,
          eventType: 'PRIVACY_SCAN_COMPLETED',
          title:
            matches.length > 0
              ? `Privacy scan completed (${matches.length} sensitive items detected)`
              : `Privacy scan completed (Clean - no sensitive PII found)`,
          description:
            matches.length > 0
              ? `Detected sensitive information: ${detectedSummary}.`
              : `Deterministic scan evaluated ${dto.text.length} characters. No personal data detected.`,
          metadata: {
            totalDetections: matches.length,
            categoryBreakdown,
            scannedLength: dto.text.length,
            hasSensitiveData: matches.length > 0,
            executionTimeMs,
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
    }

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
   * Scans all textual content within an incident case (title, description, abuse reports, evidence)
   * for sensitive personal information and records a PRIVACY_SCAN_COMPLETED timeline event.
   */
  async scanIncidentForUser(
    userId: string,
    incidentId: string,
  ): Promise<ScanSensitiveTextResponseDto> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        abuseReports: {
          select: { title: true, description: true, platform: true },
        },
        evidence: {
          select: { title: true, description: true },
        },
      },
    });

    assertOwnedResource(incident, userId, 'Incident');

    const sections: string[] = [`Incident Case: ${incident.title}`];
    if (incident.description) {
      sections.push(`Description: ${incident.description}`);
    }
    for (const r of incident.abuseReports) {
      sections.push(`Report (${r.platform}): ${r.title}\n${r.description}`);
    }
    for (const e of incident.evidence) {
      sections.push(`Evidence: ${e.title}\n${e.description ?? ''}`);
    }

    const aggregatedText = sections.join('\n\n');

    return this.scanText(
      {
        text: aggregatedText,
        incidentId,
      },
      userId,
    );
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

    const executionTimeMs =
      Math.round((performance.now() - startTime) * 100) / 100;

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
