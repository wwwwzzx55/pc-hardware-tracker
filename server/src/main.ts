import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  // 托管前端静态文件，无需额外启动 http.server
  app.useStaticAssets(join(__dirname, '..', '..', 'frontend'));
  await app.listen(3000);
  console.log('Server running on http://localhost:3000');
}
bootstrap();
