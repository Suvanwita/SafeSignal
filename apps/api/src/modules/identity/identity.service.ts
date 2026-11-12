import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { OfficialAccount, Platform, Prisma } from '@prisma/client';
import { assertOwnedResource } from '../../common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateOfficialAccountDto } from './dto/create-official-account.dto';
import type {
  DeleteOfficialAccountResponseDto,
  OfficialAccountResponseDto,
} from './dto/official-account-response.dto';
import type { UpdateOfficialAccountDto } from './dto/update-official-account.dto';

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(userId: string): Promise<OfficialAccountResponseDto[]> {
    const accounts = await this.prisma.officialAccount.findMany({
      where: { userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });

    return accounts.map((account) => this.toResponseDto(account));
  }

  async findOneForUser(
    userId: string,
    accountId: string,
  ): Promise<OfficialAccountResponseDto> {
    const account = await this.prisma.officialAccount.findUnique({
      where: { id: accountId },
    });

    assertOwnedResource(account, userId, 'Official account');
    return this.toResponseDto(account);
  }

  async createForUser(
    userId: string,
    dto: CreateOfficialAccountDto,
  ): Promise<OfficialAccountResponseDto> {
    const normalizedHandle = this.normalizeUsername(dto.platform, dto.username);

    await this.ensureNoDuplicateHandle(userId, dto.platform, normalizedHandle);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        if (dto.isPrimary) {
          await tx.officialAccount.updateMany({
            where: { userId, isPrimary: true },
            data: { isPrimary: false },
          });
        }

        return tx.officialAccount.create({
          data: {
            userId,
            platform: dto.platform,
            handle: normalizedHandle,
            profileUrl: dto.profileUrl ?? null,
            displayName: dto.displayName ?? null,
            notes: dto.notes ?? null,
            isPrimary: dto.isPrimary ?? false,
            verified: false,
          },
        });
      });

      return this.toResponseDto(created);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'OFFICIAL_ACCOUNT_EXISTS',
          message:
            'You have already registered this username for the selected platform',
        });
      }
      throw error;
    }
  }

  async updateForUser(
    userId: string,
    accountId: string,
    dto: UpdateOfficialAccountDto,
  ): Promise<OfficialAccountResponseDto> {
    const existing = await this.prisma.officialAccount.findUnique({
      where: { id: accountId },
    });
    assertOwnedResource(existing, userId, 'Official account');

    const nextPlatform = dto.platform ?? existing.platform;
    const nextHandle =
      dto.username !== undefined
        ? this.normalizeUsername(nextPlatform, dto.username)
        : existing.handle;

    if (
      nextPlatform !== existing.platform ||
      nextHandle.toLowerCase() !== existing.handle.toLowerCase()
    ) {
      await this.ensureNoDuplicateHandle(
        userId,
        nextPlatform,
        nextHandle,
        accountId,
      );
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (dto.isPrimary === true) {
          await tx.officialAccount.updateMany({
            where: { userId, isPrimary: true, NOT: { id: accountId } },
            data: { isPrimary: false },
          });
        }

        return tx.officialAccount.update({
          where: { id: accountId },
          data: {
            ...(dto.platform !== undefined ? { platform: dto.platform } : {}),
            ...(dto.username !== undefined ? { handle: nextHandle } : {}),
            ...(dto.profileUrl !== undefined
              ? { profileUrl: dto.profileUrl }
              : {}),
            ...(dto.displayName !== undefined
              ? { displayName: dto.displayName }
              : {}),
            ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
            ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
          },
        });
      });

      return this.toResponseDto(updated);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'OFFICIAL_ACCOUNT_EXISTS',
          message:
            'You have already registered this username for the selected platform',
        });
      }
      throw error;
    }
  }

  async setPrimaryForUser(
    userId: string,
    accountId: string,
  ): Promise<OfficialAccountResponseDto> {
    const existing = await this.prisma.officialAccount.findUnique({
      where: { id: accountId },
    });
    assertOwnedResource(existing, userId, 'Official account');

    if (existing.isPrimary) {
      return this.toResponseDto(existing);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.officialAccount.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });

      return tx.officialAccount.update({
        where: { id: accountId },
        data: { isPrimary: true },
      });
    });

    return this.toResponseDto(updated);
  }

  async removeForUser(
    userId: string,
    accountId: string,
  ): Promise<DeleteOfficialAccountResponseDto> {
    const existing = await this.prisma.officialAccount.findUnique({
      where: { id: accountId },
    });
    assertOwnedResource(existing, userId, 'Official account');

    await this.prisma.officialAccount.delete({
      where: { id: accountId },
    });

    return {
      deleted: true,
      id: accountId,
    };
  }

  private normalizeUsername(platform: Platform, raw: string): string {
    const trimmed = raw.trim();
    const normalized =
      platform === Platform.EMAIL || platform === Platform.WEBSITE
        ? trimmed
        : trimmed.replace(/^@+/, '');

    if (normalized.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Username cannot be empty',
      });
    }

    return normalized;
  }

  private async ensureNoDuplicateHandle(
    userId: string,
    platform: Platform,
    handle: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.officialAccount.findFirst({
      where: {
        userId,
        platform,
        handle: {
          equals: handle,
          mode: 'insensitive',
        },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException({
        code: 'OFFICIAL_ACCOUNT_EXISTS',
        message:
          'You have already registered this username for the selected platform',
      });
    }
  }

  private toResponseDto(account: OfficialAccount): OfficialAccountResponseDto {
    return {
      id: account.id,
      userId: account.userId,
      platform: account.platform,
      username: account.handle,
      profileUrl: account.profileUrl,
      displayName: account.displayName,
      isPrimary: account.isPrimary,
      declarationStatus: 'USER_DECLARED',
      notes: account.notes,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}
