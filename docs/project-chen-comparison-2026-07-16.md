# Project-Chen master 状态与本项目对比

日期：2026-07-16

## 范围与方法

本次按“文档优先、少读源码”的原则完成判断：

- Project-Chen 来源：`PROJECT_INDEX.md`、`README.md`、`VERSION.md`、`docs/implementation-comparison-2026-07-15.md`、`docs/challenge-cup-operation-guide-roadmap.md`、`docs/camera-awareness-core.md`、`DEVLOG.md`，并少量读取 Git 分支/最近提交元信息。
- 本项目来源：`README.md`、`VERSION.md`、`PROJECT_INDEX.md`、`docs/implementation-comparison-2026-07-15.md`，并少量读取 Git 分支/最近提交元信息。
- 未展开逐文件源码审查；结论以核心文档、版本记录、项目索引、最近提交主题交叉判断为准。

## 仓库状态快照

### Project-Chen

- 本地路径：`../Project-Chen/`
- 当前分支：`master`
- 远端跟踪：`origin/master`
- 最近提交：
  - `2353d87 feat: smooth operation guide relocalization`
  - `e042e7b feat: launch operation guide from settings`
  - `58b4162 feat: add operation guide settings`
  - `17c6e0a feat: 分步操作指引助手 V1 MVP`
  - `82d7080 feat: 屏幕视觉超级加强版`
- 工作区：读取时未显示未提交改动。

### 本项目

- 本地路径：`AI_pet/code`
- 当前分支：`master`
- 远端跟踪：`origin/master`
- 状态：本地 `master` 领先远端 3 个提交。
- 最近提交：
  - `8a845c2 docs: clarify asr release boundaries`
  - `b11d084 fix: preserve screen capture aspect ratio`
  - `a895718 docs: sync v0.3.1 project status`
  - `74a58a0 debug: gate screen pointer diagnostics`
  - `ebf0b0c Merge branch 'worktree-asr-settings-test-panel'`
- 工作区：会话开始前已有若干未提交改动，本次对比不把这些改动纳入功能结论。

## Project-Chen 当前状态判断

Project-Chen 已经不是单纯的桌宠基础版本，而是在 Project-Ze 桌宠能力之上，面向“AI 桌宠分步操作指引助手”做了明显产品化推进。

核心能力状态：

| 能力 | Project-Chen master 状态 | 依据 |
|---|---|---|
| 基础桌宠状态/动画 | 已完成 | `README.md`、`PROJECT_INDEX.md` 仍记录 8 状态动画、拖拽、状态系统 |
| AI Chat / Memory / TTS / Screen Analysis | 已完成 | `README.md` Feature 表与架构图记录完整链路 |
| ASR 语音输入 | 已完成并带供应商预设 | `README.md`、`VERSION.md` 记录 OpenAI / 阿里百炼 / 自定义 OpenAI-compatible 预设 |
| Camera Awareness | 已完成第一版 | `docs/camera-awareness-core.md` 记录 core、IPC、设置页、本地预览、契约测试 |
| Screen Target Pointer | 已完成并作为操作指引依赖 | `PROJECT_INDEX.md`、路线图记录屏幕目标定位、移动、指向动画 |
| Move Controller / point visual | 已完成并增强 | `VERSION.md` Unreleased 与路线图记录八方向 point、移动稳定性、重新定位 |
| Operation Guide 分步指引 | Project-Chen 相对本项目的主要新增主线，V1/V1.1 已落地 | 最近提交和 `docs/challenge-cup-operation-guide-roadmap.md` 记录 V1 MVP、设置页入口、重新识别和平滑重定位 |

Project-Chen 的当前产品方向可以概括为：

> 以桌宠为可视化载体，把屏幕感知、互联网教程解析、目标控件定位、桌宠移动与指向气泡串成“逐步教用户操作”的挑战杯演示系统。

其中 V1.0/V1.1 边界清楚：

- 不自动点击，用户自己操作。
- 不额外画红圈/透明层箭头，使用桌宠移动、八方向指向动画和气泡提示。
- 每次只给一个目标动作。
- 用户可选择“我完成了”“重新识别”“退出”。
- 页面滚动、跳转、弹窗、加载变化后先重新识别当前步骤，不擅自跳下一步。
- 8 秒内无法稳定定位时回退到普通定位方式。

## 本项目当前状态判断

本项目文档显示当前处于 Project-Ze v0.3.1 + Unreleased 增强阶段，重点仍是桌宠底座与多模态/交互基础能力的稳定化。

核心能力状态：

| 能力 | 本项目状态 | 依据 |
|---|---|---|
| 基础桌宠状态/动画 | 已完成 | `README.md`、`PROJECT_INDEX.md` |
| AI Chat / Memory / TTS / Screen Analysis | 已完成 | `README.md` 架构图与版本记录 |
| ASR 语音输入 | v0.3.0 已完成，供应商预设属 Unreleased 增强 | `README.md`、`VERSION.md` |
| Camera Awareness | v0.3.1 已完成第一版 | `README.md`、`PROJECT_INDEX.md`、`VERSION.md` |
| Screen Target Pointer | v0.3.1 已完成初版，point visual / fingerprint diff 属 Unreleased 增强 | `README.md`、`PROJECT_INDEX.md`、`VERSION.md` |
| Move Controller | v0.3.1 已完成基础能力，专用 move sprites / 单轴分段属 Unreleased 增强 | `PROJECT_INDEX.md`、`VERSION.md` |
| Operation Guide 分步指引 | 文档中未作为当前已落地主线出现 | `README.md` Roadmap 与 `PROJECT_INDEX.md` 未列为当前模块 |

本项目当前产品方向可以概括为：

> 保持 Project-Ze 桌宠核心体验，继续补齐语音、摄像头感知、屏幕目标指示、移动稳定性等“可复用基础能力”。

## 关键差异

| 维度 | Project-Chen master | 本项目 master |
|---|---|---|
| 产品目标 | 明确面向“挑战杯/分步操作指引助手”演示落地 | 更偏 Project-Ze 通用桌面 AI 伙伴底座 |
| 最新主线 | Operation Guide V1/V1.1：教程检索、步骤规划、设置入口、重新识别、丝滑重定位 | ASR 边界、截图比例修复、v0.3.1 文档同步、屏幕指示诊断稳定性 |
| 屏幕能力使用方式 | 从“找目标”进一步升级为“引导用户完成软件安装/配置流程” | 主要停留在显式 `.` 屏幕分析与目标指示能力本身 |
| 用户流程 | 有明确教程状态机：启动教程、当前步骤、完成、重新识别、退出 | 无完整分步教程中台文档记录 |
| 文档成熟度 | 针对操作指引有独立路线图和版本备份规则 | 针对基础模块索引、版本边界、实现对照更完整 |
| 风险/复杂度 | 引入联网教程解析、步骤队列和屏幕重定位，产品链路更长 | 核心基础能力更聚焦，风险主要在屏幕坐标/移动/ASR 等单模块稳定性 |

## 功能领先/落后关系

### Project-Chen 领先处

1. **分步操作指引产品层已经成型**
   - 有独立设置入口。
   - 有联网教程检索与结构化步骤队列。
   - 有“我完成了 / 重新识别 / 退出”的用户流程。
   - 有页面变化后的重定位策略。

2. **屏幕目标能力被组合成完整场景**
   - 不只是回答“按钮在哪”，而是把“教程步骤 + 当前屏幕 + 桌宠移动/指向”组合成闭环。

3. **挑战杯展示叙事更清晰**
   - 文档直接给出通俗名称、学术名称、卖点、V1/V2/V3 路线。

### 本项目领先或更稳处

1. **基础项目文档边界更清楚**
   - `README.md`、`PROJECT_INDEX.md`、`VERSION.md` 对 v0.3.1 与 Unreleased 边界区分更细。

2. **近期稳定性修复更新更明确**
   - 最近提交包含屏幕截图比例修复、ASR release boundary 文档、屏幕指示诊断门控等。

3. **适合作为通用底座继续演进**
   - 当前文档没有把产品目标强绑定到挑战杯操作指引，因此更适合先稳定核心模块，再选择是否合入 Project-Chen 的分步指引产品层。

## 建议

如果目标是尽快获得“挑战杯可展示能力”，建议优先参考或迁移 Project-Chen 的 Operation Guide 主线：

1. 分步指引设置入口。
2. operation-guide 配置与独立 API 配置边界。
3. 教程检索与步骤规划。
4. 教程中台状态机：当前步骤、完成、重新识别、退出。
5. 页面变化后的重新定位策略。
6. 对 ScreenTargetPointer / MoveController 的接口适配。

如果目标是保持本项目稳定，建议先不要整包覆盖 Project-Chen，而是按模块增量吸收：

1. 先只读 Project-Chen 的 Operation Guide 相关文档与少量入口文件，确认模块边界。
2. 在本项目写设计/计划文档，明确不自动点击、不新增覆盖层、不持续监控等隐私边界。
3. 小步迁移配置、planner、manager、settings 入口。
4. 每一步执行构建/契约测试，并同步 `README.md`、`PROJECT_INDEX.md`、`VERSION.md`。

## 结论

Project-Chen master 当前可以视为“Project-Ze 基础能力 + 分步操作指引产品层”的演示型分支；本项目当前更像“Project-Ze 通用桌面 AI 伙伴底座 + 多模态/目标指示稳定化”的主线。

两者不是简单的新旧关系，而是方向不同：

- Project-Chen 更接近挑战杯产品 Demo，新增主线是 AI 桌宠分步操作指引。
- 本项目更接近稳定底座，适合继续沉淀 ASR、摄像头、屏幕目标指示、移动控制等可复用模块。

下一步若要合流，推荐以本项目为稳定底座，选择性迁移 Project-Chen 的 Operation Guide 模块，而不是直接整体替换。这样可以保留本项目近期稳定性修复和较清晰的版本边界，同时吸收 Project-Chen 的产品化演示能力。
