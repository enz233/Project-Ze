STATUS: DONE

改动摘要:
- 在 `src/main/main.ts` 初始化 `IntentRouter`，接入 `IntentClassifier`，并通过同步 `cameraAwarenessManager.getConfig().enabled` 闭包提供摄像头权限状态。
- 在 `src/main/main.ts` 新增 IPC handler：`intent-router:get-debug-snapshot`，返回 `intentRouter.getDebugSnapshot()` 或空 `recent` fallback。
- 在 `src/main/preload.ts` 暴露 `window.companion.intentRouter.getDebugSnapshot()`。
- 在 `src/main/debug.html` 新增 Intent Router 调试卡片、HTML 转义 helper、轮询渲染最近决策。
- 更新 `docs/superpowers/plans/2026-07-16-intent-router.md` 中 Task 5 勾选状态。

提交哈希:
- 59c1307

测试命令和结果:
- `npm test`
- 结果: PASS
- 关键输出摘要: `tsc` 编译通过；`voice-input-contract tests passed`；`screen-fingerprint-contract tests passed`；`screen-capture-frame-contract tests passed`；`intent-router contract tests passed`。
- 备注: npm 输出现有警告 `Unknown project/env config "electron_mirror"/"electron-mirror"`，未影响测试。

自审结果:
- 已按 brief 限定只修改 main/preload/debug 暴露相关逻辑，未迁移核心职责。
- `cameraEnabled` 保持同步闭包；当前 `CameraAwarenessManager.getConfig()` 是同步方法。
- Debug 渲染对动态文本使用 `escapeHtml`，避免插入未转义内容。
- `git diff --check` 无输出，未发现 whitespace 问题。

concerns:
- 无。
