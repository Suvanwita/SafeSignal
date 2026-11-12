import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AnalysisType,
  Platform,
  SuspiciousProfileStatus,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { IntelligenceService } from './intelligence.service';

describe('IntelligenceService', () => {
  let service: IntelligenceService;
  let prisma: {
    officialAccount: {
      findMany: jest.Mock;
    };
    suspiciousProfile: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    analysis: {
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const userId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const profileId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const baseProfile = {
    id: profileId,
    userId,
    platform: Platform.X,
    handle: 'safes1gnal_hq',
    displayName: 'SafeSignal Official',
    profileUrl: 'https://x.com/safes1gnal_hq',
    bio: 'Support team for SafeSignal',
    profileImageUrl: 'https://cdn.example.org/avatar.png',
    reviewStatus: SuspiciousProfileStatus.PENDING_REVIEW,
    reviewedAt: null,
    firstSeenAt: new Date('2026-06-01T10:00:00Z'),
    lastSeenAt: new Date('2026-06-01T10:00:00Z'),
    notes: null,
    createdAt: new Date('2026-06-01T10:00:00Z'),
    updatedAt: new Date('2026-06-01T10:00:00Z'),
  };

  beforeEach(() => {
    const tx = {
      suspiciousProfile: {
        create: jest.fn(),
        delete: jest.fn(),
      },
      analysis: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    prisma = {
      officialAccount: {
        findMany: jest.fn(),
      },
      suspiciousProfile: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: tx.suspiciousProfile.create,
        update: jest.fn(),
        delete: tx.suspiciousProfile.delete,
      },
      analysis: {
        create: tx.analysis.create,
        deleteMany: tx.analysis.deleteMany,
      },
      $transaction: jest.fn((cb: (client: typeof tx) => Promise<unknown>) =>
        cb(tx),
      ),
    };

    service = new IntelligenceService(prisma as unknown as PrismaService);
  });

  it('stores suspicious profile and SIMILARITY_CHECK analysis in PostgreSQL', async () => {
    prisma.officialAccount.findMany.mockResolvedValue([
      {
        id: 'official-1',
        userId,
        platform: Platform.X,
        handle: 'safesignal_hq',
        displayName: 'SafeSignal Official',
        profileUrl: 'https://x.com/safesignal_hq',
        verified: false,
        isPrimary: true,
        notes: 'Security updates',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    prisma.suspiciousProfile.create.mockResolvedValue(baseProfile);
    prisma.analysis.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        id: 'analysis-1',
        ...data,
        createdAt: new Date('2026-06-01T10:00:01Z'),
        updatedAt: new Date('2026-06-01T10:00:01Z'),
      }),
    );

    const created = await service.createAndAnalyzeForUser(userId, {
      platform: Platform.X,
      username: '@safes1gnal_hq',
      displayName: 'SafeSignal Official',
      profileUrl: 'https://x.com/safes1gnal_hq',
      bio: 'Support team for SafeSignal',
      profileImageUrl: 'https://cdn.example.org/avatar.png',
    });

    expect(prisma.suspiciousProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId,
          handle: 'safes1gnal_hq',
          reviewStatus: SuspiciousProfileStatus.PENDING_REVIEW,
        }),
      }),
    );
    expect(prisma.analysis.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AnalysisType.SIMILARITY_CHECK,
          incidentId: null,
          officialAccountId: 'official-1',
          suspiciousProfileId: profileId,
        }),
      }),
    );
    expect(created.latestAnalysis?.overallScore).toBeGreaterThanOrEqual(70);
    expect(created.latestAnalysis?.level).toBe('HIGH_SIMILARITY');
  });

  it('allows manual review status updates and enforces ownership', async () => {
    prisma.suspiciousProfile.findUnique.mockResolvedValue({
      ...baseProfile,
      userId: otherUserId,
    });

    await expect(
      service.updateReviewStatusForUser(userId, profileId, {
        reviewStatus: SuspiciousProfileStatus.UNDER_REVIEW,
      }),
    ).rejects.toThrow(ForbiddenException);

    prisma.suspiciousProfile.findUnique.mockResolvedValue(baseProfile);
    prisma.suspiciousProfile.update.mockResolvedValue({
      ...baseProfile,
      reviewStatus: SuspiciousProfileStatus.ESCALATED,
      reviewedAt: new Date('2026-06-02T10:00:00Z'),
      notes: 'Escalated manually',
      analyses: [],
    });

    const updated = await service.updateReviewStatusForUser(userId, profileId, {
      reviewStatus: SuspiciousProfileStatus.ESCALATED,
      notes: 'Escalated manually',
    });

    expect(updated.reviewStatus).toBe(SuspiciousProfileStatus.ESCALATED);
    expect(updated.notes).toBe('Escalated manually');
  });

  it('throws NotFoundException when finding missing suspicious profile', async () => {
    prisma.suspiciousProfile.findUnique.mockResolvedValue(null);

    await expect(service.findOneForUser(userId, profileId)).rejects.toThrow(
      NotFoundException,
    );
  });
});
