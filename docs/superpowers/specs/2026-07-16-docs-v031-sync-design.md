# v0.3.1 文档状态同步与发布边界澄清设计

日期：2026-07-16

## 背景

近期 Project-Ze 连续落地了 v0.3.0 ASR、v0.3.1 Camera Awareness、Screen Target Pointer、MoveController 稳定化、八方向 point visual、screen fingerprint 稳定性检查、ASR provider presets 等能力。`VERSION.md` 已较清楚地区分 v0.3.1 与 Unreleased，但 `README.md` 和 `PROJECT_INDEX.md` 仍存在状态漂移：README 仍把 v0.2 标为 current，PROJECT_INDEX 顶部仍写最后更新 v0.3.0，Camera Awareness、VoiceInput/ASR、ScreenTargetPointer、MoveController 的架构说明不够完整。

本轮只做文档一致性收口，不改源码、不改测试、不改变功能行为。

## 目标

1. 让 README、PROJECT_INDEX、VERSION 三份文档对当前版本和 Unreleased 边界保持一致。
2. 在 README 中补齐用户视角的 Camera Awareness、Screen Target Pointer、Voice Input/ASR、MoveController 架构概览。
3. 在 PROJECT_INDEX 中补齐维护者/AI 助手视角的 Camera Awareness core、IPC/API、v0.3.1 版本历史与 Unreleased 标注。
4. 保持 VERSION 作为版本归属源，不随意把 Unreleased 条目移动到已发布版本。
5. 对 Camera Awareness 使用保守措辞：已落地第一版轻量摄像头感知闭环，但不是常驻后台视频分析或身份识别系统。

## 事实源优先级

1. `VERSION.md`：版本归属源，决定哪些能力属于 v0.3.1，哪些仍是 Unreleased。
2. `PROJECT_INDEX.md`：模块职责、IPC/API、常见修改点的维护者索引。
3. `README.md`：用户和贡献者入口，只呈现高层功能、使用方式和架构概览。
4. `docs/camera-awareness-core.md` 与相关 specs/plans：用于澄清 Camera Awareness 的边界，但不把计划中未落地的内容写成事实。

## 文件级设计

### README.md

更新范围：

- Features 表新增 Camera Awareness。
- Screen Analysis 描述补充目标指示和显式触发边界。
- Usage 补充 `.` 目标指示、摄像头感知设置入口、ASR provider presets。
- Architecture 图补充：
  - `VoiceInputManager → ASREngine / VoiceAudioCache`
  - `ScreenAnalyzer → ScreenTargetPointer → MoveController`
  - `CameraAwarenessManager → VisionImageAnalyzer`
- Roadmap 改为 v0.3.1 当前已落地，Unreleased / Next 分离。

### PROJECT_INDEX.md

更新范围：

- 顶部“最后更新”改为 v0.3.1 + Unreleased。
- 目录结构补充 camera awareness、screen fingerprint、ASR、move/point 资源提示。
- core 模块速查补齐：
  - `camera-awareness-types.ts`
  - `camera-awareness-config.ts`
  - `vision-image-analyzer.ts`
  - `camera-awareness-manager.ts`
  - `screen-fingerprint.ts`
- 主进程/设置页说明补充 Camera Awareness 设置页入口和 `window.companion.cameraAwareness` API。
- 版本历史补充 v0.3.1，并加入 Unreleased 行为摘要。
- 对 Unreleased 能力显式标注，避免读者误以为全部已发布。

### VERSION.md

更新范围：

- 保留当前 Unreleased 分区，不移动条目到 v0.3.1。
- 只在必要时微调措辞，确保与 README / PROJECT_INDEX 的发布边界一致。
- 不创建新版本号。

## 发布边界决策

- v0.3.1 已发布：Camera Awareness 第一版 core + 设置页 + 实时预览 + IPC；Move clamp / Move 测试入口；Screen Target Pointer 初版。
- Unreleased：八方向 point visual、fingerprint diff 稳定性、fingerprint 诊断日志、Move 起点/尺寸/专用差分/单轴分段/teleportTo 优化、ASR provider presets、renderer 动画守卫修复。
- README 和 PROJECT_INDEX 可以提到 Unreleased 能力，但必须标注为 Unreleased / 下一版增强，不能混写成稳定发布能力。

## 非目标

1. 不修改任何源码、测试脚本、构建配置、设置页 HTML 或 IPC 实现。
2. 不新增运行时能力。
3. 不运行应用做手动 smoke。
4. 不宣称 Camera Awareness 支持常驻后台视频分析、保存图片/视频、人脸身份识别、敏感属性判断、精细情绪识别或医学/心理诊断。
5. 不宣称 ASR 阿里百炼预设是专用百炼 ASR 协议实现；它仍复用 OpenAI-compatible ASR 引擎。
6. 不宣称 `npm test` 已覆盖 camera-awareness contract，除非后续另行修改测试脚本。

## 验收标准

1. README 不再把 v0.2 标为 current。
2. README Features / Usage / Architecture 能看到 Camera Awareness、VoiceInput/ASR、ScreenTargetPointer、MoveController 的高层位置。
3. PROJECT_INDEX 顶部版本标识不再停留在 v0.3.0。
4. PROJECT_INDEX 能快速说明 Camera Awareness core、IPC/API、隐私边界。
5. PROJECT_INDEX 版本历史包含 v0.3.1 与 Unreleased 摘要。
6. VERSION 的 Unreleased 分区保留，并与 README / PROJECT_INDEX 的 Unreleased 标注一致。
7. `git diff --check` 通过。

## 自检

- 无 TBD/TODO 占位符。
- 范围只覆盖文档同步，不涉及源码实现。
- Camera Awareness、ASR provider presets、ScreenTargetPointer / Move 的发布边界均使用保守措辞。
- 验收标准可通过文档 diff 和关键字检查验证。
