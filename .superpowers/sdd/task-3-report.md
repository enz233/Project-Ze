# Task 3 Report: ChatManager Workflow Response Entry

## 状态
完成。

## 改动摘要
- `src/core/chat-manager.ts`
  - 新增 `WorkflowChatResponseResult`、`WorkflowResponseContext` 与 `ResponseWorkflowOrchestrator` imports。
  - 在 `ChatManager` 中新增 `responseWorkflowOrchestrator` 字段和 `setResponseWorkflowOrchestrator(...)` setter，为 Task 4 runtime wiring 提供入口。
  - 抽取 `deliverAssistantResponse(fullResponse, interactionType, interactionText)`，统一处理 `<item>` 解析、长文本拆分、assistant message 保存、interaction 记录、TTS 播放与文本气泡 fallback。
  - 将普通聊天原有重复回复投递逻辑替换为共享 helper，并保留普通聊天关系增益 `changeAffection(0.3)` / `changeFamiliarity(0.1)`，避免重复保存 assistant 或重复记录 chat interaction。
  - 新增 `respondFromWorkflow(context)`，使用 workflow 专用 status/user prompt 构建 AI 消息，调用 `chatStream` 生成可见回复；仅在 `allowVisibleReplyInHistory` 为 true 时保存用户原文，然后通过共享 helper 保存/展示 assistant 回复并记录 `workflow-*` interaction。
  - 新增 `buildWorkflowStatusPrompt(...)` 与 `buildWorkflowUserPrompt(...)`，按 brief 原文组织观察与动作结果，限制不暴露内部 JSON/置信度数字。

## 提交
- 待提交。

## 运行的测试命令和结果
1. `npm test`
   - 结果：PASS。
   - 详细输出：`npm run build` / `tsc` 通过；`voice-input-contract`、`screen-fingerprint-contract`、`screen-capture-frame-contract`、`screen-pointer-debug-contract`、`screen-vision-request-contract`、`point-visual-guard-contract`、`intent-router-contract`、`response-workflow-contract` 全部通过。
   - 备注：npm 输出既有配置警告：`electron_mirror` / `electron-mirror` 为未知配置；未影响测试结果。
2. `git diff --check -- src/core/chat-manager.ts`
   - 结果：PASS，无 whitespace error。

## 自审结果
- 仅修改 Task 3 指定实现文件 `src/core/chat-manager.ts` 与本报告文件；未修改 ASR/Qwen 文件或 broad docs。
- 普通聊天路径仍只在构建 messages 后保存一次 user message；assistant 保存与 interaction 记录移动到共享 helper，未额外重复调用。
- Workflow 路径不保存 raw observations；仅按 privacy 设置保存用户可见原文，并通过 helper 保存 assistant 可见回复。
- Workflow interaction type 使用 `workflow-${context.workflow.replace(/_/g, '-')}`，符合 brief 指定逻辑。
- Runtime direct screen route 尚未接入 workflow，符合 brief 中 Task 4 范围说明。

## Concerns
- `responseWorkflowOrchestrator` 字段和 setter 本任务只建立入口，当前未使用；实际 runtime wiring 预期在 Task 4 完成。
- `npm test` 存在 npm 配置 warning（`electron_mirror` / `electron-mirror` unknown config），测试和 build 均通过。
