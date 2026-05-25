import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('api/stats')
export class StatsController {
  constructor(private readonly service: StatsService) {}

  @Get('overview')
  getOverview() {
    return this.service.getOverview();
  }
}
