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
import { CreateSuspiciousProfileDto } from './dto/create-suspicious-profile.dto';
import {
  DeleteSuspiciousProfileResponseDto,
  SuspiciousProfileDetailResponseDto,
  SuspiciousProfileResponseDto,
} from './dto/suspicious-profile-response.dto';
import { UpdateSuspiciousProfileStatusDto } from './dto/update-suspicious-profile-status.dto';
import { IntelligenceService } from './intelligence.service';

@ApiTags('Intelligence')
@ApiBearerAuth('bearer')
@Controller('intelligence/suspicious-profiles')
export class IntelligenceController {
  constructor(private readonly intelligenceService: IntelligenceService) {}

  @Get()
  @ApiOperation({
    summary:
      'List all reported suspicious profiles with latest similarity analysis indicators',
  })
  @ApiOkResponse({ type: [SuspiciousProfileResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  findAll(
    @CurrentUser('id') userId: string,
  ): Promise<SuspiciousProfileResponseDto[]> {
    return this.intelligenceService.findAllForUser(userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a suspicious profile and its stored similarity analyses',
  })
  @ApiOkResponse({ type: SuspiciousProfileDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Suspicious profile not found' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SuspiciousProfileDetailResponseDto> {
    return this.intelligenceService.findOneForUser(userId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Submit a suspicious profile and run heuristic similarity analysis against official accounts',
  })
  @ApiCreatedResponse({ type: SuspiciousProfileResponseDto })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSuspiciousProfileDto,
  ): Promise<SuspiciousProfileResponseDto> {
    return this.intelligenceService.createAndAnalyzeForUser(userId, dto);
  }

  @Post(':id/analyze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Re-run heuristic similarity analysis for a suspicious profile against current official accounts',
  })
  @ApiOkResponse({ type: SuspiciousProfileResponseDto })
  @ApiNotFoundResponse({ description: 'Suspicious profile not found' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  reanalyze(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SuspiciousProfileResponseDto> {
    return this.intelligenceService.reanalyzeForUser(userId, id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Manually update the review status and notes of a suspicious profile',
  })
  @ApiOkResponse({ type: SuspiciousProfileResponseDto })
  @ApiNotFoundResponse({ description: 'Suspicious profile not found' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  updateStatus(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSuspiciousProfileStatusDto,
  ): Promise<SuspiciousProfileResponseDto> {
    return this.intelligenceService.updateReviewStatusForUser(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a suspicious profile report' })
  @ApiOkResponse({ type: DeleteSuspiciousProfileResponseDto })
  @ApiNotFoundResponse({ description: 'Suspicious profile not found' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeleteSuspiciousProfileResponseDto> {
    return this.intelligenceService.removeForUser(userId, id);
  }
}
