# Todo API 第二周学习 Spec：接口设计与进程内缓存

## 1. 学习目标

本周学习五个主题：

```text
Day 1：HTTP 方法和状态码
Day 2：分页、筛选、排序
Day 3：统一响应结构
Day 4：API 文档
Day 5：进程内缓存
```

本周目标不是一次性把项目改造成完整生产系统，而是通过当前 Todo API 理解接口设计和缓存的基本原则。

## 2. 当前项目基线

当前接口：

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/admin/users

GET    /api/todos
GET    /api/todos/:id
POST   /api/todos
PUT    /api/todos/:id
DELETE /api/todos/:id
```

当前 Todo 列表已经支持：

```http
GET /api/todos?page=1&pageSize=10&completed=false
```

当前限制：

1. Todo 列表有分页和完成状态筛选，但没有排序参数。
2. 成功响应和错误响应还没有完全统一为同一套 Envelope。
3. API 没有正式文档格式。
4. 项目还没有缓存。
5. 本周只实现进程内缓存，不引入 Redis。

## 3. 本周改造边界

允许修改：

```text
src/controllers/
src/services/
src/repositories/
src/middlewares/
src/errors/
src/types/
src/app.ts
docs/
```

允许新增：

```text
src/cache/
docs/api-reference.md
```

本周暂不实现：

```text
❌ Redis
❌ 分布式缓存
❌ Refresh Token
❌ 消息队列
❌ 数据库切换
❌ 微服务
❌ 复杂搜索引擎
```

不要删除历史 migration、数据库文件或旧 Repository 文件。

## 4. Day 1：HTTP 方法和状态码

### 4.1 学习目标

理解 HTTP 方法表达的语义，而不是只把所有请求都当成“调用接口”。

### 4.2 方法约定

| 方法 | 语义 | 当前项目示例 |
|---|---|---|
| GET | 查询资源，不应修改数据 | `GET /api/todos` |
| POST | 创建资源或执行非幂等操作 | `POST /api/todos` |
| PUT | 整体替换资源 | 可用于完整更新 Todo |
| PATCH | 部分更新资源 | 推荐用于只改 completed/title |
| DELETE | 删除资源 | `DELETE /api/todos/:id` |

当前 Todo 更新只提交部分字段，更符合：

```http
PATCH /api/todos/:id
```

学习任务：

1. 分析当前 `PUT /api/todos/:id` 的实际行为。
2. 记录 PUT 和 PATCH 的区别。
3. 评估是否新增 PATCH，而不是立刻删除 PUT。
4. 保持旧接口兼容，避免破坏现有前端。

### 4.3 状态码约定

```text
200 OK              查询或更新成功
201 Created         创建成功
204 No Content      删除成功且没有响应体
400 Bad Request     参数格式错误
401 Unauthorized    未认证或 Token 无效
403 Forbidden       已认证但角色无权限
404 Not Found       资源不存在或不可见
409 Conflict        资源冲突，例如重复邮箱
500 Internal Error  未预期服务端错误
```

测试任务：

```text
[ ] 注册成功 → 201
[ ] 登录成功 → 200
[ ] 创建 Todo → 201
[ ] 查询 Todo → 200
[ ] 删除 Todo → 204
[ ] 没有 Token → 401
[ ] USER 访问其他用户 Todo → 404
[ ] 重复 email → 409
```

### 4.4 Day 1 完成标准

能够解释：

1. 为什么创建资源使用 201 而不是 200。
2. 为什么删除成功可以返回 204。
3. PUT 和 PATCH 的使用区别。
4. 为什么越权 Todo 返回 404 而不是 403。

## 5. Day 2：分页、筛选、排序

### 5.1 列表接口设计

推荐接口：

```http
GET /api/todos?page=1&pageSize=10&completed=false&sort=id&order=desc
```

参数定义：

| 参数 | 类型 | 默认值 | 规则 |
|---|---|---:|---|
| page | number | 1 | 大于等于 1 |
| pageSize | number | 10 | 1～100 |
| completed | boolean | 不限制 | true / false |
| sort | string | id | 只允许白名单字段 |
| order | string | desc | asc / desc |

允许排序字段：

```text
id
createdAt
title
completed
```

不要直接把客户端传入的 `sort` 拼接到 SQL 中，必须使用白名单映射。

### 5.2 分页计算

```ts
skip = (page - 1) * pageSize
take = pageSize
```

响应元数据：

```json
{
  "page": 1,
  "pageSize": 10,
  "total": 35,
  "totalPages": 4
}
```

### 5.3 USER / ADMIN 作用域

分页、筛选、排序之前，必须先确定资源范围：

```text
USER：WHERE userId = req.user.id
ADMIN：不限制 userId
```

正确顺序：

```text
身份认证
  ↓
用户资源范围
  ↓
completed 筛选
  ↓
排序
  ↓
分页
```

不能先查询全部 Todo，再在内存中筛选普通用户数据。

### 5.4 测试任务

```text
[ ] page=1&pageSize=2 返回最多 2 条
[ ] page=0 返回 400
[ ] pageSize=101 返回 400
[ ] completed=true 只返回已完成 Todo
[ ] completed=false 只返回未完成 Todo
[ ] sort=id&order=asc 按 ID 正序
[ ] 非法 sort 返回 400
[ ] USER 分页不会看到其他用户数据
[ ] ADMIN 分页可以看到全部数据
```

### 5.5 Day 2 完成标准

能够解释：

1. `skip` 和 `take` 如何实现分页。
2. 为什么 pageSize 必须限制最大值。
3. 为什么排序字段必须白名单校验。
4. 为什么 owner 过滤必须在数据库查询层生效。

## 6. Day 3：统一响应结构

### 6.1 成功响应

单个资源：

```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "学习接口设计",
    "completed": false
  }
}
```

列表资源：

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "学习接口设计",
      "completed": false
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

删除接口仍然可以返回：

```http
204 No Content
```

### 6.2 错误响应

```json
{
  "success": false,
  "error": {
    "code": "INVALID_PAGINATION",
    "message": "page must be a positive integer",
    "requestId": "req_abc123"
  }
}
```

### 6.3 改造策略

为了降低风险，建议按接口逐步改造：

```text
第一步：新增响应类型定义
第二步：先改 GET /api/todos
第三步：改 auth 接口
第四步：改 Todo 创建、更新、详情
第五步：确认前端兼容后再清理旧格式
```

不要同时修改所有 Controller，避免一次改动难以定位问题。

### 6.4 Day 3 完成标准

至少以下接口使用统一结构：

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/todos
GET  /api/todos/:id
POST /api/todos
```

并且错误响应包含：

```text
success
error.code
error.message
requestId
```

## 7. Day 4：API 文档

### 7.1 文档目标

新增：

```text
docs/api-reference.md
```

文档应该让一个没有阅读源码的人能够调用 API。

### 7.2 每个接口必须记录

```text
接口名称
HTTP 方法
URL
是否需要登录
需要的角色
请求 Headers
请求 Query
请求 Body
成功响应
失败响应
状态码
curl 示例
```

### 7.3 接口文档示例

```md
## 获取 Todo 列表

GET /api/todos

权限：USER / ADMIN

Headers:

Authorization: Bearer <token>

Query:

- page：页码，默认 1
- pageSize：每页数量，默认 10
- completed：可选，true / false
- sort：可选，id / createdAt / title / completed
- order：可选，asc / desc
```

### 7.4 Day 4 完成标准

完成以下接口文档：

```text
注册
登录
创建管理员
获取 Todo 列表
获取 Todo 详情
创建 Todo
更新 Todo
删除 Todo
```

每个接口至少有一个可以复制执行的 curl 示例。

## 8. Day 5：进程内缓存

### 8.1 缓存目标

先缓存 Todo 列表查询结果，不缓存登录和权限判断。

原因：

1. Todo 列表查询容易观察缓存命中效果。
2. 可以练习用户作用域隔离。
3. 可以练习写操作后的缓存失效。
4. 不需要立刻引入 Redis。

### 8.2 缓存结构

建议新增：

```text
src/cache/memory-cache.ts
```

缓存条目：

```ts
type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};
```

最小 API：

```ts
get<T>(key: string): T | undefined
set<T>(key: string, value: T, ttlMs: number): void
delete(key: string): void
clearByPrefix(prefix: string): void
```

### 8.3 Cache-Aside 流程

```text
GET /api/todos
      ↓
生成 Cache Key
      ↓
缓存命中？
  ├── 是 → 返回缓存数据
  └── 否
       ↓
    查询数据库
       ↓
    写入缓存
       ↓
    返回数据
```

### 8.4 Cache Key 设计

缓存 Key 必须包含用户身份和查询条件：

```text
todos:user:2:page:1:size:10:completed:false:sort:id:order:desc
```

管理员必须使用不同范围：

```text
todos:admin:page:1:size:10:completed:false:sort:id:order:desc
```

最重要的安全规则：

```text
普通用户缓存不能与管理员缓存共用 Key。
不同用户的 Todo 缓存不能共用 Key。
```

### 8.5 TTL

第一版 TTL 建议：

```text
30 秒
```

TTL 到期后：

```text
缓存视为 miss
重新读取数据库
重新写入缓存
```

### 8.6 缓存失效

以下操作成功后清除 Todo 缓存：

```text
POST /api/todos
PUT /api/todos/:id
PATCH /api/todos/:id
DELETE /api/todos/:id
```

第一版可以清除：

```text
todos:
```

前缀下的全部缓存。

这是简单但安全的策略，后续再优化为精确删除。

### 8.7 缓存日志

至少记录：

```json
{
  "event": "cache.hit",
  "key": "todos:user:2:page:1:size:10",
  "requestId": "req_abc123"
}
```

或：

```json
{
  "event": "cache.miss",
  "key": "todos:user:2:page:1:size:10",
  "requestId": "req_abc123"
}
```

日志中可以记录 Cache Key，但不能记录 Token。

### 8.8 缓存测试

```text
[ ] 第一次查询是 cache miss
[ ] 相同用户、相同参数的第二次查询是 cache hit
[ ] 不同用户不会命中同一份 Todo 缓存
[ ] USER 不会命中 ADMIN 缓存
[ ] 创建 Todo 后旧列表缓存失效
[ ] 更新 Todo 后旧列表缓存失效
[ ] 删除 Todo 后旧列表缓存失效
[ ] TTL 到期后重新查询数据库
[ ] 服务重启后进程内缓存消失
```

### 8.9 进程内缓存的限制

进程内缓存只存在于当前 Node.js 进程内：

```text
Node 进程 A 有一份缓存
Node 进程 B 有另一份缓存
```

因此它不适合：

```text
多实例部署
容器横向扩容
需要共享缓存的场景
```

后续学习 Redis 时，再将这部分替换为共享缓存。

## 9. 每日验收标准

### Day 1

```text
[ ] 能区分 GET / POST / PUT / PATCH / DELETE
[ ] 状态码使用符合语义
[ ] 能解释幂等性
```

### Day 2

```text
[ ] 支持 page / pageSize
[ ] 支持 completed 筛选
[ ] 支持 sort / order
[ ] 排序字段有白名单
[ ] USER / ADMIN 资源范围正确
```

### Day 3

```text
[ ] 成功响应结构统一
[ ] 错误响应结构统一
[ ] 列表响应有 meta
[ ] 前端可以继续调用接口
```

### Day 4

```text
[ ] 所有核心接口都有文档
[ ] 文档有权限要求
[ ] 文档有请求和响应示例
[ ] curl 可以直接执行
```

### Day 5

```text
[ ] Todo 列表支持 Cache-Aside
[ ] Cache Key 包含用户范围和查询条件
[ ] 写操作会失效缓存
[ ] TTL 生效
[ ] 有 cache.hit / cache.miss 日志
```

## 10. 本周最终练习

完成以下接口增强：

```http
GET /api/todos?page=1&pageSize=10&completed=false&sort=createdAt&order=desc
```

要求：

1. USER 只能查看自己的数据。
2. ADMIN 可以查看全部数据。
3. 返回统一成功响应。
4. 错误返回统一错误结构。
5. 支持 requestId。
6. 支持 30 秒进程内缓存。
7. 创建、更新、删除 Todo 后清除缓存。
8. 在 API 文档中写出完整调用示例。

最终链路：

```text
Request
  ↓
Authentication
  ↓
User / Admin Scope
  ↓
Query Validation
  ↓
Cache Hit?
  ├── Yes → Return Cache
  └── No → Database Query → Set Cache → Return
```
