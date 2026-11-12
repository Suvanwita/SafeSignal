import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthService } from '../../modules/auth/auth.service';
import type { AuthenticatedUser, RequestWithContext } from '../types/api-response.type';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let authService: jest.Mocked<Pick<AuthService, 'validateAccessToken'>>;

  const mockUser: AuthenticatedUser = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'ada@safesignal.org',
    displayName: 'Ada',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function createExecutionContext(request: Partial<RequestWithContext>): ExecutionContext {
    return {
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    authService = {
      validateAccessToken: jest.fn(),
    };

    guard = new JwtAuthGuard(reflector, authService as unknown as AuthService);
  });

  it('allows access to @Public() routes without a token', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const ctx = createExecutionContext({ headers: {} });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authService.validateAccessToken).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when Authorization header is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const ctx = createExecutionContext({ headers: {} });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when Authorization scheme is not Bearer', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const ctx = createExecutionContext({
      headers: { authorization: 'Basic abc123' },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('validates token and attaches user and sessionId to request', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    authService.validateAccessToken.mockResolvedValue({
      user: mockUser,
      sessionId: 'session-123',
    });

    const req: Partial<RequestWithContext> = {
      headers: { authorization: 'Bearer valid.jwt.token' },
    };
    const ctx = createExecutionContext(req);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authService.validateAccessToken).toHaveBeenCalledWith(
      'valid.jwt.token',
    );
    expect(req.user).toEqual(mockUser);
    expect(req.sessionId).toBe('session-123');
  });
});
