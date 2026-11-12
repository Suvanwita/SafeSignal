import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import type { AuthenticatedUser, JwtAccessPayload } from '../../common';
import type { AuthConfig } from '../../config';
import { PrismaService } from '../../prisma/prisma.service';
import { USER_PUBLIC_SELECT, UsersService } from '../users/users.service';
import type { AuthResponseDto, LogoutResponseDto } from './dto/auth-response.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

export interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  private dummyHashPromise: Promise<string> | null = null;

  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(
    dto: RegisterDto,
    metadata?: SessionMetadata,
  ): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.usersService.findForAuthByEmail(normalizedEmail);

    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email already exists',
      });
    }

    const passwordHash = await this.hashPassword(dto.password);

    let user: AuthenticatedUser;
    try {
      user = await this.usersService.createUser({
        email: normalizedEmail,
        passwordHash,
        displayName: dto.displayName,
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email already exists',
        });
      }
      throw error;
    }

    return this.issueSessionToken(user, metadata);
  }

  async login(
    dto: LoginDto,
    metadata?: SessionMetadata,
  ): Promise<AuthResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.usersService.findForAuthByEmail(normalizedEmail);

    const hashToVerify = user
      ? user.passwordHash
      : await this.getDummyPasswordHash();

    const passwordMatches = await this.verifyPassword(hashToVerify, dto.password);

    if (!user || !passwordMatches || !user.isActive) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    return this.issueSessionToken(this.usersService.sanitizeUser(user), metadata);
  }

  async logout(sessionId: string): Promise<LogoutResponseDto> {
    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { loggedOut: true };
  }

  async getCurrentUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.usersService.findPublicById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'User account is unavailable',
      });
    }

    return user;
  }

  async validateAccessToken(token: string): Promise<{
    user: AuthenticatedUser;
    sessionId: string;
  }> {
    const authCfg = this.configService.getOrThrow<AuthConfig>('auth');

    let payload: JwtAccessPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtAccessPayload>(token, {
        secret: authCfg.jwtSecret,
      });
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired access token',
      });
    }

    if (!payload?.sub || !payload?.sid || !payload?.jti) {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Malformed access token payload',
      });
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: {
        user: {
          select: USER_PUBLIC_SELECT,
        },
      },
    });

    const now = Date.now();
    if (
      !session ||
      session.userId !== payload.sub ||
      session.jti !== payload.jti ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= now ||
      !session.user.isActive
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_SESSION',
        message: 'Session is invalid, expired, or revoked',
      });
    }

    return {
      user: session.user,
      sessionId: session.id,
    };
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
    });
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  private async issueSessionToken(
    user: AuthenticatedUser,
    metadata?: SessionMetadata,
  ): Promise<AuthResponseDto> {
    const authCfg = this.configService.getOrThrow<AuthConfig>('auth');
    const jti = randomUUID();
    const expiresAt = new Date(
      Date.now() + authCfg.jwtExpiresInSeconds * 1000,
    );

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        jti,
        expiresAt,
        userAgent: metadata?.userAgent ?? null,
        ipAddress: metadata?.ipAddress ?? null,
      },
    });

    const payload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      sid: session.id,
      jti,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: authCfg.jwtSecret,
      expiresIn: authCfg.jwtExpiresInSeconds,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: authCfg.jwtExpiresInSeconds,
      user,
    };
  }

  private getDummyPasswordHash(): Promise<string> {
    if (!this.dummyHashPromise) {
      this.dummyHashPromise = this.hashPassword(
        'SafeSignal-Dummy-Timing-Verification-Key-!9',
      );
    }
    return this.dummyHashPromise;
  }
}
