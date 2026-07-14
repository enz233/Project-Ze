# Proactive Debug Panel Design

## Context

Project-Ze 已有主动回应系统和微行为系统。F3 Debug 面板当前能展示记忆、应用使用、生命习惯和简短 proactive 状态，但主动回应链路已经扩展为：候选判断、抑制原因、预算、最终气泡、微行为决策。下一阶段需要让开发者在 F3 面板中更直观看到主动回应为何触发、为何被拦截、以及微行为如何表达。

## Goals

- 增强 F3 Debug 面板中的主动回应可读性。
- 同时展示 `ProactiveReactionSystem` 与 `MicroBehaviorManager` 的调试快照。
- 将关键信息拆成状态卡片，而不是挤在单个文本块中。
- 保持只读调试，不改变主动回应逻辑。
- 不增加外部依赖。

## Non-goals

- 不新增主动回应 reason。
- 不改变主动回应触发阈值。
- 不改变微行为执行逻辑。
- 不做复杂图表或历史曲线。
- 不引入新的前端框架。

## Design

F3 Debug 面板的上方状态区域从 5 个卡片扩展为 6 个卡片：

1. Relationship
2. Interactions
3. Top Apps
4. Life Pattern
5. Proactive Decision
6. Micro Behavior

`Proactive Decision` 展示：

- 当前分类与前一分类
- 最近决策
- candidate reason
- suppress reason
- rolling/day 预算
- 最近输出内容与距今时间
- 最近直接互动
- 已触发长专注阈值

`Micro Behavior` 展示：

- enabled 状态
- last behavior
- 是否 showBubble
- bubble delay
- source
- performed 状态
- 最近 3 条微行为简史

## Data source

现有 `get-chat-info` 已返回：

```ts
{
  proactive: proactiveReactionSystem?.getDebugSnapshot() || null,
  microBehavior: microBehaviorManager?.getDebugSnapshot() || null
}
```

本轮主要改动集中在：

- `src/main/debug.html`

若发现文档与实际链路不一致，则同步更新：

- `docs/proactive-reaction-component.md`

## Error handling

- 如果没有 proactive 数据，显示 `No proactive state yet`。
- 如果没有 micro behavior 数据，显示 `No micro behavior yet`。
- 如果字段缺失，显示 `-` 或 `none`，不抛出错误。
- Debug 面板刷新失败时，所有状态卡展示同一错误信息。

## Testing

- 运行 `npm run build`。
- 打开 F3 Debug 面板应能正常加载。
- `Refresh Memory` 应刷新 proactive 与 micro behavior 信息。
- 未触发主动回应时，面板应显示空状态，不应报错。
