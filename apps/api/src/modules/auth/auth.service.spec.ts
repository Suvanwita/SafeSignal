import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../prisma/prisma.service';
import type { UsersService, UserWithPassword } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      'findForAuthByEmail' | 'findPublicById' | 'createUser' | 'sanitizeUser'
    >
  >;
  let prisma: {
    session: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;
  let configService: jest.Mocked<Pick<ConfigService, 'getOrThrow'>>;

  const baseUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'ada@safesignal.org',
    displayName: 'Ada Lovelace',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    usersService = {
      findForAuthByEmail: jest.fn(),
      findPublicById: jest.fn(),
      createUser: jest.fn(),
      sanitizeUser: jest.fn((u: UserWithPassword) => {
        const { passwordHash: _ignored, ...safe } = u;
        return safe;
      }),
    };

    prisma = {
      session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
      verifyAsync: jest.fn(),
    };

    configService = {
      getOrThrow: jest.fn().mockReturnValue({
        jwtSecret: 'test-jwt-secret-with-at-least-32-bytes',
        jwtExpiresIn: '15m',
        jwtExpiresInSeconds: 900,
      }),
    };

    authService = new AuthService(
      usersService as unknown as UsersService,
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  describe('register', () => {
    it('hashes password with Argon2id, creates user and session, and returns token without passwordHash', async () => {
      usersService.findForAuthByEmail.mockResolvedValue(null);
      usersService.createUser.mockResolvedValue(baseUser);
      prisma.session.create.mockResolvedValue({
        id: '22222222-2222-2222-2222-222222222222',
      });

      const result = await authService.register({
        email: 'Ada@SafeSignal.org ',
        password: 'StrongPass123!',
        displayName: 'Ada Lovelace',
      });

      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ada@safesignal.org',
          displayName: 'Ada Lovelace',
        }),
      );
      const createdArgs = usersService.createUser.mock.calls[0]?.[0];
      expect(createdArgs?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(result).toEqual({
        accessToken: 'signed.jwt.token',
        tokenType: 'Bearer',
        expiresIn: 900,
        user: baseUser,
      });
      expect((result.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('throws ConflictException when email already exists', async () => {
      usersService.findForAuthByEmail.mockResolvedValue({
        ...baseUser,
        passwordHash: '$argon2id$hash',
      });

      await expect(
        authService.register({
          email: 'ada@safesignal.org',
          password: 'StrongPass123!',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('authenticates valid credentials and issues a session token', async () => {
      const passwordHash = await authService.hashPassword('StrongPass123!');
      usersService.findForAuthByEmail.mockResolvedValue({
        ...baseUser,
        passwordHash,
      });
      prisma.session.create.mockResolvedValue({
        id: '22222222-2222-2222-2222-222222222222',
      });

      const result = await authService.login({
        email: 'ADA@SAFESIGNAL.ORG',
        password: 'StrongPass123!',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).toEqual(baseUser);
      expect((result.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('throws UnauthorizedException for unknown email or invalid password with identical message', async () => {
      usersService.findForAuthByEmail.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'missing@safesignal.org',
          password: 'WrongPassword1!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      const passwordHash = await authService.hashPassword('StrongPass123!');
      usersService.findForAuthByEmail.mockResolvedValue({
        ...baseUser,
        passwordHash,
      });

      await expect(
        authService.login({
          email: 'ada@safesignal.org',
          password: 'WrongPassword1!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when account is inactive', async () => {
      const passwordHash = await authService.hashPassword('StrongPass123!');
      usersService.findForAuthByEmail.mockResolvedValue({
        ...baseUser,
        isActive: false,
        passwordHash,
      });

      await expect(
        authService.login({
          email: 'ada@safesignal.org',
          password: 'StrongPass123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the active session', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 1 });

      const result = await authService.logout('session-1');

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(result).toEqual({ loggedOut: true });
    });
  });

  describe('validateAccessToken', () => {
    it('rejects revoked sessions', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: baseUser.id,
        email: baseUser.email,
        sid: 'session-1',
        jti: 'jti-1',
      });
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: baseUser.id,
        jti: 'jti-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: baseUser,
      });

      await expect(
        authService.validateAccessToken('token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
