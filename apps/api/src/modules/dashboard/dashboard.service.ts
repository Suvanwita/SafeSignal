import { Injectable } from '@nestjs/common';
import { IncidentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  DashboardOverviewDto,
  DashboardRecommendationDto,
  DashboardSummaryDto,
} from './dto/dashboard-overview.dto';

const ACTIVE_INCIDENT_STATUSES: IncidentStatus[] = [
  IncidentStatus.OPEN,
  IncidentStatus.IN_REVIEW,
  IncidentStatus.ESCALATED,
];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(userId: string): Promise<DashboardOverviewDto> {
    const [
      totalIncidents,
      openIncidents,
      escalatedIncidents,
      evidenceRecords,
      suspiciousProfiles,
      officialAccounts,
      timelineEvents,
      incidents,
    ] = await Promise.all([
      this.prisma.incident.count({ where: { userId } }),
      this.prisma.incident.count({
        where: {
          userId,
          status: { in: ACTIVE_INCIDENT_STATUSES },
        },
      }),
      this.prisma.incident.count({
        where: {
          userId,
          status: IncidentStatus.ESCALATED,
        },
      }),
      this.prisma.evidence.count({ where: { userId } }),
      this.prisma.suspiciousProfile.count({ where: { userId } }),
      this.prisma.officialAccount.count({ where: { userId } }),
      this.prisma.timelineEvent.findMany({
        where: { userId },
        orderBy: { occurredAt: 'desc' },
        take: 8,
        include: {
          incident: {
            select: {
              title: true,
            },
          },
        },
      }),
      this.prisma.incident.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: {
          officialAccount: {
            select: {
              platform: true,
            },
          },
          suspiciousProfile: {
            select: {
              platform: true,
              handle: true,
            },
          },
          _count: {
            select: {
              evidence: true,
              abuseReports: true,
            },
          },
        },
      }),
    ]);

    const summary: DashboardSummaryDto = {
      totalIncidents,
      openIncidents,
      escalatedIncidents,
      evidenceRecords,
      suspiciousProfiles,
      officialAccounts,
    };

    const recentActivity = timelineEvents.map((event) => ({
      id: event.id,
      incidentId: event.incidentId,
      incidentTitle: event.incident.title,
      eventType: event.eventType,
      title: event.title,
      description: event.description,
      occurredAt: event.occurredAt,
    }));

    const recentIncidents = incidents.map((incident) => ({
      id: incident.id,
      title: incident.title,
      status: incident.status,
      severity: incident.severity,
      category: incident.category,
      platform:
        incident.suspiciousProfile?.platform ??
        incident.officialAccount?.platform ??
        null,
      suspiciousHandle: incident.suspiciousProfile?.handle ?? null,
      evidenceCount: incident._count.evidence,
      reportCount: incident._count.abuseReports,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    }));

    return {
      summary,
      recentActivity,
      recentIncidents,
      recommendations: this.buildRecommendations(summary),
    };
  }

  private buildRecommendations(
    summary: DashboardSummaryDto,
  ): DashboardRecommendationDto[] {
    const recommendations: DashboardRecommendationDto[] = [];

    if (summary.escalatedIncidents > 0) {
      recommendations.push({
        id: 'review-escalated-incidents',
        priority: 'critical',
        category: 'Incident Response',
        title: `Review ${summary.escalatedIncidents} escalated incident${summary.escalatedIncidents === 1 ? '' : 's'}`,
        description:
          'Escalated cases require active follow-up, platform reference tracking, and verified evidence snapshots.',
        actionLabel: 'Inspect incidents',
      });
    }

    if (summary.officialAccounts === 0) {
      recommendations.push({
        id: 'register-official-accounts',
        priority: 'high',
        category: 'Identity Baseline',
        title: 'Register your official accounts',
        description:
          'Add your verified handles and domains so SafeSignal can detect lookalike impersonation profiles.',
        actionLabel: 'Add official identity',
      });
    }

    if (summary.openIncidents > 0 && summary.evidenceRecords === 0) {
      recommendations.push({
        id: 'preserve-evidence-hashes',
        priority: 'high',
        category: 'Evidence Custody',
        title: 'Attach evidence to active incidents',
        description:
          'Preserve screenshots, headers, and URLs with SHA-256 integrity hashes before abusive content is deleted.',
        actionLabel: 'Upload evidence',
      });
    }

    if (summary.suspiciousProfiles > 0 && summary.totalIncidents === 0) {
      recommendations.push({
        id: 'open-incident-for-profiles',
        priority: 'medium',
        category: 'Case Tracking',
        title: 'Link suspicious profiles to an incident',
        description:
          'Group tracked suspicious handles into structured incidents to track abuse reports and timelines.',
        actionLabel: 'Create incident',
      });
    }

    recommendations.push({
      id: 'scan-sensitive-exposure',
      priority: 'info',
      category: 'Privacy Hygiene',
      title: 'Scan text and exports for sensitive PII',
      description:
        'Check public descriptions and evidence metadata for personal phone numbers, addresses, or leaked tokens.',
      actionLabel: 'Run privacy scan',
    });

    if (recommendations.length < 3) {
      recommendations.push({
        id: 'keep-custody-trail-updated',
        priority: 'info',
        category: 'Accountability',
        title: 'Maintain continuous timeline records',
        description:
          'Log platform ticket reference numbers and timestamps to strengthen moderation and legal accountability.',
        actionLabel: 'Review timeline',
      });
    }

    return recommendations.slice(0, 4);
  }
}
