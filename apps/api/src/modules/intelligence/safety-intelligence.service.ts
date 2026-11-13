import crypto from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Analysis, AnalysisType, Prisma } from '@prisma/client';
import { assertOwnedResource } from '../../common';
import { PrismaService } from '../../prisma/prisma.service';
import { VaultStorageService } from '../evidence/vault-storage.service';
import type { AnalyzeSafetyTextDto } from './dto/analyze-safety-text.dto';
import type { ListSafetyAnalysesQueryDto } from './dto/list-safety-analyses.dto';
import type { SafetyAnalysisResponseDto } from './dto/safety-analysis-response.dto';
import { SafetyRuleEngine } from './safety-engine/safety-rule-engine';
import type {
  IncidentContextMetrics,
  SafetyAnalysisResult,
  SafetyEngineOptions,
  SafetyIndicator,
} from './safety-engine/safety-rule-engine.types';

@Injectable()
export class SafetyIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vaultStorageService: VaultStorageService,
  ) {}

  private computeContentHash(prefix: string, content: string): string {
    return crypto
      .createHash('sha256')
      .update(`${prefix}:${content.trim().toLowerCase()}`)
      .digest('hex');
  }

  private async readEvidenceTextContent(
    storageKey: string,
    mimeType?: string | null,
    fileName?: string | null,
  ): Promise<string | null> {
    const isTextFile =
      mimeType === 'text/plain' ||
      fileName?.toLowerCase().endsWith('.txt') ||
      fileName?.toLowerCase().endsWith('.text') ||
      fileName?.toLowerCase().endsWith('.log');

    if (!isTextFile) return null;

    try {
      const { stream } =
        await this.vaultStorageService.getReadStream(storageKey);
      const chunks: Buffer[] = [];
      let totalLength = 0;

      for await (const chunk of stream) {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        chunks.push(buf);
        totalLength += buf.length;
        if (totalLength >= 64 * 1024) break; // Read up to 64KB for safety analysis
      }

      return Buffer.concat(chunks).toString('utf-8');
    } catch {
      return null;
    }
  }

  private detectCrossReportPatterns(
    currentText: string,
    otherReports: {
      id: string;
      title: string;
      description: string;
      category: string;
    }[],
  ): { indicator: SafetyIndicator | null; matchedCount: number } {
    if (!otherReports || otherReports.length === 0) {
      return { indicator: null, matchedCount: 0 };
    }

    const otherTexts = otherReports.map(
      (r) => `${r.title} ${r.description} ${r.category}`.toLowerCase(),
    );

    const { indicators: currentIndicators } =
      SafetyRuleEngine.analyze(currentText);
    const commonTerms: string[] = [];
    let matchingReportsCount = 0;

    for (const ind of currentIndicators) {
      for (const term of ind.matchedTerms) {
        const matchingOther = otherTexts.filter((ot) =>
          ot.includes(term.toLowerCase()),
        );
        if (matchingOther.length > 0) {
          commonTerms.push(term);
          matchingReportsCount = Math.max(
            matchingReportsCount,
            matchingOther.length,
          );
        }
      }
    }

    const uniqueTerms = Array.from(new Set(commonTerms));
    if (uniqueTerms.length > 0 && matchingReportsCount > 0) {
      return {
        indicator: {
          id: 'INCIDENT_CROSS_REPORT_REPETITION',
          category: 'REPEATED_ACTIVITY',
          severity: matchingReportsCount >= 2 ? 'HIGH' : 'MEDIUM',
          title: 'Recurring Harassment/Threat Cues Across Incident Reports',
          explanation: `Identified common hostile or threatening patterns ("${uniqueTerms
            .slice(0, 3)
            .join(
              '", "',
            )}") recurring across ${matchingReportsCount + 1} abuse reports in this incident. Indicates sustained targeting.`,
          matchedTerms: uniqueTerms.slice(0, 5),
          occurrences: uniqueTerms.length + matchingReportsCount,
        },
        matchedCount: matchingReportsCount,
      };
    }

    return { indicator: null, matchedCount: 0 };
  }

  async analyzeTextForUser(
    userId: string,
    dto: AnalyzeSafetyTextDto,
  ): Promise<SafetyAnalysisResponseDto> {
    let incidentContext: IncidentContextMetrics | undefined;

    if (dto.incidentId) {
      const incident = await this.prisma.incident.findUnique({
        where: { id: dto.incidentId },
        include: {
          abuseReports: { select: { severity: true } },
          suspiciousProfiles: { select: { id: true } },
          timelineEvents: { select: { id: true } },
        },
      });
      assertOwnedResource(incident, userId, 'Incident');

      incidentContext = {
        reportCount: incident.abuseReports.length,
        profileCount: incident.suspiciousProfiles.length,
        timelineEventCount: incident.timelineEvents.length,
        highSeverityReportsCount: incident.abuseReports.filter(
          (r) => r.severity === 'HIGH' || r.severity === 'CRITICAL',
        ).length,
      };
    }

    if (dto.evidenceId) {
      const evidence = await this.prisma.evidence.findUnique({
        where: { id: dto.evidenceId },
        select: { id: true, userId: true, incidentId: true },
      });
      assertOwnedResource(evidence, userId, 'Evidence');

      if (dto.incidentId && evidence.incidentId !== dto.incidentId) {
        throw new BadRequestException({
          code: 'INVALID_ASSOCIATION',
          message:
            'Specified evidence does not belong to the specified incident',
        });
      }
    }

    if (dto.abuseReportId) {
      const report = await this.prisma.abuseReport.findUnique({
        where: { id: dto.abuseReportId },
        select: { id: true, userId: true, incidentId: true },
      });
      assertOwnedResource(report, userId, 'Abuse report');

      if (dto.incidentId && report.incidentId !== dto.incidentId) {
        throw new BadRequestException({
          code: 'INVALID_ASSOCIATION',
          message:
            'Specified abuse report does not belong to the specified incident',
        });
      }
    }

    const shouldPersist = dto.persist !== false;
    const contentHash = this.computeContentHash(
      `text:${dto.incidentId ?? ''}:${dto.evidenceId ?? ''}:${dto.abuseReportId ?? ''}`,
      dto.text,
    );

    // Deduplication check: Avoid duplicate analysis records when same content is submitted repeatedly
    if (shouldPersist) {
      const existing = await this.prisma.analysis.findFirst({
        where: {
          userId,
          type: AnalysisType.SAFETY_INTELLIGENCE,
          contentHash,
          incidentId: dto.incidentId ?? null,
          evidenceId: dto.evidenceId ?? null,
          abuseReportId: dto.abuseReportId ?? null,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        const rawResult = existing.result as unknown as SafetyAnalysisResult;
        return this.toResponseDto(
          rawResult,
          existing,
          existing.incidentId,
          existing.evidenceId,
          existing.abuseReportId,
        );
      }
    }

    const options: SafetyEngineOptions = {
      customAbuseKeywords: dto.customAbuseKeywords,
      customThreatKeywords: dto.customThreatKeywords,
      customHarassmentKeywords: dto.customHarassmentKeywords,
      incidentContext,
    };

    const analysisResult = SafetyRuleEngine.analyze(dto.text, options);

    let savedAnalysis: Analysis | undefined;

    if (shouldPersist) {
      savedAnalysis = await this.prisma.$transaction(async (tx) => {
        const created = await tx.analysis.create({
          data: {
            userId,
            incidentId: dto.incidentId ?? null,
            evidenceId: dto.evidenceId ?? null,
            abuseReportId: dto.abuseReportId ?? null,
            contentHash,
            type: AnalysisType.SAFETY_INTELLIGENCE,
            summary: analysisResult.summary,
            confidence: Number((analysisResult.overallScore / 100).toFixed(4)),
            result: analysisResult as unknown as Prisma.InputJsonValue,
          },
        });

        if (dto.incidentId) {
          await tx.timelineEvent.create({
            data: {
              userId,
              incidentId: dto.incidentId,
              eventType: 'SAFETY_ANALYSIS_COMPLETED',
              title: `Safety Intelligence: ${analysisResult.riskLevel} Risk (${analysisResult.category})`,
              description: analysisResult.summary,
              metadata: {
                analysisId: created.id,
                category: analysisResult.category,
                riskLevel: analysisResult.riskLevel,
                overallScore: analysisResult.overallScore,
                indicatorCount: analysisResult.indicators.length,
              } as Prisma.InputJsonValue,
            },
          });
        }

        return created;
      });
    }

    return this.toResponseDto(
      analysisResult,
      savedAnalysis,
      dto.incidentId,
      dto.evidenceId,
      dto.abuseReportId,
    );
  }

  async analyzeAbuseReportForUser(
    userId: string,
    abuseReportId: string,
    optionsDto?: Partial<AnalyzeSafetyTextDto>,
  ): Promise<SafetyAnalysisResponseDto> {
    const report = await this.prisma.abuseReport.findUnique({
      where: { id: abuseReportId },
      include: {
        incident: {
          include: {
            abuseReports: {
              select: {
                id: true,
                title: true,
                description: true,
                category: true,
                severity: true,
              },
            },
            suspiciousProfiles: { select: { id: true } },
            timelineEvents: { select: { id: true } },
          },
        },
      },
    });

    assertOwnedResource(report, userId, 'Abuse report');

    const reportContent = [
      `Abuse Report: ${report.title}`,
      `Category: ${report.category}`,
      `Platform: ${report.platform}`,
      `Description: ${report.description}`,
      report.targetUrl ? `Target URL: ${report.targetUrl}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const contentHash = this.computeContentHash(
      `abuseReport:${abuseReportId}`,
      reportContent,
    );

    // Deduplication check
    const existing = await this.prisma.analysis.findFirst({
      where: {
        userId,
        type: AnalysisType.SAFETY_INTELLIGENCE,
        abuseReportId,
        contentHash,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const rawResult = existing.result as unknown as SafetyAnalysisResult;
      return this.toResponseDto(
        rawResult,
        existing,
        existing.incidentId,
        existing.evidenceId,
        existing.abuseReportId,
      );
    }

    // Incident context & cross-report repetition detection
    let incidentContext: IncidentContextMetrics | undefined;
    const otherReports = report.incident?.abuseReports.filter(
      (r) => r.id !== abuseReportId,
    );

    if (report.incident) {
      incidentContext = {
        reportCount: report.incident.abuseReports.length,
        profileCount: report.incident.suspiciousProfiles.length,
        timelineEventCount: report.incident.timelineEvents.length,
        highSeverityReportsCount: report.incident.abuseReports.filter(
          (r) => r.severity === 'HIGH' || r.severity === 'CRITICAL',
        ).length,
      };
    }

    const options: SafetyEngineOptions = {
      customAbuseKeywords: optionsDto?.customAbuseKeywords,
      customThreatKeywords: optionsDto?.customThreatKeywords,
      customHarassmentKeywords: optionsDto?.customHarassmentKeywords,
      incidentContext,
    };

    const analysisResult = SafetyRuleEngine.analyze(reportContent, options);

    // Check for repeated indicators across reports belonging to the same incident
    if (otherReports && otherReports.length > 0) {
      const { indicator: crossReportIndicator } =
        this.detectCrossReportPatterns(reportContent, otherReports);
      if (crossReportIndicator) {
        analysisResult.indicators.push(crossReportIndicator);
        analysisResult.explanations.push(
          `[REPEATED_ACTIVITY / ${crossReportIndicator.severity}] ${crossReportIndicator.title}: ${crossReportIndicator.explanation}`,
        );
        if (crossReportIndicator.severity === 'HIGH') {
          analysisResult.riskLevel = 'HIGH';
          analysisResult.overallScore = Math.max(analysisResult.overallScore, 80);
        } else if (analysisResult.riskLevel === 'LOW') {
          analysisResult.riskLevel = 'MEDIUM';
          analysisResult.overallScore = Math.max(analysisResult.overallScore, 45);
        }
      }
    }

    const savedAnalysis = await this.prisma.$transaction(async (tx) => {
      const created = await tx.analysis.create({
        data: {
          userId,
          incidentId: report.incidentId ?? null,
          abuseReportId,
          contentHash,
          type: AnalysisType.SAFETY_INTELLIGENCE,
          summary: analysisResult.summary,
          confidence: Number((analysisResult.overallScore / 100).toFixed(4)),
          result: analysisResult as unknown as Prisma.InputJsonValue,
        },
      });

      if (report.incidentId) {
        await tx.timelineEvent.create({
          data: {
            userId,
            incidentId: report.incidentId,
            eventType: 'REPORT_SAFETY_ANALYZED',
            title: `Report Safety Analysis: ${report.title} (${analysisResult.riskLevel} Risk)`,
            description: analysisResult.summary,
            metadata: {
              analysisId: created.id,
              abuseReportId: report.id,
              category: analysisResult.category,
              riskLevel: analysisResult.riskLevel,
              overallScore: analysisResult.overallScore,
              indicatorCount: analysisResult.indicators.length,
            } as Prisma.InputJsonValue,
          },
        });
      }

      return created;
    });

    return this.toResponseDto(
      analysisResult,
      savedAnalysis,
      report.incidentId,
      null,
      abuseReportId,
    );
  }

  async analyzeIncidentForUser(
    userId: string,
    incidentId: string,
    optionsDto?: Partial<AnalyzeSafetyTextDto>,
  ): Promise<SafetyAnalysisResponseDto> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        abuseReports: true,
        suspiciousProfiles: {
          include: {
            suspiciousProfile: true,
          },
        },
        evidence: true,
        timelineEvents: {
          orderBy: { occurredAt: 'desc' },
          take: 30,
        },
      },
    });

    assertOwnedResource(incident, userId, 'Incident');

    // Aggregate incident textual content
    const textSections: string[] = [];

    textSections.push(`Incident Title: ${incident.title}`);
    if (incident.description) {
      textSections.push(`Incident Description: ${incident.description}`);
    }

    for (const report of incident.abuseReports) {
      textSections.push(
        `Abuse Report: [${report.platform} / ${report.category}] ${report.title}. ${report.description}`,
      );
    }

    for (const link of incident.suspiciousProfiles) {
      const p = link.suspiciousProfile;
      const parts = [`Suspicious Profile: @${p.handle} on ${p.platform}`];
      if (p.displayName) parts.push(`Name: ${p.displayName}`);
      if (p.bio) parts.push(`Bio: ${p.bio}`);
      if (p.notes) parts.push(`Notes: ${p.notes}`);
      textSections.push(parts.join('. '));
    }

    for (const ev of incident.evidence) {
      const evParts = [`Evidence: ${ev.title}`];
      if (ev.description) evParts.push(ev.description);
      textSections.push(evParts.join('. '));
    }

    const aggregatedText = textSections.join('\n\n');
    const contentHash = this.computeContentHash(
      `incident:${incidentId}`,
      aggregatedText,
    );

    // Deduplication check: Avoid duplicate analysis records when incident content has not changed
    const existing = await this.prisma.analysis.findFirst({
      where: {
        userId,
        type: AnalysisType.SAFETY_INTELLIGENCE,
        incidentId,
        contentHash,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const rawResult = existing.result as unknown as SafetyAnalysisResult;
      return this.toResponseDto(
        rawResult,
        existing,
        existing.incidentId,
        existing.evidenceId,
        existing.abuseReportId,
      );
    }

    const incidentContext: IncidentContextMetrics = {
      reportCount: incident.abuseReports.length,
      profileCount: incident.suspiciousProfiles.length,
      timelineEventCount: incident.timelineEvents.length,
      highSeverityReportsCount: incident.abuseReports.filter(
        (r) => r.severity === 'HIGH' || r.severity === 'CRITICAL',
      ).length,
    };

    const options: SafetyEngineOptions = {
      customAbuseKeywords: optionsDto?.customAbuseKeywords,
      customThreatKeywords: optionsDto?.customThreatKeywords,
      customHarassmentKeywords: optionsDto?.customHarassmentKeywords,
      incidentContext,
    };

    const analysisResult = SafetyRuleEngine.analyze(aggregatedText, options);

    // Check for repeated cross-report indicators if incident has multiple reports
    if (incident.abuseReports.length >= 2) {
      const firstReport = incident.abuseReports[0];
      const otherReports = incident.abuseReports.slice(1);
      const { indicator: crossReportIndicator } =
        this.detectCrossReportPatterns(
          `${firstReport.title} ${firstReport.description}`,
          otherReports,
        );

      if (crossReportIndicator) {
        analysisResult.indicators.push(crossReportIndicator);
        analysisResult.explanations.push(
          `[REPEATED_ACTIVITY / ${crossReportIndicator.severity}] ${crossReportIndicator.title}: ${crossReportIndicator.explanation}`,
        );
        if (crossReportIndicator.severity === 'HIGH') {
          analysisResult.riskLevel = 'HIGH';
          analysisResult.overallScore = Math.max(analysisResult.overallScore, 85);
        }
      }
    }

    const savedAnalysis = await this.prisma.$transaction(async (tx) => {
      const created = await tx.analysis.create({
        data: {
          userId,
          incidentId,
          contentHash,
          type: AnalysisType.SAFETY_INTELLIGENCE,
          summary: analysisResult.summary,
          confidence: Number((analysisResult.overallScore / 100).toFixed(4)),
          result: analysisResult as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.timelineEvent.create({
        data: {
          userId,
          incidentId,
          eventType: 'SAFETY_ANALYSIS_COMPLETED',
          title: `Comprehensive Safety Intelligence: ${analysisResult.riskLevel} Risk`,
          description: analysisResult.summary,
          metadata: {
            analysisId: created.id,
            category: analysisResult.category,
            riskLevel: analysisResult.riskLevel,
            overallScore: analysisResult.overallScore,
            indicatorCount: analysisResult.indicators.length,
          } as Prisma.InputJsonValue,
        },
      });

      return created;
    });

    return this.toResponseDto(
      analysisResult,
      savedAnalysis,
      incidentId,
      null,
      null,
    );
  }

  async analyzeEvidenceForUser(
    userId: string,
    evidenceId: string,
    optionsDto?: Partial<AnalyzeSafetyTextDto>,
  ): Promise<SafetyAnalysisResponseDto> {
    const evidence = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
    });

    assertOwnedResource(evidence, userId, 'Evidence');

    const textSections: string[] = [`Evidence Title: ${evidence.title}`];
    if (evidence.description) {
      textSections.push(`Description: ${evidence.description}`);
    }
    if (evidence.sourceUrl) {
      textSections.push(`Source URL: ${evidence.sourceUrl}`);
    }

    // 1. Analyze text extracted from supported evidence files (e.g. TXT file content)
    if (evidence.storageKey) {
      const fileText = await this.readEvidenceTextContent(
        evidence.storageKey,
        evidence.mimeType,
        evidence.fileName,
      );
      if (fileText && fileText.trim().length > 0) {
        textSections.push(`File Content:\n${fileText.trim()}`);
      }
    }

    // 2. Also incorporate metadata text sample if present
    if (evidence.metadata && typeof evidence.metadata === 'object') {
      const meta = evidence.metadata as Record<string, unknown>;
      if (meta.text && typeof meta.text === 'object') {
        const textMeta = meta.text as Record<string, unknown>;
        if (typeof textMeta.sample === 'string') {
          textSections.push(`Extracted Text: ${textMeta.sample}`);
        }
      }
    }

    const aggregatedText = textSections.join('\n\n');
    const contentHash = this.computeContentHash(
      `evidence:${evidenceId}`,
      aggregatedText,
    );

    // Deduplication check: Avoid duplicate analysis records when evidence text is identical
    const existing = await this.prisma.analysis.findFirst({
      where: {
        userId,
        type: AnalysisType.SAFETY_INTELLIGENCE,
        evidenceId,
        contentHash,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const rawResult = existing.result as unknown as SafetyAnalysisResult;
      return this.toResponseDto(
        rawResult,
        existing,
        existing.incidentId,
        existing.evidenceId,
        existing.abuseReportId,
      );
    }

    const options: SafetyEngineOptions = {
      customAbuseKeywords: optionsDto?.customAbuseKeywords,
      customThreatKeywords: optionsDto?.customThreatKeywords,
      customHarassmentKeywords: optionsDto?.customHarassmentKeywords,
    };

    const analysisResult = SafetyRuleEngine.analyze(aggregatedText, options);

    const savedAnalysis = await this.prisma.$transaction(async (tx) => {
      const created = await tx.analysis.create({
        data: {
          userId,
          incidentId: evidence.incidentId,
          evidenceId,
          contentHash,
          type: AnalysisType.SAFETY_INTELLIGENCE,
          summary: analysisResult.summary,
          confidence: Number((analysisResult.overallScore / 100).toFixed(4)),
          result: analysisResult as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.timelineEvent.create({
        data: {
          userId,
          incidentId: evidence.incidentId,
          eventType: 'EVIDENCE_SAFETY_ANALYZED',
          title: `Evidence Safety Analysis: ${evidence.title}`,
          description: `${analysisResult.riskLevel} risk detected (${analysisResult.category}).`,
          metadata: {
            analysisId: created.id,
            evidenceId,
            category: analysisResult.category,
            riskLevel: analysisResult.riskLevel,
          } as Prisma.InputJsonValue,
        },
      });

      return created;
    });

    return this.toResponseDto(
      analysisResult,
      savedAnalysis,
      evidence.incidentId,
      evidenceId,
      null,
    );
  }

  async getAnalysesForUser(
    userId: string,
    query: ListSafetyAnalysesQueryDto,
  ): Promise<SafetyAnalysisResponseDto[]> {
    const where: Prisma.AnalysisWhereInput = {
      userId,
      type: AnalysisType.SAFETY_INTELLIGENCE,
    };

    if (query.incidentId) {
      where.incidentId = query.incidentId;
    }
    if (query.evidenceId) {
      where.evidenceId = query.evidenceId;
    }
    if (query.abuseReportId) {
      where.abuseReportId = query.abuseReportId;
    }

    const records = await this.prisma.analysis.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const dtos: SafetyAnalysisResponseDto[] = [];

    for (const record of records) {
      const rawResult = record.result as unknown as SafetyAnalysisResult;
      if (!rawResult) continue;

      if (query.riskLevel && rawResult.riskLevel !== query.riskLevel) {
        continue;
      }
      if (
        query.category &&
        rawResult.category.toLowerCase() !== query.category.toLowerCase()
      ) {
        continue;
      }

      dtos.push(
        this.toResponseDto(
          rawResult,
          record,
          record.incidentId,
          record.evidenceId,
          record.abuseReportId,
        ),
      );
    }

    return dtos;
  }

  async getAnalysisByIdForUser(
    userId: string,
    id: string,
  ): Promise<SafetyAnalysisResponseDto> {
    const record = await this.prisma.analysis.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'ANALYSIS_NOT_FOUND',
        message: 'Safety analysis record not found',
      });
    }

    assertOwnedResource(record, userId, 'Safety analysis');

    const result = record.result as unknown as SafetyAnalysisResult;
    return this.toResponseDto(
      result,
      record,
      record.incidentId,
      record.evidenceId,
      record.abuseReportId,
    );
  }

  async deleteAnalysisForUser(
    userId: string,
    id: string,
  ): Promise<{ deleted: true; id: string }> {
    const record = await this.prisma.analysis.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'ANALYSIS_NOT_FOUND',
        message: 'Safety analysis record not found',
      });
    }

    assertOwnedResource(record, userId, 'Safety analysis');

    await this.prisma.analysis.delete({
      where: { id },
    });

    return { deleted: true, id };
  }

  private toResponseDto(
    result: SafetyAnalysisResult,
    savedRecord?: Analysis,
    incidentId?: string | null,
    evidenceId?: string | null,
    abuseReportId?: string | null,
  ): SafetyAnalysisResponseDto {
    return {
      id: savedRecord?.id,
      category: result.category,
      secondaryCategories: result.secondaryCategories,
      riskLevel: result.riskLevel,
      overallScore: result.overallScore,
      summary: result.summary,
      indicators: result.indicators,
      explanations: result.explanations,
      suggestedActions: result.suggestedActions,
      disclaimer: result.disclaimer,
      incidentId: incidentId ?? savedRecord?.incidentId ?? null,
      evidenceId: evidenceId ?? savedRecord?.evidenceId ?? null,
      abuseReportId: abuseReportId ?? savedRecord?.abuseReportId ?? null,
      metrics: {
        textLength: result.metrics.textLength,
        wordCount: result.metrics.wordCount,
        repeatedActivity:
          result.metrics.repeatedActivity as unknown as Record<string, unknown>,
      },
      analyzedAt: result.analyzedAt,
      createdAt: savedRecord?.createdAt.toISOString(),
    };
  }
}
