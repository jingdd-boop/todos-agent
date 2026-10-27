# Todo Agent 第四周学习 Spec：对话历史与上下文管理

## 1. 学习目标

本阶段重点学习：

```text
对话历史的数据建模
消息角色与工具消息
上下文组装
多轮 Agent Loop
用户数据隔离
历史消息裁剪
对话归档与删除
```

完成后，Todo Agent 应支持：

1. 创建和查看对话。
2. 在同一个对话中连续交流。
3. Agent 能理解上一轮的上下文。
4. 正确保存 user、assistant、tool、system 等角色消息。
5. Tool Call 和 Tool Result 能与对应消息关联。
6. 不同用户不能访问彼此的对话和 Todo 上下文。
7. 超长历史不会无限发送给模型。
8. 用户可以删除自己的对话。

本阶段暂不实现：

```text
❌ 长期用户记忆
❌ 向量数据库
❌ RAG
❌ 多 Agent
❌ Redis
❌ 流式输出
❌ 对话摘要模型
```

## 2. 当前项目基线

当前后端已经具备：

```text
POST /api/assistant/chat
POST /api/assistant/confirm
```

当前 Agent 支持：

```text
list_todos
create_todo
delete_todo
```

当前请求是无状态的：

```text
一次 HTTP 请求
  ↓
读取本次 message
  ↓
调用 LLM
  ↓
执行工具
  ↓
返回答案
```

目标是升级为：

```text
conversationId
  ↓
读取历史消息
  ↓
追加当前用户消息
  ↓
调用 Agent Loop
  ↓
保存 assistant、tool call、tool result
  ↓
返回最终答案
```

## 3. 核心概念

### 3.1 Conversation

Conversation 表示一次持续的对话，会归属于一个用户。

```text
用户：工作计划
  ├── 用户：创建一个 Todo：完成接口文档
  ├── 助手：已创建 Todo
  ├── 用户：把它删除
  └── 助手：需要确认后删除
```

### 3.2 Message

Message 表示对话中的一条消息。

| role | 含义 | 是否展示给用户 |
|---|---|---:|
| system | Agent 的系统指令 | 否 |
| user | 用户输入 | 是 |
| assistant | 模型回复 | 是 |
| tool | 工具执行结果 | 调试模式展示 |

### 3.3 Tool Call 和 Tool Result

assistant 消息需要保存模型的工具调用：

```json
{
  "role": "assistant",
  "toolCalls": [{
    "id": "call_123",
    "name": "list_todos",
    "arguments": { "completed": false }
  }]
}
```

工具结果必须通过 `toolCallId` 关联：

```json
{
  "role": "tool",
  "toolCallId": "call_123",
  "name": "list_todos",
  "content": { "total": 2, "todos": [] }
}
```

不能只保存没有关联关系的文本，否则无法可靠恢复 Agent Loop。

## 4. 建议数据模型

### 4.1 Conversation

```text
Conversation
├── id
├── userId
├── title
├── status
├── createdAt
├── updatedAt
└── messages
```

| 字段 | 类型 | 说明 |
|---|---|---|
| id | Int | 对话 ID |
| userId | Int | 所属用户 |
| title | String? | 对话标题 |
| status | ACTIVE / ARCHIVED | 对话状态 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 最后更新时间 |

### 4.2 Message

```text
Message
├── id
├── conversationId
├── role
├── content
├── toolCallId
├── toolName
├── toolArguments
├── toolResult
├── createdAt
└── sequence
```

| 字段 | 类型 | 说明 |
|---|---|---|
| id | Int | 消息 ID |
| conversationId | Int | 所属对话 |
| role | String | system/user/assistant/tool |
| content | String? | 文本内容 |
| toolCallId | String? | 模型工具调用 ID |
| toolName | String? | 工具名称 |
| toolArguments | Json? | 工具参数 |
| toolResult | Json? | 工具结果 |
| sequence | Int | 对话内顺序 |
| createdAt | DateTime | 创建时间 |

第一版可以把工具参数和工具结果保存为 JSON 字符串。

## 5. 接口设计

### 5.1 创建对话

```http
POST /api/conversations
Authorization: Bearer <token>
```

请求：

```json
{ "title": "工作计划" }
```

### 5.2 获取对话列表

```http
GET /api/conversations
Authorization: Bearer <token>
```

要求：

- 只能返回当前用户的对话。
- 默认按 `updatedAt desc` 排序。
- 支持分页。
- 默认不返回全部消息内容。

### 5.3 获取对话详情

```http
GET /api/conversations/:id
Authorization: Bearer <token>
```

要求：校验归属、按 `sequence asc` 返回消息，并支持调试模式返回 tool 消息。

### 5.4 在指定对话中聊天

```http
POST /api/assistant/chat
Authorization: Bearer <token>
```

请求：

```json
{ "conversationId": 1, "message": "把刚才创建的任务删除" }
```

兼容策略：`conversationId` 为空时创建新对话；存在时继续已有对话；不允许访问其他用户的对话。

### 5.5 删除对话

```http
DELETE /api/conversations/:id
Authorization: Bearer <token>
```

只能删除自己的对话，并级联删除消息。

## 6. 多轮 Agent 流程

```text
POST /api/assistant/chat
  ↓
验证 JWT
  ↓
验证 conversationId
  ↓
读取历史消息
  ↓
保存本轮 user message
  ↓
组装 system + history + current message
  ↓
调用 LLM
  ↓
模型返回普通文本？
  ├── 是：保存 assistant message，结束
  └── 否：保存 assistant tool call
          ↓
       执行工具
          ↓
       保存 tool result
          ↓
       将 tool result 放回上下文
          ↓
       继续调用 LLM
```

第二轮对话“把它删除”必须能看到完整上下文：

```text
system message
user: 创建一个 Todo：学习 Agent Loop
assistant: 调用了 create_todo
tool: 创建结果，todoId=10
assistant: 已创建 Todo
user: 把它删除
```

## 7. 上下文组装与裁剪

第一版规则：

```text
1. 保留 system message
2. 保留最近 20 条完整消息
3. 追加当前 user message
```

不能把 assistant tool call 和 tool result 拆开。Todo 工具结果只保留必要字段：

```json
{ "id": 10, "title": "学习 Agent Loop", "completed": false }
```

禁止发送密码、密码 hash、JWT 和其他用户的私有字段。

## 8. 权限隔离

所有 Conversation API 都必须使用当前登录用户：

```ts
where: {
  id: conversationId,
  userId: req.user.id,
}
```

禁止只根据 `conversationId` 查询，也不能信任客户端提交的 `userId`，更不能依赖 Prompt 实现权限隔离。

## 9. 前端和调试面板

前端新增对话侧栏：

```text
┌──────────────┬──────────────────────┐
│ 对话列表      │ 当前聊天              │
│ 工作计划      │ 消息                  │
│ 学习计划      │ 输入框                │
│ 新建对话      │                      │
└──────────────┴──────────────────────┘
```

支持新建、切换、加载历史、显示 conversationId 和删除对话。

调试面板增加：

```text
Conversation：conversationId、messageCount
Context：system、history、current user
Agent Loop：model step、tool call、tool result
```

不展示 API Key、完整 Authorization Token、密码或密码 hash。

## 10. 分阶段实现计划

### Day 1：数据模型

- 设计 Conversation 和 Message。
- 设计消息角色。
- 设计 Tool Call 和 Tool Result 关联。

### Day 2：Conversation API

- 创建、查询、详情、删除对话。
- 增加用户归属校验。

### Day 3：接入 Agent Chat

- `chat` 接收 `conversationId`。
- 读取并保存历史消息。
- 保存 assistant、tool call 和 tool result。

### Day 4：前端对话列表

- 新建对话。
- 切换对话。
- 加载历史消息。
- 删除对话。

### Day 5：裁剪和测试

- 限制最近 20 条消息。
- 保证 Tool Call 与 Tool Result 成对。
- 测试跨用户访问和删除后继续请求。

## 11. 验收标准

```text
可以创建、查看、切换和删除自己的对话
第一轮创建 Todo，第二轮能理解“它”
assistant tool call 与 tool result 被保存并关联
重新加载对话后可以恢复上下文
用户 A 不能访问、发送消息到或删除用户 B 的对话
历史过长时不会无限发送给模型
system message 始终保留
```

## 12. 暂不实现

```text
❌ Redis 和多实例会话
❌ 长期记忆
❌ 向量检索和 RAG
❌ 自动摘要
❌ 流式传输
❌ 多 Agent 协作
```

完成本 Spec 并确认数据模型稳定后，再进入长期记忆和 RAG 学习。
