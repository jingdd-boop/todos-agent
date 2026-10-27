对，这段脚本其实已经把 **“登录 → 获取 JWT → 客户端保存 Token”** 这一整条链路跑通了。

但有一个关键点需要纠正：

> **客户端保存 Token 本身并不会“实现登录”。**
>
> 真正实现登录的是：**服务端验证账号密码 → 签发 JWT → 后续 API 用 JWT 识别用户。**

你这段 curl 正好可以拿来把整个技术链路拆开看。

---

# 1. 先看你这段代码到底做了什么

你的代码：

```bash
LOGIN_RESPONSE=$(curl -sS -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user-a@example.com","password":"123456"}')
```

实际上是在做：

```text
客户端
  │
  │ email + password
  ↓
POST /api/auth/login
  │
  ↓
后端
  │
  ├── 查询 User
  ├── bcrypt.compare()
  ├── 验证成功
  │
  ↓
生成 JWT
  │
  ↓
返回 JSON
```

你的返回结果：

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 2,
    "name": "User A",
    "email": "user-a@example.com",
    "role": "USER"
  }
}
```

这里最重要的是：

```json
{
  "token": "...",
  "user": {}
}
```

也就是说，登录接口实际上返回了两类信息：

### 身份凭证

```text
token
```

### 用户展示信息

```text
user
```

---

# 2. `USER_TOKEN=$(...)` 在做什么？

这一句：

```bash
USER_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')
```

就是：

```text
LOGIN_RESPONSE
      ↓
     jq
      ↓
取 JSON 的 token 字段
      ↓
USER_TOKEN
```

最终：

```bash
echo "$USER_TOKEN"
```

得到：

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....
```

这就是客户端后面需要保存的 **Access Token**。

---

# 3. 为什么 Token 是三个部分？

你这里：

```bash
token_parts=$(echo "$USER_TOKEN" | awk -F. '{print NF}')
```

结果：

```text
token_parts=3
```

这是 JWT 的典型结构：

```text
xxxxx.yyyyy.zzzzz
  │      │      │
  │      │      └── Signature
  │      └───────── Payload
  └──────────────── Header
```

也就是：

```text
JWT
│
├── Header
├── Payload
└── Signature
```

---

# 4. 你的 JWT Header

你的 Token 第一部分：

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
```

Base64URL 解码后大致是：

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

这里：

```text
alg = HS256
```

表示：

> JWT 使用 HMAC-SHA256 签名。

而：

```text
typ = JWT
```

表示这是 JWT。

---

# 5. 第二部分才是最值得你关注的

你的 Token：

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
.
eyJzdWIiOjIsInJvbGUiOiJVU0VSIiwiaWF0IjoxNzkwMDYwNDkzLCJleHAiOjE3OTAwNjQwOTN9
.
8IETk-7HUHjOCH5YbRHBwxM0BTcV9d-jbBmwrNdBfWw
```

第二部分解码后：

```json
{
  "sub": 2,
  "role": "USER",
  "iat": 1790060493,
  "exp": 1790064093
}
```

这和我们之前设计的：

```ts
{
  sub: user.id,
  role: user.role
}
```

完全对应。

---

# 6. `sub: 2` 是什么意思？

这里：

```json
{
  "sub": 2
}
```

`sub` 是：

```text
subject
```

可以理解成：

> **这个 Token 代表谁？**

你的：

```text
sub = 2
```

意味着：

```text
当前登录用户 = User #2
```

也就是：

```json
{
  "id": 2,
  "name": "User A"
}
```

---

# 7. `role: USER` 是干什么的？

这里：

```json
{
  "sub": 2,
  "role": "USER"
}
```

就开始进入我们刚刚学习的 **RBAC** 了。

后端拿到 JWT 后，可以知道：

```text
userId = 2
role = USER
```

所以后面：

```http
GET /api/todos
Authorization: Bearer xxx
```

后端就可以：

```text
JWT
 ↓
verify
 ↓
sub = 2
role = USER
 ↓
req.user
```

得到：

```ts
req.user = {
  id: 2,
  role: "USER"
}
```

然后 Todo Service 就可以决定：

```text
USER
 ↓
只能查 userId = 2 的 Todo
```

而如果：

```json
{
  "sub": 1,
  "role": "ADMIN"
}
```

则：

```text
ADMIN
 ↓
可以查询所有 Todo
```

所以你现在已经真正看到：

> **JWT 是怎么和 RBAC 连起来的。**

---

# 8. `iat` 是什么？

你的 Token：

```json
{
  "iat": 1790060493
}
```

`iat`：

> Issued At

也就是：

**Token 签发时间。**

这是 JWT 自动生成的标准字段。

---

# 9. `exp` 是什么？

你的：

```json
{
  "exp": 1790064093
}
```

是：

> Expiration Time

Token 过期时间。

你的：

```text
exp - iat
```

是：

```text
1790064093 - 1790060493
= 3600 秒
= 1 小时
```

这和我们配置：

```env
JWT_EXPIRES_IN=1h
```

对应。

所以你这次测试其实还验证了：

```text
JWT_EXPIRES_IN=1h
```

确实生效了。

---

# 10. 第三部分 Signature 是什么？

你的第三部分：

```text
8IETk-7HUHjOCH5YbRHBwxM0BTcV9d-jbBmwrNdBfWw
```

就是签名。

可以粗略理解成：

```text
Header
+
Payload
+
JWT_SECRET
        ↓
     Signature
```

服务端收到 JWT：

```text
Header.Payload.Signature
```

然后使用自己的：

```env
JWT_SECRET=xxxx
```

重新验证签名。

如果 Token 被篡改：

```text
原来的：

sub = 2

改成：

sub = 1
```

Signature 就对不上了。

于是：

```text
jwt.verify()
 ↓
失败
 ↓
401
```

这就是 JWT 为什么能防止客户端随便修改：

```json
{
  "sub": 2,
  "role": "USER"
}
```

---

# 11. 一个非常重要的认知：JWT Payload 不是加密的

这一点你现在一定要记住。

JWT：

```text
Header.Payload.Signature
```

其中：

```text
Header
Payload
```

只是 Base64URL 编码。

**不是加密。**

所以不要放：

```json
{
  "password": "123456"
}
```

也不要放：

```json
{
  "creditCard": "..."
}
```

因为拿到 Token 的人可以解码 Payload。

JWT 的核心能力其实是：

> **防篡改 + 身份声明**

而不是：

> **隐藏数据**

---

# 12. 那“客户端保存 Token”之后怎么调用 API？

这才是下一步。

比如你现在已经得到：

```bash
USER_TOKEN
```

那么：

```bash
curl -sS \
  http://localhost:3000/api/todos \
  -H "Authorization: Bearer $USER_TOKEN"
```

完整链路：

```text
浏览器 / App
      │
      │ Authorization: Bearer JWT
      ↓
Node.js
      │
      ↓
authMiddleware
      │
      ↓
jwt.verify()
      │
      ↓
req.user
      │
      ↓
Todo Service
      │
      ↓
userId = req.user.id
      │
      ↓
Prisma
      │
      ↓
只查询这个用户的数据
```

这才是：

> **登录状态持续存在的核心机制。**

---

# 13. 所以客户端到底保存什么？

登录响应：

```json
{
  "token": "...",
  "user": {
    "id": 2,
    "name": "User A",
    "email": "user-a@example.com",
    "role": "USER"
  }
}
```

前端通常会把：

```text
token
```

保存下来。

然后每次请求：

```http
Authorization: Bearer <token>
```

而：

```text
user
```

更多是为了前端 UI：

```text
你好，User A
```

或者：

```text
当前角色：USER
```

但要注意：

> **前端保存的 role 只能用于 UI，不应该作为真正的权限依据。**

比如前端：

```js
user.role = "ADMIN"
```

并不能说明他真的有管理员权限。

真正的权限判断永远应该发生在：

```text
后端
```

---

# 14. 这也是为什么 RBAC 不能只写在前端

比如前端：

```ts
if (user.role === "ADMIN") {
  showDeleteButton();
}
```

这只是：

> 控制按钮显示。

真正的安全控制必须是：

```text
DELETE /api/todos/10
        ↓
JWT Middleware
        ↓
req.user
        ↓
后端权限判断
        ↓
允许 / 403
```

否则用户完全可以绕过前端：

```bash
curl -X DELETE ...
```

直接调用 API。

---

# 15. 你这段测试其实还差最后一步

你现在验证了：

```text
① login
② 获取 token
③ token 有三段
④ JWT Payload 有 sub / role / iat / exp
```

下一步应该验证：

### A. 带 Token 能访问

```bash
curl -sS \
  http://localhost:3000/api/todos \
  -H "Authorization: Bearer $USER_TOKEN"
```

### B. 不带 Token

```bash
curl -i \
  http://localhost:3000/api/todos
```

应该：

```http
401 Unauthorized
```

### C. 伪造 Token

比如随便改一下 JWT：

```text
xxxx.yyyy.zzzz
```

应该：

```http
401 Unauthorized
```

### D. User A 访问 User B 的 Todo

这个最关键：

```text
User A
  ↓
JWT sub = 2
  ↓
访问 User B 的 Todo
  ↓
404 / Forbidden
```

这样才算真正把：

```text
JWT
+
Authentication
+
Authorization
+
RBAC
+
Resource Ownership
```

整个链路验证完整。

---

# 16. 你现在可以把整个登录系统记成这一张图

```text
                 登录
                  │
                  ↓
        email + password
                  │
                  ↓
             bcrypt.compare
                  │
                  ↓
             验证成功
                  │
                  ↓
              JWT sign
                  │
                  ↓
        ┌──────────────────┐
        │      JWT         │
        │                  │
        │ sub: 2           │
        │ role: USER       │
        │ iat              │
        │ exp              │
        └────────┬─────────┘
                 │
                 ↓
          客户端保存 Token
                 │
                 ↓
        Authorization Header
                 │
                 ↓
          JWT Middleware
                 │
                 ↓
             jwt.verify
                 │
                 ↓
             req.user
                 │
          ┌──────┴──────┐
          ↓             ↓
        USER          ADMIN
          │             │
          ↓             ↓
      自己的数据      所有数据
          │             │
          └──────┬──────┘
                 ↓
              Service
                 ↓
             Repository
                 ↓
               Prisma
```

**你现在这段 curl 已经完成了上半部分：**

```text
登录
 ↓
bcrypt 验证
 ↓
JWT 签发
 ↓
客户端拿到 Token
```

接下来最值得你亲手验证的是**下半部分**：

```text
Token
 ↓
Authorization Header
 ↓
authMiddleware
 ↓
req.user
 ↓
Todo 数据隔离
```

这一步做通之后，你对 JWT + RBAC 的理解就不是“记住几个 API”，而是把整个后端认证链路真正串起来了。
