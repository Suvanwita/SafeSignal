import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { EvidenceService } from './evidence.service';
import type { VaultStorageService } from './vault-storage.service';

describe('EvidenceService', () => {
  let service: EvidenceService;
  let prisma: {
    evidence: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
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

  let vaultStorage: {
    saveFile: jest.Mock;
    getReadStream: jest.Mock;
    deleteFile: jest.Mock;
    getVaultRoot: jest.Mock;
    computeFileSha256: jest.Mock;
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
    storageKey: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/uuid-1234.png',
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
        update: jest.fn(),
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

    vaultStorage = {
      saveFile: jest.fn().mockResolvedValue({
        storageKey: `${incidentId}/random-uuid.png`,
        absolutePath: `/storage/evidence-vault/${incidentId}/random-uuid.png`,
      }),
      getReadStream: jest.fn().mockResolvedValue({
        stream: { pipe: jest.fn() },
        size: 102400,
      }),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      getVaultRoot: jest.fn().mockReturnValue('/storage/evidence-vault'),
      computeFileSha256: jest.fn().mockResolvedValue({
        sha256: baseEvidence.sha256,
        size: 102400,
      }),
    };

    service = new EvidenceService(
      prisma as unknown as PrismaService,
      vaultStorage as unknown as VaultStorageService,
    );
  });

  describe('uploadForUser (SafeSignal Evidence Vault)', () => {
    it('validates file signature, saves to private filesystem vault, and records evidence in DB with timeline event', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce({
        id: incidentId,
        userId,
      });

      const pngBuffer = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('PNG_IMAGE_BODY'),
      ]);

      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'threat_dm.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: pngBuffer.length,
        buffer: pngBuffer,
        destination: '',
        filename: 'threat_dm.png',
        path: '',
        stream: null as any,
      };

      prisma.evidence.create.mockResolvedValueOnce({
        ...baseEvidence,
        fileName: 'threat_dm.png',
      });

      const result = await service.uploadForUser(userId, mockFile, {
        incidentId,
        title: 'Extortion screenshot',
        description: 'Captured evidence of extortion demands',
      });

      expect(vaultStorage.saveFile).toHaveBeenCalledWith(
        incidentId,
        '.png',
        pngBuffer,
      );
      expect(prisma.evidence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            incidentId,
            title: 'Extortion screenshot',
            fileName: 'threat_dm.png',
            mimeType: 'image/png',
            storageKey: `${incidentId}/random-uuid.png`,
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
      // Ensure storageKey is not leaked in the returned DTO
      expect(result.storageKey).toBeNull();
      expect(result.fileName).toBe('threat_dm.png');
    });

    it('rejects upload if incident belongs to another user', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce({
        id: incidentId,
        userId: otherUserId, // Different owner
      });

      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'file.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: pngBuffer.length,
        buffer: pngBuffer,
        destination: '',
        filename: 'file.png',
        path: '',
        stream: null as any,
      };

      await expect(
        service.uploadForUser(userId, mockFile, { incidentId }),
      ).rejects.toThrow(ForbiddenException);

      expect(vaultStorage.saveFile).not.toHaveBeenCalled();
    });

    it('rejects upload with invalid file signature (tampered extension)', async () => {
      prisma.incident.findUnique.mockResolvedValueOnce({
        id: incidentId,
        userId,
      });

      const fakePngBuffer = Buffer.from('NOT_A_VALID_PNG_MAGIC_BYTES');
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'fake.png',
        encoding: '7bit',
        mimetype: 'image/png',
        size: fakePngBuffer.length,
        buffer: fakePngBuffer,
        destination: '',
        filename: 'fake.png',
        path: '',
        stream: null as any,
      };

      await expect(
        service.uploadForUser(userId, mockFile, { incidentId }),
      ).rejects.toThrow(BadRequestException);

      expect(vaultStorage.saveFile).not.toHaveBeenCalled();
    });
  });

  describe('getFileStreamForUser (Secure Vault Download)', () => {
    it('returns file stream for authenticated owner without exposing filesystem paths', async () => {
      prisma.evidence.findUnique.mockResolvedValueOnce(baseEvidence);

      const downloadResult = await service.getFileStreamForUser(userId, evidenceId);

      expect(downloadResult.filename).toBe('chat.png');
      expect(downloadResult.mimeType).toBe('image/png');
      expect(downloadResult.size).toBe(102400);
      expect(vaultStorage.getReadStream).toHaveBeenCalledWith(baseEvidence.storageKey);
    });

    it('enforces ownership checks and rejects unauthorized download with 403', async () => {
      prisma.evidence.findUnique.mockResolvedValueOnce({
        ...baseEvidence,
        userId: otherUserId,
      });

      await expect(
        service.getFileStreamForUser(userId, evidenceId),
      ).rejects.toThrow(ForbiddenException);

      expect(vaultStorage.getReadStream).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when evidence record is missing', async () => {
      prisma.evidence.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getFileStreamForUser(userId, evidenceId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createForUser (Metadata Backward Compatibility)', () => {
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
    it('deletes evidence record and vault file, emitting EVIDENCE_REMOVED timeline event', async () => {
      prisma.evidence.findUnique.mockResolvedValueOnce(baseEvidence);

      const result = await service.removeForUser(userId, evidenceId);

      expect(result.deleted).toBe(true);
      expect(result.id).toBe(evidenceId);
      expect(prisma.evidence.delete).toHaveBeenCalledWith({
        where: { id: evidenceId },
      });
      expect(vaultStorage.deleteFile).toHaveBeenCalledWith(baseEvidence.storageKey);
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

  describe('verifyIntegrityForUser (Cryptographic Evidence Integrity Verification)', () => {
    it('returns VERIFIED when recalculated hash matches original hash', async () => {
      prisma.evidence.findUnique.mockResolvedValueOnce(baseEvidence);
      vaultStorage.computeFileSha256.mockResolvedValueOnce({
        sha256: baseEvidence.sha256,
        size: 102400,
      });

      const result = await service.verifyIntegrityForUser(userId, evidenceId);

      expect(result.status).toBe('VERIFIED');
      expect(result.verified).toBe(true);
      expect(result.algorithm).toBe('SHA-256');
      expect(result.originalHash).toBe(baseEvidence.sha256);
      expect(result.recalculatedHash).toBe(baseEvidence.sha256);
      expect(result.originalFileSize).toBe(102400);
      expect(result.currentFileSize).toBe(102400);
      expect(result.disclaimer).toContain('relative to the recorded upload');
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'EVIDENCE_VERIFIED',
            incidentId,
            title: expect.stringContaining('VERIFIED'),
          }),
        }),
      );
    });

    it('returns INTEGRITY_MISMATCH when file bytes have been modified or corrupted', async () => {
      prisma.evidence.findUnique.mockResolvedValueOnce(baseEvidence);
      const tamperedHash =
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      vaultStorage.computeFileSha256.mockResolvedValueOnce({
        sha256: tamperedHash,
        size: 102450,
      });

      const result = await service.verifyIntegrityForUser(userId, evidenceId);

      expect(result.status).toBe('INTEGRITY_MISMATCH');
      expect(result.verified).toBe(false);
      expect(result.originalHash).toBe(baseEvidence.sha256);
      expect(result.recalculatedHash).toBe(tamperedHash);
      expect(result.currentFileSize).toBe(102450);
      expect(result.disclaimer).toBeDefined();
      expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'EVIDENCE_VERIFIED',
            title: expect.stringContaining('INTEGRITY_MISMATCH'),
          }),
        }),
      );
    });

    it('throws NotFoundException when file is missing from vault storage', async () => {
      prisma.evidence.findUnique.mockResolvedValueOnce(baseEvidence);
      vaultStorage.computeFileSha256.mockRejectedValueOnce(
        new NotFoundException({
          code: 'EVIDENCE_FILE_NOT_FOUND',
          message: 'Evidence file not found in vault storage.',
        }),
      );

      await expect(
        service.verifyIntegrityForUser(userId, evidenceId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when evidence record has no physical file in vault', async () => {
      prisma.evidence.findUnique.mockResolvedValueOnce({
        ...baseEvidence,
        storageKey: null,
      });

      await expect(
        service.verifyIntegrityForUser(userId, evidenceId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when attempting to verify evidence of another user', async () => {
      prisma.evidence.findUnique.mockResolvedValueOnce({
        ...baseEvidence,
        userId: otherUserId,
      });

      await expect(
        service.verifyIntegrityForUser(userId, evidenceId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateForUser', () => {
    it('updates mutable metadata without modifying original hash or custody keys', async () => {
      prisma.evidence.findUnique.mockResolvedValueOnce(baseEvidence);
      prisma.evidence.update.mockResolvedValueOnce({
        ...baseEvidence,
        title: 'Updated title',
        description: 'Updated description',
      });

      const result = await service.updateForUser(userId, evidenceId, {
        title: 'Updated title',
        description: 'Updated description',
      });

      expect(result.title).toBe('Updated title');
      expect(result.description).toBe('Updated description');
      expect(result.sha256).toBe(baseEvidence.sha256);
      expect(prisma.evidence.update).toHaveBeenCalledWith({
        where: { id: evidenceId },
        data: {
          title: 'Updated title',
          description: 'Updated description',
        },
      });
    });

    it('throws ForbiddenException when updating evidence belonging to another user', async () => {
      prisma.evidence.findUnique.mockResolvedValueOnce({
        ...baseEvidence,
        userId: otherUserId,
      });

      await expect(
        service.updateForUser(userId, evidenceId, { title: 'Hacked' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
