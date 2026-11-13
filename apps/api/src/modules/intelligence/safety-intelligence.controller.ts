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
import { AnalyzeSafetyTextDto } from './dto/analyze-safety-text.dto';
import { ListSafetyAnalysesQueryDto } from './dto/list-safety-analyses.dto';
import { SafetyAnalysisResponseDto } from './dto/safety-analysis-response.dto';
import { SafetyIntelligenceService } from './safety-intelligence.service';

@ApiTags('Safety Intelligence')
@ApiBearerAuth('bearer')
@Controller('intelligence/safety')
export class SafetyIntelligenceController {
  constructor(
    private readonly safetyIntelligenceService: SafetyIntelligenceService,
  ) {}

  @Post('analyze-text')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Run rule-based safety intelligence analysis on text, messages, or threat reports',
  })
  @ApiOkResponse({ type: SafetyAnalysisResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  analyzeText(
    @CurrentUser('id') userId: string,
    @Body() dto: AnalyzeSafetyTextDto,
  ): Promise<SafetyAnalysisResponseDto> {
    return this.safetyIntelligenceService.analyzeTextForUser(userId, dto);
  }

  @Post('analyze-incident/:incidentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Aggregate and analyze all reports, evidence, and profile content in an incident case',
  })
  @ApiOkResponse({ type: SafetyAnalysisResponseDto })
  @ApiNotFoundResponse({ description: 'Incident not found' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  analyzeIncident(
    @CurrentUser('id') userId: string,
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto?: Partial<AnalyzeSafetyTextDto>,
  ): Promise<SafetyAnalysisResponseDto> {
    return this.safetyIntelligenceService.analyzeIncidentForUser(
      userId,
      incidentId,
      dto,
    );
  }

  @Post('analyze-evidence/:evidenceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Analyze evidence content, descriptions, and extracted text for safety indicators',
  })
  @ApiOkResponse({ type: SafetyAnalysisResponseDto })
  @ApiNotFoundResponse({ description: 'Evidence not found' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  analyzeEvidence(
    @CurrentUser('id') userId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Body() dto?: Partial<AnalyzeSafetyTextDto>,
  ): Promise<SafetyAnalysisResponseDto> {
    return this.safetyIntelligenceService.analyzeEvidenceForUser(
      userId,
      evidenceId,
      dto,
    );
  }

  @Get('analyses')
  @ApiOperation({
    summary:
      'List stored safety intelligence analyses for the user (filter by incident, evidence, risk level)',
  })
  @ApiOkResponse({ type: [SafetyAnalysisResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  getAnalyses(
    @CurrentUser('id') userId: string,
    @Query() query: ListSafetyAnalysesQueryDto,
  ): Promise<SafetyAnalysisResponseDto[]> {
    return this.safetyIntelligenceService.getAnalysesForUser(userId, query);
  }

  @Get('analyses/:id')
  @ApiOperation({
    summary: 'Get details of a stored safety intelligence analysis',
  })
  @ApiOkResponse({ type: SafetyAnalysisResponseDto })
  @ApiNotFoundResponse({ description: 'Analysis not found' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  getAnalysis(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SafetyAnalysisResponseDto> {
    return this.safetyIntelligenceService.getAnalysisByIdForUser(userId, id);
  }

  @Delete('analyses/:id')
  @ApiOperation({
    summary: 'Delete a stored safety intelligence analysis record',
  })
  @ApiOkResponse({ schema: { example: { deleted: true, id: 'uuid' } } })
  @ApiNotFoundResponse({ description: 'Analysis not found' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  deleteAnalysis(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ deleted: true; id: string }> {
    return this.safetyIntelligenceService.deleteAnalysisForUser(userId, id);
  }
}
