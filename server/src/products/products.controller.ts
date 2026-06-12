import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('api/products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  findAll(@Query('category') category?: string, @Query('search') search?: string, @Query('sort') sort?: string) {
    return this.service.findAll(category, search, sort);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return null;
    return this.service.findOne(numId);
  }

  @Get(':id/price-history')
  getPriceHistory(@Param('id') id: string, @Query('days') days?: string) {
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return [];
    return this.service.getPriceHistory(numId, days ? parseInt(days, 10) : 30);
  }
}
