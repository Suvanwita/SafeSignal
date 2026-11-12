import {
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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common';
import { CreateEvidenceDto } from './dto/create-evidence.dto';
import {
  DeleteEvidenceResponseDto,
  EvidenceResponseDto,
} from './dto/evidence-response.dto';
import { ListEvidenceQueryDto } from './dto/list-evidence-query.dto';
import { EvidenceService } from './evidence.service';

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
  @ApiOperation({ summary: 'Get a single evidence record owned by current user' })
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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an evidence record and link it to an incident',
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
  @ApiOperation({ summary: 'Delete an evidence record owned by current user' })
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
