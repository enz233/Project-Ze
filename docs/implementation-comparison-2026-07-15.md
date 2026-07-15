# 规划文档与 Git 提交对照分析

日期：2026-07-15

## 范围与方法

本次对照以文档为主、少量读取仓库元信息完成：

- 规划文档来源：`docs/superpowers/specs/**`、`docs/superpowers/plans/**`、`PROJECT_INDEX.md`、`VERSION.md`
- Git 来源：最近提交历史、当前分支、工作区状态
- 未深入逐文件审源码，因此状态判断以“提交主题 + 项目索引/版本文档 + 规划任务”三者交叉为准

当前仓库状态要点：

- 当前分支：`master`
- `master` 当前 HEAD：`83e3fa1 docs: plan move sprite axis motion`
- 存在多个 worktree 分支，包含一些尚未合入 `master` 的实现提交：
  - `worktree-move-sprites-axis-motion`：`67843e9 fix: cancel move on drag start`
  - `worktree-screen-target-pointer-continue`：`571bca9 fix: cancel stale screen pointer sessions`
  - `worktree-voice-input-asr-tasks-7-9`：`78e156f fix(voice): stabilize voice input verification`
- 当前工作区仍有未跟踪资源：`src/assets/sprites/move/`

## 总览结论

| 规划主题 | 当前仓库整体提交状态 | 当前 `master` 状态 | 结论 |
|---|---:|---:|---|
| Micro Behavior System | 已有完整实现提交与文档提交 | 已在 `master` 历史内 | 已实现 |
| Proactive Debug Panel | 已有实现提交与说明文档 | 已在 `master` 历史内 | 已实现 |
| Configuration Security Cleanup | 已有安全示例、文档、清理提交 | 已在 `master` 历史内 | 已实现 |
| Architecture Cleanup Bugfix | 已有清理、重构、架构索引提交 | 已在 `master` 历史内 | 已实现 |
| TTS Engine Interface | 已有接口、引擎拆分、文档提交 | 已在 `master` 历史内 | 已实现 |
| JSON Config Store | 已有通用存储与文档提交 | 已在 `master` 历史内 | 已实现 |
| AI Memory Storage Layer | 已有 ChatHistoryStore 与文档提交 | 已在 `master` 历史内 | 已实现 |
| Bubble Orchestration | 已有 BubbleOrchestrator 与文档提交 | 已在 `master` 历史内 | 已实现 |
| Renderer Animation Guards | 已有修复与同步文档提交 | 已在 `master` 历史内 | 已实现 |
| Aliyun TTS Endpoint Path | 已有配置、引擎、设置页提交 | 已在 `master` 历史内 | 已实现 |
| TTS Test Error Message | 已有错误提示修复提交 | 已在 `master` 历史内 | 已实现 |
| Voice Input ASR | 主体实现与修复提交存在，但最新稳定化在 worktree 分支 | `master` 至少包含规划与部分历史实现；是否包含最终任务需合并确认 | 部分实现 / 待合并确认 |
| Move Controller | 已有核心模块、IPC、视觉、文档提交 | 已在 `master` 历史内 | 已实现 |
| Screen Target Pointer | 多个实现提交存在，最新修复在 worktree 分支 | `master` 当前只有设计/计划；实现提交主要在 worktree 分支 | 部分实现 / 待合并 |
| Move Sprites Axis Motion | 资源、轴分段、teleport 等提交存在于 worktree 分支；当前工作区资源未跟踪 | `master` 当前只有设计/计划 | 未在 `master` 实现 / 待合并 |

## 逐项对照

### 1. Micro Behavior System

规划目标：配置驱动的微行为接口，使主动回应可以表现为轻动作、气泡、两者或静默记录。

对应提交：

- `9e34ba3 docs: design micro behavior system`
- `75a9eb1 docs: plan micro behavior system`
- `7cb5b01 feat: add micro behavior manager`
- `eb429f4 feat: wire micro behaviors into observer`
- `6a30c14 feat: render micro behaviors`
- `93bb07b docs: document micro behavior handoff`

判断：已实现。提交覆盖了配置/管理器、Observer 接入、renderer 行为呈现与交接文档。

### 2. Proactive Debug Panel

规划目标：F3 Debug 面板展示主动决策状态和微行为状态。

对应提交：

- `2d18e91 docs: plan proactive debug panel`
- `6343fe0 feat: enhance proactive debug panel`
- `65a1ac8 docs: document proactive debug panel`

判断：已实现。

### 3. Configuration Security Cleanup

规划目标：清理仓库配置边界，避免真实密钥、聊天历史、记忆进入版本库，并提供安全示例。

对应提交：

- `d1dfb0e docs: plan configuration security cleanup`
- `1071f0c chore: add safe config examples`
- `366e1f5 docs: document configuration security`
- `a5a5d8a docs: clarify config security references`
- `19b5913 chore: remove local runtime config from source tree`

判断：已实现。后续 `JsonConfigStore` 进一步巩固了运行态配置边界。

### 4. Architecture Cleanup Bugfix

规划目标：删除旧主动响应路径、集中活动上下文检测、共享 ScreenAnalyzer、更新架构文档且不改变可见行为。

对应提交：

- `522a741 docs: design architecture cleanup bugfixes`
- `5c1ced8 docs: plan architecture cleanup bugfixes`
- `03b2796 refactor: remove legacy proactive response paths`
- `7ce4152 refactor: centralize activity context detection`
- `5e21a70 refactor: share screen analyzer instance`
- `0657b20 docs: update project architecture index`

判断：已实现。

### 5. TTS Engine Interface

规划目标：将供应商 TTS 合成抽到统一 `TTSEngine` 接口和工厂，保持播放行为不变。

对应提交：

- `0bd8b3d docs: design tts engine interface`
- `e40a4b3 docs: plan tts engine interface`
- `83fe2e5 refactor: introduce tts engine interface`
- `94ba213 refactor: move tts synthesis behind engines`
- `30b3d2d docs: update tts engine architecture notes`

判断：已实现。

### 6. JSON Config Store

规划目标：新增通用 `JsonConfigStore<T>`，并迁移 TTS 配置管理。

对应提交：

- `e255e30 docs: design json config store`
- `6b299ea docs: plan json config store`
- `ccdc472 refactor: add json config store`
- `5240675 docs: update json config store notes`

判断：已实现。

### 7. AI Memory Storage Layer

规划目标：把聊天历史持久化从 `AIMemory` 拆到 `ChatHistoryStore`，保持公开行为不变。

对应提交：

- `2d60cae docs: design ai memory storage layer`
- `b0415d7 docs: plan ai memory storage layer`
- `0026a90 refactor: add chat history store`
- `994db07 docs: update ai memory architecture notes`

判断：已实现。

### 8. Bubble Orchestration

规划目标：新增轻量 `BubbleOrchestrator`，把主进程气泡请求编排与 `BubbleManager` 投递/门禁职责分开。

对应提交：

- `bcb3fad docs: design bubble orchestration`
- `3bb0daf docs: plan bubble orchestration`
- `41edb7f refactor: add bubble orchestrator`
- `5e186a5 docs: update bubble orchestration notes`

判断：已实现。

### 9. Renderer Animation Guards

规划目标：修复 renderer 旧 callback / timeout 覆盖新状态，避免动画 guard flag 卡住。

对应提交：

- `f05e395 docs: design renderer animation guards`
- `2b25d09 fix(renderer): guard animation timeouts against stale callbacks`
- `91036e5 docs: sync project knowledge after renderer guard fix`

判断：已实现。`VERSION.md` 的 Unreleased 与 `PROJECT_INDEX.md` 已记录该修复。

### 10. Aliyun TTS Endpoint Path

规划目标：修复阿里云百炼 TTS 默认不可用问题，并允许设置页配置 endpoint path。

对应提交：

- `ffe6f1d docs: design aliyun tts endpoint path config`
- `c8388bf docs: plan aliyun tts endpoint path config`
- `70ab08e feat: add aliyun tts endpoint path config`
- `1e22471 fix: use configurable aliyun tts endpoint path`
- `1977f1d feat: expose aliyun tts endpoint path setting`

判断：已实现。

### 11. TTS Test Error Message

规划目标：设置页“测试语音”失败时显示阿里云具体错误码和错误消息。

对应提交：

- `6a0aa89 docs: design tts test error messages`
- `9ea2635 docs: plan tts test error messages`
- `0daa4d9 fix: show aliyun tts test errors`

判断：已实现。

### 12. Voice Input ASR

规划目标：在现有右键聊天输入中增加录音、流式转写、最终文本发送链路。

对应提交：

- `8b32508 docs: design v0.3 voice input asr`
- `a21178f docs: plan v0.3 voice input asr`
- `70f9b22 feat(voice): add asr config contract`
- `dc3ce87 feat(voice): add asr engine abstraction`
- `bd1acd7 feat(voice): add runtime audio cache boundary`
- `9e338cb feat(voice): add voice input manager`
- `576917a feat(voice): wire voice input ipc`
- `134791c feat(voice): add chat input recording controls`
- `7e87e83 feat(voice): merge completed voice input tasks`
- `5203584 feat(voice): add asr settings ui`
- `abbb5e5 docs: document v0.3 voice input`
- `78e156f fix(voice): stabilize voice input verification`（位于 `worktree-voice-input-asr-tasks-7-9`）

判断：部分实现 / 待合并确认。主体实现提交已经存在，但最新“稳定化验证”提交在 worktree 分支，不在当前 `master` HEAD。建议后续先检查该分支与 `master` 差异，再决定合并或 cherry-pick。

### 13. Move Controller

规划目标：新增独立 move 模块，通过明确接口把桌宠平滑移动到屏幕坐标，并在移动过程中显示方向差分。

对应提交：

- `dc3ce87 docs: design move controller module`
- `668ce32 docs: plan move controller module`
- `b895d1d feat: add move controller module`
- `4381a72 feat: wire move controller ipc`
- `23de40d feat: show move direction visuals`
- `0e42c85 docs: document move controller module`

判断：已实现。

### 14. Screen Target Pointer

规划目标：实现显式 `.` 触发的屏幕目标指示流程：定位可见屏幕目标、移动桌宠到目标旁、显示指向姿态和气泡引导。

对应提交：

- `205022e docs: design screen target pointer system`
- `6bac536 docs: plan screen target pointer system`
- `163bb3d feat: add structured screen target locating`
- `152627d fix: align screen capture metadata`
- `5d14827 feat: add screen target pointer orchestrator`
- `f5ab712 fix: tighten screen pointer trigger`
- `c81b17a fix: verify screen stability after move`
- `4f1ac4d feat: route screen pointer requests`
- `e2d1d34 fix: align screen pointer request routing`
- `44bac4e docs: append task 3 fix report`
- `d95b5a8 feat: add screen pointer visual mode`
- `571bca9 fix: cancel stale screen pointer sessions`（位于 `worktree-screen-target-pointer-continue`）

判断：部分实现 / 待合并。仓库整体已有实现链路，但当前 `master` 只停在 `docs: plan screen target pointer system` 附近；后续实现和修复主要在 worktree 分支上。若以当前 `master` 为准，该系统尚未落地；若以所有本地分支为准，已接近完成但需要合并与回归验证。

### 15. Move Sprites Axis Motion

规划目标：接入 `src/assets/sprites/move/` 专用差分，把自动移动升级为可指定轴顺序的 X/Y 单轴分段移动，并新增 `teleportTo` 直接切换接口。

当前 `master` 对应提交：

- `523900d docs: design move sprite axis motion`
- `83e3fa1 docs: plan move sprite axis motion`

worktree 分支对应提交：

- `7e44d7f chore: add move sprite assets`
- `5df2986 feat: segment move controller by axis`
- `3efc6cf feat: add teleport move ipc`
- `67843e9 fix: cancel move on drag start`

当前工作区状态：

- 仍有 `?? src/assets/sprites/move/`

判断：当前 `master` 未实现。设计/计划已经完成；实现提交存在于 `worktree-move-sprites-axis-motion`，但未合入当前分支；资源在当前工作区仍是未跟踪状态，说明当前分支没有完成资源提交与最终文档/版本更新。计划中的 renderer move 专用序列播放器和最终文档任务，尚未从提交主题中看到明确完成提交。

## 当前最主要缺口

1. **Move Sprites Axis Motion 未在当前 `master` 落地**
   - 需要处理未跟踪素材 `src/assets/sprites/move/`
   - 需要合入或重做轴分段、`teleportTo`、拖拽取消修复
   - 需要确认 renderer 专用 move sprite 播放器是否已完成；当前提交主题未显示 `feat: play move sprite sequences`
   - 完成后更新 `PROJECT_INDEX.md` / `VERSION.md` 并提交

2. **Screen Target Pointer 实现分散在 worktree 分支**
   - 当前 `master` 只有设计和计划
   - 实现/修复提交在 `worktree-screen-target-pointer` 与 `worktree-screen-target-pointer-continue`
   - 需要合并前验证是否依赖新版 move controller / move sprite 变更

3. **Voice Input ASR 最新稳定化提交未确认合入 `master`**
   - 主体功能看起来已经完成
   - `78e156f fix(voice): stabilize voice input verification` 在 worktree 分支，需要确认是否应合并

4. **项目索引和版本文档滞后于部分 worktree 功能**
   - `PROJECT_INDEX.md` 当前最后更新仍是 v0.2.17
   - `VERSION.md` Unreleased 目前只记录 renderer 动画守卫修复
   - 后续合并 Screen Pointer / Voice ASR / Move Sprites 后需要统一同步文档

## 建议执行顺序

1. **先处理 Move Sprites Axis Motion**
   - 它直接扩展 MoveController，且 Screen Target Pointer 会依赖移动与视觉稳定性。
   - 建议先合入/完成资源提交、axis segment、teleport IPC、renderer move sprite player、拖拽取消、文档更新。

2. **再合并 Screen Target Pointer**
   - 合并前确认其移动接口是否与 axis-based move controller 兼容。
   - 重点回归：`.` 触发、屏幕定位、移动到目标旁、point visual、拖拽/新请求取消。

3. **最后确认 Voice Input ASR 稳定化分支**
   - 如果当前 `master` 已含主体功能，只需比较并合入稳定化修复。
   - 回归：录音按钮、ASR 配置、音频缓存边界、最终文本进入现有发送链路。

4. **统一文档与版本**
   - 每合入一个主题后更新 `PROJECT_INDEX.md` 与 `VERSION.md`。
   - 保持“当前状态以文档为准”的工作方式，避免后续再次从大量源码反推状态。

## 结论

截至本次对照：早期架构清理、配置安全、TTS、JSON 配置、AI 记忆、气泡编排、renderer 动画守卫、基础 MoveController 等主题已经实现并记录。当前未完全进入 `master` 的重点是：

- Move Sprites Axis Motion：设计/计划已完成，实现在 worktree 分支且当前资源仍未跟踪，当前 `master` 未落地。
- Screen Target Pointer：实现链路在 worktree 分支，当前 `master` 未完整合入。
- Voice Input ASR：主体实现已存在，但最新稳定化修复在 worktree 分支，需确认合并。
