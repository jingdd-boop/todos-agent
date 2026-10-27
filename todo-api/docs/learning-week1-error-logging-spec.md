# Todo API 第一周学习 Spec：异常处理与日志

## 1. 学习目标

本周只学习两个主题：

```text
异常处理
日志与请求链路追踪
```

完成后应能理解并实现：

1. 业务异常和系统异常的区别。
2. 401、403、404、409、422、500 的使用场景。
3. 为什么应该使用统一 Error Middleware。
4. 为什么不能把数据库原始错误直接返回给客户端。
5. 如何为每个请求生成 requestId。
6. 如何记录请求方法、路径、状态码、耗时和用户身份。
7. 如何通过 requestId 把请求日志和错误日志关联起来。
8. 如何避免日志泄露密码、JWT 和敏感信息。

## 2. 当前项目现状

当前项目已经有：

```text
src/errors/app-error.ts
src/errors/not-found-error.ts
src/middlewares/error.middleware.ts
src/middlewares/logger.middleware.ts
```

当前存在的问题：

1. `logger.middleware.ts` 重复打印相同日志。
2. 日志没有状态码和耗时。
3. 日志没有 requestId，无法关联一次请求的所有行为。
4. Error 响应格式不够统一。
5. Prisma 数据库错误没有统一转换。
6. 错误日志没有区分开发环境和生产环境。
7. 当前日志不能明确标识当前登录用户和角色。
8. 日志中禁止出现密码、密码 hash、JWT 完整内容。

## 3. 本周改造边界

本周允许修改：

```text
src/errors/
src/middlewares/
src/app.ts
src/controllers/ 中与错误返回直接相关的代码
src/repositories/ 中需要识别 Prisma 错误的代码
```

本周暂不实现：

```text
❌ Redis
❌ 缓存
❌ 并发控制
❌ Refresh Token
❌ 复杂日志平台
❌ 微服务
❌ 数据库切换
```

遵循最小改动原则，不删除历史 migration、数据库文件或旧 Repository 文件。

## 4. 第一部分：统一异常处理

### 4.1 错误分类

建议使用以下错误体系：

```text
AppError
├── BadRequestError       400
├── UnauthorizedError     401
├── ForbiddenError        403
├── NotFoundError         404
└── ConflictError         409
```

### 4.2 错误类型职责

| 错误类型 | 状态码 | 使用场景 |
|---|---:|---|
| BadRequestError | 400 | 参数格式错误、非法 ID、非法分页 |
| UnauthorizedError | 401 | 未登录、Token 无效、Token 过期 |
| ForbiddenError | 403 | 已登录但角色无权限 |
| NotFoundError | 404 | 资源不存在或用户无权看到资源 |
| ConflictError | 409 | 邮箱重复、资源状态冲突 |
| 未知异常 | 500 | 未预期的系统错误 |

### 4.3 统一错误响应

错误响应统一为：

```json
{
  "success": false,
  "error": {
    "code": "TODO_NOT_FOUND",
    "message": "Todo not found",
    "requestId": "req_abc123"
  }
}
```

字段说明：

- `success`：固定为 `false`。
- `error.code`：稳定的机器可读错误码。
- `error.message`：给客户端和开发者阅读的消息。
- `error.requestId`：用于关联服务端日志。

生产环境不要返回：

```text
数据库 SQL
文件路径
堆栈详情
密码 hash
JWT Secret
```

### 4.4 错误码建议

```text
AUTH_REQUIRED
INVALID_TOKEN
FORBIDDEN
VALIDATION_FAILED
USER_ALREADY_EXISTS
TODO_NOT_FOUND
INVALID_TODO_ID
INVALID_PAGINATION
DATABASE_ERROR
INTERNAL_ERROR
```

### 4.5 Prisma 错误转换

至少识别以下错误：

```text
P2002：唯一约束冲突
P2025：目标记录不存在
```

转换示例：

```text
P2002
  ↓
409 Conflict
  ↓
USER_ALREADY_EXISTS
```

```text
P2025
  ↓
404 Not Found
  ↓
TODO_NOT_FOUND
```

不要把 Prisma 原始错误直接作为 HTTP 响应返回。

## 5. 第二部分：requestId

### 5.1 生成规则

每个请求进入应用时生成唯一 requestId：

```text
req_<随机字符串>
```

如果客户端已经传入：

```http
X-Request-Id: client-request-id
```

可以复用该值，但必须限制长度并避免注入换行符。

### 5.2 请求上下文

建议扩展 Request 类型：

```ts
interface RequestContext {
  requestId: string;
  userId?: number;
  role?: "USER" | "ADMIN";
}
```

至少保证：

```ts
req.requestId
```

在 Logger Middleware 和 Error Middleware 中可访问。

### 5.3 响应头

每个响应都返回：

```http
X-Request-Id: req_abc123
```

这样前端、Apifox 和服务端日志可以使用同一个 ID 排查问题。

## 6. 第三部分：结构化日志

### 6.1 请求日志格式

请求完成后至少记录：

```json
{
  "level": "info",
  "event": "http.request.completed",
  "requestId": "req_abc123",
  "method": "GET",
  "path": "/api/todos",
  "statusCode": 200,
  "durationMs": 18,
  "userId": 2,
  "role": "USER"
}
```

### 6.2 错误日志格式

```json
{
  "level": "error",
  "event": "http.request.failed",
  "requestId": "req_abc123",
  "method": "POST",
  "path": "/api/auth/login",
  "statusCode": 401,
  "errorCode": "INVALID_TOKEN",
  "message": "Invalid email or password",
  "durationMs": 12
}
```

### 6.3 日志级别

```text
DEBUG：开发调试信息
INFO：正常请求、登录成功、资源创建
WARN：Token 错误、业务冲突、非法请求
ERROR：未预期异常、数据库异常、系统错误
```

### 6.4 日志安全规则

禁止日志记录：

```text
password
password hash
Authorization Header 完整内容
JWT 完整内容
JWT_SECRET
DATABASE_URL 中的敏感凭据
```

可以记录：

```text
userId
role
email 是否存在
Token 是否有效
错误码
requestId
```

但登录失败时不要记录完整密码。

## 7. Middleware 顺序

建议顺序：

```text
dotenv
  ↓
requestIdMiddleware
  ↓
CORS
  ↓
express.json
  ↓
loggerMiddleware
  ↓
authMiddleware（仅受保护路由）
  ↓
routes
  ↓
404 Middleware
  ↓
errorMiddleware
```

注意：Error Middleware 必须放在所有路由之后。

## 8. 一周执行计划

### Day 1：认识错误边界

任务：

1. 阅读 `AppError`、`NotFoundError`、`errorMiddleware`。
2. 区分业务错误和未知系统错误。
3. 记录当前所有接口的错误状态码。
4. 修复 `NotFoundError` 的默认错误消息。

验收：能够说明每个接口可能返回的 400、401、403、404、409、500。

### Day 2：统一错误类型和响应

任务：

1. 增加 400、401、403、409 错误类。
2. 增加统一错误码。
3. 让 Error Middleware 输出统一结构。
4. 保留开发环境的服务端日志，但不把堆栈返回给客户端。

验收：所有错误响应都包含 `success`、`error.code`、`error.message`。

### Day 3：Prisma 异常转换

任务：

1. 模拟重复邮箱注册。
2. 模拟更新不存在的 Todo。
3. 识别 Prisma `P2002` 和 `P2025`。
4. 转换为项目自己的错误类型。

验收：客户端不再看到 Prisma 原始错误字符串。

### Day 4：requestId 和请求日志

任务：

1. 增加 requestId Middleware。
2. 响应增加 `X-Request-Id`。
3. Logger 记录请求开始和完成。
4. 记录状态码、耗时、用户 ID 和角色。
5. 删除当前重复日志。

验收：一次请求可以通过 requestId 找到对应的完成日志或错误日志。

### Day 5：验证和复盘

任务：

1. 用 Apifox 验证全部异常场景。
2. 用 curl 保存成功和失败响应。
3. 编写本周学习总结。
4. 整理一份错误码表和日志字段表。

验收：能够独立解释一次请求从进入 Middleware 到错误响应的完整链路。

## 9. 测试清单

### 认证异常

```text
[ ] 没有 Authorization → 401 AUTH_REQUIRED
[ ] Authorization 格式错误 → 401
[ ] 无效 Token → 401 INVALID_TOKEN
[ ] 过期 Token → 401 INVALID_TOKEN
[ ] 普通用户调用管理员接口 → 403 FORBIDDEN
```

### 参数异常

```text
[ ] name 太短 → 400 VALIDATION_FAILED
[ ] password 太短 → 400 VALIDATION_FAILED
[ ] page 小于 1 → 400 INVALID_PAGINATION
[ ] pageSize 大于 100 → 400 INVALID_PAGINATION
[ ] Todo ID 非数字 → 400 INVALID_TODO_ID
```

### 资源异常

```text
[ ] Todo 不存在 → 404 TODO_NOT_FOUND
[ ] USER 访问其他用户 Todo → 404 TODO_NOT_FOUND
[ ] 重复 email → 409 USER_ALREADY_EXISTS
```

### 日志验证

```text
[ ] 每个请求都有 requestId
[ ] 响应有 X-Request-Id
[ ] 日志有 method、path、statusCode、durationMs
[ ] 登录失败日志不包含 password
[ ] 日志不包含完整 JWT
[ ] 错误响应和错误日志 requestId 一致
```

## 10. 完成标准

本周完成必须满足：

```text
[ ] 错误类型有明确层次
[ ] 错误响应结构统一
[ ] Prisma P2002/P2025 有转换
[ ] 每个请求有 requestId
[ ] 响应返回 X-Request-Id
[ ] 日志记录请求状态和耗时
[ ] 日志记录用户上下文但不泄露敏感信息
[ ] 401 / 403 / 404 / 409 行为可验证
[ ] 现有认证和 Todo 功能继续正常
[ ] 没有删除 migration、数据库文件或旧业务代码
```

## 11. 学习后的自测问题

1. 为什么错误处理要集中在 Error Middleware？
2. 业务错误和未知错误有什么区别？
3. 为什么重复邮箱最终要依靠数据库唯一约束？
4. 为什么错误响应需要 requestId？
5. 为什么不能把 JWT 写入日志？
6. 401 和 403 分别表示什么？
7. 为什么 Todo 越权访问返回 404 更安全？
8. 为什么日志 Middleware 需要在响应结束时记录状态码？
9. 如果数据库连接失败，客户端应该看到什么，服务端日志应该记录什么？
10. 如果同一个 requestId 出现多条日志，如何判断请求执行到了哪一步？
