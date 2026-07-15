# Task 3 Report: LLM Fallback Validation Contracts

## 状态
完成。

## 改动摘要
- `scripts/intent-router-contract.test.js`
  - 新增 LLM fallback 可将含糊当前页面请求安全分类为 `screen_summary` 的 contract。
  - 新增 LLM fallback 建议 `screen_target_pointer` 但缺少 `target` 时降级为 `unknown` 且无敏感能力的 contract。
  - 新增 LLM fallback 返回非法 JSON 时保留安全 draft、标记 `usedLlmFallback` 并记录失败原因的 contract。
- `src/core/intent-classifier.ts`
  - 在 `normalizeFallback` 中补充低置信度保护：非 `normal_chat` 的 LLM fallback 若低于 `lowConfidenceThreshold`，降级为 `unknown`，清空 capabilities，并保留 fallback 使用标记。
  - 保留既有缺 `target` 的 `screen_target_pointer` 防护。

## 提交
- 实现与测试提交：`9d374ee` - `test: cover intent llm fallback validation`
- 报告元数据提交：本报告更新提交见后续 `git log -1 --short`；由于提交哈希包含文件内容，最终报告提交哈希以命令输出为准。

## 运行的测试命令和结果
1. `npm test`
   - 结果：PASS。
   - 备注：新增测试后现有实现已通过；随后仍按任务要求补充低置信度硬化。
2. `npm test`
   - 结果：PASS。
   - 覆盖：`npm run build`、`voice-input-contract`、`screen-fingerprint-contract`、`screen-capture-frame-contract`、`intent-router-contract` 全部通过。

## 自审结果
- 仅修改任务指定文件和报告文件。
- LLM fallback 仍只产生结构化意图；本地 classifier/router 继续负责安全降级与权限策略。
- 非法 JSON 路径通过 `classify()` catch 返回安全 draft，并带 `LLM fallback failed` 原因。
- 缺 target 的 pointer fallback 与低置信度敏感 fallback 均不会携带敏感能力执行。
- `normal_chat` 低置信度不被新增保护误降级，符合 brief 给定条件。

## Concerns
- `npm test` 输出 npm 配置警告：`electron_mirror` / `electron-mirror` 为未知配置；测试本身通过。
