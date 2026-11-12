import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { EvidenceService } from './evidence.service';

describe('EvidenceService', () => {
  let service: EvidenceService;
  let prisma: {
    evidence: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    incident: {
      findUnique: jest.Mock;
    };
    abuseReport: {
      findUnique: jest.Mock;
    };
    timelineEvent: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const userId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const incidentId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const abuseReportId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const evidenceId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  const now = new Date('2026-11-12T10:00:00Z');

  const baseEvidence = {
    id: evidenceId,
    userId,
    incidentId,
    abuseReportId: null,
    title: 'Chat screenshot',
    description: 'Screenshot showing extortion attempt',
    sourceUrl: 'https://x.com/harasser/status/123456',
    storageKey: 'evidence/chat.png',
    fileName: 'chat.png',
    mimeType: 'image/png',
    fileSize: 102400,
    sha256:
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    capturedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    const tx = {
      evidence: {
        create: jest.fn(),
        delete: jest.fn(),
      },
      timelineEvent: {
        create: jest.fn(),
      },
    };

    prisma = {
      evidence: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: tx.evidence.create,
        delete: tx.evidence.delete,
      },
      incident: {
        findUnique: jest.fn(),
      },
      abuseReport: {
        findUnique: jest.fn(),
      },
      timelineEvent: tx.timelineEvent,
      $transaction: jest.fn(async (cb: (txArg: typeof tx) => Promise<unknown>) =>
        cb(tx),
      ),
    };

    service = new EvidenceService(prisma as unknown as PrismaService);
  });

  describe('createForUser', () => {
    it('creates evidence record linked to incident and emits EVIDENCE_ATTACHED timeline event', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce({
        id: incidentId,
        userId,
      });

      prisma.evidence.create.mockResolvedValueOnce(baseEvidence);

      const result = await service.createForUser(userId, {
        incidentId,
        title: 'Chat screenshot',
        fileName: 'chat.png',
        mimeType: 'image/png',
        sha256:
          'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      });

      expect(result.id).toBe(evidenceId);
      expect(result.incidentId).toBe(incidentId);
      expect(prisma.evidence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            incidentId,
            title: 'Chat screenshot',
          }),
        }),
      );
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'EVIDENCE_ATTACHED',
            incidentId,
          }),
        }),
      );
    });

    it('rejects creating evidence if target incident belongs to another user', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce({
        id: incidentId,
        userId: otherUserId,
      });

      await expect(
        service.createForUser(userId, {
          incidentId,
          title: 'Unauthorized evidence',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects creating evidence if associated abuse report belongs to a different incident', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce({
        id: incidentId,
        userId,
      });

      prisma.abuseReport.findUnique.mockResolvedValueOnce({
        id: abuseReportId,
        userId,
        incidentId: 'other-incident-id',
      });

      await expect(
        service.createForUser(userId, {
          incidentId,
          abuseReportId,
          title: 'Mismatched incident evidence',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAllForUser and findOneForUser', () => {
    it('returns evidence records owned by current user', async () => {
      prisma.evidence.findMany.mockResolvedValueOnce([baseEvidence]);

      const results = await service.findAllForUser(userId);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(evidenceId);
      expect(prisma.evidence.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('throws ForbiddenException when viewing evidence owned by another user', async () => {
      prisma.evidence.findUnique.mockResolvedValueOnce({
        ...baseEvidence,
        userId: otherUserId,
      });

      await expect(service.findOneForUser(userId, evidenceId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when evidence record is not found', async () => {
      prisma.evidence.findUnique.mockResolvedValueOnce(null);

      await expect(service.findOneForUser(userId, evidenceId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeForUser', () => {
    it('deletes evidence record and emits EVIDENCE_REMOVED timeline event', async () => {
      prisma.evidence.findUnique.mockResolvedValueOnce(baseEvidence);

      const result = await service.removeForUser(userId, evidenceId);

      expect(result.deleted).toBe(true);
      expect(result.id).toBe(evidenceId);
      expect(prisma.evidence.delete).toHaveBeenCalledWith({
        where: { id: evidenceId },
      });
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'EVIDENCE_REMOVED',
            incidentId,
          }),
        }),
      );
    });
  });
});
