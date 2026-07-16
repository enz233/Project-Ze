# Task 6 Report: Minimal Chat/ASR Routing Hook for Screen Intents

STATUS: DONE

## 改动摘要

- `src/core/chat-manager.ts`
  - 接入可选 `IntentRouter` / `IntentExecutor` 依赖与 `setIntentRouter(...)` setter。
  - 新增 `tryHandleIntent(text, source)` guard：普通 LLM 对话前先路由明确 intent；`normal_chat` / `unknown` 保持原聊天路径。
  - 对 handled 的非目标指示 intent 显示 executor message；目标指示继续由 `ScreenTargetPointer` 自己负责移动与气泡。
  - 当前 ChatManager 入口无法区分 ASR 与 typed text，按 brief 使用 `text_chat`，ASR 专用 source 留给后续 caller 更新。
- `src/main/main.ts`
  - 创建 `IntentExecutor`，将 `screen_summary` 分发到现有 `screenAnalyzer.analyze(...)`。
  - 将 `screen_target_pointer` 分发到现有 `screenTargetPointer.handle(...)`，保留 ScreenTargetPointer 内部职责。
  - 为 camera/voice/proactive intents 提供第一版薄 handler；摄像头对话入口只返回跳过说明，不自动打开摄像头。
  - 在 `chatManager.setScreenTargetPointer(...)` 后调用 `chatManager.setIntentRouter(intentRouter, intentExecutor)`。
- `PROJECT_INDEX.md` / `VERSION.md`
  - 更新 Intent Router 最小聊天路由接入、隐私边界、ASR source 后续拆分说明。

## 提交哈希

- `7d12837caea70a893abbc695e91522b165ff8d55` — `feat: route explicit screen intents from chat`

## 测试命令和结果

1. `npm run build`
   - PASS：`tsc` 成功。
   - 关键输出：`> project-ze@0.3.1 build` / `> tsc`。
2. `npm run build && npm test`
   - PASS：先执行 `tsc`，随后 `npm test` 内再次 build 并运行全部契约测试。
   - 关键输出：
     - `voice-input-contract tests passed`
     - `screen-fingerprint-contract tests passed`
     - `screen-capture-frame-contract tests passed`
     - `intent-router contract tests passed`
   - npm 仍打印既有 warning：`Unknown project config "electron_mirror"` / `Unknown env config "electron-mirror"`。

## 自审结果

- 已按 brief 只读取 ChatManager/main/screen 相关小范围源码和 Intent Router 接口文件。
- 旧 `.` 屏幕分析路径保持不变；自然语言屏幕 intent 只在明确分类且权限允许时于正常 LLM 聊天前截获。
- Executor 保持薄分发，没有迁移 ScreenAnalyzer、ScreenTargetPointer、CameraAwarenessManager 或 ChatManager 核心职责。
- 对话入口未自动打开摄像头；camera one-shot 在本任务中仅返回安全跳过说明。
- `screenTargetPointer.handle(...)` 使用原用户文本触发现有 pointer keyword 检查，避免只传 target 导致 `isPointerRequest` 不命中。
- 当前工作树仅剩任务系统自带 `.superpowers/sdd/progress.md` 未提交修改；本任务代码和项目文档已提交。

## concerns

- ASR 文本当前仍经现有 `user-message -> ChatManager.sendMessage(...)` 路径进入，无法区分 typed text 与 ASR；已按 brief 记录为 `text_chat`，后续若拆出 ASR caller 再传 `voice_asr`。
- `npm` 的 `electron_mirror` / `electron-mirror` warning 为既有配置警告，不影响 build/test。
