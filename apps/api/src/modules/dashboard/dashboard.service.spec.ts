import { IncidentStatus, Severity } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    incident: { count: jest.Mock; findMany: jest.Mock };
    evidence: { count: jest.Mock };
    suspiciousProfile: { count: jest.Mock };
    officialAccount: { count: jest.Mock };
    timelineEvent: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      incident: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      evidence: { count: jest.fn() },
      suspiciousProfile: { count: jest.fn() },
      officialAccount: { count: jest.fn() },
      timelineEvent: { findMany: jest.fn() },
    };

    service = new DashboardService(prisma as unknown as PrismaService);
  });

  it('aggregates user-scoped counts, recent activity, recent incidents, and recommendations for a new user', async () => {
    prisma.incident.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    prisma.evidence.count.mockResolvedValueOnce(0);
    prisma.suspiciousProfile.count.mockResolvedValueOnce(0);
    prisma.officialAccount.count.mockResolvedValueOnce(0);
    prisma.timelineEvent.findMany.mockResolvedValueOnce([]);
    prisma.incident.findMany.mockResolvedValueOnce([]);

    const result = await service.getOverview('user-1');

    expect(result.summary).toEqual({
      totalIncidents: 0,
      openIncidents: 0,
      escalatedIncidents: 0,
      evidenceRecords: 0,
      suspiciousProfiles: 0,
      officialAccounts: 0,
    });
    expect(result.recentActivity).toEqual([]);
    expect(result.recentIncidents).toEqual([]);
    expect(result.recommendations.some((r) => r.id === 'register-official-accounts')).toBe(true);
    expect(prisma.incident.count).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('includes escalated recommendation and formats incident/activity items when records exist', async () => {
    const now = new Date('2026-11-12T15:00:00Z');
    prisma.incident.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    prisma.evidence.count.mockResolvedValueOnce(0);
    prisma.suspiciousProfile.count.mockResolvedValueOnce(3);
    prisma.officialAccount.count.mockResolvedValueOnce(2);
    prisma.timelineEvent.findMany.mockResolvedValueOnce([
      {
        id: 'evt-1',
        incidentId: 'inc-1',
        eventType: 'INCIDENT_ESCALATED',
        title: 'Escalated to trust & safety',
        description: 'Ticket submitted',
        occurredAt: now,
        incident: { title: 'Lookalike X handle' },
      },
    ]);
    prisma.incident.findMany.mockResolvedValueOnce([
      {
        id: 'inc-1',
        title: 'Lookalike X handle',
        status: IncidentStatus.ESCALATED,
        severity: Severity.CRITICAL,
        category: 'IMPERSONATION',
        createdAt: now,
        updatedAt: now,
        officialAccount: null,
        suspiciousProfile: { platform: 'X', handle: '@fake_safesignal' },
        _count: { evidence: 0, abuseReports: 1 },
      },
    ]);

    const result = await service.getOverview('user-2');

    expect(result.summary).toEqual({
      totalIncidents: 4,
      openIncidents: 2,
      escalatedIncidents: 1,
      evidenceRecords: 0,
      suspiciousProfiles: 3,
      officialAccounts: 2,
    });
    expect(result.recentActivity[0]).toMatchObject({
      id: 'evt-1',
      incidentTitle: 'Lookalike X handle',
      eventType: 'INCIDENT_ESCALATED',
    });
    expect(result.recentIncidents[0]).toMatchObject({
      id: 'inc-1',
      platform: 'X',
      suspiciousHandle: '@fake_safesignal',
      reportCount: 1,
    });
    expect(result.recommendations.map((r) => r.id)).toEqual(
      expect.arrayContaining([
        'review-escalated-incidents',
        'preserve-evidence-hashes',
      ]),
    );
  });
});
