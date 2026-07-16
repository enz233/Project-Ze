# Operation Guide 最小可用融合设计

## Implementation Status (Paused 2026-07-16)

This document describes the target design, not the current fully wired runtime state.

Current committed state when paused:

- Implemented: Operation Guide domain types, intent helpers, planner/fallback parsing, progress-evaluation parser, config normalization/persistence, manager state machine, and contract tests.
- Not integrated: Intent Router / IntentExecutor guide intents, main process runtime wiring, preload API, IPC, settings page, renderer guide panel, final user-facing docs.
- Resume point: Task 3 in `docs/superpowers/plans/2026-07-16-operation-guide-fusion.md`.

## 背景

用户要求获取 `https://github.com/Cookie-yeah666/Project-Chen/tree/master` 的 `master`，并将其中特殊的 Operation Guide 尝试融合到当前 Project-Ze 项目中。约束是：

- 主要通过文档理解当前状态，避免读取过多源文件。
- 不改变其它已有模块，只单独融合 Operation Guide。
- 每次任务后更新文档并提交 git。

已将 Project-Chen master 拉取到本地 `../Project-Chen/`。当前本项目以 Project-Ze v0.3.2 为稳定底座，已有 Intent Router、Response Workflow Orchestrator、ScreenAnalyzer、ScreenTargetPointer、MoveController、BubbleOrchestrator、JsonConfigStore、Qwen-ASR realtime、Camera Awareness 等能力。Project-Chen master 的特殊新增主线是 MIDL version / AI 桌宠分步操作指引助手。

用户选择方案 A：最小可用融合；随后确认目标不是空壳，而是要整合实现 Operation Guide 目标功能。

## 目标

本轮目标是在不覆盖现有模块的前提下，把 Project-Chen 的 Operation Guide 作为 Project-Ze 的可选能力接入：

1. 用户可在设置页启用 Operation Guide。
2. 用户输入“帮我安装 Steam”“我想下载 Claude 客户端”“怎么配置 VS Code”或 `/guide Codex` 时可启动分步指引。
3. 系统生成结构化步骤队列。
4. 桌宠针对当前步骤调用现有屏幕目标指向能力，尝试移动并指向目标。
5. 用户可以通过“我完成了 / 重新识别 / 退出”推进、重试或结束流程。
6. 搜索或 AI planner 不可用时仍有 fallback plan。
7. 普通聊天、ASR、TTS、Camera Awareness、Memory、现有屏幕指向和 Response Workflow 不被破坏。

## 非目标

本轮明确不迁移或不实现：

- Project-Chen 的 MIDL README 整体定位、挑战杯叙事和仓库 tag 体系。
- Windows 自提权、`start.exe`、绿色版启动器、visibility watchdog、打包脚本改动。
- Project-Chen 的 `ScreenAnalyzer` / `ScreenTargetPointer` 全量替换。
- Algorithm 3 局部裁剪放大复核、高精度 2560 策略和 screen-target-alignment 全量迁移。
- 自动点击、自动输入、键鼠注入。
- 红圈、矩形、透明覆盖层、额外箭头。
- 全局输入 hook、wheel IPC、高频后台截图。
- 默认启用摄像头或麦克风。
- 将原始截图、屏幕 observation、教程搜索结果写入长期记忆。
- 不做持续全局 screen watcher；只允许在 Operation Guide active 且当前步骤处于 waiting 时做低频、可取消的有限屏幕变化检测。

这些能力后续可作为独立设计评估，不与本轮最小融合混在一起。

## 架构设计

### 新增 Operation Guide 领域层

新增独立 core 模块，参考 Project-Chen 但按 Project-Ze 当前边界改造：

- `src/core/operation-guide-types.ts`
  - 定义 `OperationGuideAction`、`OperationGuideStep`、`OperationGuidePlan`、`OperationGuideSource`、`OperationGuideStatus`、`OperationGuideSnapshot`。
- `src/core/operation-guide-intent.ts`
  - 规则解析启动指引意图和控制命令。
  - 启动意图覆盖“下载/安装/配置/注册/登录 + 目标软件”和 `/guide <目标>`。
  - 控制命令覆盖“我完成了”“重新识别”“退出教程”。
- `src/core/operation-guide-config.ts`
  - 使用现有 `JsonConfigStore<T>` 管理运行态配置。
  - 配置保存到 Electron `userData/config/operation-guide-config.json`。
  - 仓库只保留安全默认值或 example，不提交真实 API Key。
- `src/core/operation-guide-search.ts`
  - 联网教程检索边界。
  - `searchEnabled=false`、网络失败或结果为空时返回空列表，不阻塞流程。
  - 搜索结果视为不可信文本，只作为 planner 输入，不作为系统指令执行。
- `src/core/operation-guide-planner.ts`
  - 将搜索结果或用户目标整理成结构化步骤。
  - 每步只包含一个动作目标和一条短指令。
  - AI planner 失败、未配置 API Key 或解析失败时生成通用 Windows 安装 fallback plan。
- `src/core/operation-guide-progress-evaluator.ts`
  - 提供轻量 Vision 进度判断的结构和安全 JSON 解析。
  - 第一阶段只保留接口和契约测试，不默认自动轮询。
- `src/core/operation-guide-manager.ts`
  - 维护当前 session、plan、currentIndex、status、snapshot。
  - 提供 `start(goal)`、`next()`、`reidentify()`、`exit()`、`getSnapshot()`。
  - 调用现有 `ScreenTargetPointer` 定位和指向当前步骤 target。
  - 使用 `sessionId` 防止旧异步任务回写新状态。

### 现有架构接入点

Operation Guide 不直接接管 `ChatManager`。接入路径为：

```txt
用户文本 / 设置页启动
  ↓
IntentClassifier / settings IPC
  ↓
IntentRouter 权限边界
  ↓
IntentExecutor 薄分发
  ↓
OperationGuideManager
  ↓
ScreenTargetPointer / ScreenAnalyzer / MoveController / BubbleOrchestrator
  ↓
Renderer guide panel + 现有 point visual / bubble
```

原因：当前 Project-Ze 已建立 Intent Router 与 Response Workflow 边界。若直接沿用 Project-Chen 在聊天入口里拦截自然语言的方式，会绕过权限与调试快照，造成架构回退。

### 屏幕能力复用

Operation Guide 只把当前步骤的 `target` 和 `instruction` 交给现有 `ScreenTargetPointer`。本轮不替换 `ScreenAnalyzer`、不改变坐标映射、不改变 point visual guard、不改变现有 +10px 站位微调。

如果当前步骤定位失败：

- 当前 index 不推进。
- Snapshot 进入 `waiting` 或 `error`，提示用户打开对应页面、滚动到目标附近，或点击“重新识别”。
- 不自动跳下一步。

### 配置与设置页

F11 设置页新增“分步指引”区域：

- `enabled`：是否启用 Operation Guide。
- `searchEnabled`：是否允许联网教程搜索。
- `baseUrl`：OpenAI-compatible planner API 地址。
- `apiKey`：独立 planner API Key。
- `model`：planner 模型名。
- `maxTokens`：planner 响应长度上限。
- `systemPrompt`：可选 planner 提示词。
- 测试入口：输入目标软件并启动分步指引。

设置保存通过 preload/main IPC 白名单字段，不允许 renderer 写任意路径。

### Renderer 最小面板

主窗口新增轻量 guide panel：

- 展示当前软件/任务、步骤序号、步骤提示、状态/错误。
- 按钮：“我完成了”“重新识别”“退出”。
- 面板按钮使用 pointerdown 或等效即时交互。
- 面板区域加入窗口交互热区，避免 click-through 吞事件。
- 面板隐藏后释放鼠标交互，不阻挡桌面。
- URL 文本复制到剪贴板可作为兼容增强，但不阻塞 MVP。
- 样式只做最小新增，不复制 Project-Chen 整套 MIDL UI，也不遮挡桌宠本体。

### 屏幕变化和进度感知

为了满足“实际功能闭环”而不引入持续全局监控，本轮只做 active session 内的有限检测：

- 仅当 Operation Guide active 且当前步骤处于 `waiting` 时允许低频检测屏幕 fingerprint。
- 检测到变化后先 debounce 等待短暂稳定，再调用 progress evaluator。
- evaluator 使用低细节 Vision JSON 判断 `completed`、`confidence`、`nextTargetVisible`、`currentStage`、`reason`。
- 只有 `completed=true && confidence >= 0.72` 或 `nextTargetVisible=true && confidence >= 0.78` 时才自动进入下一步。
- 低置信或无法解析时不跳步，只重新定位当前步骤或提示用户点击“重新识别”。
- `exit()`、新 session 或 completed 必须清理检测 timer，旧异步结果因 sessionId 不匹配被丢弃。

## 数据流

### 启动指引

```txt
用户输入 “帮我安装 Steam”
  ↓
IntentClassifier 识别 operation_guide_start，提取 goal=Steam
  ↓
IntentRouter 检查 Operation Guide 是否启用
  ↓
IntentExecutor 调用 OperationGuideManager.start({ goal: 'Steam' })
  ↓
Manager 读取 operation-guide 配置
  ↓
Search 根据配置尝试获取教程片段
  ↓
Planner 生成结构化步骤；失败则 fallback plan
  ↓
Manager 设置 currentIndex=0，status=locating
  ↓
Manager 调用 ScreenTargetPointer 指向当前步骤 target
  ↓
Renderer 显示 guide panel，状态进入 waiting
```

### 完成当前步骤

```txt
用户点击 “我完成了” 或输入 “我完成了”
  ↓
Intent / IPC 调用 OperationGuideManager.next()
  ↓
如果还有步骤：currentIndex + 1，重新定位并指向下一步
  ↓
如果没有步骤：status=completed，提示流程完成，保留退出按钮
```

### 重新识别

```txt
用户点击 “重新识别” 或输入 “重新识别”
  ↓
OperationGuideManager.reidentify()
  ↓
currentIndex 不变
  ↓
重新调用 ScreenTargetPointer 定位当前 target
  ↓
更新 snapshot 和 guide panel
```

### 退出

```txt
用户点击 “退出” 或输入 “退出教程”
  ↓
OperationGuideManager.exit()
  ↓
清理 active session
  ↓
隐藏 guide panel
  ↓
旧异步搜索/planner/定位结果因 sessionId 不匹配被丢弃
```

## 错误处理

### 搜索失败

- 不硬失败。
- 记录日志。
- 使用 fallback plan。
- UI 提示“没有获取到在线教程，我先按通用安装流程带你操作”。

### Planner API 未配置或失败

- 不阻塞用户。
- 使用 fallback plan。
- 设置页提示 API 是可选增强。

### 结构化 JSON 解析失败

- `parseGuidePlan()` 从带噪声文本中提取 JSON。
- 过滤缺少 `target` 或 `instruction` 的步骤。
- 非法 action 回退为 `click`。
- 步骤数限制在安全上限内。
- 全部失败时 fallback。

### 屏幕定位失败

- 不推进 currentIndex。
- 提示用户打开页面、滚动或点击“重新识别”。
- 不自动点击、不自动跳步。

### 并发和取消

- 每次 start 生成新的 `sessionId`。
- `next`、`reidentify`、`exit` 检查 active session。
- 旧 session 的异步结果不得更新 snapshot 或 UI。
- exit 后停止继续投递 guide state。

## 测试计划

新增或扩展契约测试 `scripts/operation-guide-contract.test.js`：

1. `extractOperationGuideSoftwareName()`
   - `我想下载 Steam` → `Steam`
   - `帮我安装 Claude 客户端` → `Claude 客户端`
   - `怎么配置 VS Code` → `VS Code`
   - `/guide Codex` → `Codex`
   - 普通聊天不误判。
2. `getOperationGuideControlCommand()`
   - `我完成了` → `next`
   - `重新识别` → `reidentify`
   - `退出教程` → `exit`
   - 非教程文本 → `null`
3. `parseGuidePlan()`
   - 从带噪声文本提取 JSON。
   - 非法 JSON fallback。
   - 非法 action 回退为 `click`。
   - 过滤缺字段步骤。
   - 限制最大步骤数。
4. `buildFallbackPlan()`
   - 至少 4 步。
   - 每步都有 target 和 instruction。
   - 指令包含目标软件名。
5. `parseProgressEvaluation()`
   - JSON 安全解析。
   - confidence 越界归一化。
   - 非法文本返回安全 fallback。
6. `OperationGuideManager`
   - start 成功进入 waiting。
   - next 推进步骤。
   - reidentify 不推进 index。
   - exit 清理 active。
   - 旧 session 异步结果不覆盖新状态。

回归验证：

- 运行 `npm test`。
- 如涉及 renderer/settings/preload/main，运行项目现有 build 命令（若存在 `npm run build`）。
- 手工检查 F11 设置页、右键聊天、麦克风按钮、普通 `.帮我找按钮` 屏幕指向、Operation Guide panel 按钮。

## 文档更新计划

实现完成后更新：

- `README.md`
  - Features 增加 Operation Guide 可选能力。
  - Usage 增加 `/guide`、自然语言启动、按钮控制说明。
  - Architecture 增加 OperationGuideManager 作为可选产品层。
  - Roadmap / Unreleased 增加该能力。
- `PROJECT_INDEX.md`
  - core 模块速查新增 operation-guide-*。
  - IPC 增加 guide 相关通道。
  - 常见修改场景增加“调整分步指引”。
- `VERSION.md`
  - Unreleased 增加 Operation Guide 最小可用融合记录。
- `docs/operation-guide.md`
  - 新增用户与开发说明，记录边界、配置、隐私和排查。

## 成功标准

本轮实现完成后：

1. Project-Chen master 已在本地可追溯。
2. Operation Guide 能在当前项目中作为独立可选能力启动。
3. 用户可以完成 start / next / reidentify / exit 的基本闭环。
4. 至少 fallback plan 可用；API/search 配置是增强而非硬依赖。
5. 当前屏幕指向能力被复用而非替换。
6. 现有 ASR、TTS、Camera Awareness、Memory、普通聊天、普通屏幕指向不回归。
7. 契约测试和回归测试通过，或失败时明确记录原因。
8. README、PROJECT_INDEX、VERSION 和 Operation Guide 文档更新。
9. Git 提交清楚记录本次融合。

## 实施顺序建议

1. 备份当前干净状态或确认工作区状态。
2. 新增 Operation Guide types/intent/planner/progress evaluator 纯函数和契约测试。
3. 新增 Operation Guide config，接入 JsonConfigStore。
4. 新增 OperationGuideManager，先用 mockable pointer 接口完成状态机测试。
5. 接入 IntentClassifier / IntentExecutor。
6. 接入 main/preload IPC。
7. 接入 settings 和 renderer guide panel。
8. 更新 README / PROJECT_INDEX / VERSION / docs/operation-guide.md。
9. 运行 `npm test` 和 build。
10. 修复发现的问题。
11. 提交 git。
