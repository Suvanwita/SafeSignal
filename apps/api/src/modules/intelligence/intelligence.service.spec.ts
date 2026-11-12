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
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    incident: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    incidentSuspiciousProfile: {
      create: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    timelineEvent: {
      create: jest.Mock;
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
        findUniqueOrThrow: jest.fn(),
        delete: jest.fn(),
      },
      analysis: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      incident: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      incidentSuspiciousProfile: {
        create: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      timelineEvent: {
        create: jest.fn(),
      },
    };

    prisma = {
      officialAccount: {
        findMany: jest.fn(),
      },
      suspiciousProfile: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: tx.suspiciousProfile.findUniqueOrThrow,
        create: tx.suspiciousProfile.create,
        update: jest.fn(),
        delete: tx.suspiciousProfile.delete,
      },
      incident: {
        findUnique: tx.incident.findUnique,
        create: tx.incident.create,
        update: tx.incident.update,
      },
      incidentSuspiciousProfile: {
        create: tx.incidentSuspiciousProfile.create,
        upsert: tx.incidentSuspiciousProfile.upsert,
        deleteMany: tx.incidentSuspiciousProfile.deleteMany,
      },
      timelineEvent: {
        create: tx.timelineEvent.create,
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
    prisma.suspiciousProfile.findUniqueOrThrow.mockImplementation(async () => ({
      ...baseProfile,
      analyses: [
        {
          id: 'analysis-1',
          type: AnalysisType.SIMILARITY_CHECK,
          incidentId: null,
          officialAccountId: 'official-1',
          suspiciousProfileId: profileId,
          confidence: 0.85,
          summary: 'High similarity detected',
          result: {
            overallScore: 85,
            level: 'HIGH_SIMILARITY',
            matchedOfficialAccountId: 'official-1',
            summary: 'High similarity detected',
            disclaimer: 'Indicator only',
            evaluatedAccountCount: 1,
            bestMatch: null,
            comparisons: [],
          },
          createdAt: new Date('2026-06-01T10:00:01Z'),
          updatedAt: new Date('2026-06-01T10:00:01Z'),
        },
      ],
      incidentLinks: [],
    }));

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

  it('links suspicious profile to an incident and creates PROFILE_LINKED timeline event', async () => {
    const incidentId = '33333333-3333-3333-3333-333333333333';
    prisma.suspiciousProfile.findUnique.mockResolvedValue(baseProfile);
    prisma.incident.findUnique.mockResolvedValue({
      id: incidentId,
      userId,
      title: 'Target Incident',
    });

    prisma.suspiciousProfile.findUniqueOrThrow.mockResolvedValue({
      ...baseProfile,
      analyses: [],
      incidentLinks: [
        {
          id: 'link-1',
          incidentId,
          suspiciousProfileId: profileId,
          notes: 'Observed handle copy',
          createdAt: new Date(),
          incident: {
            id: incidentId,
            title: 'Target Incident',
            status: 'OPEN',
            severity: 'HIGH',
            category: 'IMPERSONATION',
          },
        },
      ],
    });

    const result = await service.linkIncidentForUser(userId, profileId, {
      incidentId,
      notes: 'Observed handle copy',
    });

    expect(prisma.incidentSuspiciousProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          incidentId_suspiciousProfileId: {
            incidentId,
            suspiciousProfileId: profileId,
          },
        },
      }),
    );
    expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId,
          incidentId,
          eventType: 'PROFILE_LINKED',
        }),
      }),
    );
    expect(result.incidents).toHaveLength(1);
    expect(result.incidents[0].id).toBe(incidentId);
  });

  it('enforces ownership and prevents linking to another user incident', async () => {
    const incidentId = '33333333-3333-3333-3333-333333333333';
    prisma.suspiciousProfile.findUnique.mockResolvedValue(baseProfile);
    prisma.incident.findUnique.mockResolvedValue({
      id: incidentId,
      userId: otherUserId, // belongs to someone else
      title: 'Other User Incident',
    });

    await expect(
      service.linkIncidentForUser(userId, profileId, { incidentId }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('unlinks suspicious profile from an incident without deleting the profile record', async () => {
    const incidentId = '33333333-3333-3333-3333-333333333333';
    prisma.suspiciousProfile.findUnique.mockResolvedValue(baseProfile);
    prisma.incident.findUnique.mockResolvedValue({
      id: incidentId,
      userId,
      suspiciousProfileId: profileId,
      title: 'Target Incident',
    });

    prisma.suspiciousProfile.findUniqueOrThrow.mockResolvedValue({
      ...baseProfile,
      analyses: [],
      incidentLinks: [],
    });

    const result = await service.unlinkIncidentForUser(userId, profileId, incidentId);

    expect(prisma.incidentSuspiciousProfile.deleteMany).toHaveBeenCalledWith({
      where: {
        incidentId,
        suspiciousProfileId: profileId,
      },
    });
    expect(prisma.incident.update).toHaveBeenCalledWith({
      where: { id: incidentId },
      data: { suspiciousProfileId: null },
    });
    expect(prisma.timelineEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId,
          incidentId,
          eventType: 'PROFILE_UNLINKED',
        }),
      }),
    );
    expect(prisma.suspiciousProfile.delete).not.toHaveBeenCalled();
    expect(result.incidents).toEqual([]);
  });
});
