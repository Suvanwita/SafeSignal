import { ApiProperty } from '@nestjs/swagger';
import { AnalysisType, Platform, SuspiciousProfileStatus } from '@prisma/client';

export type SimilarityLevel =
  | 'NO_BASELINE'
  | 'LOW_SIMILARITY'
  | 'MODERATE_SIMILARITY'
  | 'HIGH_SIMILARITY';

export type IndicatorLevel = 'INFO' | 'MODERATE' | 'HIGH';

export type IndicatorCategory =
  | 'USERNAME'
  | 'DISPLAY_NAME'
  | 'BIO'
  | 'PROFILE_URL'
  | 'PLATFORM'
  | 'BASELINE';

export interface DimensionBreakdown {
  score: number | null;
  available: boolean;
  weight: number;
  explanation: string;
  indicators: string[];
}

export interface ImpersonationIndicator {
  id: string;
  category: IndicatorCategory;
  level: IndicatorLevel;
  title: string;
  explanation: string;
}

export interface OfficialAccountComparison {
  officialAccountId: string;
  platform: Platform;
  username: string;
  displayName: string | null;
  profileUrl: string | null;
  isPrimary: boolean;
  overallScore: number;
  level: Exclude<SimilarityLevel, 'NO_BASELINE'>;
  dimensions: {
    username: DimensionBreakdown;
    displayName: DimensionBreakdown;
    bio: DimensionBreakdown;
    profileUrl: DimensionBreakdown;
  };
  indicators: ImpersonationIndicator[];
  explanationSummary: string;
}

export interface SimilarityAnalysisResultPayload {
  overallScore: number;
  level: SimilarityLevel;
  disclaimer: string;
  evaluatedAccountCount: number;
  matchedOfficialAccountId: string | null;
  summary: string;
  indicators: ImpersonationIndicator[];
  bestMatch: OfficialAccountComparison | null;
  comparisons: OfficialAccountComparison[];
}

export class SimilarityAnalysisDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: AnalysisType, example: AnalysisType.SIMILARITY_CHECK })
  type!: AnalysisType;

  @ApiProperty({ example: 78, minimum: 0, maximum: 100 })
  overallScore!: number;

  @ApiProperty({
    enum: [
      'NO_BASELINE',
      'LOW_SIMILARITY',
      'MODERATE_SIMILARITY',
      'HIGH_SIMILARITY',
    ],
  })
  level!: SimilarityLevel;

  @ApiProperty({ format: 'uuid', nullable: true })
  matchedOfficialAccountId!: string | null;

  @ApiProperty()
  summary!: string;

  @ApiProperty()
  disclaimer!: string;

  @ApiProperty()
  evaluatedAccountCount!: number;

  @ApiProperty({ type: Object, nullable: true })
  bestMatch!: OfficialAccountComparison | null;

  @ApiProperty({ type: [Object] })
  comparisons!: OfficialAccountComparison[];

  @ApiProperty({ type: [Object] })
  indicators!: ImpersonationIndicator[];

  @ApiProperty()
  createdAt!: Date;
}

export class SuspiciousProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: Platform })
  platform!: Platform;

  @ApiProperty({ example: 'safes1gnal_support' })
  username!: string;

  @ApiProperty({ nullable: true })
  displayName!: string | null;

  @ApiProperty({ nullable: true })
  profileUrl!: string | null;

  @ApiProperty({ nullable: true })
  bio!: string | null;

  @ApiProperty({ nullable: true })
  profileImageUrl!: string | null;

  @ApiProperty({ enum: SuspiciousProfileStatus })
  reviewStatus!: SuspiciousProfileStatus;

  @ApiProperty({ nullable: true })
  reviewedAt!: Date | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: SimilarityAnalysisDto, nullable: true })
  latestAnalysis!: SimilarityAnalysisDto | null;
}

export class SuspiciousProfileDetailResponseDto extends SuspiciousProfileResponseDto {
  @ApiProperty({ type: [SimilarityAnalysisDto] })
  analyses!: SimilarityAnalysisDto[];
}

export class DeleteSuspiciousProfileResponseDto {
  @ApiProperty({ example: true })
  deleted!: true;

  @ApiProperty({ format: 'uuid' })
  id!: string;
}
