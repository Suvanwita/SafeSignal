import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AbuseCategory,
  Analysis,
  AnalysisType,
  IncidentStatus,
  Platform,
  Prisma,
  Severity,
  SuspiciousProfile,
  SuspiciousProfileStatus,
} from '@prisma/client';
import { assertOwnedResource } from '../../common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateSuspiciousProfileDto } from './dto/create-suspicious-profile.dto';
import type { LinkIncidentDto } from './dto/link-incident.dto';
import type {
  DeleteSuspiciousProfileResponseDto,
  ProfileIncidentLinkDto,
  SimilarityAnalysisDto,
  SimilarityAnalysisResultPayload,
  SuspiciousProfileDetailResponseDto,
  SuspiciousProfileResponseDto,
} from './dto/suspicious-profile-response.dto';
import type { UpdateSuspiciousProfileStatusDto } from './dto/update-suspicious-profile-status.dto';
import {
  SIMILARITY_DISCLAIMER,
  analyzeSuspiciousProfileAgainstOfficialAccounts,
} from './similarity-analyzer';

type ProfileIncidentItem = {
  id: string;
  title: string;
  status: IncidentStatus;
};

type ProfileWithRelations = SuspiciousProfile & {
  analyses: Analysis[];
  incidentLinks?: {
    incident: ProfileIncidentItem;
  }[];
  incidents?: ProfileIncidentItem[];
};

const PROFILE_RELATIONS_INCLUDE = {
  analyses: {
    where: { type: AnalysisType.SIMILARITY_CHECK },
    orderBy: { createdAt: 'desc' as const },
  },
  incidentLinks: {
    include: {
      incident: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
    },
  },
  incidents: {
    select: {
      id: true,
      title: true,
      status: true,
    },
  },
} satisfies Prisma.SuspiciousProfileInclude;

@Injectable()
export class IntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(
    userId: string,
  ): Promise<SuspiciousProfileResponseDto[]> {
    const profiles = await this.prisma.suspiciousProfile.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: PROFILE_RELATIONS_INCLUDE,
    });

    return profiles.map((profile) => this.toResponseDto(profile));
  }

  async findOneForUser(
    userId: string,
    profileId: string,
  ): Promise<SuspiciousProfileDetailResponseDto> {
    const profile = await this.prisma.suspiciousProfile.findUnique({
      where: { id: profileId },
      include: PROFILE_RELATIONS_INCLUDE,
    });

    assertOwnedResource(profile, userId, 'Suspicious profile');

    return {
      ...this.toResponseDto(profile),
      analyses: profile.analyses.map((analysis) => this.toAnalysisDto(analysis)),
    };
  }

  async createAndAnalyzeForUser(
    userId: string,
    dto: CreateSuspiciousProfileDto,
  ): Promise<SuspiciousProfileResponseDto> {
    if (dto.incidentId && dto.newIncidentTitle) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Provide either an existing incidentId or newIncidentTitle, not both',
      });
    }

    if (dto.incidentId) {
      const targetIncident = await this.prisma.incident.findUnique({
        where: { id: dto.incidentId },
        select: { id: true, userId: true },
      });
      assertOwnedResource(targetIncident, userId, 'Incident');
    }

    const normalizedHandle = this.normalizeUsername(dto.platform, dto.username);

    const officialAccounts = await this.prisma.officialAccount.findMany({
      where: { userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });

    const analysisResult = analyzeSuspiciousProfileAgainstOfficialAccounts(
      {
        platform: dto.platform,
        username: normalizedHandle,
        displayName: dto.displayName ?? null,
        profileUrl: dto.profileUrl,
        bio: dto.bio ?? null,
      },
      officialAccounts,
    );

    const now = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      let resolvedIncidentId: string | null = dto.incidentId ?? null;

      if (dto.newIncidentTitle) {
        const createdIncident = await tx.incident.create({
          data: {
            userId,
            title: dto.newIncidentTitle,
            status: IncidentStatus.OPEN,
            severity: Severity.MEDIUM,
            category: AbuseCategory.IMPERSONATION,
            occurredAt: now,
          },
        });
        resolvedIncidentId = createdIncident.id;

        await tx.timelineEvent.create({
          data: {
            userId,
            incidentId: createdIncident.id,
            eventType: 'INCIDENT_CREATED',
            title: `Incident opened: ${createdIncident.title}`,
            description: `Impersonation investigation initiated.`,
            metadata: {
              category: createdIncident.category,
              severity: createdIncident.severity,
            } as Prisma.InputJsonValue,
            occurredAt: now,
          },
        });
      }

      const createdProfile = await tx.suspiciousProfile.create({
        data: {
          userId,
          platform: dto.platform,
          handle: normalizedHandle,
          displayName: dto.displayName ?? null,
          profileUrl: dto.profileUrl,
          bio: dto.bio ?? null,
          profileImageUrl: dto.profileImageUrl ?? null,
          reviewStatus: SuspiciousProfileStatus.PENDING_REVIEW,
          firstSeenAt: now,
          lastSeenAt: now,
          notes: dto.notes ?? null,
        },
      });

      const createdAnalysis = await tx.analysis.create({
        data: {
          userId,
          incidentId: resolvedIncidentId,
          officialAccountId: analysisResult.matchedOfficialAccountId,
          suspiciousProfileId: createdProfile.id,
          type: AnalysisType.SIMILARITY_CHECK,
          summary: analysisResult.summary,
          confidence: Number((analysisResult.overallScore / 100).toFixed(4)),
          result: analysisResult as unknown as Prisma.InputJsonValue,
        },
      });

      if (resolvedIncidentId) {
        await tx.incidentSuspiciousProfile.create({
          data: {
            userId,
            incidentId: resolvedIncidentId,
            suspiciousProfileId: createdProfile.id,
            notes: dto.notes ?? null,
          },
        });

        // Set as primary incident suspiciousProfileId if null
        await tx.incident.update({
          where: { id: resolvedIncidentId },
          data: {
            suspiciousProfileId: createdProfile.id,
          },
        });

        await tx.timelineEvent.create({
          data: {
            userId,
            incidentId: resolvedIncidentId,
            eventType: 'PROFILE_LINKED',
            title: `Suspicious profile linked: @${createdProfile.handle}`,
            description: `${createdProfile.platform} @${createdProfile.handle} linked to incident.`,
            metadata: {
              suspiciousProfileId: createdProfile.id,
              platform: createdProfile.platform,
              handle: createdProfile.handle,
              similarityScore: analysisResult.overallScore,
            } as Prisma.InputJsonValue,
            occurredAt: now,
          },
        });
      }

      return tx.suspiciousProfile.findUniqueOrThrow({
        where: { id: createdProfile.id },
        include: PROFILE_RELATIONS_INCLUDE,
      });
    });

    return this.toResponseDto(created);
  }

  async linkIncidentForUser(
    userId: string,
    profileId: string,
    dto: LinkIncidentDto,
  ): Promise<SuspiciousProfileResponseDto> {
    const profile = await this.prisma.suspiciousProfile.findUnique({
      where: { id: profileId },
    });
    assertOwnedResource(profile, userId, 'Suspicious profile');

    const incident = await this.prisma.incident.findUnique({
      where: { id: dto.incidentId },
    });
    assertOwnedResource(incident, userId, 'Incident');

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.incidentSuspiciousProfile.upsert({
        where: {
          incidentId_suspiciousProfileId: {
            incidentId: dto.incidentId,
            suspiciousProfileId: profileId,
          },
        },
        create: {
          userId,
          incidentId: dto.incidentId,
          suspiciousProfileId: profileId,
          notes: dto.notes ?? null,
        },
        update: {
          notes: dto.notes ?? undefined,
        },
      });

      await tx.timelineEvent.create({
        data: {
          userId,
          incidentId: dto.incidentId,
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

      return tx.suspiciousProfile.findUniqueOrThrow({
        where: { id: profileId },
        include: PROFILE_RELATIONS_INCLUDE,
      });
    });

    return this.toResponseDto(updated);
  }

  async unlinkIncidentForUser(
    userId: string,
    profileId: string,
    incidentId: string,
  ): Promise<SuspiciousProfileResponseDto> {
    const profile = await this.prisma.suspiciousProfile.findUnique({
      where: { id: profileId },
    });
    assertOwnedResource(profile, userId, 'Suspicious profile');

    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
    });
    assertOwnedResource(incident, userId, 'Incident');

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.incidentSuspiciousProfile.deleteMany({
        where: {
          incidentId,
          suspiciousProfileId: profileId,
        },
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

      return tx.suspiciousProfile.findUniqueOrThrow({
        where: { id: profileId },
        include: PROFILE_RELATIONS_INCLUDE,
      });
    });

    return this.toResponseDto(updated);
  }

  async reanalyzeForUser(
    userId: string,
    profileId: string,
  ): Promise<SuspiciousProfileResponseDto> {
    const existing = await this.prisma.suspiciousProfile.findUnique({
      where: { id: profileId },
    });
    assertOwnedResource(existing, userId, 'Suspicious profile');

    const officialAccounts = await this.prisma.officialAccount.findMany({
      where: { userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });

    const analysisResult = analyzeSuspiciousProfileAgainstOfficialAccounts(
      {
        platform: existing.platform,
        username: existing.handle,
        displayName: existing.displayName,
        profileUrl: existing.profileUrl,
        bio: existing.bio,
      },
      officialAccounts,
    );

    const createdAnalysis = await this.prisma.analysis.create({
      data: {
        userId,
        incidentId: null,
        officialAccountId: analysisResult.matchedOfficialAccountId,
        suspiciousProfileId: existing.id,
        type: AnalysisType.SIMILARITY_CHECK,
        summary: analysisResult.summary,
        confidence: Number((analysisResult.overallScore / 100).toFixed(4)),
        result: analysisResult as unknown as Prisma.InputJsonValue,
      },
    });

    const refreshed = await this.prisma.suspiciousProfile.findUniqueOrThrow({
      where: { id: profileId },
      include: PROFILE_RELATIONS_INCLUDE,
    });

    return this.toResponseDto(refreshed);
  }

  async updateReviewStatusForUser(
    userId: string,
    profileId: string,
    dto: UpdateSuspiciousProfileStatusDto,
  ): Promise<SuspiciousProfileResponseDto> {
    const existing = await this.prisma.suspiciousProfile.findUnique({
      where: { id: profileId },
    });
    assertOwnedResource(existing, userId, 'Suspicious profile');

    const updated = await this.prisma.suspiciousProfile.update({
      where: { id: profileId },
      data: {
        reviewStatus: dto.reviewStatus,
        reviewedAt: new Date(),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: PROFILE_RELATIONS_INCLUDE,
    });

    return this.toResponseDto(updated);
  }

  async removeForUser(
    userId: string,
    profileId: string,
  ): Promise<DeleteSuspiciousProfileResponseDto> {
    const existing = await this.prisma.suspiciousProfile.findUnique({
      where: { id: profileId },
    });
    assertOwnedResource(existing, userId, 'Suspicious profile');

    await this.prisma.suspiciousProfile.delete({
      where: { id: profileId },
    });

    return {
      deleted: true,
      id: profileId,
    };
  }

  private normalizeUsername(platform: Platform, raw: string): string {
    const trimmed = raw.trim();
    const normalized =
      platform === Platform.EMAIL || platform === Platform.WEBSITE
        ? trimmed
        : trimmed.replace(/^@+/, '');

    if (normalized.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Username cannot be empty',
      });
    }

    return normalized;
  }

  private toAnalysisDto(analysis: Analysis): SimilarityAnalysisDto {
    const payload =
      (analysis.result as unknown as Partial<SimilarityAnalysisResultPayload>) ??
      {};

    return {
      id: analysis.id,
      type: analysis.type,
      overallScore:
        typeof payload.overallScore === 'number'
          ? payload.overallScore
          : Math.round((analysis.confidence ?? 0) * 100),
      level: payload.level ?? 'LOW_SIMILARITY',
      matchedOfficialAccountId:
        payload.matchedOfficialAccountId ?? analysis.officialAccountId ?? null,
      summary: analysis.summary ?? payload.summary ?? '',
      disclaimer: payload.disclaimer ?? SIMILARITY_DISCLAIMER,
      evaluatedAccountCount:
        typeof payload.evaluatedAccountCount === 'number'
          ? payload.evaluatedAccountCount
          : (payload.comparisons?.length ?? 0),
      bestMatch: payload.bestMatch ?? null,
      comparisons: Array.isArray(payload.comparisons) ? payload.comparisons : [],
      indicators: Array.isArray(payload.indicators) ? payload.indicators : [],
      createdAt: analysis.createdAt,
    };
  }

  private toResponseDto(
    profile: ProfileWithRelations,
  ): SuspiciousProfileResponseDto {
    const latest = profile.analyses?.[0];

    const incidentMap = new Map<string, ProfileIncidentLinkDto>();
    if (profile.incidents) {
      for (const inc of profile.incidents) {
        incidentMap.set(inc.id, {
          id: inc.id,
          title: inc.title,
          status: inc.status,
        });
      }
    }
    if (profile.incidentLinks) {
      for (const link of profile.incidentLinks) {
        if (link.incident) {
          incidentMap.set(link.incident.id, {
            id: link.incident.id,
            title: link.incident.title,
            status: link.incident.status,
          });
        }
      }
    }

    return {
      id: profile.id,
      userId: profile.userId,
      platform: profile.platform,
      username: profile.handle,
      displayName: profile.displayName,
      profileUrl: profile.profileUrl,
      bio: profile.bio,
      profileImageUrl: profile.profileImageUrl,
      reviewStatus: profile.reviewStatus,
      reviewedAt: profile.reviewedAt,
      notes: profile.notes,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      latestAnalysis: latest ? this.toAnalysisDto(latest) : null,
      incidents: Array.from(incidentMap.values()),
    };
  }
}
