import { Controller, Post, Get, Put, Body, Param, Delete, Res } from '@nestjs/common';
import { AiService, AiSettings, PromptTemplate } from './ai.service';

@Controller('api/ai')
export class AiController {
  constructor(private readonly service: AiService) {}

  // ==================== Chat ====================

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

  // ==================== Settings ====================

  @Get('settings')
  getSettings() {
    return this.service.getSettings();
  }

  @Put('settings')
  updateSettings(@Body() body: Partial<AiSettings>) {
    return this.service.updateSettings(body);
  }

  // ==================== Models ====================

  @Post('models')
  async fetchModels(@Body() body: { provider?: string; baseUrl?: string; apiKey?: string }) {
    const models = await this.service.fetchModels(
      body.provider,
      body.baseUrl,
      body.apiKey,
    );
    return { models };
  }

  // ==================== Prompts ====================

  @Get('prompts')
  async getPrompts() {
    const prompts = await this.service.getAllPrompts();
    return { prompts };
  }

  @Put('prompts/:id')
  async updatePrompt(
    @Param('id') id: string,
    @Body() body: { content: string; name?: string; description?: string },
  ) {
    const prompt = await this.service.updatePrompt(id, body.content, body.name, body.description);
    if (!prompt) {
      return { error: '提示词未找到' };
    }
    return { prompt };
  }

  @Post('prompts/:id/reset')
  async resetPrompt(@Param('id') id: string) {
    const prompt = await this.service.resetPrompt(id);
    if (!prompt) {
      return { error: '提示词未找到' };
    }
    return { prompt };
  }

  @Post('prompts')
  async addCustomPrompt(@Body() body: { name: string; description: string; content: string }) {
    const prompt = await this.service.addCustomPrompt(
      body.name,
      body.description,
      body.content,
    );
    return { prompt };
  }

  @Delete('prompts/:id')
  async deletePrompt(@Param('id') id: string) {
    const ok = await this.service.deleteCustomPrompt(id);
    return { success: ok };
  }
}
