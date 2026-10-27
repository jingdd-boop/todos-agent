# Todo API 第三周学习 Spec：缓存、并发与统计接口

## 1. 本周目标

```text
Day 1：缓存失效
Day 2：缓存权限隔离
Day 3：并发创建测试
Day 4：乐观锁
Day 5：完成 Todo 统计接口
```

本周目标是理解缓存和并发带来的真实问题，并通过当前 Todo API 完成实验。所有实验都必须保留数据安全和用户资源隔离。

本周暂不引入 Redis，先使用进程内缓存；不删除历史 migration、数据库文件或旧业务代码。

## 2. 当前项目基线

当前 Todo API：

```text
GET    /api/todos
GET    /api/todos/:id
POST   /api/todos
PUT    /api/todos/:id
DELETE /api/todos/:id
```

当前权限规则：

```text
USER：只能访问自己的 Todo
ADMIN：可以访问全部 Todo
```

当前数据模型已有：

```text
Todo.id
Todo.title
Todo.completed
Todo.userId
```

## 3. Day 1：缓存失效

### 3.1 学习目标

理解：

- Cache-Aside
- cache hit / cache miss
- TTL
- 写操作后的缓存失效
- 为什么缓存比数据库更容易出现旧数据

### 3.2 实现范围

新增：

```text
src/cache/memory-cache.ts
```

最小 API：

```ts
get<T>(key: string): T | undefined
set<T>(key: string, value: T, ttlMs: number): void
delete(key: string): void
clearByPrefix(prefix: string): void
```

缓存条目：

```ts
type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};
```

### 3.3 缓存流程

```text
GET /api/todos
      ↓
生成 Cache Key
      ↓
缓存命中？
  ├── 是 → 返回缓存
  └── 否 → 查询数据库
                ↓
            写入缓存
                ↓
            返回结果
```

TTL 第一版设置为：

```text
30 秒
```

### 3.4 缓存失效规则

以下操作成功后必须清除 Todo 列表缓存：

```text
POST   /api/todos
PUT    /api/todos/:id
DELETE /api/todos/:id
```

第一版可以清除所有 `todos:` 前缀缓存，优先保证正确性：

```text
写操作成功
    ↓
clearByPrefix("todos:")
```

### 3.5 Day 1 验收

```text
[ ] 第一次查询产生 cache.miss
[ ] 第二次相同查询产生 cache.hit
[ ] 创建 Todo 后再次查询可以看到新 Todo
[ ] 更新 Todo 后再次查询得到新状态
[ ] 删除 Todo 后再次查询不再出现该 Todo
[ ] TTL 到期后会重新查询数据库
```

## 4. Day 2：缓存权限隔离

### 4.1 学习目标

理解缓存 Key 不只是性能问题，也是权限安全问题。

错误的缓存：

```text
todos:page:1
```

可能导致：

```text
User A 的缓存被 User B 命中
普通用户命中管理员缓存
```

### 4.2 Cache Key 设计

普通用户：

```text
todos:user:2:page:1:size:10:completed:false
```

管理员：

```text
todos:admin:page:1:size:10:completed:false
```

Cache Key 至少必须包含：

```text
用户范围
用户 ID 或管理员标识
page
pageSize
completed
sort
order
```

### 4.3 正确的查询顺序

```text
验证 JWT
  ↓
读取 req.user.id / role
  ↓
生成资源作用域
  ↓
生成缓存 Key
  ↓
读取缓存或数据库
```

不能在没有用户身份的情况下生成 Todo 列表缓存。

### 4.4 权限隔离测试

准备：

```text
User A
User B
Admin
```

测试：

```text
[ ] User A 第一次查询不会命中 User B 缓存
[ ] User B 第一次查询不会命中 User A 缓存
[ ] User A 不能看到 User B 的 Todo
[ ] Admin 的缓存与普通用户缓存不同
[ ] Admin 能看到全部 Todo
[ ] 缓存命中时仍然符合原用户权限范围
```

### 4.5 Day 2 验收

必须能够回答：

```text
为什么 Cache Key 必须包含 userId？
为什么不能先查全量数据再在内存里过滤？
为什么权限隔离比缓存命中率更重要？
```

## 5. Day 3：并发创建测试

### 5.1 学习目标

理解：

- 并发请求不是顺序执行
- 数据库自增 ID 的作用
- 请求完成顺序不一定等于发送顺序
- Promise.all 的并发行为
- SQLite 并发写入的限制

### 5.2 测试接口

```http
POST /api/todos
Authorization: Bearer <USER_TOKEN>
Content-Type: application/json

{
  "title": "concurrent todo"
}
```

### 5.3 并发测试脚本目标

发送 20 个并发创建请求，并检查：

```text
[ ] 成功请求数量
[ ] 失败请求数量
[ ] 返回 ID 是否唯一
[ ] 数据库实际记录数量
[ ] 每条记录的 userId 是否正确
[ ] 是否出现 SQLITE_BUSY
```

可以使用 Node.js `Promise.all` 编写测试脚本：

```ts
const results = await Promise.all(
  Array.from({ length: 20 }, (_, index) =>
    createTodo(`concurrent-${index}`),
  ),
);
```

### 5.4 观察重点

并发创建要求：

```text
每条 Todo 都有唯一 ID
每条 Todo 都属于当前用户
不存在半条数据
```

如果出现写入失败，需要记录：

```text
requestId
错误类型
数据库错误
失败数量
```

### 5.5 Day 3 验收

完成一份并发实验记录：

```text
并发请求数：20
成功数：
失败数：
重复 ID：
错误类型：
SQLite 表现：
```

并明确说明：

```text
当前进程内并发测试不等于生产压测。
```

## 6. Day 4：乐观锁

### 6.1 学习目标

理解两个请求同时修改同一个 Todo 时可能出现的丢失更新。

当前问题：

```text
请求 A 读取 completed=false
请求 B 读取 completed=false
请求 A 更新 completed=true
请求 B 更新 completed=false
```

最后一次写入可能覆盖前一次修改，这就是丢失更新。

### 6.2 数据模型调整方案

为 Todo 增加：

```prisma
version Int @default(0)
```

注意：这是 Schema 变更，实施前必须：

1. 检查数据库现有数据。
2. 生成新的 migration。
3. 不删除旧 migration。
4. 确认 migration 可以为历史数据提供默认值。

### 6.3 更新流程

客户端读取：

```json
{
  "id": 1,
  "title": "学习并发",
  "completed": false,
  "version": 3
}
```

客户端更新时提交：

```json
{
  "completed": true,
  "version": 3
}
```

数据库更新条件：

```text
WHERE id = 1
AND userId = 当前用户
AND version = 3
```

更新成功后：

```text
version = 4
```

### 6.4 冲突行为

如果数据库当前版本已经是 4，客户端仍提交 version=3：

```http
409 Conflict
```

响应：

```json
{
  "success": false,
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Todo was modified by another request"
  }
}
```

### 6.5 乐观锁测试

```text
[ ] 两次读取同一 Todo 得到相同 version
[ ] 第一次更新成功并 version + 1
[ ] 第二次使用旧 version 更新失败
[ ] 第二次响应为 409
[ ] 失败更新不会覆盖第一次更新
[ ] USER 和 ADMIN 的 owner 规则仍然生效
```

### 6.6 Day 4 注意事项

乐观锁不是所有场景的唯一方案：

```text
低冲突编辑：适合乐观锁
高冲突热点数据：可能需要悲观锁或队列
```

本周只实现乐观锁，不引入复杂锁服务。

## 7. Day 5：Todo 统计接口

### 7.1 接口设计

新增：

```http
GET /api/todos/stats
```

要求登录：

```text
USER：只统计自己的 Todo
ADMIN：统计全部 Todo
```

### 7.2 响应设计

```json
{
  "success": true,
  "data": {
    "total": 10,
    "completed": 6,
    "pending": 4
  }
}
```

必须满足：

```text
total = completed + pending
```

### 7.3 统计查询范围

USER：

```sql
WHERE userId = req.user.id
```

ADMIN：

```sql
不限制 userId
```

不能让客户端传入：

```http
GET /api/todos/stats?userId=999
```

统计范围必须由服务端身份上下文决定。

### 7.4 并发查询方案

学习版可以使用：

```text
Promise.all([
  count(all),
  count(completed),
  count(pending)
])
```

同时学习另一种方案：

```text
一次数据库聚合查询
```

对比：

| 方案 | 优点 | 缺点 |
|---|---|---|
| 多个 count 并发 | 容易理解 | 多次数据库调用 |
| 聚合查询 | 性能更好 | SQL/ORM 写法更复杂 |

### 7.5 统计缓存

如果使用缓存，Key 必须隔离：

```text
todos:stats:user:2
todos:stats:admin
```

Todo 写操作后清除：

```text
todos:stats:
```

第一版可以不缓存统计接口，先完成正确性，再增加缓存。

### 7.6 Day 5 测试

```text
[ ] USER 只能得到自己的统计
[ ] ADMIN 得到全部统计
[ ] total = completed + pending
[ ] 没有 Todo 时返回 0，而不是 null
[ ] 没有 Token 返回 401
[ ] 不接受客户端 userId 作为统计范围
[ ] Todo 创建后统计结果更新
[ ] Todo 完成状态变化后统计结果更新
[ ] Todo 删除后统计结果更新
```

## 8. 综合流程

```text
请求进入
   ↓
JWT 认证
   ↓
确定 USER / ADMIN 资源范围
   ↓
生成隔离后的 Cache Key
   ↓
查询缓存
   ├── 命中 → 返回缓存
   └── 未命中
          ↓
       查询数据库
          ↓
       写入缓存
          ↓
       返回响应

写操作：

POST / PUT / DELETE
   ↓
数据库写入
   ↓
清除相关缓存
   ↓
返回结果
```

## 9. 本周完成标准

```text
[ ] Todo 列表支持进程内缓存
[ ] 缓存支持 TTL
[ ] 写操作后缓存失效
[ ] Cache Key 包含用户权限范围
[ ] 完成 20 个并发创建实验
[ ] 能解释并发写入的现象
[ ] Todo 增加 version 乐观锁
[ ] 旧版本更新返回 409
[ ] 完成 GET /api/todos/stats
[ ] USER / ADMIN 统计范围正确
[ ] 统计接口经过认证
[ ] 关键实验有 curl 或脚本记录
[ ] 没有删除数据库和历史 migration
```

## 10. 学习复盘问题

1. 为什么写操作必须清除缓存？
2. 为什么缓存 Key 必须包含 userId 或角色范围？
3. Promise.all 能保证数据库写入顺序吗？
4. 什么是丢失更新？
5. 乐观锁为什么使用 version？
6. 为什么重复注册最终要靠数据库唯一约束？
7. USER 和 ADMIN 的统计查询有什么区别？
8. 统计接口应该优先保证正确性还是缓存命中率？
9. 进程内缓存为什么不适合多实例服务？
10. 什么时候应该从进程内缓存迁移到 Redis？
