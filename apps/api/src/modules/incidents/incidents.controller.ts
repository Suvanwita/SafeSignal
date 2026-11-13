import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { AttachEvidenceDto } from './dto/attach-evidence.dto';
import { CloseIncidentDto } from './dto/close-incident.dto';
import { CreateIncidentDto } from './dto/create-incident.dto';
import {
  IncidentDetailResponseDto,
  IncidentSummaryResponseDto,
} from './dto/incident-response.dto';
import { LinkProfilesDto } from './dto/link-profiles.dto';
import { LinkReportsDto } from './dto/link-reports.dto';
import { ListIncidentsQueryDto } from './dto/list-incidents-query.dto';
import { ListTimelineQueryDto } from './dto/list-timeline-query.dto';
import { PaginatedTimelineResponseDto } from './dto/paginated-timeline-response.dto';
import { ReopenIncidentDto } from './dto/reopen-incident.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident-status.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { IncidentsService } from './incidents.service';

@ApiTags('Incidents')
@ApiBearerAuth('bearer')
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List incidents owned by current user with optional filters',
  })
  @ApiOkResponse({ type: [IncidentSummaryResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  findAll(
    @CurrentUser('id') userId: string,
    @Query() query: ListIncidentsQueryDto,
  ): Promise<IncidentSummaryResponseDto[]> {
    return this.incidentsService.findAllForUser(userId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new safety incident' })
  @ApiCreatedResponse({ type: IncidentDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({
    description: 'User does not own linked account/profile',
  })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateIncidentDto,
  ): Promise<IncidentDetailResponseDto> {
    return this.incidentsService.createForUser(userId, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get incident details including abuse reports, evidence, timeline and profiles',
  })
  @ApiOkResponse({ type: IncidentDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Incident not found' })
  findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IncidentDetailResponseDto> {
    return this.incidentsService.findOneForUser(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update incident attributes and classifications' })
  @ApiOkResponse({ type: IncidentDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Incident not found' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
  ): Promise<IncidentDetailResponseDto> {
    return this.incidentsService.updateForUser(userId, id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update incident status and/or severity with audit notes' })
  @ApiOkResponse({ type: IncidentDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Incident not found' })
  updateStatus(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentStatusDto,
  ): Promise<IncidentDetailResponseDto> {
    return this.incidentsService.updateStatusForUser(userId, id, dto);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive and close an incident' })
  @ApiOkResponse({ type: IncidentDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Incident not found' })
  close(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseIncidentDto,
  ): Promise<IncidentDetailResponseDto> {
    return this.incidentsService.closeForUser(userId, id, dto);
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reopen a resolved or closed incident' })
  @ApiOkResponse({ type: IncidentDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Incident not found' })
  reopen(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenIncidentDto,
  ): Promise<IncidentDetailResponseDto> {
    return this.incidentsService.reopenForUser(userId, id, dto);
  }

  @Post(':id/reports')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link existing abuse reports to this incident' })
  @ApiOkResponse({ type: IncidentDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Incident or report not found' })
  linkReports(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkReportsDto,
  ): Promise<IncidentDetailResponseDto> {
    return this.incidentsService.linkReportsForUser(userId, id, dto);
  }

  @Delete(':id/reports/:reportId')
  @ApiOperation({ summary: 'Unlink an abuse report from this incident' })
  @ApiOkResponse({ type: IncidentDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Incident or report not found' })
  unlinkReport(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ): Promise<IncidentDetailResponseDto> {
    return this.incidentsService.unlinkReportForUser(userId, id, reportId);
  }

  @Post(':id/profiles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link suspicious profiles to this incident' })
  @ApiOkResponse({ type: IncidentDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Incident or profile not found' })
  linkProfiles(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkProfilesDto,
  ): Promise<IncidentDetailResponseDto> {
    return this.incidentsService.linkProfilesForUser(userId, id, dto);
  }

  @Delete(':id/profiles/:profileId')
  @ApiOperation({ summary: 'Unlink a suspicious profile from this incident' })
  @ApiOkResponse({ type: IncidentDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Incident or profile not found' })
  unlinkProfile(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ): Promise<IncidentDetailResponseDto> {
    return this.incidentsService.unlinkProfileForUser(userId, id, profileId);
  }

  @Post(':id/evidence')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Attach a new evidence record directly to this incident' })
  @ApiCreatedResponse({ type: IncidentDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Incident not found' })
  attachEvidence(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachEvidenceDto,
  ): Promise<IncidentDetailResponseDto> {
    return this.incidentsService.attachEvidenceForUser(userId, id, dto);
  }

  @Get(':id/timeline')
  @ApiOperation({
    summary: 'Get paginated chronological timeline events for an incident',
  })
  @ApiOkResponse({ type: PaginatedTimelineResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiNotFoundResponse({ description: 'Incident not found' })
  getTimeline(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListTimelineQueryDto,
  ): Promise<PaginatedTimelineResponseDto> {
    return this.incidentsService.getTimelineForUser(userId, id, query);
  }

  @Patch(':id/timeline/:eventId')
  @HttpCode(HttpStatus.FORBIDDEN)
  @ApiOperation({
    summary:
      'Attempt to edit system-generated historical timeline events (Forbidden)',
  })
  @ApiForbiddenResponse({
    description: 'Historical timeline events are immutable',
  })
  updateTimelineEvent(): never {
    throw new ForbiddenException({
      code: 'FORBIDDEN_IMMUTABLE_EVENT',
      message:
        'System-generated historical timeline events are immutable and cannot be edited.',
    });
  }

  @Delete(':id/timeline/:eventId')
  @HttpCode(HttpStatus.FORBIDDEN)
  @ApiOperation({
    summary:
      'Attempt to delete system-generated historical timeline events (Forbidden)',
  })
  @ApiForbiddenResponse({
    description: 'Historical timeline events are immutable',
  })
  deleteTimelineEvent(): never {
    throw new ForbiddenException({
      code: 'FORBIDDEN_IMMUTABLE_EVENT',
      message:
        'System-generated historical timeline events are immutable and cannot be deleted.',
    });
  }
}
