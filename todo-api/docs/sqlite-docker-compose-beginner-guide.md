# Todo Agent 部署入门教程

## SQLite + Docker Compose 版本

这份教程面向第一次接触 Docker 和部署的前端工程师。

你将学习如何把当前 Todo Agent 项目从本地开发状态，部署成一组可以通过浏览器访问的 Docker 服务。

最终结构如下：

    浏览器
      ↓
    Nginx 反向代理
      ├── React 前端
      └── Express 后端
              ├── SQLite 数据库
              └── DeepSeek API

本教程使用 SQLite，适合学习第一版部署。它适合单机和低并发场景，不是最终的高可用生产方案。

## 1. 先理解几个概念

### 1.1 什么是镜像

镜像可以理解为一个“应用安装包模板”，里面包含：

- Node.js。
- 项目依赖。
- 项目代码或构建产物。
- 启动命令。

### 1.2 什么是容器

容器是镜像运行起来后的实例。

可以这样理解：

    Dockerfile → 镜像 → 容器

镜像可以重复创建多个容器。

### 1.3 什么是 Docker Compose

当前项目不是一个服务，而是多个服务：

- backend：后端 API。
- frontend：React 静态页面。
- reverse-proxy：统一入口。

Docker Compose 用一个 docker-compose.yml 文件描述这些服务，并负责启动、停止和连接它们。

### 1.4 什么是 Volume

容器本身可以被删除和重建。SQLite 是一个数据库文件，如果直接放在容器内部，容器删除后数据可能消失。

Volume 用于保存需要长期存在的数据：

    容器被重建
      → Volume 保留
      → SQLite 数据保留

当前项目的数据库 Volume 名称是：

    todo-api_sqlite-data

## 2. 准备环境

### 2.1 必须安装的软件

请先安装：

- Docker Desktop。
- Git。
- Node.js 22 或更高版本。
- pnpm。

本地开发环境可以使用 Node.js 和 pnpm；Docker 构建时会在容器中重新安装依赖。

检查是否安装成功：

    docker --version
    docker compose version
    node --version
    pnpm --version

如果 Docker Desktop 没有启动，后续 docker compose 命令会连接失败。

## 3. 确认项目目录

当前目录结构应该类似：

    /Users/wangzhihao/Desktop/longjing/node/todo/
      todo-api/
        Dockerfile
        docker-compose.yml
        docker/
        prisma/
        src/
        package.json
      todo-api-web/
        Dockerfile
        docker/
        src/
        package.json

进入后端项目目录：

    cd /Users/wangzhihao/Desktop/longjing/node/todo/todo-api

后续 Docker Compose 命令都在这个目录执行。

## 4. 先做本地代码检查

部署前先确认代码本身没有明显问题。

### 4.1 后端类型检查

    pnpm exec tsc --noEmit

### 4.2 前端类型检查

    cd ../todo-api-web
    pnpm exec tsc --noEmit -p tsconfig.app.json

### 4.3 返回后端目录

    cd ../todo-api

### 4.4 运行 Agent 测试

    pnpm test:agent

这些测试使用 Fake LLM，不会调用真实 DeepSeek，也不会产生模型费用。

## 5. 创建 Docker 环境变量文件

在后端项目目录执行：

    cp .env.docker.example .env.docker

然后编辑 .env.docker：

    NODE_ENV=production
    JWT_SECRET=替换成随机长字符串
    JWT_EXPIRES_IN=1h
    CORS_ORIGIN=http://localhost:8080
    LLM_BASE_URL=https://api.deepseek.com
    LLM_MODEL=deepseek-chat
    LLM_API_KEY=替换成你的DeepSeek密钥
    AGENT_MAX_STEPS=6

### 5.1 JWT_SECRET 是什么

JWT_SECRET 用于签发和验证登录 Token。

不要使用：

    123456
    secret
    todo

可以生成随机值：

    openssl rand -hex 32

把生成结果复制到 JWT_SECRET。

### 5.2 LLM_API_KEY 的注意事项

- 只放在后端 .env.docker。
- 不要放进 React 前端代码。
- 不要提交到 Git。
- 不要截图分享。
- 不要打印到日志。

项目已经将 .env.docker 加入 .gitignore。

## 6. 检查 Compose 配置

执行：

    docker compose config

这个命令不会启动服务，只会解析并展示最终配置。

重点检查：

- backend 的 DATABASE_URL 是 file:/app/data/todo.db。
- backend 使用 sqlite-data Volume。
- backend 没有直接暴露公网端口。
- reverse-proxy 暴露 8080 端口。
- frontend 没有 LLM_API_KEY。
- reverse-proxy 的 /api 路由指向 backend:3000。

如果看到配置错误，先不要启动，先修复配置。

## 7. 构建 Docker 镜像

第一次构建执行：

    docker compose build

这个过程会：

1. 下载 Node.js 基础镜像。
2. 下载 Nginx 基础镜像。
3. 安装后端依赖。
4. 安装前端依赖。
5. 生成 Prisma Client。
6. 编译 React 前端。
7. 生成 backend 和 frontend 镜像。

第一次构建可能需要几分钟，后续会使用 Docker 缓存。

如果只修改前端，可以使用：

    docker compose build frontend

如果只修改后端，可以使用：

    docker compose build backend

## 8. 启动服务

执行：

    docker compose up -d

参数说明：

- up：启动服务。
- -d：后台运行，不占用当前终端。

启动时 backend 会执行：

1. 启动容器。
2. 挂载 SQLite Volume。
3. 执行 Prisma migration。
4. 启动 Express API。
5. 等待健康检查通过。

之后 reverse-proxy 才会开始转发流量。

## 9. 查看服务状态

    docker compose ps

正常情况下，你会看到三个服务：

- backend：Up 或 healthy。
- frontend：Up。
- reverse-proxy：Up。

如果 backend 显示 unhealthy，先查看后端日志：

    docker compose logs backend

## 10. 访问应用

浏览器访问：

    http://localhost:8080

你应该能看到 Todo 前端页面。

健康检查访问：

    curl http://localhost:8080/health

预期结果类似：

    {"status":"ok","service":"todo-api"}

API 请求应该通过：

    http://localhost:8080/api/...

浏览器不应该直接访问：

    http://localhost:3000

因为 backend 只在 Compose 内部网络中暴露。

## 11. 完整功能验证

### 11.1 注册

打开注册页面，创建一个测试账号。

### 11.2 登录

登录后进入 Todo 页面。

### 11.3 创建 Todo

创建：

    学习 Docker Compose

确认列表中出现该任务。

### 11.4 查询 Todo

进入任务助手，输入：

    查看我的 Todo

检查：

- 返回了 Todo 表格。
- 完成比例图表显示。
- 调试面板能看到 list_todos。

### 11.5 创建 Todo Agent

输入：

    创建一个 Todo：学习 Docker 部署

检查：

- Agent 调用了 create_todo。
- Todo 出现在列表中。
- userId 是当前登录用户。

### 11.6 删除确认

输入：

    删除学习 Docker 部署

检查：

- Agent 没有直接删除。
- 页面显示需要人工确认。
- 点击确认后 Todo 才消失。

### 11.7 SSE 流式响应

打开调试面板，检查是否可以看到：

- meta。
- tool_call_start。
- tool_call_delta。
- tool_call_ready。
- tool_start。
- tool_result。
- token。
- done。

如果模型或工具异常，应看到 error，并且请求最终结束，不能一直显示正在执行工具。

## 12. 验证数据持久化

这是第一次部署最重要的实验。

### 12.1 创建数据

在网页中创建一个 Todo，例如：

    Volume 持久化测试

### 12.2 重启 backend

    docker compose restart backend

等待几秒后刷新页面，确认 Todo 仍然存在。

### 12.3 重建 backend 容器

    docker compose up -d --force-recreate backend

再次刷新页面，确认 Todo 仍然存在。

### 12.4 查看 Volume

    docker volume ls

查看项目 Volume：

    docker volume inspect todo-api_sqlite-data

不要删除这个 Volume。

## 13. 查看日志

查看所有服务日志：

    docker compose logs

只查看后端：

    docker compose logs backend

持续查看：

    docker compose logs -f backend

停止持续查看：

    Ctrl + C

重点关注：

- 数据库迁移失败。
- JWT_SECRET 缺失。
- LLM_API_KEY 缺失。
- Prisma 连接失败。
- SSE 请求失败。
- 未捕获异常。

## 14. 常用 Docker 命令

### 查看运行中的容器

    docker ps

### 停止服务但保留数据

    docker compose down

### 再次启动

    docker compose up -d

### 重启单个服务

    docker compose restart backend

### 进入 backend 容器

    docker compose exec backend sh

进入后可以查看：

    ls -la /app
    ls -la /app/data

退出容器：

    exit

### 查看容器环境变量

只建议查看非敏感配置，不要把输出发到公共渠道：

    docker compose exec backend printenv NODE_ENV
    docker compose exec backend printenv DATABASE_URL

## 15. SQLite 备份

最简单的学习版备份方式是复制数据库文件。

先查看 Volume：

    docker volume inspect todo-api_sqlite-data

生产环境不要只依赖手工复制。至少应该：

- 定期备份。
- 将备份保存到独立位置。
- 对备份加密。
- 记录备份时间和应用版本。
- 定期验证恢复。

备份前尽量暂停写入，或者使用 SQLite 官方一致性备份方式，避免复制到半写入状态的文件。

## 16. 恢复数据的思路

恢复前不要直接覆盖当前数据库。

建议流程：

1. 停止 backend。
2. 备份当前 SQLite 文件。
3. 将备份文件放入 Volume。
4. 确认文件权限。
5. 启动 backend。
6. 访问 /health。
7. 登录并查询 Todo。
8. 确认 Conversation 和 Agent 功能。

## 17. 停止和清理

### 17.1 普通停止

    docker compose down

这会停止并删除容器，但保留 Volume。

### 17.2 重新构建

    docker compose build
    docker compose up -d

### 17.3 危险命令

    docker compose down -v

这个命令会删除 Compose Volume，可能导致 SQLite 数据丢失。

学习阶段除非你明确要清空所有测试数据，否则不要执行。

## 18. 常见问题

### 问题一：docker compose 找不到 Docker daemon

原因：Docker Desktop 没启动。

处理：启动 Docker Desktop 后重试。

### 问题二：backend 启动后不断重启

查看日志：

    docker compose logs backend

常见原因：

- JWT_SECRET 未配置。
- DATABASE_URL 错误。
- Prisma migration 失败。
- SQLite 文件权限问题。
- 依赖安装失败。

### 问题三：浏览器能打开页面，但 API 失败

检查：

- 浏览器 Network 请求是否是 /api 开头。
- reverse-proxy 是否运行。
- backend 是否 healthy。
- Nginx 配置是否正确。
- Authorization 头是否存在。

### 问题四：刷新 /assistant 变成 404

检查 frontend Nginx 是否包含：

    try_files $uri $uri/ /index.html;

这是 React SPA history 路由必须的配置。

### 问题五：Todo 重启后消失

检查：

- 是否执行过 docker compose down -v。
- backend 是否挂载 sqlite-data。
- DATABASE_URL 是否是 /app/data/todo.db。
- 是否连接到了错误的数据库。

### 问题六：Agent 一直显示正在执行工具

检查：

- 后端是否发送 done 或 error。
- Nginx 是否关闭 proxy_buffering。
- LLM_API_KEY 是否有效。
- DeepSeek 请求是否超时。
- 浏览器 Network 中流式响应是否持续返回数据。

## 19. 这次部署你应该吸收的知识点

完成本教程后，应能解释：

1. Dockerfile 如何把项目变成镜像。
2. Compose 如何管理多个服务。
3. 容器为什么不是永久存储。
4. Volume 为什么能保存 SQLite 数据。
5. 前端为什么要先 build 再由 Nginx 提供。
6. API 为什么通过 /api 转发。
7. SSE 为什么需要关闭代理缓冲。
8. 密钥为什么只能在后端。
9. migration 为什么应该在后端启动时执行或作为发布步骤执行。
10. 为什么 SQLite 只适合单机单实例阶段。

## 20. 第一版完成标准

当以下条件全部满足时，说明第一版部署完成：

- Docker Compose 配置检查通过。
- 前端和后端镜像构建成功。
- 三个服务正常运行。
- /health 返回成功。
- 浏览器可以访问前端。
- 用户可以注册登录。
- Todo 可以创建和查询。
- Agent 可以调用工具。
- SSE 可以正常结束。
- backend 重启后 Todo 数据仍存在。
- 不执行 down -v 的情况下可以反复发布。
- .env.docker 没有提交到 Git。

## 21. 下一步学习

完成 SQLite + Docker Compose 后，再学习：

1. HTTPS 和域名。
2. 自动化 CI/CD。
3. SQLite 自动备份。
4. PostgreSQL 迁移。
5. Redis 和并发控制。
6. 监控和告警。
7. 多实例部署。

不要一开始就学习 Kubernetes。先把单机容器、数据持久化、日志、备份、SSE 和回滚理解清楚，再进入更复杂的编排系统。
