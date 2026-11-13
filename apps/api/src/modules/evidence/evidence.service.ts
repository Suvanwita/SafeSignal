import crypto from 'node:crypto';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CorruptedVaultDataException,
  EncryptionService,
  assertOwnedResource,
} from '../../common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateEvidenceDto } from './dto/create-evidence.dto';
import { DownloadTokenResponseDto } from './dto/download-token-response.dto';
import { EvidenceAuditLogResponseDto } from './dto/evidence-audit-log-response.dto';
import type {
  DeleteEvidenceResponseDto,
  EvidenceResponseDto,
} from './dto/evidence-response.dto';
import type { ListEvidenceQueryDto } from './dto/list-evidence-query.dto';
import type { UpdateEvidenceDto } from './dto/update-evidence.dto';
import type { UploadEvidenceDto } from './dto/upload-evidence.dto';
import {
  EVIDENCE_INTEGRITY_DISCLAIMER,
  EvidenceIntegrityStatus,
  type VerifyEvidenceResponseDto,
} from './dto/verify-evidence.dto';
import { extractEvidenceMetadata } from './evidence-metadata-extractor';
import { validateAndInspectEvidenceFile } from './vault-file-validator';
import { VaultStorageService } from './vault-storage.service';

const MAX_FUTURE_DRIFT_MS = 24 * 60 * 60 * 1000;

export interface FileDownloadStreamResult {
  stream: fs.ReadStream | Readable;
  filename: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class EvidenceService {
  private readonly consumedDownloadTokens = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly vaultStorage: VaultStorageService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async findAllForUser(
    userId: string,
    query: ListEvidenceQueryDto = {},
  ): Promise<EvidenceResponseDto[]> {
    if (query.incidentId) {
      await this.verifyOwnedIncident(userId, query.incidentId);
    }
    if (query.abuseReportId) {
      await this.verifyOwnedAbuseReport(userId, query.abuseReportId);
    }

    const records = await this.prisma.evidence.findMany({
      where: {
        userId,
        ...(query.incidentId ? { incidentId: query.incidentId } : {}),
        ...(query.abuseReportId ? { abuseReportId: query.abuseReportId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((record) => this.toResponseDto(record));
  }

  async findOneForUser(
    userId: string,
    evidenceId: string,
  ): Promise<EvidenceResponseDto> {
    const record = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
    });

    assertOwnedResource(record, userId, 'Evidence');

    // If metadata was not extracted at upload time (e.g. legacy records), extract lazily
    if (!record.metadata && record.storageKey) {
      try {
        const absolutePath = this.vaultStorage.resolveAndValidatePath(
          record.storageKey,
        );
        if (fs.existsSync(absolutePath)) {
          const buffer = await fs.promises.readFile(absolutePath);
          const ext = (record.fileName || '').split('.').pop()?.toLowerCase();
          const format =
            ext === 'png'
              ? 'PNG'
              : ext === 'jpg' || ext === 'jpeg'
                ? 'JPG'
                : ext === 'pdf'
                  ? 'PDF'
                  : ext === 'txt'
                    ? 'TXT'
                    : ext === 'docx'
                      ? 'DOCX'
                      : 'OTHER';

          const meta = await extractEvidenceMetadata({
            buffer,
            sanitizedFilename: record.fileName || 'evidence',
            canonicalMimeType: record.mimeType || 'application/octet-stream',
            fileSize: record.fileSize || buffer.length,
            format,
            sha256: record.sha256 || '',
            uploadTimestamp: record.createdAt.toISOString(),
          });

          const updated = await this.prisma.evidence.update({
            where: { id: evidenceId },
            data: { metadata: meta as unknown as Prisma.InputJsonValue },
          });
          return this.toResponseDto(updated);
        }
      } catch {
        // Fallback to existing record
      }
    }

    return this.toResponseDto(record);
  }

  /**
   * Retrieves extracted structured metadata for an evidence record.
   * Access is strictly restricted to the evidence owner.
   */
  async getMetadataForUser(
    userId: string,
    evidenceId: string,
  ): Promise<Prisma.JsonValue | null> {
    const detail = await this.findOneForUser(userId, evidenceId);
    return detail.metadata as Prisma.JsonValue | null;
  }

  /**
   * Uploads an evidence file into the private vault storage, validates its signature,
   * stores original metadata in PostgreSQL, and links it to an incident.
   */
  async uploadForUser(
    userId: string,
    file: Express.Multer.File,
    dto: UploadEvidenceDto,
  ): Promise<EvidenceResponseDto> {
    // 1. Verify caller owns the target incident
    await this.verifyOwnedIncident(userId, dto.incidentId);

    // 2. If an abuse report is passed, verify ownership and incident association
    if (dto.abuseReportId) {
      await this.verifyOwnedAbuseReportForIncident(
        userId,
        dto.abuseReportId,
        dto.incidentId,
      );
    }

    // 3. Inspect, sanitize, and validate file format, extension, size, and magic signature
    const validated = validateAndInspectEvidenceFile(file);

    // 4. Validate captured date
    const capturedAt = dto.capturedAt
      ? this.parseAndValidateDate(dto.capturedAt, 'Captured date')
      : null;

    // 5. Store file in private local filesystem with random filename (prevent traversal)
    const { storageKey } = await this.vaultStorage.saveFile(
      dto.incidentId,
      validated.canonicalExtension,
      file.buffer,
    );

    const now = new Date();
    const title =
      dto.title && dto.title.trim().length > 0
        ? dto.title.trim()
        : validated.sanitizedFilename;

    // Extract structured metadata (dimensions, EXIF, PDF, text) while guaranteeing original file is not modified
    // and sensitive GPS coordinates are redacted for privacy.
    const extractedMetadata = await extractEvidenceMetadata({
      buffer: file.buffer,
      sanitizedFilename: validated.sanitizedFilename,
      canonicalMimeType: validated.canonicalMimeType,
      fileSize: validated.fileSize,
      format: validated.format,
      sha256: validated.sha256,
      uploadTimestamp: now.toISOString(),
    });

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const evidence = await tx.evidence.create({
          data: {
            userId,
            incidentId: dto.incidentId,
            abuseReportId: dto.abuseReportId ?? null,
            title,
            description: dto.description ?? null,
            sourceUrl: dto.sourceUrl ?? null,
            storageKey, // Relative vault storage path stored in PostgreSQL
            fileName: validated.sanitizedFilename,
            mimeType: validated.canonicalMimeType,
            fileSize: validated.fileSize,
            sha256: validated.sha256,
            capturedAt: capturedAt ?? now,
            metadata: extractedMetadata as unknown as Prisma.InputJsonValue,
          },
        });

        await tx.timelineEvent.create({
          data: {
            userId,
            incidentId: dto.incidentId,
            eventType: 'EVIDENCE_ATTACHED',
            title: `Evidence attached: ${evidence.title}`,
            description: `Attached file: ${evidence.fileName} (${validated.format}, ${(validated.fileSize / 1024).toFixed(1)} KB)`,
            metadata: {
              evidenceId: evidence.id,
              fileName: evidence.fileName,
              mimeType: evidence.mimeType,
              fileSize: evidence.fileSize,
              sha256: evidence.sha256,
              format: validated.format,
              abuseReportId: evidence.abuseReportId,
            } as Prisma.InputJsonValue,
            occurredAt: capturedAt ?? now,
          },
        });

        return evidence;
      });

      // Record immutable audit log entry for evidence upload
      await this.prisma.evidenceAuditLog.create({
        data: {
          userId,
          evidenceId: created.id,
          action: 'UPLOAD',
          status: 'SUCCESS',
          details: {
            fileName: created.fileName,
            mimeType: created.mimeType,
            fileSize: created.fileSize,
            sha256: created.sha256,
            format: validated.format,
            incidentId: created.incidentId,
          } as Prisma.InputJsonValue,
        },
      });

      return this.toResponseDto(created);
    } catch (err) {
      // Clean up orphaned file if DB transaction failed
      await this.vaultStorage.deleteFile(storageKey);
      throw err;
    }
  }

  /**
   * Retrieves an authenticated read stream for the evidence file.
   * Verifies user ownership and streams file securely without exposing filesystem paths.
   * Records audit logs and timeline events for evidence download.
   */
  async getFileStreamForUser(
    userId: string,
    evidenceId: string,
    auditContext?: {
      method?: 'BEARER_AUTH' | 'TOKEN_AUTH';
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<FileDownloadStreamResult> {
    const record = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
    });
    assertOwnedResource(record, userId, 'Evidence');

    if (!record.storageKey) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: 'No physical file is associated with this evidence record.',
      });
    }

    const { stream, size } = await this.vaultStorage.getReadStream(
      record.storageKey,
    );

    const method = auditContext?.method ?? 'BEARER_AUTH';
    const now = new Date();

    // Record audit log for evidence download
    await this.prisma.evidenceAuditLog.create({
      data: {
        userId,
        evidenceId: record.id,
        action: 'DOWNLOAD',
        status: 'SUCCESS',
        ipAddress: auditContext?.ipAddress ?? null,
        userAgent: auditContext?.userAgent ?? null,
        details: {
          method,
          fileName: record.fileName,
          fileSize: size,
          sha256: record.sha256,
        } as Prisma.InputJsonValue,
        createdAt: now,
      },
    });

    // Record download event in incident timeline
    await this.prisma.timelineEvent.create({
      data: {
        userId,
        incidentId: record.incidentId,
        eventType: 'EVIDENCE_DOWNLOADED',
        title: `Evidence downloaded: ${record.title}`,
        description: `Evidence file ${record.fileName} downloaded by owner via ${method}.`,
        metadata: {
          evidenceId: record.id,
          fileName: record.fileName,
          sha256: record.sha256,
          fileSize: size,
          method,
        } as Prisma.InputJsonValue,
        occurredAt: now,
      },
    });

    return {
      stream,
      filename: record.fileName || `evidence-${record.id}`,
      mimeType: record.mimeType || 'application/octet-stream',
      size,
    };
  }

  /**
   * Cryptographically verifies the integrity of an evidence file against its recorded upload hash.
   * Recalculates the SHA-256 hash directly from the stored file in the private vault
   * and compares it with the immutable hash recorded at upload.
   *
   * Note: Hash verification establishes file integrity relative to the recorded upload,
   * not the authenticity or truthfulness of the original content.
   */
  async verifyIntegrityForUser(
    userId: string,
    evidenceId: string,
  ): Promise<VerifyEvidenceResponseDto> {
    const record = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
    });
    assertOwnedResource(record, userId, 'Evidence');

    if (!record.storageKey) {
      throw new NotFoundException({
        code: 'EVIDENCE_FILE_NOT_FOUND',
        message: 'No physical file is associated with this evidence record in the vault.',
      });
    }

    // Recalculate hash from stored file in vault (with authenticated AES-256-GCM decryption if encrypted)
    let recalculated: { sha256: string; size: number };
    let corruptedError: string | null = null;

    try {
      recalculated = await this.vaultStorage.computeFileSha256(
        record.storageKey,
      );
    } catch (err: unknown) {
      if (err instanceof CorruptedVaultDataException) {
        corruptedError = err.message;
        recalculated = {
          sha256: 'CRYPTO_AUTHENTICATION_FAILED_CORRUPTED_CIPHERTEXT',
          size: 0,
        };
      } else {
        throw err;
      }
    }

    const originalHash = (record.sha256 || '').toLowerCase().trim();
    const recalculatedHash = recalculated.sha256.toLowerCase().trim();
    const isMatch =
      !corruptedError &&
      originalHash.length === 64 &&
      originalHash === recalculatedHash;

    const status = isMatch
      ? EvidenceIntegrityStatus.VERIFIED
      : EvidenceIntegrityStatus.INTEGRITY_MISMATCH;

    const now = new Date();

    // Record audit log for verification
    await this.prisma.evidenceAuditLog.create({
      data: {
        userId,
        evidenceId: record.id,
        action: 'VERIFY',
        status: isMatch ? 'SUCCESS' : 'MISMATCH',
        details: {
          algorithm: 'SHA-256',
          originalHash,
          recalculatedHash,
          matches: isMatch,
          corrupted: !!corruptedError,
        } as Prisma.InputJsonValue,
        createdAt: now,
      },
    });

    // Record verification event in timeline audit trail
    await this.prisma.timelineEvent.create({
      data: {
        userId,
        incidentId: record.incidentId,
        eventType: 'EVIDENCE_VERIFIED',
        title: `Evidence integrity verified: ${record.title} (${status})`,
        description: isMatch
          ? `Cryptographic integrity verified. Recalculated SHA-256 hash matches the upload record.`
          : corruptedError
            ? `Cryptographic integrity mismatch detected! Evidence file failed authenticated decryption (tampered or corrupted ciphertext).`
            : `Cryptographic integrity mismatch detected! Recalculated SHA-256 hash (${recalculatedHash.slice(0, 12)}...) differs from original upload hash (${originalHash.slice(0, 12)}...).`,
        metadata: {
          evidenceId: record.id,
          status,
          algorithm: 'SHA-256',
          originalHash,
          recalculatedHash,
          matches: isMatch,
          originalFileSize: record.fileSize,
          currentFileSize: recalculated.size,
          corrupted: !!corruptedError,
        } as Prisma.InputJsonValue,
        occurredAt: now,
      },
    });

    return {
      evidenceId: record.id,
      status,
      verified: isMatch,
      algorithm: 'SHA-256',
      originalHash: record.sha256 ?? '',
      recalculatedHash: recalculated.sha256,
      originalFileSize: record.fileSize,
      currentFileSize: recalculated.size,
      mimeType: record.mimeType,
      uploadedAt: record.createdAt,
      verifiedAt: now,
      disclaimer: EVIDENCE_INTEGRITY_DISCLAIMER,
    };
  }

  /**
   * Generates a short-lived, single-purpose AES-256-GCM encrypted download authorization token.
   * Enforces owner-only access and single-use replay protection.
   */
  async generateDownloadToken(
    userId: string,
    evidenceId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<DownloadTokenResponseDto> {
    const record = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
    });
    assertOwnedResource(record, userId, 'Evidence');

    if (!record.storageKey) {
      throw new NotFoundException({
        code: 'FILE_NOT_FOUND',
        message: 'No physical file is associated with this evidence record.',
      });
    }

    const jti = crypto.randomUUID();
    const expiresInSeconds = 60;
    const exp = Date.now() + expiresInSeconds * 1000;

    const token = this.encryptionService.encryptDownloadToken({
      evidenceId: record.id,
      userId,
      jti,
      exp,
      purpose: 'EVIDENCE_DOWNLOAD',
    });

    // Record audit log for download token issuance
    await this.prisma.evidenceAuditLog.create({
      data: {
        userId,
        evidenceId: record.id,
        action: 'TOKEN_ISSUED',
        status: 'SUCCESS',
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        details: {
          jti,
          expiresInSeconds,
          expiresAt: new Date(exp).toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    return {
      token,
      expiresAt: new Date(exp).toISOString(),
      expiresInSeconds,
      evidenceId: record.id,
      downloadUrl: `/api/v1/evidence/${record.id}/download?token=${encodeURIComponent(token)}`,
    };
  }

  /**
   * Validates and consumes a short-lived download authorization token.
   * Performs authenticated decryption, expiration checking, evidence ID matching (IDOR prevention),
   * and single-use replay protection.
   */
  async validateAndConsumeDownloadToken(
    tokenString: string,
    requestedEvidenceId: string,
    _ipAddress?: string,
    _userAgent?: string,
  ): Promise<{ userId: string; evidenceId: string }> {
    this.pruneConsumedTokens();

    const payload = this.encryptionService.decryptDownloadToken(tokenString);

    if (payload.purpose !== 'EVIDENCE_DOWNLOAD') {
      throw new UnauthorizedException({
        code: 'INVALID_DOWNLOAD_TOKEN_PURPOSE',
        message: 'Token is not authorized for evidence download.',
      });
    }

    // Verify token matches requested evidence ID (IDOR prevention)
    if (payload.evidenceId !== requestedEvidenceId) {
      throw new ForbiddenException({
        code: 'DOWNLOAD_TOKEN_MISMATCH',
        message: 'Download token was not issued for this evidence file.',
      });
    }

    // Check expiration
    if (Date.now() > payload.exp) {
      throw new UnauthorizedException({
        code: 'DOWNLOAD_TOKEN_EXPIRED',
        message: 'Download authorization token has expired.',
      });
    }

    // Check single-use replay protection
    if (this.consumedDownloadTokens.has(payload.jti)) {
      throw new UnauthorizedException({
        code: 'DOWNLOAD_TOKEN_ALREADY_USED',
        message: 'Download authorization token has already been consumed.',
      });
    }

    // Mark token as consumed
    this.consumedDownloadTokens.set(payload.jti, payload.exp);

    // Verify that evidence exists and belongs to the authorized user
    const record = await this.prisma.evidence.findUnique({
      where: { id: requestedEvidenceId },
    });
    assertOwnedResource(record, payload.userId, 'Evidence');

    return {
      userId: payload.userId,
      evidenceId: payload.evidenceId,
    };
  }

  private pruneConsumedTokens(): void {
    const now = Date.now();
    for (const [jti, exp] of this.consumedDownloadTokens.entries()) {
      if (now > exp) {
        this.consumedDownloadTokens.delete(jti);
      }
    }
  }

  /**
   * Retrieves complete audit records for an evidence file (restricted to evidence owner).
   */
  async getAuditLogsForUser(
    userId: string,
    evidenceId: string,
  ): Promise<EvidenceAuditLogResponseDto[]> {
    const record = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
    });
    assertOwnedResource(record, userId, 'Evidence');

    const logs = await this.prisma.evidenceAuditLog.findMany({
      where: { evidenceId },
      orderBy: { createdAt: 'desc' },
    });

    return logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      evidenceId: log.evidenceId,
      action: log.action,
      status: log.status,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      details: log.details,
      createdAt: log.createdAt,
    }));
  }

  /**
   * Updates mutable metadata on an evidence record (title, description, sourceUrl).
   * Strict security enforcement: users are NEVER permitted to edit sha256 or custody parameters.
   */
  async updateForUser(
    userId: string,
    evidenceId: string,
    dto: UpdateEvidenceDto,
  ): Promise<EvidenceResponseDto> {
    const existing = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
    });
    assertOwnedResource(existing, userId, 'Evidence');

    // Immutable integrity enforcement: users cannot modify the original hash or custody keys
    const updated = await this.prisma.evidence.update({
      where: { id: evidenceId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.sourceUrl !== undefined ? { sourceUrl: dto.sourceUrl } : {}),
      },
    });

    return this.toResponseDto(updated);
  }

  /**
   * Creates an evidence record directly (metadata). Kept for backward compatibility.
   */
  async createForUser(
    userId: string,
    dto: CreateEvidenceDto,
  ): Promise<EvidenceResponseDto> {
    await this.verifyOwnedIncident(userId, dto.incidentId);

    if (dto.abuseReportId) {
      await this.verifyOwnedAbuseReportForIncident(
        userId,
        dto.abuseReportId,
        dto.incidentId,
      );
    }

    const capturedAt = dto.capturedAt
      ? this.parseAndValidateDate(dto.capturedAt, 'Captured date')
      : null;

    const now = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const evidence = await tx.evidence.create({
        data: {
          userId,
          incidentId: dto.incidentId,
          abuseReportId: dto.abuseReportId ?? null,
          title: dto.title,
          description: dto.description ?? null,
          sourceUrl: dto.sourceUrl ?? null,
          storageKey: dto.storageKey ?? null,
          fileName: dto.fileName ?? null,
          mimeType: dto.mimeType ?? null,
          fileSize: dto.fileSize ?? null,
          sha256: dto.sha256 ?? null,
          capturedAt,
        },
      });

      await tx.timelineEvent.create({
        data: {
          userId,
          incidentId: dto.incidentId,
          eventType: 'EVIDENCE_ATTACHED',
          title: `Evidence attached: ${evidence.title}`,
          description:
            evidence.fileName !== null
              ? `Attached file: ${evidence.fileName}`
              : (evidence.description ?? 'Evidence attached to incident.'),
          metadata: {
            evidenceId: evidence.id,
            fileName: evidence.fileName,
            mimeType: evidence.mimeType,
            sha256: evidence.sha256,
            abuseReportId: evidence.abuseReportId,
          } as Prisma.InputJsonValue,
          occurredAt: capturedAt ?? now,
        },
      });

      return evidence;
    });

    return this.toResponseDto(created);
  }

  async removeForUser(
    userId: string,
    evidenceId: string,
  ): Promise<DeleteEvidenceResponseDto> {
    const existing = await this.prisma.evidence.findUnique({
      where: { id: evidenceId },
    });
    assertOwnedResource(existing, userId, 'Evidence');

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.evidence.delete({
        where: { id: evidenceId },
      });

      await tx.timelineEvent.create({
        data: {
          userId,
          incidentId: existing.incidentId,
          eventType: 'EVIDENCE_REMOVED',
          title: `Evidence removed: ${existing.title}`,
          description: `Evidence record removed from incident.`,
          metadata: {
            evidenceId: existing.id,
            title: existing.title,
          } as Prisma.InputJsonValue,
          occurredAt: now,
        },
      });
    });

    // Delete file from disk if present
    if (existing.storageKey) {
      await this.vaultStorage.deleteFile(existing.storageKey);
    }

    return {
      deleted: true,
      id: evidenceId,
    };
  }

  private parseAndValidateDate(raw: string, label: string): Date {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `${label} must be a valid ISO 8601 date string`,
      });
    }

    if (parsed.getTime() > Date.now() + MAX_FUTURE_DRIFT_MS) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `${label} cannot be in the future`,
      });
    }

    return parsed;
  }

  private async verifyOwnedIncident(
    userId: string,
    incidentId: string,
  ): Promise<void> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { id: true, userId: true },
    });
    assertOwnedResource(incident, userId, 'Incident');
  }

  private async verifyOwnedAbuseReport(
    userId: string,
    abuseReportId: string,
  ): Promise<void> {
    const report = await this.prisma.abuseReport.findUnique({
      where: { id: abuseReportId },
      select: { id: true, userId: true },
    });
    assertOwnedResource(report, userId, 'Abuse report');
  }

  private async verifyOwnedAbuseReportForIncident(
    userId: string,
    abuseReportId: string,
    incidentId: string,
  ): Promise<void> {
    const report = await this.prisma.abuseReport.findUnique({
      where: { id: abuseReportId },
      select: { id: true, userId: true, incidentId: true },
    });
    assertOwnedResource(report, userId, 'Abuse report');
    if (report.incidentId !== null && report.incidentId !== incidentId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Abuse report belongs to a different incident',
      });
    }
  }

  private toResponseDto(
    record: Prisma.EvidenceGetPayload<Record<string, never>>,
  ): EvidenceResponseDto {
    return {
      id: record.id,
      userId: record.userId,
      incidentId: record.incidentId,
      abuseReportId: record.abuseReportId,
      title: record.title,
      description: record.description,
      sourceUrl: record.sourceUrl,
      // Do not expose internal filesystem paths or absolute storage paths
      storageKey: null,
      fileName: record.fileName,
      mimeType: record.mimeType,
      fileSize: record.fileSize,
      sha256: record.sha256,
      capturedAt: record.capturedAt,
      metadata: record.metadata,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
