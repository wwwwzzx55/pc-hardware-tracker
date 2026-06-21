import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

@Injectable()
export class StatsService {
  constructor(@InjectEntityManager() private em: EntityManager) {}

  async getOverview() {
    const categories = await this.em.query(`
      SELECT category, COUNT(*) as product_count,
        ROUND(AVG(latest.price), 2) as avg_price,
        MIN(latest.price) as min_price,
        MAX(latest.price) as max_price
      FROM products p
      JOIN (
        SELECT product_id, price
        FROM price_history ph1
        WHERE id = (SELECT MAX(id) FROM price_history ph2 WHERE ph2.product_id = ph1.product_id)
      ) latest ON p.id = latest.product_id
      GROUP BY category
    `);
    return { categories, updated_at: new Date().toISOString() };
  }
}
