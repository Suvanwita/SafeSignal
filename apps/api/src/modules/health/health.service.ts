import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface HealthStatus {
  status: 'ok';
  service: string;
  database: 'connected';
  uptimeSeconds: number;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthStatus> {
    const databaseHealthy = await this.prisma.isHealthy();

    if (!databaseHealthy) {
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database health check failed',
        details: {
          service: 'safesignal-api',
          database: 'disconnected',
        },
      });
    }

    return {
      status: 'ok',
      service: 'safesignal-api',
      database: 'connected',
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
