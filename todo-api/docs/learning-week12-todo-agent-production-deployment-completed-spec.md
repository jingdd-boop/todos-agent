# Todo Agent 真实部署复盘 Spec（初学者学习版）

## 1. 文档目标

本文档记录 Todo Agent 从本地 Docker Compose 到公网 HTTPS 的完整部署过程，并解释每一步为什么要做。

本次部署目标：

```text
浏览器
  → https://longjing.online
  → 腾讯云服务器 124.220.209.184
  → Ubuntu Nginx
  → Todo Agent Docker Compose
  → React 前端 / Node 后端 / SQLite
```

部署完成后，其他人可以通过以下地址访问：

- `https://longjing.online`
- `https://www.longjing.online`

## 2. 实际环境

### 2.1 服务器

| 项目 | 实际值 |
|---|---|
| 云厂商 | 腾讯云 |
| 公网 IP | `124.220.209.184` |
| 系统 | Ubuntu 24.04 LTS |
| SSH 用户 | `ubuntu` |
| SSH 私钥 | 本机 `~/.ssh/id_ed25519` |
| Docker | 已安装 |
| Docker Compose | v2.32.4 |

### 2.2 项目

| 项目 | 位置 |
|---|---|
| 后端仓库 | `https://github.com/jingdd-boop/todos-agent` |
| 后端服务器目录 | `/home/ubuntu/todo-api` |
| 前端服务器目录 | `/home/ubuntu/todo-api-web` |
| 数据备份目录 | `/home/ubuntu/todo-backups` |
| Compose 对外端口 | `127.0.0.1:8082` |
| 域名 | `longjing.online` |

### 2.3 重要安全说明

本文档不会记录以下内容：

- SSH 私钥内容
- JWT Secret
- DeepSeek API Key
- 用户密码
- SQLite 数据库内容

这些内容只能保存在本机或服务器环境变量中。

## 3. 最终架构

```text
用户浏览器
    │
    │ HTTPS 443
    ▼
服务器 Nginx
    ├── longjing.online/
    │       ↓
    │   127.0.0.1:8082
    │       ↓
    │   frontend:80
    │
    ├── longjing.online/api/*
    │       ↓
    │   127.0.0.1:8082
    │       ↓
    │   backend:3000
    │
    └── longjing.online/health
            ↓
        backend:3000

backend
    ├── SQLite：/app/data/todo.db
    ├── Docker Volume：todo-api_sqlite-data
    └── DeepSeek API
```

## 4. 为什么没有直接使用 80、443、3000

服务器原本已经运行其他项目：

- `80`：Nginx
- `443`：Nginx HTTPS
- `3000`：其他项目
- `8080`：其他项目

因此 Todo Agent 不能直接抢占这些端口。

最终选择：

```text
Todo Agent Compose → 127.0.0.1:8082
服务器 Nginx       → 对外提供 80/443
```

这样做的好处：

- 不影响原有站点。
- backend 不直接暴露公网。
- Nginx 统一处理域名和 HTTPS。
- 后续可以安全替换或重启 Todo Agent 容器。

## 5. 阶段一：确认本机 SSH 私钥

macOS 本机执行：

```bash
ls -la ~/.ssh
file ~/.ssh/*
```

识别结果：

```text
id_ed25519      → OpenSSH private key
id_ed25519.pub  → 公钥
```

连接服务器：

```bash
ssh -i /Users/wangzhihao/.ssh/id_ed25519 ubuntu@124.220.209.184
```

概念：

- 私钥保存在本机，不能发送给别人。
- 公钥通常已经配置到服务器。
- SSH 用户名取决于操作系统镜像。
- Ubuntu 默认用户通常是 `ubuntu`。

## 6. 阶段二：检查服务器

远程执行：

```bash
docker --version
docker compose version
ss -lnt
systemctl --type=service --state=running
```

本次检查确认：

- 系统是 Ubuntu 24.04。
- Docker 和 Compose 已经安装。
- UFW 没有启用。
- 80、443、3000、8080 已经被占用。
- 服务器上已有 Nginx 和其他 Docker 项目。

学习重点：

不要在不了解现有服务的情况下执行：

```bash
docker compose down -v
sudo systemctl stop nginx
sudo rm -rf /var/www
```

这些操作可能影响已有网站或删除数据。

## 7. 阶段三：配置 DNS

### 7.1 确认 DNS 服务商

执行：

```bash
dig NS longjing.online
```

本次结果显示：

```text
onion.dnspod.net
parameter.dnspod.net
```

说明域名使用腾讯云 DNSPod。

### 7.2 添加 A 记录

DNSPod 中添加：

```text
类型：A
主机记录：@
记录值：124.220.209.184
TTL：600
```

```text
类型：A
主机记录：www
记录值：124.220.209.184
TTL：600
```

### 7.3 DNS 排查经验

最初查询曾返回：

```text
198.18.1.35
198.18.1.37
```

这说明公网还没有使用新记录，可能原因包括：

- 旧 A 记录仍存在。
- DNS 缓存尚未过期。
- 修改了错误的 DNS 控制台。
- 域名的 Nameserver 不是当前控制台。
- 同一个主机记录存在多条 A 记录。

最终通过 Google 和 Cloudflare 公共 DNS 验证：

```text
longjing.online → 124.220.209.184
www.longjing.online → 124.220.209.184
```

推荐使用多个解析器验证：

```bash
dig +short longjing.online
dig +short www.longjing.online
```

DNS 控制台显示正确，不代表所有公共 DNS 已经更新。

## 8. 阶段四：同步项目

服务器目录：

```bash
mkdir -p /home/ubuntu/todo-api
mkdir -p /home/ubuntu/todo-api-web
mkdir -p /home/ubuntu/todo-backups
```

同步时应排除：

- `.git`
- `node_modules`
- `dist`
- 本地数据库
- 本地环境变量文件
- 测试产物

本次后端和前端分别同步到：

```text
/home/ubuntu/todo-api
/home/ubuntu/todo-api-web
```

同步原则：

- 生产服务器使用明确版本的代码。
- 不上传本地 `node_modules`。
- 不上传本地 `dev.db`。
- 不把环境变量写入 Git。
- 同步前确认目标目录，不要对错误目录执行 `--delete`。

## 9. 阶段五：生产环境变量

服务器上的文件：

```text
/home/ubuntu/todo-api/.env.docker
```

核心配置：

```env
NODE_ENV=production
JWT_SECRET=强随机字符串
CORS_ORIGIN=https://longjing.online
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
LLM_API_KEY=模型密钥
AGENT_MAX_STEPS=6
```

设置权限：

```bash
chmod 600 /home/ubuntu/todo-api/.env.docker
```

`CORS_ORIGIN` 必须使用最终 HTTPS 域名，否则浏览器可能阻止 API 请求。

生成 JWT Secret：

```bash
openssl rand -base64 48
```

环境变量的职责：

| 变量 | 作用 |
|---|---|
| `NODE_ENV` | 标识生产环境 |
| `JWT_SECRET` | 签发和校验登录 Token |
| `CORS_ORIGIN` | 限制允许访问后端的前端来源 |
| `LLM_BASE_URL` | 大模型 API 地址 |
| `LLM_MODEL` | 使用的模型 |
| `LLM_API_KEY` | 调用模型的凭证 |
| `AGENT_MAX_STEPS` | 防止 Agent 无限循环 |

## 10. 阶段六：Docker Compose 配置

服务器使用：

```text
APP_PORT=8082
```

Compose 服务：

- backend：Node.js API 和 Agent
- frontend：构建后的 React 静态页面
- reverse-proxy：Compose 内部代理
- sqlite-data：SQLite 持久化 Volume

验证 Compose：

```bash
cd /home/ubuntu/todo-api
docker compose config
```

构建和启动：

```bash
docker compose build
docker compose up -d
docker compose ps
```

健康检查：

```bash
curl http://127.0.0.1:8082/health
```

预期：

```json
{"status":"ok","service":"todo-api"}
```

查看日志：

```bash
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
docker compose logs --tail=100 reverse-proxy
```

## 11. 阶段七：Docker 构建问题复盘

### 11.1 Prisma Client 生成路径

Prisma 7 + pnpm 在容器中出现过默认生成路径解析问题。

解决思路：

- 在 `schema.prisma` 中显式配置生成目录。
- 应用从显式生成目录导入 Prisma Client。
- Docker 构建阶段先复制 schema、配置和源码，再执行 `prisma generate`。

学习重点：

隐式生成路径在不同包管理器、镜像和依赖缓存下可能不一致。生产镜像应尽量使用明确路径。

### 11.2 Debian apt 源卡住

服务器构建时，`node:22-bookworm-slim` 需要执行：

```bash
apt-get update
```

但服务器访问 Debian 软件源长时间无响应。

尝试过：

- 使用 IPv4 强制模式。
- 使用 Docker host network。
- 重试 apt 更新。

最终使用：

```dockerfile
FROM node:22-bookworm
```

完整 Node 镜像自带编译环境，避免在构建阶段额外访问 apt 安装 Python、make、g++ 和 OpenSSL。

代价：

- 镜像更大。
- 构建更慢。
- 适合当前学习和小规模部署。

后续优化：

- 使用多阶段构建。
- 使用稳定的内部镜像源。
- 在 CI 中提前构建镜像。
- 继续评估 slim 镜像和预编译依赖。

### 11.3 better-sqlite3 原生编译

`better-sqlite3` 是原生 Node 模块，可能需要：

- Python
- make
- g++
- Node headers

服务器最终成功编译了 better-sqlite3，说明完整 Node 镜像可以满足构建要求。

## 12. 阶段八：Nginx 反向代理

新增站点：

```text
/etc/nginx/sites-available/longjing.online
/etc/nginx/sites-enabled/longjing.online
```

核心路由：

```nginx
location = /health {
    proxy_pass http://127.0.0.1:8082/health;
}

location /api/ {
    proxy_pass http://127.0.0.1:8082;
    proxy_buffering off;
    proxy_read_timeout 300s;
}

location / {
    proxy_pass http://127.0.0.1:8082;
}
```

为什么 `/api/` 的 `proxy_pass` 不带路径后缀：

后端路由本身包含：

```text
/api/auth
/api/todos
/api/assistant
/api/conversations
```

所以必须保留原始 URI。错误地写成 `proxy_pass http://127.0.0.1:8082/api/;` 可能导致路径重复或被改写。

检查并 reload：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Nginx 配置只有在 `nginx -t` 成功后才 reload。

## 13. 阶段九：申请 HTTPS

服务器已经安装 Certbot：

```bash
command -v certbot
```

申请证书：

```bash
sudo certbot --nginx \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email \
  --no-eff-email \
  --redirect \
  -d longjing.online \
  -d www.longjing.online
```

Certbot 完成：

- 申请 Let's Encrypt 证书。
- 写入 Nginx HTTPS 配置。
- 配置 80 → 443 跳转。
- 配置证书自动续期。
- 证书保存到 `/etc/letsencrypt/live/longjing.online/`。

本次证书有效期至 2027-01-25。

更推荐的生产做法是绑定真实邮箱：

```bash
sudo certbot --nginx \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email \
  --redirect \
  -d longjing.online \
  -d www.longjing.online
```

无邮箱方式不会收到证书到期提醒，但自动续期任务仍然存在。

检查证书：

```bash
sudo certbot certificates
```

检查自动续期：

```bash
sudo certbot renew --dry-run
```

## 14. 阶段十：最终验收

### 14.1 HTTPS 页面

```bash
curl -I https://longjing.online/
```

预期：

```text
HTTP/1.1 200 OK
```

### 14.2 健康接口

```bash
curl https://longjing.online/health
```

预期：

```json
{"status":"ok","service":"todo-api"}
```

### 14.3 HTTP 跳转

```bash
curl -I http://longjing.online/
```

预期：

```text
HTTP/1.1 301 Moved Permanently
Location: https://longjing.online/
```

### 14.4 Compose 状态

```bash
docker compose ps
```

预期：

- backend：`Up (healthy)`
- frontend：`Up`
- reverse-proxy：`Up`

### 14.5 浏览器业务验收

依次操作：

1. 打开首页。
2. 注册用户。
3. 登录。
4. 创建 Todo。
5. 查询 Todo。
6. 进入助手页面。
7. 让 Agent 查询 Todo。
8. 让 Agent 创建 Todo。
9. 查看调试面板中的 Tool Calling 和 SSE。
10. 重启 backend。
11. 确认 Todo 仍存在。

## 15. 数据持久化和备份

数据库位置：

```text
/app/data/todo.db
```

Docker Volume：

```text
todo-api_sqlite-data
```

查看 Volume：

```bash
docker volume ls
docker volume inspect todo-api_sqlite-data
```

备份：

```bash
mkdir -p /home/ubuntu/todo-backups
docker compose cp backend:/app/data/todo.db \
  /home/ubuntu/todo-backups/todo-$(date +%Y%m%d-%H%M%S).db
```

普通停止：

```bash
docker compose down
```

普通启动：

```bash
docker compose up -d
```

危险操作：

```bash
docker compose down -v
```

它会删除 Compose 管理的 Volume，不能作为普通重启命令。

## 16. 失败与回滚

### 16.1 Docker 服务异常

```bash
docker compose ps
docker compose logs --tail=200 backend
docker compose restart backend
```

### 16.2 代码版本回滚

如果服务器目录是 Git 仓库：

```bash
git log --oneline -5
git checkout <稳定版本>
docker compose up -d --build
```

### 16.3 Nginx 配置回滚

修改 Nginx 后必须：

```bash
sudo nginx -t
```

如果失败，不 reload。恢复上一份配置后再执行：

```bash
sudo systemctl reload nginx
```

### 16.4 数据回滚

原则：

```text
停止 backend
  → 备份当前数据库
  → 替换备份文件
  → 启动 backend
  → 验证健康和业务
```

## 17. 生产安全边界

### Always do

- 使用 HTTPS。
- 使用强 JWT Secret。
- 限制 `.env.docker` 权限为 600。
- 不在 Git 中提交密钥。
- 不把 API Key 放入前端构建产物。
- 只通过 Nginx 暴露服务。
- 定期备份 SQLite。
- 使用 `nginx -t` 后再 reload。
- 部署后查看日志和健康接口。

### Ask first

- 删除 Docker Volume。
- 停止或修改现有 Nginx 站点。
- 修改 DNS Nameserver。
- 切换数据库。
- 修改认证、CORS 或模型配置。
- 公开 3000、8080 或 backend 端口。

### Never do

- 不把 SSH 私钥发到聊天中。
- 不把模型 API Key 写入前端。
- 不使用 `docker compose down -v` 作为重启。
- 不覆盖现有站点配置。
- 不只验证首页而跳过 API 和 Agent。
- 不把完整 Token 或用户消息写入公共日志。

## 18. 学习 checkpoints

### Checkpoint 1：SSH

能够解释私钥、公钥、SSH 用户和服务器 IP 的关系。

### Checkpoint 2：DNS

能够解释：

```text
域名 → A 记录 → 公网 IP → 服务器
```

并知道 DNS 控制台结果与公共 DNS 结果可能暂时不同。

### Checkpoint 3：端口

能够解释：

- 80/443 是公网入口。
- 8082 是 Todo Agent 的内部入口。
- backend 的 3000 不需要对公网开放。

### Checkpoint 4：反向代理

能够解释：

```text
/api/* → backend
/      → frontend
```

### Checkpoint 5：HTTPS

能够解释证书申请需要：

- DNS 指向服务器。
- 80/443 对公网开放。
- Nginx 能响应域名请求。
- Certbot 可以完成验证。

### Checkpoint 6：数据持久化

能够解释：

```text
容器 ≠ 数据
Volume 才是 SQLite 数据的持久化位置
```

### Checkpoint 7：验收

能够独立完成：

```text
DNS → SSH → Docker → Compose → Nginx → HTTPS
→ 健康检查 → 业务测试 → 备份
```

## 19. 完成定义

本次部署 Spec 达成的标准：

- [x] 服务器 SSH 可连接。
- [x] Docker 和 Compose 可用。
- [x] 前后端代码已部署。
- [x] backend 健康检查通过。
- [x] SQLite 使用 Docker Volume。
- [x] Nginx 已接入域名。
- [x] DNS 已解析到服务器。
- [x] HTTPS 证书申请成功。
- [x] HTTP 自动跳转 HTTPS。
- [x] 公网健康接口通过。
- [x] 前端页面可以访问。
- [ ] 还需要用户手动完成注册、Todo、Agent 和数据备份业务验收。

## 20. 后续学习路线

1. 给 Certbot 配置通知邮箱。
2. 设置定时 SQLite 备份。
3. 将备份上传到对象存储。
4. 增加服务器和应用监控。
5. 增加限流、安全响应头和日志脱敏。
6. 使用 GitHub Actions 自动构建和部署。
7. 将 SQLite 迁移到 PostgreSQL。
8. 学习蓝绿部署和滚动发布。
9. 学习容器资源限制。
10. 学习 Kubernetes 和多实例部署。

