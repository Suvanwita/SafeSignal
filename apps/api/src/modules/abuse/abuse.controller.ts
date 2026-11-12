import {
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
import { AbuseService } from './abuse.service';
import {
  AbuseReportResponseDto,
  DeleteAbuseReportResponseDto,
} from './dto/abuse-report-response.dto';
import { CreateAbuseReportDto } from './dto/create-abuse-report.dto';
import { ListAbuseReportsQueryDto } from './dto/list-abuse-reports-query.dto';
import { UpdateAbuseReportDto } from './dto/update-abuse-report.dto';

@ApiTags('Abuse')
@ApiBearerAuth('bearer')
@Controller('abuse/reports')
export class AbuseController {
  constructor(private readonly abuseService: AbuseService) {}

  @Get()
  @ApiOperation({
    summary: 'List abuse reports owned by the current user with optional filters',
  })
  @ApiOkResponse({ type: [AbuseReportResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  findAll(
    @CurrentUser('id') userId: string,
    @Query() query: ListAbuseReportsQueryDto,
  ): Promise<AbuseReportResponseDto[]> {
    return this.abuseService.findAllForUser(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single abuse report by ID' })
  @ApiOkResponse({ type: AbuseReportResponseDto })
  @ApiNotFoundResponse({ description: 'Abuse report not found' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AbuseReportResponseDto> {
    return this.abuseService.findOneForUser(userId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create a new abuse report (optionally linked to an owned incident)',
  })
  @ApiCreatedResponse({ type: AbuseReportResponseDto })
  @ApiNotFoundResponse({ description: 'Referenced incident or profile not found' })
  @ApiForbiddenResponse({
    description: 'Referenced incident or profile belongs to another user',
  })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAbuseReportDto,
  ): Promise<AbuseReportResponseDto> {
    return this.abuseService.createForUser(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update an abuse report or link/unlink it from an owned incident',
  })
  @ApiOkResponse({ type: AbuseReportResponseDto })
  @ApiNotFoundResponse({ description: 'Abuse report or incident not found' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAbuseReportDto,
  ): Promise<AbuseReportResponseDto> {
    return this.abuseService.updateForUser(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an owned abuse report' })
  @ApiOkResponse({ type: DeleteAbuseReportResponseDto })
  @ApiNotFoundResponse({ description: 'Abuse report not found' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeleteAbuseReportResponseDto> {
    return this.abuseService.removeForUser(userId, id);
  }
}
