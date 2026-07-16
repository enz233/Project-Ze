# Response Workflow Orchestrator 设计

日期：2026-07-16

## 背景

Project-Ze 已有屏幕识别、屏幕目标指向、聊天模型、气泡编排、TTS、记忆与 Intent Router 等模块。当前屏幕相关能力的结果容易由屏幕链路直接输出，导致用户看到的文案与普通聊天回复不完全一致，也难以复用聊天模型的角色语气、`<item>` 气泡格式、TTS 和聊天历史体验。

用户希望优化屏幕识别相关工作流：屏幕识别、屏幕指向等能力得到的结果不要直接作为最终回复输出，而是作为提示词或上下文发送给聊天模型，再由聊天模型通过统一聊天气泡接口输出。与此同时，项目的统一入口和一致性接口设计正在推进，因此本设计新增一个类似工作流的调用模块，用来串联现有一致性边界，而不是重写已有模块。

## 核心目标

1. 让屏幕总结和屏幕目标指向的最终用户回复统一经过聊天模型生成。
2. 沿用现有聊天气泡接口、`<item>` 回复格式、TTS fallback、聊天状态和聊天历史体验。
3. 保留 `ScreenAnalyzer` 作为唯一屏幕截图与 Vision 分析服务。
4. 保留 `ScreenTargetPointer` 对目标定位、稳定性检查、坐标映射、移动和 point visual 的本地控制。
5. 结合现有一致性接口：`IntentRouter` 管意图和权限，`ChatManager` 管模型回复，`BubbleOrchestrator` 管气泡投递，`AIMemory` / `ChatHistoryStore` 管长期历史。
6. 采用分层记忆策略：最终用户可见回复可进入聊天历史，原始屏幕观察结果只进入短期上下文和 debug 摘要，不默认进入长期记忆。
7. 第一版以屏幕能力为范围，避免改坏普通聊天、ASR、TTS、气泡、主动回应或摄像头模块。

## 非目标

1. 不让 LLM 直接决定是否截图、是否移动或是否绕过权限闸门。
2. 不替代 Intent Router 的分类与权限策略。
3. 不重写 ScreenAnalyzer、ScreenTargetPointer、MoveController 或 BubbleOrchestrator。
4. 不把工作流编排逻辑全部塞进 ChatManager。
5. 不默认保存截图、原始 Vision 大段文本或详细页面内容到长期记忆。
6. 不在第一版接管摄像头一次性检测、主动回应解释或配置诊断；这些能力只作为后续扩展方向。
7. 不改变 renderer 气泡布局、TTS 播放 IPC 或现有聊天输入体验。

## 推荐方案

新增 `ResponseWorkflowOrchestrator`，定位为“已授权多模态能力结果到统一聊天模型输出的编排层”。第一版只接入屏幕总结和屏幕目标指向。

主路径：

```text
用户文本 / ASR / .屏幕入口
  ↓
IntentRouter
  - 分类 intent
  - 权限与隐私闸门
  - debug record
  ↓
IntentExecutor
  ↓
ResponseWorkflowOrchestrator.run(...)
  ↓
Workflow tool calls
  - ScreenAnalyzer
  - ScreenTargetPointer
  ↓
WorkflowObservation / WorkflowActionResult
  ↓
ChatManager.respondFromWorkflow(...)
  - 使用统一角色和回复格式
  - 使用 <item> 气泡协议
  - 用户可见回复进入聊天历史
  - 原始工具结果只进入 volatile context / debug 摘要
  ↓
BubbleOrchestrator / TTS / renderer show-bubble
```

选择该方案的原因：

- 能实现用户关心的效果：屏幕结果接入聊天模型后再输出。
- 不破坏现有屏幕动作链路，移动和指向仍由本地模块把关。
- 不让 ChatManager 膨胀成万能业务工作流。
- 与已有一致性接口方向一致，后续摄像头、主动解释、设置诊断可以复用同一工作流边界。

备选方案包括：

1. 直接在 ChatManager 内吸收屏幕结果。实现最快，但会继续扩大 ChatManager 职责，不利于统一接口演进。
2. 新增只服务屏幕的 `ScreenResponseWorkflow`。范围清晰，但未来接入摄像头和主动解释时需要再次抽象。
3. 新增通用 `ResponseWorkflowOrchestrator`，第一版只接屏幕。范围可控且可扩展，因此采用。

## 职责边界

| 模块 | 负责 | 不负责 |
|---|---|---|
| `IntentRouter` | 意图分类、权限、隐私、debug | 工具调用细节、最终话术 |
| `IntentExecutor` | 把 allowed intent 分发到 workflow | 复杂业务逻辑 |
| `ResponseWorkflowOrchestrator` | 编排工具调用、组装短期上下文、调用聊天回复入口 | 意图分类、权限提升、直接投递最终气泡 |
| `ScreenAnalyzer` | 截图、Vision 屏幕分析、结构化屏幕观察 | 聊天模型最终表达 |
| `ScreenTargetPointer` | 目标定位、稳定性检查、移动、point visual | 最终聊天回复措辞 |
| `ChatManager` | 模型调用、`<item>` 输出、聊天历史、TTS | 截图、移动、权限判断 |
| `BubbleOrchestrator` | 气泡投递、来源和优先级边界 | LLM 内容生成 |
| `AIMemory` / `ChatHistoryStore` | 用户可见聊天历史与记忆 facade | 原始屏幕截图和原始 Vision 结果长期保存 |

## 新增模块与接口

### `src/core/response-workflow-types.ts`

定义工作流边界类型。

建议包含：

```ts
export type ResponseWorkflowKind =
  | 'screen_summary_response'
  | 'screen_target_pointer_response';

export type WorkflowObservationKind =
  | 'screen_summary'
  | 'screen_target_pointer';

export interface WorkflowObservation {
  kind: WorkflowObservationKind;
  source: 'screen_dot' | 'text_chat' | 'voice_asr';
  userText: string;
  summary?: string;
  target?: string;
  found?: boolean;
  confidence?: number;
  reason?: string;
  warnings?: string[];
}

export interface WorkflowActionResult {
  action: 'none' | 'point_target';
  status: 'completed' | 'skipped' | 'failed' | 'cancelled';
  messageForModel: string;
  debugReason?: string;
}

export interface WorkflowResponseContext {
  workflow: ResponseWorkflowKind;
  userText: string;
  observations: WorkflowObservation[];
  actionResults: WorkflowActionResult[];
  privacy: {
    persistRawObservations: false;
    allowVisibleReplyInHistory: true;
  };
}

export interface WorkflowExecutionResult {
  workflow: ResponseWorkflowKind;
  status: 'handled' | 'failed' | 'fallback';
  visibleReplyProduced: boolean;
  debugSummary: string;
  error?: string;
}
```

这些类型只表达工具结果和模型上下文，不包含截图图片，不保存 provider secret，也不把内部 debug 结构暴露给用户。

### `src/core/response-workflow-orchestrator.ts`

负责运行已授权工作流。

建议对外暴露：

```ts
class ResponseWorkflowOrchestrator {
  run(request: ResponseWorkflowRequest): Promise<WorkflowExecutionResult>;
}
```

其中 `ResponseWorkflowRequest` 来自 `IntentExecutor`，包含已通过权限检查的 intent、原始用户文本、来源和必要 dependency。

第一版支持：

1. `screen_summary_response`
   - 调用现有 ScreenAnalyzer 生成屏幕分析观察。
   - 将观察结果转换为 `WorkflowResponseContext`。
   - 调用 `ChatManager.respondFromWorkflow(context)` 输出最终回复。

2. `screen_target_pointer_response`
   - 调用现有 ScreenTargetPointer 完成目标定位、稳定性检查、移动和 point visual。
   - 将定位与动作结果转换为 `WorkflowResponseContext`。
   - 调用 `ChatManager.respondFromWorkflow(context)` 输出最终回复。

Orchestrator 不直接 `show-bubble`，也不直接调用 TTS。最终输出仍由 ChatManager 的正常链路处理。

### `ChatManager.respondFromWorkflow(context)`

给 ChatManager 增加一个小而稳定的入口，用于“工具结果驱动的聊天回复”。

职责：

1. 将 `WorkflowResponseContext` 转为模型消息。
2. 沿用现有角色设定、回复格式、`<item>` 解析、气泡显示和 TTS 行为。
3. 允许最终用户可见回复进入聊天历史。
4. 不把 `observations` 的原始内容写入长期记忆。
5. 在模型失败时返回可控失败，让工作流执行层使用短兜底文案。

提示词策略：

```text
用户刚才请求了一个屏幕相关能力。
下面是本地工具已经完成的事实结果，不要声称执行未发生的动作。
请基于工具结果，用桌面伙伴的语气回复用户。
如果已完成指向，说明“我已经过去指给你看了”。
如果未找到或取消，简短说明原因并建议用户重试。
不要暴露内部 JSON、置信度数字，除非用户明确问。
回复仍必须使用 <item>...</item> 格式。
```

## 数据流

### 屏幕总结

```text
用户：.看看这个页面
  ↓
IntentRouter -> screen_summary allowed
  ↓
ResponseWorkflowOrchestrator
  ↓
ScreenAnalyzer.captureAndAnalyze(...)
  ↓
WorkflowObservation(kind='screen_summary')
  ↓
ChatManager.respondFromWorkflow(context)
  ↓
<item>我看到了，这个页面主要是在介绍...</item>
```

### 屏幕目标指向成功

```text
用户：.指出下载按钮在哪
  ↓
IntentRouter -> screen_target_pointer allowed
  ↓
ResponseWorkflowOrchestrator
  ↓
ScreenTargetPointer.locateAndPoint(...)
  - Vision 定位
  - fingerprint 稳定性检查
  - MoveController.moveTo
  - point-visual
  ↓
WorkflowObservation + WorkflowActionResult(status='completed')
  ↓
ChatManager.respondFromWorkflow(context)
  ↓
<item>我找到下载按钮啦，在页面右上那块。我已经过去指给你看了。</item>
```

### 屏幕变化取消

```text
用户在 Vision 等待期间滚动或切换页面
  ↓
ScreenTargetPointer 检测到 fingerprint diff 过大
  ↓
WorkflowActionResult(status='cancelled', debugReason='screen_fingerprint_changed')
  ↓
ChatManager.respondFromWorkflow(context)
  ↓
<item>刚才定位的时候屏幕变了，我怕指错位置，所以没有移动。你重新发一次我再帮你看。</item>
```

## 记忆与隐私策略

采用分层记录：

| 内容 | 是否进长期聊天历史 | 是否进 debug | 说明 |
|---|---:|---:|---|
| 用户原始请求 | 是 | 是 | 普通聊天上下文 |
| 屏幕截图图片 | 否 | 否 | 不保存 |
| Vision 原始大段结果 | 否 | 可摘要 | 避免敏感页面长期沉淀 |
| 结构化 observation | 否 | 可摘要 | 仅短期本轮模型上下文 |
| 最终模型回复 | 是 | 是 | 用户可见对话 |
| 动作状态/错误码 | 否 | 是 | 便于排查 |

实现要求：

1. `WorkflowResponseContext.privacy.persistRawObservations` 第一版固定为 `false`。
2. `ChatManager.respondFromWorkflow` 不调用长期记忆接口保存原始 observation。
3. 用户可见最终回复可以按普通聊天结果进入 `ChatHistoryStore`。
4. Debug snapshot 只记录 workflow 名、状态、confidence 摘要、错误码和短原因，不记录截图和大段屏幕文本。

## 错误处理

1. 屏幕工具失败：将失败摘要交给 ChatManager 生成友好回复；如果 ChatManager 也失败，则使用短兜底气泡。
2. 目标未找到：不移动，交给模型说明没有找到或目标不够明确。
3. 低置信度：不移动，交给模型说明不确定，建议用户描述更具体。
4. 屏幕变化取消：不移动，交给模型说明屏幕变了并建议重试。
5. 模型调用失败：不影响工具状态；使用本地兜底文案，避免用户无反馈。
6. TTS 失败：沿用现有聊天气泡 fallback。
7. 工作流异常：不影响普通聊天路径，Debug 记录错误摘要。

## 兼容与渐进落地

第一版应保持旧行为可回退：

1. 先新增类型和 Orchestrator，不改动屏幕工具内部核心逻辑。
2. 给 ScreenAnalyzer / ScreenTargetPointer 增加或适配“返回结构化结果”的轻薄接口；若现有方法已经返回足够信息，则只做 adapter。
3. 给 ChatManager 增加 `respondFromWorkflow`，复用现有流式回复、`<item>` 解析、气泡和 TTS。
4. 在 IntentExecutor 中仅对 `screen_summary` 和 `screen_target_pointer` 接入新 workflow。
5. 保留旧屏幕输出 fallback：新 workflow 失败时仍能给用户简短反馈。
6. 不改变 renderer IPC、气泡 DOM、TTS 播放协议和现有聊天输入交互。

## 测试与验证

实现计划中需要覆盖：

1. `npm run build` 通过。
2. `npm test` 通过；若某些既有测试失败，需要如实记录。
3. 契约测试：`WorkflowResponseContext` 默认不允许保存 raw observations。
4. 契约测试：屏幕总结 workflow 会调用 ChatManager 的 workflow 回复入口，而不是直接最终 show bubble。
5. 契约测试：屏幕指向成功时 action result 标记为 `completed`，模型上下文包含“已移动/已指向”的事实。
6. 契约测试：屏幕变化取消时 action result 标记为 `cancelled`，不会调用移动后的成功话术。
7. 回归验证：普通聊天“你好”不触发屏幕 workflow。
8. 回归验证：ChatManager 原普通对话、TTS fallback、`<item>` 解析不被破坏。
9. 回归验证：BubbleOrchestrator 仍只负责投递，不承担模型生成。
10. 文档更新：`PROJECT_INDEX.md` 和必要的模块说明记录新 workflow 边界。

## 验收标准

1. 屏幕总结结果最终通过聊天模型生成用户可见气泡。
2. 屏幕目标指向结果最终通过聊天模型生成用户可见气泡。
3. 指向动作仍由 ScreenTargetPointer / MoveController 本地执行，LLM 不直接控制移动权限。
4. 原始屏幕观察结果不进入长期聊天记忆；最终可见回复可以进入聊天历史。
5. 普通聊天、ASR 文本、TTS、BubbleOrchestrator、ScreenAnalyzer、ScreenTargetPointer 的核心职责不被破坏。
6. Debug 能看到 workflow 状态摘要和失败原因，但不保存截图或大段屏幕内容。
7. 构建和测试验证完成，失败或跳过项如实记录。

## 自检

- 无 TBD/TODO 占位符。
- 设计范围聚焦于屏幕结果接入聊天模型输出，不扩展到摄像头或主动回应执行。
- 明确复用现有一致性接口，不重复实现 Intent Router、ScreenAnalyzer、ScreenTargetPointer、ChatManager 或 BubbleOrchestrator 的职责。
- 明确分层记忆策略：最终回复可入历史，原始屏幕 observation 不入长期记忆。
- 明确 fallback 和兼容策略，避免新 workflow 失败时破坏现有屏幕体验。
