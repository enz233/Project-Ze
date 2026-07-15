# Proactive Reaction Component

Project-Ze 的主动回应系统是一个轻量“主动部件”，用于判断 Ze 是否应该在用户节奏变化时给出轻柔回应。

## 设计边界

这个部件应该保持克制：

- 只捕捉节奏变化，不持续分析用户具体任务。
- 不自动截图；Vision 仍只用于显式屏幕分析。
- 不做系统控制、任务规划或生产力建议。
- AI 不负责决定是否打扰，只能在候选已通过本地规则后改写短句。
- 不扩大成长期画像或复杂 RAG；只使用轻量记忆与当前上下文。

## 主流程

```txt
ObserverManager
  → ContextCollector.collect()
  → ProactiveReactionSystem.evaluateComponent(snapshot)
  → MicroBehaviorManager.performForCandidate(candidate)
  → optional AI wording if bubble is allowed
  → BubbleOrchestrator.requestBubble(...)
  → BubbleManager.tryShowProactiveBubble(...)
```

主进程气泡请求先进入 `BubbleOrchestrator` 做来源/优先级的轻量编排，再交给 `BubbleManager` 执行状态门禁、冷却和 `show-bubble` IPC 投递。

## 配置

主动回应的阈值、分类关键词、文案模板和允许 AI 改写的 reason 位于：

- [src/config/proactive-reactions.json](../src/config/proactive-reactions.json)

配置项包括：

- `limits`：全局间隔、滚动预算、工作/休息切换阈值、长专注阈值等。
- `cooldownsMs`：每类 reason 的冷却时间。
- `categories`：窗口标题/应用名关键词到活动分类的映射。
- `templates`：本地 fallback 文案。
- `aiWordingReasons`：允许 AI 改写短句的 reason。

## 公开接口

核心文件：

- [src/core/proactive-reaction-system.ts](../src/core/proactive-reaction-system.ts)

主要接口：

```ts
evaluateComponent(snapshot: ContextSnapshot): ProactiveComponentDecision
recordDirectInteraction(type: string, detail?: string): void
markDelivered(candidate: ProactiveCandidate, text?: string): void
getDebugSnapshot(): ProactiveDebugSnapshot
```

### evaluateComponent

后续 AI 调用、动作系统或微行为系统需要主动部件时，应优先调用这个接口，而不是直接复刻判断规则。

返回：

```ts
{
  candidate: ProactiveCandidate | null,
  debug: ProactiveDebugSnapshot
}
```

`candidate` 只表示“本地规则认为可以考虑回应”。最终是否显示仍应通过 `BubbleOrchestrator` 编排，并由 `BubbleManager.tryShowProactiveBubble` 做状态门禁和投递。

### recordDirectInteraction

用户点击、拖拽、聊天等直接互动应调用此接口。它不会直接触发回应，只会降低短时间内识别“有意义切换”的门槛。

### markDelivered

只有当气泡实际显示成功后调用。这样预算、冷却和最近发言记录才准确。

### getDebugSnapshot

供 F3 Debug 面板展示最近主动决策、拦截原因、预算状态和当前分类。

## 当前支持的 reason

- `work_to_rest`
- `rest_to_work`
- `long_focus`
- `returning_from_idle`
- `meaningful_app_switch`
- `recent_interaction_followup`

短期内不要继续扩展大量 reason。若要新增，应先确认它增强的是“陪伴感”而不是“助手能力”。

## 后续扩展建议

后续 AI 或微行为系统可以把 `ProactiveCandidate` 映射为：

- 一句短气泡
- 一个微动作
- 气泡 + 微动作
- 仅记录，不输出

推荐方向是让主动回应逐渐支持动作表达，而不是无限增加说话规则。

## Micro behavior handoff

主动回应候选现在可以交给 `MicroBehaviorManager` 映射为轻量微行为。

主流程：

```txt
ObserverManager
  → ContextCollector.collect()
  → ProactiveReactionSystem.evaluateComponent(snapshot)
  → MicroBehaviorManager.performForCandidate(candidate)
  → optional AI wording if bubble is allowed
  → BubbleOrchestrator.requestBubble(...)
  → BubbleManager.tryShowProactiveBubble(...) if needed
```

核心文件：

- [src/core/micro-behavior-manager.ts](../src/core/micro-behavior-manager.ts)
- [src/config/micro-behaviors.json](../src/config/micro-behaviors.json)

第一版微行为只通过 IPC 和 CSS 做轻量表现，不新增素材，也不接管 `StateManager` 状态。

支持的行为：

- `none`：仅记录。
- `pause`：短暂停顿。
- `wiggle`：轻微晃动。
- `lean`：轻微偏移/探头。
- `state_hint`：状态感提示。
- `bubble_delay`：延迟气泡。

## Debug panel

F3 Debug 面板现在会分开展示主动回应决策与微行为状态。

展示内容包括：

- Proactive Decision：当前分类、前一分类、最近决策、候选 reason、拦截原因、滚动/每日预算、最近输出、最近直接互动、长专注阈值。
- Micro Behavior：微行为开关、最近行为、对应 reason、是否显示气泡、气泡延迟、决策来源、是否已发送，以及最近 3 条微行为简史。

这些信息来自：

```ts
proactiveReactionSystem.getDebugSnapshot()
microBehaviorManager.getDebugSnapshot()
```

Debug 面板只读展示状态，不改变主动回应规则或微行为执行逻辑。
