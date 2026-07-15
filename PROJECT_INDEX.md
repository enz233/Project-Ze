# Project-Ze / Quiet Companion 项目索引

> 本文档供 AI 助手快速了解项目结构，避免每次读全部代码。最后更新：v0.2.17

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
- `screen-analyzer.ts`：唯一屏幕截图与 Vision 分析服务。
- `emotion-system.ts` / `emotion-updater.ts`：情绪状态与更新。
- `tts-manager.ts` / `tts-engine.ts` / `tts-*.ts`：TTS 编排、统一引擎接口与各供应商合成实现；`TTSManager` 负责播放/字幕/停止/`playbackId`，供应商文件只负责语音合成。
- `json-config-store.ts`：通用 JSON 配置持久化助手，负责 Electron `userData/config` 下运行态配置的目录创建、默认值合并、读写和错误日志。
- `chat-history-store.ts`：聊天历史持久化边界，负责 `chat-history.json` 的读写、最近消息读取和摘要计数；`ai-memory.ts` 仍作为记忆 facade 负责摘要、关系、习惯和 prompt 组装。

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
- **精灵图路径**：`setSprite(name)` 自动根据名字前缀匹配子目录
- **updateVisual**：通过 `lastVisualState` 防重复，`isDragVisualActive` 防拖拽覆盖
- **眨眼系统**：idle/curious/sleepy 各有不同频率，用 setTimeout 链
- **拖拽**：左键触发，mousedown 立即显示 dragged，鼠标移动时更新方向差分
- **右键对话**：contextmenu 事件打开输入框
- **气泡**：`position: fixed` 独立于人物，通过 getBoundingClientRect 定位

### 主进程 main.ts
- **IPC 注册**：`setupIPC()` 在 `app.whenReady` 前调用一次
- **拖拽**：主进程用 `screen.getCursorScreenPoint()` 轮询鼠标位置
- **AI 模块**：AIConfigManager → AIService → ChatManager
- **设置窗口**：单例模式，F11 打开
- **调试窗口**：F3 打开，显示日志、关系数值、互动统计、常用应用和生活习惯提示词
- **主动回应**：当前主动回应主路径：`ObserverManager → ContextCollector → ProactiveReactionSystem → MicroBehaviorManager → BubbleOrchestrator → BubbleManager.tryShowProactiveBubble`。基于轻量上下文快照、应用切换、工作/休息转换、长专注和直接互动生成轻柔回应；规则来自 `src/config/proactive-reactions.json` 与 `src/config/micro-behaviors.json`，Debug 面板显示最近决策/拦截原因/预算状态。`BubbleOrchestrator` 只负责主进程气泡请求的轻量编排；`BubbleManager` 继续负责状态门禁、冷却和 `show-bubble` IPC 投递。

### AI 系统
- **配置**：`ai-config.json` 持久化到 `app.getPath('userData')/config/`
- **运行态配置存储**：真实用户配置保存在 Electron `userData/config`；通用读写逻辑由 `JsonConfigStore<T>` 承担，已迁移的配置管理器保留原有 `get()` / `update()` / `save()` API，源码树只保留默认规则和安全 example 文件。
- **对话**：流式调用，解析 `<item>` 标签逐条显示气泡
- **记忆**：`AIMemory` 作为兼容 facade，负责摘要、关系数值、轻量互动习惯、常用应用和 Prompt 记忆渲染；聊天历史持久化已下沉到 `ChatHistoryStore`，运行时仍写入 Electron `userData/config/chat-history.json`。
- **情感前缀**：根据状态给 AI 消息加情感上下文，切换后 4 秒保持上一个状态
- **情境化主动回应**：本地规则先判断是否应该回应，AI 仅用于高价值场景短句改写，不用于决定是否打扰；阈值、分类、模板和 AI 改写 reason 已配置化
- **TTS 架构**：`TTSManager` 保持唯一编排入口，读取配置并调用 `createTTSEngine(config)` 获取供应商引擎；供应商引擎实现 `TTSEngine.synthesize(text)` 并返回 base64 音频，Electron 播放、字幕、停止和 `playbackId` 完成确认仍只在 `TTSManager`、preload 和 renderer 链路中处理

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
| move-to | MoveToRequest | 调试/后续模块用：平滑移动桌宠到目标坐标 |
| mouse-enter/leave | - | 鼠标进出 |
| lonely-action | boolean | lonely 动画状态 |
| state-finished | - | 动画状态结束 |
| open-settings | - | 打开设置窗口 |
| renderer-log | level, message | 日志转发 |

### 主 → 渲染
| 通道 | 数据 | 说明 |
|------|------|------|
| state-changed | {from, to} | 状态变化 |
| state-update | {state, definition, ...} | 状态同步（500ms） |
| sprites-path | string | 精灵图路径 |
| show-bubble | text | 显示气泡 |
| move-visual | {active, direction, edge?, reason?} | 自动移动过程方向差分 |

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
