import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IncidentStatus,
  Prisma,
  Severity,
} from '@prisma/client';
import { assertOwnedResource } from '../../common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AttachEvidenceDto } from './dto/attach-evidence.dto';
import type { CloseIncidentDto } from './dto/close-incident.dto';
import type { CreateIncidentDto } from './dto/create-incident.dto';
import type {
  IncidentDetailResponseDto,
  IncidentSummaryResponseDto,
} from './dto/incident-response.dto';
import type { LinkProfilesDto } from './dto/link-profiles.dto';
import type { LinkReportsDto } from './dto/link-reports.dto';
import type { ListIncidentsQueryDto } from './dto/list-incidents-query.dto';
import type { ListTimelineQueryDto } from './dto/list-timeline-query.dto';
import type { PaginatedTimelineResponseDto } from './dto/paginated-timeline-response.dto';
import type { ReopenIncidentDto } from './dto/reopen-incident.dto';
import type { UpdateIncidentStatusDto } from './dto/update-incident-status.dto';
import type { UpdateIncidentDto } from './dto/update-incident.dto';

const MAX_FUTURE_DRIFT_MS = 24 * 60 * 60 * 1000;

const INCIDENT_SUMMARY_INCLUDE = {
  officialAccount: {
    select: {
      id: true,
      platform: true,
      handle: true,
      displayName: true,
      profileUrl: true,
      verified: true,
      isPrimary: true,
    },
  },
  suspiciousProfile: {
    select: {
      id: true,
      platform: true,
      handle: true,
      displayName: true,
      profileUrl: true,
      reviewStatus: true,
    },
  },
  _count: {
    select: {
      abuseReports: true,
      evidence: true,
      timelineEvents: true,
      suspiciousProfiles: true,
    },
  },
} satisfies Prisma.IncidentInclude;

const INCIDENT_DETAIL_INCLUDE = {
  ...INCIDENT_SUMMARY_INCLUDE,
  abuseReports: {
    orderBy: [{ incidentDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      platform: true,
      severity: true,
      incidentDate: true,
      targetUrl: true,
      referenceNumber: true,
      reportStatus: true,
      submittedAt: true,
      createdAt: true,
    },
  },
  evidence: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      incidentId: true,
      abuseReportId: true,
      title: true,
      description: true,
      sourceUrl: true,
      storageKey: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      sha256: true,
      capturedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  timelineEvents: {
    orderBy: { occurredAt: 'desc' },
    select: {
      id: true,
      incidentId: true,
      eventType: true,
      title: true,
      description: true,
      metadata: true,
      occurredAt: true,
      createdAt: true,
    },
  },
  suspiciousProfiles: {
    select: {
      suspiciousProfile: {
        select: {
          id: true,
          platform: true,
          handle: true,
          displayName: true,
          profileUrl: true,
          reviewStatus: true,
        },
      },
    },
  },
} satisfies Prisma.IncidentInclude;

type IncidentSummaryPayload = Prisma.IncidentGetPayload<{
  include: typeof INCIDENT_SUMMARY_INCLUDE;
}>;

type IncidentDetailPayload = Prisma.IncidentGetPayload<{
  include: typeof INCIDENT_DETAIL_INCLUDE;
}>;

@Injectable()
export class IncidentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(
    userId: string,
    query: ListIncidentsQueryDto = {},
  ): Promise<IncidentSummaryResponseDto[]> {
    const where: Prisma.IncidentWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const incidents = await this.prisma.incident.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: INCIDENT_SUMMARY_INCLUDE,
    });

    return incidents.map((item) => this.toSummaryResponseDto(item));
  }

  async findOneForUser(
    userId: string,
    incidentId: string,
  ): Promise<IncidentDetailResponseDto> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: INCIDENT_DETAIL_INCLUDE,
    });

    assertOwnedResource(incident, userId, 'Incident');
    return this.toDetailResponseDto(incident);
  }

  async createForUser(
    userId: string,
    dto: CreateIncidentDto,
  ): Promise<IncidentDetailResponseDto> {
    const occurredAt = dto.occurredAt
      ? this.parseAndValidateDate(dto.occurredAt, 'Occurred date')
      : null;

    if (dto.officialAccountId) {
      await this.verifyOwnedOfficialAccount(userId, dto.officialAccountId);
    }
    if (dto.suspiciousProfileId) {
      await this.verifyOwnedSuspiciousProfile(userId, dto.suspiciousProfileId);
    }

    const now = new Date();
    const severity = dto.severity ?? Severity.MEDIUM;

    const created = await this.prisma.$transaction(async (tx) => {
      const incident = await tx.incident.create({
        data: {
          userId,
          title: dto.title,
          description: dto.description ?? null,
          status: IncidentStatus.OPEN,
          severity,
          category: dto.category,
          occurredAt,
          officialAccountId: dto.officialAccountId ?? null,
          suspiciousProfileId: dto.suspiciousProfileId ?? null,
        },
      });

      if (dto.suspiciousProfileId) {
        await tx.incidentSuspiciousProfile.create({
          data: {
            userId,
            incidentId: incident.id,
            suspiciousProfileId: dto.suspiciousProfileId,
          },
        });
      }

      await tx.timelineEvent.create({
        data: {
          userId,
          incidentId: incident.id,
          eventType: 'INCIDENT_CREATED',
          title: `Incident opened: ${incident.title}`,
          description: `${incident.category} (${incident.severity})`,
          metadata: {
            category: incident.category,
            severity: incident.severity,
            officialAccountId: dto.officialAccountId ?? null,
            suspiciousProfileId: dto.suspiciousProfileId ?? null,
            incidentOccurredAt: occurredAt ?? null,
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      return tx.incident.findUniqueOrThrow({
        where: { id: incident.id },
        include: INCIDENT_DETAIL_INCLUDE,
      });
    });

    return this.toDetailResponseDto(created);
  }

  async updateForUser(
    userId: string,
    incidentId: string,
    dto: UpdateIncidentDto,
    auditReason?: string,
  ): Promise<IncidentDetailResponseDto> {
    const existing = await this.prisma.incident.findUnique({
      where: { id: incidentId },
    });
    assertOwnedResource(existing, userId, 'Incident');

    const occurredAt =
      dto.occurredAt !== undefined
        ? this.parseAndValidateDate(dto.occurredAt, 'Occurred date')
        : undefined;

    if (typeof dto.officialAccountId === 'string') {
      await this.verifyOwnedOfficialAccount(userId, dto.officialAccountId);
    }
    if (typeof dto.suspiciousProfileId === 'string') {
      await this.verifyOwnedSuspiciousProfile(userId, dto.suspiciousProfileId);
    }

    const now = new Date();
    const statusChanged = dto.status !== undefined && dto.status !== existing.status;
    const severityChanged =
      dto.severity !== undefined && dto.severity !== existing.severity;

    let resolvedAt: Date | null | undefined = undefined;
    if (statusChanged) {
      if (
        dto.status === IncidentStatus.CLOSED ||
        dto.status === IncidentStatus.RESOLVED
      ) {
        resolvedAt = existing.resolvedAt ?? now;
      } else if (
        dto.status === IncidentStatus.OPEN ||
        dto.status === IncidentStatus.IN_REVIEW ||
        dto.status === IncidentStatus.ESCALATED
      ) {
        resolvedAt = null;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const incident = await tx.incident.update({
        where: { id: incidentId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.category !== undefined ? { category: dto.category } : {}),
          ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(occurredAt !== undefined ? { occurredAt } : {}),
          ...(resolvedAt !== undefined ? { resolvedAt } : {}),
          ...(dto.officialAccountId !== undefined
            ? { officialAccountId: dto.officialAccountId }
            : {}),
          ...(dto.suspiciousProfileId !== undefined
            ? { suspiciousProfileId: dto.suspiciousProfileId }
            : {}),
        },
      });

      if (
        typeof dto.suspiciousProfileId === 'string' &&
        dto.suspiciousProfileId !== existing.suspiciousProfileId
      ) {
        await tx.incidentSuspiciousProfile.upsert({
          where: {
            incidentId_suspiciousProfileId: {
              incidentId,
              suspiciousProfileId: dto.suspiciousProfileId,
            },
          },
          create: {
            userId,
            incidentId,
            suspiciousProfileId: dto.suspiciousProfileId,
          },
          update: {},
        });
      }

      if (statusChanged && dto.status) {
        const { eventType, title, defaultDesc } = this.resolveStatusEventDetails(
          existing.status,
          dto.status,
          incident.title,
        );

        await tx.timelineEvent.create({
          data: {
            userId,
            incidentId,
            eventType,
            title,
            description: auditReason ?? defaultDesc,
            metadata: {
              previousStatus: existing.status,
              newStatus: dto.status,
              reason: auditReason ?? null,
            } as Prisma.InputJsonValue,
            occurredAt: now,
          },
        });
      }

      if (severityChanged && dto.severity) {
        await tx.timelineEvent.create({
          data: {
            userId,
            incidentId,
            eventType: 'SEVERITY_CHANGED',
            title: `Severity changed: ${existing.severity} → ${dto.severity}`,
            description:
              auditReason ??
              `Incident severity adjusted from ${existing.severity} to ${dto.severity}.`,
            metadata: {
              previousSeverity: existing.severity,
              newSeverity: dto.severity,
              reason: auditReason ?? null,
            } as Prisma.InputJsonValue,
            occurredAt: now,
          },
        });
      }

      return tx.incident.findUniqueOrThrow({
        where: { id: incidentId },
        include: INCIDENT_DETAIL_INCLUDE,
      });
    });

    return this.toDetailResponseDto(updated);
  }

  async updateStatusForUser(
    userId: string,
    incidentId: string,
    dto: UpdateIncidentStatusDto,
  ): Promise<IncidentDetailResponseDto> {
    if (!dto.status && !dto.severity) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'At least one of status or severity must be provided',
      });
    }

    return this.updateForUser(
      userId,
      incidentId,
      {
        status: dto.status,
        severity: dto.severity,
      },
      dto.reason,
    );
  }

  async closeForUser(
    userId: string,
    incidentId: string,
    dto: CloseIncidentDto = {},
  ): Promise<IncidentDetailResponseDto> {
    const existing = await this.prisma.incident.findUnique({
      where: { id: incidentId },
    });
    assertOwnedResource(existing, userId, 'Incident');

    if (existing.status === IncidentStatus.CLOSED) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: 'Incident is already closed',
      });
    }

    const now = new Date();
    const reasonText =
      dto.reason ?? dto.resolutionNotes ?? 'Incident was closed and archived.';

    const closed = await this.prisma.$transaction(async (tx) => {
      const incident = await tx.incident.update({
        where: { id: incidentId },
        data: {
          status: IncidentStatus.CLOSED,
          resolvedAt: existing.resolvedAt ?? now,
        },
      });

      await tx.timelineEvent.create({
        data: {
          userId,
          incidentId,
          eventType: 'INCIDENT_CLOSED',
          title: `Incident closed: ${incident.title}`,
          description: reasonText,
          metadata: {
            previousStatus: existing.status,
            newStatus: IncidentStatus.CLOSED,
            reason: dto.reason ?? null,
            resolutionNotes: dto.resolutionNotes ?? null,
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      return tx.incident.findUniqueOrThrow({
        where: { id: incidentId },
        include: INCIDENT_DETAIL_INCLUDE,
      });
    });

    return this.toDetailResponseDto(closed);
  }

  async reopenForUser(
    userId: string,
    incidentId: string,
    dto: ReopenIncidentDto = {},
  ): Promise<IncidentDetailResponseDto> {
    const existing = await this.prisma.incident.findUnique({
      where: { id: incidentId },
    });
    assertOwnedResource(existing, userId, 'Incident');

    if (existing.status === IncidentStatus.OPEN) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: 'Incident is already open',
      });
    }

    const now = new Date();
    const reasonText =
      dto.reason ?? 'Incident was reopened and marked active.';

    const reopened = await this.prisma.$transaction(async (tx) => {
      const incident = await tx.incident.update({
        where: { id: incidentId },
        data: {
          status: IncidentStatus.OPEN,
          resolvedAt: null,
        },
      });

      await tx.timelineEvent.create({
        data: {
          userId,
          incidentId,
          eventType: 'INCIDENT_REOPENED',
          title: `Incident reopened: ${incident.title}`,
          description: reasonText,
          metadata: {
            previousStatus: existing.status,
            newStatus: IncidentStatus.OPEN,
            reason: dto.reason ?? null,
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      return tx.incident.findUniqueOrThrow({
        where: { id: incidentId },
        include: INCIDENT_DETAIL_INCLUDE,
      });
    });

    return this.toDetailResponseDto(reopened);
  }

  async linkReportsForUser(
    userId: string,
    incidentId: string,
    dto: LinkReportsDto,
  ): Promise<IncidentDetailResponseDto> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
    });
    assertOwnedResource(incident, userId, 'Incident');

    const uniqueReportIds = Array.from(new Set(dto.reportIds));
    const reports = await this.prisma.abuseReport.findMany({
      where: { id: { in: uniqueReportIds } },
    });

    if (reports.length !== uniqueReportIds.length) {
      throw new NotFoundException('One or more abuse reports were not found');
    }

    for (const report of reports) {
      assertOwnedResource(report, userId, 'Abuse report');
    }

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.abuseReport.updateMany({
        where: { id: { in: uniqueReportIds }, userId },
        data: { incidentId },
      });

      for (const report of reports) {
        if (report.incidentId !== incidentId) {
          await tx.timelineEvent.create({
            data: {
              userId,
              incidentId,
              eventType: 'ABUSE_REPORT_LINKED',
              title: `Abuse report linked: ${report.title}`,
              description: `${report.category} (${report.severity}) on ${report.platform}.`,
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
      }

      return tx.incident.findUniqueOrThrow({
        where: { id: incidentId },
        include: INCIDENT_DETAIL_INCLUDE,
      });
    });

    return this.toDetailResponseDto(result);
  }

  async unlinkReportForUser(
    userId: string,
    incidentId: string,
    reportId: string,
  ): Promise<IncidentDetailResponseDto> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
    });
    assertOwnedResource(incident, userId, 'Incident');

    const report = await this.prisma.abuseReport.findUnique({
      where: { id: reportId },
    });
    assertOwnedResource(report, userId, 'Abuse report');

    if (report.incidentId !== incidentId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'This abuse report is not currently linked to this incident',
      });
    }

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.abuseReport.update({
        where: { id: reportId },
        data: { incidentId: null },
      });

      await tx.timelineEvent.create({
        data: {
          userId,
          incidentId,
          eventType: 'ABUSE_REPORT_UNLINKED',
          title: `Abuse report unlinked: ${report.title}`,
          description: `Report unlinked from incident.`,
          metadata: {
            abuseReportId: report.id,
            category: report.category,
            platform: report.platform,
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      return tx.incident.findUniqueOrThrow({
        where: { id: incidentId },
        include: INCIDENT_DETAIL_INCLUDE,
      });
    });

    return this.toDetailResponseDto(result);
  }

  async linkProfilesForUser(
    userId: string,
    incidentId: string,
    dto: LinkProfilesDto,
  ): Promise<IncidentDetailResponseDto> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
    });
    assertOwnedResource(incident, userId, 'Incident');

    const uniqueProfileIds = Array.from(new Set(dto.profileIds));
    const profiles = await this.prisma.suspiciousProfile.findMany({
      where: { id: { in: uniqueProfileIds } },
    });

    if (profiles.length !== uniqueProfileIds.length) {
      throw new NotFoundException('One or more suspicious profiles were not found');
    }

    for (const profile of profiles) {
      assertOwnedResource(profile, userId, 'Suspicious profile');
    }

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      for (const profile of profiles) {
        await tx.incidentSuspiciousProfile.upsert({
          where: {
            incidentId_suspiciousProfileId: {
              incidentId,
              suspiciousProfileId: profile.id,
            },
          },
          create: {
            userId,
            incidentId,
            suspiciousProfileId: profile.id,
            notes: dto.notes ?? null,
          },
          update: {
            notes: dto.notes ?? undefined,
          },
        });

        await tx.timelineEvent.create({
          data: {
            userId,
            incidentId,
            eventType: 'PROFILE_LINKED',
            title: `Suspicious profile linked: @${profile.handle}`,
            description: `${profile.platform} @${profile.handle} linked to incident.`,
            metadata: {
              suspiciousProfileId: profile.id,
              platform: profile.platform,
              handle: profile.handle,
            } as Prisma.InputJsonValue,
            occurredAt: now,
          },
        });
      }

      return tx.incident.findUniqueOrThrow({
        where: { id: incidentId },
        include: INCIDENT_DETAIL_INCLUDE,
      });
    });

    return this.toDetailResponseDto(result);
  }

  async unlinkProfileForUser(
    userId: string,
    incidentId: string,
    profileId: string,
  ): Promise<IncidentDetailResponseDto> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
    });
    assertOwnedResource(incident, userId, 'Incident');

    const profile = await this.prisma.suspiciousProfile.findUnique({
      where: { id: profileId },
    });
    assertOwnedResource(profile, userId, 'Suspicious profile');

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.incidentSuspiciousProfile.deleteMany({
        where: { incidentId, suspiciousProfileId: profileId },
      });

      if (incident.suspiciousProfileId === profileId) {
        await tx.incident.update({
          where: { id: incidentId },
          data: { suspiciousProfileId: null },
        });
      }

      await tx.timelineEvent.create({
        data: {
          userId,
          incidentId,
          eventType: 'PROFILE_UNLINKED',
          title: `Suspicious profile unlinked: @${profile.handle}`,
          description: `@${profile.handle} unlinked from incident.`,
          metadata: {
            suspiciousProfileId: profile.id,
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      return tx.incident.findUniqueOrThrow({
        where: { id: incidentId },
        include: INCIDENT_DETAIL_INCLUDE,
      });
    });

    return this.toDetailResponseDto(result);
  }

  async attachEvidenceForUser(
    userId: string,
    incidentId: string,
    dto: AttachEvidenceDto,
  ): Promise<IncidentDetailResponseDto> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
    });
    assertOwnedResource(incident, userId, 'Incident');

    if (dto.abuseReportId) {
      const report = await this.prisma.abuseReport.findUnique({
        where: { id: dto.abuseReportId },
      });
      assertOwnedResource(report, userId, 'Abuse report');
      if (report.incidentId !== null && report.incidentId !== incidentId) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Abuse report belongs to a different incident',
        });
      }
    }

    const capturedAt = dto.capturedAt
      ? this.parseAndValidateDate(dto.capturedAt, 'Captured date')
      : null;

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const evidence = await tx.evidence.create({
        data: {
          userId,
          incidentId,
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
          incidentId,
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
            capturedAt: capturedAt?.toISOString() ?? null,
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      return tx.incident.findUniqueOrThrow({
        where: { id: incidentId },
        include: INCIDENT_DETAIL_INCLUDE,
      });
    });

    return this.toDetailResponseDto(result);
  }

  async getTimelineForUser(
    userId: string,
    incidentId: string,
    query: ListTimelineQueryDto = {},
  ): Promise<PaginatedTimelineResponseDto> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { id: true, userId: true },
    });
    assertOwnedResource(incident, userId, 'Incident');

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;
    const order = query.order === 'asc' ? 'asc' : 'desc';

    const where: Prisma.TimelineEventWhereInput = {
      incidentId,
      userId,
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { eventType: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, events] = await Promise.all([
      this.prisma.timelineEvent.count({ where }),
      this.prisma.timelineEvent.findMany({
        where,
        orderBy: [{ occurredAt: order }, { createdAt: order }],
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      events: events.map((e) => ({
        id: e.id,
        incidentId: e.incidentId,
        eventType: e.eventType,
        title: e.title,
        description: e.description,
        metadata: e.metadata,
        occurredAt: e.occurredAt,
        createdAt: e.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  private resolveStatusEventDetails(
    oldStatus: IncidentStatus,
    newStatus: IncidentStatus,
    title: string,
  ): { eventType: string; title: string; defaultDesc: string } {
    switch (newStatus) {
      case IncidentStatus.ESCALATED:
        return {
          eventType: 'INCIDENT_ESCALATED',
          title: `Incident escalated: ${title}`,
          defaultDesc: `Incident status escalated from ${oldStatus} to ${newStatus}.`,
        };
      case IncidentStatus.RESOLVED:
        return {
          eventType: 'INCIDENT_RESOLVED',
          title: `Incident resolved: ${title}`,
          defaultDesc: `Incident marked as resolved.`,
        };
      case IncidentStatus.CLOSED:
        return {
          eventType: 'INCIDENT_CLOSED',
          title: `Incident closed: ${title}`,
          defaultDesc: `Incident status closed.`,
        };
      case IncidentStatus.OPEN:
        return {
          eventType: 'INCIDENT_REOPENED',
          title: `Incident reopened: ${title}`,
          defaultDesc: `Incident status changed to Open.`,
        };
      case IncidentStatus.IN_REVIEW:
      default:
        return {
          eventType: 'STATUS_CHANGED',
          title: `Status updated: In Review`,
          defaultDesc: `Incident status updated from ${oldStatus} to ${newStatus}.`,
        };
    }
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

  private async verifyOwnedOfficialAccount(
    userId: string,
    officialAccountId: string,
  ): Promise<void> {
    const account = await this.prisma.officialAccount.findUnique({
      where: { id: officialAccountId },
      select: { id: true, userId: true },
    });
    assertOwnedResource(account, userId, 'Official account');
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

  private toSummaryResponseDto(
    incident: IncidentSummaryPayload,
  ): IncidentSummaryResponseDto {
    return {
      id: incident.id,
      userId: incident.userId,
      officialAccountId: incident.officialAccountId,
      suspiciousProfileId: incident.suspiciousProfileId,
      title: incident.title,
      description: incident.description,
      status: incident.status,
      severity: incident.severity,
      category: incident.category,
      occurredAt: incident.occurredAt,
      resolvedAt: incident.resolvedAt,
      reportCount: incident._count.abuseReports,
      evidenceCount: incident._count.evidence,
      timelineEventCount: incident._count.timelineEvents,
      suspiciousProfileCount: incident._count.suspiciousProfiles,
      officialAccount: incident.officialAccount ?? null,
      suspiciousProfile: incident.suspiciousProfile ?? null,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    };
  }

  private toDetailResponseDto(
    incident: IncidentDetailPayload,
  ): IncidentDetailResponseDto {
    const summary = this.toSummaryResponseDto(incident);

    // Merge primary suspicious profile and junction suspicious profiles deduplicated by id
    const profileMap = new Map<string, typeof summary.suspiciousProfile>();
    if (incident.suspiciousProfile) {
      profileMap.set(incident.suspiciousProfile.id, incident.suspiciousProfile);
    }
    for (const link of incident.suspiciousProfiles) {
      if (link.suspiciousProfile) {
        profileMap.set(link.suspiciousProfile.id, link.suspiciousProfile);
      }
    }

    return {
      ...summary,
      abuseReports: incident.abuseReports,
      suspiciousProfiles: Array.from(profileMap.values()).filter(
        (p): p is NonNullable<typeof p> => p !== null,
      ),
      evidence: incident.evidence,
      timelineEvents: incident.timelineEvents,
    };
  }
}
