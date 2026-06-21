import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from './products/products.module';
import { CrawlModule } from './crawl/crawl.module';
import { StatsModule } from './stats/stats.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: process.env.DB_PASSWORD || '908%Wang',
      database: 'pc_hardware_tracker',
      entities: [],
      synchronize: false,
    }),
    ProductsModule,
    CrawlModule,
    StatsModule,
    AiModule,
  ],
})
export class AppModule { }
