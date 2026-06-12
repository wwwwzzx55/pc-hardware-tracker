import { Controller, Post, Get, Put, Body, Param, Delete } from '@nestjs/common';
import { AiService, AiSettings, PromptTemplate } from './ai.service';

@Controller('api/ai')
export class AiController {
  constructor(private readonly service: AiService) {}

  // ==================== Chat ====================

  @Post('chat')
  chat(@Body() body: { message: string; mode?: string }) {
    return this.service.chat(body.message, body.mode || 'query');
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
  getPrompts() {
    return { prompts: this.service.getAllPrompts() };
  }

  @Put('prompts/:id')
  updatePrompt(
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    const prompt = this.service.updatePrompt(id, body.content);
    if (!prompt) {
      return { error: '提示词未找到' };
    }
    return { prompt };
  }

  @Post('prompts/:id/reset')
  resetPrompt(@Param('id') id: string) {
    const prompt = this.service.resetPrompt(id);
    if (!prompt) {
      return { error: '提示词未找到' };
    }
    return { prompt };
  }

  @Post('prompts')
  addCustomPrompt(@Body() body: { name: string; description: string; content: string }) {
    const prompt = this.service.addCustomPrompt(
      body.name,
      body.description,
      body.content,
    );
    return { prompt };
  }

  @Delete('prompts/:id')
  deletePrompt(@Param('id') id: string) {
    const ok = this.service.deleteCustomPrompt(id);
    return { success: ok };
  }
}
