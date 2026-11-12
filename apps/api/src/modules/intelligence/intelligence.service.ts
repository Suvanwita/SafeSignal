import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Analysis,
  AnalysisType,
  Platform,
  Prisma,
  SuspiciousProfile,
  SuspiciousProfileStatus,
} from '@prisma/client';
import { assertOwnedResource } from '../../common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateSuspiciousProfileDto } from './dto/create-suspicious-profile.dto';
import type {
  DeleteSuspiciousProfileResponseDto,
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

type ProfileWithAnalyses = SuspiciousProfile & {
  analyses: Analysis[];
};

@Injectable()
export class IntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(
    userId: string,
  ): Promise<SuspiciousProfileResponseDto[]> {
    const profiles = await this.prisma.suspiciousProfile.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        analyses: {
          where: { type: AnalysisType.SIMILARITY_CHECK },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return profiles.map((profile) => this.toResponseDto(profile));
  }

  async findOneForUser(
    userId: string,
    profileId: string,
  ): Promise<SuspiciousProfileDetailResponseDto> {
    const profile = await this.prisma.suspiciousProfile.findUnique({
      where: { id: profileId },
      include: {
        analyses: {
          where: { type: AnalysisType.SIMILARITY_CHECK },
          orderBy: { createdAt: 'desc' },
        },
      },
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

    const { profile, analysis } = await this.prisma.$transaction(async (tx) => {
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
          incidentId: null,
          officialAccountId: analysisResult.matchedOfficialAccountId,
          suspiciousProfileId: createdProfile.id,
          type: AnalysisType.SIMILARITY_CHECK,
          summary: analysisResult.summary,
          confidence: Number((analysisResult.overallScore / 100).toFixed(4)),
          result: analysisResult as unknown as Prisma.InputJsonValue,
        },
      });

      return { profile: createdProfile, analysis: createdAnalysis };
    });

    return this.toResponseDto({
      ...profile,
      analyses: [analysis],
    });
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

    return this.toResponseDto({
      ...existing,
      analyses: [createdAnalysis],
    });
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
      include: {
        analyses: {
          where: { type: AnalysisType.SIMILARITY_CHECK },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
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

    await this.prisma.$transaction(async (tx) => {
      await tx.analysis.deleteMany({
        where: {
          userId,
          suspiciousProfileId: profileId,
          incidentId: null,
        },
      });
      await tx.suspiciousProfile.delete({
        where: { id: profileId },
      });
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
      analysis.result as unknown as Partial<SimilarityAnalysisResultPayload>;

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
    profile: ProfileWithAnalyses,
  ): SuspiciousProfileResponseDto {
    const latest = profile.analyses[0];
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
    };
  }
}
