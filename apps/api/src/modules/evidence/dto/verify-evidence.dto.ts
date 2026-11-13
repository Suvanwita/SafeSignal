import { ApiProperty } from '@nestjs/swagger';

export enum EvidenceIntegrityStatus {
  VERIFIED = 'VERIFIED',
  INTEGRITY_MISMATCH = 'INTEGRITY_MISMATCH',
}

export const EVIDENCE_INTEGRITY_DISCLAIMER =
  'Cryptographic hash verification establishes file integrity relative to the recorded upload (confirming the file has remained unmodified in vault custody since upload), not the authenticity, accuracy, or truthfulness of the original content.';

export class VerifyEvidenceResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Evidence record UUID',
  })
  evidenceId!: string;

  @ApiProperty({
    enum: EvidenceIntegrityStatus,
    example: EvidenceIntegrityStatus.VERIFIED,
    description: 'Verification result status: VERIFIED or INTEGRITY_MISMATCH',
  })
  status!: EvidenceIntegrityStatus;

  @ApiProperty({
    example: true,
    description:
      'Boolean flag indicating whether the file hash matches the upload record',
  })
  verified!: boolean;

  @ApiProperty({
    example: 'SHA-256',
    description: 'Cryptographic hashing algorithm used',
  })
  algorithm!: string;

  @ApiProperty({
    example:
      '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
    description: 'Original SHA-256 hash computed at upload time',
  })
  originalHash!: string;

  @ApiProperty({
    example:
      '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
    description:
      'Recalculated SHA-256 hash computed from the current stored file in vault',
  })
  recalculatedHash!: string;

  @ApiProperty({
    example: 1048576,
    description: 'Original recorded file size in bytes',
    nullable: true,
  })
  originalFileSize!: number | null;

  @ApiProperty({
    example: 1048576,
    description: 'Recalculated current file size in bytes',
  })
  currentFileSize!: number;

  @ApiProperty({
    example: 'image/png',
    description: 'Canonical MIME type recorded at upload',
    nullable: true,
  })
  mimeType!: string | null;

  @ApiProperty({
    example: '2026-11-13T00:00:00.000Z',
    description: 'Upload timestamp when original hash was recorded',
  })
  uploadedAt!: Date;

  @ApiProperty({
    example: '2026-11-13T09:41:20.000Z',
    description: 'Timestamp when integrity recalculation occurred',
  })
  verifiedAt!: Date;

  @ApiProperty({
    example: EVIDENCE_INTEGRITY_DISCLAIMER,
    description:
      'Legal and technical disclaimer regarding integrity vs authenticity',
  })
  disclaimer!: string;
}
