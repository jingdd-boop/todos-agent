# Todo API 认证与鉴权技术 Spec

## 1. 文档信息

* 项目：todo-api
* 技术栈：Node.js + TypeScript + Express + Prisma + SQLite
* 当前阶段：Authentication & Authorization
* 本次目标：

  * 用户注册
  * 用户登录
  * bcrypt 密码哈希
  * JWT 身份认证
  * JWT Middleware
  * RBAC 角色控制
  * Todo 用户数据隔离
  * 统一 401 / 403 错误处理

---

# 2. 当前项目架构

当前项目采用分层架构：

```text
src/
├── controllers/
├── errors/
├── lib/
├── middlewares/
├── repositories/
├── routes/
├── schemas/
├── services/
├── types/
├── utils/
├── app.ts
├── database.ts
└── server.ts
```

核心调用链：

```text
HTTP Request
    ↓
Route
    ↓
Middleware
    ↓
Controller
    ↓
Service
    ↓
Repository
    ↓
Prisma
    ↓
SQLite
```

本次认证系统必须遵循现有分层结构。

禁止为了实现认证功能而整体改造项目架构。

---

# 3. 本次改造目标

需要增加完整的认证与鉴权能力：

```text
                    Client
                       │
                       ↓
                POST /auth/register
                       │
                       ↓
                   Register
                       │
                 bcrypt hash
                       │
                       ↓
                    User
```

登录：

```text
Client
  │
  ↓
POST /auth/login
  │
  ↓
验证 email/password
  │
  ↓
bcrypt.compare
  │
  ↓
生成 JWT
  │
  ↓
返回 token
```

后续请求：

```text
Client
  │
  │ Authorization: Bearer <JWT>
  ↓
Auth Middleware
  │
  ├── Token 不存在 → 401
  ├── Token 无效 → 401
  └── Token 有效
          ↓
       req.user
          ↓
    Authorization
          │
     ┌────┴────┐
     ↓         ↓
   USER      ADMIN
     ↓         ↓
自己的 Todo   所有 Todo
```

---

# 4. 数据模型调整

## 4.1 Role

在 `prisma/schema.prisma` 增加：

```prisma
enum Role {
  USER
  ADMIN
}
```

---

## 4.2 User

将 User 模型调整为：

```prisma
model User {
  id        Int      @id @default(autoincrement())
  name      String
  email     String   @unique
  password  String
  role      Role     @default(USER)
  createdAt DateTime @default(now())

  todos Todo[]
}
```

要求：

1. `email` 必须唯一。
2. `password` 保存 bcrypt hash。
3. 禁止保存明文密码。
4. 新注册用户默认角色必须是 `USER`。
5. 注册接口不允许客户端传入 `role`。
6. `role` 不允许通过普通用户注册接口修改。

---

# 5. Prisma Migration

修改 Schema 后执行：

```bash
npx prisma migrate dev --name add-auth
npx prisma generate
```

不要直接修改数据库文件。

不要删除现有 migration。

如果现有数据库数据导致 migration 无法执行，应停止修改并报告问题，不要自行删除数据库。

---

# 6. 新增文件

本次认证功能需要增加：

```text
src/
├── controllers/
│   └── auth.controller.ts
│
├── middlewares/
│   └── auth.middleware.ts
│
├── repositories/
│   └── user.repository.ts
│
├── routes/
│   └── auth.routes.ts
│
├── schemas/
│   └── auth.schema.ts
│
├── services/
│   └── auth.service.ts
│
├── types/
│   └── auth.ts
│
└── utils/
    └── jwt.ts
```

如果已有对应文件，应优先修改，而不是重复创建。

---

# 7. 依赖

增加：

```bash
pnpm add bcrypt jsonwebtoken
```

TypeScript 类型：

```bash
pnpm add -D @types/bcrypt @types/jsonwebtoken
```

不要引入 Passport、Auth0、Clerk 等第三方认证框架。

当前阶段使用：

```text
bcrypt + jsonwebtoken
```

实现认证。

---

# 8. 环境变量

`.env` 增加：

```env
JWT_SECRET="your-super-secret-key"
JWT_EXPIRES_IN="1h"
```

要求：

1. JWT Secret 必须从环境变量读取。
2. 禁止将 JWT Secret 硬编码在源码中。
3. `.env` 不得提交到 Git。
4. 如果项目已有 `.env.example`，同步增加：

```env
JWT_SECRET=
JWT_EXPIRES_IN=1h
```

---

# 9. Auth Schema

文件：

```text
src/schemas/auth.schema.ts
```

实现：

```ts
import { z } from "zod";

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "name must be at least 2 characters")
    .max(50, "name must be less than 50 characters"),

  email: z
    .email(),

  password: z
    .string()
    .min(6, "password must be at least 6 characters")
    .max(100, "password must be less than 100 characters"),
});

export const loginSchema = z.object({
  email: z.email(),

  password: z
    .string()
    .min(1, "password is required"),
});
```

注册 Schema 不允许：

```json
{
  "role": "ADMIN"
}
```

作为合法注册字段。

---

# 10. User Repository

文件：

```text
src/repositories/user.repository.ts
```

至少提供：

```ts
create(data)
findByEmail(email)
findById(id)
```

建议：

```ts
export const userRepository = {
  async create(data: {
    name: string;
    email: string;
    password: string;
  }) {
    return prisma.user.create({
      data,
    });
  },

  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: {
        email,
      },
    });
  },

  async findById(id: number) {
    return prisma.user.findUnique({
      where: {
        id,
      },
    });
  },
};
```

Repository 只负责数据库访问。

Repository 不负责：

* JWT
* bcrypt
* HTTP Response
* 权限判断

---

# 11. Auth Service

文件：

```text
src/services/auth.service.ts
```

Auth Service 负责：

```text
注册
登录
密码 Hash
密码验证
JWT 生成
```

---

## 11.1 Register

流程：

```text
register
   ↓
findByEmail
   ↓
用户已存在？
   ├── YES → 抛出业务错误
   └── NO
        ↓
bcrypt.hash(password, 10)
        ↓
create user
        ↓
返回安全的用户信息
```

密码：

```ts
const hashedPassword = await bcrypt.hash(password, 10);
```

数据库只能保存：

```text
bcrypt hash
```

不能保存：

```text
123456
```

---

## 11.2 Register 返回值

注册成功后不要返回：

```json
{
  "password": "..."
}
```

返回：

```json
{
  "id": 1,
  "name": "张三",
  "email": "zhangsan@example.com",
  "role": "USER"
}
```

---

# 12. Login

登录流程：

```text
email
 ↓
findByEmail
 ↓
用户不存在？
 ↓
统一返回 Invalid email or password
 ↓
bcrypt.compare()
 ↓
密码错误？
 ↓
统一返回 Invalid email or password
 ↓
生成 JWT
 ↓
返回 Token
```

不要分别向客户端暴露：

```text
Email 不存在
```

或者：

```text
Password 错误
```

统一：

```text
Invalid email or password
```

避免暴露用户是否存在。

---

# 13. JWT Payload

JWT payload 使用：

```ts
{
  sub: user.id,
  role: user.role
}
```

例如：

```json
{
  "sub": 1,
  "role": "USER"
}
```

禁止将以下内容放入 JWT：

```text
password
password hash
敏感个人信息
```

JWT 有效期默认：

```text
1h
```

由：

```env
JWT_EXPIRES_IN=1h
```

控制。

---

# 14. JWT Utility

文件：

```text
src/utils/jwt.ts
```

提供：

```ts
signToken()
verifyToken()
```

职责：

```text
signToken
    ↓
生成 JWT

verifyToken
    ↓
验证 JWT
    ↓
返回 payload
```

JWT Secret 必须从：

```ts
process.env.JWT_SECRET
```

读取。

如果没有配置 Secret，应在应用启动时明确报错。

---

# 15. Auth Middleware

文件：

```text
src/middlewares/auth.middleware.ts
```

定义：

```ts
export interface AuthRequest extends Request {
  user?: {
    id: number;
    role: string;
  };
}
```

Middleware 负责：

```text
读取 Authorization
        ↓
Bearer Token
        ↓
jwt.verify()
        ↓
解析 user id / role
        ↓
写入 req.user
```

---

# 16. Authorization Header

客户端必须使用：

```http
Authorization: Bearer <token>
```

例如：

```http
GET /api/todos
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

---

# 17. Auth Middleware 错误处理

## Token 不存在

返回：

```http
401 Unauthorized
```

响应：

```json
{
  "message": "Authentication required"
}
```

---

## Authorization Header 格式错误

例如：

```http
Authorization: xxx
```

返回：

```http
401 Unauthorized
```

---

## Token 无效

返回：

```http
401 Unauthorized
```

响应：

```json
{
  "message": "Invalid or expired token"
}
```

---

## Token 过期

同样：

```http
401 Unauthorized
```

---

# 18. RBAC

实现角色：

```text
USER
ADMIN
```

定义：

```text
USER
    ↓
普通用户

ADMIN
    ↓
管理员
```

新增 Middleware：

```ts
requireRole(...roles)
```

例如：

```ts
requireRole("ADMIN")
```

---

# 19. RBAC 行为

如果：

```text
req.user.role = ADMIN
```

允许：

```text
ADMIN-only API
```

如果：

```text
req.user.role = USER
```

访问 ADMIN API：

```http
403 Forbidden
```

响应：

```json
{
  "message": "Forbidden"
}
```

注意：

```text
没有登录 → 401
登录了但没有权限 → 403
```

---

# 20. Todo API 认证要求

以下接口必须要求登录：

```http
GET    /api/todos
GET    /api/todos/:id
POST   /api/todos
PUT    /api/todos/:id
DELETE /api/todos/:id
```

统一增加：

```ts
authMiddleware
```

---

# 21. Todo 数据隔离

这是本次改造的核心需求之一。

## USER

普通用户只能访问自己的 Todo。

例如：

```text
User #1
    ↓
Todo #1
Todo #2

User #2
    ↓
Todo #3
Todo #4
```

User #1：

```http
GET /api/todos
```

只能看到：

```text
Todo #1
Todo #2
```

不能看到：

```text
Todo #3
Todo #4
```

---

# 22. ADMIN

ADMIN 可以访问所有 Todo。

例如：

```text
ADMIN
 ↓
Todo #1
Todo #2
Todo #3
Todo #4
```

---

# 23. Todo Repository 查询

Todo 查询需要根据当前用户权限生成条件。

逻辑：

```ts
if (user.role === "ADMIN") {
  where = {};
} else {
  where = {
    userId: user.id,
  };
}
```

然后与已有：

```text
completed
page
pageSize
```

查询条件组合。

例如：

```ts
where: {
  userId: user.id,
  completed: false,
}
```

ADMIN：

```ts
where: {
  completed: false,
}
```

---

# 24. Todo 创建

创建 Todo 时：

## USER

不能由客户端决定：

```json
{
  "title": "学习 JWT",
  "userId": 999
}
```

不能允许普通用户通过修改 `userId` 创建属于其他用户的 Todo。

应该使用：

```text
req.user.id
```

作为 Todo owner。

例如：

```ts
await todoRepository.create({
  title,
  userId: req.user.id,
});
```

---

# 25. Todo 更新

更新 Todo 时：

USER：

```text
只能更新自己的 Todo
```

ADMIN：

```text
可以更新所有 Todo
```

不要采用：

```text
先 findById
再 Controller 手动判断
```

然后随意 update。

推荐将 owner 条件纳入数据库查询。

例如：

```text
USER:

find todo
WHERE id = ?
AND userId = ?
```

ADMIN：

```text
WHERE id = ?
```

这样可以减少越权风险。

---

# 26. Todo 删除

规则与 Update 一致：

```text
USER
 ↓
只能删除自己的 Todo

ADMIN
 ↓
可以删除所有 Todo
```

---

# 27. GET /todos/:id

USER：

```text
只能查询自己的 Todo
```

ADMIN：

```text
可以查询任何 Todo
```

如果 Todo 不属于当前用户：

统一返回：

```http
404 Not Found
```

不要向普通用户明确告诉：

```text
这个 Todo 属于另一个用户
```

这样可以减少资源枚举。

---

# 28. Auth Routes

新增：

```text
src/routes/auth.routes.ts
```

接口：

```http
POST /api/auth/register
POST /api/auth/login
```

---

# 29. Register API

请求：

```http
POST /api/auth/register
Content-Type: application/json
```

Body：

```json
{
  "name": "张三",
  "email": "zhangsan@example.com",
  "password": "123456"
}
```

成功：

```http
201 Created
```

返回：

```json
{
  "id": 1,
  "name": "张三",
  "email": "zhangsan@example.com",
  "role": "USER"
}
```

禁止返回 password。

---

# 30. Login API

请求：

```http
POST /api/auth/login
Content-Type: application/json
```

Body：

```json
{
  "email": "zhangsan@example.com",
  "password": "123456"
}
```

成功：

```http
200 OK
```

返回：

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "name": "张三",
    "email": "zhangsan@example.com",
    "role": "USER"
  }
}
```

---

# 31. Auth Controller

Controller 只负责：

```text
读取 Request
 ↓
Zod validation
 ↓
调用 Service
 ↓
返回 Response
```

Controller 不负责：

```text
bcrypt
JWT
Prisma
数据库查询
权限业务逻辑
```

---

# 32. Route 注册

在 `app.ts` 中增加：

```ts
app.use("/api/auth", authRoutes);
```

最终：

```text
POST /api/auth/register
POST /api/auth/login
```

---

# 33. Todo Route

Todo Router 应该变成类似：

```ts
router.get(
  "/",
  authMiddleware,
  todoController.getAll,
);

router.get(
  "/:id",
  authMiddleware,
  todoController.getById,
);

router.post(
  "/",
  authMiddleware,
  todoController.create,
);

router.put(
  "/:id",
  authMiddleware,
  todoController.update,
);

router.delete(
  "/:id",
  authMiddleware,
  todoController.delete,
);
```

---

# 34. req.user 使用原则

认证成功后：

```ts
req.user
```

结构：

```ts
{
  id: number;
  role: string;
}
```

Controller 可以使用：

```ts
req.user.id
req.user.role
```

但不要直接在 Controller 中实现复杂权限逻辑。

复杂业务规则应该放到 Service。

---

# 35. Service 层权限设计

推荐：

```text
Controller
    ↓
Service
    ↓
Repository
```

Controller：

```ts
todoService.getById(
  id,
  req.user
);
```

Service：

```text
判断 USER / ADMIN
 ↓
生成查询条件
 ↓
Repository
```

Repository：

```text
只负责 Prisma 查询
```

---

# 36. 错误处理

项目已有：

```text
AppError
NotFoundError
error.middleware
```

优先复用现有错误体系。

不要为了 Auth 再创建一套完全不同的错误处理体系。

建议增加：

```text
UnauthorizedError
ForbiddenError
ConflictError
```

如果当前项目的错误体系已经支持 statusCode，则直接复用。

---

# 37. 错误状态码

统一：

| 场景       | HTTP |
| -------- | ---: |
| 参数校验失败   |  400 |
| 未登录      |  401 |
| Token 无效 |  401 |
| Token 过期 |  401 |
| 用户已存在    |  409 |
| 无权限      |  403 |
| 资源不存在    |  404 |
| 服务端错误    |  500 |

---

# 38. 安全要求

必须满足：

### 密码

```text
bcrypt hash
```

不能：

```text
明文密码
```

---

### JWT Secret

必须：

```text
环境变量
```

不能：

```ts
const JWT_SECRET = "123456";
```

---

### JWT

不能包含：

```text
password
password hash
```

---

### Role

客户端不能通过注册接口设置：

```text
ADMIN
```

---

### Todo Owner

USER 创建 Todo 时：

```text
userId = req.user.id
```

不能信任客户端传入的 userId。

---

# 39. 不要做的事情

本次任务明确不做：

```text
❌ Redis
❌ Refresh Token
❌ OAuth
❌ Google Login
❌ GitHub Login
❌ Passport
❌ Session
❌ 多租户
❌ 微服务
❌ Docker
❌ PostgreSQL
```

这些属于后续学习内容。

---

# 40. 测试要求

Cursor 修改完成后至少验证以下场景。

## 注册

### Case 1

```text
正常注册
```

预期：

```http
201
```

---

### Case 2

```text
重复 email
```

预期：

```http
409
```

---

### Case 3

```text
password < 6
```

预期：

```http
400
```

---

### Case 4

客户端传：

```json
{
  "name": "test",
  "email": "test@test.com",
  "password": "123456",
  "role": "ADMIN"
}
```

预期：

```text
不能通过注册成为 ADMIN
```

---

# 41. 登录测试

### Case 1

正确 email + password：

```http
200
```

返回：

```text
token
user
```

---

### Case 2

错误密码：

```http
401
```

---

### Case 3

不存在的 email：

```http
401
```

---

# 42. JWT 测试

### Case 1

没有 Authorization：

```http
401
```

### Case 2

错误 Token：

```http
401
```

### Case 3

过期 Token：

```http
401
```

### Case 4

正确 Token：

```text
进入 Controller
```

---

# 43. Todo 权限测试

准备两个用户：

```text
User A
User B
Admin
```

准备：

```text
Todo A → User A
Todo B → User B
```

---

## User A

```text
GET /todos
```

只能看到：

```text
Todo A
```

---

## User A

```text
GET /todos/{Todo B}
```

预期：

```http
404
```

---

## User A

```text
DELETE /todos/{Todo B}
```

预期：

```http
404
```

---

## Admin

```text
GET /todos
```

可以看到：

```text
Todo A
Todo B
```

---

## Admin

```text
DELETE /todos/{Todo B}
```

允许。

---

# 44. 完成标准

本次任务完成必须满足：

```text
[ ] User 增加 email
[ ] User 增加 password
[ ] User 增加 role
[ ] Role = USER / ADMIN
[ ] email 唯一
[ ] 密码 bcrypt hash
[ ] 注册接口
[ ] 登录接口
[ ] JWT 生成
[ ] JWT 验证
[ ] authMiddleware
[ ] req.user
[ ] requireRole
[ ] 401
[ ] 403
[ ] Todo 必须登录
[ ] USER 只能访问自己的 Todo
[ ] ADMIN 可以访问所有 Todo
[ ] USER 创建 Todo 时不能指定其他 userId
[ ] USER 不能修改其他用户 Todo
[ ] USER 不能删除其他用户 Todo
[ ] ADMIN 可以操作所有 Todo
[ ] password 不出现在 API Response
[ ] JWT_SECRET 使用环境变量
```

---

# 45. Cursor 执行要求

Cursor 执行本 Spec 时遵循以下规则：

## 原则 1：最小改动

优先修改现有代码。

不要无理由重构整个项目。

---

## 原则 2：保持现有架构

必须保持：

```text
Controller
Service
Repository
```

分层。

---

## 原则 3：优先复用

优先复用现有：

```text
AppError
NotFoundError
error.middleware
async-handler
Prisma client
```

不要重复创建相同功能。

---

## 原则 4：类型安全

不要大量使用：

```ts
any
```

如果必须使用，应说明原因。

---

## 原则 5：不要修改无关功能

现有 Todo：

```text
CRUD
分页
completed 条件查询
Relation
Transaction
```

功能必须继续正常工作。

---

## 原则 6：不要删除历史 migration

禁止：

```text
删除 prisma/migrations
```

禁止：

```text
直接删除 dev.db
```

除非用户明确要求。

---

# 46. Cursor 执行步骤

Cursor 应按照以下顺序实施：

```text
Step 1
检查当前项目结构和现有代码

↓

Step 2
检查 Prisma User / Todo Schema

↓

Step 3
修改 Prisma Schema

↓

Step 4
生成 Migration

↓

Step 5
安装 bcrypt / jsonwebtoken

↓

Step 6
实现 Auth Schema

↓

Step 7
实现 User Repository

↓

Step 8
实现 Auth Service

↓

Step 9
实现 JWT Utility

↓

Step 10
实现 Auth Controller

↓

Step 11
实现 Auth Routes

↓

Step 12
实现 Auth Middleware

↓

Step 13
实现 RBAC Middleware

↓

Step 14
修改 Todo Service / Repository

↓

Step 15
实现 USER / ADMIN 数据隔离

↓

Step 16
检查错误处理

↓

Step 17
运行 TypeScript 检查

↓

Step 18
运行测试 / API 验证

↓

Step 19
汇总修改内容
```

---

# 47. 最终 API

完成之后 API 应该至少包括：

```text
Auth

POST /api/auth/register
POST /api/auth/login
```

Todo：

```text
GET    /api/todos
GET    /api/todos/:id
POST   /api/todos
PUT    /api/todos/:id
DELETE /api/todos/:id
```

权限：

```text
USER
 ↓
自己的 Todo

ADMIN
 ↓
所有 Todo
```

---

# 48. 最终架构

完成后的整体结构：

```text
                         Client
                           │
                           ↓
                     HTTP Request
                           │
                           ↓
                         Route
                           │
                           ↓
                  ┌─────────────────┐
                  │ Auth Middleware │
                  └────────┬────────┘
                           │
                       req.user
                           │
                           ↓
                  ┌─────────────────┐
                  │  Authorization  │
                  │   / RBAC        │
                  └────────┬────────┘
                           │
                           ↓
                      Controller
                           │
                           ↓
                       Service
                           │
                           ↓
                     Repository
                           │
                           ↓
                        Prisma
                           │
                           ↓
                       SQLite
```

认证：

```text
email + password
       ↓
bcrypt
       ↓
JWT
       ↓
Authorization Header
       ↓
JWT Middleware
       ↓
req.user
```

鉴权：

```text
req.user
    ↓
role
    ↓
USER / ADMIN
    ↓
Resource Ownership
    ↓
允许 / 拒绝
```

---

# 49. 学习目标

完成这个 Spec 后，需要能够解释：

1. Authentication 和 Authorization 的区别。
2. bcrypt 为什么不能直接保存密码。
3. JWT 的作用是什么。
4. JWT payload 中为什么使用 `sub`。
5. JWT Secret 为什么必须放环境变量。
6. Middleware 为什么适合做身份认证。
7. `req.user` 是怎么产生的。
8. 401 和 403 的区别。
9. RBAC 是什么。
10. 为什么 USER 不能相信客户端传来的 `userId`。
11. 为什么 Todo 查询需要进行 owner 隔离。
12. 为什么权限控制不能只放在前端。
13. Controller / Service / Repository 在认证系统中的职责分别是什么。
14. bcrypt、JWT、Prisma、Zod 如何串成完整的登录链路。

---

# 50. 完成后的验证链路

最终必须能够完整解释并验证：

```text
注册：

POST /api/auth/register
        ↓
Zod
        ↓
AuthController
        ↓
AuthService
        ↓
bcrypt.hash
        ↓
UserRepository
        ↓
Prisma
        ↓
SQLite
```

登录：

```text
POST /api/auth/login
        ↓
Zod
        ↓
AuthController
        ↓
AuthService
        ↓
UserRepository
        ↓
bcrypt.compare
        ↓
JWT sign
        ↓
返回 Token
```

访问 Todo：

```text
GET /api/todos
Authorization: Bearer xxx
        ↓
Auth Middleware
        ↓
JWT verify
        ↓
req.user
        ↓
Todo Service
        ↓
USER → userId = req.user.id
ADMIN → 不限制 userId
        ↓
Todo Repository
        ↓
Prisma
        ↓
SQLite
```

---

# 51. 本次任务边界

本 Spec 的唯一目标：

> 在现有 todo-api 上建立一套最小但完整的 JWT Authentication + RBAC Authorization 能力。

完成后再进入下一阶段：

```text
Authentication
        ↓
Authorization
        ↓
API 工程化
        ↓
Redis
        ↓
测试
        ↓
Docker
        ↓
部署
```

不要提前实现下一阶段功能。
