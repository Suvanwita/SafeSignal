import { BadRequestException, Injectable } from '@nestjs/common';
import { AbuseReport, IncidentStatus, Prisma } from '@prisma/client';
import { assertOwnedResource } from '../../common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AbuseReportResponseDto,
  DeleteAbuseReportResponseDto,
} from './dto/abuse-report-response.dto';
import type { CreateAbuseReportDto } from './dto/create-abuse-report.dto';
import type { ListAbuseReportsQueryDto } from './dto/list-abuse-reports-query.dto';
import type { UpdateAbuseReportDto } from './dto/update-abuse-report.dto';

type AbuseReportWithIncident = AbuseReport & {
  incident: {
    id: string;
    title: string;
    status: IncidentStatus;
  } | null;
};

const INCIDENT_SUMMARY_INCLUDE = {
  incident: {
    select: {
      id: true,
      title: true,
      status: true,
    },
  },
} as const;

const MAX_FUTURE_DRIFT_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AbuseService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(
    userId: string,
    query: ListAbuseReportsQueryDto = {},
  ): Promise<AbuseReportResponseDto[]> {
    if (query.incidentId) {
      await this.verifyOwnedIncident(userId, query.incidentId);
    }

    const reports = await this.prisma.abuseReport.findMany({
      where: {
        userId,
        ...(query.category ? { category: query.category } : {}),
        ...(query.platform ? { platform: query.platform } : {}),
        ...(query.severity ? { severity: query.severity } : {}),
        ...(query.incidentId ? { incidentId: query.incidentId } : {}),
        ...(query.reportStatus ? { reportStatus: query.reportStatus } : {}),
      },
      orderBy: [{ incidentDate: 'desc' }, { createdAt: 'desc' }],
      include: INCIDENT_SUMMARY_INCLUDE,
    });

    return reports.map((report) => this.toResponseDto(report));
  }

  async findOneForUser(
    userId: string,
    reportId: string,
  ): Promise<AbuseReportResponseDto> {
    const report = await this.prisma.abuseReport.findUnique({
      where: { id: reportId },
      include: INCIDENT_SUMMARY_INCLUDE,
    });

    assertOwnedResource(report, userId, 'Abuse report');
    return this.toResponseDto(report);
  }

  async createForUser(
    userId: string,
    dto: CreateAbuseReportDto,
  ): Promise<AbuseReportResponseDto> {
    if (dto.incidentId && dto.newIncidentTitle) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Provide either an existing incidentId or newIncidentTitle, not both',
      });
    }

    const parsedIncidentDate = this.parseAndValidateIncidentDate(
      dto.incidentDate,
    );

    if (dto.incidentId) {
      await this.verifyOwnedIncident(userId, dto.incidentId);
    }
    if (dto.suspiciousProfileId) {
      await this.verifyOwnedSuspiciousProfile(userId, dto.suspiciousProfileId);
    }

    const now = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      let targetIncidentId: string | null = dto.incidentId ?? null;

      if (dto.newIncidentTitle) {
        const createdIncident = await tx.incident.create({
          data: {
            userId,
            title: dto.newIncidentTitle,
            status: IncidentStatus.OPEN,
            severity: dto.severity,
            category: dto.category,
            occurredAt: parsedIncidentDate,
          },
        });
        targetIncidentId = createdIncident.id;

        await tx.timelineEvent.create({
          data: {
            userId,
            incidentId: createdIncident.id,
            eventType: 'INCIDENT_CREATED',
            title: `Incident opened: ${createdIncident.title}`,
            description: `${createdIncident.category} (${createdIncident.severity})`,
            metadata: {
              category: createdIncident.category,
              severity: createdIncident.severity,
            } as Prisma.InputJsonValue,
            occurredAt: now,
          },
        });
      }

      const report = await tx.abuseReport.create({
        data: {
          userId,
          incidentId: targetIncidentId,
          suspiciousProfileId: dto.suspiciousProfileId ?? null,
          title: dto.title,
          description: dto.description,
          category: dto.category,
          platform: dto.platform,
          severity: dto.severity,
          incidentDate: parsedIncidentDate,
          targetUrl: dto.targetUrl ?? null,
          referenceNumber: dto.referenceNumber ?? null,
          reportStatus: 'PENDING',
          submittedAt: now,
        },
        include: INCIDENT_SUMMARY_INCLUDE,
      });

      if (targetIncidentId) {
        await tx.timelineEvent.create({
          data: {
            userId,
            incidentId: targetIncidentId,
            eventType: 'ABUSE_REPORT_CREATED',
            title: `Abuse report filed: ${report.title}`,
            description: `${report.category} (${report.severity}) reported on ${report.platform}.`,
            metadata: {
              abuseReportId: report.id,
              category: report.category,
              platform: report.platform,
              severity: report.severity,
            } as Prisma.InputJsonValue,
            occurredAt: now,
          },
        });
      }

      return report;
    });

    return this.toResponseDto(created);
  }

  async updateForUser(
    userId: string,
    reportId: string,
    dto: UpdateAbuseReportDto,
  ): Promise<AbuseReportResponseDto> {
    if (typeof dto.incidentId === 'string' && dto.newIncidentTitle) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Provide either an existing incidentId or newIncidentTitle, not both',
      });
    }

    const existing = await this.prisma.abuseReport.findUnique({
      where: { id: reportId },
    });
    assertOwnedResource(existing, userId, 'Abuse report');

    const parsedIncidentDate =
      dto.incidentDate !== undefined
        ? this.parseAndValidateIncidentDate(dto.incidentDate)
        : undefined;

    if (typeof dto.incidentId === 'string') {
      await this.verifyOwnedIncident(userId, dto.incidentId);
    }
    if (typeof dto.suspiciousProfileId === 'string') {
      await this.verifyOwnedSuspiciousProfile(userId, dto.suspiciousProfileId);
    }

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      let resolvedIncidentId: string | null | undefined = dto.incidentId;

      if (dto.newIncidentTitle) {
        const createdIncident = await tx.incident.create({
          data: {
            userId,
            title: dto.newIncidentTitle,
            status: IncidentStatus.OPEN,
            severity: dto.severity ?? existing.severity,
            category: dto.category ?? existing.category,
            occurredAt: parsedIncidentDate ?? existing.incidentDate,
          },
        });
        resolvedIncidentId = createdIncident.id;

        await tx.timelineEvent.create({
          data: {
            userId,
            incidentId: createdIncident.id,
            eventType: 'INCIDENT_CREATED',
            title: `Incident opened: ${createdIncident.title}`,
            description: `${createdIncident.category} (${createdIncident.severity})`,
            metadata: {
              category: createdIncident.category,
              severity: createdIncident.severity,
            } as Prisma.InputJsonValue,
            occurredAt: now,
          },
        });
      }

      const newlyLinkedToIncident =
        typeof resolvedIncidentId === 'string' &&
        resolvedIncidentId !== existing.incidentId;

      const report = await tx.abuseReport.update({
        where: { id: reportId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.platform !== undefined ? { platform: dto.platform } : {}),
          ...(parsedIncidentDate !== undefined
            ? { incidentDate: parsedIncidentDate }
            : {}),
          ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
          ...(resolvedIncidentId !== undefined
            ? { incidentId: resolvedIncidentId }
            : {}),
          ...(dto.suspiciousProfileId !== undefined
            ? { suspiciousProfileId: dto.suspiciousProfileId }
            : {}),
          ...(dto.targetUrl !== undefined ? { targetUrl: dto.targetUrl } : {}),
          ...(dto.referenceNumber !== undefined
            ? { referenceNumber: dto.referenceNumber }
            : {}),
          ...(dto.reportStatus !== undefined
            ? { reportStatus: dto.reportStatus }
            : {}),
        },
        include: INCIDENT_SUMMARY_INCLUDE,
      });

      if (newlyLinkedToIncident && resolvedIncidentId) {
        await tx.timelineEvent.create({
          data: {
            userId,
            incidentId: resolvedIncidentId,
            eventType: 'ABUSE_REPORT_LINKED',
            title: `Abuse report linked: ${report.title}`,
            description: `${report.category} (${report.severity}) linked to incident.`,
            metadata: {
              abuseReportId: report.id,
              category: report.category,
              platform: report.platform,
              severity: report.severity,
            } as Prisma.InputJsonValue,
            occurredAt: now,
          },
        });
      }

      return report;
    });

    return this.toResponseDto(updated);
  }

  async removeForUser(
    userId: string,
    reportId: string,
  ): Promise<DeleteAbuseReportResponseDto> {
    const existing = await this.prisma.abuseReport.findUnique({
      where: { id: reportId },
    });
    assertOwnedResource(existing, userId, 'Abuse report');

    await this.prisma.abuseReport.delete({
      where: { id: reportId },
    });

    return {
      deleted: true,
      id: reportId,
    };
  }

  private parseAndValidateIncidentDate(raw: string): Date {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Incident date must be a valid ISO 8601 date string',
      });
    }

    if (parsed.getTime() > Date.now() + MAX_FUTURE_DRIFT_MS) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Incident date cannot be in the future',
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

  private async verifyOwnedSuspiciousProfile(
    userId: string,
    suspiciousProfileId: string,
  ): Promise<void> {
    const profile = await this.prisma.suspiciousProfile.findUnique({
      where: { id: suspiciousProfileId },
      select: { id: true, userId: true },
    });
    assertOwnedResource(profile, userId, 'Suspicious profile');
  }

  private toResponseDto(report: AbuseReportWithIncident): AbuseReportResponseDto {
    return {
      id: report.id,
      userId: report.userId,
      incidentId: report.incidentId,
      suspiciousProfileId: report.suspiciousProfileId,
      title: report.title,
      description: report.description,
      category: report.category,
      platform: report.platform,
      severity: report.severity,
      incidentDate: report.incidentDate,
      targetUrl: report.targetUrl,
      referenceNumber: report.referenceNumber,
      reportStatus: report.reportStatus,
      submittedAt: report.submittedAt,
      incident: report.incident ?? null,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }
}
