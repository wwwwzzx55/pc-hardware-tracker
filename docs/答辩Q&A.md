# 后端模拟答辩 Q&A

---

## Q1：为什么后端用 NestJS 而不是直接用 Python（如 Flask/Django）？

**答**：我们采用的是**混合架构**，并非只用 NestJS。选择 NestJS 做 API 服务是因为：

1. **前后端统一语言**：前端是 JavaScript，后端用 TypeScript（NestJS），类型可以共享，团队协作成本低
2. **高性能 I/O**：爬虫是耗时的网络 I/O 操作，Node.js 的事件驱动模型在处理大量并发请求时更高效，不会因为一个爬虫任务阻塞其他请求
3. **生态互补**：Node.js 做 API 服务、Python 做爬虫，各取所长。爬虫需要 requests/BeautifulSoup 这类 Python 独有的库，而 NestJS 的依赖注入和模块化架构更适合构建可维护的 RESTful API

但数据采集仍然用 Python（Scrapy + requests），通过子进程调用的方式集成。

---

## Q2：为什么不直接用 Scrapy 的 CrawlerProcess，而要手动驱动 Spider？

**答**：遇到两个实际问题：

1. **Windows 兼容性问题**：Python 3.14 + Scrapy 2.16 在 Windows 上，CrawlerProcess 内部的 asyncio reactor 存在阻塞问题，爬完一个任务后进程无法正常退出
2. **更轻量的控制**：我们的场景很简单——输入关键词，爬取结果，输出 JSON。不需要 Scrapy 完整的调度器、去重队列、扩展机制。手动驱动 Spider → Pipeline 数据流，代码更可控，问题更容易排查

所以 Scrapy 在我们项目中更多是**借用了它的 Spider + Pipeline 架构模式**，底层 HTTP 请求用 requests 库绕过反爬。

---

## Q3：爬虫被反爬了怎么办？怎么保证稳定？

**答**：针对 ZOL 的反爬，我们做了四层处理：

1. **模拟浏览器环境**：设置完整的 User-Agent、Accept、Referer 等 HTTP 头，携带 Session Cookie
2. **绕过 Scrapy TLS**：ZOL 对 Scrapy 默认的 Twisted TLS 握手会返回空 body，所以实际 HTTP 请求改用 `requests` 库
3. **重试机制**：旧版爬虫（`crawler/zol.py`）实现了 `_request_with_retry`，失败后等待 1 秒重试，最多 2 次
4. **礼貌延迟**：每页爬取间隔 0.5 秒，降低被封概率

不过必须承认，目前的方案依赖 ZOL 网页结构，如果网站改版或加强反爬，爬虫可能失效。这是爬虫类项目的固有风险。

---

## Q4：taskId 存在内存里，服务重启不就丢了吗？

**答**：是的，这是一个**有意识的设计取舍**。

- `this.tasks = new Map<string, CrawlTask>()` 存在进程内存中
- 服务重启后所有进行中的任务丢失

理由：爬取任务是**短生命周期**操作（通常 5-15 秒完成），前端轮询超时设置是 60 秒。在这个时间尺度下，将任务状态持久化到数据库的收益很低，反而增加复杂度。如果确实需要持久化，可以改用 Redis 存任务状态，但目前的使用场景不需要。

---

## Q5：`confirmSave` 为什么用 stdin 传数据，而不是命令行参数？

**答**：因为数据量问题。

用户可能一次选中 20-30 个产品，每个产品包含 name、price、url、img_url 四个字段。如果拼成命令行参数：

```bash
py save.py GPU '[{"name":"RTX 4070","price":4499},...]'
```

命令行长度可能超过操作系统的限制（Windows 是 8191 个字符）。而且特殊字符可能被 shell 解析错误。

通过 stdin 传递就没有这个限制：
```typescript
proc.stdin.write(JSON.stringify(products));
proc.stdin.end();
```
Python 用 `sys.stdin.read()` 读取，数据走管道，不受长度限制，也不需要转义。

---

## Q6：价格历史查询的 SQL 为什么用 `MAX(id)` 而不是 `MAX(recorded_at)`？

**答**：为了避免**同一秒内多条价格记录导致的重复行**问题。

如果同一秒内插入了两条价格记录，用 `MAX(recorded_at)` 会返回两条相同时间戳的记录，导致 `JOIN` 产生重复行。

而 `id` 是自增主键，`MAX(id)` 永远指向最后插入的那条记录，保证唯一性。这是数据库设计中的一个细节优化。

```sql
-- 正确的做法：用 MAX(id)
SELECT MAX(ph2.id) FROM price_history ph2 WHERE ph2.product_id = p.id

-- 而不是：MAX(recorded_at) 可能返回多行
```

---

## Q7：AI 模块为什么同时支持 OpenAI 和 Anthropic？

**答**：通过**策略模式**设计了一个 `LLMProvider` 接口：

```typescript
interface LLMProvider {
  chat(messages): Promise<string>;
  chatStream(messages): AsyncGenerator<StreamChunk>;
}
```

`OpenAIProvider` 和 `AnthropicProvider` 分别实现这个接口。用户在前端设置页面可以自由选择提供商、API 地址和模型。这样做有几个好处：

1. **避免供应商锁定**：可以随时切换，哪个模型性价比高就用哪个
2. **兼容国内模型**：很多国内大模型（DeepSeek、通义千问、智谱 GLM）提供 OpenAI 兼容接口，填入 API 地址就能用
3. **流式输出统一**：两种提供商都实现了 SSE 流式输出，前端体验一致

---

## Q8：数据库为什么用 ENUM 存品类？如果新增品类怎么办？

**答**：这是一个可以改进的地方。目前用 ENUM 是因为五大品类（CPU、GPU、RAM、MB、SSD）是固定的课程设计要求。

如果要扩展，应该改成**独立的 categories 表**：

```sql
CREATE TABLE categories (
    id INT PRIMARY KEY,
    name VARCHAR(50) UNIQUE
);
```

然后把 `products.category` 改为 VARCHAR 或外键。这样新增品类只需要 insert 一条记录，不需要改表结构。

---

## Q9：系统有什么不足？如果继续开发会怎么做？

**答**：目前主要有四个不足：

1. **没有定时爬取**：价格是手动触发的，不会自动更新。改进：引入 `node-cron` 或 `node-schedule`，配置定时任务每天自动刷新价格
2. **数据源单一**：只有 ZOL。改进：接入京东、淘宝等多源数据做交叉验证
3. **没有用户系统**：所有人都共用同一个数据库。改进：添加 JWT 认证，支持用户收藏和价格提醒
4. **测试覆盖率为 0**：这是课程设计的时间限制导致的。改进：补充单元测试和集成测试，保证代码质量

---

## Q10：爬虫和 API 之间为什么用 JSON stdout 通信，而不是直接让 Python 写数据库？

**答**：核心原因是**预览-确认机制**。

如果 Python 直接写库，用户就没有机会审核爬取结果。万一爬到的数据不对（比如关键词匹配错了），垃圾数据就直接进库了。

```
当前流程：爬取 → 预览展示 → 用户确认 → 写库
替代方案：爬取 → 直接写库（失去控制）
```

JSON stdout 通信让我们可以在中间插入一个人工确认的环节。这也是 `--preview` 模式存在的意义——爬虫只收集不写入，把选择权交给用户。

---

## Q11：`refreshAllPrices` 是怎么刷新所有产品价格的？会重复爬吗？

**答**：`refreshAllPrices` 调用的是 `crawler/refresh_prices.py`，它会从数据库读出所有产品，逐个重新爬取最新价格。

在 `insert_price` 函数中有一个**按天去重**的逻辑：

```python
cursor.execute('''
    SELECT id FROM price_history
    WHERE product_id = %s AND DATE(recorded_at) = CURDATE()
    LIMIT 1
''', (product_id,))
if cursor.fetchone():
    return  # 今天已有记录，跳过
```

所以即使一天内多次刷新，同一产品也只保留一条价格记录，不会重复。

---

## Q12：前端直接请求 `localhost:3000`，部署到服务器怎么办？

**答**：前端 `app.js` 中 API 地址写死了 `http://localhost:3000/api`。

如果要部署到服务器，有两种改进方案：

1. **Nginx 反向代理**：将 `/api` 路径代理到后端，前端改用相对路径 `/api`
2. **环境变量注入**：构建时通过环境变量传入 API 地址

目前因为是课程设计，演示环境就是本地，所以直接硬编码了。生产环境肯定需要改。

---

## Q13：为什么选择 MySQL 而不是 MongoDB？

**答**：因为我们的数据模型是**强关系型**的：

- 产品（products）和价格历史（price_history）是典型的一对多关系
- 统计查询需要 GROUP BY 按品类聚合
- 价格历史需要按时间排序、按天去重

这些用关系型数据库的 SQL 表达非常自然，而用 MongoDB 的聚合管道写同样的查询会复杂得多。

另外，课程要求使用关系数据库也是一个因素。

---

## Q14：项目中你遇到的最难的问题是什么？

**答**：最棘手的是 **Scrapy 在 Windows 上的兼容性问题**。

具体表现：Python 3.14 + Scrapy 2.16 在 Windows 上，CrawlerProcess 启动的 asyncio reactor 在执行完爬取后无法正常停止，进程挂死，NestJS 收不到 stdout 输出，前端一直在"加载中"。

花了不少时间排查，最后决定**绕过 Scrapy 的进程管理**：不依赖 CrawlerProcess，而是手动创建 Spider 实例，遍历 `start_requests()` 的返回值，交给 Pipeline 处理。HTTP 请求也换成 `requests` 库（同时也解决了反爬问题）。

算是"塞翁失马"——为了修兼容性问题，反而把反爬问题也一起解决了。

---

## Q15：前端那个拖拽分割条是你做的吗？

**答**：是的，在 `frontend/js/app.js` 中有一个 `initResizer` 函数。

它监听 mousedown/mousemove/mouseup 事件，实时调整表格和图表区域的宽度比例。虽然是一个小功能，但提升了用户体验——用户可以根据需要分配左右两侧的空间。

实现上用了 `document.body.style.cursor = 'col-resize'` 和 `userSelect = 'none'` 防止拖拽时选中文本。

```javascript
resizer.addEventListener('mousedown', (e) => {
  dragging = true;
  startX = e.clientX;
  startWidth = left.offsetWidth;
});

document.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const newWidth = Math.max(240, startWidth + (e.clientX - startX));
  left.style.flex = `0 0 ${newWidth}px`;
});
```
