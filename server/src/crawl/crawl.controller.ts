import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { CrawlService } from './crawl.service';

@Controller('api/crawl')
export class CrawlController {
  constructor(private readonly service: CrawlService) {}

  @Post()
  async startCrawl(@Body() body: { keyword: string; category: string; count?: number }) {
    const { taskId } = await this.service.startCrawl(body.keyword, body.category, body.count || 10);
    return { taskId, status: 'running' };
  }

  @Get('status/:taskId')
  getStatus(@Param('taskId') taskId: string) {
    return this.service.getTaskStatus(taskId);
  }
}
