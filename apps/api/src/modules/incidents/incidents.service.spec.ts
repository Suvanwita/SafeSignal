import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AbuseCategory,
  IncidentStatus,
  Platform,
  Severity,
  SuspiciousProfileStatus,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { IncidentsService } from './incidents.service';

describe('IncidentsService', () => {
  let service: IncidentsService;
  let prisma: {
    incident: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    officialAccount: {
      findUnique: jest.Mock;
    };
    suspiciousProfile: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    incidentSuspiciousProfile: {
      create: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    abuseReport: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    evidence: {
      create: jest.Mock;
    };
    timelineEvent: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const userId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const incidentId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const reportId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const profileId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const officialAccountId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  const now = new Date('2026-11-12T10:00:00Z');

  const baseIncident = {
    id: incidentId,
    userId,
    officialAccountId: null,
    suspiciousProfileId: null,
    title: 'Coordinated impersonation and threats',
    description: 'Impersonator targeting official social channels.',
    status: IncidentStatus.OPEN,
    severity: Severity.HIGH,
    category: AbuseCategory.IMPERSONATION,
    occurredAt: now,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
    officialAccount: null,
    suspiciousProfile: null,
    _count: {
      abuseReports: 1,
      evidence: 0,
      timelineEvents: 1,
      suspiciousProfiles: 0,
    },
    abuseReports: [],
    suspiciousProfiles: [],
    evidence: [],
    timelineEvents: [],
  };

  beforeEach(() => {
    const tx = {
      incident: {
        create: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      incidentSuspiciousProfile: {
        create: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      abuseReport: {
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      evidence: {
        create: jest.fn(),
      },
      timelineEvent: {
        create: jest.fn(),
      },
    };

    prisma = {
      incident: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: tx.incident.create,
        update: tx.incident.update,
        findUniqueOrThrow: tx.incident.findUniqueOrThrow,
      },
      officialAccount: {
        findUnique: jest.fn(),
      },
      suspiciousProfile: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      incidentSuspiciousProfile: tx.incidentSuspiciousProfile,
      abuseReport: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: tx.abuseReport.update,
        updateMany: tx.abuseReport.updateMany,
      },
      evidence: tx.evidence,
      timelineEvent: {
        create: tx.timelineEvent.create,
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(async (cb: (txArg: typeof tx) => Promise<unknown>) =>
        cb(tx),
      ),
    };

    service = new IncidentsService(prisma as unknown as PrismaService);
  });

  describe('createForUser', () => {
    it('creates an incident with default OPEN status and generates INCIDENT_CREATED timeline event', async () => {
      const createdRecord = {
        ...baseIncident,
        id: incidentId,
      };

      prisma.incident.create.mockResolvedValueOnce(createdRecord);
      prisma.incident.findUniqueOrThrow.mockResolvedValueOnce(createdRecord);

      const result = await service.createForUser(userId, {
        title: 'Harassment investigation',
        description: 'Detailed narrative',
        category: AbuseCategory.HARASSMENT,
        severity: Severity.HIGH,
      });

      expect(result.id).toBe(incidentId);
      expect(result.status).toBe(IncidentStatus.OPEN);
      expect(result.severity).toBe(Severity.HIGH);
      expect(prisma.incident.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            title: 'Harassment investigation',
            status: IncidentStatus.OPEN,
            severity: Severity.HIGH,
          }),
        }),
      );
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            incidentId,
            eventType: 'INCIDENT_CREATED',
          }),
        }),
      );
    });

    it('rejects future occurredAt dates exceeding 24 hour drift', async () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

      await expect(
        service.createForUser(userId, {
          title: 'Future incident',
          category: AbuseCategory.THREATS,
          occurredAt: futureDate.toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('verifies ownership when linking official account or suspicious profile', async () => {
      prisma.officialAccount.findUnique.mockResolvedValueOnce({
        id: officialAccountId,
        userId: otherUserId,
      });

      await expect(
        service.createForUser(userId, {
          title: 'Unauthorized official account link',
          category: AbuseCategory.IMPERSONATION,
          officialAccountId,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAllForUser', () => {
    it('filters incidents by status, severity, category and search query', async () => {
      prisma.incident.findMany.mockResolvedValueOnce([baseIncident]);

      const results = await service.findAllForUser(userId, {
        status: IncidentStatus.OPEN,
        severity: Severity.HIGH,
        category: AbuseCategory.IMPERSONATION,
        search: 'threats',
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(incidentId);
      expect(prisma.incident.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          status: IncidentStatus.OPEN,
          severity: Severity.HIGH,
          category: AbuseCategory.IMPERSONATION,
          OR: [
            { title: { contains: 'threats', mode: 'insensitive' } },
            { description: { contains: 'threats', mode: 'insensitive' } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }],
        include: expect.any(Object),
      });
    });
  });

  describe('findOneForUser', () => {
    it('returns full incident detail including related reports and evidence', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce(baseIncident);

      const result = await service.findOneForUser(userId, incidentId);

      expect(result.id).toBe(incidentId);
      expect(result.title).toBe(baseIncident.title);
    });

    it('throws NotFoundException when incident does not exist', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce(null);

      await expect(service.findOneForUser(userId, incidentId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when incident belongs to another user', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce({
        ...baseIncident,
        userId: otherUserId,
      });

      await expect(service.findOneForUser(userId, incidentId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateForUser', () => {
    it('emits INCIDENT_ESCALATED and SEVERITY_CHANGED timeline events on escalation', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce({
        ...baseIncident,
        status: IncidentStatus.OPEN,
        severity: Severity.MEDIUM,
      });

      const updatedRecord = {
        ...baseIncident,
        status: IncidentStatus.ESCALATED,
        severity: Severity.CRITICAL,
      };

      prisma.incident.update.mockResolvedValueOnce(updatedRecord);
      prisma.incident.findUniqueOrThrow.mockResolvedValueOnce(updatedRecord);

      const result = await service.updateForUser(
        userId,
        incidentId,
        {
          status: IncidentStatus.ESCALATED,
          severity: Severity.CRITICAL,
        },
        'Escalated due to repeated direct threats',
      );

      expect(result.status).toBe(IncidentStatus.ESCALATED);
      expect(result.severity).toBe(Severity.CRITICAL);
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'INCIDENT_ESCALATED',
          }),
        }),
      );
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'SEVERITY_CHANGED',
          }),
        }),
      );
    });
  });

  describe('closeForUser and reopenForUser', () => {
    it('closes an active incident and records INCIDENT_CLOSED timeline event', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce({
        ...baseIncident,
        status: IncidentStatus.OPEN,
        resolvedAt: null,
      });

      const closedRecord = {
        ...baseIncident,
        status: IncidentStatus.CLOSED,
        resolvedAt: now,
      };

      prisma.incident.update.mockResolvedValueOnce(closedRecord);
      prisma.incident.findUniqueOrThrow.mockResolvedValueOnce(closedRecord);

      const result = await service.closeForUser(userId, incidentId, {
        reason: 'Impersonator suspended by platform.',
      });

      expect(result.status).toBe(IncidentStatus.CLOSED);
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'INCIDENT_CLOSED',
            title: expect.stringContaining('Incident closed'),
          }),
        }),
      );
    });

    it('rejects closing an already closed incident', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce({
        ...baseIncident,
        status: IncidentStatus.CLOSED,
      });

      await expect(
        service.closeForUser(userId, incidentId, { reason: 'Double close' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('reopens a closed incident and records INCIDENT_REOPENED timeline event', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce({
        ...baseIncident,
        status: IncidentStatus.CLOSED,
        resolvedAt: now,
      });

      const reopenedRecord = {
        ...baseIncident,
        status: IncidentStatus.OPEN,
        resolvedAt: null,
      };

      prisma.incident.update.mockResolvedValueOnce(reopenedRecord);
      prisma.incident.findUniqueOrThrow.mockResolvedValueOnce(reopenedRecord);

      const result = await service.reopenForUser(userId, incidentId, {
        reason: 'Offender reappeared with new handle.',
      });

      expect(result.status).toBe(IncidentStatus.OPEN);
      expect(result.resolvedAt).toBeNull();
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'INCIDENT_REOPENED',
          }),
        }),
      );
    });
  });

  describe('linkReportsForUser and unlinkReportForUser', () => {
    it('links owned abuse reports to the incident and creates ABUSE_REPORT_LINKED timeline event', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce(baseIncident);
      prisma.abuseReport.findMany.mockResolvedValueOnce([
        {
          id: reportId,
          userId,
          title: 'Threat DM',
          category: AbuseCategory.THREATS,
          platform: Platform.X,
          severity: Severity.HIGH,
          incidentId: null,
        },
      ]);

      prisma.incident.findUniqueOrThrow.mockResolvedValueOnce({
        ...baseIncident,
        abuseReports: [{ id: reportId, title: 'Threat DM' }],
      });

      const result = await service.linkReportsForUser(userId, incidentId, {
        reportIds: [reportId],
      });

      expect(prisma.abuseReport.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [reportId] }, userId },
        data: { incidentId },
      });
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'ABUSE_REPORT_LINKED',
          }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('rejects linking an abuse report owned by another user', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce(baseIncident);
      prisma.abuseReport.findMany.mockResolvedValueOnce([
        {
          id: reportId,
          userId: otherUserId,
          incidentId: null,
        },
      ]);

      await expect(
        service.linkReportsForUser(userId, incidentId, {
          reportIds: [reportId],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('unlinks report and creates ABUSE_REPORT_UNLINKED timeline event', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce(baseIncident);
      prisma.abuseReport.findUnique.mockResolvedValueOnce({
        id: reportId,
        userId,
        incidentId,
        title: 'Threat DM',
        category: AbuseCategory.THREATS,
        platform: Platform.X,
      });

      prisma.incident.findUniqueOrThrow.mockResolvedValueOnce(baseIncident);

      await service.unlinkReportForUser(userId, incidentId, reportId);

      expect(prisma.abuseReport.update).toHaveBeenCalledWith({
        where: { id: reportId },
        data: { incidentId: null },
      });
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'ABUSE_REPORT_UNLINKED',
          }),
        }),
      );
    });
  });

  describe('attachEvidenceForUser', () => {
    it('creates evidence record linked to incident and generates EVIDENCE_ATTACHED timeline event', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce(baseIncident);

      const createdEvidence = {
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        incidentId,
        userId,
        title: 'Screenshot of threat',
        fileName: 'screen.png',
        mimeType: 'image/png',
        sha256:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };

      prisma.evidence.create.mockResolvedValueOnce(createdEvidence);
      prisma.incident.findUniqueOrThrow.mockResolvedValueOnce(baseIncident);

      await service.attachEvidenceForUser(userId, incidentId, {
        title: 'Screenshot of threat',
        fileName: 'screen.png',
        mimeType: 'image/png',
        sha256:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      });

      expect(prisma.evidence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            incidentId,
            userId,
            title: 'Screenshot of threat',
          }),
        }),
      );
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'EVIDENCE_ATTACHED',
          }),
        }),
      );
    });
  });

  describe('getTimelineForUser', () => {
    it('returns paginated chronological events when user owns the incident', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce({
        id: incidentId,
        userId,
      });

      const mockEvents = [
        {
          id: 'event-1',
          incidentId,
          userId,
          eventType: 'INCIDENT_CREATED',
          title: 'Incident created: Harassment report',
          description: 'Case opened.',
          metadata: {},
          occurredAt: new Date('2026-11-01T10:00:00.000Z'),
          createdAt: new Date('2026-11-01T10:00:00.000Z'),
        },
        {
          id: 'event-2',
          incidentId,
          userId,
          eventType: 'EVIDENCE_ATTACHED',
          title: 'Evidence attached: Threat screenshot',
          description: 'Attached file: screenshot.png',
          metadata: { evidenceId: 'ev-1' },
          occurredAt: new Date('2026-11-01T10:05:00.000Z'),
          createdAt: new Date('2026-11-01T10:05:00.000Z'),
        },
      ];

      prisma.timelineEvent.count.mockResolvedValueOnce(2);
      prisma.timelineEvent.findMany.mockResolvedValueOnce(mockEvents);

      const result = await service.getTimelineForUser(userId, incidentId, {
        page: 1,
        limit: 10,
        order: 'asc',
      });

      expect(prisma.incident.findUnique).toHaveBeenCalledWith({
        where: { id: incidentId },
        select: { id: true, userId: true },
      });
      expect(prisma.timelineEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            incidentId,
            userId,
          }),
          orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
          skip: 0,
          take: 10,
        }),
      );
      expect(result.events).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
        hasMore: false,
      });
    });

    it('filters by eventType and search term if provided', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce({
        id: incidentId,
        userId,
      });

      prisma.timelineEvent.count.mockResolvedValueOnce(1);
      prisma.timelineEvent.findMany.mockResolvedValueOnce([
        {
          id: 'event-3',
          incidentId,
          userId,
          eventType: 'PRIVACY_SCAN_COMPLETED',
          title: 'Privacy scan completed',
          description: 'Automated privacy scan detected sensitive information.',
          metadata: { findingsCount: 2 },
          occurredAt: new Date('2026-11-01T10:10:00.000Z'),
          createdAt: new Date('2026-11-01T10:10:00.000Z'),
        },
      ]);

      const result = await service.getTimelineForUser(userId, incidentId, {
        page: 2,
        limit: 5,
        order: 'desc',
        eventType: 'PRIVACY_SCAN_COMPLETED',
        search: 'scan',
      });

      expect(prisma.timelineEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            incidentId,
            userId,
            eventType: 'PRIVACY_SCAN_COMPLETED',
            OR: [
              { title: { contains: 'scan', mode: 'insensitive' } },
              { description: { contains: 'scan', mode: 'insensitive' } },
              { eventType: { contains: 'scan', mode: 'insensitive' } },
            ],
          }),
          skip: 5,
          take: 5,
          orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        }),
      );
      expect(result.events).toHaveLength(1);
      expect(result.pagination.page).toBe(2);
    });

    it('throws ForbiddenException when incident does not belong to user', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce({
        id: incidentId,
        userId: 'other-user',
      });

      await expect(
        service.getTimelineForUser(userId, incidentId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when incident does not exist', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getTimelineForUser(userId, incidentId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
