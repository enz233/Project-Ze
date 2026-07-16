<p align="center">
  <img src="src/assets/sprites/basic/idle/idle.png" width="120" alt="Project-Ze Logo" />
</p>

<h1 align="center">Project-Ze</h1>

<p align="center">
  <strong>An open-source desktop AI companion powered by LLM</strong>
  <br />
  一个基于大语言模型的桌面 AI 伙伴
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-42.2-blue" alt="Electron" />
  <img src="https://img.shields.io/badge/TypeScript-6.0-brightgreen" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

## Vision

```txt
Desktop Companion → AI Companion → Embodied Agent → Physical Robot
```

从桌面开始，逐步走向具身智能。Project-Ze 的目标不是做一个聊天框皮肤，而是让 AI 以一个有状态、有位置、能感知桌面环境并能用动作反馈的伙伴存在。

## Current Status

当前主线版本为 **v0.3.2 — Multimodal & Voice Stability**。

这一阶段的重点是把已有能力收束成更清晰的多模态链路：

- **语言**：文本聊天、`.` 显式屏幕请求、Intent Router 规则优先意图识别。
- **视觉**：屏幕截图总结、目标定位、坐标映射、屏幕变化 fingerprint 稳定性检查、摄像头 presence 感知。
- **声音**：麦克风按钮和长按快捷键语音输入，OpenAI-compatible 与 Qwen-ASR realtime 引擎，Qwen 主入口使用 PCM16 16kHz。
- **上下文**：记忆、关系、情绪、前台窗口活动、主动回应预算和 Debug 快照。
- **具身反馈**：气泡、TTS、状态动画、自动移动、八方向 point visual 指向。

黑客松展示主线建议为：**用户用语言请求找屏幕目标，Project-Ze 看屏幕、定位目标、移动过去并用 point 姿态指给用户看。**

## Features

| 功能 | 说明 | 状态 |
|------|------|------|
| 8 State Animation | 空闲/好奇/拖拽/犯困/睡觉/孤独/舒适/疲惫 | ✔ |
| Emotion System | 动态情绪权重 0~100 | ✔ |
| AI Chat (LLM) | OpenAI 兼容 API，支持 `<item>` 气泡格式 | ✔ |
| Memory System | 对话摘要 + 轻量生活习惯记忆 + 好感度/熟悉度 | ✔ |
| TTS Voice | GPT-SoVITS / MiMo / 阿里云 / OpenAI，统一 TTS engine 接口 | ✔ |
| Voice Input (ASR) | 麦克风按钮 + 长按快捷键；OpenAI-compatible 与 Qwen-ASR realtime；Qwen 使用 PCM16 16kHz | ✔ |
| Screen Analysis | Vision API 截屏分析；显式 `.` 请求可总结页面或定位目标 | ✔ |
| Screen Target Pointer | 定位屏幕目标、移动到目标旁，并用八方向 point 姿态指向 | ✔ |
| Intent Router | 规则优先多模态意图入口，带屏幕/摄像头/移动/配置写入权限闸门 | ✔ |
| Response Workflow Orchestrator | 将屏幕工具结果转为短期上下文，再统一交给聊天模型生成气泡回复 | ✔ |
| Camera Awareness | 设置页轻量摄像头感知：单帧检测、低频检测、回来轻柔回应 | ✔ |
| Contextual Proactive Reactions | 配置化的工作/休息切换与长专注轻柔回应 | ✔ |
| Debug Window | F3 调试面板，含日志/关系/记忆/主动回应/Intent 快照 | ✔ |

## Quick Start

```bash
git clone https://github.com/enz233/Project-Ze.git
cd Project-Ze
npm install
npm start
```

### Configure AI

F11 → 设置 → 填写 AI Base URL、API Key、模型 → 测试连接。

支持 DeepSeek、OpenAI、硅基流动、Moonshot、智谱、通义千问等 OpenAI-compatible API。

### Configure Voice Input

F11 → 设置 → 语音输入（ASR）。

- OpenAI、阿里百炼 / DashScope、自定义 OpenAI-compatible 预设走 OpenAI-compatible ASR 引擎。
- Qwen-ASR 实时识别请选择专用 **Qwen-ASR 实时识别** 预设，填写 Workspace ID、API Key 和模型。
- 普通模式保留供应商预设、Base URL、Workspace ID、API Key 和模型。
- 高级模式再调整实际引擎、Realtime/Transcription Path、流式模式和缓存。

Qwen-ASR 详细配置见 [Qwen-ASR 配置说明](docs/qwen-asr-configuration.md)。

## Usage

| 操作 | 效果 |
|------|------|
| 鼠标靠近 | 好奇 |
| 左键拖拽 | 移动 |
| 右键 | 聊天输入 |
| F3 | 调试窗口（日志/关系/记忆/Intent） |
| F11 | 设置 |
| F12 | 开发者工具 |
| `.` 开头消息 | 截屏分析；明确“指出/在哪/帮我找”等请求进入目标定位与指向流程 |
| 麦克风按钮 | 点击开始/结束语音输入 |
| `Ctrl+Shift+Space` | 长按说话，松开结束 |
| F11 → 摄像头感知 | 启用轻量摄像头感知、立即检测一次、可选低频检测、本地实时预览 |

推荐演示句式：

```txt
.看看这个页面
.帮我找下载按钮
.指出搜索框
帮我找登录按钮
```

摄像头感知默认关闭；当前第一版由设置页提供低分辨率单帧检测、可选低频检测和本地预览，不保存图片/视频，不做身份识别或敏感属性判断。

## Architecture

```txt
Renderer (Sprites + Animation + Bubble + Voice Capture)
    ↕ IPC
Main Process
    ├─ IntentRouter → IntentExecutor              意图分类、权限闸门、薄分发
    ├─ ResponseWorkflowOrchestrator               多模态工具结果 → 统一聊天回复
    ├─ ChatManager / AIMemory                     对话、角色回复、摘要、关系与习惯记忆
    │   └─ ChatHistoryStore                       聊天历史持久化边界
    ├─ ObserverManager                            观察编排
    │   └─ ContextCollector → ProactiveReactionSystem → MicroBehaviorManager
    │       → BubbleOrchestrator → BubbleManager
    ├─ TTSManager → createTTSEngine(config)       语音播放、字幕、停止与供应商合成
    ├─ VoiceInputManager → ASREngine              OpenAI-compatible / Qwen-ASR realtime
    │   └─ VoiceAudioCache                        短期音频缓存
    ├─ ScreenAnalyzer                             截图、Vision 分析、坐标映射元信息
    │   └─ ScreenTargetPointer → MoveController   目标定位、稳定性检查、移动与 point visual
    ├─ CameraAwarenessManager → VisionImageAnalyzer
    └─ JsonConfigStore<T>                         运行态 JSON 配置读写
```

核心边界：

- `IntentRouter` 只负责意图、权限和 Debug 快照，不直接执行截图、移动或写配置。
- `ResponseWorkflowOrchestrator` 只处理已授权工具结果到聊天回复的编排，不提升权限。
- `ScreenAnalyzer` 是唯一屏幕截图与 Vision 分析服务。
- `ScreenTargetPointer` 负责目标定位、屏幕变化检查、移动和 point visual。
- `ChatManager.respondFromWorkflow(...)` 统一生成最终 `<item>` 气泡回复，复用 TTS、记忆和普通聊天体验。
- 原始屏幕 observation 只作为短期 workflow context，不默认进入长期记忆。

完整模块索引见 [PROJECT_INDEX.md](PROJECT_INDEX.md)。

## Documentation

| 文档 | 内容 |
|------|------|
| [PROJECT_INDEX.md](PROJECT_INDEX.md) | 项目结构、核心模块、IPC、常见修改场景和版本索引 |
| [VERSION.md](VERSION.md) | 版本记录，当前 v0.3.2 变更汇总 |
| [Intent Router](docs/intent-router.md) | 多模态意图入口、权限策略和 Debug 快照 |
| [Response Workflow Orchestrator](docs/response-workflow-orchestrator.md) | 屏幕总结/目标指向结果统一进入聊天模型回复的工作流边界 |
| [Qwen-ASR 配置说明](docs/qwen-asr-configuration.md) | Qwen-ASR realtime 配置、请求形态和常见排查 |
| [Camera Awareness Core](docs/camera-awareness-core.md) | 摄像头感知边界、隐私策略和状态机 |
| [Proactive Reaction Component](docs/proactive-reaction-component.md) | 主动回应部件、候选评估与低打扰边界 |
| [Configuration Security](docs/configuration-security.md) | 运行态配置、示例配置与密钥安全边界 |

近期设计/计划文档集中在 [docs/superpowers/specs/](docs/superpowers/specs/) 与 [docs/superpowers/plans/](docs/superpowers/plans/)，包括 Intent Router、Response Workflow、Qwen-ASR、FunASR 本地 ASR、屏幕指向稳定性、Move Controller、TTS/ASR/provider 抽象等。

## Roadmap

**v0.1** — Foundation
- [x] Window & Skeleton
- [x] 8 State Animation
- [x] Drag & Interaction

**v0.2** — Intelligence
- [x] AI Chat
- [x] TTS Voice
- [x] Emotion System
- [x] Memory & Summary
- [x] Lightweight Interaction Memory
- [x] Contextual Proactive Reactions
- [x] Screen Analysis
- [x] Relationship System

**v0.3.0** — Voice Input
- [x] Voice Input (ASR)
- [x] ASREngine / VoiceInputManager / VoiceAudioCache

**v0.3.1** — Interactive
- [x] Camera Awareness
- [x] Screen Target Pointer
- [x] Move Controller
- [x] Move dedicated sprites and axis-based motion
- [x] Screen point visual foundation
- [x] ASR provider presets and simplified settings

**v0.3.2** — Multimodal & Voice Stability *(current)*
- [x] Intent Router
- [x] Response Workflow Orchestrator
- [x] Qwen-ASR realtime engine and PCM16 voice input
- [x] Voice input trigger / click-through fix
- [x] Screen pointer stability, diagnostics, and position tuning
- [x] Screen workflow final reply统一进入 ChatManager 气泡/TTS/记忆链路

**Unreleased / Next**
- [ ] FunASR local ASR provider
- [ ] Hackathon demo script and stable demo page
- [ ] Long-term Memory (RAG, later)
- [ ] Custom Sprites
- [ ] Plugins

**Future**
- [ ] Mobile Companion
- [ ] Robot Platform

## Project Structure

```txt
Project-Ze/
├── src/
│   ├── core/          核心逻辑
│   ├── main/          Electron 主进程
│   ├── renderer/      渲染进程
│   ├── config/        配置
│   └── assets/        资源
├── docs/              设计与开发说明
├── scripts/           契约测试
├── README.md
└── package.json
```

## License

MIT
