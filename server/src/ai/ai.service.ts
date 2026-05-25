import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { LLMProvider, OpenAIProvider } from './providers/openai.provider';

@Injectable()
export class AiService {
  private provider: LLMProvider;

  constructor(@InjectEntityManager() private em: EntityManager) {
    this.provider = new OpenAIProvider();
  }

  async chat(message: string, mode: string = 'query') {
    const context = await this.buildContext(message);
    const systemPrompt = this.getSystemPrompt(mode);

    const response = await this.provider.chat([
      { role: 'system', content: `${systemPrompt}\n\n数据库数据:\n${context}` },
      { role: 'user', content: message },
    ]);

    return { reply: response, mode };
  }

  async generateReport() {
    const overview = await this.em.query(`
      SELECT p.name, p.category, ph.price, ph.recorded_at
      FROM products p
      JOIN price_history ph ON p.id = ph.product_id
      ORDER BY ph.recorded_at DESC LIMIT 100
    `);
    const dataText = JSON.stringify(overview);

    const response = await this.provider.chat([
      { role: 'system', content: '你是硬件价格分析师。根据以下数据生成一份简洁的市场分析报告，包含：整体趋势、各品类动态、购买建议。300字以内。' },
      { role: 'user', content: dataText },
    ]);

    return { report: response };
  }

  private async buildContext(message: string): Promise<string> {
    const products = await this.em.query('SELECT id, name, category FROM products');
    const matched = products.filter((p: any) => message.includes(p.name) || message.includes(p.category));
    if (matched.length === 0) {
      const all = await this.em.query(`
        SELECT p.name, p.category, ph.price, ph.recorded_at
        FROM products p JOIN price_history ph ON p.id = ph.product_id
        ORDER BY ph.recorded_at DESC LIMIT 50
      `);
      return JSON.stringify(all);
    }
    const ids = matched.map((m: any) => m.id);
    const data = await this.em.query(`
      SELECT p.name, p.category, ph.price, ph.recorded_at FROM products p
      JOIN price_history ph ON p.id = ph.product_id
      WHERE p.id IN (${ids.join(',')}) ORDER BY ph.recorded_at DESC LIMIT 200
    `);
    return JSON.stringify(data);
  }

  private getSystemPrompt(mode: string): string {
    switch (mode) {
      case 'predict':
        return '你是硬件价格趋势分析师。根据历史价格数据，预测短期价格走势，给出"建议入手"或"建议观望"的建议及理由。';
      case 'report':
        return '你是硬件市场分析师。根据数据生成结构化的市场分析报告。';
      default:
        return '你是硬件价格查询助手。根据数据库中的数据回答用户关于硬件价格的问题。用中文回复，简洁准确。';
    }
  }
}
