# SQLite + Docker Compose 第一版运行手册

## 1. 准备

在 todo-api 目录复制配置示例：

    cp .env.docker.example .env.docker

编辑 .env.docker，至少替换 JWT_SECRET 和 LLM_API_KEY。不要把 .env.docker 提交到 Git。

## 2. 配置检查

    docker compose config

确认：

- backend 的 DATABASE_URL 是 file:/app/data/todo.db。
- frontend 没有 LLM_API_KEY。
- reverse-proxy 对外只暴露 APP_PORT。
- backend 没有 ports，只有 expose。

## 3. 构建并启动

    docker compose build
    docker compose up -d
    docker compose ps

访问：

    http://localhost:8080

检查后端健康状态：

    curl http://localhost:8080/health

也可以在服务器内部检查：

    docker compose exec backend node -e "fetch('http://127.0.0.1:3000/health').then(async (r) => console.log(r.status, await r.text()))"

## 4. 查看日志

    docker compose logs -f backend
    docker compose logs -f reverse-proxy

不要把日志中的 Authorization、JWT、LLM_API_KEY 或完整用户消息复制到公共工单中。

## 5. 停止和重启

普通重启：

    docker compose restart backend

停止但保留 Volume：

    docker compose down

禁止把 docker compose down -v 当成普通重启，因为它会删除 SQLite Volume。

## 6. 数据持久化验证

1. 注册用户并创建 Todo。
2. 执行 docker compose restart backend。
3. 重新登录并查询 Todo。
4. 重建 backend 容器。
5. 再次确认 Todo 仍存在。

如果数据消失，先停止操作，检查 Volume 和 DATABASE_URL，不要继续覆盖数据库。

## 7. 第一版备份思路

    docker compose exec backend sh -c "cp /app/data/todo.db /app/data/todo.db.backup"

正式备份应把文件复制到独立存储，并记录应用版本和备份时间。恢复前必须先备份当前文件。

## 8. SSE 验收

打开前端助手页面，分别测试：

- 查看 Todo。
- 创建 Todo。
- 删除 Todo 并等待确认。
- 模型或工具异常。

调试面板应能看到 meta、tool_call、tool_result、token、done 或 error 事件。

## 9. 当前方案边界

- 只支持单机和单个 backend 实例。
- SQLite 数据必须挂载 Volume。
- 不支持多主机共享 SQLite。
- 不适合作为高并发生产数据库。
- 生产 HTTPS、域名、自动备份和 CI/CD 仍需后续配置。
