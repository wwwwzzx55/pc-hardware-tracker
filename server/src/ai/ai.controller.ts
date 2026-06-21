import { Controller, Post, Get, Put, Body, Res } from '@nestjs/common';
import { AiService, AiSettings } from './ai.service';

@Controller('api/ai')
export class AiController {
  constructor(private readonly service: AiService) {}

  @Post('chat')
  chat(@Body() body: { message: string; mode?: string }) {
    return this.service.chat(body.message, body.mode || 'query');
  }

  @Post('chat/stream')
  async chatStream(@Body() body: { message: string; mode?: string }, @Res() res: any) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const mode = body.mode || 'query';
      const generator = mode === 'report'
        ? this.service.generateReportStream()
        : this.service.chatStream(body.message, mode);

      for await (const chunk of generator) {
        res.write(`event: ${chunk.type}\n`);
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
    } catch (e: any) {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ text: e?.message || '未知错误' })}\n\n`);
    }
    res.end();
  }

  @Post('report')
  report() {
    return this.service.generateReport();
  }

  @Get('settings')
  getSettings() {
    return this.service.getSettings();
  }

  @Put('settings')
  updateSettings(@Body() body: Partial<AiSettings>) {
    return this.service.updateSettings(body);
  }

  @Post('models')
  async fetchModels(@Body() body: { baseUrl?: string; apiKey?: string }) {
    const models = await this.service.fetchModels(body.baseUrl, body.apiKey);
    return { models };
  }

  @Get('prompts')
  getPrompts() {
    return { prompts: this.service.getPresetPrompts() };
  }
}
