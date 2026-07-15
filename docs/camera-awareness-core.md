# Camera Awareness Core 摄像头感知核心模块

Camera Awareness Core 是摄像头感知功能的独立核心层。它不直接打开摄像头，也不依赖设置页或主进程 IPC；renderer 侧后续只需要提供低分辨率单帧，core 层负责配置、Vision 结构化解析、稳定状态机和回来事件文案交给气泡门禁。

## 当前实现范围

本阶段只实现可独立验证的 core 能力：

- `src/core/camera-awareness-types.ts`：摄像头感知配置、帧输入、检测结果、状态快照、事件与 IPC 常量。
- `src/core/camera-awareness-config.ts`：运行态配置默认值与 `userData/config/camera-awareness.json` 持久化。
- `src/core/vision-image-analyzer.ts`：复用现有 `AIConfigManager` 的 Vision 配置，对摄像头单帧做结构化 presence / affect 判断。
- `src/core/camera-awareness-manager.ts`：`detectOnce`、后台帧处理、`present` / `absent` / `uncertain` / `unavailable` 状态机和 `absent -> present` 回来事件。
- `scripts/camera-awareness-contract.test.js`：构建后运行的轻量契约测试。

已接入：`src/main/main.ts` 注册摄像头感知 IPC，`src/main/preload.ts` 暴露 `window.companion.cameraAwareness`，`src/main/settings.html` 增加“摄像头感知”设置页、手动单帧检测和可选后台低频检测。

## 默认配置

```ts
{
  enabled: false,
  backgroundDetectionEnabled: false,
  lightAffectEnabled: true,
  detectionIntervalMs: 60000,
  absentAfterMs: 120000,
  minConfidence: 0.65,
  returnedReactionEnabled: true,
  debugPreviewEnabled: false
}
```

摄像头感知默认关闭，后台低频检测也默认关闭。

## 输入边界

core 层只接收单帧：

```ts
interface CameraFrameInput {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  capturedAt: number;
  source: 'settings-test' | 'background';
}
```

`imageBase64` 可以是不带前缀的 base64，也可以是 `data:image/...;base64,...`；Vision helper 会统一转成 data URI。

## 状态机摘要

- `detectOnce(frame)` 只返回检测结果并更新最近检测，不触发气泡。
- `processBackgroundFrame(frame)` 才更新稳定状态机。
- `present` 且置信度达到 `minConfidence` 时进入 `present`。
- `absent` 不会立刻进入离开状态，必须距离上次 `present` 超过 `absentAfterMs`。
- `uncertain` 不覆盖已有稳定状态。
- 只有后台检测中的稳定 `absent -> present` 会尝试通过 `bubbleOrchestrator.tryShowProactive(text, 'camera_awareness')` 触发轻柔回来回应。

## Vision 与隐私约束

`VisionImageAnalyzer` 只要求模型输出 JSON：

- `presence`: `present` / `absent` / `uncertain`
- `confidence`: `0` 到 `1`
- `affect`: `positive` / `neutral` / `low_energy` / `unclear`
- `reason`: `person_visible` / `no_person_visible` / `too_dark` / `camera_blocked` / `image_unclear`

提示词明确限制：不识别身份，不判断年龄、性别、种族等敏感属性，不描述外貌和环境，不做精细情绪或诊断。无效 JSON 或 Vision 请求失败会降级为 `uncertain + api_error`，不让主流程崩溃。

## 主进程 / 设置页接口

`window.companion.cameraAwareness` 暴露 5 个接口，全部经由主进程 IPC 调用 core 层：

```ts
{
  getConfig(): Promise<CameraAwarenessConfig>;
  updateConfig(partial: Partial<CameraAwarenessConfig>): Promise<CameraAwarenessConfig>;
  detectOnce(frame: CameraFrameInput): Promise<CameraDetectionResult>;
  processBackgroundFrame(frame: CameraFrameInput): Promise<CameraAwarenessSnapshot>;
  getSnapshot(): Promise<CameraAwarenessSnapshot>;
}
```

设置页只负责在用户授权后通过 `navigator.mediaDevices.getUserMedia` 抓取 320px 宽的低分辨率 JPEG 单帧；core 层不直接打开摄像头。`detectOnce` 用于“立即检测一次”，不触发气泡；`processBackgroundFrame` 用于可选后台低频检测，会进入状态机并在稳定 `absent -> present` 时尝试回来回应。

## 验证

```bash
npm run build
node scripts/camera-awareness-contract.test.js
```

当前契约测试覆盖：默认配置、IPC 常量、Vision JSON 解析、非法响应降级、状态机离开/回来转换、`detectOnce` 不触发气泡。
