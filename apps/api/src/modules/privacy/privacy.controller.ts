import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RedactSensitiveTextResponseDto } from './dto/redact-text-response.dto';
import { RedactSensitiveTextDto } from './dto/redact-text.dto';
import { ScanSensitiveTextResponseDto } from './dto/scan-text-response.dto';
import { ScanSensitiveTextDto } from './dto/scan-text.dto';
import { PrivacyService } from './privacy.service';

@ApiTags('Privacy')
@ApiBearerAuth('bearer')
@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Post('scan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Scan text for sensitive information (emails, Indian phones, international phones, addresses)',
    description:
      'Inspects input text using deterministic regex rules and address heuristics. Content is analyzed purely in-memory and is never stored in DB tables or sent to third-party APIs.',
  })
  @ApiOkResponse({
    type: ScanSensitiveTextResponseDto,
    description: 'Sensitive data detection results with positions, categories, and confidence',
  })
  @ApiBadRequestResponse({
    description: 'Invalid input or text exceeds maximum character limit (50,000)',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  scan(
    @Body() dto: ScanSensitiveTextDto,
  ): Promise<ScanSensitiveTextResponseDto> {
    return this.privacyService.scanText(dto);
  }

  @Post('redact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Redact sensitive personal information using configurable masking strategies',
    description:
      'Replaces sensitive entities with labels ([REDACTED_EMAIL]), partial masks, asterisks, hashes, or custom placeholders. Content is analyzed purely in-memory without persistence.',
  })
  @ApiOkResponse({
    type: RedactSensitiveTextResponseDto,
    description: 'Redacted text and list of applied redaction operations',
  })
  @ApiBadRequestResponse({
    description: 'Invalid input or text exceeds maximum character limit (50,000)',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  redact(
    @Body() dto: RedactSensitiveTextDto,
  ): Promise<RedactSensitiveTextResponseDto> {
    return this.privacyService.redactText(dto);
  }
}
