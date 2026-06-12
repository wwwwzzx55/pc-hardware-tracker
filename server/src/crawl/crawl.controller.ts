import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { CrawlService } from './crawl.service';

@Controller('api/crawl')
export class CrawlController {
  constructor(private readonly service: CrawlService) {}

  @Post()
  async startCrawl(@Body() body: { keyword: string; category: string; count?: number }) {
    if (!body.keyword?.trim()) {
      return { error: '请输入硬件关键词' };
    }
    const count = Math.max(10, Math.min(body.count || 20, 30));
    const { taskId } = await this.service.startCrawl(body.keyword.trim(), body.category, count);
    return { taskId, status: 'running' };
  }

  @Get('status/:taskId')
  getStatus(@Param('taskId') taskId: string) {
    return this.service.getTaskStatus(taskId);
  }

  @Post('confirm')
  async confirmSave(@Body() body: { category: string; products: Array<{ name: string; price: number; url?: string; img_url?: string }> }) {
    if (!body.products || body.products.length === 0) {
      return { success: false, error: '请选择至少一个产品' };
    }
    return this.service.confirmSave(body.category, body.products);
  }
}
