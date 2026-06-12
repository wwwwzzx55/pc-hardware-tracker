import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

@Injectable()
export class ProductsService {
  constructor(@InjectEntityManager() private em: EntityManager) {}

  async findAll(category?: string, search?: string) {
    // 用 MAX(id) 而非 MAX(recorded_at) 避免同一秒内多条价格记录导致重复行
    let sql = `SELECT p.*, ph.price as latest_price, ph.recorded_at as updated_at
      FROM products p
      LEFT JOIN price_history ph ON ph.id = (
        SELECT MAX(ph2.id) FROM price_history ph2 WHERE ph2.product_id = p.id
      ) WHERE 1=1`;
    const params: any[] = [];
    if (category && category !== 'ALL') {
      sql += ' AND p.category = ?';
      params.push(category);
    }
    if (search && search.trim()) {
      sql += ' AND p.name LIKE ?';
      params.push(`%${search.trim()}%`);
    }
    sql += ' ORDER BY p.created_at DESC';
    return this.em.query(sql, params);
  }

  async findOne(id: number) {
    const [product] = await this.em.query('SELECT * FROM products WHERE id = ?', [id]);
    return product || null;
  }

  async getPriceHistory(productId: number, days: number = 30) {
    return this.em.query(
      `SELECT price, recorded_at FROM price_history
       WHERE product_id = ? AND recorded_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       ORDER BY recorded_at ASC`,
      [productId, days]
    );
  }
}
