# Todo Agent 第六周学习 Spec：基于 Todo 的运动推荐

## 1. 目标

当用户创建运动相关 Todo 时，Agent 根据当前 Todo 内容推荐相关运动或辅助任务。

```text
用户：创建一个 Todo：今天跑步

Agent：已创建 Todo：今天跑步。
你还可以考虑：
1. 跑前热身 10 分钟
2. 跑后拉伸 10 分钟
3. 记录今天的跑步距离
```

推荐只展示候选，不自动创建。用户明确点击或确认后，才调用 `create_todo`。

## 2. 学习目标

```text
事件驱动上下文
意图和领域分类
推荐与执行分离
结构化模型输出
用户确认流程
推荐去重
个性化上下文
```

## 3. 功能边界

必须实现：

- 识别 Todo 是否与运动相关。
- 区分运动类型。
- 生成最多 3 条相关推荐。
- 推荐不能与已有 Todo 重复。
- 推荐只能展示，不能自动写入数据库。
- 用户确认后才能创建推荐 Todo。
- 推荐创建使用当前登录用户身份。

暂不实现：

```text
❌ 医疗建议
❌ 根据疾病制定运动方案
❌ 自动制定完整训练计划
❌ 第三方运动平台同步
❌ 日历和提醒系统
```

## 4. 运动分类

```ts
type ExerciseCategory =
  | 'general'
  | 'aerobic'
  | 'strength'
  | 'flexibility'
  | 'recovery'
```

| 分类 | 关键词 | 示例 |
|---|---|---|
| general | 运动、锻炼、健身 | 今天运动 |
| aerobic | 跑步、快走、骑行、游泳 | 今天跑步 |
| strength | 力量、哑铃、深蹲、俯卧撑 | 下肢力量训练 |
| flexibility | 拉伸、瑜伽、柔韧 | 做拉伸 |
| recovery | 放松、恢复 | 运动后放松 |

用户只说“运动”时，不能擅自判断为跑步，应推荐多个方向。

## 5. 推荐策略

### 通用运动

```text
快走 30 分钟
慢跑 20 分钟
做 15 分钟拉伸
居家力量训练
```

### 有氧运动

```text
跑前热身 10 分钟
跑后拉伸 10 分钟
记录今天的跑步距离
```

### 力量训练

```text
上肢力量训练
下肢力量训练
核心训练
训练后拉伸
```

### 柔韧性训练

```text
瑜伽前热身
髋部拉伸
训练后放松
```

## 6. 推荐上下文

```ts
type RecommendationContext = {
  sourceTodo: { id: number; title: string; completed: boolean }
  category: ExerciseCategory
  recentTodos: Array<{ id: number; title: string; completed: boolean }>
  userPreferences?: {
    suggestionEnabled: boolean
    preferredExerciseTypes?: string[]
  }
}
```

上下文原则：

- 只读取当前用户的 Todo。
- 不把 `userId` 交给模型决定。
- 不重复推荐已有 Todo。
- 用户关闭建议时不调用推荐流程。

## 7. 推荐工具

新增只读工具：

```text
suggest_related_todos
```

参数：

```json
{
  "sourceTodoId": 12,
  "category": "aerobic",
  "maxSuggestions": 3
}
```

返回：

```json
{
  "sourceTodoId": 12,
  "suggestions": [
    {
      "title": "跑前热身 10 分钟",
      "type": "preparation",
      "reason": "有助于身体进入运动状态"
    }
  ]
}
```

工具只生成建议，不修改数据库；`maxSuggestions` 最大为 3。

## 8. 推荐与创建流程

```text
用户创建 Todo
  ↓
create_todo
  ↓
识别运动分类
  ↓
suggest_related_todos
  ↓
前端展示推荐卡片
  ↓
用户点击推荐
  ↓
显示创建确认
  ↓
用户确认
  ↓
create_todo
```

推荐创建时客户端可以提交：

```json
{
  "title": "跑前热身 10 分钟",
  "source": "recommendation",
  "sourceTodoId": 12
}
```

服务端必须从 JWT 获取当前用户，不信任客户端 `userId`。

## 9. Agent 行为规则

```text
当用户创建运动相关 Todo 后，可以调用 suggest_related_todos 提供最多 3 条建议。

规则：
1. 推荐必须与当前 Todo 直接相关。
2. 用户只说“运动”时，不要默认推荐跑步，应提供多个方向。
3. 不要推荐已经存在的 Todo。
4. 只展示建议，不自动创建建议任务。
5. 创建建议任务必须等待用户明确确认。
6. 不提供医疗诊断、疾病治疗或高风险运动建议。
```

## 10. 前端交互

创建成功后展示推荐卡片：

```text
已创建 Todo：今天跑步

你还可以考虑：
┌──────────────────────┐
│ 跑前热身 10 分钟       │
│ 有助于身体进入运动状态   │
│ [添加 Todo]            │
└──────────────────────┘
```

点击后显示：

```text
确认添加“跑前热身 10 分钟”吗？
[确认添加] [取消]
```

要求：

- 推荐卡片可键盘操作。
- 添加成功后更新对话和 Todo 列表。
- 添加失败时保留推荐卡片并允许重试。

## 11. 安全边界

- 推荐内容视为不可信模型输出。
- 前端不执行模型返回的 HTML 或代码。
- 推荐标题需要服务端重新校验。
- 创建推荐 Todo 仍然走现有 `create_todo` 服务。
- 模型不能指定 `userId`。
- 模型不能绕过确认直接创建推荐任务。

## 12. 验收标准

```text
“今天运动”不会被强制判断成跑步
“今天跑步”被识别为 aerobic
“力量训练”被识别为 strength
“做拉伸”被识别为 flexibility
最多返回 3 条建议
建议与源 Todo 相关
已有 Todo 不会重复推荐
推荐不会自动写入数据库
用户取消确认后不会创建 Todo
用户确认后才创建 Todo
跨用户访问受到拒绝
```

## 13. 分阶段实现计划

```text
Day 1：定义运动分类和分类提示词
Day 2：实现 suggest_related_todos 和推荐去重
Day 3：接入推荐创建确认流程
Day 4：实现前端推荐卡片
Day 5：测试模糊输入、重复推荐、取消确认和权限隔离
```
