# Todo API 接口文档

默认地址：`http://localhost:3000`

除注册和登录外，接口需要：

```http
Authorization: Bearer <JWT_TOKEN>
```

## 统一响应

成功：

```json
{
  "success": true,
  "data": {}
}
```

列表接口：

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

错误：

```json
{
  "success": false,
  "error": {
    "code": "INVALID_PAGINATION",
    "message": "page must be a positive integer",
    "requestId": "req_xxx"
  }
}
```

## 注册

```http
POST /api/auth/register
Content-Type: application/json
```

```json
{
  "name": "User A",
  "email": "user-a@example.com",
  "password": "123456"
}
```

成功：`201 Created`。

## 登录

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "email": "user-a@example.com",
  "password": "123456"
}
```

成功：`200 OK`，返回 `token` 和安全用户信息。

## 创建管理员

仅 `ADMIN` 可以调用：

```http
POST /api/auth/admin/users
```

```json
{
  "name": "Admin B",
  "email": "admin-b@example.com",
  "password": "123456"
}
```

普通用户调用返回 `403 Forbidden`。

## Todo 列表

```http
GET /api/todos?page=1&pageSize=10&completed=false&sort=createdAt&order=desc
```

参数：

```text
page：默认 1
pageSize：1～100，默认 10
completed：true / false
sort：id / createdAt / title / completed
order：asc / desc
```

USER 只返回自己的 Todo；ADMIN 返回全部 Todo。

## 获取 Todo

```http
GET /api/todos/:id
```

其他用户的 Todo 对普通用户统一返回 `404`。

## 创建 Todo

```http
POST /api/todos
Content-Type: application/json
```

```json
{
  "title": "学习 API 设计"
}
```

Todo owner 由服务端根据 JWT 中的用户 ID 设置，不信任客户端 `userId`。

成功：`201 Created`。

## 更新 Todo

兼容旧接口：

```http
PUT /api/todos/:id
```

推荐部分更新接口：

```http
PATCH /api/todos/:id
```

请求体：

```json
{
  "completed": true
}
```

## 删除 Todo

```http
DELETE /api/todos/:id
```

成功：`204 No Content`。

## 状态码

```text
200 查询或更新成功
201 创建成功
204 删除成功
400 参数错误
401 未认证或 Token 无效
403 角色无权限
404 资源不存在或不可见
409 资源冲突
500 服务端错误
```

## 缓存说明

Todo 列表使用进程内缓存，TTL 为 30 秒。

缓存 Key 包含：

```text
用户范围、page、pageSize、completed、sort、order
```

创建、更新、删除 Todo 成功后会清除 `todos:` 前缀缓存。

进程内缓存只存在于当前 Node.js 进程，重启服务后会清空，多实例部署时不能作为共享缓存。
