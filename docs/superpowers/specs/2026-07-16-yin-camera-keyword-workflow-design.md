# yin 分支摄像头与关键词 Workflow 选择性合并设计

## 背景

用户要求从 `https://github.com/enz233/Project-Ze/tree/yin` 选择性吸收功能到当前项目，并明确采用方案二：优先合并摄像头相关能力，同时吸收其中的关键词触发摄像头、屏幕识别等功能。Operation Guide 本轮暂时不处理，其它变化可在比较后选择性改动。

本次设计遵循项目约束：

- 文档优先，避免无必要读取大量源文件。
- 不直接整分支 merge `origin/yin`。
- 以当前 Project-Ze v0.3.2 / Unreleased 主线为稳定底座。
- 保留当前 Operation Guide 暂停状态，不恢复、不继续、不改动其接入计划。
- 每次任务后更新文档并提交 git。

当前已确认：

- `origin` 指向 `https://github.com/enz233/Project-Ze.git`。
- 远程 `yin` 分支存在，HEAD 为 `ae863363913e4a4abfd1a7f67dd5b70562d4846d`。
- `yin` 相对当前主线的摄像头相关提交包括：
  - `e6f3916 feat: add camera awareness background detection`
  - `8463bb7 feat: route camera intents through workflow`
  - `ae86336 feat: add camera-aware screen workflow`
  - `a4923da merge: sync upstream master with camera awareness`
- 当前工作区已有非本设计产生的 `.superpowers/sdd/progress.md` 未提交改动，后续提交不得误覆盖或回滚。

## 目标

本轮目标是把 `yin` 分支中对当前项目有价值的摄像头与关键词 workflow 能力选择性吸收进来：

1. 支持 `*` 开头消息作为显式摄像头单帧分析命令。
2. 支持自然语言触发摄像头人在/不在检查，例如“看看我在不在”“检测一下摄像头状态”。
3. 支持自然语言触发摄像头视觉查询，例如“看看我手里拿的是什么”“镜头里有什么”“看看我今天穿的衣服是什么颜色”。
4. 增强屏幕识别关键词，例如“看看屏幕”“看一下当前屏幕”“你看看这个”“这是什么意思”“上面写了什么”“截个屏看看”“截图分析”。
5. 将摄像头和屏幕工具结果作为短期 observation 接入 `ResponseWorkflowOrchestrator`，最终由 `ChatManager.respondFromWorkflow(...)` 生成 Ze 风格回复。
6. 把后台低频摄像头检测从设置页临时计时器收束到主进程 runner，并保持默认关闭。
7. 为后台低频检测增加前景人脸 gate，减少背景小人脸误判和不必要 Vision 请求。
8. 保持摄像头隐私边界：用户主动触发或显式启用后台低频检测才拍摄，不保存图片，不做身份识别或敏感属性推断。
9. 更新 README、PROJECT_INDEX、VERSION 和 camera awareness 文档，并补充/恢复相关契约测试。

## 非目标

本轮明确不做：

- 不直接 `git merge origin/yin`。
- 不恢复、推进或重构 Operation Guide；既有 Operation Guide 暂停状态保持不变。
- 不迁移与摄像头、屏幕关键词 workflow 无关的 `yin` 变化。
- 不自动点击、自动输入或注入键鼠事件。
- 不默认开启摄像头或后台检测。
- 不持续上传视频流，不保存摄像头图片到磁盘。
- 不做身份识别，不推断年龄、性别、种族等敏感属性。
- 不引入红圈、透明覆盖层、额外箭头或全局输入 hook。
- 不把原始摄像头/屏幕 observation 写入长期记忆。
- 不用 `yin` 文件原样覆盖当前 v0.3.2 模块；所有变更需基于当前架构比较后适配。

## 资料来源

本设计主要依据 `origin/yin` 文档和轻量 git 差异：

- `docs/jo-camera-prompt-command-changes.md`
- `docs/jo-camera-background-returned-reaction.md`
- `docs/jo-camera-foreground-face-gate.md`
- `docs/jo-camera-awareness-debug-log.md`
- `docs/jo-camera-intent-workflow.md`
- `docs/jo-screen-camera-response-workflow.md`
- `docs/jo-local-face-presence-detector.md`
- `docs/camera-awareness-core.md`
- `git diff --stat master...origin/yin -- ':!node_modules'`
- `git diff --name-status master...origin/yin -- README.md PROJECT_INDEX.md VERSION.md docs ':!node_modules'`

后续实施阶段允许读取少量相关源码进行精确适配，但应优先按文件职责和契约测试定位，不做全仓源码展开。

## 方案选择

采用“方案二：摄像头 + 关键词触发完整吸收”。

选择理由：

- 相比只合入后台 runner 或本地 detector，方案二能形成用户可感知的摄像头能力。
- 相比最大化吸收 `yin`，方案二不引入过多联合场景和产品层复杂度，风险更可控。
- 当前项目已经有 Intent Router、Response Workflow、Camera Awareness、ScreenAnalyzer、ScreenTargetPointer 等边界，适合把 `yin` 的改动适配为增量能力，而不是整体覆盖。
- 用户明确要求 Operation Guide 暂时不管，因此本轮应聚焦摄像头、屏幕关键词和 workflow。

## 架构设计

### 总体链路

```txt
用户文本
  ↓
ChatManager 快捷命令 / IntentClassifier
  ↓
IntentRouter 权限门禁
  ↓
IntentExecutor / main handler
  ↓
renderer 单帧拍摄 camera 或 screen
  ↓
CameraAwarenessManager / VisionImageAnalyzer / ScreenAnalyzer / ScreenTargetPointer
  ↓
ResponseWorkflowOrchestrator
  ↓
ChatManager.respondFromWorkflow(...)
  ↓
Ze 风格气泡、TTS、必要的聊天历史记录
```

### 显式摄像头命令

新增 `*` 开头消息作为与 `.` 屏幕分析同级的显式入口：

```txt
*
*现在适合说什么？
*帮我看看我是不是在镜头里
```

行为边界：

- 每次只请求 renderer 打开摄像头拍一张低分辨率 JPEG 单帧。
- 拍完立即关闭 camera tracks。
- 没有 Vision 配置时返回可操作错误，不假装分析。
- 结果可通过 workflow 或摄像头 prompt analyzer 生成 Ze 风格短回复。
- 该入口属于用户显式触发，不受后台检测开关影响。

### 自然语言摄像头意图

Intent 分类新增或补齐两类摄像头意图：

- `camera_check_once`
  - 示例：“看看我在不在”“检测一下摄像头状态”“我在镜头里吗”。
  - 执行：拍摄 `intent-command` 单帧，调用 `CameraAwarenessManager.detectOnce(frame)`。
  - 不进入后台状态机，不触发回来气泡。

- `camera_visual_query`
  - 示例：“看看我手里拿的是什么”“镜头里有什么”“看看我今天穿的衣服是什么颜色”。
  - 执行：拍摄 `intent-command` 单帧，调用 `VisionImageAnalyzer.analyzeCameraVisualQuery(frame, userText)`。
  - 输出：将结果转为 `camera_visual` observation，再交给 workflow 生成最终回复。

权限要求：

- 必须是 user initiated。
- 必须有明确摄像头语义。
- 必须满足摄像头相关配置和权限门禁。
- 不因普通聊天、ASR 噪声或模糊句子自动打开摄像头。

### 屏幕关键词触发增强

扩展 `screen_summary` 自然语言触发词，减少用户必须输入 `.` 的限制：

- “看看屏幕”
- “看一下当前屏幕”
- “看看我的桌面在做什么”
- “你看看这个”
- “这是什么意思”
- “上面写了什么”
- “截个屏看看”
- “截图分析”

分类优先级：

- 包含“镜头 / 摄像头 / 我手里 / 我穿的 / 我在不在”等摄像头语义时，优先摄像头意图。
- 包含“屏幕 / 桌面 / 页面 / 窗口 / 截图”等屏幕语义时，优先屏幕意图。
- “你看看这个”“这是什么意思”等短句默认理解为屏幕上下文，但不得触发摄像头。
- 目标指示类“帮我找 / 指出 / 在哪”继续走既有 screen target pointer 逻辑。

### Response Workflow 统一回复

摄像头和屏幕工具只产出 observation，最终回复统一由 workflow 交给聊天模型：

- `screen_summary_response` → `screen_summary` observation
- `screen_target_pointer_response` → `screen_target_pointer` observation
- `camera_check_once_response` → `camera_presence` observation
- `camera_visual_query_response` → `camera_visual` observation

边界：

- 原始图片和 observation 只作为本轮短期上下文。
- 不默认写入长期记忆。
- 已由 workflow 生成最终回复时，不再额外发送旧式重复气泡。
- TTS 和 `<item>` 气泡格式继续复用当前 `ChatManager` 体验。

### 后台低频检测 runner

将后台低频检测从设置页本地 `setInterval` 收束到主进程 runner：

```txt
设置页保存配置
  ↓
main 更新 CameraAwarenessConfig
  ↓
CameraAwarenessBackgroundRunner.sync()
  ↓
按 detectionIntervalMs 请求 renderer 拍一帧
  ↓
CameraAwarenessManager.processBackgroundFrame(frame)
  ↓
稳定 absent -> present 且 returnedReactionEnabled=true
  ↓
BubbleOrchestrator.tryShowProactive(..., 'camera_awareness')
```

要求：

- `enabled=false` 或 `backgroundDetectionEnabled=false` 时不运行。
- 设置页关闭不影响主进程 runner 的正确停止/启动。
- 拍摄失败或超时只记录错误，不误改人在/不在状态。
- 后台检测仍默认关闭。

### 前景人脸 gate

后台低频检测专用前置 gate：

- 只作用于 `source='background'` 的帧。
- `*` 命令、自然语言摄像头视觉查询、设置页立即检测不走 gate 拦截。
- renderer 拍后台帧时优先用浏览器 `FaceDetector` 做本地人脸框检测。
- 若本地检测明确没有人脸或最大人脸太小，主进程可直接按 absent 处理并跳过 Vision。
- 若 `FaceDetector` 不可用或报错，则降级回原有 Vision 判断。

默认阈值采用 `yin` 文档中的较温和值：

```txt
foregroundFaceMinHeightRatio = 0.05
foregroundFaceMinAreaRatio   = 0.0012
```

旧运行态配置若保存了旧默认值，可按配置规范迁移到新默认值；用户手动改过的值不应被覆盖。

### Debug 输出

后台摄像头检测可在终端输出压缩 debug 信息，便于开发观察：

```txt
[CameraAwareness] person: yes | state: present | reason: person_visible | source: background | face: yes height 5.6%, area 0.14% | confidence: 92%
```

拍摄失败时输出：

```txt
[CameraAwareness] capture failed | state: present | error: permission denied
```

Debug 不改变检测频率、状态机和气泡冷却，仅用于开发诊断。

## 组件改动范围

实施时预计涉及以下文件，需逐个对照当前版本和 `origin/yin` 差异后适配：

- `src/core/camera-awareness-types.ts`
- `src/core/camera-awareness-config.ts`
- `src/core/camera-awareness-manager.ts`
- `src/core/camera-awareness-background-runner.ts`
- `src/core/local-face-presence-detector.ts`
- `src/core/vision-image-analyzer.ts`
- `src/core/intent-types.ts`
- `src/core/intent-classifier.ts`
- `src/core/intent-router.ts`
- `src/core/intent-executor.ts`
- `src/core/response-workflow-types.ts`
- `src/core/response-workflow-orchestrator.ts`
- `src/core/chat-manager.ts`
- `src/core/screen-target-pointer.ts`
- `src/main/main.ts`
- `src/main/preload.ts`
- `src/main/settings.html`
- `src/renderer/renderer.ts`
- `scripts/camera-awareness-contract.test.js`
- `scripts/local-face-presence-detector-contract.test.js`
- `scripts/intent-router-contract.test.js`
- `scripts/response-workflow-contract.test.js`
- `README.md`
- `PROJECT_INDEX.md`
- `VERSION.md`
- `docs/camera-awareness-core.md`

Operation Guide 相关文件不在本轮改动范围内。

## Git 策略

1. 当前阶段只提交本设计文档。
2. 不执行整分支 merge。
3. 实施阶段按功能组从 `origin/yin` 选择性读取和移植。
4. 每阶段提交前检查 `git status`，避免误提交无关改动。
5. 现有 `.superpowers/sdd/progress.md` 改动需要保留；除非用户要求或实施计划明确包含，否则不把它混入摄像头功能提交。
6. 若需要比较 `yin` 具体实现，优先用 `git diff master...origin/yin -- <相关文件>` 或 `git show origin/yin:<相关文件>`，避免打开无关源码。

## 验证计划

实施完成后至少运行：

```bash
npm run build
npm test
node scripts/camera-awareness-contract.test.js
node scripts/local-face-presence-detector-contract.test.js
node scripts/intent-router-contract.test.js
node scripts/response-workflow-contract.test.js
```

如果环境允许，再执行 Electron 冒烟测试：

```bash
npm start
```

手动验证建议：

- 输入 `*`，确认摄像头权限请求、单帧分析和 tracks 关闭。
- 输入“看看我在不在”，确认走 `camera_check_once`，不触发后台回来气泡。
- 输入“看看我手里拿的是什么”，确认走 `camera_visual_query`。
- 输入“看看屏幕”“你看看这个”，确认走屏幕总结。
- 输入“帮我找下载按钮”，确认既有屏幕目标指示仍正常。
- 开启后台低频检测后观察终端 debug，确认无设置页本地计时器重复检测。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 摄像头触发词误判导致意外打开摄像头 | Intent Router 保持 user initiated + explicit + camera_frame 权限门禁；模糊短句默认屏幕而不是摄像头 |
| 屏幕关键词增强影响普通聊天 | 触发词限定在明确“看屏幕/截图/页面/窗口”或短句屏幕上下文；用契约测试覆盖 |
| workflow 改造导致重复气泡 | 明确工具 observation 与最终回复边界；测试覆盖已生成 workflow 回复时不走旧气泡 |
| 后台检测误判背景人脸 | 前景人脸 gate 只在后台帧启用，阈值可配置，不可用时降级 Vision |
| 摄像头隐私风险 | 默认关闭后台检测；单帧拍摄后关闭 tracks；不保存图片；不长期记忆原始 observation |
| 与 Operation Guide 暂停状态冲突 | 本轮不碰 Operation Guide 文件和计划；PROJECT_INDEX/VERSION 只补充摄像头相关状态 |
| 直接移植覆盖当前 v0.3.2 修复 | 逐文件 diff 后手工适配，并运行构建和契约测试 |

## 成功标准

- 用户可通过 `*` 和自然语言触发摄像头单帧能力。
- 用户可通过自然语言触发屏幕总结，不必总是输入 `.`。
- 摄像头/屏幕最终回复走统一 workflow，气泡体验保持 Ze 风格。
- 后台低频检测由主进程 runner 管理，默认关闭，启用后不会依赖设置页保持打开。
- 前景人脸 gate 只影响后台检测，不影响主动摄像头查询。
- Operation Guide 状态不被改变。
- 文档、构建、契约测试和 git 提交完整。
