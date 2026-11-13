import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { CurrentUser, Public, SkipResponseTransform } from '../../common';
import { AuthService } from '../auth/auth.service';
import { CreateEvidenceDto } from './dto/create-evidence.dto';
import { DownloadTokenResponseDto } from './dto/download-token-response.dto';
import { EvidenceAuditLogResponseDto } from './dto/evidence-audit-log-response.dto';
import {
  DeleteEvidenceResponseDto,
  EvidenceResponseDto,
} from './dto/evidence-response.dto';
import { ListEvidenceQueryDto } from './dto/list-evidence-query.dto';
import { UpdateEvidenceDto } from './dto/update-evidence.dto';
import { UploadEvidenceDto } from './dto/upload-evidence.dto';
import { VerifyEvidenceResponseDto } from './dto/verify-evidence.dto';
import { EvidenceService } from './evidence.service';
import { MAX_EVIDENCE_FILE_SIZE_BYTES } from './vault-file-validator';

@ApiTags('Evidence')
@ApiBearerAuth('bearer')
@Controller('evidence')
export class EvidenceController {
  constructor(
    private readonly evidenceService: EvidenceService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List evidence records owned by current user' })
  @ApiOkResponse({ type: [EvidenceResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  findAll(
    @CurrentUser('id') userId: string,
    @Query() query: ListEvidenceQueryDto,
  ): Promise<EvidenceResponseDto[]> {
    return this.evidenceService.findAllForUser(userId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single evidence record owned by current user',
  })
  @ApiOkResponse({ type: EvidenceResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Evidence not found' })
  findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EvidenceResponseDto> {
    return this.evidenceService.findOneForUser(userId, id);
  }

  @Get(':id/metadata')
  @ApiOperation({
    summary:
      'Get extracted structured metadata for an evidence file (restricted to owner)',
    description:
      'Returns technical file properties, safe image EXIF metadata (sensitive coordinates such as GPS are automatically redacted), PDF metadata, or text metrics.',
  })
  @ApiOkResponse({ description: 'Structured metadata JSON object' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Evidence not found' })
  getMetadata(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<unknown> {
    return this.evidenceService.getMetadataForUser(userId, id);
  }

  @Post(':id/download-token')
  @ApiOperation({
    summary:
      'Request a short-lived, single-purpose download authorization token for an evidence file',
    description:
      'Issues a single-use AES-256-GCM encrypted authorization token valid for 60 seconds. Restricts access strictly to the authenticated owner and protects against token replay and IDOR attempts.',
  })
  @ApiOkResponse({
    type: DownloadTokenResponseDto,
    description: 'Short-lived download token with direct download URL',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Evidence record not found' })
  generateDownloadToken(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: ExpressRequest,
  ): Promise<DownloadTokenResponseDto> {
    return this.evidenceService.generateDownloadToken(
      userId,
      id,
      req.ip,
      req.headers['user-agent'] as string | undefined,
    );
  }

  @Get(':id/download')
  @Public()
  @SkipResponseTransform()
  @ApiOperation({
    summary:
      'Download raw evidence file from the vault (requires authenticated owner Bearer token OR valid short-lived download token)',
  })
  @ApiProduces(
    'image/png',
    'image/jpeg',
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  @ApiOkResponse({ description: 'Raw binary evidence file stream' })
  @ApiUnauthorizedResponse({ description: 'Authentication required or invalid/expired token' })
  @ApiForbiddenResponse({ description: 'Ownership check failed or token mismatch' })
  @ApiNotFoundResponse({ description: 'Evidence record or file not found' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') downloadToken: string | undefined,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<StreamableFile> {
    let authorizedUserId: string;
    let method: 'BEARER_AUTH' | 'TOKEN_AUTH';

    if (downloadToken && downloadToken.trim().length > 0) {
      // Validate short-lived single-purpose token
      const result = await this.evidenceService.validateAndConsumeDownloadToken(
        downloadToken.trim(),
        id,
        req.ip,
        req.headers['user-agent'] as string | undefined,
      );
      authorizedUserId = result.userId;
      method = 'TOKEN_AUTH';
    } else {
      // Authenticate via Bearer header
      const bearerToken = this.extractBearerToken(req);
      if (!bearerToken) {
        throw new UnauthorizedException({
          code: 'UNAUTHORIZED',
          message:
            'Authentication required: provide Bearer authorization header or valid download token.',
        });
      }
      const { user } = await this.authService.validateAccessToken(bearerToken);
      authorizedUserId = user.id;
      method = 'BEARER_AUTH';
    }

    const { stream, filename, mimeType, size } =
      await this.evidenceService.getFileStreamForUser(authorizedUserId, id, {
        method,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
      });

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"; filename*="UTF-8''${encodeURIComponent(filename)}"`,
      'Content-Length': size.toString(),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    });

    return new StreamableFile(stream);
  }

  @Get(':id/audit')
  @ApiOperation({
    summary:
      'Get chronological audit records for an evidence file (restricted to owner)',
    description:
      'Returns complete audit records for uploads, downloads, verifications, and token issuances for this evidence record.',
  })
  @ApiOkResponse({
    type: [EvidenceAuditLogResponseDto],
    description: 'List of audit records for the evidence item',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Evidence record not found' })
  getAuditLogs(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EvidenceAuditLogResponseDto[]> {
    return this.evidenceService.getAuditLogsForUser(userId, id);
  }

  private extractBearerToken(req: ExpressRequest): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const parts = authHeader.trim().split(/\s+/);
    if (
      parts.length !== 2 ||
      parts[0]?.toLowerCase() !== 'bearer' ||
      !parts[1]
    ) {
      return null;
    }
    return parts[1];
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cryptographically verify evidence file integrity against its recorded upload hash',
    description:
      'Recalculates the SHA-256 checksum from the stored original file in the private vault and compares it with the upload hash. Note: Hash verification establishes file integrity relative to the recorded upload, not the authenticity of the original content.',
  })
  @ApiOkResponse({
    type: VerifyEvidenceResponseDto,
    description:
      'Integrity verification result (VERIFIED or INTEGRITY_MISMATCH)',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({
    description: 'Evidence record or vault file not found',
  })
  verify(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VerifyEvidenceResponseDto> {
    return this.evidenceService.verifyIntegrityForUser(userId, id);
  }

  @Get(':id/verify')
  @ApiOperation({
    summary: 'Cryptographically verify evidence file integrity (GET alias)',
    description:
      'Alias for POST :id/verify. Recalculates the SHA-256 checksum from the stored original file in the private vault and compares it with the upload hash.',
  })
  @ApiOkResponse({ type: VerifyEvidenceResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({
    description: 'Evidence record or vault file not found',
  })
  verifyGet(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VerifyEvidenceResponseDto> {
    return this.evidenceService.verifyIntegrityForUser(userId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update evidence metadata (title, description, sourceUrl). Original hash cannot be edited.',
  })
  @ApiOkResponse({ type: EvidenceResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Evidence not found' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEvidenceDto,
  ): Promise<EvidenceResponseDto> {
    return this.evidenceService.updateForUser(userId, id, dto);
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_EVIDENCE_FILE_SIZE_BYTES,
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload a file (PNG, JPG, PDF, TXT, DOCX) to the private Evidence Vault',
  })
  @ApiBody({
    description: 'Evidence file upload form data',
    schema: {
      type: 'object',
      required: ['file', 'incidentId'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'Evidence file (PNG, JPG/JPEG, PDF, TXT, DOCX; max 15MB)',
        },
        incidentId: {
          type: 'string',
          format: 'uuid',
          description: 'UUID of the incident to associate with',
        },
        title: {
          type: 'string',
          description:
            'Optional title of the evidence (defaults to original filename)',
        },
        description: {
          type: 'string',
          description: 'Optional description or custody context',
        },
        abuseReportId: {
          type: 'string',
          format: 'uuid',
          description: 'Optional associated abuse report UUID',
        },
        sourceUrl: {
          type: 'string',
          description: 'Optional source URL where the evidence was captured',
        },
        capturedAt: {
          type: 'string',
          format: 'date-time',
          description: 'Timestamp when the evidence was captured (ISO 8601)',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: EvidenceResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Incident not found' })
  upload(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadEvidenceDto,
  ): Promise<EvidenceResponseDto> {
    if (!file) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'A file is required for evidence upload.',
      });
    }

    return this.evidenceService.uploadForUser(userId, file, dto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create an evidence metadata record and link it to an incident (backward compatibility)',
  })
  @ApiCreatedResponse({ type: EvidenceResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Incident not found' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateEvidenceDto,
  ): Promise<EvidenceResponseDto> {
    return this.evidenceService.createForUser(userId, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Delete an evidence record and remove its file from private vault storage',
  })
  @ApiOkResponse({ type: DeleteEvidenceResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Evidence not found' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeleteEvidenceResponseDto> {
    return this.evidenceService.removeForUser(userId, id);
  }
}
