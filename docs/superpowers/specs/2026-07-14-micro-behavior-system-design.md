# Micro Behavior System Design

## Context

Project-Ze 当前已经有主动回应组件：`ObserverManager` 采集上下文，`ProactiveReactionSystem` 生成候选，`BubbleManager` 决定是否显示气泡。下一阶段要把主动回应从“只说一句话”扩展为更克制的陪伴表达：气泡、轻量微动作、气泡加微动作，或者仅记录。

本轮优先实现接口与扩展边界，不引入新动画素材，不加入语音输入或摄像头。

## Goals

- 新增配置驱动的微行为系统。
- 主动回应候选可以映射到轻量微行为。
- 微行为可以独立于气泡执行。
- 支持“仅气泡 / 气泡 + 微行为 / 仅微行为 / 仅记录”。
- 为下一阶段 Debug 可视化提供微行为调试快照。
- 保持现有主动回应判断职责不变。

## Non-goals

- 不新增真实动画资源。
- 不设计复杂行为树。
- 不改变主动回应候选生成规则。
- 不加入摄像头调用。
- 不加入语音输入。
- 不引入第三方动画库。

## Architecture

新增核心模块：

- `src/core/micro-behavior-manager.ts`
- `src/config/micro-behaviors.json`

`ProactiveReactionSystem` 仍只负责判断“是否可以考虑回应”。

`MicroBehaviorManager` 负责判断“这个候选应该如何表达”。

`BubbleManager` 仍只负责气泡展示门禁。

渲染进程只负责执行主进程发来的轻量表现，例如晃动、偏移、停顿 class。

## Data flow

当前链路：

```txt
ObserverManager
  -> ContextCollector.collect()
  -> ProactiveReactionSystem.evaluateComponent(snapshot)
  -> optional AI wording
  -> BubbleManager.tryShowProactiveBubble(...)
```

新链路：

```txt
ObserverManager
  -> ContextCollector.collect()
  -> ProactiveReactionSystem.evaluateComponent(snapshot)
  -> MicroBehaviorManager.performForCandidate(candidate)
  -> optional AI wording if bubble is allowed
  -> BubbleManager.tryShowProactiveBubble(...) if needed
  -> ProactiveReactionSystem.markDelivered(...) if bubble or behavior succeeds
```

## Micro behavior types

第一版支持以下类型：

```ts
type MicroBehaviorType =
  | 'none'
  | 'pause'
  | 'wiggle'
  | 'lean'
  | 'state_hint'
  | 'bubble_delay';
```

含义：

- `none`：仅记录，不输出动作。
- `pause`：短暂停顿，表示 Ze 注意到了上下文变化。
- `wiggle`：轻微晃动。
- `lean`：轻微偏移，像探头或靠近。
- `state_hint`：短暂提示已有状态，例如 `curious` 或 `comfortable`。
- `bubble_delay`：延迟气泡展示，降低机械感。

## Public interfaces

### MicroBehaviorManager

```ts
class MicroBehaviorManager {
  evaluate(candidate: ProactiveCandidate): MicroBehaviorDecision;
  perform(decision: MicroBehaviorDecision): MicroBehaviorResult;
  performForCandidate(candidate: ProactiveCandidate): MicroBehaviorResult;
  getDebugSnapshot(): MicroBehaviorDebugSnapshot;
}
```

### Decision

```ts
interface MicroBehaviorDecision {
  reason: ProactiveReason;
  behavior: MicroBehaviorType;
  durationMs: number;
  showBubble: boolean;
  bubbleDelayMs: number;
  state?: StateId;
  intensity?: number;
  direction?: 'left' | 'right' | 'up' | 'down' | 'center';
  source: 'reason_map' | 'default' | 'disabled' | 'invalid';
}
```

### Result

```ts
interface MicroBehaviorResult {
  decision: MicroBehaviorDecision;
  performed: boolean;
  shouldShowBubble: boolean;
  bubbleDelayMs: number;
  message: string;
}
```

### Debug snapshot

```ts
interface MicroBehaviorDebugSnapshot {
  enabled: boolean;
  lastDecision: MicroBehaviorDecision | null;
  lastResult: MicroBehaviorResult | null;
  recentBehaviors: Array<{
    time: string;
    reason: ProactiveReason;
    behavior: MicroBehaviorType;
    showBubble: boolean;
    success: boolean;
    source: MicroBehaviorDecision['source'];
  }>;
}
```

## IPC interface

新增主进程到渲染进程事件：

```ts
micro-behavior
```

Preload 暴露：

```ts
onMicroBehavior(callback: (payload: MicroBehaviorPayload) => void): void
```

Payload：

```ts
interface MicroBehaviorPayload {
  id: string;
  behavior: MicroBehaviorType;
  durationMs: number;
  intensity?: number;
  direction?: 'left' | 'right' | 'up' | 'down' | 'center';
  state?: StateId;
}
```

## Configuration

新增配置：

- `src/config/micro-behaviors.json`

结构：

```json
{
  "enabled": true,
  "defaultBehavior": {
    "behavior": "pause",
    "durationMs": 700,
    "showBubble": true,
    "bubbleDelayMs": 0
  },
  "reasonMap": {
    "work_to_rest": {
      "behavior": "state_hint",
      "state": "comfortable",
      "durationMs": 1800,
      "showBubble": true,
      "bubbleDelayMs": 300
    }
  }
}
```

完整 reason 映射覆盖：

- `work_to_rest`
- `rest_to_work`
- `long_focus`
- `returning_from_idle`
- `meaningful_app_switch`
- `recent_interaction_followup`

## Renderer behavior

渲染进程根据 `micro-behavior` payload 添加临时 CSS class：

- `micro-pause`
- `micro-wiggle`
- `micro-lean-left/right/up/down/center`
- `micro-state-hint`

这些 class 只影响视觉表现，不改变主状态机。

`state_hint` 第一版不强制切换 `StateManager` 状态，避免与现有状态优先级和动画完成事件冲突。它只通过 CSS 和现有 sprite class 做轻提示。后续如果需要真实状态接管，再增加明确的状态机接口。

## Delivery semantics

一次主动候选满足以下任一条件即可视为 delivered：

- 气泡实际显示成功。
- 微行为执行成功且该决策允许仅动作表达。

如果配置要求显示气泡，但气泡被 `BubbleManager` 阻止，同时微行为成功，则仍可标记 delivered，避免同一候选在短时间内反复出现。

## Error handling

- 配置缺失时使用默认行为。
- 配置非法时降级为 `none`。
- 微行为失败不能阻塞气泡。
- 渲染进程未知行为类型时忽略并记录日志。
- 主进程记录微行为决策和结果，供 Debug 后续接入。

## Testing

验证范围：

- `npm run build` 通过。
- 新配置能被 TypeScript JSON import 读取。
- 主动候选生成后能调用 `MicroBehaviorManager`。
- preload 暴露 `onMicroBehavior`。
- 渲染进程收到未知或已知微行为不会崩溃。
- `getChatInfo()` 或后续 Debug 接口可以读取微行为调试快照。

## Future work

后续迭代顺序：

1. 主动回应 Debug 可视化增强。
2. 配置与安全清理。
3. 聊天体验增强。
4. 语音输入。
5. 摄像头调用。
