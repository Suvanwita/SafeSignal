import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common';
import { DashboardService } from './dashboard.service';
import { DashboardOverviewDto } from './dto/dashboard-overview.dto';

@ApiTags('Dashboard')
@ApiBearerAuth('bearer')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Get authenticated user dashboard statistics, recent activity, and recommendations',
  })
  @ApiOkResponse({ type: DashboardOverviewDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  getOverview(@CurrentUser('id') userId: string): Promise<DashboardOverviewDto> {
    return this.dashboardService.getOverview(userId);
  }
}
