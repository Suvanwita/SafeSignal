import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertOwnedResource } from '../../common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateEvidenceDto } from './dto/create-evidence.dto';
import type {
  DeleteEvidenceResponseDto,
  EvidenceResponseDto,
} from './dto/evidence-response.dto';
import type { ListEvidenceQueryDto } from './dto/list-evidence-query.dto';

const MAX_FUTURE_DRIFT_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(
    userId: string,
    query: ListEvidenceQueryDto = {},
  ): Promise<EvidenceResponseDto[]> {
    if (query.incidentId) {
      await this.verifyOwnedIncident(userId, query.incidentId);
    }
    if (query.abuseReportId) {
      await this.verifyOwnedAbuseReport(userId, query.abuseReportId);
    }

    const records = await this.prisma.evidence.findMany({
      where: {
        userId,
        ...(query.incidentId ? { incidentId: query.incidentId } : {}),
        ...(query.abuseReportId ? { abuseReportId: query.abuseReportId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((record) => this.toResponseDto(record));
  }

  async findOneForUser(
    userId: string,
    evidenceId: string,
  ): Promise<EvidenceResponseDto> {
    const record = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
    });

    assertOwnedResource(record, userId, 'Evidence');
    return this.toResponseDto(record);
  }

  async createForUser(
    userId: string,
    dto: CreateEvidenceDto,
  ): Promise<EvidenceResponseDto> {
    await this.verifyOwnedIncident(userId, dto.incidentId);

    if (dto.abuseReportId) {
      await this.verifyOwnedAbuseReportForIncident(
        userId,
        dto.abuseReportId,
        dto.incidentId,
      );
    }

    const capturedAt = dto.capturedAt
      ? this.parseAndValidateDate(dto.capturedAt, 'Captured date')
      : null;

    const now = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const evidence = await tx.evidence.create({
        data: {
          userId,
          incidentId: dto.incidentId,
          abuseReportId: dto.abuseReportId ?? null,
          title: dto.title,
          description: dto.description ?? null,
          sourceUrl: dto.sourceUrl ?? null,
          storageKey: dto.storageKey ?? null,
          fileName: dto.fileName ?? null,
          mimeType: dto.mimeType ?? null,
          fileSize: dto.fileSize ?? null,
          sha256: dto.sha256 ?? null,
          capturedAt,
        },
      });

      await tx.timelineEvent.create({
        data: {
          userId,
          incidentId: dto.incidentId,
          eventType: 'EVIDENCE_ATTACHED',
          title: `Evidence attached: ${evidence.title}`,
          description:
            evidence.fileName !== null
              ? `Attached file: ${evidence.fileName}`
              : (evidence.description ?? 'Evidence attached to incident.'),
          metadata: {
            evidenceId: evidence.id,
            fileName: evidence.fileName,
            mimeType: evidence.mimeType,
            sha256: evidence.sha256,
            abuseReportId: evidence.abuseReportId,
          } as Prisma.InputJsonValue,
          occurredAt: capturedAt ?? now,
        },
      });

      return evidence;
    });

    return this.toResponseDto(created);
  }

  async removeForUser(
    userId: string,
    evidenceId: string,
  ): Promise<DeleteEvidenceResponseDto> {
    const existing = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
    });
    assertOwnedResource(existing, userId, 'Evidence');

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.evidence.delete({
        where: { id: evidenceId },
      });

      await tx.timelineEvent.create({
        data: {
          userId,
          incidentId: existing.incidentId,
          eventType: 'EVIDENCE_REMOVED',
          title: `Evidence removed: ${existing.title}`,
          description: `Evidence record removed from incident.`,
          metadata: {
            evidenceId: existing.id,
            title: existing.title,
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
    });

    return {
      deleted: true,
      id: evidenceId,
    };
  }

  private parseAndValidateDate(raw: string, label: string): Date {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `${label} must be a valid ISO 8601 date string`,
      });
    }

    if (parsed.getTime() > Date.now() + MAX_FUTURE_DRIFT_MS) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `${label} cannot be in the future`,
      });
    }

    return parsed;
  }

  private async verifyOwnedIncident(
    userId: string,
    incidentId: string,
  ): Promise<void> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { id: true, userId: true },
    });
    assertOwnedResource(incident, userId, 'Incident');
  }

  private async verifyOwnedAbuseReport(
    userId: string,
    abuseReportId: string,
  ): Promise<void> {
    const report = await this.prisma.abuseReport.findUnique({
      where: { id: abuseReportId },
      select: { id: true, userId: true },
    });
    assertOwnedResource(report, userId, 'Abuse report');
  }

  private async verifyOwnedAbuseReportForIncident(
    userId: string,
    abuseReportId: string,
    incidentId: string,
  ): Promise<void> {
    const report = await this.prisma.abuseReport.findUnique({
      where: { id: abuseReportId },
      select: { id: true, userId: true, incidentId: true },
    });
    assertOwnedResource(report, userId, 'Abuse report');
    if (report.incidentId !== null && report.incidentId !== incidentId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Abuse report belongs to a different incident',
      });
    }
  }

  private toResponseDto(
    record: Prisma.EvidenceGetPayload<Record<string, never>>,
  ): EvidenceResponseDto {
    return {
      id: record.id,
      userId: record.userId,
      incidentId: record.incidentId,
      abuseReportId: record.abuseReportId,
      title: record.title,
      description: record.description,
      sourceUrl: record.sourceUrl,
      storageKey: record.storageKey,
      fileName: record.fileName,
      mimeType: record.mimeType,
      fileSize: record.fileSize,
      sha256: record.sha256,
      capturedAt: record.capturedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
