import { Controller, Post, Body } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('api/ai')
export class AiController {
  constructor(private readonly service: AiService) {}

  @Post('chat')
  chat(@Body() body: { message: string; mode?: string }) {
    return this.service.chat(body.message, body.mode || 'query');
  }

  @Post('report')
  report() {
    return this.service.generateReport();
  }
}
