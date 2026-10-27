# Todo Agent 部署方案规格文档

## 1. 文档目的

本文档用于规划 Todo Agent 项目的部署，不执行任何部署操作，也不修改现有业务代码。

目标是把当前本地开发项目部署成一个可访问、可升级、可回滚、可观测并且不会泄露 LLM 密钥的应用。

当前项目包含：

- Express + Prisma + SQLite 后端。
- React + Vite 前端。
- JWT 登录认证。
- DeepSeek Tool Calling。
- Agent Loop、Conversation History、SSE 流式响应。
- Agent Evaluation 测试。

## 2. 部署核心理论

### 2.1 开发环境和生产环境的区别

本地开发关注快速修改和调试，生产环境关注稳定性、可恢复性和安全性。

| 维度 | 开发环境 | 生产环境 |
| --- | --- | --- |
| 数据库 | SQLite、本地文件 | PostgreSQL 或托管数据库 |
| LLM Key | 本地环境变量 | Secret Manager 或服务器密钥 |
| 前端 | Vite dev server | 构建后的静态文件 |
| 后端 | tsx watch | Node.js 进程或容器 |
| HTTPS | 可以没有 | 必须启用 |
| 日志 | 控制台 | 结构化日志和集中收集 |
| 部署 | 手动启动 | CI/CD 自动发布 |
| 回滚 | 手动恢复文件 | 镜像或版本回滚 |

不能把开发环境中的启动方式直接当成生产部署方式。尤其不能把 dev.db、.env、真实 API Key 和开发端口直接暴露到公网。

### 2.2 构建和运行是两个阶段

前端部署流程：

    React/TypeScript 源代码
      → npm run build
      → dist 静态文件
      → Nginx/CDN/静态托管

后端部署流程：

    TypeScript 源代码
      → 类型检查和测试
      → 构建或使用受控运行时启动
      → Node.js 进程/容器
      → 反向代理暴露 HTTP

前端构建产物不包含后端密钥。LLM_API_KEY 只能存在于后端运行环境。

### 2.3 反向代理的作用

推荐让公网只访问一个 HTTPS 域名：

    浏览器
      ↓ HTTPS
    Nginx/Caddy
      ├── /       → React dist
      └── /api/   → Express 127.0.0.1:3000

反向代理负责：

- TLS 证书和 HTTPS。
- 静态文件缓存。
- API 路由转发。
- 请求体大小限制。
- SSE 长连接配置。
- 基础安全响应头。
- 访问日志。

## 3. 推荐部署架构

### 3.1 第一阶段：单机 Docker Compose

适合当前学习项目和小规模个人使用：

    Internet
       ↓
    Nginx/Caddy
       ├── frontend container
       └── backend container
                ├── PostgreSQL container 或托管 PostgreSQL
                └── DeepSeek API

推荐优先使用：

- 前端：Nginx 静态容器。
- 后端：Node.js 容器。
- 数据库：托管 PostgreSQL；学习 Docker 时可以先用 PostgreSQL 容器。
- 反向代理：Caddy 或 Nginx。
- 部署平台：一台云服务器、Render、Railway、Fly.io 或同类平台。

### 3.2 为什么不建议生产继续使用 SQLite

SQLite 对当前学习项目非常合适，但生产使用需要谨慎：

- 数据库是单文件，备份和恢复需要额外设计。
- 多实例部署时无法共享本地文件。
- 容器重建可能丢失文件。
- 并发写入和锁竞争能力有限。
- 云平台的临时磁盘不一定持久化。

如果只是单实例、低流量和个人使用，可以采用持久化磁盘加 SQLite；如果要学习标准生产部署，建议迁移到 PostgreSQL。

### 3.3 SSE 部署注意事项

SSE 不是普通短请求，反向代理必须：

- 禁止对 SSE 响应缓冲。
- 提高读取超时和发送超时。
- 保持 Connection 和 Cache-Control 语义。
- 支持客户端断开后的服务端清理。
- 不使用会截断长连接的默认网关配置。

SSE 的部署验收必须验证：

- token 能持续到达前端。
- tool_call 事件能持续到达前端。
- done 一定能够到达。
- LLM 异常能够返回 error 并关闭连接。
- 客户端刷新或离开页面后，后端不会无限占用资源。

## 4. 环境分层

至少定义三套环境：

### 4.1 Local

用途：日常开发。

- SQLite 开发数据库。
- 本地 Vite 和 Express。
- 可以连接测试模型，但不能提交 Key。
- 使用 mock 或 Fake LLM 进行大部分测试。

### 4.2 Staging

用途：上线前验证。

- 独立数据库。
- 独立 DeepSeek Key 或受限额度 Key。
- 与生产相同的容器和反向代理配置。
- 执行集成测试、SSE 测试和人工验收。
- 不使用真实用户数据。

### 4.3 Production

用途：真实用户访问。

- 独立数据库和密钥。
- HTTPS。
- 备份和恢复策略。
- 监控、告警、日志脱敏。
- 受控发布和回滚。

环境变量不能混用。尤其不能把生产数据库 URL 或生产 LLM Key 放进本地 .env。

## 5. 配置和密钥管理

### 5.1 后端配置

生产至少需要：

- NODE_ENV=production。
- PORT。
- DATABASE_URL。
- JWT_SECRET。
- JWT_EXPIRES_IN。
- CORS_ORIGIN。
- LLM_BASE_URL。
- LLM_MODEL。
- LLM_API_KEY。
- AGENT_MAX_STEPS。

### 5.2 密钥规则

- .env 只能用于本地，必须加入 .gitignore。
- 生产密钥使用平台 Secret、Vault、云厂商 Secret Manager 或 CI Secret。
- 日志中不能打印 Authorization、LLM_API_KEY、完整 JWT 或完整用户消息。
- 密钥轮换后旧密钥应失效。
- JWT_SECRET 变更会使旧 Token 失效，需要明确发布说明。

### 5.3 配置校验

应用启动时应区分：

- 必填配置缺失：启动失败并给出明确错误。
- 可选配置缺失：使用安全默认值。
- 生产使用开发默认值：启动失败或发出高优先级告警。

不建议让服务启动后才在第一次用户请求时发现 LLM_API_KEY 缺失。

## 6. 数据库部署方案

### 6.1 迁移流程

推荐流程：

    编写 Prisma schema
      → 本地生成 migration
      → 在 staging 执行迁移
      → 运行数据和接口验证
      → 生产执行迁移
      → 启动新版本应用

生产环境禁止使用会意外删除数据的 schema push 作为常规发布步骤。生产应使用版本化 migration。

### 6.2 迁移安全

- 迁移前备份数据库。
- 迁移必须可审查。
- 大表变更要考虑锁和耗时。
- 破坏性字段删除要分多次发布。
- 新代码先兼容旧 schema，再删除旧字段。
- 迁移失败时停止发布，不自动覆盖数据库。

### 6.3 备份和恢复

至少定义：

- 备份频率。
- 保留周期。
- 加密方式。
- 恢复演练频率。
- 恢复目标时间 RTO。
- 可接受数据丢失窗口 RPO。

对学习项目可以先做到每天备份和手动恢复；进入生产后再引入自动备份和恢复演练。

## 7. 后端运行设计

### 7.1 进程管理

后端进程必须支持：

- 启动失败退出非零状态。
- SIGTERM 优雅关闭。
- 数据库连接关闭。
- 正在处理的请求有有限等待时间。
- 退出前停止接收新请求。
- 被进程管理器自动拉起。

可选运行方式：

- Docker restart policy。
- systemd。
- PM2。
- 云平台托管进程。

Docker 场景下通常让容器只运行一个 Node 进程，由平台负责重启和扩容。

### 7.2 健康检查

建议增加三个层次：

- liveness：进程是否存活。
- readiness：数据库和必要依赖是否可用。
- dependency check：LLM 服务是否可调用，但不能因为单次 LLM 波动导致整个服务被判定为不可用。

健康检查不应调用会产生副作用的 Agent 工具。

### 7.3 超时和限流

至少配置：

- HTTP 请求超时。
- LLM 请求超时。
- SSE 最大持续时间。
- Agent 最大 Loop 步数。
- 单用户并发请求限制。
- 单用户每日或每分钟 LLM 调用额度。

不能仅依赖模型自己停止。后端必须有硬限制。

## 8. 前端部署方案

### 8.1 构建

前端发布前执行：

    pnpm install --frozen-lockfile
    pnpm exec tsc -b
    pnpm exec vite build

构建产物为 dist，不部署 src、node_modules 或本地 .env。

### 8.2 API 地址

推荐生产前端使用同源路径：

    https://todo.example.com
    https://todo.example.com/api/...

同源可以减少 CORS、Cookie 和环境配置复杂度。如果前后端分域，必须显式配置：

- CORS_ORIGIN。
- Authorization 头。
- 预检 OPTIONS。
- HTTPS。
- Token 存储和刷新策略。

### 8.3 SPA 路由

React Router 的 history 路由需要反向代理把未知前端路径回退到 index.html，否则直接访问 /assistant 或刷新页面会返回 404。

## 9. CI/CD 方案

### 9.1 Pull Request 阶段

每次提交建议执行：

    后端 TypeScript 检查
    前端 TypeScript 检查
    格式化检查
    Agent Evaluation
    前端构建
    后端测试

PR 阶段不调用真实 DeepSeek，避免成本和不稳定性。

### 9.2 Staging 发布阶段

- 构建不可变镜像。
- 发布到 staging。
- 执行数据库迁移。
- 执行健康检查。
- 执行 SSE 冒烟测试。
- 执行一组受控真实模型测试。
- 人工确认 Todo 查询、创建、删除和多轮对话。

### 9.3 Production 发布阶段

建议采用：

    main 合并
      → CI 通过
      → 构建镜像并打版本号
      → staging 验证
      → 人工批准
      → 生产备份
      → 执行 migration
      → 滚动发布
      → 健康检查
      → 观察窗口

镜像必须使用不可变版本号，不能只使用 latest。

## 10. 观测和告警

### 10.1 结构化日志

每次请求至少记录：

- requestId。
- route。
- statusCode。
- durationMs。
- userId 的脱敏值或内部 ID。
- conversationId。
- toolName。
- errorCode。
- model latency。
- tool latency。

不要记录：

- LLM API Key。
- JWT 原文。
- Authorization 原文。
- 完整用户隐私内容。
- 未脱敏的工具参数。

### 10.2 Agent 指标

建议统计：

- Agent 请求数量。
- LLM 调用次数。
- 平均 Agent Loop 步数。
- 工具调用成功率。
- 工具错误率。
- confirmation 接受率和拒绝率。
- SSE 中途断开率。
- LLM 超时率。
- Token 或费用估算。
- 跨用户权限拒绝次数。

### 10.3 告警

优先告警：

- 数据库连接失败。
- migration 失败。
- LLM 错误率持续升高。
- SSE 大量超时。
- 权限拒绝异常增加。
- Agent 最大步数触发。
- 磁盘空间不足。
- 备份失败。

## 11. 安全方案

- 所有公网流量使用 HTTPS。
- JWT_SECRET 使用高熵随机值。
- CORS 只允许明确域名。
- 生产关闭详细错误堆栈返回。
- 统一限制请求体大小。
- 对登录和 Agent 接口限流。
- LLM 输出不能直接作为 SQL、文件路径或系统命令执行。
- Tool Executor 统一校验参数和权限。
- 删除、批量操作等副作用操作默认需要确认。
- 对 Prompt Injection 和敏感数据外泄增加 Evaluation 用例。
- 依赖定期审计和升级。

## 12. 回滚方案

### 12.1 应用回滚

- 保留上一个稳定镜像。
- 回滚前端静态资源版本。
- 回滚后端容器版本。
- 检查数据库 schema 是否向后兼容。
- 回滚后执行健康检查和核心接口测试。

### 12.2 数据库回滚

数据库回滚比代码回滚风险更高。优先采用向后兼容迁移，而不是直接撤销 migration。

发布顺序应尽量遵循：

1. 增加新字段或新表。
2. 发布兼容旧数据的新代码。
3. 回填数据。
4. 切换读取逻辑。
5. 经过观察期后再删除旧结构。

## 13. 分阶段实施计划

### Phase 0：部署前审计

- 确认所有启动命令。
- 确认环境变量。
- 确认前后端构建命令。
- 确认测试和格式化命令。
- 检查仓库中是否存在密钥。
- 检查 dev.db 是否被错误纳入发布。

### Phase 1：本地容器化

- 编写后端 Dockerfile。
- 编写前端多阶段 Dockerfile。
- 编写 docker-compose 本地环境。
- 配置服务间网络。
- 验证 API、前端和 SSE。

### Phase 2：数据库生产化

- 评估 SQLite 保留或迁移 PostgreSQL。
- 配置独立数据库。
- 验证 Prisma migration deploy。
- 增加备份和恢复演练。

### Phase 3：反向代理和 HTTPS

- 配置域名。
- 配置证书。
- 配置 /api 代理。
- 配置 SPA fallback。
- 配置 SSE 长连接参数。

### Phase 4：CI/CD

- 配置 lint、typecheck、test、build。
- 构建版本化镜像。
- 发布 staging。
- 增加人工批准后发布生产。
- 保留回滚版本。

### Phase 5：观测和安全

- 增加 health/readiness。
- 接入结构化日志。
- 增加 Agent 指标。
- 配置告警。
- 执行安全检查和密钥轮换演练。

## 14. 推荐命令契约

后续实现前应统一以下命令：

    pnpm install --frozen-lockfile
    pnpm test
    pnpm test:agent
    pnpm test:agent:integration
    pnpm exec tsc --noEmit
    pnpm format:check
    pnpm run build

前端：

    pnpm install --frozen-lockfile
    pnpm exec tsc -b
    pnpm run build
    pnpm run lint

如果项目命令发生变化，应同步更新本 spec。

## 15. 上线验收标准

### 功能

- 用户可以注册、登录和退出。
- Todo 查询、创建、删除正常。
- Agent Tool Calling 正常。
- 删除操作不会绕过确认。
- 多轮 Conversation 正常。
- SSE 能持续输出并正常结束。

### 数据

- 生产使用独立数据库。
- migration 已执行并可审计。
- 备份已成功。
- 恢复演练已完成。
- 开发数据未进入生产。

### 安全

- HTTPS 正常。
- 密钥不在代码和镜像中。
- CORS 为明确域名。
- 跨用户访问被拒绝。
- 日志无 Token 和 API Key。
- 登录和 Agent 接口具有限流。

### 稳定性

- 健康检查通过。
- LLM 超时有明确错误。
- SSE 异常会关闭连接。
- Agent 最大步数生效。
- 旧版本可回滚。

### 质量门槛

- TypeScript 检查通过。
- 格式化检查通过。
- Agent Evaluation 通过。
- 前端构建通过。
- staging 冒烟测试通过。
- 发布和回滚步骤有书面记录。

## 16. 边界和待确认事项

### 始终执行

- 先在 staging 验证，再发布生产。
- 使用版本化 migration。
- 使用独立数据库和密钥。
- 发布前运行测试和构建。
- 发布后观察日志、指标和 SSE。

### 需要确认

- 是否迁移到 PostgreSQL。
- 选择哪家云平台或服务器。
- 是否使用 Docker Compose、托管平台或 Kubernetes。
- 是否需要自定义域名和 HTTPS。
- 真实模型测试是否允许产生费用。
- 备份保留周期和 RTO/RPO 目标。

### 禁止执行

- 不确认就修改生产数据库。
- 将 .env、JWT_SECRET 或 LLM_API_KEY 提交到仓库。
- 直接使用 dev.db 作为生产数据库。
- 使用 schema push 替代生产 migration 流程。
- 没有备份就执行破坏性迁移。
- 用真实用户数据运行 Evaluation 测试。

## 17. 推荐的第一步

部署实现开始前，先完成部署前审计并做出两个决定：

1. 学习部署阶段是否继续使用 SQLite，还是直接迁移 PostgreSQL。
2. 第一版部署目标是单机 Docker Compose，还是使用托管平台。

对于当前项目，推荐学习路径是：

    本地 Docker Compose
      → staging 单机部署
      → PostgreSQL
      → HTTPS 和反向代理
      → CI/CD
      → 监控和备份

这样每一步都能理解部署原理，同时不会一开始引入 Kubernetes 等超出当前项目规模的复杂度。
