# RBAC + Todo 资源权限学习指南

本文基于当前 `todo-api` 的真实代码，解释 Authentication、Authorization、RBAC 和 Todo 资源归属是如何串起来的。

## 1. 先区分两个概念

### Authentication：你是谁

Authentication（认证）负责确认请求来自哪个用户。

本项目使用：

```text
email + password
        ↓
      bcrypt
        ↓
      JWT
        ↓
Authorization: Bearer <token>
```

对应代码：

- `src/services/auth.service.ts`：注册、登录、密码 hash、密码比较
- `src/utils/jwt.ts`：签发和验证 JWT
- `src/middlewares/auth.middleware.ts`：从请求头读取 Token 并生成 `req.user`

### Authorization：你能做什么

Authorization（授权）负责判断已经确认身份的用户是否有权限访问某个功能或资源。

本项目的授权有两层：

```text
角色权限：USER / ADMIN
资源权限：Todo 是否属于当前用户
```

只有登录成功并产生 `req.user` 后，才能进行授权判断。

## 2. 数据模型

当前 Prisma 模型的关键字段：

```prisma
enum Role {
  USER
  ADMIN
}

model User {
  id       Int    @id @default(autoincrement())
  email    String @unique
  password String
  role     Role   @default(USER)
  todos    Todo[]
}

model Todo {
  id        Int  @id @default(autoincrement())
  title     String
  completed Boolean @default(false)
  userId    Int
  user      User @relation(fields: [userId], references: [id])
}
```

其中 `Todo.userId` 是资源归属字段：

```text
Todo.userId = Todo 属于哪个 User
```

没有 `userId`，系统就无法可靠地判断 Todo 是否属于当前用户。

## 3. JWT 中保存什么

登录成功时，当前项目生成的 Payload 类似：

```json
{
  "sub": 2,
  "role": "USER"
}
```

- `sub`：用户 ID（subject）
- `role`：用户角色
- 不保存密码或密码 hash
- Secret 从 `JWT_SECRET` 环境变量读取
- 有效期由 `JWT_EXPIRES_IN` 控制，默认 `1h`

JWT 只证明“这个 Token 声称代表谁”，服务端仍然负责验证签名、有效期和 Payload 格式。

## 4. `req.user` 如何产生

Todo 路由统一经过：

```ts
router.get("/", authMiddleware, todoController.getAll);
```

请求：

```http
GET /api/todos
Authorization: Bearer <token>
```

执行过程：

```text
Authorization Header
        ↓
authMiddleware
        ↓
jwt.verify()
        ↓
{ id: 2, role: "USER" }
        ↓
req.user
        ↓
Todo Controller / Service
```

`req.user` 不是客户端直接传来的普通请求字段，而是后端通过可信 JWT 验证后写入的身份上下文。

## 5. 401、403、404 的区别

### 401 Unauthorized

请求没有完成身份认证：

- 没有 Authorization Header
- Header 格式错误
- Token 无效
- Token 过期

示例：

```json
{
  "message": "Invalid or expired token"
}
```

### 403 Forbidden

用户已经登录，但角色不允许执行某项操作。

例如：

```text
req.user.role = USER
访问 ADMIN-only API
```

结果：

```http
403 Forbidden
```

### 404 Not Found

资源不存在，或者资源属于其他用户。

本项目对 Todo 使用统一 404，避免告诉普通用户“这个 Todo 属于另一个用户”，从而减少资源枚举风险。

## 6. RBAC 是什么

RBAC 是 Role-Based Access Control，即基于角色的访问控制。

当前角色：

| 角色 | 含义 |
|---|---|
| `USER` | 普通用户，只能访问自己的 Todo |
| `ADMIN` | 管理员，可以访问所有 Todo |

角色 Middleware 的基本形式是：

```ts
requireRole("ADMIN")
```

当前 `requireRole` 的职责只有角色判断：

```text
未认证 → 401
已认证但角色不匹配 → 403
角色匹配 → next()
```

RBAC 适合判断“能否访问某类功能”，但不能单独解决 Todo 这种资源归属问题。

## 7. Todo 资源权限

### USER 查询列表

Service 会自动添加当前用户 ID：

```ts
const scoped = user.role === "ADMIN"
  ? query
  : { ...query, userId: user.id };
```

普通用户的查询实际相当于：

```sql
SELECT * FROM todos
WHERE userId = 当前登录用户.id
```

管理员则不添加 `userId` 限制：

```sql
SELECT * FROM todos
```

### USER 创建 Todo

Controller 不信任客户端传来的 `userId`，而是使用：

```ts
todoService.create({
  ...result.data,
  userId: req.user!.id,
});
```

因此客户端应该只发送：

```json
{
  "title": "学习 RBAC"
}
```

真正的 owner 来自 Token 对应的 `req.user.id`。

### USER 查询单个 Todo

普通用户查询时同时使用两个条件：

```text
Todo id
当前用户 id
```

如果 Todo 属于其他用户，查询不到，Controller 返回 404。

### USER 更新和删除

更新和删除也会携带 owner 条件：

```text
USER：WHERE id = ? AND userId = 当前用户
ADMIN：WHERE id = ?
```

这样避免只根据 Todo ID 操作其他用户资源。

## 8. 分层职责

```text
Route
  ↓ 认证 Middleware
Controller
  ↓ 读取参数、校验输入、读取 req.user
Service
  ↓ 判断 USER / ADMIN、构造资源权限范围
Repository
  ↓ 执行 Prisma 查询
SQLite
```

### Route

负责组合 URL、Middleware 和 Controller：

```ts
router.put("/:id", authMiddleware, todoController.update);
```

### Middleware

负责横切能力：

- 验证身份
- 解析 JWT
- 写入 `req.user`
- 判断角色

### Controller

负责 HTTP 层：

- 读取 Request
- 参数校验
- 调用 Service
- 返回 Response

Controller 不应该信任客户端的 `userId`，也不应该复制复杂权限逻辑。

### Service

负责业务规则：

- USER 和 ADMIN 的差异
- 生成用户作用域
- 组合查询条件
- 调用 Repository

### Repository

只负责数据库访问：

- `findMany`
- `findUnique`
- `create`
- `update`
- `delete`

## 9. 推荐验证实验

### 实验一：普通用户只能看到自己的 Todo

准备 User A、User B，分别创建 Todo。

User A：

```http
GET /api/todos
Authorization: Bearer <USER_A_TOKEN>
```

预期：只能看到 User A 的 Todo。

### 实验二：普通用户越权读取

```http
GET /api/todos/<USER_B_TODO_ID>
Authorization: Bearer <USER_A_TOKEN>
```

预期：

```http
404 Not Found
```

### 实验三：管理员查看全部

```http
GET /api/todos
Authorization: Bearer <ADMIN_TOKEN>
```

预期：可以看到 User A、User B 和管理员自己的 Todo。

### 实验四：客户端伪造 userId

```http
POST /api/todos
Authorization: Bearer <USER_A_TOKEN>
Content-Type: application/json

{
  "title": "伪造 owner",
  "userId": 999
}
```

预期：Todo 仍然归属 User A，因为后端使用 `req.user.id`。

### 实验五：Token 错误

```http
GET /api/todos
Authorization: Bearer invalid-token
```

预期：`401 Invalid or expired token`。

## 10. 学习时最重要的安全原则

1. 不要相信客户端传来的 `userId`。
2. 不要只在前端做权限控制。
3. 角色权限和资源归属是两种不同的检查。
4. 资源查询、更新、删除都必须考虑 owner 条件。
5. 对无权访问的资源返回统一 404，可以降低资源枚举风险。
6. JWT 中不要保存密码、密码 hash 或敏感个人信息。
7. 401 表示没有完成认证，403 表示认证成功但权限不足。
8. 权限判断应该尽量靠近 Service/Repository，而不是散落在 Controller。

## 11. 当前项目的学习观察点

- `requireRole` 已具备通用 RBAC Middleware 形式，但当前 Todo 路由主要使用资源 owner 隔离。
- Todo 资源权限由 `todo.service.ts` 决定，Repository 执行最终带作用域的查询。
- 注册接口只接收 `name`、`email`、`password`，角色由数据库默认设置为 `USER`。
- 管理员账号可以看到历史迁移数据，历史 Todo 已在 migration 中归属到迁移管理员。
- 前端使用 JWT 保存登录状态，后端仍是最终权限判定方。
