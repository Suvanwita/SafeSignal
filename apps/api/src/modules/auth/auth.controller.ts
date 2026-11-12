import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type AuthenticatedUser,
  CurrentSessionId,
  CurrentUser,
  Public,
  type RequestWithContext,
} from '../../common';
import { AuthService } from './auth.service';
import {
  AuthResponseDto,
  LogoutResponseDto,
  UserResponseDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email is already registered' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  register(
    @Body() dto: RegisterDto,
    @Req() req: RequestWithContext,
  ): Promise<AuthResponseDto> {
    return this.authService.register(dto, {
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
    });
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  login(
    @Body() dto: LoginDto,
    @Req() req: RequestWithContext,
  ): Promise<AuthResponseDto> {
    return this.authService.login(dto, {
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
    });
  }

  @Post('logout')
  @ApiBearerAuth('bearer')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current authentication session' })
  @ApiOkResponse({ type: LogoutResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  logout(
    @CurrentSessionId() sessionId: string,
  ): Promise<LogoutResponseDto> {
    return this.authService.logout(sessionId);
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get the currently authenticated user' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  getCurrentUser(
    @CurrentUser('id') userId: string,
  ): Promise<AuthenticatedUser> {
    return this.authService.getCurrentUser(userId);
  }
}
