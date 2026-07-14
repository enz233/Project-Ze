# Architecture Cleanup Bugfix Design

## Context

项目在阶段 C 完成配置安全边界后，仍暴露出几类结构性问题：源码树存在真实运行态配置/历史残留；主动回应系统存在新旧多套链路；活动识别、屏幕分析、气泡显示、TTS、配置存储和记忆职责有重复或漂移风险。用户要求按“分阶段全修”处理，并优先清理高风险问题。

当前工作树已有若干未提交源码改动，不属于本设计本身。实施时必须先核对并保留这些改动，避免覆盖用户或其他会话的工作。

## Goals

- 移除源码树中的真实运行态配置、聊天历史和本地记忆残留，只保留安全 example 配置。
- 明确 `.gitignore` 与文档中的配置边界：真实配置位于 Electron `userData/config`，仓库只提交默认规则与 example 文件。
- 收敛主动回应系统，保留当前主链路，删除或隔离不可达旧链路。
- 统一前台窗口/活动识别，降低 `BubbleManager`、`ContextCollector`、`ProactiveReactionSystem` 之间的规则漂移。
- 让 `ScreenAnalyzer` 成为唯一屏幕分析服务入口，避免 ChatManager、main、Observer 各持有重复实现。
- 更新项目索引，使文档反映当前架构和清理后的主链路。
- 保持现有可见行为：聊天、TTS、屏幕分析、主动气泡、微行为和构建流程不被破坏。

## Non-goals

- 不重写整个聊天系统。
- 不一次性重构全部 TTS 引擎实现；本轮只记录接口抽象方向，除非现有改动要求最小修复。
- 不一次性拆分 `AIMemory` 的全部职责；本轮只避免继续扩大耦合，并在文档中标记后续重构方向。
- 不清理 git 历史；如果真实 key 曾经进入历史，需要单独做密钥轮换和历史清理。
- 不改变设置页 UI 的功能范围，除非为保持配置字段一致必须做最小调整。

## Proposed approach

采用三阶段修复，按风险和依赖顺序推进。

### Phase 1: Runtime config and history boundary

1. 从 git 和源码树中移除真实运行态文件：
   - `src/config/ai-config.json`
   - `src/config/chat-history.json`
   - 若存在：`src/config/ai-memory.json`、`src/config/tts.json`、`src/config/appearance.json`
2. 保留并核对 `src/config/*.example.json`，确保 API Key 为空、聊天历史为空、记忆为空或中性值。
3. 确认 `.gitignore` 覆盖真实运行态文件，并显式允许 `*.example.json`。
4. 更新 `docs/configuration-security.md`、`PROJECT_INDEX.md`、`GUIDE.md` 中相关描述。
5. 不删除用户真正的 Electron `userData/config` 数据；本轮只清理仓库工作区内的源码树残留。

Success criteria:

- `git ls-files src/config` 不包含真实运行态配置文件。
- 敏感 key 扫描不命中真实密钥。
- example 文件不包含真实聊天内容、个人记忆或供应商密钥。

### Phase 2: Proactive response chain cleanup

当前主链路以以下路径为准：

```txt
ObserverManager
→ ContextCollector
→ ProactiveReactionSystem.evaluateComponent()
→ MicroBehaviorManager.performForCandidate()
→ BubbleManager.tryShowProactiveBubble()
```

实施策略：

1. 删除 `ChatManager` 中未启动、未调用的旧主动回应字段和方法，例如旧 `proactiveTimer`、旧主动消息检查/发送逻辑。
2. 删除或隔离 `ObserverManager` 中旧三层触发与 Vision 分析链路，例如旧 stay/switch trigger、旧 LLM/Vision trigger、旧 request/parse analysis 方法。
3. 评估 `ScreenshotTrigger`：
   - 若全仓无当前调用入口，则删除；
   - 若后续仍计划主动 Vision，则必须重新接入主链路并配置化，而不是保留不可达代码。
4. 保留当前主链路的阈值、冷却、微行为和气泡投递行为。

Success criteria:

- 全仓搜索旧主动方法无调用或无定义。
- 主动回应主链路仍能编译。
- 不引入新的主动打扰行为。

### Phase 3: Shared service consolidation and architecture docs

#### Activity context service

新增或提取一个轻量活动上下文服务，统一提供：

```ts
interface ActivityContext {
  windowTitle: string;
  processName: string;
  category?: string;
  matchedActivity?: string;
}
```

使用原则：

- 前台窗口读取逻辑只保留一份。
- 进程名提取和活动关键词匹配集中到一个模块或配置。
- `ContextCollector` 消费该服务生成观察上下文。
- `BubbleManager` 不再自行执行重复系统调用；可消费统一上下文或由观察器传入活动事件。

#### ScreenAnalyzer ownership

- `main.ts` 创建唯一 `ScreenAnalyzer` 实例。
- `ChatManager` 通过构造函数接收该实例，而不是内部再次 `new ScreenAnalyzer(configManager)`。
- `ObserverManager` 如仍需要 Vision 能力，也通过同一个服务调用。
- 删除旧的重复 Vision fetch 逻辑。

#### Documentation alignment

更新 `PROJECT_INDEX.md`：

- 修正状态数量与当前源码一致。
- 列出当前核心模块：Observer、ProactiveReactionSystem、MicroBehaviorManager、BubbleManager、Emotion、TTS、Config。
- 标明真实配置不在源码中维护。
- 若某些后续重构暂不处理，文档中不要把它们描述为当前主路径。

Success criteria:

- 前台窗口读取逻辑不再复制在多个 core 模块中。
- `ScreenAnalyzer` 调用入口收敛。
- 项目索引不再误导新维护者修改 legacy 路径。

## Deferred follow-up refactors

以下项已确认有维护成本，但本轮不强行完成，避免一次性重构过大：

- TTS 引擎接口化：定义 `TTSEngine`、`createTTSEngine(config)`，抽出通用 fetch/decode 工具。
- 配置存储泛型化：抽出 `JsonConfigStore<T>`，集中默认值、schema 和校验。
- AIMemory 分层：拆为 `ChatHistoryStore`、`MemoryProfileStore`、`RelationshipTracker`、`PromptMemoryRenderer`。
- Bubble orchestration：长期可引入 `BubbleOrchestrator`，统一来源、优先级、冷却、回执和排队。

这些后续重构应单独开规格和实施计划。

## Testing and verification

每个阶段完成后运行：

- `npm run build`
- `git status --short`
- 敏感配置扫描，至少覆盖 `sk-`、非空 `apiKey` / `ApiKey` 字段。

如果项目仍无 `npm test` script，应如实记录，不把它当作通过的测试。

最终验证：

- `npm run build` 通过。
- `git ls-files src/config` 只包含可提交配置和 example 文件。
- 旧主动链路方法不再存在或明确不在主路径中。
- 当前未提交的用户改动未被意外覆盖。

## Commit strategy

建议按阶段提交：

1. `chore: remove local runtime config from source tree`
2. `refactor: remove legacy proactive response paths`
3. `refactor: centralize activity context detection`
4. `refactor: share screen analyzer instance`
5. `docs: update project architecture index`

如果阶段 3 的活动识别改动较大，可以拆成独立计划执行。
