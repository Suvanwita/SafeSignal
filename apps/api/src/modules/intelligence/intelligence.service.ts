import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IntelligenceService {
  constructor(private readonly prisma: PrismaService) {}
}
