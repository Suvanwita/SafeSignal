import fs from 'node:fs';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertOwnedResource } from '../../common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateEvidenceDto } from './dto/create-evidence.dto';
import type {
  DeleteEvidenceResponseDto,
  EvidenceResponseDto,
} from './dto/evidence-response.dto';
import type { ListEvidenceQueryDto } from './dto/list-evidence-query.dto';
import type { UploadEvidenceDto } from './dto/upload-evidence.dto';
import { validateAndInspectEvidenceFile } from './vault-file-validator';
import { VaultStorageService } from './vault-storage.service';

const MAX_FUTURE_DRIFT_MS = 24 * 60 * 60 * 1000;

export interface FileDownloadStreamResult {
  stream: fs.ReadStream;
  filename: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vaultStorage: VaultStorageService,
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
    return this.toResponseDto(record);
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
   */
  async getFileStreamForUser(
    userId: string,
    evidenceId: string,
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

    return {
      stream,
      filename: record.fileName || `evidence-${record.id}`,
      mimeType: record.mimeType || 'application/octet-stream',
      size,
    };
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
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
