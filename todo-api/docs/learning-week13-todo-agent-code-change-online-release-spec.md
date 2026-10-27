# Todo Agent 线上代码变更发布流程 Spec（初学者版）

## 1. 文档目标

本文档记录最近两次线上问题的完整修复流程：

1. 前端生产环境把 Todo 请求发到了 `localhost:3000`。
2. backend 容器缺少 `docs` 目录，导致 RAG 流式接口报错。
3. backend 运行时使用 Pnpm 重新安装依赖，导致 `better-sqlite3` 原生模块失效。

目标是理解：

```text
本地修改代码
  → 本地验证
  → 同步服务器
  → 构建 Docker 镜像
  → 重启指定服务
  → 通过域名验证
  → 查看日志和回滚
```

## 2. 本次部署环境

| 项目 | 值 |
|---|---|
| 域名 | `https://longjing.online` |
| 服务器 | Ubuntu 24.04 |
| 项目目录 | `/home/ubuntu/todo-api` |
| 前端目录 | `/home/ubuntu/todo-api-web` |
| Compose 对外端口 | `127.0.0.1:8082` |
| backend 容器端口 | `3000` |
| 数据库 | SQLite Docker Volume |
| 反向代理 | 宿主机 Nginx |
| 模型 | DeepSeek |

## 3. 最终请求链路

### 3.1 浏览器请求 Todo

```text
浏览器
  ↓ POST /api/todos
https://longjing.online
  ↓
宿主机 Nginx :443
  ↓
127.0.0.1:8082
  ↓
Compose reverse-proxy
  ↓
backend:3000
  ↓
Express /api/todos
  ↓
SQLite
```

### 3.2 浏览器请求 Agent 流式接口

```text
浏览器
  ↓ POST /api/assistant/chat/stream
Nginx
  ↓
frontend / reverse-proxy
  ↓
backend:3000
  ↓
RAG 检索 docs
  ↓
DeepSeek Tool Calling
  ↓
list_todos / create_todo
  ↓
SSE 事件返回浏览器
```

## 4. 问题一：生产环境 API 地址错误

### 4.1 原始代码

前端 API 客户端原来是：

```ts
const API_HOST = import.meta.env.VITE_API_HOST || 'http://localhost:3000'
```

在本地开发时，这个默认值是合理的，因为：

```text
浏览器 → localhost:3000 → 本地 backend
```

但部署到线上后，浏览器中的 `localhost` 指的是“用户自己的电脑”，不是服务器：

```text
用户浏览器 → 用户电脑的 localhost:3000
```

如果用户电脑没有运行 backend，就会出现请求失败或错误路由。

### 4.2 修复后的逻辑

```ts
const API_HOST =
  import.meta.env.VITE_API_HOST ??
  (import.meta.env.DEV ? 'http://localhost:3000' : '')
```

含义：

| 环境 | API_HOST | 实际请求 |
|---|---|---|
| 本地开发 | `http://localhost:3000` | 本地 backend |
| 线上生产 | 空字符串 | 当前域名下的 `/api` |
| 显式配置 | `VITE_API_HOST` | 使用指定地址 |

生产环境中：

```text
API_HOST = ''
path = '/api/todos'
最终请求 = 'https://longjing.online/api/todos'
```

### 4.3 为什么推荐同源请求

使用同源路径：

```text
/api/todos
/api/auth/login
/api/assistant/chat/stream
```

优点：

- 不需要把 backend 公网端口暴露出来。
- Nginx 可以统一处理路由。
- CORS 配置更简单。
- 前端部署到其他域名时不容易写死 localhost。
- HTTPS 页面请求 HTTPS API，避免混合内容问题。

## 5. 问题二：RAG 文档目录没有进入镜像

### 5.1 原因

RAG 检索器使用：

```ts
const docsDir = path.resolve(process.cwd(), 'docs')
```

容器内工作目录是：

```text
/app
```

所以它实际查找：

```text
/app/docs
```

原始 Dockerfile 只复制了：

```text
prisma
src
tsconfig.json
prisma.config.ts
```

没有复制：

```text
docs
```

于是线上报错：

```text
ENOENT: no such file or directory, scandir '/app/docs'
```

### 5.2 修复

Dockerfile 增加：

```dockerfile
COPY docs ./docs
```

镜像构建完成后，容器内目录应为：

```text
/app/docs/*.md
```

### 5.3 设计原理

运行时依赖的文件必须满足以下之一：

1. 打进镜像。
2. 通过 Volume 挂载。
3. 从对象存储或数据库加载。

当前 docs 是项目版本的一部分，最适合打进镜像，因为：

- 代码和文档版本保持一致。
- 部署结果可重复。
- 容器启动不依赖服务器额外文件。
- 回滚代码时，RAG 文档也一起回滚。

## 6. 问题三：运行时 Pnpm 重新安装依赖

### 6.1 原始启动方式

原始 Dockerfile：

```dockerfile
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm start"]
```

看起来只是执行命令，但 `pnpm exec` 可能触发：

- Corepack 重新选择 Pnpm 版本。
- Pnpm 校验依赖。
- Pnpm 自动安装缺失依赖。
- Pnpm 忽略原生依赖的构建脚本。

日志出现：

```text
ERR_PNPM_IGNORED_BUILDS
better-sqlite3
```

### 6.2 为什么导致注册接口 500

`better-sqlite3` 是原生 Node 模块，需要编译出：

```text
better_sqlite3.node
```

如果运行时重新安装依赖但忽略构建脚本，Node 仍然可以启动部分 HTTP 路由，但一旦访问数据库就会失败：

```text
健康检查可能成功
注册、Todo、Agent 数据操作失败
```

这解释了为什么：

- `/health` 正常。
- `POST /api/auth/register` 返回 500。
- 错误只在真正访问 SQLite 时出现。

### 6.3 修复

改为直接调用镜像内已有的二进制：

```dockerfile
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node_modules/.bin/tsx src/server.ts"]
```

核心原则：

```text
构建阶段安装和编译依赖
运行阶段只执行已经安装好的依赖
```

生产容器启动时不应重新下载依赖。

## 7. 正确的发布流程

### 阶段一：修改本地代码

修改前先确认当前分支和状态：

```bash
git status
git branch --show-current
git log --oneline -5
```

确认修改范围：

```bash
git diff -- Dockerfile
git diff -- ../todo-api-web/src/api/client.ts
```

### 阶段二：本地验证

前端：

```bash
cd todo-api-web
pnpm format:check
pnpm build
```

后端：

```bash
cd todo-api
pnpm format:check
pnpm test
```

如果本机没有依赖，应先执行：

```bash
pnpm install
```

### 阶段三：同步代码

前端：

```bash
rsync -az \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.env' \
  ../todo-api-web/ \
  ubuntu@SERVER:/home/ubuntu/todo-api-web/
```

后端：

```bash
rsync -az \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dev.db' \
  --exclude '.env' \
  --exclude '.env.docker' \
  todo-api/ \
  ubuntu@SERVER:/home/ubuntu/todo-api/
```

注意：

- 不同步 `.env.docker`，除非明确确认环境变量也需要更新。
- 不同步 `node_modules`。
- 不同步本地数据库。
- 使用 `--delete` 前必须确认目标目录，避免误删服务器文件。

### 阶段四：构建前端

```bash
ssh ubuntu@SERVER '
  cd /home/ubuntu/todo-api &&
  docker compose build frontend &&
  docker compose up -d frontend
'
```

前端构建会执行：

```text
TypeScript 检查
  → Vite 构建
  → 生成 dist
  → Nginx 静态文件镜像
```

### 阶段五：构建 backend

```bash
ssh ubuntu@SERVER '
  cd /home/ubuntu/todo-api &&
  docker build -t todo-api-backend:latest . &&
  docker compose up -d backend
'
```

如果只改 backend，不需要重启 frontend。

如果只改 frontend，不需要重启 backend。

这叫做“按服务发布”，可以缩小影响范围。

### 阶段六：检查容器

```bash
docker compose ps
```

预期：

```text
backend       Up (healthy)
frontend      Up
reverse-proxy Up
```

查看日志：

```bash
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
```

## 8. 发布后的验证顺序

### 8.1 基础健康检查

```bash
curl https://longjing.online/health
```

预期：

```json
{"status":"ok","service":"todo-api"}
```

### 8.2 验证前端 API 同源

浏览器 DevTools → Network，确认请求地址是：

```text
https://longjing.online/api/...
```

不能出现：

```text
http://localhost:3000/api/...
```

### 8.3 验证认证

```bash
curl -i -X POST https://longjing.online/api/auth/register \
  -H 'Content-Type: application/json' \
  --data '{"name":"test","email":"test@example.com","password":"TestPassword123!"}'
```

预期状态码：

```text
201 Created
```

### 8.4 验证 Todo

登录后携带：

```http
Authorization: Bearer <token>
```

检查：

```text
GET  /api/todos
POST /api/todos
```

### 8.5 验证 Agent 流式接口

检查：

```text
POST /api/assistant/chat/stream
```

预期事件顺序至少包括：

```text
meta
retrieval
tool_call_start
tool_call_delta
tool_call_ready
tool_start
tool_result
token
done
```

### 8.6 验证线上构建产物

前端 index 会引用新的 hash 文件，例如：

```text
/assets/index-DrRBrQ4U.js
```

这可以确认 Nginx 已经提供新构建，而不是旧缓存。

## 9. 浏览器缓存问题

前端构建使用 hash 文件名，正常情况下新版本会生成新的资源路径。

如果用户仍看到旧逻辑：

```text
Command + Shift + R
```

或打开 DevTools 后：

```text
Network → Disable cache → Reload
```

排查顺序：

1. 查看首页引用的 JS 文件名。
2. 查看 Network 请求 URL。
3. 搜索线上 JS 是否包含 `localhost:3000`。
4. 确认 frontend 容器已经重建。
5. 确认浏览器没有 Service Worker 或缓存旧页面。

## 10. 日志如何定位问题

### 10.1 前端请求问题

浏览器 Network 查看：

- Request URL
- Request Method
- Status Code
- Request Headers
- Authorization 是否存在
- Response Body

### 10.2 Nginx 问题

```bash
sudo nginx -t
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 10.3 backend 路由问题

```bash
docker compose logs -f backend
```

重点看：

- path
- method
- statusCode
- requestId
- error
- userId
- role

### 10.4 数据库问题

如果 `/health` 正常但注册失败，优先检查：

- better-sqlite3 原生模块
- DATABASE_URL
- SQLite Volume
- Prisma 迁移
- 文件权限

## 11. 回滚流程

### 11.1 前端回滚

1. 恢复上一版 frontend 源码。
2. 重新构建 frontend。
3. 重启 frontend。
4. 浏览器强制刷新。

```bash
docker compose build frontend
docker compose up -d frontend
```

### 11.2 backend 回滚

1. 使用上一版 Dockerfile 和源码。
2. 构建 backend 镜像。
3. 重启 backend。
4. 检查健康状态。
5. 检查数据库迁移是否兼容。

```bash
docker build -t todo-api-backend:previous .
docker compose up -d backend
```

### 11.3 数据库回滚

数据库回滚不能只回滚代码。必须确认：

```text
代码版本
  ↔ Prisma Schema
  ↔ Migration
  ↔ SQLite 数据结构
```

恢复数据库前：

1. 停止 backend。
2. 备份当前数据库。
3. 恢复指定备份。
4. 启动 backend。
5. 验证业务。

## 12. 关键原理总结

### 原理一：浏览器中的 localhost

```text
localhost 永远指向当前请求发起者
```

线上前端中的 localhost 指用户电脑，不是云服务器。

### 原理二：镜像是运行时文件系统

Dockerfile 中没有 `COPY` 的项目文件，运行时通常不存在。

源代码里有 `docs`，不代表容器里有 `/app/docs`。

### 原理三：健康检查不是完整业务测试

```text
/health 成功 ≠ 数据库可用
/health 成功 ≠ 注册可用
/health 成功 ≠ Agent 可用
```

必须分别测试：

- 健康接口
- 认证
- Todo
- Agent
- SSE
- 数据持久化

### 原理四：原生依赖必须在构建阶段完成

```text
better-sqlite3
bcrypt
部分 Prisma 依赖
```

这些依赖可能需要编译。运行时重新安装会带来版本、脚本和平台差异。

### 原理五：部署只替换对应服务

前端变更只重建 frontend，backend 变更只重建 backend，可以降低发布风险。

## 13. 本次变更验收标准

- [x] 线上前端不再请求 `localhost:3000`。
- [x] 前端 Todo 请求使用同源 `/api`。
- [x] backend 镜像包含 `docs`。
- [x] RAG retrieval 事件能够返回。
- [x] backend 启动时不再使用 Pnpm 重新安装依赖。
- [x] better-sqlite3 可以加载。
- [x] 注册接口返回 201。
- [x] backend 健康检查通过。
- [x] Agent 流式接口返回 SSE 事件。
- [x] HTTPS 和域名访问正常。
- [ ] 仍需定期备份 SQLite。
- [ ] 仍建议配置 Certbot 通知邮箱。

## 14. 后续学习顺序

1. 学习 Git commit、tag 和 release。
2. 用 GitHub Actions 自动构建 Docker 镜像。
3. 使用镜像 registry 管理版本。
4. 为前端和 backend 设置独立版本号。
5. 增加数据库备份定时任务。
6. 增加 API 错误监控。
7. 增加 SSE 集成测试。
8. 将 SQLite 迁移到 PostgreSQL。
9. 学习蓝绿发布和回滚。
10. 学习多实例和负载均衡。


