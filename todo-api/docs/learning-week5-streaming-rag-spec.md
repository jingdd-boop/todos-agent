# Todo Agent 第五周学习 Spec：流式响应与 RAG

## 1. 目标

在当前 Todo Agent 上学习并实现两个能力：

```text
流式响应：让模型回答逐步显示
RAG：让模型先检索项目文档，再基于检索结果回答
```

本阶段完成后：

- `/api/assistant/chat` 继续保持 JSON 接口兼容。
- 新增 SSE 流式接口。
- 前端逐字/逐块渲染模型回答。
- Agent 能检索 `docs/*.md` 中的项目知识。
- 调试面板展示检索关键词、命中文档和注入上下文。

## 2. 范围与边界

本阶段实现：

```text
SSE
流式文本增量
客户端断开处理
本地 Markdown 文档检索
检索结果注入 system context
search_project_docs 工具
```

暂不实现：

```text
❌ 向量数据库
❌ Embedding API
❌ Redis
❌ 多 Agent
❌ 文档管理后台
❌ 自动文档同步
```

## 3. API 设计

### 3.1 流式聊天

```http
POST /api/assistant/chat/stream
Authorization: Bearer <token>
Accept: text/event-stream
Content-Type: application/json
```

请求：

```json
{
  "conversationId": 1,
  "message": "当前项目的认证方式是什么？"
}
```

SSE 事件：

```text
event: meta
data: {"model":"deepseek-chat"}

event: retrieval
data: {"query":"认证方式","sources":["docs/auth.jwt.md"]}

event: token
data: {"text":"当前项目使用 JWT"}

event: done
data: {"conversationId":1}
```

错误事件：

```text
event: error
data: {"code":"LLM_REQUEST_FAILED","message":"..."}
```

## 4. RAG 流程

```text
用户问题
  ↓
提取查询文本
  ↓
检索 docs/*.md
  ↓
按关键词评分
  ↓
选取 Top K 片段
  ↓
注入模型上下文
  ↓
LLM 生成回答
```

第一版检索器使用本地关键词匹配：

- 按 Markdown 段落切分。
- 中文问题使用完整短语和字符片段匹配。
- 英文问题按空格切词。
- 返回最多 3 个片段。
- 每个片段保留文件名和标题。

后续再替换为 Embedding + Vector Search，工具接口保持不变。

## 5. RAG 工具

```text
search_project_docs
```

参数：

```json
{
  "query": "JWT 如何认证",
  "topK": 3
}
```

返回：

```json
{
  "sources": [
    {
      "file": "docs/auth.jwt.md",
      "title": "JWT 认证",
      "content": "..."
    }
  ]
}
```

## 6. 前端要求

- 聊天请求使用 `fetch` 读取 `ReadableStream`。
- 收到 `token` 事件后立即追加到 assistant 消息。
- 显示“正在检索文档”和“正在生成回答”状态。
- 显示 RAG 来源文件。
- 用户点击新问题时取消上一次请求。
- 流结束后刷新对话列表。

## 7. 安全和可靠性

- SSE 接口必须经过 JWT 认证。
- 不向前端返回 LLM API Key。
- 检索内容视为不可信文档，不得覆盖 system 指令。
- 限制检索片段数量和总字符数。
- 限制单次流式请求超时时间。
- 客户端断开后取消上游模型请求。

## 8. 验收标准

```text
访问 /assistant 可以看到逐步生成的回答
流式接口断开不会导致前端卡死
询问项目认证方式时能命中 docs/auth.jwt.md
调试面板展示 RAG 命中文档
非流式 /api/assistant/chat 仍然可用
没有 API Key 泄露到浏览器
TypeScript 检查通过
```

## 9. 学习顺序

```text
Day 1：SSE 基础和服务端事件格式
Day 2：前端 ReadableStream 消费
Day 3：模型流式响应
Day 4：Markdown 文档切片和关键词检索
Day 5：RAG 上下文注入、来源展示和测试
```
