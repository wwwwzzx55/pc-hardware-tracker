import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { OpenAIProvider, StreamChunk } from './providers/openai.provider';
import * as fs from 'fs';
import * as path from 'path';

export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

// 预设提示词（硬编码，简洁明了）
const PRESET_PROMPTS: Record<string, { name: string; content: string }> = {
  query: {
    name: '查价格',
    content: '你是硬件价格查询助手。根据数据库中的数据回答用户关于硬件价格的问题。用中文回复，简洁准确。',
  },
  predict: {
    name: '预测走势',
    content: '你是硬件价格趋势分析师。根据历史价格数据，预测短期价格走势，给出"建议入手"或"建议观望"的建议及理由。分析时请考虑：1)近期价格波动幅度 2)价格所处的历史区间 3)品类季节性规律。',
  },
  report: {
    name: '生成报告',
    content: '你是硬件市场分析师。根据提供的数据生成一份结构化的市场分析报告，包含：整体市场趋势概述、各品类价格动态分析、值得关注的产品、短期购买建议。用中文撰写，专业且易懂。',
  },
  compare: {
    name: '产品对比',
    content: '你是硬件产品对比分析师。根据数据库中的产品信息，对比分析用户指定的多个硬件产品。从价格、性能口碑、价格趋势、性价比等维度进行比较，给出推荐意见。用中文回复，结构化呈现。',
  },
};

const DEFAULT_SETTINGS: AiSettings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-3.5-turbo',
  temperature: 0.7,
  maxTokens: 2048,
};

const SETTINGS_FILE = path.join(__dirname, '..', '..', 'data', 'ai-settings.json');

@Injectable()
export class AiService {
  private settings: AiSettings;
  private providerCache: { key: string; provider: OpenAIProvider } | null = null;

  constructor(@InjectEntityManager() private em: EntityManager) {
    this.settings = this.loadSettings();
  }

  // ==================== LLM Provider ====================

  private getProvider(): OpenAIProvider {
    const cacheKey = `${this.settings.baseUrl}:${this.settings.apiKey}:${this.settings.model}`;
    if (this.providerCache?.key === cacheKey) {
      return this.providerCache.provider;
    }

    const provider = new OpenAIProvider(
      this.settings.apiKey, this.settings.baseUrl,
      this.settings.model, this.settings.temperature, this.settings.maxTokens,
    );
    this.providerCache = { key: cacheKey, provider };
    return provider;
  }

  private clearProviderCache() {
    this.providerCache = null;
  }

  // ==================== Chat & Report ====================

  async chat(message: string, mode: string = 'query') {
    const context = await this.buildContext(message);
    const prompt = PRESET_PROMPTS[mode] || PRESET_PROMPTS.query;

    const response = await this.getProvider().chat([
      { role: 'system', content: `${prompt.content}\n\n数据库数据:\n${context}` },
      { role: 'user', content: message },
    ]);

    return { reply: response, mode };
  }

  async *chatStream(message: string, mode: string = 'query'): AsyncGenerator<StreamChunk> {
    const context = await this.buildContext(message);
    const prompt = PRESET_PROMPTS[mode] || PRESET_PROMPTS.query;

    yield* this.getProvider().chatStream([
      { role: 'system', content: `${prompt.content}\n\n数据库数据:\n${context}` },
      { role: 'user', content: message },
    ]);
  }

  async generateReport() {
    const overview = await this.em.query(`
      SELECT p.name, p.category, ph.price, ph.recorded_at
      FROM products p
      JOIN price_history ph ON p.id = ph.product_id
      ORDER BY ph.recorded_at DESC LIMIT 100
    `);
    const dataText = JSON.stringify(overview);
    const prompt = PRESET_PROMPTS.report;

    const response = await this.getProvider().chat([
      { role: 'system', content: prompt.content },
      { role: 'user', content: dataText },
    ]);

    return { report: response };
  }

  async *generateReportStream(): AsyncGenerator<StreamChunk> {
    const overview = await this.em.query(`
      SELECT p.name, p.category, ph.price, ph.recorded_at
      FROM products p
      JOIN price_history ph ON p.id = ph.product_id
      ORDER BY ph.recorded_at DESC LIMIT 100
    `);
    const dataText = JSON.stringify(overview);
    const prompt = PRESET_PROMPTS.report;

    yield* this.getProvider().chatStream([
      { role: 'system', content: prompt.content },
      { role: 'user', content: dataText },
    ]);
  }

  // ==================== Settings ====================

  getSettings(): AiSettings {
    return { ...this.settings };
  }

  getPresetPrompts() {
    return Object.entries(PRESET_PROMPTS).map(([id, p]) => ({ id, name: p.name }));
  }

  updateSettings(updates: Partial<AiSettings>): AiSettings {
    if (updates.apiKey !== undefined && updates.apiKey !== '') {
      this.settings.apiKey = updates.apiKey;
    }
    if (updates.baseUrl !== undefined) this.settings.baseUrl = updates.baseUrl;
    if (updates.model !== undefined) this.settings.model = updates.model;
    if (updates.temperature !== undefined) this.settings.temperature = updates.temperature;
    if (updates.maxTokens !== undefined) this.settings.maxTokens = updates.maxTokens;

    this.clearProviderCache();
    this.saveSettings();
    return this.getSettings();
  }

  // ==================== Model List ====================

  async fetchModels(baseUrl?: string, apiKey?: string): Promise<{ id: string; name: string }[]> {
    const url = baseUrl || this.settings.baseUrl;
    const key = apiKey || this.settings.apiKey;

    if (!key) throw new Error('请先设置 API Key');

    try {
      const resp = await fetch(`${url}/models`, {
        headers: { 'Authorization': `Bearer ${key}` },
      });
      const data = await resp.json() as any;
      const models = data?.data || [];
      return models
        .filter((m: any) => m.id && (m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3') || m.id.includes('o4') || m.id.includes('deepseek') || m.id.includes('qwen') || m.id.includes('glm')))
        .map((m: any) => ({ id: m.id, name: m.id }));
    } catch (e: any) {
      throw new Error(`获取模型列表失败: ${e.message}`);
    }
  }

  // ==================== Private Helpers ====================

  private async buildContext(message: string): Promise<string> {
    const products: any[] = await this.em.query('SELECT id, name, category FROM products');
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

  // ==================== File Storage ====================

  private ensureDataDir() {
    const dir = path.join(__dirname, '..', '..', 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private loadSettings(): AiSettings {
    try {
      this.ensureDataDir();
      if (fs.existsSync(SETTINGS_FILE)) {
        const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        return { ...DEFAULT_SETTINGS, ...data };
      }
    } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
  }

  private saveSettings() {
    try {
      this.ensureDataDir();
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch { /* ignore */ }
  }
}
