export interface StreamChunk {
  type: 'thinking' | 'content' | 'done' | 'error';
  text: string;
}

export interface LLMProvider {
  chat(messages: Array<{ role: string; content: string }>, options?: ChatOptions): Promise<string>;
  chatStream(messages: Array<{ role: string; content: string }>, options?: ChatOptions): AsyncGenerator<StreamChunk>;
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

  async *chatStream(
    messages: Array<{ role: string; content: string }>,
    options?: ChatOptions,
  ): AsyncGenerator<StreamChunk> {
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
        stream: true,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      yield { type: 'error', text: `API 请求失败 (${resp.status}): ${errText.slice(0, 200)}` };
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      yield { type: 'error', text: '无法读取响应流' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === '[DONE]') {
            yield { type: 'done', text: '' };
            return;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed?.choices?.[0]?.delta;
            const finishReason = parsed?.choices?.[0]?.finish_reason;

            if (delta?.reasoning_content) {
              yield { type: 'thinking', text: delta.reasoning_content };
            }

            if (delta?.content) {
              yield { type: 'content', text: delta.content };
            }

            if (finishReason === 'stop' || finishReason === 'length') {
              yield { type: 'done', text: '' };
              return;
            }
          } catch {
            // Skip unparseable chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
      yield { type: 'done', text: '' };
    }
  }
}
