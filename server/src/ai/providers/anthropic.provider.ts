import { LLMProvider, ChatOptions, StreamChunk } from './openai.provider';

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

  async *chatStream(
    messages: Array<{ role: string; content: string }>,
    options?: ChatOptions,
  ): AsyncGenerator<StreamChunk> {
    const temperature = options?.temperature ?? this.temperature;
    const maxTokens = options?.maxTokens ?? this.maxTokens;

    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    const body: any = {
      model: this.model,
      max_tokens: maxTokens,
      temperature,
      messages: chatMessages,
      stream: true,
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

    if (!resp.ok) {
      const errText = await resp.text();
      yield { type: 'error', text: `Anthropic API 请求失败 (${resp.status}): ${errText.slice(0, 200)}` };
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      yield { type: 'error', text: '无法读取响应流' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim();
            continue;
          }

          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) continue;

            try {
              const parsed = JSON.parse(jsonStr);

              if (currentEvent === 'content_block_delta' || parsed.type === 'content_block_delta') {
                const delta = parsed.delta;
                if (delta?.type === 'thinking_delta' && delta.thinking) {
                  yield { type: 'thinking', text: delta.thinking };
                } else if (delta?.type === 'text_delta' && delta.text) {
                  yield { type: 'content', text: delta.text };
                }
              }

              if (currentEvent === 'message_stop' || parsed.type === 'message_stop') {
                yield { type: 'done', text: '' };
                return;
              }
            } catch {
              // Skip unparseable chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      yield { type: 'done', text: '' };
    }
  }
}
