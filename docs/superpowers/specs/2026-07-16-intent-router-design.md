# Intent Router 多模态任务入口统一化设计

日期：2026-07-16

## 背景

Project-Ze 已有文字聊天、语音 ASR、`.` 显式屏幕分析、Screen Target Pointer、Camera Awareness、主动回应、TTS、设置页和 Debug 面板等能力。当前这些能力的入口和判断逻辑分散在各自模块中：普通聊天由 ChatManager 处理，屏幕目标指示在显式屏幕分析链路中判断，摄像头感知由 CameraAwarenessManager 自己维护状态，主动回应由 ObserverManager / ProactiveReactionSystem 决定。

随着功能继续增加，入口会越来越像一个轻量 Agent：用户可能直接在对话中说“帮我看看这个页面”“这个按钮在哪”“检测一下摄像头状态”“你刚才为什么突然说话”。如果继续在各处追加 if 判断，后续会难以解释、难以调试，也容易误触发屏幕截图或摄像头等隐私敏感能力。

本设计新增 Intent Router 作为多模态入口中枢。它不是新的业务大脑，也不替代现有模块；它负责把不同来源的输入归一化为结构化意图，在隐私规则约束下决定是否允许执行，并把任务分发给现有模块。

## 核心目标

1. 统一文字聊天、ASR 文本、`.` 屏幕入口、摄像头事件和主动上下文事件的意图表示。
2. 允许普通 LLM 对话在用户明确请求时触发当前屏幕截图 + Vision 分析或目标指示。
3. 为后续接入 LLM 意图判断预留正式接口：规则优先，LLM fallback 处理模糊表达。
4. 为屏幕、摄像头、移动、配置写入等能力建立显式权限与隐私闸门。
5. 在 Debug 面板记录最近 intent 决策，让“为什么动了 / 没动 / 说话了 / 没说话”可解释。
6. 第一版保持执行层很薄，只调用现有模块，不重写 ScreenAnalyzer、ScreenTargetPointer、CameraAwarenessManager 或 ChatManager。

## 非目标

1. 不让 LLM 直接执行截图、摄像头、移动或配置写入。LLM 只能提出结构化意图，Router 决定能不能执行。
2. 不开启普通聊天的宽松自动截图；必须是明确请求才允许屏幕能力。
3. 不让普通聊天自动开启持续摄像头或后台视频分析。
4. 不做身份识别、敏感属性判断、医学/心理诊断或保存摄像头图像/视频。
5. 不把所有业务逻辑塞进 `intent-executor.ts`；复杂业务仍留在各现有模块内部。
6. 不在第一版实现“万能路由器”。未明确授权或低置信度的能力请求应降级为普通聊天、澄清或拦截。

## 推荐方案

采用“规则优先 + LLM fallback + 权限闸门”的分层方案。

```text
用户文本 / ASR 文本 / 显式屏幕入口 / 摄像头事件 / 主动上下文事件
  -> IntentRouter.route(request)
  -> IntentClassifier.classify(request)
       -> 规则分类：明确关键词直接产出 intent
       -> LLM fallback：规则低置信或 unknown 时输出结构化 intent
  -> PermissionGate.apply(decision, request)
  -> IntentExecutor.execute(allowedDecision)
  -> 现有模块：ChatManager / ScreenAnalyzer / ScreenTargetPointer / CameraAwarenessManager / BubbleOrchestrator
```

选择该方案的原因：

- 规则分类能稳定覆盖高风险能力的明确触发词，减少 token 与延迟。
- LLM fallback 适合处理“这个页面”“这里”“那个按钮”等自然表达。
- 权限闸门独立于 LLM 输出，能防止 LLM 误判后直接调用屏幕或摄像头。
- Executor 保持薄分发，降低对现有架构的侵入。

备选方案包括：把判断继续放在 ChatManager 内部，或让 LLM 成为主分类器。前者会让 ChatManager 继续膨胀，后者第一版误触发风险、成本和延迟都偏高，因此不采用。

## 新增模块

### `src/core/intent-types.ts`

定义 Intent Router 的稳定类型边界。

建议包含：

- `IntentSource`：`text_chat`、`voice_asr`、`screen_dot`、`camera_awareness`、`proactive_context`、`debug_panel`。
- `IntentKind`：`normal_chat`、`screen_summary`、`screen_target_pointer`、`camera_check_once`、`voice_input_help`、`settings_debug_help`、`proactive_explain`、`proactive_control`、`unknown`。
- `IntentCapability`：`llm`、`screen_capture`、`vision`、`camera_frame`、`move_pointer`、`config_read`、`config_write`、`bubble`、`tts`。
- `IntentExplicitness`：`explicit`、`implicit`、`ambiguous`。
- `IntentRequest`：来源、文本、上下文、是否用户直接发起、是否来自显式屏幕入口等。
- `IntentDecision`：intent、confidence、reason、target、explicitness、requiredCapabilities、是否使用 LLM fallback。
- `IntentPermissionResult`：`allowed`、`denied`、`needs_confirmation`，以及拦截原因。
- `IntentExecutionResult`：执行状态、面向用户的回复、debug 信息和可选错误。
- `IntentDebugRecord`：用于 Debug 面板的最近决策快照。

### `src/core/intent-classifier.ts`

负责从 `IntentRequest` 产出 `IntentDecision`。

第一版规则分类：

- “看看这个页面 / 分析屏幕 / 当前页面讲什么 / 屏幕上是什么” -> `screen_summary`。
- “在哪 / 指出 / 帮我找 / 找到 + 按钮/链接/下载/登录/关闭/提交”等 -> `screen_target_pointer`，并提取 `target`。
- “检测一下摄像头状态 / 看看我在不在 / 摄像头感知有没有工作” -> `camera_check_once`。
- “语音识别没反应 / 麦克风没反应 / ASR 出问题” -> `voice_input_help`。
- “你刚才为什么突然说话 / 为什么提醒我” -> `proactive_explain`。
- “先别主动提醒我 / 关闭主动回应 / 暂停主动提醒” -> `proactive_control`。
- 其他 -> `normal_chat` 或 `unknown`。

LLM fallback 触发条件：

- 规则结果为 `unknown` 或低置信度；
- 文本包含上下文指代词或能力相关词，如“这里”“这个”“页面”“按钮”“摄像头”“主动”“语音”“设置”；
- 当前配置允许使用 LLM 分类。

LLM fallback 输出必须是结构化 JSON，并经过本地校验。非法 intent、低 confidence、缺少 target 的目标指示、高隐私能力但 explicitness 不足等情况都要降级或拦截。

### `src/core/intent-router.ts`

对外统一入口，建议暴露：

```ts
class IntentRouter {
  route(request: IntentRequest): Promise<IntentRoutedDecision>;
  getDebugSnapshot(): IntentDebugSnapshot;
}
```

职责：

1. 调用 classifier。
2. 应用权限与隐私策略。
3. 生成最终 routed decision。
4. 记录最近 N 条 debug record。
5. 不直接执行业务模块。

### `src/core/intent-executor.ts`

根据已通过权限检查的 decision 调用现有模块。

职责：

- `normal_chat` -> 保持 ChatManager 原对话路径。
- `screen_summary` -> 调用现有 ScreenAnalyzer。
- `screen_target_pointer` -> 调用现有 ScreenTargetPointer。
- `camera_check_once` -> 调用 CameraAwarenessManager 的一次性检测能力，且仅在配置允许和用户明确请求时执行。
- `voice_input_help` / `settings_debug_help` -> 返回诊断提示或调用已有配置读取接口。
- `proactive_explain` -> 读取最近主动回应/决策快照并生成解释。
- `proactive_control` -> 若已有配置入口则调用；若缺少稳定配置写入边界，第一版返回明确引导，不静默改设置。

Executor 不应自己做复杂分类和隐私判断。

## 权限与隐私策略

| 能力 | 普通聊天 / ASR | `.` 屏幕入口 | 摄像头/主动事件 |
|---|---|---|---|
| 普通聊天 | 允许 | 允许 | 不适用 |
| 当前屏幕总结 | 明确请求才允许 | 默认允许 | 不允许 |
| 目标指示移动 | 明确请求 + 目标明确才允许 | 目标明确才允许 | 不允许 |
| 摄像头单帧检测 | 明确请求 + 配置启用才允许 | 不默认允许 | 仅沿用现有 Camera Awareness 回来事件 |
| 持续摄像头分析 | 不允许 | 不允许 | 仅配置驱动，不由普通聊天触发 |
| 配置读取 | 允许低风险诊断 | 允许低风险诊断 | 仅 debug / 内部 |
| 配置写入 | 明确指令，必要时二次确认 | 明确指令，必要时二次确认 | 不允许 |

关键原则：

1. `screen_dot` 来源天然表示用户显式授权本次屏幕分析。
2. `text_chat` 和 `voice_asr` 只有明确请求才允许屏幕能力。
3. LLM fallback 不能提升权限。它说需要 `camera_frame`，也必须再通过本地 policy。
4. 主动上下文事件不能触发截图、目标指示或配置写入。
5. 摄像头能力第一版只允许一次性检测，不保存图像/视频，不做身份识别。

## LLM fallback 结构

LLM 分类只返回 JSON，示例：

```json
{
  "intent": "screen_target_pointer",
  "confidence": 0.87,
  "reason": "用户询问当前页面中下载按钮的位置",
  "target": "下载按钮",
  "explicitness": "explicit",
  "requires": ["screen_capture", "vision", "move_pointer"]
}
```

校验规则：

- `intent` 必须属于 `IntentKind`。
- `confidence` 必须在 0 到 1 之间。
- `screen_target_pointer` 必须有非空 `target`。
- `camera_check_once` 必须是 `explicit`。
- `screen_summary` 和 `screen_target_pointer` 在普通聊天 / ASR 中必须是 `explicit`。
- 任何解析失败都不能执行敏感能力。

## 调试与解释

Intent Router 维护最近 10 条 `IntentDebugRecord`。Debug 面板后续展示：

- 时间。
- 来源。
- 文本摘要。
- intent。
- confidence。
- reason。
- 是否使用 LLM fallback。
- required capabilities。
- 权限结果：allowed / denied / needs_confirmation。
- 拦截原因。
- executor 结果。

这样用户问“你刚才为什么突然说话？”时，可以由 `proactive_explain` 返回最近主动回应原因；开发者也能在 Debug 面板看到路由和权限决策。

## 接入顺序

第一阶段：类型与纯分类

1. 新增 `intent-types.ts`。
2. 新增 `intent-classifier.ts`，先实现规则分类和 LLM fallback 接口占位/适配层。
3. 新增契约测试，覆盖普通聊天不截图、明确屏幕总结、明确目标指示、摄像头一次性检测、主动回应解释等场景。

第二阶段：Router 与 Debug 快照

1. 新增 `intent-router.ts`。
2. 实现权限策略和 debug ring buffer。
3. 给 Debug 面板补最近 intent 决策读取接口。

第三阶段：小范围接管执行

1. 在普通文字聊天和 ASR 文本进入 ChatManager 前接入 Router。
2. 对 `screen_summary` 和 `screen_target_pointer` 调现有屏幕模块。
3. 对 `camera_check_once` 调一次性 Camera Awareness 检测。
4. 保留旧路径作为 fallback，避免一次性大迁移。

第四阶段：LLM fallback 正式启用

1. 复用现有 AIConfig / AIService 配置。
2. 使用结构化 prompt 要求 JSON 输出。
3. 对失败、超时、低置信度统一降级。
4. Debug 中标记 `usedLlmFallback` 与错误原因。

## 验收标准

1. 普通聊天“你好”不会触发屏幕、摄像头或移动。
2. 普通聊天或 ASR 文本“帮我看看这个页面”可路由为 `screen_summary`。
3. 普通聊天或 ASR 文本“指出下载按钮”可路由为 `screen_target_pointer`，并提取目标。
4. `.` 显式屏幕入口仍可触发屏幕总结和目标指示。
5. “检测一下摄像头状态”只触发一次性摄像头检测，不开启持续分析。
6. “你刚才为什么突然说话？”可以读取最近主动回应/决策记录并解释，若无记录则明确说明暂无记录。
7. 低置信度或 LLM JSON 解析失败时不会执行屏幕、摄像头、移动或配置写入。
8. Debug 面板或 debug snapshot 能查看最近 intent 决策。
9. 现有 ChatManager、ScreenTargetPointer、CameraAwarenessManager 的核心职责不被迁移到 Executor。
10. 项目文档更新，明确 Intent Router 第一版边界和隐私策略。

## 自检

- 无 TBD/TODO 占位符。
- 第一版范围聚焦于多模态入口统一、权限闸门、Debug 可解释和小范围执行接管。
- 明确允许普通聊天自然语言触发屏幕能力，但必须是明确请求。
- 明确 LLM fallback 只能建议意图，不能绕过本地权限策略。
- 摄像头能力保持一次性、明确请求、配置受控，不扩展为持续后台分析。
