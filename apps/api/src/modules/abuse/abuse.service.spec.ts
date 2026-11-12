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
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AbuseService } from './abuse.service';

describe('AbuseService', () => {
  let service: AbuseService;
  let prisma: {
    abuseReport: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    incident: {
      findUnique: jest.Mock;
    };
    suspiciousProfile: {
      findUnique: jest.Mock;
    };
    timelineEvent: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const userId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const reportId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const incidentId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  const now = new Date('2026-11-12T10:00:00Z');

  const baseReport = {
    id: reportId,
    userId,
    incidentId: null,
    suspiciousProfileId: null,
    title: 'Repeated unwanted direct messages',
    description:
      'Account sent persistent unsolicited messages across three days.',
    category: AbuseCategory.UNWANTED_CONTACT,
    platform: Platform.INSTAGRAM,
    severity: Severity.MEDIUM,
    incidentDate: new Date('2026-11-10T18:00:00Z'),
    targetUrl: 'https://instagram.com/offender',
    referenceNumber: 'IG-1001',
    reportStatus: 'PENDING',
    submittedAt: now,
    incident: null,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    const tx = {
      abuseReport: {
        create: jest.fn(),
        update: jest.fn(),
      },
      timelineEvent: {
        create: jest.fn(),
      },
    };

    prisma = {
      abuseReport: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: tx.abuseReport.create,
        update: tx.abuseReport.update,
        delete: jest.fn(),
      },
      incident: {
        findUnique: jest.fn(),
      },
      suspiciousProfile: {
        findUnique: jest.fn(),
      },
      timelineEvent: {
        create: tx.timelineEvent.create,
      },
      $transaction: jest.fn((cb: (client: typeof tx) => Promise<unknown>) =>
        cb(tx),
      ),
    };

    service = new AbuseService(prisma as unknown as PrismaService);
  });

  describe('createForUser', () => {
    it('creates a standalone abuse report without an incidentId', async () => {
      prisma.abuseReport.create.mockResolvedValue(baseReport);

      const created = await service.createForUser(userId, {
        title: baseReport.title,
        description: baseReport.description,
        category: AbuseCategory.UNWANTED_CONTACT,
        platform: Platform.INSTAGRAM,
        severity: Severity.MEDIUM,
        incidentDate: '2026-11-10T18:00:00.000Z',
        targetUrl: 'https://instagram.com/offender',
        referenceNumber: 'IG-1001',
      });

      expect(prisma.abuseReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            incidentId: null,
            category: AbuseCategory.UNWANTED_CONTACT,
            platform: Platform.INSTAGRAM,
            severity: Severity.MEDIUM,
          }),
        }),
      );
      expect(prisma.timelineEvent.create).not.toHaveBeenCalled();
      expect(created.id).toBe(reportId);
      expect(created.createdAt).toEqual(now);
    });

    it('links to an owned incident and appends a TimelineEvent', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        id: incidentId,
        userId,
      });
      prisma.abuseReport.create.mockResolvedValue({
        ...baseReport,
        incidentId,
        category: AbuseCategory.THREATS,
        severity: Severity.CRITICAL,
        incident: {
          id: incidentId,
          title: 'Ongoing Escalation',
          status: IncidentStatus.OPEN,
        },
      });

      const created = await service.createForUser(userId, {
        title: 'Direct violent threat',
        description: 'Explicit threat sent via direct message.',
        category: AbuseCategory.THREATS,
        platform: Platform.X,
        severity: Severity.CRITICAL,
        incidentDate: '2026-11-11T08:00:00.000Z',
        incidentId,
      });

      expect(created.incidentId).toBe(incidentId);
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            incidentId,
            eventType: 'ABUSE_REPORT_CREATED',
          }),
        }),
      );
    });

    it('rejects linking a report to another user incident', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        id: incidentId,
        userId: otherUserId,
      });

      await expect(
        service.createForUser(userId, {
          title: 'Stalking event',
          description: 'Followed across multiple accounts on the same day.',
          category: AbuseCategory.STALKING,
          platform: Platform.X,
          severity: Severity.HIGH,
          incidentDate: '2026-11-11T08:00:00.000Z',
          incidentId,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.abuseReport.create).not.toHaveBeenCalled();
    });

    it('rejects future incident dates', async () => {
      const farFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await expect(
        service.createForUser(userId, {
          title: 'Future report',
          description: 'Incident timestamp should not be in the future.',
          category: AbuseCategory.CYBERBULLYING,
          platform: Platform.TIKTOK,
          severity: Severity.LOW,
          incidentDate: farFuture.toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAllForUser & findOneForUser', () => {
    it('checks incident ownership when filtering by incidentId', async () => {
      prisma.incident.findUnique.mockResolvedValue({
        id: incidentId,
        userId: otherUserId,
      });

      await expect(
        service.findAllForUser(userId, { incidentId }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.abuseReport.findMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when report does not exist and ForbiddenException on foreign report', async () => {
      prisma.abuseReport.findUnique.mockResolvedValue(null);
      await expect(service.findOneForUser(userId, reportId)).rejects.toThrow(
        NotFoundException,
      );

      prisma.abuseReport.findUnique.mockResolvedValue({
        ...baseReport,
        userId: otherUserId,
      });
      await expect(service.findOneForUser(userId, reportId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateForUser & removeForUser', () => {
    it('enforces ownership on update and records link event when attaching to incident', async () => {
      prisma.abuseReport.findUnique.mockResolvedValue(baseReport);
      prisma.incident.findUnique.mockResolvedValue({ id: incidentId, userId });
      prisma.abuseReport.update.mockResolvedValue({
        ...baseReport,
        incidentId,
        severity: Severity.HIGH,
      });

      const updated = await service.updateForUser(userId, reportId, {
        incidentId,
        severity: Severity.HIGH,
      });

      expect(updated.incidentId).toBe(incidentId);
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'ABUSE_REPORT_LINKED',
            incidentId,
          }),
        }),
      );
    });

    it('enforces ownership on delete', async () => {
      prisma.abuseReport.findUnique.mockResolvedValue({
        ...baseReport,
        userId: otherUserId,
      });

      await expect(service.removeForUser(userId, reportId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.abuseReport.delete).not.toHaveBeenCalled();

      prisma.abuseReport.findUnique.mockResolvedValue(baseReport);
      prisma.abuseReport.delete.mockResolvedValue(baseReport);

      const res = await service.removeForUser(userId, reportId);
      expect(res).toEqual({ deleted: true, id: reportId });
    });
  });
});
