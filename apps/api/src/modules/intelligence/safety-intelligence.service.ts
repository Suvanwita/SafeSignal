import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Analysis, AnalysisType, Prisma } from '@prisma/client';
import { assertOwnedResource } from '../../common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AnalyzeSafetyTextDto } from './dto/analyze-safety-text.dto';
import type { ListSafetyAnalysesQueryDto } from './dto/list-safety-analyses.dto';
import type { SafetyAnalysisResponseDto } from './dto/safety-analysis-response.dto';
import { SafetyRuleEngine } from './safety-engine/safety-rule-engine';
import type {
  IncidentContextMetrics,
  SafetyAnalysisResult,
  SafetyEngineOptions,
} from './safety-engine/safety-rule-engine.types';

@Injectable()
export class SafetyIntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

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
          message: 'Specified evidence does not belong to the specified incident',
        });
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
    const shouldPersist = dto.persist !== false;

    if (shouldPersist) {
      savedAnalysis = await this.prisma.$transaction(async (tx) => {
        const created = await tx.analysis.create({
          data: {
            userId,
            incidentId: dto.incidentId ?? null,
            evidenceId: dto.evidenceId ?? null,
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

    const savedAnalysis = await this.prisma.$transaction(async (tx) => {
      const created = await tx.analysis.create({
        data: {
          userId,
          incidentId,
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

    return this.toResponseDto(analysisResult, savedAnalysis, incidentId, null);
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
