# 全栈 Java 学习路线

## 1. 学习目标

当前项目使用 Node.js + Express，目标是：

```text
理解后端原理
掌握 Java / Spring Boot 企业后端技术
掌握 React / Next.js 前端开发
具备独立完成全栈项目的能力
```

最终目标不是简单更换语言，而是能够完成：

```text
前端页面
  ↓
API 设计
  ↓
身份认证与 RBAC
  ↓
业务服务
  ↓
数据库、缓存、并发
  ↓
测试、部署和运维
```

## 2. 总体路线

```text
当前 Express Todo 项目
        ↓
完善 React 前端
        ↓
Java 基础
        ↓
Spring Boot 重写 Todo API
        ↓
PostgreSQL + Redis
        ↓
测试
        ↓
Docker 部署
        ↓
Next.js 全栈完善
```

不要立刻删除 Express 项目。它将作为后续 Spring Boot 项目的参考实现和对照实验。

## 3. 推荐最终技术栈

### 前端

```text
React
Next.js
TypeScript
Tailwind CSS
TanStack Query
React Hook Form
```

### Java 后端

```text
Java 21
Spring Boot 3
Spring MVC
Spring Security
Spring Data JPA
MyBatis
Bean Validation
Maven
```

### 数据和工程化

```text
PostgreSQL
Redis
Docker
Docker Compose
Nginx
JUnit 5
Mockito
MockMvc
Testcontainers
Playwright
```

## 4. 阶段一：完成 Express 后端原理学习

当前项目继续使用：

```text
Express + Prisma + SQLite + React
```

重点完成：

- JWT Authentication
- RBAC
- Todo owner 资源隔离
- 异常处理
- 结构化日志
- requestId
- API 设计
- 分页、筛选、排序
- 进程内缓存
- 并发创建实验
- 乐观锁
- Todo 统计接口

这一阶段的目标是理解后端机制，而不是成为 Node.js 专家。

## 5. 阶段二：完善 React 前端

建议先用 1～2 周完善现有前端。

功能目标：

```text
登录注册
Todo 列表
分页
筛选
编辑
删除
管理员创建
错误提示
Token 过期处理
```

学习内容：

- React Hooks
- React Router
- 表单状态管理
- API 请求状态
- Loading / Empty / Error 状态
- 权限路由
- TypeScript 类型设计
- 响应式 UI
- TanStack Query
- Zustand
- React Hook Form

建议先理解 React 原生状态，再逐步引入状态管理和请求库。

## 6. 阶段三：Java 基础

建议用 2～3 周。

### 基础内容

```text
类和对象
接口
继承
泛型
集合
异常
Lambda
Stream
Optional
注解
枚举
record
```

### 必须熟悉的类型

```java
List
Map
Set
Optional
Stream
interface
record
enum
```

### 并发基础

```text
Thread
Runnable
ExecutorService
CompletableFuture
synchronized
Lock
AtomicInteger
ConcurrentHashMap
```

### 构建工具

学习 Maven：

```text
pom.xml
dependency
plugin
profile
test
package
```

## 7. 阶段四：Spring Boot 重写 Todo API

建议用 3～4 周，用 Java 实现与 Express 相同的 API。

接口保持一致：

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/admin/users

GET    /api/todos
GET    /api/todos/:id
POST   /api/todos
PUT    /api/todos/:id
DELETE /api/todos/:id
GET    /api/todos/stats
```

推荐目录：

```text
src/main/java/com/example/todo/
├── controller/
├── service/
├── repository/
├── entity/
├── dto/
├── exception/
├── security/
├── config/
└── common/
```

### 技术对照

| Express / Node | Spring Boot |
|---|---|
| Router | `@RestController` |
| Middleware | Filter / Interceptor |
| Service | `@Service` |
| Repository | `JpaRepository` / Mapper |
| Error Middleware | `@RestControllerAdvice` |
| Zod | Bean Validation |
| Prisma | JPA / MyBatis |
| JWT Middleware | Spring Security Filter |
| `.env` | `application.yml` |

## 8. 阶段五：数据库和 ORM

建议先从 SQLite 切换到 PostgreSQL：

```text
SQLite
  ↓
PostgreSQL
  ↓
JPA / Hibernate
  ↓
MyBatis
```

学习内容：

- Entity
- 主键和外键
- 一对多关系
- 唯一索引
- 分页和排序
- JPQL
- Specification
- 事务
- 隔离级别
- 乐观锁

JPA 用于理解 ORM；MyBatis 用于理解 SQL 和企业项目中的精确查询控制。

## 9. 阶段六：Spring Security 和 RBAC

建议用 2 周。

学习顺序：

```text
SecurityFilterChain
        ↓
JWT Filter
        ↓
SecurityContext
        ↓
UserDetails
        ↓
PasswordEncoder
        ↓
hasRole
        ↓
@PreAuthorize
        ↓
Todo owner 权限
```

必须实现：

```text
USER 只能访问自己的 Todo
ADMIN 可以访问全部 Todo
普通用户不能创建管理员
管理员可以创建管理员
```

重点理解：

```text
角色权限 ≠ 资源权限
```

`ADMIN` 角色判断和 `Todo.userId` owner 判断是两个不同层次。

## 10. 阶段七：Redis、缓存和异步

建议用 2～3 周。

将进程内缓存升级为 Redis：

```text
进程内 Map
    ↓
Redis
```

学习内容：

- Redis String
- Redis Hash
- TTL
- Cache Aside
- 缓存失效
- 分布式锁
- 缓存穿透
- 缓存击穿
- 缓存雪崩

练习场景：

```text
Todo 列表缓存
统计数据缓存
登录验证码
防重复提交
热点数据保护
```

消息队列可以后续学习：

```text
RabbitMQ
Kafka
```

不建议在基础后端还不稳定时就开始消息队列。

## 11. 阶段八：测试

Java 后端测试：

```text
JUnit 5
Mockito
MockMvc
SpringBootTest
Testcontainers
```

测试层次：

```text
Service 单元测试
Controller 接口测试
Repository 集成测试
完整 API 测试
权限测试
并发测试
```

必须覆盖：

```text
注册
登录
重复邮箱
错误 Token
USER Todo 隔离
ADMIN 全量访问
越权更新
越权删除
分页筛选
缓存命中
缓存失效
乐观锁冲突
```

前端测试：

```text
Vitest
React Testing Library
Playwright
```

## 12. 阶段九：Docker 和部署

建议用 1～2 周。

学习：

```text
Dockerfile
Docker Compose
PostgreSQL 容器
Redis 容器
Nginx
环境变量
健康检查
日志
Actuator
```

目标架构：

```text
React / Next.js
        ↓
Nginx
   ┌────┴────┐
Spring Boot Redis
        ↓
 PostgreSQL
```

## 13. 阶段十：Next.js

React 基础稳定后再学习 Next.js。

重点：

- App Router
- Server Component
- Client Component
- Layout
- Loading
- Error Boundary
- Middleware
- Server Actions
- SEO
- 部署

建议先让 Next.js 作为前端，继续调用 Spring Boot API：

```text
Next.js
   ↓
Spring Boot API
```

不要一开始把后端 API 迁移到 Next.js，否则会影响 Java 后端学习目标。

## 14. 时间安排

### 第 1 个月：后端原理和 React

```text
第 1 周：React 状态、路由、表单
第 2 周：React Query、权限、错误处理
第 3 周：Java 基础
第 4 周：Java 集合、异常、Stream
```

### 第 2 个月：Spring Boot

```text
第 1 周：Spring Boot MVC
第 2 周：PostgreSQL + JPA
第 3 周：Spring Security + JWT
第 4 周：RBAC + Todo 资源权限
```

### 第 3 个月：工程化

```text
第 1 周：MyBatis
第 2 周：Redis 和缓存
第 3 周：JUnit、Mockito、MockMvc
第 4 周：Docker 和部署
```

### 第 4 个月：全栈整合

```text
Next.js
完整前后端联调
项目重构
部署上线
准备面试
```

## 15. 最终作品规划

将 Todo 项目升级为：

```text
个人任务管理系统
```

功能：

```text
用户注册登录
RBAC
Todo CRUD
标签
分类
优先级
截止时间
搜索
分页
统计
管理员后台
操作日志
缓存
并发编辑保护
```

最终架构：

```text
Next.js / React
        ↓
Spring Boot API
   ┌────┴─────┐
PostgreSQL  Redis
        ↓
      Docker
```

## 16. 最重要的学习顺序

```text
1. 完成 React 前端
2. 学 Java 基础
3. 用 Spring Boot 重写后端
4. 学 Spring Security 和 RBAC
5. 学 PostgreSQL、JPA、MyBatis
6. 学 Redis 和缓存
7. 学测试
8. 学 Docker 和部署
9. 学 Next.js
```

不要同时开启太多新技术。每个阶段都应做到：

```text
理解概念
  ↓
完成 Todo 功能
  ↓
写测试
  ↓
记录总结
```

## 17. 阶段性完成标准

### 后端基础

```text
[ ] 能设计 REST API
[ ] 能处理统一异常
[ ] 能写日志和 requestId
[ ] 能实现 JWT 和 RBAC
[ ] 能处理缓存失效
[ ] 能解释并发和乐观锁
```

### Java 后端

```text
[ ] 能独立创建 Spring Boot 项目
[ ] 能写 Controller / Service / Repository
[ ] 能使用 JPA 和 MyBatis
[ ] 能使用 Spring Security
[ ] 能编写事务和权限逻辑
[ ] 能写 MockMvc 和集成测试
```

### 全栈能力

```text
[ ] 能独立完成 React 页面
[ ] 能处理登录和路由保护
[ ] 能完成前后端联调
[ ] 能处理加载、错误和空状态
[ ] 能使用 PostgreSQL 和 Redis
[ ] 能使用 Docker 部署项目
```

## 18. 最终目标

最终希望达到：

```text
能够阅读 Java 公司后端代码
能够使用 Spring Boot 独立开发 API
能够完成 React / Next.js 页面
能够处理认证、权限、缓存和并发
能够编写测试和 Docker 部署配置
能够独立完成一个可上线的全栈项目
```
