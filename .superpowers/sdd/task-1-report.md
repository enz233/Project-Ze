# Task 1 Report: Intent Types and Rule Classifier

## 状态
DONE

## 改动摘要
- 新增 `src/core/intent-types.ts`，定义 Intent Router 第一阶段所需的 request、decision、permission、execution、debug 类型，以及 `isSensitiveCapability()` 和 `summarizeIntentText()`。
- 新增 `src/core/intent-classifier.ts`，实现本地规则分类器 `IntentClassifier`，覆盖普通聊天、屏幕总结、目标指示、摄像头一次性检测、语音/设置/主动提醒相关意图，并提供低置信度 LLM fallback 结构化归一逻辑。
- 新增 `scripts/intent-router-contract.test.js`，验证普通聊天不申请敏感能力、自然语言屏幕总结、ASR 目标指示目标抽取、摄像头明确一次性检测。
- 更新 `package.json`，将 intent-router contract test 接入 `npm test`。

## 提交哈希
TBD

## 运行的测试命令和结果
- `npm test`（预期失败阶段）：build 和既有 contract tests 通过，新增 intent-router contract test 因 `Cannot find module '../dist/core/intent-classifier.js'` 失败，符合 brief 预期。
- `npm test`（实现后）：通过。输出包含：
  - `voice-input-contract tests passed`
  - `screen-fingerprint-contract tests passed`
  - `screen-capture-frame-contract tests passed`
  - `intent-router contract tests passed`

备注：npm 输出既有配置警告 `Unknown project config "electron_mirror"` / `Unknown env config "electron-mirror"`，不影响测试通过；本任务未修改 npmrc。

## 自审结果
- 仅修改 Task 1 brief 指定文件及任务报告文件。
- contract test 内容按 brief 逐字创建。
- `package.json` test script 按 brief 接入新增测试。
- intent types 和 classifier 实现按 brief 创建。
- 未触碰 renderer、TTS、preload 或与 Task 1 无关模块。

## Concerns
none
