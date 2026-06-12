import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { LLMProvider, OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import * as fs from 'fs';
import * as path from 'path';

export interface AiSettings {
  provider: 'openai' | 'anthropic';
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  isPreset: boolean;
}

const DEFAULT_SETTINGS: AiSettings = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-3.5-turbo',
  temperature: 0.7,
  maxTokens: 2048,
};

const PRESET_PROMPTS: PromptTemplate[] = [
  {
    id: 'query',
    name: '价格查询助手',
    description: '根据数据库数据回答硬件价格问题',
    isPreset: true,
    content: '你是硬件价格查询助手。根据数据库中的数据回答用户关于硬件价格的问题。用中文回复，简洁准确。',
  },
  {
    id: 'predict',
    name: '趋势预测分析师',
    description: '根据历史价格数据预测短期走势',
    isPreset: true,
    content: '你是硬件价格趋势分析师。根据历史价格数据，预测短期价格走势，给出"建议入手"或"建议观望"的建议及理由。分析时请考虑：1)近期价格波动幅度 2)价格所处的历史区间 3)品类季节性规律。',
  },
  {
    id: 'report',
    name: '市场分析报告',
    description: '生成结构化的市场分析报告',
    isPreset: true,
    content: '你是硬件市场分析师。根据提供的数据生成一份结构化的市场分析报告，包含：整体市场趋势概述、各品类价格动态分析、值得关注的产品、短期购买建议。用中文撰写，专业且易懂。',
  },
  {
    id: 'compare',
    name: '产品对比分析',
    description: '对比多个硬件产品的性价比',
    isPreset: true,
    content: '你是硬件产品对比分析师。根据数据库中的产品信息，对比分析用户指定的多个硬件产品。从价格、性能口碑、价格趋势、性价比等维度进行比较，给出推荐意见。用中文回复，结构化呈现。',
  },
];

const SETTINGS_FILE = path.join(__dirname, '..', '..', 'data', 'ai-settings.json');
const PROMPTS_FILE = path.join(__dirname, '..', '..', 'data', 'ai-prompts.json');

@Injectable()
export class AiService {
  private settings: AiSettings;
  private customPrompts: PromptTemplate[] = [];
  private providerCache: { key: string; provider: LLMProvider } | null = null;

  constructor(@InjectEntityManager() private em: EntityManager) {
    this.settings = this.loadSettings();
    this.customPrompts = this.loadPrompts();
  }

  // ==================== LLM Provider ====================

  private getProvider(): LLMProvider {
    const cacheKey = `${this.settings.provider}:${this.settings.baseUrl}:${this.settings.apiKey}:${this.settings.model}`;
    if (this.providerCache?.key === cacheKey) {
      return this.providerCache.provider;
    }

    let provider: LLMProvider;
    if (this.settings.provider === 'anthropic') {
      provider = new AnthropicProvider(
        this.settings.apiKey,
        this.settings.baseUrl,
        this.settings.model,
        this.settings.temperature,
        this.settings.maxTokens,
      );
    } else {
      provider = new OpenAIProvider(
        this.settings.apiKey,
        this.settings.baseUrl,
        this.settings.model,
        this.settings.temperature,
        this.settings.maxTokens,
      );
    }
    this.providerCache = { key: cacheKey, provider };
    return provider;
  }

  private clearProviderCache() {
    this.providerCache = null;
  }

  // ==================== Chat & Report ====================

  async chat(message: string, mode: string = 'query') {
    const context = await this.buildContext(message);
    const prompt = this.getPromptByMode(mode);
    const systemPrompt = prompt?.content || this.getDefaultPrompt(mode);

    const response = await this.getProvider().chat([
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

    const prompt = this.getPromptByMode('report');
    const systemPrompt = prompt?.content || '你是硬件价格分析师。根据以下数据生成一份简洁的市场分析报告，包含：整体趋势、各品类动态、购买建议。';

    const response = await this.getProvider().chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: dataText },
    ]);

    return { report: response };
  }

  // ==================== Settings ====================

  getSettings(): AiSettings {
    return { ...this.settings, apiKey: this.maskApiKey(this.settings.apiKey) };
  }

  updateSettings(updates: Partial<AiSettings>): AiSettings {
    if (updates.apiKey !== undefined && updates.apiKey !== '') {
      // Only update apiKey if it's not a masked value
      if (!updates.apiKey.startsWith('***')) {
        this.settings.apiKey = updates.apiKey;
      }
    }
    if (updates.provider !== undefined) this.settings.provider = updates.provider;
    if (updates.baseUrl !== undefined) this.settings.baseUrl = updates.baseUrl;
    if (updates.model !== undefined) this.settings.model = updates.model;
    if (updates.temperature !== undefined) this.settings.temperature = updates.temperature;
    if (updates.maxTokens !== undefined) this.settings.maxTokens = updates.maxTokens;

    this.clearProviderCache();
    this.saveSettings();
    return this.getSettings();
  }

  // ==================== Model List ====================

  async fetchModels(provider?: string, baseUrl?: string, apiKey?: string): Promise<{ id: string; name: string }[]> {
    const p = provider || this.settings.provider;
    const url = baseUrl || this.settings.baseUrl;
    const key = apiKey || this.settings.apiKey;

    if (!key) {
      throw new Error('请先设置 API Key');
    }

    try {
      if (p === 'anthropic') {
        return await this.fetchAnthropicModels(url, key);
      } else {
        return await this.fetchOpenAIModels(url, key);
      }
    } catch (e: any) {
      throw new Error(`获取模型列表失败: ${e.message}`);
    }
  }

  private async fetchOpenAIModels(baseUrl: string, apiKey: string): Promise<{ id: string; name: string }[]> {
    const resp = await fetch(`${baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const data = await resp.json() as any;
    const models = data?.data || [];
    return models
      .filter((m: any) => m.id && (m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3') || m.id.includes('o4') || m.id.includes('deepseek') || m.id.includes('qwen') || m.id.includes('glm')))
      .map((m: any) => ({ id: m.id, name: m.id }));
  }

  private async fetchAnthropicModels(baseUrl: string, apiKey: string): Promise<{ id: string; name: string }[]> {
    // Anthropic doesn't have a public /models endpoint for all use cases
    // Return commonly available Claude models
    const knownModels = [
      'claude-opus-4-8',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
      'claude-fable-5',
    ];

    // Try to fetch from API if available
    try {
      const resp = await fetch(`${baseUrl}/v1/models`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        if (data?.data && Array.isArray(data.data)) {
          return data.data.map((m: any) => ({ id: m.id, name: m.display_name || m.id }));
        }
      }
    } catch {
      // Fall back to known models
    }

    return knownModels.map(id => ({ id, name: id }));
  }

  // ==================== Prompts ====================

  getAllPrompts(): PromptTemplate[] {
    return [...PRESET_PROMPTS, ...this.customPrompts];
  }

  getPromptByMode(mode: string): PromptTemplate | undefined {
    const all = this.getAllPrompts();
    return all.find(p => p.id === mode);
  }

  updatePrompt(id: string, content: string): PromptTemplate | null {
    // Check if it's a preset
    const preset = PRESET_PROMPTS.find(p => p.id === id);
    if (preset) {
      // Create custom override
      const existing = this.customPrompts.findIndex(p => p.id === id);
      if (existing >= 0) {
        this.customPrompts[existing].content = content;
      } else {
        this.customPrompts.push({
          ...preset,
          isPreset: false,
          content,
        });
      }
    } else {
      const custom = this.customPrompts.find(p => p.id === id);
      if (custom) {
        custom.content = content;
      } else {
        return null;
      }
    }
    this.savePrompts();
    return this.getAllPrompts().find(p => p.id === id) || null;
  }

  resetPrompt(id: string): PromptTemplate | null {
    this.customPrompts = this.customPrompts.filter(p => p.id !== id);
    this.savePrompts();
    return this.getAllPrompts().find(p => p.id === id) || null;
  }

  addCustomPrompt(name: string, description: string, content: string): PromptTemplate {
    const id = 'custom_' + Date.now();
    const prompt: PromptTemplate = {
      id,
      name,
      description,
      content,
      isPreset: false,
    };
    this.customPrompts.push(prompt);
    this.savePrompts();
    return prompt;
  }

  deleteCustomPrompt(id: string): boolean {
    const initial = this.customPrompts.length;
    this.customPrompts = this.customPrompts.filter(p => p.id !== id);
    this.savePrompts();
    return this.customPrompts.length < initial;
  }

  // ==================== Private Helpers ====================

  private buildContext(message: string): Promise<string> {
    return this.buildContextAsync(message);
  }

  private async buildContextAsync(message: string): Promise<string> {
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

  private getDefaultPrompt(mode: string): string {
    switch (mode) {
      case 'predict':
        return '你是硬件价格趋势分析师。根据历史价格数据，预测短期价格走势，给出"建议入手"或"建议观望"的建议及理由。';
      case 'report':
        return '你是硬件市场分析师。根据数据生成结构化的市场分析报告。';
      default:
        return '你是硬件价格查询助手。根据数据库中的数据回答用户关于硬件价格的问题。用中文回复，简洁准确。';
    }
  }

  private maskApiKey(key: string): string {
    if (!key || key.length < 8) return key;
    return key.slice(0, 4) + '***' + key.slice(-4);
  }

  // ==================== File Storage ====================

  private ensureDataDir() {
    const dir = path.join(__dirname, '..', '..', 'data');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
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

  private loadPrompts(): PromptTemplate[] {
    try {
      this.ensureDataDir();
      if (fs.existsSync(PROMPTS_FILE)) {
        return JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf-8'));
      }
    } catch { /* ignore */ }
    return [];
  }

  private savePrompts() {
    try {
      this.ensureDataDir();
      fs.writeFileSync(PROMPTS_FILE, JSON.stringify(this.customPrompts, null, 2), 'utf-8');
    } catch { /* ignore */ }
  }
}
