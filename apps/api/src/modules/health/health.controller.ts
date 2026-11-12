import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common';
import { HealthService, type HealthStatus } from './health.service';

@ApiTags('Health')
@SkipThrottle()
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check API and database health' })
  @ApiOkResponse({ description: 'Service and database are healthy' })
  check(): Promise<HealthStatus> {
    return this.healthService.check();
  }
}
