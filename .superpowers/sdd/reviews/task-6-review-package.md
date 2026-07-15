d3369ba docs: document screen target pointer system

--- STAT ---
 PROJECT_INDEX.md | 3 +++
 VERSION.md       | 1 +
 2 files changed, 4 insertions(+)

--- DIFF ---
diff --git a/PROJECT_INDEX.md b/PROJECT_INDEX.md
index cff1864..0637bd1 100644
--- a/PROJECT_INDEX.md
+++ b/PROJECT_INDEX.md
@@ -53,20 +53,21 @@ src/
 
 - `observer-manager.ts`：观察编排器，当前主动回应主入口。
 - `context-collector.ts`：轻量上下文快照收集。
 - `window-activity-service.ts`：前台窗口、进程名和活动分类识别。
 - `proactive-reaction-system.ts`：主动回应候选判断与冷却记录。
 - `micro-behavior-manager.ts`：主动候选触发的微行为执行。
 - `move-controller.ts`：主进程自动移动控制器，提供 `moveTo` / `cancel` / `isMoving`，负责坐标 anchor、屏幕 clamp、平滑移动和 renderer 移动视觉事件。
 - `bubble-manager.ts`：气泡发送、状态门禁、主动气泡短间隔控制。
 - `bubble-orchestrator.ts`：主进程气泡编排边界，接收带来源/优先级的气泡请求，并把实际投递委托给 `BubbleManager`。
 - `screen-analyzer.ts`：唯一屏幕截图与 Vision 分析服务。
+- `screen-target-pointer.ts`：屏幕目标指示编排器，仅处理 `.` 显式屏幕分析中的“指出/在哪/帮我找”等请求，负责 Vision 定位结果校验、截图坐标映射、指向锚点换算、移动调用、屏幕变化取消和指向气泡。
 - `emotion-system.ts` / `emotion-updater.ts`：情绪状态与更新。
 - `tts-manager.ts` / `tts-engine.ts` / `tts-*.ts`：TTS 编排、统一引擎接口与各供应商合成实现；`TTSManager` 负责播放/字幕/停止/`playbackId`，供应商文件只负责语音合成。
 - `json-config-store.ts`：通用 JSON 配置持久化助手，负责 Electron `userData/config` 下运行态配置的目录创建、默认值合并、读写和错误日志。
 - `chat-history-store.ts`：聊天历史持久化边界，负责 `chat-history.json` 的读写、最近消息读取和摘要计数；`ai-memory.ts` 仍作为记忆 facade 负责摘要、关系、习惯和 prompt 组装。
 
 ## 8 个状态
 
 | 状态 | 精灵图前缀 | CSS 动画 | 触发方式 |
 |------|-----------|---------|---------|
 | idle | idle | breathing（呼吸） | 默认状态 |
@@ -98,20 +99,21 @@ src/
 - **主动回应**：当前主动回应主路径：`ObserverManager → ContextCollector → ProactiveReactionSystem → MicroBehaviorManager → BubbleOrchestrator → BubbleManager.tryShowProactiveBubble`。基于轻量上下文快照、应用切换、工作/休息转换、长专注和直接互动生成轻柔回应；规则来自 `src/config/proactive-reactions.json` 与 `src/config/micro-behaviors.json`，Debug 面板显示最近决策/拦截原因/预算状态。`BubbleOrchestrator` 只负责主进程气泡请求的轻量编排；`BubbleManager` 继续负责状态门禁、冷却和 `show-bubble` IPC 投递。
 
 ### AI 系统
 - **配置**：`ai-config.json` 持久化到 `app.getPath('userData')/config/`
 - **运行态配置存储**：真实用户配置保存在 Electron `userData/config`；通用读写逻辑由 `JsonConfigStore<T>` 承担，已迁移的配置管理器保留原有 `get()` / `update()` / `save()` API，源码树只保留默认规则和安全 example 文件。
 - **对话**：流式调用，解析 `<item>` 标签逐条显示气泡
 - **记忆**：`AIMemory` 作为兼容 facade，负责摘要、关系数值、轻量互动习惯、常用应用和 Prompt 记忆渲染；聊天历史持久化已下沉到 `ChatHistoryStore`，运行时仍写入 Electron `userData/config/chat-history.json`。
 - **情感前缀**：根据状态给 AI 消息加情感上下文，切换后 4 秒保持上一个状态
 - **情境化主动回应**：本地规则先判断是否应该回应，AI 仅用于高价值场景短句改写，不用于决定是否打扰；阈值、分类、模板和 AI 改写 reason 已配置化
 - **TTS 架构**：`TTSManager` 保持唯一编排入口，读取配置并调用 `createTTSEngine(config)` 获取供应商引擎；供应商引擎实现 `TTSEngine.synthesize(text)` 并返回 base64 音频，Electron 播放、字幕、停止和 `playbackId` 完成确认仍只在 `TTSManager`、preload 和 renderer 链路中处理
+- **屏幕目标指示**：`.` 屏幕分析入口中命中明确“指出/在哪/帮我找”等关键词时，`ChatManager` 委托 `ScreenTargetPointer` 调用 Vision 结构化定位；置信度足够时通过 `MoveController` 把桌宠移动到目标旁边，并发送 `point-visual` 指向差分。普通聊天自然语言自动触发暂缓，避免隐私和误触发问题。
 
 ## IPC 通道一览
 
 ### 渲染 → 主
 | 通道 | 参数 | 说明 |
 |------|------|------|
 | cursor-move | {x, y} | 鼠标位置 |
 | drag-start | - | 拖拽开始 |
 | drag-end | - | 拖拽结束 |
 | user-click | - | 点击 |
@@ -125,20 +127,21 @@ src/
 | renderer-log | level, message | 日志转发 |
 
 ### 主 → 渲染
 | 通道 | 数据 | 说明 |
 |------|------|------|
 | state-changed | {from, to} | 状态变化 |
 | state-update | {state, definition, ...} | 状态同步（500ms） |
 | sprites-path | string | 精灵图路径 |
 | show-bubble | text | 显示气泡 |
 | move-visual | {active, direction, edge?, reason?} | 自动移动过程方向差分 |
+| point-visual | {active, pose?, reason?} | 屏幕目标指示期间的 point-* 指向差分，资源缺失时 renderer 回退到 dragged 方向差分 |
 
 ## 常见修改场景
 
 ### 添加新状态
 1. `src/core/types.ts` — StateId 类型加新状态
 2. `src/config/states.json` — 加状态定义
 3. `src/core/transition-engine.ts` — 加转移逻辑
 4. `src/renderer/renderer.ts` — updateVisual 加 case
 5. `src/renderer/style.css` — 加 CSS 动画
 6. `src/assets/sprites/basic/新状态/` — 放精灵图
diff --git a/VERSION.md b/VERSION.md
index 89411c7..dac1d40 100644
--- a/VERSION.md
+++ b/VERSION.md
@@ -1,15 +1,16 @@
 # Project-Ze - 版本记录
 
 > 旧名 Quiet Companion；当前对外项目名为 Project-Ze。
 
 ## Unreleased
+- 屏幕目标指示系统：规划并实现 `.` 显式屏幕分析中的目标定位与指向流程，普通聊天自然语言自动触发暂缓
 - Renderer 动画守卫修复：为 blink、sleepy、lonely、bubble/subtitle timeout 链加入 handle 清理与 generation 检查，避免 stale callback 覆盖新状态或 guard flag 卡住
 
 ## v0.2.17 (2026-07-15)
 - 架构清理：移除旧主动响应路径，集中化活动上下文检测，并共享屏幕分析实例
 - TTS 架构重构：新增统一 TTS 引擎接口，供应商合成实现下沉到 `tts-*.ts` 引擎，`TTSManager` 专注播放、字幕、停止和 `playbackId` 确认
 - 修复 TTS 播放链路：`playbackId` 透传到 renderer，并归一化 inline TTS 音频数据格式
 - 新增通用 `JsonConfigStore<T>`，统一运行态 JSON 配置的默认值合并、读写和错误处理，TTS 配置已接入
 - 新增 `ChatHistoryStore`，将聊天历史持久化边界从 `ai-memory.ts` 拆出，降低 AI 记忆模块职责复杂度
 - 新增 `BubbleOrchestrator`，将主进程气泡请求编排与 `BubbleManager` 的状态门禁/IPC 投递职责分离
 - 补充 TTS 引擎、JSON 配置存储、AI 记忆存储、气泡编排设计/计划文档和 renderer 动画保护设计/实现记录
