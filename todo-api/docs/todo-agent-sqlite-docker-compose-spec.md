# Todo Agent SQLite + Docker Compose 第一版部署规格

## 1. 文档目的

本文档用于规划 Todo Agent 的第一版容器化部署方案：使用 SQLite 保存数据，使用 Docker Compose 编排前端、后端和反向代理。

本阶段只生成方案和学习资料，不执行 Docker 命令、不修改 Dockerfile、不启动容器。

本阶段目标不是构建高可用生产集群，而是通过一个可运行、可持久化、可验证和可回滚的单机部署，系统学习部署基础。

## 2. 当前项目基线

项目包含：

- 后端：Node.js + Express + TypeScript。
- ORM：Prisma。
- 数据库：SQLite。
- 前端：React + Vite + TypeScript。
- 认证：JWT。
- Agent：DeepSeek Tool Calling、Agent Loop。
- 流式接口：SSE。
- 前端 API：/api/*。

当前本地目录：

    todo-api/
      src/
      prisma/
      dev.db
      package.json
      .env

    todo-api-web/
      src/
      package.json
      vite.config.ts

部署时不能将开发数据库、开发环境变量和真实 API Key 直接复制进镜像。

## 3. 目标架构

第一版采用单机 Docker Compose：

    浏览器
       ↓ HTTP/HTTPS
    reverse-proxy
       ├── /       → frontend
       └── /api/   → backend:3000
                         ├── SQLite /app/data/todo.db
                         └── DeepSeek API

推荐服务：

| 服务 | 作用 | 对外暴露 |
| --- | --- | --- |
| reverse-proxy | 统一入口、静态文件、API 转发、SSE 配置 | 80/443 |
| frontend | 托管 React 构建产物 | 仅 Compose 内部 |
| backend | Express API 和 Agent | 仅 Compose 内部 |
| volume | 保存 SQLite 数据 | 不对外暴露 |

如果使用 Nginx 多阶段构建，也可以把 frontend 静态文件直接打包进 reverse-proxy，此时运行服务可以简化为 proxy + backend。学习阶段建议先保留 frontend 服务，理解服务边界后再合并。

## 4. 核心知识点和原理

### 4.1 镜像和容器

镜像是应用运行环境的不可变模板，容器是镜像的运行实例。

镜像应包含：

- 运行时。
- 依赖。
- 编译后的代码或静态文件。
- 启动命令。

镜像不应包含：

- 生产密钥。
- SQLite 运行数据。
- 用户上传文件。
- 临时日志。

这些内容应通过环境变量、Secret 或 Volume 注入。

### 4.2 Docker Compose

Compose 用一个声明式文件描述多个容器、网络、Volume、环境变量和健康检查。

服务之间通过 service name 通信：

    backend:3000

前端浏览器不能直接访问 backend 这个内部服务名。浏览器请求应发送到同源的 /api，反向代理再转发到 backend:3000。

### 4.3 SQLite 文件和 Volume

SQLite 的本质是一个文件数据库。容器文件系统是临时的：

    容器删除/重建
      → 容器内部文件可能丢失

因此必须把数据库文件放在 Volume：

    /app/data/todo.db
      → sqlite-data:/app/data

Volume 的作用是让数据生命周期独立于容器生命周期：

    更新 backend 镜像
      → 删除旧容器
      → 创建新容器
      → 重新挂载 sqlite-data
      → 数据仍然存在

### 4.4 SQLite 适用边界

SQLite + Compose 适合：

- 个人项目。
- 单机部署。
- 单个后端实例。
- 低并发写入。
- 学习容器化和发布流程。

不适合：

- 多个后端实例同时写同一个本地文件。
- 多主机共享数据库文件。
- 高并发写入。
- 高可用数据库集群。
- 云平台临时磁盘而没有持久化 Volume。

### 4.5 前端构建和运行分离

React 开发服务器不应作为生产静态文件服务器。生产流程是：

    TypeScript/React 源码
      → pnpm run build
      → dist/
      → Nginx 提供静态文件

这叫多阶段构建：第一阶段安装依赖并构建，第二阶段只复制 dist 到轻量 Web Server 镜像。

好处：

- 镜像更小。
- 运行时不需要 Node 开发依赖。
- 不暴露源代码。
- 静态文件缓存更简单。

### 4.6 后端运行和启动命令

后端容器应使用生产启动方式：

    安装锁定依赖
      → Prisma Client 生成
      → TypeScript 检查/构建
      → Node 启动编译后的服务

不应在生产容器中使用开发模式的 tsx watch，因为它会：

- 监听文件变化。
- 消耗额外资源。
- 依赖开发目录挂载。
- 掩盖真实构建错误。

### 4.7 同源 API 和 CORS

推荐前端访问：

    /api/auth/login
    /api/todos
    /api/assistant/chat

由反向代理转发到 backend。这样浏览器看到的是同一个域名，减少 CORS 配置和环境差异。

### 4.8 SSE 反向代理

Agent 流式请求不是普通 JSON 请求，反向代理必须保证：

- 不缓冲 text/event-stream。
- 不过早关闭连接。
- 设置合理的读取超时。
- 保留 Cache-Control: no-cache。
- 支持长连接。
- 客户端断开时后端可以释放 LLM 请求。

SSE 验收不能只检查 HTTP 200，还要检查 token、tool_call、tool_result、error 和 done 事件。

## 5. 目录和文件规划

建议增加：

    todo-api/
      Dockerfile
      .dockerignore
      docker-compose.yml
      docker/
        nginx.conf
      deploy/
        .env.example
        backup-sqlite.sh
        restore-sqlite.sh

生产数据库文件建议通过 Volume 管理，不直接提交 data/todo.db。

建议 .dockerignore 排除：

- node_modules。
- .env。
- dev.db。
- data/。
- test-results/。
- coverage/。
- .git。
- 本地日志。

## 6. 环境变量方案

### 6.1 Compose 层变量

- APP_PORT：主机对外端口。
- BACKEND_PORT：后端内部端口。
- CORS_ORIGIN：允许的前端域名。
- DATABASE_URL：容器内 SQLite 路径。
- JWT_SECRET：JWT 签名密钥。
- JWT_EXPIRES_IN：Token 有效期。
- LLM_BASE_URL：DeepSeek API 地址。
- LLM_MODEL：使用的模型。
- LLM_API_KEY：DeepSeek 密钥。
- AGENT_MAX_STEPS：Agent 最大步数。

### 6.2 SQLite URL

容器内数据库 URL 必须指向 Volume 挂载路径，例如：

    file:/app/data/todo.db

不能继续依赖本地工作目录中的相对 dev.db，否则容易出现：

- 容器内找不到数据库。
- 数据写入容器临时层。
- 测试、开发和生产数据库混用。

### 6.3 Secret 安全

- 只提交 .env.example，不提交 .env。
- 不在 Dockerfile 中写入密钥。
- 不在前端环境变量中放 LLM_API_KEY。
- 不在日志中打印完整环境变量。
- 生产环境使用部署平台 Secret。
- 发现密钥泄露时立即轮换，不能只删除 Git 文件。

## 7. SQLite 持久化和备份方案

### 7.1 Volume 生命周期

需要理解三种操作：

- 重启容器：Volume 不变，数据保留。
- 重建容器：Volume 仍应保留，数据保留。
- 删除 Volume：数据库数据丢失，必须谨慎。

部署脚本和文档中禁止默认执行会删除 Volume 的命令。

### 7.2 备份

第一版可以使用 SQLite 文件备份：

    停止写入或使用 SQLite 一致性备份
      → 复制 todo.db
      → 压缩并加密
      → 保存到独立位置

备份至少包含：

- 数据库文件。
- 备份时间。
- 应用版本。
- schema/migration 版本。

不能只备份 Docker 镜像，因为镜像不包含运行时数据库数据。

### 7.3 恢复

恢复流程：

1. 停止 backend 写入。
2. 备份当前数据库，避免覆盖后无法回退。
3. 替换 Volume 中的数据库文件。
4. 检查文件权限。
5. 启动 backend。
6. 执行健康检查和核心查询。
7. 检查用户、Todo、Conversation 数据。

必须定期做恢复演练，备份存在不等于恢复可用。

## 8. Compose 服务设计

### 8.1 backend

职责：

- 启动 Express。
- 连接 SQLite Volume。
- 连接 DeepSeek。
- 提供 API、SSE 和 Agent。

设计要求：

- 使用非 root 用户运行。
- 只暴露内部端口。
- 设置 restart 策略。
- 添加 healthcheck。
- 配置优雅关闭。
- 限制日志大小。

### 8.2 frontend

职责：

- 提供 React dist。
- SPA fallback 到 index.html。
- 静态资源缓存。

设计要求：

- 不包含后端密钥。
- 不直接暴露 backend 地址给浏览器。
- 配置 /api 由 proxy 处理。

### 8.3 reverse-proxy

职责：

- 接收公网请求。
- 提供前端静态文件或转发 frontend。
- 转发 /api 到 backend。
- 配置 SSE。
- 后续提供 HTTPS。

## 9. 健康检查和启动顺序

推荐启动关系：

    Volume ready
      → backend starts
      → backend healthcheck passes
      → reverse-proxy routes traffic

健康检查应使用只读接口，例如：

    GET /health

readiness 可以检查：

- 进程可响应。
- SQLite 可读写。
- 必要 schema 存在。

不建议健康检查调用 DeepSeek，因为外部 API 短暂不可用时，不应让整个 Todo API 被平台反复重启。

## 10. 版本发布流程

### 10.1 本地构建验证

    pnpm install --frozen-lockfile
    pnpm exec tsc --noEmit
    pnpm test:agent
    pnpm run build

前端：

    pnpm install --frozen-lockfile
    pnpm exec tsc -b
    pnpm run build

### 10.2 镜像构建验证

    docker compose config
    docker compose build
    docker compose up -d
    docker compose ps
    docker compose logs backend
    docker compose logs reverse-proxy

### 10.3 功能冒烟测试

1. 打开前端首页。
2. 注册用户。
3. 登录并获取 Token。
4. 创建 Todo。
5. 查询 Todo。
6. 查询未完成 Todo并确认图表显示。
7. 通过 Agent 创建 Todo。
8. 通过 Agent 查询 Todo。
9. 发起删除并确认人工确认流程。
10. 测试流式聊天的 token 和 done 事件。
11. 重启 backend 容器。
12. 确认 Todo 数据仍然存在。

## 11. 故障排查方法

### 前端打不开

检查顺序：

1. reverse-proxy 容器是否运行。
2. frontend 是否构建成功。
3. SPA fallback 是否配置。
4. 浏览器 Network 是否返回静态资源 404。
5. 端口和防火墙是否正确。

### API 404 或 502

检查：

- proxy 的 /api 路由。
- backend 服务名和端口。
- backend 是否监听 0.0.0.0 而不是 127.0.0.1。
- 容器内部网络是否可解析 backend。
- CORS 和 Authorization 头是否保留。

### Todo 数据重启后消失

优先检查：

- 是否挂载了 sqlite-data Volume。
- DATABASE_URL 是否指向 /app/data/todo.db。
- 是否误执行 down -v。
- 容器实际使用的数据库路径。
- backup 是否来自正确环境。

### SSE 一直等待

检查：

- proxy 是否缓冲 SSE。
- backend 是否发送 done。
- 异常时是否发送 error 并关闭连接。
- 前端是否处理 done、error 和超时。
- LLM 请求是否一直没有返回。

## 12. 安全边界

### 始终执行

- 使用独立 Volume 保存 SQLite。
- 使用 .env.example 描述配置。
- 生产密钥通过 Secret 注入。
- 发布前运行测试和构建。
- 发布后检查健康状态和日志。
- 定期备份并演练恢复。

### 需要确认

- 是否暴露公网端口。
- 是否配置自定义域名和 HTTPS。
- 是否把 Caddy/Nginx 放入 Compose。
- 是否保留 SQLite 作为长期生产数据库。
- 是否加入自动备份。
- 是否允许真实 DeepSeek smoke test 产生费用。

### 禁止执行

- 不提交 .env、JWT_SECRET 或 LLM_API_KEY。
- 不把 dev.db 复制到生产镜像。
- 不使用没有持久化 Volume 的 SQLite 部署。
- 不在公网直接暴露 backend 调试端口。
- 不用 docker compose down -v 作为日常重启命令。
- 不在没有备份的情况下覆盖数据库。
- 不把真实用户数据用于测试环境。

## 13. 第一版验收标准

### 容器

- frontend、backend、reverse-proxy 能正常启动。
- 服务状态和健康检查可见。
- backend 不以 root 用户运行。
- 镜像不包含 .env 和数据库文件。

### 数据

- 创建 Todo 后重启 backend，数据仍存在。
- 重建 backend 容器，数据仍存在。
- 删除并重新挂载 Volume 前有明确警告。
- 可以从备份恢复用户和 Todo。

### Agent

- Tool Calling 可以访问 DeepSeek。
- Agent Loop 最大步数生效。
- 删除 confirmation 正常。
- SSE token、tool result、error、done 可观察。
- 模型异常不会导致连接永久挂起。

### 前端

- 直接访问 /assistant 不返回 404。
- 前端请求通过 /api 同源转发。
- Todo 表格和比例图表正常显示。
- 登录、创建、查询、删除流程可用。

### 质量

- 后端 TypeScript 检查通过。
- 前端 TypeScript 检查通过。
- Agent Evaluation 通过。
- Docker Compose 配置检查通过。
- 有一份可执行的启动、停止、备份和恢复说明。

## 14. 学习重点总结

完成这一阶段后，应能回答：

1. 为什么容器删除后数据会丢失？
2. Volume 和镜像的生命周期有什么区别？
3. 为什么前端生产环境不使用 Vite dev server？
4. 为什么浏览器访问 /api，而不是直接访问 backend:3000？
5. 为什么 SSE 需要特殊的代理配置？
6. 为什么 LLM_API_KEY 只能放后端？
7. 为什么生产迁移不能随意使用 schema push？
8. 为什么单机 SQLite 不能直接扩展到多实例？
9. 如何证明容器重启后 Todo 数据没有丢失？
10. 如果发布失败，如何回滚应用而不破坏数据库？

## 15. 后续演进

第一版完成后按以下顺序演进：

    SQLite + Compose 单机部署
      → SQLite 备份和恢复
      → HTTPS 和域名
      → CI/CD
      → PostgreSQL
      → Redis 和并发控制
      → 监控和告警
      → 多实例部署

不要在 SQLite 单机部署还没有验证持久化、备份、恢复和 SSE 的情况下，直接引入 Kubernetes。部署学习的重点是理解每一层的责任，而不是堆叠工具数量。
