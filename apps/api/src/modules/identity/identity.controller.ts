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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common';
import { CreateOfficialAccountDto } from './dto/create-official-account.dto';
import {
  DeleteOfficialAccountResponseDto,
  OfficialAccountResponseDto,
} from './dto/official-account-response.dto';
import { UpdateOfficialAccountDto } from './dto/update-official-account.dto';
import { IdentityService } from './identity.service';

@ApiTags('Identity')
@ApiBearerAuth('bearer')
@Controller('identity/accounts')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Get()
  @ApiOperation({
    summary: 'List all user-declared official accounts for the current user',
  })
  @ApiOkResponse({ type: [OfficialAccountResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  findAll(
    @CurrentUser('id') userId: string,
  ): Promise<OfficialAccountResponseDto[]> {
    return this.identityService.findAllForUser(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single user-declared official account' })
  @ApiOkResponse({ type: OfficialAccountResponseDto })
  @ApiNotFoundResponse({ description: 'Official account not found' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  findOne(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OfficialAccountResponseDto> {
    return this.identityService.findOneForUser(userId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user-declared official account' })
  @ApiCreatedResponse({ type: OfficialAccountResponseDto })
  @ApiConflictResponse({
    description: 'Account already declared for this platform and username',
  })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOfficialAccountDto,
  ): Promise<OfficialAccountResponseDto> {
    return this.identityService.createForUser(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user-declared official account' })
  @ApiOkResponse({ type: OfficialAccountResponseDto })
  @ApiNotFoundResponse({ description: 'Official account not found' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  @ApiConflictResponse({
    description: 'Duplicate platform and username combination',
  })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOfficialAccountDto,
  ): Promise<OfficialAccountResponseDto> {
    return this.identityService.updateForUser(userId, id, dto);
  }

  @Patch(':id/primary')
  @ApiOperation({ summary: 'Mark a user-declared official account as primary' })
  @ApiOkResponse({ type: OfficialAccountResponseDto })
  @ApiNotFoundResponse({ description: 'Official account not found' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  setPrimary(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OfficialAccountResponseDto> {
    return this.identityService.setPrimaryForUser(userId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user-declared official account' })
  @ApiOkResponse({ type: DeleteOfficialAccountResponseDto })
  @ApiNotFoundResponse({ description: 'Official account not found' })
  @ApiForbiddenResponse({ description: 'Ownership check failed' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeleteOfficialAccountResponseDto> {
    return this.identityService.removeForUser(userId, id);
  }
}
