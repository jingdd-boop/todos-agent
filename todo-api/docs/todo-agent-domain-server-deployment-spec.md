# Todo Agent 域名服务器部署 Spec（初学者版）

## 1. 目标

把当前 Todo Agent 从本地 Docker Compose 部署到云服务器，并通过域名和 HTTPS 让其他人访问。

目标地址：

```text
https://example.com
```

本阶段继续使用 SQLite + Docker Compose，暂不引入 Kubernetes、PostgreSQL 或自动扩容。

## 2. 当前项目与架构

```text
浏览器
  ↓ https://example.com
DNS 解析
  ↓
服务器公网 IP
  ↓
反向代理（Nginx/Caddy）
  ├── /       → frontend:80
  └── /api/*  → backend:3000
                    ↓
                SQLite Volume
```

当前项目包含 React 前端、Node.js/Express 后端、Prisma、SQLite、Docker Compose 和 Todo Agent。

反向代理负责域名、HTTPS、前后端路由和隐藏内部端口。SQLite 必须挂载 Docker Volume，否则重建容器可能丢数据。

## 3. 前置假设

- 服务器是 Ubuntu 22.04 或更新版本。
- 已获得服务器公网 IP 和 SSH 登录方式。
- 域名可以配置 DNS。
- 服务器可以访问互联网。
- 当前部署为单机、低并发学习环境。

## 4. 分阶段流程

### 阶段一：准备服务器

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo systemctl enable docker
sudo systemctl start docker
docker --version
docker compose version
```

学习重点：Linux 软件包、systemd、Docker Engine 和 Compose 的关系。

### 阶段二：开放防火墙

| 端口 | 用途 | 建议 |
|---|---|---|
| 22 | SSH | 仅允许自己的 IP 更安全 |
| 80 | HTTP 和证书申请 | 公开 |
| 443 | HTTPS | 公开 |
| 3000 | backend | 不公开 |
| 8080 | 当前本地反向代理 | 最终不建议直接公开 |

### 阶段三：配置 DNS

在域名服务商添加：

| 类型 | 主机记录 | 值 |
|---|---|---|
| A | `@` | 服务器公网 IP |
| A | `www` | 服务器公网 IP |

验证：

```bash
nslookup example.com
```

解析结果必须包含服务器公网 IP。

### 阶段四：上传项目

推荐使用 Git：

```bash
sudo mkdir -p /opt/todo
sudo chown -R "$USER":"$USER" /opt/todo
cd /opt/todo
git clone <后端仓库地址> todo-api
git clone <前端仓库地址> todo-api-web
```

目录应类似：

```text
/opt/todo/
├── todo-api/
└── todo-api-web/
```

### 阶段五：配置生产环境变量

```bash
cd /opt/todo/todo-api
cp .env.docker.example .env.docker
vim .env.docker
```

至少配置：

```env
NODE_ENV=production
JWT_SECRET=强随机字符串
CORS_ORIGIN=https://example.com
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
LLM_API_KEY=真实模型密钥
AGENT_MAX_STEPS=6
```

生成 JWT Secret：

```bash
openssl rand -base64 48
```

安全要求：

- `.env.docker` 不提交 Git。
- API Key 不写入前端代码。
- JWT Secret 不使用示例值。
- 日志不输出完整密钥、JWT 或 Authorization。

### 阶段六：先验证 Docker Compose

```bash
cd /opt/todo/todo-api
docker compose config
docker compose build
docker compose up -d
docker compose ps
curl http://localhost:8080/health
```

预期健康响应：

```json
{"status":"ok","service":"todo-api"}
```

先通过服务器本机验证容器，再处理域名和 HTTPS，定位问题会更容易。

### 阶段七：配置反向代理

目标请求关系：

```text
https://example.com/       → frontend
https://example.com/api/*  → backend
```

必须确认：

- 前端请求地址不能继续使用 `localhost`。
- 后端 `CORS_ORIGIN` 与真实域名一致。
- backend 只通过内部网络访问。
- 外部只暴露反向代理的 80/443。

### 阶段八：配置 HTTPS

初学者推荐 Caddy 自动管理证书：

```caddyfile
example.com {
    reverse_proxy 127.0.0.1:8080
}
```

证书申请前必须满足：

- DNS 已生效。
- 80 和 443 已开放。
- 域名能从公网访问。
- 80/443 没有被其他程序占用。

验收：`https://example.com` 可打开，浏览器显示有效证书，HTTP 自动跳转 HTTPS。

### 阶段九：业务验收

依次测试：

1. 打开首页。
2. 注册和登录。
3. 创建 Todo。
4. 查询 Todo。
5. Agent 查询 Todo。
6. Agent 创建 Todo。
7. 查看调试面板中的 Agent Loop、Tool Calling 和 SSE 事件。
8. 重启 backend。
9. 再次查询 Todo，确认数据仍存在。

常用检查：

```bash
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 reverse-proxy
```

### 阶段十：备份 SQLite

```bash
mkdir -p /opt/todo/backups
docker compose cp backend:/app/data/todo.db \
  /opt/todo/backups/todo-$(date +%Y%m%d-%H%M%S).db
```

恢复原则：停止 backend → 备份当前数据库 → 恢复备份 → 启动 backend → 验证健康和业务。

不要把以下命令当作普通重启：

```bash
docker compose down -v
```

`-v` 可能删除 SQLite Volume。

## 5. 常用运维命令

```bash
docker compose ps
docker compose logs -f backend
docker compose restart backend
docker compose down
docker compose up -d
docker compose up -d --build
```

`down` 默认保留 Volume；删除数据卷前必须确认并完成备份。

## 6. 故障排查顺序

### 域名打不开

DNS → 云防火墙 → 系统防火墙 → 反向代理 → Compose 状态。

### 页面能开但 API 失败

检查前端 API 地址、`/api` 转发规则、`CORS_ORIGIN` 和 backend 健康状态。

### HTTPS 失败

检查 DNS、80/443 端口、域名公网可达性、端口占用和服务器时间。

### Todo 重启后消失

检查 `DATABASE_URL=file:/app/data/todo.db`，并确认 `/app/data` 使用了 Docker Volume。

### Agent 失败

检查模型密钥、模型地址、服务器外网访问、backend 日志和 Agent 最大步数。

## 7. 安全边界

### Always do

- 使用 HTTPS。
- 使用强 JWT Secret。
- 使用环境变量保存模型密钥。
- 限制 SSH 来源。
- 定期备份数据库。
- 部署后验证健康接口和核心业务。

### Ask first

- 删除 Docker Volume。
- 修改数据库结构。
- 切换 PostgreSQL。
- 公开 backend 端口。
- 修改 DNS、域名或 HTTPS 架构。

### Never do

- 不提交 `.env.docker`。
- 不把密钥写入前端。
- 不把 SQLite 放在容器临时文件系统。
- 不用 `docker compose down -v` 代替普通停止。
- 不只验证首页而跳过登录、Todo 和 Agent。

## 8. 验收标准

- [ ] 域名解析到服务器公网 IP。
- [ ] Docker Compose 配置检查通过。
- [ ] backend 为 healthy。
- [ ] frontend 和反向代理正常运行。
- [ ] HTTPS 页面可以访问。
- [ ] `/api/health` 返回成功。
- [ ] 注册、登录、Todo 创建和查询正常。
- [ ] Agent 查询和创建 Todo 正常。
- [ ] SSE 和调试面板正常。
- [ ] 重启服务后数据仍在。
- [ ] SQLite 已完成一次备份。
- [ ] 生产密钥没有进入 Git。

## 9. 初学者学习 checkpoints

### Checkpoint 1：网络链路

能够解释浏览器、DNS、公网 IP、端口和反向代理之间的关系。

### Checkpoint 2：容器部署

能够独立执行 `build`、`up`、`ps`、`logs`，并解释三个容器的职责。

### Checkpoint 3：生产配置

能够区分代码、环境变量、密钥、数据库文件和 Docker Volume。

### Checkpoint 4：HTTPS

知道证书失败时优先检查 DNS、80 端口和域名可达性。

### Checkpoint 5：可恢复性

能够完成“备份 → 停止 → 恢复 → 启动 → 验证”的完整流程。

## 10. 后续学习路线

1. PostgreSQL 替换 SQLite。
2. GitHub Actions 自动构建和部署。
3. 定时备份和对象存储。
4. 日志、错误监控和告警。
5. 限流、安全响应头和漏洞扫描。
6. Docker 镜像优化。
7. 多实例、负载均衡和 Kubernetes。

## 11. 完成定义

用户能够独立完成：

```text
DNS 解析 → SSH 登录 → 安装 Docker → 上传代码
→ 配置环境变量 → 启动 Compose → 配置 HTTPS
→ 验证 Todo Agent → 备份 SQLite
```

