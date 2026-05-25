export interface LLMProvider {
  chat(messages: Array<{ role: string; content: string }>): Promise<string>;
}

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey?: string, baseUrl?: string, model?: string) {
    this.apiKey = apiKey || process.env.LLM_API_KEY || '';
    this.baseUrl = baseUrl || process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
    this.model = model || process.env.LLM_MODEL || 'gpt-3.5-turbo';
  }

  async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages, temperature: 0.7 }),
    });
    const data = await resp.json() as any;
    return data?.choices?.[0]?.message?.content || '(LLM 未返回内容)';
  }
}
