# Auth / RBAC API 测试示例

默认服务地址：`http://localhost:3000`

启动服务：

```bash
pnpm dev
```

## 1. 注册普通用户

```bash
curl -i -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "User A",
    "email": "user-a@example.com",
    "password": "123456"
  }'
```

预期：`201 Created`，响应只包含 `id`、`name`、`email`、`role`，不包含 password。

注册时传入角色不会成为管理员：

```bash
curl -i -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"User B","email":"user-b@example.com","password":"123456","role":"ADMIN"}'
```

预期：用户仍为 `USER`。

重复 email：

```bash
curl -i -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Duplicate","email":"user-a@example.com","password":"123456"}'
```

预期：`409 Conflict`。

## 2. 登录并保存 Token

```bash
USER_TOKEN=$(curl -sS -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user-a@example.com","password":"123456"}' \
  | jq -r '.token')

echo "$USER_TOKEN"
```

错误密码或不存在的 email 都应返回 `401` 和：

```json
{"message":"Invalid email or password"}
```

## 3. Todo 认证测试

不带 Token：

```bash
curl -i http://localhost:3000/api/todos
```

预期：`401`，`Authentication required`。

普通用户创建 Todo：

```bash
curl -i -X POST http://localhost:3000/api/todos \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"User A todo","userId":999}'
```

预期：创建成功，但 Todo 的 owner 仍是当前登录用户，不能由客户端的 `userId` 决定。

查询自己的 Todo：

```bash
curl -i http://localhost:3000/api/todos \
  -H "Authorization: Bearer $USER_TOKEN"
```

## 4. 管理员测试

迁移时创建的管理员账号：

```text
email: 1234567890@qq.com
password: 000000
```

登录并保存管理员 Token：

```bash
ADMIN_TOKEN=$(curl -sS -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"1234567890@qq.com","password":"000000"}' \
  | jq -r '.token')
```

管理员查看全部 Todo：

```bash
curl -i http://localhost:3000/api/todos \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

管理员可以操作其他用户的 Todo：

```bash
curl -i -X DELETE http://localhost:3000/api/todos/<TODO_ID> \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 5. 用户隔离验证

先使用 User A 和 User B 分别创建 Todo，然后用 User A 查询或操作 User B 的 Todo：

```bash
curl -i http://localhost:3000/api/todos/<USER_B_TODO_ID> \
  -H "Authorization: Bearer $USER_A_TOKEN"

curl -i -X DELETE http://localhost:3000/api/todos/<USER_B_TODO_ID> \
  -H "Authorization: Bearer $USER_A_TOKEN"
```

预期两者均为 `404 Not Found`，不应暴露该 Todo 属于其他用户。

## 6. Token 错误测试

```bash
curl -i http://localhost:3000/api/todos \
  -H 'Authorization: Bearer invalid-token'
```

预期：`401`，`Invalid or expired token`。

错误格式：

```bash
curl -i http://localhost:3000/api/todos \
  -H 'Authorization: invalid-token'
```

预期：`401`。
