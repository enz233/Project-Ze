# Project-Ze / Quiet Companion 项目索引

> 本文档供 AI 助手快速了解项目结构，避免每次读全部代码。最后更新：v0.3.1 + Unreleased 文档同步

## 项目概述

Quiet Companion（安静的伙伴）是一个桌面数字宠物，基于 Electron + TypeScript。提供安静的桌面陪伴，具有状态系统、AI 对话、时间感知等功能。

## 目录结构

```
src/
├── core/               # 核心逻辑（纯 TypeScript，无 UI）
│   ├── state-manager.ts    # 状态管理器（当前状态、转移、监听）
│   ├── transition-engine.ts # 转移引擎（tick循环、触发条件）
│   ├── time-awareness.ts   # 时间感知（时段判断、问候语）
│   ├── bubble-manager.ts   # 气泡管理（问候、活动监视）
│   ├── ai-config.ts        # AI 配置（持久化到 userData/config/）
│   ├── ai-service.ts       # AI 服务（fetch 调用 OpenAI 兼容 API）
│   ├── ai-memory.ts        # AI 记忆（对话历史+摘要+轻量生活习惯）
│   ├── chat-manager.ts     # 对话管理（消息构建、流式调用）
│   ├── proactive-reaction-system.ts # 情境化主动回应候选判断
│   ├── screen-fingerprint.ts # 屏幕变化轻量 fingerprint 工具（Unreleased）
│   ├── camera-awareness-*.ts # 摄像头感知 core/config/manager/types
│   ├── vision-image-analyzer.ts # 摄像头单帧 Vision 结构化解析
│   ├── logger.ts           # 日志系统（写入 userData/logs/）
│   └── types.ts            # 类型定义（StateId 等）
├── main/               # Electron 主进程
│   ├── main.ts             # 入口（窗口、IPC、模块初始化）
│   ├── preload.ts          # 预加载脚本（IPC 桥接）
│   ├── debug.html          # 调试窗口（日志 + 关系/记忆快照）
│   └── settings.html       # 设置窗口（纯 HTML/CSS/JS）
├── renderer/           # 渲染进程
│   ├── renderer.ts         # 主逻辑（IIFE 模式，无模块语法）
│   ├── index.html          # 主页面
│   └── style.css           # 样式（动画、气泡、输入框）
├── config/             # 配置文件
│   ├── states.json              # 状态定义
│   ├── proactive-reactions.json # 主动回应阈值/分类/模板配置
│   ├── micro-behaviors.json     # 微行为触发与动作配置
│   ├── *.example.json           # 可提交的安全配置示例
│   └── 本地真实配置              # AI/TTS/外观/聊天/记忆运行时生成，gitignore
└── assets/
    └── sprites/basic/      # 差分图（按状态分文件夹）
        ├── idle/           # idle.png, idle_blink_1/2.png
        ├── curious/        # （复用 idle 精灵图）
        ├── dragged/        # dragged.png, dragged_1/2.png, dragged_left/right/up/down.png
        ├── sleepy/         # sleepy.png, sleepy_1/2/3.png, sleepy_blink.png
        ├── sleeping/       # sleeping.png, sleep_1/2/3.png
        ├── lonely/         # lonely.png, lonely_0~4.png, lonely_c_0~5.png
        ├── comfortable/    # comfortable.png
        └── tried/          # tried_0~4.png
```

### core 模块速查

- `observer-manager.ts`：观察编排器，当前主动回应主入口。
- `context-collector.ts`：轻量上下文快照收集。
- `window-activity-service.ts`：前台窗口、进程名和活动分类识别。
- `proactive-reaction-system.ts`：主动回应候选判断与冷却记录。
- `micro-behavior-manager.ts`：主动候选触发的微行为执行。
- `move-controller.ts`：主进程自动移动控制器，提供 `moveTo` / `cancel` / `isMoving`，负责坐标 anchor、屏幕 clamp、平滑移动和 renderer 移动视觉事件。
- `bubble-manager.ts`：气泡发送、状态门禁、主动气泡短间隔控制。
- `bubble-orchestrator.ts`：主进程气泡编排边界，接收带来源/优先级的气泡请求，并把实际投递委托给 `BubbleManager`。
- `screen-analyzer.ts`：唯一屏幕截图与 Vision 分析服务；当前稳定职责是截图、坐标映射元信息与 Vision 分析。`ScreenCaptureFrame.fingerprint` 与 `screen-capture-frame.ts` 按显示器比例推导缩略图尺寸属于 Unreleased 稳定性增强。
- `screen-target-pointer.ts`：屏幕目标指示编排器，处理显式屏幕目标定位请求，负责 Vision 定位结果校验、截图坐标映射、移动调用和指向气泡；八方向 point 指向姿态、指向后恢复、fingerprint diff 屏幕变化取消属于 Unreleased 增强。
- `intent-types.ts` / `intent-classifier.ts` / `intent-router.ts` / `intent-executor.ts`：Intent Router 第一版边界，统一文字聊天、ASR、显式屏幕入口、摄像头和主动上下文的结构化意图；规则优先、可选 LLM fallback 只能建议意图，本地权限策略决定屏幕/摄像头/移动/配置写入是否允许，Executor 仅薄分发到现有模块。
- `emotion-system.ts` / `emotion-updater.ts`：情绪状态与更新。
- `tts-manager.ts` / `tts-engine.ts` / `tts-*.ts`：TTS 编排、统一引擎接口与各供应商合成实现；`TTSManager` 负责播放/字幕/停止/`playbackId`，供应商文件只负责语音合成。
- `json-config-store.ts`：通用 JSON 配置持久化助手，负责 Electron `userData/config` 下运行态配置的目录创建、默认值合并、读写和错误日志。
- `chat-history-store.ts`：聊天历史持久化边界，负责 `chat-history.json` 的读写、最近消息读取和摘要计数；`ai-memory.ts` 仍作为记忆 facade 负责摘要、关系、习惯和 prompt 组装。
- `asr-config.ts`：ASR 运行态配置，使用 `JsonConfigStore<T>` 保存到 Electron `userData/config/asr.json`；`providerPreset` 表示设置页模板，属于 Unreleased 供应商预设增强；`provider` 表示实际 ASR 引擎类型。
- `asr-engine.ts` / `asr-openai-compatible.ts`：ASR 引擎接口与 OpenAI-compatible provider，主流程只依赖 `ASREngine.stream(...)`；OpenAI、阿里百炼 / DashScope、自定义 OpenAI-compatible 供应商预设属于 Unreleased 增强，当前仍复用该引擎。
- `voice-input-manager.ts`：语音输入 session 编排，连接音频 chunk、ASR engine、音频缓存和 transcript/status IPC。
- `voice-audio-cache.ts`：短期语音缓存边界，保存 runtime-only 音频 chunk 并返回 `audioRef`。
- `camera-awareness-types.ts`：摄像头感知配置、帧输入、检测结果、状态快照与 IPC 常量类型；不代表独立事件总线。
- `camera-awareness-config.ts`：摄像头感知运行态默认配置与 Electron `userData/config/camera-awareness.json` 持久化。
- `vision-image-analyzer.ts`：复用现有 Vision 配置，对设置页提供的低分辨率单帧做 presence / affect / reason 结构化解析，并限制身份、敏感属性和环境描述。
- `camera-awareness-manager.ts`：摄像头感知状态机，提供 `detectOnce`、`processBackgroundFrame`、`getSnapshot`；仅在稳定 `absent -> present` 时尝试通过 `BubbleOrchestrator` 发出低优先级回来回应。
- `screen-capture-frame.ts`（Unreleased）：纯 TypeScript 截图帧尺寸工具，默认以 1280 宽按当前显示器比例推导缩略图高度；例如 1707x1067 会使用约 1280x800，确保 Vision point 坐标与 `mapPointToScreen()` 的 X/Y 比例来自同一画面比例。
- `screen-fingerprint.ts`（Unreleased）：纯 TypeScript 低分辨率截图 fingerprint 工具，提供 16x9 亮度摘要、`0.20` 阈值和 diff/summary helper。

## 8 个状态

| 状态 | 精灵图前缀 | CSS 动画 | 触发方式 |
|------|-----------|---------|---------|
| idle | idle | breathing（呼吸） | 默认状态 |
| curious | idle | tilt（歪头） | 鼠标靠近（<200px） |
| dragged | dragged | sway（晃动） | 左键拖拽 |
| sleepy | sleepy | sleepy-sway（摇晃+下沉） | 22:00-01:00 概率 |
| sleeping | sleep | breathe（缓慢呼吸） | 01:00-06:00 强制 |
| lonely | lonely | lonely-sway（轻微摇晃） | 10 分钟无交互 |
| comfortable | comfortable | comfortable-sway（轻摇） | 拖拽后 40% |
| tried | tried | tried-sway（轻微摇晃） | 拖拽后概率 |

## 关键技术点

### 渲染进程 renderer.ts
- **IIFE 模式**：不是模块，用 `(function(){...})()` 包裹
- **精灵图路径**：`setSprite(name)` 自动根据名字前缀匹配子目录；`point-*` 会映射到 `src/assets/sprites/point/<direction>.png`，例如 `point-right_down` -> `point/right_down.png`
- **updateVisual**：通过 `lastVisualState` 防重复，`isDragVisualActive` 防拖拽覆盖
- **眨眼系统**：idle/curious/sleepy 各有不同频率，用 setTimeout 链
- **拖拽**：左键触发，mousedown 立即显示 dragged，鼠标移动时更新方向差分
- **右键对话**：contextmenu 事件打开输入框
- **气泡**：`position: fixed` 独立于人物，通过 getBoundingClientRect 定位

### 主进程 main.ts
- **IPC 注册**：`setupIPC()` 在 `app.whenReady` 前调用一次
- **拖拽**：主进程用 `screen.getCursorScreenPoint()` 轮询鼠标位置
- **AI 模块**：AIConfigManager → AIService → ChatManager
- **设置窗口**：单例模式，F11 打开；“其他”页包含临时 Move 测试（Debug）区块，可输入坐标调用 `moveTo` / `teleportTo` 验证移动效果；“摄像头感知”页提供启用开关、立即检测一次、可选低频检测、debug preview 和本地实时预览，帧采集由设置页 renderer 在用户授权后完成。
- **调试窗口**：F3 打开，显示日志、关系数值、互动统计、常用应用和生活习惯提示词
- **主动回应**：当前主动回应主路径：`ObserverManager → ContextCollector → ProactiveReactionSystem → MicroBehaviorManager → BubbleOrchestrator → BubbleManager.tryShowProactiveBubble`。基于轻量上下文快照、应用切换、工作/休息转换、长专注和直接互动生成轻柔回应；规则来自 `src/config/proactive-reactions.json` 与 `src/config/micro-behaviors.json`，Debug 面板显示最近决策/拦截原因/预算状态。`BubbleOrchestrator` 只负责主进程气泡请求的轻量编排；`BubbleManager` 继续负责状态门禁、冷却和 `show-bubble` IPC 投递。Camera Awareness 第一版仅在后台稳定 `absent -> present` 时尝试 `camera_awareness` 来源气泡，不是常驻视频分析或主动回应系统的一等输入。

### AI 系统
- **配置**：`ai-config.json` 持久化到 `app.getPath('userData')/config/`
- **运行态配置存储**：真实用户配置保存在 Electron `userData/config`；通用读写逻辑由 `JsonConfigStore<T>` 承担，已迁移的配置管理器保留原有 `get()` / `update()` / `save()` API，源码树只保留默认规则和安全 example 文件。
- **对话**：流式调用，解析 `<item>` 标签逐条显示气泡
- **记忆**：`AIMemory` 作为兼容 facade，负责摘要、关系数值、轻量互动习惯、常用应用和 Prompt 记忆渲染；聊天历史持久化已下沉到 `ChatHistoryStore`，运行时仍写入 Electron `userData/config/chat-history.json`。
- **情感前缀**：根据状态给 AI 消息加情感上下文，切换后 4 秒保持上一个状态
- **情境化主动回应**：本地规则先判断是否应该回应，AI 仅用于高价值场景短句改写，不用于决定是否打扰；阈值、分类、模板和 AI 改写 reason 已配置化
- **TTS 架构**：`TTSManager` 保持唯一编排入口，读取配置并调用 `createTTSEngine(config)` 获取供应商引擎；供应商引擎实现 `TTSEngine.synthesize(text)` 并返回 base64 音频，Electron 播放、字幕、停止和 `playbackId` 完成确认仍只在 `TTSManager`、preload 和 renderer 链路中处理
- **屏幕目标指示**：`.` 屏幕分析入口中命中明确“指出/在哪/帮我找”等关键词时，`ChatManager` 委托 `ScreenTargetPointer` 调用 Vision 结构化定位；置信度足够时通过 `MoveController` 把桌宠移动到目标旁边并给出指向气泡。八方向 `point-visual`、约 7 秒后只恢复普通视觉、Vision 前后 `ScreenCaptureFrame.fingerprint` diff 取消旧坐标属于 Unreleased 增强；wheel IPC、全局输入 hook 和持续截图监控暂缓，避免隐私、误触发和复杂度问题。
- **Intent Router**：普通文字聊天入口已接入最小路由 guard；用户明确请求“看看这个页面/分析屏幕/指出下载按钮”等自然语言时，可在正常 LLM 聊天前路由到 `screen_summary` 或 `screen_target_pointer` 并由 `IntentExecutor` 薄分发到 `ScreenAnalyzer` / `ScreenTargetPointer`。普通聊天仍需明确请求才允许屏幕截图或移动；摄像头一次性检测在对话入口仅返回跳过说明，不自动打开摄像头。ASR 文本目前仍复用 `user-message -> ChatManager.sendMessage` 路径，source 先按 `text_chat` 记录，后续若拆出 ASR caller 再切换为 `voice_asr`。

## IPC 通道一览

### 渲染 → 主
| 通道 | 参数 | 说明 |
|------|------|------|
| cursor-move | {x, y} | 鼠标位置 |
| drag-start | - | 拖拽开始 |
| drag-end | - | 拖拽结束 |
| user-click | - | 点击 |
| user-message | text | 发送消息给 AI |
| window-move-by | {deltaX, deltaY} | 移动窗口 |
| move-to | MoveToRequest | 调试/后续模块用：平滑移动桌宠到目标坐标，执行 workArea clamp；X/Y 单轴分段属于 Unreleased Move 优化 |
| teleport-to | MoveToRequest | 调试/后续模块用：直接切换桌宠到目标坐标，仍执行 clamp；当前作为设置页 Move 测试能力记录，后续 Move 优化会继续稳定其视觉边界 |
| mouse-enter/leave | - | 鼠标进出 |
| lonely-action | boolean | lonely 动画状态 |
| state-finished | - | 动画状态结束 |
| open-settings | - | 打开设置窗口 |
| renderer-log | level, message | 日志转发 |
| voice-input-start | {source, mimeType} | 开始语音输入 session |
| voice-input-audio-chunk | {sessionId, chunk} | 发送录音 chunk |
| voice-input-stop | sessionId | 停止并 finalizing 语音输入 |
| voice-input-cancel | sessionId | 取消语音输入 |

### 主 → 渲染
| 通道 | 数据 | 说明 |
|------|------|------|
| state-changed | {from, to} | 状态变化 |
| state-update | {state, definition, ...} | 状态同步（500ms） |
| sprites-path | string | 精灵图路径 |
| show-bubble | text | 显示气泡 |
| move-visual | {active, direction, edge?, reason?} | 自动移动过程方向差分 |
| voice-input-status | {phase, message, sessionId} | 语音输入状态 |
| voice-input-transcript | partial/final/error event | 语音识别结果 |
| point-visual | {active, pose?, reason?} | 屏幕目标指示期间的八方向 point-* 指向差分，pose 可为 point-right / point-right_down / point-down / point-left_down / point-left / point-left_up / point-up / point-right_up，资源缺失时 renderer 回退到 dragged 方向差分 |

### Camera Awareness 设置页 API

`window.companion.cameraAwareness` 由 preload 暴露给设置页，当前包含：

| 方法 | 说明 |
|------|------|
| getConfig | 读取摄像头感知运行态配置 |
| updateConfig | 保存启用、后台低频检测、离开判定、回来回应、debug preview 等配置 |
| detectOnce | 对设置页提供的单帧做一次检测，不触发气泡 |
| processBackgroundFrame | 处理设置页低频 timer 提供的后台帧，进入状态机并可能触发回来回应 |
| getSnapshot | 读取最近检测、稳定状态和状态机快照 |

摄像头感知默认关闭；第一版不保存图片/视频，不做身份识别、年龄/性别/种族等敏感属性判断，不做精细情绪或诊断。当前低频检测由设置页 renderer timer 驱动，不是系统级常驻后台视频服务。

### ASR provider presets

语音输入设置页的供应商预设属于 Unreleased 增强：OpenAI、阿里百炼 / DashScope、自定义 OpenAI-compatible 三个预设只负责填充 Base URL、路径、模型和流式模式等配置；运行时仍按 `provider` 字段选择实际引擎。本轮阿里百炼预设的 `provider` 仍为 `openai-compatible`，不包含专用百炼 ASR 协议实现。

## 常见修改场景

### 添加新状态
1. `src/core/types.ts` — StateId 类型加新状态
2. `src/config/states.json` — 加状态定义
3. `src/core/transition-engine.ts` — 加转移逻辑
4. `src/renderer/renderer.ts` — updateVisual 加 case
5. `src/renderer/style.css` — 加 CSS 动画
6. `src/assets/sprites/basic/新状态/` — 放精灵图

### 添加新的气泡触发
- 状态气泡：`renderer.ts` 的 `getBubbleForState`
- 交互气泡：`renderer.ts` 的事件处理器
- 主进程气泡：`bubble-manager.ts`

### 修改 AI 行为
- 角色提示词：`ai-config.json` 的 systemPrompt
- 回复格式：`chat-manager.ts` 的 RESPONSE_FORMAT_PROMPT
- 情感前缀：`chat-manager.ts` 的 EMOTION_PROMPTS

## 已解决问题

- v0.2.12：test-ai-connection 返回 undefined 时 renderer 已加兜底。
- v0.2.17 后：renderer 动画守卫已加入 timeout handle 清理和 generation 检查，修复 blink `isBlinking` 阻塞、lonely 退出旧回调、气泡 fade timeout 无法取消、`sleepyAnimRunning` 卡住风险。

## 版本历史

| 版本 | 日期 | 主要内容 |
|------|------|---------|
| Unreleased | - | Intent Router 最小聊天路由接入、八方向 point visual、screen fingerprint 稳定性与诊断、Move 专用差分/单轴分段/teleportTo、ASR provider presets、renderer 动画守卫修复 |
| v0.3.1 | 2026-07-15 | Camera Awareness 第一版、设置页摄像头入口与实时预览、cameraAwareness IPC、Move clamp/测试入口、ScreenTargetPointer 初版 |
| v0.3.0 | 2026-07-15 | 语音输入 ASR：麦克风按钮、长按快捷键、流式识别、ASR 配置、音频缓存接口 |
| v0.1.0 | 2026-05-23 | 初始版本，7 状态系统 |
| v0.1.1 | 2026-05-24 | curious 眨眼，修复重复触发 |
| v0.1.2 | 2026-05-24 | 拖拽方向差分，绝对定位 |
| v0.1.3 | 2026-05-25 | sleepy/sleeping 状态 |
| v0.1.4 | 2026-05-28 | lonely 状态，bug 修复 |
| v0.1.5 | 2026-05-29 | tried 状态，精灵图整理 |
| v0.1.6 | 2026-05-29 | 对话气泡系统 |
| v0.2.0 | 2026-05-30 | AI 接入 |
| v0.2.1 | 2026-05-30 | AI 记忆+情感前缀+气泡独立 |
| v0.2.2 | 2026-06-03 | macOS 兼容+打包配置 |
| v0.2.12 | 2026-07-13 | 轻量互动记忆、活动气泡冷却、前台窗口检测修复、动画卡住兜底 |
| v0.2.13 | 2026-07-13 | Debug 面板显示关系、互动统计、常用应用和生活习惯 |
| v0.2.14 | 2026-07-13 | 情境化主动回应系统，按工作/休息切换、长专注与用户互动轻柔回应 |
| v0.2.15 | 2026-07-13 | Debug 面板显示主动回应决策、拦截原因和预算状态 |
| v0.2.16 | 2026-07-13 | 主动回应配置化并预留主动部件接口与说明文档 |
| v0.2.17 | 2026-07-15 | 架构清理、TTS 引擎抽象、JSON 配置存储、AI 记忆存储层、气泡编排器和 TTS 播放修复 |
