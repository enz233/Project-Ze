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

```
Desktop Companion → AI Companion → Embodied Agent → Physical Robot
```

从桌面开始，逐步走向具身智能。

## Features

| 功能 | 说明 | 状态 |
|------|------|------|
| 8 State Animation | 空闲/好奇/拖拽/犯困/睡觉/孤独/舒适/疲惫 | ✔ |
| Emotion System | 动态情绪权重 0~100 | ✔ |
| AI Chat (LLM) | OpenAI 兼容 API | ✔ |
| Memory System | 对话摘要 + 轻量生活习惯记忆 | ✔ |
| TTS Voice | GPT-SoVITS / MiMo / 阿里云 / OpenAI | ✔ |
| Screen Analysis | Vision API 截屏分析 | ✔ |
| Relationship | 好感度 + 熟悉度系统 | ✔ |
| Activity Monitor | 窗口标题感知 | ✔ |
| Contextual Proactive Reactions | 配置化的工作/休息切换与长专注轻柔回应 | ✔ |
| Debug Window | F3 调试面板，含日志/关系/记忆快照 | ✔ |

## Quick Start

```bash
git clone https://github.com/enz233/Project-Ze.git
cd Project-Ze
npm install
npm start
```

### Configure AI (Optional)

F11 → 设置 → 填写 API Key → 测试连接

支持 DeepSeek、OpenAI、硅基流动、Moonshot、智谱、通义千问。

## Usage

| 操作 | 效果 |
|------|------|
| 鼠标靠近 | 好奇 |
| 左键拖拽 | 移动 |
| 右键 | 聊天输入 |
| F3 | 调试窗口（日志/关系/记忆） |
| F11 | 设置 |
| F12 | 开发者工具 |
| `.` 开头消息 | 截屏分析 |

## Architecture

```txt
Renderer (Sprites + Animation + Bubble)
    ↕ IPC
Main Process
    ├─ StateManager / TransitionEngine       状态管理与转移
    ├─ EmotionSystem                         情绪权重
    ├─ ChatManager / AIMemory                对话、摘要、关系与习惯记忆
    │   └─ ChatHistoryStore                  聊天历史持久化边界
    ├─ ObserverManager                       观察编排
    │   └─ ContextCollector → ProactiveReactionSystem → MicroBehaviorManager
    │       → BubbleOrchestrator → BubbleManager
    ├─ TTSManager → createTTSEngine(config)  语音播放、字幕、停止与供应商合成
    ├─ ScreenAnalyzer                        显式屏幕分析服务
    └─ JsonConfigStore<T>                    运行态 JSON 配置读写
```

Renderer 动画和气泡 timeout 使用 generation guard 防止旧回调覆盖新状态；完整模块索引见 [PROJECT_INDEX.md](PROJECT_INDEX.md)。

## Roadmap

**v0.1** — Foundation
- [x] Window & Skeleton
- [x] 8 State Animation
- [x] Drag & Interaction

**v0.2** — Intelligence *(current)*
- [x] AI Chat
- [x] TTS Voice
- [x] Emotion System
- [x] Memory & Summary
- [x] Lightweight Interaction Memory
- [x] Contextual Proactive Reactions
- [x] Screen Analysis
- [x] Relationship System

**v0.3** — Interactive
- [ ] Long-term Memory (RAG, later)
- [ ] Voice Input (ASR)
- [ ] Custom Sprites
- [ ] Plugins

**Future**
- [ ] Mobile Companion
- [ ] Robot Platform

## Project Structure

主动回应部件说明见 [docs/proactive-reaction-component.md](docs/proactive-reaction-component.md)。

```
Project-Ze/
├── src/
│   ├── core/          核心逻辑
│   ├── main/          Electron 主进程
│   ├── renderer/      渲染进程
│   ├── config/        配置
│   └── assets/        资源
├── docs/              设计与开发说明
├── README.md
└── package.json
```

## License

MIT
