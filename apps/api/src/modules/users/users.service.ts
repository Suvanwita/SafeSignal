import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common';
import { PrismaService } from '../../prisma/prisma.service';

export const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  displayName: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface UserWithPassword extends AuthenticatedUser {
  passwordHash: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findPublicById(id: string): Promise<AuthenticatedUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });
  }

  async findForAuthByEmail(email: string): Promise<UserWithPassword | null> {
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: {
        ...USER_PUBLIC_SELECT,
        passwordHash: true,
      },
    });
  }

  async createUser(input: {
    email: string;
    passwordHash: string;
    displayName?: string;
  }): Promise<AuthenticatedUser> {
    return this.prisma.user.create({
      data: {
        email: input.email.trim().toLowerCase(),
        passwordHash: input.passwordHash,
        displayName: input.displayName ?? null,
      },
      select: USER_PUBLIC_SELECT,
    });
  }

  sanitizeUser(user: UserWithPassword): AuthenticatedUser {
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
