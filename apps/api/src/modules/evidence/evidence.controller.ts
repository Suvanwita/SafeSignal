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
  Post,
  Query,
  Res,
  StreamableFile,
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
import type { Response as ExpressResponse } from 'express';
import { CurrentUser, SkipResponseTransform } from '../../common';
import { CreateEvidenceDto } from './dto/create-evidence.dto';
import {
  DeleteEvidenceResponseDto,
  EvidenceResponseDto,
} from './dto/evidence-response.dto';
import { ListEvidenceQueryDto } from './dto/list-evidence-query.dto';
import { UploadEvidenceDto } from './dto/upload-evidence.dto';
import { EvidenceService } from './evidence.service';
import { MAX_EVIDENCE_FILE_SIZE_BYTES } from './vault-file-validator';

@ApiTags('Evidence')
@ApiBearerAuth('bearer')
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

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

  @Get(':id/download')
  @SkipResponseTransform()
  @ApiOperation({
    summary:
      'Download the raw evidence file securely from the private evidence vault',
  })
  @ApiProduces(
    'image/png',
    'image/jpeg',
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  @ApiOkResponse({ description: 'Raw binary evidence file stream' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Evidence record or file not found' })
  async download(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<StreamableFile> {
    const { stream, filename, mimeType, size } =
      await this.evidenceService.getFileStreamForUser(userId, id);

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"; filename*="UTF-8''${encodeURIComponent(filename)}"`,
      'Content-Length': size.toString(),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    });

    return new StreamableFile(stream);
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
