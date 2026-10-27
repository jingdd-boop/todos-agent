# todo-api-web 前端 Spec

## 1. 目标

在 `todo-api` 同级创建 `todo-api-web` React 前端，用于调试当前认证、RBAC 和 Todo API。

## 2. 技术栈

- React
- TypeScript
- Vite
- React Router
- React Context 管理认证状态
- 原生 fetch 封装 API 请求
- CSS
- pnpm

## 3. 项目结构

```text
todo-api-web/
├── src/
│   ├── api/
│   │   ├── client.ts
│   │   ├── auth.api.ts
│   │   └── todo.api.ts
│   ├── components/
│   │   ├── AppLayout.tsx
│   │   ├── ProtectedRoute.tsx
│   │   ├── TodoForm.tsx
│   │   ├── TodoItem.tsx
│   │   ├── TodoList.tsx
│   │   └── Pagination.tsx
│   ├── context/AuthContext.tsx
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   └── TodosPage.tsx
│   ├── types/
│   │   ├── auth.ts
│   │   └── todo.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── .env.example
├── vite.config.ts
└── README.md
```

## 4. 页面与路由

```text
/login       登录页
/register    注册页
/todos       Todo 列表页
```

未登录访问 `/todos` 时跳转 `/login`；登录后跳转 `/todos`。

## 5. API 对接

后端地址：`http://localhost:3000`。

前端使用 Vite Proxy，将 `/api` 转发到后端，避免当前后端没有 CORS Middleware 导致的跨域问题。

认证接口：

```text
POST /api/auth/register
POST /api/auth/login
```

Todo 接口：

```text
GET    /api/todos?page=1&pageSize=10&completed=true|false
GET    /api/todos/:id
POST   /api/todos
PUT    /api/todos/:id
DELETE /api/todos/:id
```

所有 Todo 请求自动添加：

```http
Authorization: Bearer <token>
```

创建 Todo 时只提交：

```json
{"title":"学习 React"}
```

不信任、不提交客户端 `userId`。

## 6. Token 与错误处理

登录响应中的 `token` 保存到 `localStorage.todo_token`，用户信息保存到 `localStorage.todo_user`。

- 401：清除登录状态并跳转登录页
- 403：显示无权限提示
- 404：显示资源不存在或无法访问
- 409：显示邮箱已存在
- 其他错误：显示后端 `message`

Token 过期后重新登录；当前后端没有 Refresh Token 接口。

## 7. Todo 功能

- 全部、已完成、未完成筛选
- 分页
- 创建 Todo
- 编辑标题
- 切换完成状态
- 删除 Todo
- 加载、空数据、错误状态

USER 只能看到自己的 Todo；ADMIN 可以看到和操作全部 Todo。前端角色判断只用于界面体验，最终权限由后端保证。

## 8. 表单校验

- name：2～50 个字符
- email：合法邮箱
- password：6～100 个字符
- title：1～100 个字符

前端校验用于提升体验，后端校验仍是最终标准。

## 9. 开发运行

```bash
# 后端
cd /Users/wangzhihao/Desktop/longjing/node/todo-api
pnpm dev

# 前端
cd /Users/wangzhihao/Desktop/longjing/node/todo-api-web
pnpm install
pnpm dev
```

默认地址：前端 `http://localhost:5173`，后端 `http://localhost:3000`。

## 10. 验收标准

- 注册、登录、退出登录可用
- 刷新页面后登录状态保持
- 未登录不能访问 Todo 页面
- Todo CRUD、筛选和分页可用
- USER/ADMIN 行为符合后端权限
- 401、403、404、409 有清晰提示
- 浏览器通过 Vite Proxy 正常调用后端
