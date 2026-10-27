# Todo Agent Web

这是一个最小 React + Vite 聊天页面，调用后端 `POST /api/assistant/chat`。

```bash
pnpm install
pnpm dev
```

后端需运行在 `http://localhost:3000`。登录后将 JWT 保存为 `localStorage.todo_token`，聊天请求会自动携带它。
