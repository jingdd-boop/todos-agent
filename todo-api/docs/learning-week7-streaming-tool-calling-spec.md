# Todo Agent 第七周学习 Spec：完整流式 Tool Calling

## 目标

将文本流式接口升级为完整 Agent Loop：

```text
用户输入 → 模型流式识别意图 → 流式生成 Tool Call → 累积参数 → 执行工具 → 回传工具结果 → 模型继续流式回答
```

支持工具：`list_todos`、`create_todo`、`delete_todo`。

## 模型请求契约

```json
{
  "model": "deepseek-chat",
  "stream": true,
  "messages": [],
  "tools": [],
  "tool_choice": "auto"
}
```

流式和非流式接口必须复用同一个 Tool Registry。

## Agent Loop 状态机

```text
MODEL_STREAMING
  ↓ 发现 tool_calls
TOOL_CALL_ACCUMULATING
  ↓ finish_reason = tool_calls
TOOL_EXECUTING
  ↓
TOOL_RESULT_APPENDING
  ↓
MODEL_STREAMING
  ↓ finish_reason = stop
COMPLETED
```

异常状态：`MODEL_ERROR`、`TOOL_ERROR`、`INVALID_TOOL_ARGUMENTS`、`MAX_STEPS_EXCEEDED`、`CONFIRMATION_REQUIRED`、`CLIENT_DISCONNECTED`。

最大循环次数由 `AGENT_MAX_STEPS` 控制，默认 6。

## Tool Call 累积

DeepSeek 会把 Tool Call 拆成多个 chunk：第一段可能包含 id、type、name，后续段追加 arguments。后端按 `toolCall.index` 累积：

```ts
type PendingToolCall = {
  index: number
  id: string
  name: string
  arguments: string
}
```

规则：

- 不能收到第一段参数就执行工具。
- 等完整参数后再解析 JSON。
- 参数解析失败发送 `error` 事件。
- 工具名称必须白名单校验。
- 工具参数必须 Schema 校验。

## SSE 事件

```text
meta
intent
tool_call_start
tool_call_delta
tool_call_ready
tool_start
tool_result
token
confirmation_required
done
error
```

示例：

```text
event: tool_call_start
data: {"index":0,"id":"call_123","name":"create_todo"}

event: tool_call_ready
data: {"id":"call_123","name":"create_todo","arguments":{"title":"学习 Agent"}}

event: tool_result
data: {"name":"create_todo","result":{"id":12,"title":"学习 Agent"}}

event: token
data: {"text":"已创建 Todo"}
```

## 多轮消息

工具执行后，必须将 assistant Tool Call 和 tool result 放回上下文：

```json
{
  "role": "assistant",
  "content": "",
  "tool_calls": [{
    "id": "call_123",
    "type": "function",
    "function": {
      "name": "create_todo",
      "arguments": "{\"title\":\"学习 Agent\"}"
    }
  }]
}
```

```json
{
  "role": "tool",
  "tool_call_id": "call_123",
  "content": "{\"id\":12,\"title\":\"学习 Agent\"}"
}
```

`assistant.content` 统一使用空字符串而不是 null；`tool_call_id` 必须对应；历史裁剪不能拆开 Tool Call 和 Tool Result。

## 人工确认

`delete_todo` 不能直接执行：

```text
模型请求 delete_todo
  ↓
创建 confirmation record
  ↓
发送 confirmation_required
  ↓
前端展示确认按钮
  ↓
POST /api/assistant/confirm
  ↓
再次校验 JWT 和资源归属
  ↓
执行删除
  ↓
继续 Agent Loop
```

确认记录绑定用户、工具和参数，设置过期时间，并且只能消费一次。客户端不能修改待确认参数。

## Conversation History

流式接口支持：

```json
{
  "conversationId": 1,
  "message": "把刚才创建的任务删除"
}
```

保存：user message、assistant tool call、tool result、assistant final message。

## 前端状态

```ts
type StreamTrace = {
  status: 'idle' | 'streaming' | 'waiting_confirmation' | 'completed' | 'error'
  intent?: string
  toolCalls: Array<{
    id: string
    name: string
    arguments: string
    status: 'streaming' | 'ready' | 'executing' | 'completed'
    result?: unknown
  }>
  answer: string
  sources: string[]
}
```

前端处理：`token` 追加文本，`tool_call_delta` 更新参数，`tool_result` 标记工具完成，`confirmation_required` 暂停并展示确认按钮，`done` 结束 loading，`error` 提供重试。

## 失败处理

| 场景 | 处理 |
|---|---|
| LLM 请求失败 | 发送 error，关闭流 |
| 参数 JSON 无效 | 不执行工具，发送 error |
| 工具不存在 | 拒绝执行，发送 error |
| 工具执行失败 | 发送 tool error |
| 超过最大步数 | 发送 MAX_STEPS_EXCEEDED |
| 客户端断开 | 取消上游 fetch，释放 reader |
| 用户未确认删除 | 保持暂停，不执行删除 |

## 验收标准

- 输入“创建一个 Todo：学习 Agent”时调用 create_todo，工具执行成功，最终回答流式显示。
- 输入“查看未完成任务”时调用 list_todos，工具结果回传后生成最终回答。
- 输入“删除 Todo 12”时只出现 confirmation_required，不直接删除。
- 输入“你好”时不调用工具，直接流式返回文本。
- 第二轮使用“它”引用上一轮 Todo 时，模型能使用 Conversation History 正确判断。

## 实现顺序

1. 抽取共享 Tool Registry。
2. 实现 Tool Call 累积器。
3. 实现工具执行和 Tool Result 回传。
4. 实现多轮流式 Agent Loop。
5. 接入 delete_todo 人工确认。
6. 接入 Conversation History 保存。
7. 更新 SSE 事件和前端调试面板。
8. 增加失败、重连和客户端断开测试。

