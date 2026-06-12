import { LLMProvider, ChatOptions } from './openai.provider';

export class AnthropicProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(apiKey?: string, baseUrl?: string, model?: string, temperature?: number, maxTokens?: number) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.baseUrl = baseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    this.model = model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
    this.temperature = temperature ?? 0.7;
    this.maxTokens = maxTokens ?? 4096;
  }

  async chat(
    messages: Array<{ role: string; content: string }>,
    options?: ChatOptions,
  ): Promise<string> {
    const temperature = options?.temperature ?? this.temperature;
    const maxTokens = options?.maxTokens ?? this.maxTokens;

    // Extract system message if present
    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    const body: any = {
      model: this.model,
      max_tokens: maxTokens,
      temperature,
      messages: chatMessages,
    };

    if (systemMsg) {
      body.system = systemMsg.content;
    }

    const resp = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json() as any;

    // Anthropic returns content as an array of blocks
    if (data?.content && Array.isArray(data.content)) {
      return data.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n');
    }

    return data?.content?.[0]?.text || '(Anthropic 未返回内容)';
  }
}
