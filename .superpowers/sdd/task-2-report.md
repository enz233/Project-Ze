# Intent Router Task 2 Report

## 状态
DONE

## 改动摘要
- 新增 `src/core/intent-router.ts`。
- 实现 `IntentRouter.route()`：调用 `IntentClassifier` 得到结构化意图后，应用本地权限策略，返回 `IntentRoutedDecision`。
- 实现屏幕、视觉、指针移动、摄像头帧和配置写入等敏感 capability 的本地权限闸门：
  - 普通聊天/ASR 文本可在明确用户请求时允许屏幕总结或目标指示。
  - LLM fallback 的结构化建议不会绕过本地权限策略；敏感 capability 必须满足明确性和用户发起条件。
  - 摄像头只允许明确、用户发起、且 `cameraEnabled()` 为 true 的一次性检测。
  - `proactive_control` 的配置写入返回 `needs_confirmation`。
- 实现最近 intent 决策 debug ring buffer：`getDebugSnapshot()` 返回只读快照副本，`recordExecution()` 可补充执行结果。
- 扩展 `scripts/intent-router-contract.test.js`，覆盖明确屏幕请求允许、模糊摄像头 fallback 拒绝、摄像头配置关闭拒绝、debug snapshot 截断与字段记录。
- 为对齐 Task 1 后的当前分支基线，先应用 Task 1 intent classifier commit，再合并当前 `master`，解决 `package.json` 测试脚本冲突，保留既有 screen pointer debug contract 并追加 intent-router contract。

## 提交哈希
- Task 1 基线应用提交：`684e460`
- 合并当前 master 提交：`783b4e1`
- Task 2 实现提交：`c1491b4`

## 运行的测试命令和结果
- `npm test`：PASS。
  - `npm run build` / `tsc` 成功。
  - `voice-input-contract tests passed`
  - `screen-fingerprint-contract tests passed`
  - `screen-capture-frame-contract tests passed`
  - `screen-pointer-debug-contract tests passed`
  - `intent-router contract tests passed`
  - npm 仍输出既有 `electron_mirror` / `electron-mirror` 配置 warning，未影响结果。
- `git diff --check`：PASS；仅 Windows 环境下 Git 提示 `src/core/intent-router.ts` 后续可能 LF→CRLF，未报告 whitespace error。

## 自审结果
- 仅新增/修改 Intent Router Task 2 相关代码与 contract tests；未触碰 renderer、IPC 接入、执行器或 debug panel。
- 权限策略独立于 classifier / LLM fallback 输出，敏感 capability 由本地 Router 最终裁决。
- 摄像头路径未引入持续后台分析、身份识别、敏感属性判断、医学/心理诊断或图像/视频保存。
- `getDebugSnapshot()` 返回数组副本，避免调用方直接修改内部 `recent` 记录数组。
- `debugLimit` 环形保留行为由 contract test 覆盖。

## concerns
none

---

## Fix Report（2026-07-16）

### 状态
DONE

### 改动摘要
- 在 `IntentRouter.route()` 中基于最终 `decision.intent` 补全敏感 intent 的必要 capabilities，并去重后统一用于 permission gate 与 debug snapshot。
- 覆盖的补全映射：
  - `screen_summary` → `screen_capture`, `vision`, `llm`
  - `screen_target_pointer` → `screen_capture`, `vision`, `move_pointer`
  - `camera_check_once` → `camera_frame`
  - `proactive_control` → `config_write`
- 修复 LLM fallback 通过 `requires: []` 伪造敏感 intent 时绕过本地权限 gate 的问题；摄像头关闭和 explicitness 检查仍由 Router 强制执行。
- 将非法/负数 `debugLimit` clamp 为 `0`，避免 ring buffer 清理循环在负数限制下挂起。
- 补充 contract tests：摄像头 requires 为空仍拒绝、屏幕总结 debug capabilities 补全、`debugLimit: -1` 不挂起且不保留 recent 记录。

### 提交哈希
- 修复代码与 contract tests：`a528508`

### 测试命令和结果
- `npm test`：PASS。
  - `npm run build` / `tsc` 成功。
  - `voice-input-contract tests passed`
  - `screen-fingerprint-contract tests passed`
  - `screen-capture-frame-contract tests passed`
  - `intent-router contract tests passed`
  - npm 仍输出既有 `electron_mirror` / `electron-mirror` 配置 warning，未影响结果。
- `git diff --check`：PASS。

### concerns
none
