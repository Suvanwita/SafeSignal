import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentSummaryResponseDto } from './dto/incident-response.dto';
import { IncidentsService } from './incidents.service';

@ApiTags('Incidents')
@ApiBearerAuth('bearer')
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List incidents owned by the current user for association and tracking',
  })
  @ApiOkResponse({ type: [IncidentSummaryResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  findAll(
    @CurrentUser('id') userId: string,
  ): Promise<IncidentSummaryResponseDto[]> {
    return this.incidentsService.findAllForUser(userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new safety incident' })
  @ApiCreatedResponse({ type: IncidentSummaryResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateIncidentDto,
  ): Promise<IncidentSummaryResponseDto> {
    return this.incidentsService.createForUser(userId, dto);
  }
}
