# Todo Agent Evaluation Phase 2 规格

## 1. 背景

Phase 1 已完成 Fake LLM 驱动的 Agent Evaluation 基础能力，覆盖 Tool Calling、基础参数生成、人工确认、多轮上下文、认证用户传递和 Agent 最大步数。

Phase 2 补充真实数据库集成测试、SSE 事件顺序测试、Conversation 权限隔离和评估报告生成，使测试集能够验证完整请求链路和可发布质量门槛。

本阶段不接入真实 DeepSeek 作为自动化测试依赖，不修改生产权限策略，不改变现有 API 响应契约，除非测试暴露出明确的安全或一致性缺陷。

## 2. 目标

完成以下四类能力：

1. 使用隔离的真实 SQLite/Prisma 数据库验证 Todo 工具最终状态。
2. 使用可控的 Fake LLM 流响应验证 SSE 事件完整性和顺序。
3. 验证 Conversation、Message、Confirmation 和 Todo 均不能跨用户访问。
4. 输出机器可读和人可读的 Evaluation Report，支持 CI 设定质量门槛。

## 3. 技术约束

- 测试运行器继续使用 Node 内置 node:test 和项目现有 tsx。
- 数据库使用独立测试数据库文件，禁止读写开发数据库 dev.db 或生产数据。
- LLM 使用 Fake LLM；每次调用通过脚本返回固定响应。
- SSE 测试通过本地 HTTP 请求读取完整 event-stream，不依赖浏览器。
- 不新增依赖，除非现有 Node、TypeScript 或项目运行时无法实现目标；新增依赖前需要确认。
- 每个测试必须清理自己的数据和 pending confirmation。

## 4. 测试环境和夹具

### 用户

- user-a：普通用户，拥有 Todo A 和 Conversation A。
- user-b：普通用户，拥有 Todo B 和 Conversation B。
- admin-a：管理员，用于验证管理员策略，不默认视为可以绕过所有资源限制。

### Todo

- user-a：学习 Agent、跑步 30 分钟。
- user-b：完成周报。

### Conversation

- conversation-a：归属于 user-a，包含 user-a 的消息和工具结果。
- conversation-b：归属于 user-b，包含 user-b 的消息和工具结果。

夹具应返回稳定对象 ID，测试不能依赖自增 ID 的偶然顺序。每个测试开始前重置相关表或使用唯一测试命名空间。

## 5. 真实数据库集成测试

### 5.1 测试边界

集成测试保留真实的以下组件：

- Prisma Client。
- Todo Repository 和 Todo Service。
- Conversation Service。
- Confirmation Store。
- Agent Tool Executor。

只替换以下组件：

- LLM Client 替换为 Fake LLM。
- 测试配置中的数据库路径替换为隔离数据库。

### 5.2 必测场景

| 编号 | 场景 | 断言 |
| --- | --- | --- |
| DB-001 | create_todo 成功 | Todo 写入数据库，userId 为认证用户，标题和默认 completed 正确 |
| DB-002 | list_todos | 只返回当前用户的 Todo，total 和列表一致 |
| DB-003 | list_todos completed=false | 只返回未完成 Todo |
| DB-004 | delete_todo 请求 | 只创建 pending confirmation，数据库仍存在目标 Todo |
| DB-005 | 确认删除 | 目标 Todo 被删除，其他用户 Todo 不受影响 |
| DB-006 | 重复确认 | 第二次确认失败，数据库不会再次变化 |
| DB-007 | 跨用户删除 | user-a 不能删除 user-b 的 Todo，数据库状态保持不变 |
| DB-008 | 非法参数 | 不写入数据库，并返回结构化 validation 错误 |

### 5.3 数据库验收要求

- 测试结束后不污染开发数据库。
- 失败测试可以输出测试数据库路径和数据快照摘要。
- 数据库断言必须检查写入、未写入和不应变化的记录。
- 缓存存在时，测试必须清空或隔离缓存，避免缓存结果掩盖数据库状态。

## 6. SSE 事件顺序测试

### 6.1 正常查询/创建流程

非确认的 Tool Calling 流程至少应产生以下有序事件：

1. meta。
2. intent 或等价的模型决策事件。
3. tool_call_start。
4. 一个或多个 tool_call_delta。
5. tool_call_ready。
6. tool_start。
7. tool_result。
8. 一个或多个 token，允许最终回答为空但必须有明确结束状态。
9. done。

允许增加诊断事件，但不能改变核心事件的先后关系。

### 6.2 删除确认流程

删除请求必须满足：

- tool_call_ready 出现在 tool_start 之前。
- tool_result 表示 confirmation required，而不是删除成功。
- confirmation_required 出现在 done 之前。
- 数据库在整个请求结束时仍保留 Todo。
- 不得发送表示 delete success 的事件。

确认请求必须是独立请求，并满足：

- 返回成功或明确失败事件。
- 成功确认后数据库才删除 Todo。
- confirmationId 只能消费一次。

### 6.3 异常流程

至少覆盖：

- Fake LLM 返回非法 JSON。
- Fake LLM 返回未知工具。
- 工具执行失败。
- Agent 超过最大步数。
- 客户端提前断开连接。

异常流程应发送可解析的错误信息或以明确 HTTP 错误结束，不能发送多个 done，也不能静默返回成功。

## 7. Conversation 权限隔离

### 7.1 读隔离

| 编号 | 场景 | 预期 |
| --- | --- | --- |
| CONV-001 | user-a 读取 conversation-a | 成功返回自己的消息 |
| CONV-002 | user-a 读取 conversation-b | 404 或统一无权限错误，不泄露内容 |
| CONV-003 | user-a 列出会话 | 不出现 user-b 的会话 |
| CONV-004 | user-a 删除 conversation-b | 删除失败，conversation-b 保持不变 |
| CONV-005 | 使用 user-b Token 访问 user-a 的 confirmation | 失败且不泄露 Todo 信息 |

### 7.2 写隔离

- 添加消息时必须校验 Conversation 所属用户。
- Agent 使用历史消息时只能加载当前用户的 Conversation。
- 请求体中的 conversationId 不能覆盖认证用户边界。
- 工具结果写入的 toolName、toolArguments、toolResult 必须属于当前会话。
- 不能通过猜测 ID、修改请求体 userId 或伪造历史消息绕过隔离。

### 7.3 历史消息合法性

测试必须断言传入 LLM 的每个消息满足：

- role 是允许值。
- content 是字符串，或在协议允许时是合法内容列表。
- tool_calls 的 arguments 是合法 JSON 字符串。
- 不包含 undefined、循环对象、数据库实体对象或未序列化异常。

## 8. Evaluation Report

### 8.1 输出文件

建议生成：

- test-results/agent-evaluation.json：机器可读明细。
- test-results/agent-evaluation.md：人可读摘要。

输出目录应加入 .gitignore，不提交带有用户数据、Token 或真实请求内容的报告。

### 8.2 JSON 结构

报告至少包含：

- generatedAt。
- suiteVersion。
- totalCases、passed、failed、skipped。
- score 和 scoreByCategory。
- gates：toolSelection、confirmationSafety、authorization、loopTermination。
- cases：caseId、category、status、durationMs、score、failureReason、traceSummary。

traceSummary 只能包含脱敏后的工具名、参数字段名、事件名和错误代码，不保存 Authorization、LLM API Key、完整历史消息或隐私内容。

### 8.3 评分规则

- Tool Calling 和工具选择：25 分。
- 参数生成：20 分。
- 数据库执行状态：20 分。
- 确认和权限安全：20 分。
- 最终回答：10 分。
- SSE/Loop 完整性：5 分。

发布门槛：

- 总分不低于 90 分。
- authorization gate 通过率 100%。
- confirmation safety gate 通过率 100%。
- loop termination gate 通过率 100%。
- 不允许出现跨用户数据泄露、确认绕过或误删。

## 9. 推荐目录结构

    test/agent-evaluation/
      fixtures/
        database.ts
        users.ts
        todos.ts
        conversations.ts
      fake-llm/
        scripted-model.ts
        streaming-model.ts
      integration/
        todo-database.test.ts
        confirmation-database.test.ts
      security/
        conversation-isolation.test.ts
        todo-isolation.test.ts
      streaming/
        sse-events.test.ts
      report/
        evaluator.ts
        report-writer.ts
      agent-evaluation.test.ts

## 10. 实现顺序

1. 增加隔离数据库测试夹具和 teardown。
2. 将真实 Tool Executor 接入数据库集成测试。
3. 增加 Conversation 读写权限测试。
4. 抽取 SSE 事件解析器和事件顺序断言器。
5. 增加查询、创建、删除确认和异常流式场景。
6. 编写评分器和 JSON/Markdown 报告输出。
7. 增加 npm scripts：test:agent:integration、test:agent:stream、test:agent:report。
8. 执行完整测试和 TypeScript、格式化检查。

## 11. 验收标准

- 真实数据库集成测试不依赖开发数据库和真实 LLM。
- Todo 创建、查询、删除确认和权限隔离均有最终数据库状态断言。
- SSE 流可以验证核心事件顺序、结束事件唯一性和异常结束状态。
- Conversation 和 Message 不能跨用户读取、写入、删除或作为 Agent 上下文。
- Evaluation Report 同时支持 JSON 和 Markdown，且不包含 Token 或隐私消息。
- CI 可以根据评分和四个安全门禁决定通过或失败。
- 现有 Phase 1 的 8 个测试继续通过。

## 12. 边界

### 始终执行

- 使用隔离数据库。
- 断言数据库最终状态。
- 记录脱敏 Trace。
- 运行 TypeScript、格式化和 Agent Evaluation 测试。

### 需要确认

- 引入新的测试依赖。
- 修改 Prisma schema 或数据库迁移。
- 改变现有 API 错误码和 SSE 事件协议。
- 将真实 DeepSeek 回归测试设为 CI 阻断项。

### 禁止执行

- 提交 API Key、JWT 或完整用户会话内容。
- 使用开发数据库执行破坏性测试。
- 为了通过评估而跳过权限、确认或数据库断言。
- 删除或降低 Phase 1 的测试门槛。
