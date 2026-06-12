export interface LLMProvider {
  chat(messages: Array<{ role: string; content: string }>, options?: ChatOptions): Promise<string>;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(apiKey?: string, baseUrl?: string, model?: string, temperature?: number, maxTokens?: number) {
    this.apiKey = apiKey || process.env.LLM_API_KEY || '';
    this.baseUrl = baseUrl || process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
    this.model = model || process.env.LLM_MODEL || 'gpt-3.5-turbo';
    this.temperature = temperature ?? 0.7;
    this.maxTokens = maxTokens ?? 2048;
  }

  async chat(
    messages: Array<{ role: string; content: string }>,
    options?: ChatOptions,
  ): Promise<string> {
    const temperature = options?.temperature ?? this.temperature;
    const maxTokens = options?.maxTokens ?? this.maxTokens;

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });
    const data = await resp.json() as any;
    return data?.choices?.[0]?.message?.content || '(LLM 未返回内容)';
  }
}
