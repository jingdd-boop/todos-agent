# Todo Agent 部署基础：DNS、IP、端口与 Nginx Spec（初学者版）

## 1. 文档目标

本文档用于复习 Todo Agent 从本地访问到线上访问的网络基础，重点理解：

```text
域名
  → DNS 解析
  → 服务器公网 IP
  → 端口
  → Nginx
  → Docker Compose
  → 前端和后端服务
```

学习完成后，应该能够解释：

- 为什么 `longjing.online` 能找到腾讯云服务器。
- 为什么浏览器访问的是 `443`，而后端实际使用 `8082` 和容器内 `3000`。
- 为什么生产环境需要 Nginx 反向代理。
- 为什么 `/api/todos` 和 `/` 可以转发到不同服务。
- 如何根据错误现象判断是 DNS、端口、Nginx 还是应用问题。

## 2. 本次项目的实际环境

| 项目 | 实际值 | 作用 |
|---|---|---|
| 域名 | `longjing.online` | 用户访问入口 |
| 公网 IP | `124.220.209.184` | 腾讯云服务器地址 |
| 操作系统 | Ubuntu 24.04 | 运行服务的服务器 |
| SSH 用户 | `ubuntu` | 远程登录账号 |
| 公网 HTTP 端口 | `80` | 接收普通 HTTP 请求 |
| 公网 HTTPS 端口 | `443` | 接收加密 HTTPS 请求 |
| Compose 对外端口 | `127.0.0.1:8082` | Nginx 访问 Todo Agent 的入口 |
| backend 容器端口 | `3000` | Node 服务在容器内监听的端口 |
| 数据库 | SQLite | 保存 Todo 和用户数据 |
| 反向代理 | Nginx | 统一域名入口并转发请求 |

安全说明：本文档不记录 SSH 私钥、JWT Secret、模型 API Key、用户密码或数据库内容。

## 3. 核心概念

### 3.1 DNS：域名的电话簿

DNS 把人容易记忆的域名转换成机器使用的 IP 地址：

```text
longjing.online → 124.220.209.184
```

当前主域名的典型 DNS 记录：

```text
主机记录：@
记录类型：A
记录值：124.220.209.184
```

含义：

- `@` 表示主域名 `longjing.online`。
- `A` 表示 IPv4 地址记录。
- 记录值是服务器公网 IPv4 地址。

如果需要支持 `www.longjing.online`，可以增加：

```text
主机记录：www
记录类型：A
记录值：124.220.209.184
```

检查 DNS：

```bash
dig +short longjing.online
dig +short www.longjing.online
```

期望结果：

```text
124.220.209.184
```

如果结果不是服务器 IP，应先检查 DNS 服务商、记录值、代理设置和缓存，不要直接修改 Nginx。

### 3.2 IP：服务器的网络地址

IP 用来定位网络中的一台机器。当前公网 IP 是：

```text
124.220.209.184
```

SSH 使用 IP 连接服务器：

```bash
ssh -i /Users/wangzhihao/.ssh/id_ed25519 ubuntu@124.220.209.184
```

IP 只负责找到服务器，不能决定访问哪一个程序。服务器上可以同时运行多个服务，因此还需要端口。

### 3.3 端口：服务器上的服务入口

端口可以理解为服务器上的“房间号”：

| 端口 | 常见用途 |
|---|---|
| `22` | SSH 远程管理 |
| `80` | HTTP |
| `443` | HTTPS |
| `3000` | Node 或其他 Web 应用 |
| `8082` | 本项目 Compose 对外入口 |

查看端口监听情况：

```bash
sudo ss -lntp
```

本项目的关键区别：

```text
公网访问：     longjing.online:443
Nginx 转发：   127.0.0.1:8082
backend 容器：  backend:3000
```

`127.0.0.1:8082` 只允许服务器本机访问，因此 backend 没有直接暴露到公网，安全性更好。

### 3.4 Nginx：反向代理和统一入口

Nginx 是服务器的入口网关。它监听公网的 `80` 和 `443`，然后根据域名和路径把请求转发到不同服务。

它通常负责：

- 接收 HTTP 和 HTTPS 请求。
- 配置 TLS 证书。
- 把 HTTP 跳转到 HTTPS。
- 根据路径转发前端和后端。
- 隐藏 backend 的内部端口。
- 转发请求头、Cookie 和 SSE 流式响应。
- 处理超时、缓冲和基础访问日志。

## 4. Todo Agent 最终请求架构

```text
用户浏览器
    │
    │ https://longjing.online
    ▼
DNS
    │ longjing.online → 124.220.209.184
    ▼
腾讯云服务器
    │
    ├── Nginx :80
    │     └── 重定向到 HTTPS :443
    │
    └── Nginx :443
          ├── /                  → 127.0.0.1:8082 → frontend
          ├── /api/*             → 127.0.0.1:8082 → backend:3000
          └── /health            → 127.0.0.1:8082 → backend:3000

backend:3000
    ├── Express API
    ├── Prisma
    ├── SQLite Volume
    └── DeepSeek API
```

## 5. 一次查询 Todo 的完整流程

用户在页面打开 Todo 列表时，浏览器请求：

```text
GET https://longjing.online/api/todos
```

完整过程如下：

1. 浏览器查询 DNS，得到 `124.220.209.184`。
2. 浏览器连接服务器的 `443` 端口。
3. Nginx 完成 HTTPS 握手并读取请求路径 `/api/todos`。
4. Nginx 判断 `/api/` 应转发给后端。
5. 请求进入本机 `127.0.0.1:8082`。
6. reverse-proxy 容器把请求转发给 `backend:3000`。
7. Express 路由处理 `/api/todos`。
8. Prisma 查询 SQLite 数据库。
9. backend 返回 JSON。
10. Nginx 将结果返回给浏览器。

```text
浏览器
  → DNS
  → 124.220.209.184:443
  → Nginx
  → 127.0.0.1:8082
  → backend:3000
  → Prisma
  → SQLite
```

## 6. Nginx 路由的学习重点

逻辑上可以把 Nginx 配置理解为：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8082;
}

location /health {
    proxy_pass http://127.0.0.1:8082;
}

location / {
    proxy_pass http://127.0.0.1:8082;
}
```

真正部署时还需要完整配置请求头、超时、SSE 缓冲和 HTTPS 证书。学习时要掌握两点：

- `location` 根据 URL 路径匹配请求。
- `proxy_pass` 指定请求应该转发到哪里。

例如：

```text
/api/auth/register       → backend
/api/assistant/chat      → backend
/api/assistant/chat/stream → backend
/                         → frontend
```

前端生产环境使用相对路径：

```text
/api/todos
/api/auth/login
/api/assistant/chat/stream
```

这样浏览器会自动请求当前域名，不会把线上请求错误发送到用户电脑的 `localhost`。

## 7. 为什么需要反向代理

如果没有 Nginx，用户可能需要访问：

```text
http://124.220.209.184:8082
```

这会带来问题：

- 用户需要记忆 IP 和端口。
- HTTPS 配置更复杂。
- backend 端口直接暴露公网。
- 前端和 API 的入口不统一。
- 多个项目难以共用 `80` 和 `443`。
- SSE、Cookie、跨域和安全头不容易统一管理。

使用 Nginx 后：

```text
用户只访问 https://longjing.online
```

Nginx 负责把请求分配给正确的内部服务。

## 8. 四类问题的排查顺序

### 8.1 DNS 问题

现象：域名解析不到服务器，或解析到了错误 IP。

检查：

```bash
dig +short longjing.online
```

确认结果是否为：

```text
124.220.209.184
```

### 8.2 IP 或防火墙问题

现象：域名解析正确，但浏览器无法连接。

检查：

```bash
nc -vz 124.220.209.184 80
nc -vz 124.220.209.184 443
```

同时确认云服务器安全组、防火墙是否开放 `80` 和 `443`。

### 8.3 Nginx 问题

现象：出现 `502 Bad Gateway`、证书错误或 HTTP 无法跳转 HTTPS。

检查：

```bash
sudo nginx -t
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

如果 Nginx 配置正确但返回 `502`，通常说明 Nginx 找不到上游服务，下一步检查 Docker 和 `8082`。

### 8.4 应用或数据库问题

现象：页面能打开，但接口返回 `500`，或者登录、创建 Todo 失败。

检查：

```bash
docker compose ps
docker compose logs --tail=100 backend
curl http://127.0.0.1:8082/health
```

这类问题通常发生在：

- 环境变量缺失。
- SQLite Volume 没有挂载。
- Prisma migration 没有执行。
- 原生依赖没有正确安装。
- DeepSeek API Key 或模型配置错误。

## 9. 常用验证命令

### 9.1 验证公网首页

```bash
curl -I https://longjing.online
```

期望得到 `200` 或正常的重定向响应。

### 9.2 验证 HTTP 跳转

```bash
curl -I http://longjing.online
```

期望看到：

```text
301 Moved Permanently
Location: https://longjing.online/
```

### 9.3 验证健康检查

```bash
curl -i https://longjing.online/health
```

### 9.4 验证容器

```bash
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 reverse-proxy
```

### 9.5 验证 Nginx 配置

```bash
sudo nginx -t
sudo systemctl reload nginx
```

`reload` 通常比 `restart` 更平滑，因为它会尽量保留当前连接。

## 10. 初学者实践任务

### 任务一：画出请求链路

不看本文档，写出以下请求的完整路径：

```text
https://longjing.online/api/assistant/chat/stream
```

参考答案应包含：

```text
浏览器 → DNS → 公网 IP → 443 → Nginx → 8082 → backend:3000 → DeepSeek → SSE 返回
```

### 任务二：区分错误类型

尝试判断以下错误最可能属于哪一层：

| 现象 | 优先排查 |
|---|---|
| `dig` 得到错误 IP | DNS |
| `Connection refused` | 端口或服务未监听 |
| `502 Bad Gateway` | Nginx 上游或 Docker |
| `404 Cannot POST` | 路由、代理路径或请求方法 |
| `500 Internal Server Error` | 后端代码、数据库或环境变量 |
| 页面正常但 API 请求 localhost | 前端生产环境 API 地址 |

### 任务三：观察端口

执行：

```bash
sudo ss -lntp
docker compose ps
```

回答：

1. 谁监听了 `443`？
2. 谁监听了 `8082`？
3. backend 是否直接暴露到公网？
4. 浏览器为什么不应该直接请求 `backend:3000`？

## 11. 学习验收标准

完成本专题后，应满足：

- 能解释 DNS、IP、端口、Nginx 的职责区别。
- 能画出 `longjing.online → 124.220.209.184 → 443 → Nginx → backend` 的链路。
- 能使用 `dig` 验证域名解析。
- 能使用 `ss` 判断端口监听状态。
- 能使用 `nginx -t` 验证配置语法。
- 能使用 `docker compose ps` 和日志定位容器状态。
- 能区分 `502`、`404`、`500` 和前端 localhost 地址错误。
- 能说明为什么生产环境采用同源 `/api` 请求。

## 12. 后续学习顺序

建议按以下顺序继续：

1. DNS 记录类型：A、CNAME、AAAA、TXT。
2. TCP、TLS 和 HTTPS 握手。
3. Nginx location 匹配和反向代理。
4. Docker 网络、端口映射和容器 DNS。
5. 日志、健康检查和监控。
6. CI/CD 自动构建和自动部署。
7. HTTPS 证书续期、备份和回滚。

## 13. 边界与安全规则

### 始终执行

- 修改 Nginx 后先执行 `sudo nginx -t`。
- 修改 DNS 后使用 `dig` 验证实际解析结果。
- 发布后检查首页、健康检查和核心 API。
- 查看日志时注意隐藏 Token、密码和 API Key。
- 保留数据库备份和可回滚镜像。

### 修改前确认

- 更改 `80` 或 `443` 的占用关系。
- 修改已有站点的 Nginx 配置。
- 更换 DNS 服务商或开启代理。
- 暴露新的公网端口。
- 修改 SQLite Volume 或数据库迁移。

### 禁止操作

- 不要把 SSH 私钥提交到 Git。
- 不要把模型 API Key 写进前端代码。
- 不要随意停止服务器上其他项目的 Nginx 或 Docker 服务。
- 不要在没有备份的情况下删除 SQLite Volume。
- 不要把 backend 管理端口无必要地暴露到公网。

## 14. 总结

这次部署可以浓缩成一句话：

> DNS 把域名指向服务器，IP 找到服务器，端口找到服务，Nginx 根据域名和路径转发请求，Docker 运行具体应用。

对于 Todo Agent，最终访问链路是：

```text
https://longjing.online
  → 124.220.209.184
  → Nginx:443
  → 127.0.0.1:8082
  → backend:3000
  → SQLite / DeepSeek
```

理解这条链路后，后续遇到线上问题时，就可以按照“DNS → IP/防火墙 → 端口 → Nginx → Docker → 应用”的顺序定位，而不是盲目修改代码。
