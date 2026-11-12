import { BadRequestException, Injectable } from '@nestjs/common';
import { Incident, IncidentStatus, Prisma, Severity } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateIncidentDto } from './dto/create-incident.dto';
import type { IncidentSummaryResponseDto } from './dto/incident-response.dto';

type IncidentWithCount = Incident & {
  _count: {
    abuseReports: number;
  };
};

const MAX_FUTURE_DRIFT_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class IncidentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(userId: string): Promise<IncidentSummaryResponseDto[]> {
    const incidents = await this.prisma.incident.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        _count: {
          select: { abuseReports: true },
        },
      },
    });

    return incidents.map((item) => this.toResponseDto(item));
  }

  async createForUser(
    userId: string,
    dto: CreateIncidentDto,
  ): Promise<IncidentSummaryResponseDto> {
    let occurredAt: Date | null = null;
    if (dto.occurredAt) {
      const parsed = new Date(dto.occurredAt);
      if (
        Number.isNaN(parsed.getTime()) ||
        parsed.getTime() > Date.now() + MAX_FUTURE_DRIFT_MS
      ) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Occurred date must be valid and not in the future',
        });
      }
      occurredAt = parsed;
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
        },
        include: {
          _count: {
            select: { abuseReports: true },
          },
        },
      });

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
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });

      return incident;
    });

    return this.toResponseDto(created);
  }

  private toResponseDto(
    incident: IncidentWithCount,
  ): IncidentSummaryResponseDto {
    return {
      id: incident.id,
      userId: incident.userId,
      title: incident.title,
      description: incident.description,
      status: incident.status,
      severity: incident.severity,
      category: incident.category,
      occurredAt: incident.occurredAt,
      resolvedAt: incident.resolvedAt,
      reportCount: incident._count.abuseReports,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    };
  }
}
