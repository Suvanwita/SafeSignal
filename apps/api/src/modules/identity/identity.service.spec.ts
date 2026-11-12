import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OfficialAccount, Platform } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { IdentityService } from './identity.service';

describe('IdentityService', () => {
  let service: IdentityService;
  let prisma: {
    officialAccount: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const userId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const accountId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  const baseAccount: OfficialAccount = {
    id: accountId,
    userId,
    platform: Platform.X,
    handle: 'safesignal_hq',
    displayName: 'SafeSignal Official',
    profileUrl: 'https://x.com/safesignal_hq',
    verified: false,
    isPrimary: true,
    notes: 'Main channel',
    createdAt: new Date('2026-06-01T10:00:00Z'),
    updatedAt: new Date('2026-06-01T10:00:00Z'),
  };

  beforeEach(() => {
    const tx = {
      officialAccount: {
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    prisma = {
      officialAccount: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        updateMany: tx.officialAccount.updateMany,
        create: tx.officialAccount.create,
        update: tx.officialAccount.update,
        delete: jest.fn(),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    service = new IdentityService(prisma as unknown as PrismaService);
  });

  describe('findAllForUser', () => {
    it('lists owned accounts with USER_DECLARED status', async () => {
      prisma.officialAccount.findMany.mockResolvedValue([baseAccount]);

      const result = await service.findAllForUser(userId);

      expect(prisma.officialAccount.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
      });
      expect(result).toEqual([
        {
          id: baseAccount.id,
          userId: baseAccount.userId,
          platform: Platform.X,
          username: 'safesignal_hq',
          profileUrl: 'https://x.com/safesignal_hq',
          displayName: 'SafeSignal Official',
          isPrimary: true,
          declarationStatus: 'USER_DECLARED',
          notes: 'Main channel',
          createdAt: baseAccount.createdAt,
          updatedAt: baseAccount.updatedAt,
        },
      ]);
    });
  });

  describe('findOneForUser', () => {
    it('returns an owned account', async () => {
      prisma.officialAccount.findUnique.mockResolvedValue(baseAccount);

      const result = await service.findOneForUser(userId, accountId);

      expect(result.id).toBe(accountId);
      expect(result.declarationStatus).toBe('USER_DECLARED');
    });

    it('throws NotFoundException when account does not exist', async () => {
      prisma.officialAccount.findUnique.mockResolvedValue(null);

      await expect(service.findOneForUser(userId, accountId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when account belongs to another user', async () => {
      prisma.officialAccount.findUnique.mockResolvedValue({
        ...baseAccount,
        userId: otherUserId,
      });

      await expect(service.findOneForUser(userId, accountId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('createForUser', () => {
    it('normalizes leading @ for social handles, clears prior primary, and forces verified=false', async () => {
      prisma.officialAccount.findFirst.mockResolvedValue(null);
      prisma.officialAccount.create.mockResolvedValue(baseAccount);

      const result = await service.createForUser(userId, {
        platform: Platform.X,
        username: '@safesignal_hq',
        profileUrl: 'https://x.com/safesignal_hq',
        displayName: 'SafeSignal Official',
        notes: 'Main channel',
        isPrimary: true,
      });

      expect(prisma.officialAccount.updateMany).toHaveBeenCalledWith({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
      expect(prisma.officialAccount.create).toHaveBeenCalledWith({
        data: {
          userId,
          platform: Platform.X,
          handle: 'safesignal_hq',
          profileUrl: 'https://x.com/safesignal_hq',
          displayName: 'SafeSignal Official',
          notes: 'Main channel',
          isPrimary: true,
          verified: false,
        },
      });
      expect(result.declarationStatus).toBe('USER_DECLARED');
      expect(result.username).toBe('safesignal_hq');
    });

    it('rejects duplicate platform/handle for the same user', async () => {
      prisma.officialAccount.findFirst.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.createForUser(userId, {
          platform: Platform.X,
          username: 'safesignal_hq',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects usernames that become empty after stripping @', async () => {
      await expect(
        service.createForUser(userId, {
          platform: Platform.INSTAGRAM,
          username: '@@@',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateForUser', () => {
    it('updates fields and unsets previous primary when promoting to primary', async () => {
      prisma.officialAccount.findUnique.mockResolvedValue({
        ...baseAccount,
        isPrimary: false,
      });
      prisma.officialAccount.findFirst.mockResolvedValue(null);
      prisma.officialAccount.update.mockResolvedValue({
        ...baseAccount,
        displayName: 'SafeSignal News',
        isPrimary: true,
      });

      const result = await service.updateForUser(userId, accountId, {
        displayName: 'SafeSignal News',
        isPrimary: true,
      });

      expect(prisma.officialAccount.updateMany).toHaveBeenCalledWith({
        where: { userId, isPrimary: true, NOT: { id: accountId } },
        data: { isPrimary: false },
      });
      expect(result.displayName).toBe('SafeSignal News');
      expect(result.isPrimary).toBe(true);
    });

    it('enforces ownership before updating', async () => {
      prisma.officialAccount.findUnique.mockResolvedValue({
        ...baseAccount,
        userId: otherUserId,
      });

      await expect(
        service.updateForUser(userId, accountId, { displayName: 'Tamper' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.officialAccount.update).not.toHaveBeenCalled();
    });
  });

  describe('setPrimaryForUser', () => {
    it('switches primary account inside a transaction', async () => {
      prisma.officialAccount.findUnique.mockResolvedValue({
        ...baseAccount,
        isPrimary: false,
      });
      prisma.officialAccount.update.mockResolvedValue({
        ...baseAccount,
        isPrimary: true,
      });

      const result = await service.setPrimaryForUser(userId, accountId);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.officialAccount.updateMany).toHaveBeenCalledWith({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
      expect(prisma.officialAccount.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: { isPrimary: true },
      });
      expect(result.isPrimary).toBe(true);
    });

    it('is a no-op when the account is already primary', async () => {
      prisma.officialAccount.findUnique.mockResolvedValue(baseAccount);

      const result = await service.setPrimaryForUser(userId, accountId);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result.isPrimary).toBe(true);
    });
  });

  describe('removeForUser', () => {
    it('deletes an owned account', async () => {
      prisma.officialAccount.findUnique.mockResolvedValue(baseAccount);
      prisma.officialAccount.delete.mockResolvedValue(baseAccount);

      const result = await service.removeForUser(userId, accountId);

      expect(prisma.officialAccount.delete).toHaveBeenCalledWith({
        where: { id: accountId },
      });
      expect(result).toEqual({ deleted: true, id: accountId });
    });

    it('throws ForbiddenException when deleting another user account', async () => {
      prisma.officialAccount.findUnique.mockResolvedValue({
        ...baseAccount,
        userId: otherUserId,
      });

      await expect(service.removeForUser(userId, accountId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.officialAccount.delete).not.toHaveBeenCalled();
    });
  });
});
