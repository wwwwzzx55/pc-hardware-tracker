# `ai.service.ts` 代码详解

> 文件位置：`server/src/ai/ai.service.ts`

---

## 一、文件概览

`ai.service.ts` 是 AI 模块的**核心服务层**，负责：

| 功能 | 说明 |
|------|------|
| **LLM 提供商管理** | 根据用户设置创建 OpenAI / Anthropic 客户端，带缓存 |
| **AI 对话** | 接收用户问题 → 查数据库做上下文 → 调 LLM 回答 |
| **报告生成** | 生成结构化的市场分析报告 |
| **提示词管理** | CRUD 四种分析模式的系统提示词（含预设保护机制） |
| **设置管理** | 持久化 AI 配置到 JSON 文件 |

---

## 二、依赖注入与初始化（第 1-45 行）

```typescript
@Injectable()
export class AiService {
  private settings: AiSettings;
  private providerCache: { key: string; provider: LLMProvider } | null = null;

  constructor(@InjectEntityManager() private em: EntityManager) {
    this.settings = this.loadSettings();     // 从 JSON 文件加载配置
    this.seedPresetPrompts();                // 首次启动时插入预设提示词
  }
}
```

### 讲解

- **`@Injectable()`** — NestJS 的依赖注入装饰器，表示这个类可以被其他模块注入使用
- **`@InjectEntityManager() private em`** — 注入 TypeORM 的 EntityManager，用来执行原始 SQL 查询。注意这里没有用 Entity 类和 Repository，直接写 SQL 更灵活
- **构造函数**做了两件事：
  - `loadSettings()` — 从 `data/ai-settings.json` 文件读取 AI 配置（提供商、API Key、模型等）
  - `seedPresetPrompts()` — 首次启动时，往 `ai_prompts` 表插入四种预设提示词（query / predict / report / compare）

### 设计意图

通过 JSON 文件存储 AI 配置，而不是数据库。原因是 AI 配置是全局的、低频修改的，用文件存储更简单，不需要额外查数据库。

---

## 三、LLM 提供商工厂（第 49-79 行）

```typescript
private getProvider(): LLMProvider {
  // 用当前配置拼接缓存键
  const cacheKey = `${this.settings.provider}:${this.settings.baseUrl}:${this.settings.apiKey}:${this.settings.model}`;

  // 配置没变 → 返回缓存的 provider
  if (this.providerCache?.key === cacheKey) {
    return this.providerCache.provider;
  }

  // 配置变了 → 创建新的 provider
  let provider: LLMProvider;
  if (this.settings.provider === 'anthropic') {
    provider = new AnthropicProvider(/* ... */);
  } else {
    provider = new OpenAIProvider(/* ... */);
  }

  // 缓存后返回
  this.providerCache = { key: cacheKey, provider };
  return provider;
}

private clearProviderCache() {
  this.providerCache = null;  // 用户修改设置后调用
}
```

### 讲解

这是一个**工厂方法 + 缓存**模式：

1. **缓存机制** — 用 `provider:baseUrl:apiKey:model` 拼接成缓存键。配置没变时直接返回缓存的 provider，避免每次都 new 一个新实例
2. **策略选择** — 根据 `this.settings.provider` 的值，决定创建 `OpenAIProvider` 还是 `AnthropicProvider`
3. **上层无感** — 调用方不需要知道用的是 OpenAI 还是 Anthropic，只管调 `chat()` 或 `chatStream()`

### 为什么需要缓存？

每次 new 一个 provider 只是创建对象，开销不大。但缓存在这里更重要的是**配置一致性**——在一次对话过程中，即使配置被修改了，正在使用的 provider 不受影响，直到下次调用 `getProvider()` 才生效。

---

## 四、AI 对话核心逻辑（第 83-105 行）

```typescript
async chat(message: string, mode: string = 'query') {
  // 1. 查数据库，获取相关产品数据作为上下文
  const context = await this.buildContext(message);

  // 2. 从 ai_prompts 表获取对应模式的系统提示词
  const prompt = await this.getPromptByMode(mode);
  const systemPrompt = prompt?.content || '你是硬件价格查询助手...';

  // 3. 将数据库数据注入提示词，发给 LLM
  const response = await this.getProvider().chat([
    { role: 'system', content: `${systemPrompt}\n\n数据库数据:\n${context}` },
    { role: 'user', content: message },
  ]);

  return { reply: response, mode };
}

async *chatStream(message: string, mode: string = 'query') {
  const context = await this.buildContext(message);
  const prompt = await this.getPromptByMode(mode);
  const systemPrompt = prompt?.content || '...';

  // yield* 把 AsyncGenerator 的产出"转发"给调用方
  yield* this.getProvider().chatStream([
    { role: 'system', content: `${systemPrompt}\n\n数据库数据:\n${context}` },
    { role: 'user', content: message },
  ]);
}
```

### 讲解

这是 AI 对话的**三步走**逻辑：

| 步骤 | 函数 | 作用 |
|------|------|------|
| 1 | `buildContext(message)` | 查数据库，匹配用户问题中的产品名，提取相关价格数据 |
| 2 | `getPromptByMode(mode)` | 从 `ai_prompts` 表读取对应模式的系统提示词 |
| 3 | `getProvider().chat()` | 把三样东西拼在一起发给 LLM：系统提示词 + 数据库数据 + 用户问题 |

### 核心设计理念

**AI 的回答基于真实数据库数据，不是 LLM 的训练数据**。

比如用户问"i5-14600KF 多少钱"，系统先查数据库找到这个产品的价格记录，拼到提示词里再发给 LLM：

```
系统提示词: 你是硬件价格查询助手。根据数据库中的数据回答...
数据库数据: [{"name":"Intel 酷睿 i5-14600KF","price":1879,"recorded_at":"2026-06-20"},...]
用户问题: i5-14600KF 多少钱？
```

这样 LLM 就知道具体价格，而不是靠训练数据中的过时信息回答。

### `chat` vs `chatStream`

| 方法 | 返回方式 | 前端体验 |
|------|----------|---------|
| `chat()` | 等 LLM 完整返回，一次性响应 | 等待后看到完整回答 |
| `chatStream()` | 用 `yield*` 逐块转发 SSE 流 | 打字机效果，逐字显示 |

`yield*` 是 JavaScript 的语法，作用是把一个 `AsyncGenerator` 的产出**全部转发**给调用方，相当于：

```typescript
for await (const chunk of this.getProvider().chatStream([...])) {
  yield chunk;
}
```

---

## 五、数据库上下文构建（第 326-348 行）

```typescript
private async buildContextAsync(message: string): Promise<string> {
  // 1. 查出所有产品
  const products = await this.em.query('SELECT id, name, category FROM products');

  // 2. 匹配用户消息中提到的产品名或品类
  const matched = products.filter((p: any) =>
    message.includes(p.name) || message.includes(p.category)
  );

  if (matched.length === 0) {
    // 3a. 没匹配到 → 返回最近 50 条价格记录作为兜底
    const all = await this.em.query(`
      SELECT p.name, p.category, ph.price, ph.recorded_at
      FROM products p JOIN price_history ph ON p.id = ph.product_id
      ORDER BY ph.recorded_at DESC LIMIT 50
    `);
    return JSON.stringify(all);
  }

  // 3b. 匹配到了 → 只查这些产品的完整价格历史
  const ids = matched.map((m: any) => m.id);
  const data = await this.em.query(`
    SELECT p.name, p.category, ph.price, ph.recorded_at FROM products p
    JOIN price_history ph ON p.id = ph.product_id
    WHERE p.id IN (${ids.join(',')}) ORDER BY ph.recorded_at DESC LIMIT 200
  `);
  return JSON.stringify(data);
}
```

### 讲解

这个函数决定了**AI 能看到哪些数据库数据**：

| 情况 | 用户问题示例 | 匹配结果 | 返回的上下文 |
|------|-------------|----------|-------------|
| 匹配到产品 | "i5-14600KF 多少钱" | 匹配到 `i5-14600KF` | 只返回该产品的价格历史 |
| 匹配到品类 | "显卡最近降价了吗" | 匹配到 `GPU` | 返回该品类所有产品的数据 |
| 没匹配到 | "帮我推荐个电脑配置" | 无匹配 | 返回最近 50 条价格记录做兜底 |

### 设计要点

- **模糊匹配** — 用 `message.includes(p.name)` 判断用户问题中是否提到了某个产品名。这种方式简单有效，不需要 NLP 分词
- **精准 vs 兜底** — 匹配到了就精确返回，没匹配到也有数据可用，不至于让 LLM 无话可说
- **注意**：`${ids.join(',')}` 直接拼接 ID，这里 ID 来自数据库查询结果，不是用户输入，所以不存在 SQL 注入风险

---

## 六、报告生成（第 107-143 行）

```typescript
async generateReport() {
  // 查最近 100 条价格记录
  const overview = await this.em.query(`
    SELECT p.name, p.category, ph.price, ph.recorded_at
    FROM products p JOIN price_history ph ON p.id = ph.product_id
    ORDER BY ph.recorded_at DESC LIMIT 100
  `);
  const dataText = JSON.stringify(overview);

  // 获取 report 模式的系统提示词
  const prompt = await this.getPromptByMode('report');
  const systemPrompt = prompt?.content || '你是硬件价格分析师...';

  // 把数据发给 LLM 生成报告
  const response = await this.getProvider().chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: dataText },
  ]);

  return { report: response };
}
```

### 讲解

和对话的区别：

| | chat() | generateReport() |
|------|--------|-----------------|
| 用户输入 | 用户自由提问 | 直接传数据库数据 |
| 系统提示词 | 根据 mode 动态选择 | 固定用 `report` 模式 |
| 用途 | 回答具体问题 | 生成结构化市场分析报告 |

注意这里 **system 角色放的是提示词，user 角色放的是数据库数据**——因为 LLM 消息格式要求 system 是固定指令，user 才是输入内容。

---

## 七、提示词管理（第 232-322 行）

这是整个文件中最复杂的部分，实现了一个**可编辑、可重置的系统提示词系统**。

### 7.1 数据结构

`ai_prompts` 表结构：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(50) PK | 语义化主键，如 `query` / `predict` / `report` / `compare` |
| name | VARCHAR(100) | 展示名称，如"查价格"、"预测走势" |
| content | TEXT | 系统提示词正文 |
| is_preset | TINYINT(1) | 是否预设：1=系统内置（不可删除），0=用户自定义 |
| sort_order | INT | 排序序号 |

### 7.2 查询提示词

```typescript
async getAllPrompts(): Promise<PromptTemplate[]> {
  const rows: any[] = await this.em.query(
    'SELECT id, name, description, content, is_preset AS isPreset FROM ai_prompts ORDER BY sort_order ASC, id ASC',
  );
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    description: r.description || '',
    content: r.content,
    isPreset: !!r.isPreset,   // 把 0/1 转成 boolean
  }));
}

async getPromptByMode(mode: string): Promise<PromptTemplate | null> {
  const rows: any[] = await this.em.query(
    'SELECT id, name, description, content, is_preset AS isPreset FROM ai_prompts WHERE id = ? ORDER BY is_preset ASC LIMIT 1',
    [mode],
  );
  if (rows.length === 0) return null;
  return { /* ... */ };
}
```

**讲解**：

- `getAllPrompts` — 查询所有提示词，按 `sort_order` 排序返回，前端展示用
- `getPromptByMode` — 按 id 查单个提示词，注意 `ORDER BY is_preset ASC LIMIT 1`

**关键细节**：`ORDER BY is_preset ASC` 的作用

`is_preset` 的值：`0`（用户自定义）或 `1`（系统预设）。按升序排列时，`is_preset=0` 排前面。所以如果同个 id 有两条记录（预设 + 用户覆盖），优先返回用户自定义的那条。

### 7.3 更新提示词（核心复杂逻辑）

```typescript
async updatePrompt(id: string, content: string, name?: string, description?: string) {
  const existing = await this.em.query('SELECT * FROM ai_prompts WHERE id = ?', [id]);
  if (existing.length === 0) return null;

  const row: any = existing[0];
  if (row.is_preset && existing.length === 1) {
    // 情况1：编辑的是预设提示词，且还没有自定义覆盖
    await this.em.query(`
      INSERT INTO ai_prompts (id, name, description, content, is_preset, sort_order)
      VALUES (?, ?, ?, ?, 0, (
        SELECT sort_order FROM (SELECT sort_order FROM ai_prompts WHERE id = ?) AS t
      ))
      ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), content=VALUES(content)
    `, [id, name || row.name, description !== undefined ? description : row.description, content, id]);
  } else {
    // 情况2：编辑的是自定义提示词，或者已有自定义覆盖
    await this.em.query(
      'UPDATE ai_prompts SET content = ?' +
      (name ? ', name = ?' : '') +
      (description !== undefined ? ', description = ?' : '') +
      ' WHERE id = ? AND is_preset = 0',
      [content, ...[name, description !== undefined ? description : undefined].filter(v => v !== undefined), id].filter(v => v !== undefined),
    );
  }
  return this.getPromptByMode(id);
}
```

#### 预设保护机制

这是一个精巧的设计——**预设提示词不能被覆盖，只能被"覆盖记录"遮盖**：

| 场景 | 数据库行为 | 原因 |
|------|-----------|------|
| 用户编辑预设 `query`（首次） | **INSERT** 一条 `is_preset=0` 的新记录，id 相同 | 保护原始预设不被修改，用户随时可以重置 |
| 用户再次编辑 `query`（已有覆盖） | **UPDATE** 已有的 `is_preset=0` 记录 | 覆盖记录已存在，直接更新 |
| 用户编辑自定义提示词 | **UPDATE** 现有记录 | 自定义的本来就是用户创建的 |

**举例说明**：

```
原始数据库：
  (query, is_preset=1, content="你是硬件价格查询助手...")

用户修改后：
  (query, is_preset=1, content="你是硬件价格查询助手...")  ← 原始预设不变
  (query, is_preset=0, content="你是最懂硬件的专家...")     ← 新增覆盖记录

查询时 ORDER BY is_preset ASC → 返回 is_preset=0 的用户版本
用户点"重置" → 删除 is_preset=0 的记录 → 又回到原始预设
```

#### 嵌套子查询的技巧

```sql
(SELECT sort_order FROM (SELECT sort_order FROM ai_prompts WHERE id = ?) AS t)
```

MySQL 不允许在子查询中直接引用同一个表的 `UPDATE` 目标，所以需要多一层嵌套。这是 MySQL 的限制，不是业务逻辑需要。

### 7.4 重置与删除

```typescript
async resetPrompt(id: string): Promise<PromptTemplate | null> {
  // 只删除 is_preset=0 的自定义覆盖记录
  await this.em.query('DELETE FROM ai_prompts WHERE id = ? AND is_preset = 0', [id]);
  return this.getPromptByMode(id);
}

async addCustomPrompt(name: string, description: string, content: string): Promise<PromptTemplate> {
  const id = 'custom_' + Date.now();  // 用时间戳生成唯一 ID
  await this.em.query(
    'INSERT INTO ai_prompts (id, name, description, content, is_preset, sort_order) VALUES (?, ?, ?, ?, 0, 99)',
    [id, name, description || '', content],
  );
  return (await this.getPromptByMode(id))!;
}

async deleteCustomPrompt(id: string): Promise<boolean> {
  const result: any = await this.em.query('DELETE FROM ai_prompts WHERE id = ?', [id]);
  return result?.affectedRows > 0;
}
```

**讲解**：

- `resetPrompt` — 只删除 `is_preset=0` 的覆盖记录，预设记录永远不受影响。重置后再次查询，回到原始预设内容
- `addCustomPrompt` — `id = 'custom_' + Date.now()` 用时间戳保证 ID 不重复，`sort_order = 99` 排在最末尾
- `deleteCustomPrompt` — 删除自定义提示词。注意预设提示词无法通过 API 删除（前端也不会展示删除按钮）

### 7.5 种子数据初始化

```typescript
private async seedPresetPrompts(): Promise<void> {
  const presets = [
    { id: 'query',    name: '查价格',   description: '根据数据库数据回答硬件价格问题',
      content: '你是硬件价格查询助手。根据数据库中的数据回答用户关于硬件价格的问题。用中文回复，简洁准确。',
      sort_order: 1 },
    { id: 'predict',  name: '预测走势', description: '根据历史价格数据预测短期走势',
      content: '你是硬件价格趋势分析师。根据历史价格数据，预测短期价格走势，给出"建议入手"或"建议观望"的建议及理由。',
      sort_order: 2 },
    { id: 'report',   name: '生成报告', description: '生成结构化的市场分析报告',
      content: '你是硬件市场分析师。根据提供的数据生成一份结构化的市场分析报告，包含：整体市场趋势概述、各品类价格动态分析、值得关注的产品、短期购买建议。',
      sort_order: 3 },
    { id: 'compare',  name: '产品对比', description: '对比多个硬件产品的性价比',
      content: '你是硬件产品对比分析师。从价格、性能口碑、价格趋势、性价比等维度进行比较，给出推荐意见。',
      sort_order: 4 },
  ];
  for (const p of presets) {
    await this.em.query(
      'INSERT IGNORE INTO ai_prompts (id, name, description, content, is_preset, sort_order) VALUES (?, ?, ?, ?, 1, ?)',
      [p.id, p.name, p.description, p.content, p.sort_order],
    );
  }
}
```

**讲解**：

- `INSERT IGNORE` — 如果记录已存在（比如重启服务），不报错也不覆盖。所以预设提示词只在**首次启动**时插入一次
- `is_preset = 1` — 标记为系统预设，前端会展示"预设"徽章，不显示删除按钮

---

## 八、设置管理（第 146-164 行）

```typescript
updateSettings(updates: Partial<AiSettings>): AiSettings {
  if (updates.apiKey !== undefined && updates.apiKey !== '') {
    this.settings.apiKey = updates.apiKey;      // API Key 只有非空才更新
  }
  if (updates.provider !== undefined) this.settings.provider = updates.provider;
  if (updates.baseUrl !== undefined) this.settings.baseUrl = updates.baseUrl;
  if (updates.model !== undefined) this.settings.model = updates.model;
  if (updates.temperature !== undefined) this.settings.temperature = updates.temperature;
  if (updates.maxTokens !== undefined) this.settings.maxTokens = updates.maxTokens;

  this.clearProviderCache();  // 清空缓存，下次调用 getProvider() 用新配置创建
  this.saveSettings();        // 持久化到 JSON 文件
  return this.getSettings();
}
```

### 讲解

| 操作 | 作用 |
|------|------|
| `apiKey` 判空 | 防止前端没填 API Key 时覆盖掉已有的 Key |
| `clearProviderCache()` | 清空 provider 缓存，下次对话时用新配置创建新的 LLM 客户端 |
| `saveSettings()` | 把配置写回 `data/ai-settings.json`，服务重启后不丢失 |

### 设置持久化

```typescript
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
```

- 用 `{ ...DEFAULT_SETTINGS, ...data }` 合并默认配置和用户配置，新增的配置项自动获得默认值
- 读写都用 `try/catch` 包裹，文件读写失败不影响主流程

---

## 九、模型列表获取（第 168-228 行）

```typescript
async fetchModels(provider?: string, baseUrl?: string, apiKey?: string) {
  if (p === 'anthropic') {
    return await this.fetchAnthropicModels(url, key);
  } else {
    return await this.fetchOpenAIModels(url, key);
  }
}

private async fetchOpenAIModels(baseUrl: string, apiKey: string) {
  const resp = await fetch(`${baseUrl}/models`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  const models = data?.data || [];
  return models
    .filter((m: any) => m.id && (m.id.includes('gpt') || m.id.includes('deepseek') || ...))
    .map((m: any) => ({ id: m.id, name: m.id }));
}
```

### 讲解

- **OpenAI 兼容接口** — 调用 `GET /models` 拉取模型列表，然后过滤出常见模型名
- **Anthropic** — Anthropic 没有公开的 `/models` 接口，所以先尝试请求，失败就返回硬编码的已知 Claude 模型列表
- **兼容国内模型** — 过滤器包含 `deepseek`、`qwen`、`glm` 等，用户填入国内模型的 API 地址也能拉取模型列表

---

## 十、完整调用流程

```
前端发送消息
     │
     ▼
AiController.chat() / chatStream()
     │
     ▼
AiService.chat(message, mode)
     │
     ├── 1. buildContext(message)
     │       ├── 查 products 表 → 匹配产品名/品类
     │       ├── 命中 → 查这些产品的价格历史 → JSON
     │       └── 未命中 → 查最近 50 条记录 → JSON
     │
     ├── 2. getPromptByMode(mode)
     │       └── 查 ai_prompts 表 → 返回系统提示词
     │            (优先返回 is_preset=0 的自定义版本)
     │
     └── 3. getProvider().chat([system, user])
             │
             ├── providerCache 命中？→ 直接返回缓存的 provider
             │
             ├── 根据 settings.provider 选择：
             │   ├── OpenAIProvider.chat()
             │   │     └── POST /chat/completions → return string
             │   │
             │   └── AnthropicProvider.chat()
             │         └── POST /v1/messages → return string
             │
             └── 返回 { reply: response, mode }
```

---

## 十一、设计亮点总结

| 设计 | 说明 |
|------|------|
| **策略模式** | `LLMProvider` 接口统一 OpenAI 和 Anthropic 的差异 |
| **基于真实数据的 AI** | 数据库数据作为 LLM 上下文，回答有据可查 |
| **预设保护机制** | 用户编辑预设提示词时新增覆盖记录，而非直接修改原始数据 |
| **可重置** | 随时恢复预设提示词到初始状态 |
| **配置持久化** | AI 设置通过 JSON 文件持久化，重启不丢失 |
| **Provider 缓存** | 配置不变时不重复创建 LLM 客户端 |
| **SSE 流式输出** | 打字机效果提升用户体验 |
