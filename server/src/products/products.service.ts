import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

@Injectable()
export class ProductsService {
  constructor(@InjectEntityManager() private em: EntityManager) {}

  async findAll(category?: string, search?: string, sort?: string) {
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
    switch (sort) {
      case 'time_asc':   sql += ' ORDER BY p.created_at ASC'; break;
      case 'name':       sql += ' ORDER BY p.name ASC'; break;
      case 'category':   sql += ' ORDER BY p.category ASC, p.name ASC'; break;
      case 'price_asc':  sql += ' ORDER BY latest_price ASC'; break;
      case 'price_desc': sql += ' ORDER BY latest_price DESC'; break;
      default:           sql += ' ORDER BY p.created_at DESC'; break;
    }
    return this.em.query(sql, params);
  }

  async findOne(id: number) {
    const [product] = await this.em.query('SELECT * FROM products WHERE id = ?', [id]);
    return product || null;
  }

  async getPriceHistory(productId: number, days: number = 30) {
    return this.em.query(
      `SELECT ph.price, ph.recorded_at FROM price_history ph
       INNER JOIN (
         SELECT DATE(recorded_at) as day, MAX(recorded_at) as max_time
         FROM price_history
         WHERE product_id = ? AND recorded_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         GROUP BY DATE(recorded_at)
       ) grp ON ph.recorded_at = grp.max_time
       WHERE ph.product_id = ?
       ORDER BY ph.recorded_at ASC`,
      [productId, days, productId]
    );
  }
}
