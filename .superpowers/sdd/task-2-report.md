# Operation Guide Fusion Task 2 Report

## 状态
DONE

## 改动摘要
- 新增 `src/core/operation-guide-config.ts`。
  - 定义 `OperationGuideConfig`、`DEFAULT_OPERATION_GUIDE_CONFIG`。
  - 实现纯函数 `normalizeOperationGuideConfig(input)`：只保留白名单字段，修剪字符串，兼容布尔字符串，限制 `maxTokens` 到 1000~12000，默认 `maxTokens: 4000`。
  - 实现 `OperationGuideConfigManager`，通过现有 `JsonConfigStore<OperationGuideConfig>` 持久化到 `operation-guide.json`；`get()` 返回当前配置，`update(partial)` 更新并返回新配置。
- 新增 `src/core/operation-guide-manager.ts`。
  - 实现注入式 `OperationGuideManagerDeps`：`getConfig`、`plan`、`point`、可选 `emitSnapshot`。
  - 实现 `OperationGuideManager` 的 `start`、`next`、`reidentify`、`exit`、`getSnapshot`、`isActive`。
  - 状态机覆盖 `idle`、`planning`、`pointing`、`waiting`、`completed`、`error`；`exit()` 清空活动会话并发出 idle snapshot。
  - 每个异步续接通过 `sessionId` 校验，避免旧会话异步结果覆盖新会话。
- 修改 `scripts/operation-guide-contract.test.js`。
  - 增加配置归一化 contract test。
  - 增加 manager 状态机 contract test，覆盖 start 指向第一步、reidentify 不改变 index、next 前进、exit 变为 idle/inactive。

## 文件变更
- `src/core/operation-guide-config.ts`：新增。
- `src/core/operation-guide-manager.ts`：新增。
- `scripts/operation-guide-contract.test.js`：追加 Task 2 contract tests。
- `.superpowers/sdd/task-2-report.md`：更新本报告。

## 提交哈希
- Task 1 基线：`27e6235`
- Task 2 提交：`178bccd`

## 测试命令和输出

### RED 验证
命令：
```bash
npm run build && node scripts/operation-guide-contract.test.js
```
结果：预期失败，因 Task 2 模块尚不存在。
关键输出：
```text
> project-ze@0.3.2 build
> tsc

Error: Cannot find module '../dist/core/operation-guide-config'
Require stack:
- C:\Users\25623\Desktop\AItest\AI_pet\code\scripts\operation-guide-contract.test.js
```

### 退出状态新增断言 RED 验证
命令：
```bash
npm run build && node scripts/operation-guide-contract.test.js
```
结果：预期失败，发现 `exit()` 返回 `exited` 而 brief 要求 emit idle snapshot。
关键输出：
```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

'exited' !== 'idle'
```

### Contract 验证
命令：
```bash
npm run build && node scripts/operation-guide-contract.test.js
```
结果：PASS。
关键输出：
```text
> project-ze@0.3.2 build
> tsc

operation-guide-contract tests passed
operation-guide async contract tests passed
```

### 全量测试
命令：
```bash
npm test
```
结果：PASS。
完整关键输出：
```text
> project-ze@0.3.2 test
> npm run build && node scripts/voice-input-contract.test.js && node scripts/screen-fingerprint-contract.test.js && node scripts/screen-capture-frame-contract.test.js && node scripts/screen-pointer-debug-contract.test.js && node scripts/screen-vision-request-contract.test.js && node scripts/point-visual-guard-contract.test.js && node scripts/screen-pointer-position-contract.test.js && node scripts/intent-router-contract.test.js && node scripts/response-workflow-contract.test.js && node scripts/operation-guide-contract.test.js

> project-ze@0.3.2 build
> tsc

voice-input-contract tests passed
screen-fingerprint-contract tests passed
screen-capture-frame-contract tests passed
screen-pointer-debug-contract tests passed
screen-vision-request-contract tests passed
point-visual-guard-contract tests passed
screen-pointer-position-contract tests passed
intent-router contract tests passed
response-workflow contract tests passed
operation-guide-contract tests passed
operation-guide async contract tests passed
```

### Whitespace 检查
命令：
```bash
git diff --check
```
结果：PASS；仅 Git 在 Windows 环境提示 LF 后续可能转换为 CRLF，未报告 whitespace error。

## 自审
- 符合 Task 2 范围：只新增 config manager、manager state machine，并扩展 operation-guide contract test。
- 未替换既有 `ScreenAnalyzer` / `ScreenTargetPointer` / `MoveController` 等模块。
- 未添加 Project-Chen MIDL 外设。
- API key/runtime config 未提交；配置通过既有 `JsonConfigStore` 风格存储，默认值为空字符串。
- Manager 依赖通过接口注入，测试未依赖实际屏幕观察、截图、搜索或指针实现。
- `plan` 输出与 pointer request 均被视作运行时短生命周期数据，仅保存在当前 manager snapshot 中；未写入持久文件。
- `getSnapshot()` 返回克隆对象，避免调用方直接修改内部状态。
- `exit()` 现在按 brief 清空活动状态并发出 idle snapshot。

## concerns
- `.superpowers/sdd/progress.md` 在任务开始时已有未关联改动，未纳入 Task 2 提交。
- npm 在测试期间输出既有 `electron_mirror` / `electron-mirror` 配置 warning，未影响构建或测试结果。
