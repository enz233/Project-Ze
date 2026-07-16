# Camera Awareness Core 摄像头感知核心模块

Camera Awareness Core 是摄像头感知功能的独立核心层。它不直接打开摄像头，也不依赖设置页或主进程 IPC；renderer 侧后续只需要提供低分辨率单帧，core 层负责配置、Vision 结构化解析、稳定状态机和回来事件文案交给气泡门禁。

## 当前实现范围

本阶段只实现可独立验证的 core 能力：

- `src/core/camera-awareness-types.ts`：摄像头感知配置、帧输入、前景人脸 gate、检测结果、状态快照、事件与 IPC 常量。
- `src/core/camera-awareness-config.ts`：运行态配置默认值与 `userData/config/camera-awareness.json` 持久化。
- `src/core/vision-image-analyzer.ts`：复用现有 `AIConfigManager` 的 Vision 配置，对摄像头单帧做结构化 presence / affect 判断，并支持 `*` 摄像头 prompt 与自然语言摄像头视觉查询。
- `src/core/camera-awareness-background-runner.ts`：主进程注入取帧回调的后台低频检测调度器；设置启用后按间隔请求 renderer 单帧，不直接打开摄像头。
- `src/core/camera-awareness-manager.ts`：`detectOnce`、后台帧处理、前景人脸 gate 处理、`recordBackgroundError`、`present` / `absent` / `uncertain` / `unavailable` 状态机和 `absent -> present` 回来事件。
- `src/core/local-face-presence-detector.ts`：本地人脸存在检测接口与 Shape Detection API 适配器；不做身份识别或敏感属性推断。
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
  debugPreviewEnabled: false,
  foregroundFaceGateEnabled: true,
  foregroundFaceMinHeightRatio: 0.05,
  foregroundFaceMinAreaRatio: 0.0012
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
  source: 'settings-test' | 'background' | 'chat-command' | 'intent-command';
  foregroundFaceGate?: CameraForegroundFaceGateResult;
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
- `chat-command` 用于 `*` 显式摄像头单帧命令；`intent-command` 用于自然语言摄像头人在/不在检查和摄像头视觉查询；二者不进入后台状态机。
- 前景人脸 gate 只作用于 `background` 帧；明确无前景人脸或人脸太小时可直接按 absent 处理并跳过 Vision，不可用或出错时降级回 Vision。

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

设置页只负责在用户授权后通过 `navigator.mediaDevices.getUserMedia` 抓取 320px 宽的低分辨率 JPEG 单帧；core 层不直接打开摄像头。`detectOnce` 用于“立即检测一次”，不触发气泡。后台低频检测不再由设置页 `setInterval` 驱动，设置保存后由主进程 `CameraAwarenessBackgroundRunner` 按 `detectionIntervalMs` 请求主窗口 renderer 拍一张低分辨率单帧，再调用 `processBackgroundFrame` 进入状态机并在稳定 `absent -> present` 时尝试回来回应。

设置页还提供实时预览窗口：点击“开启预览”后保持一条本地 camera stream 绑定到设置页 `<video>`，用于直观看到当前画面；点击“关闭预览”或关闭设置页会停止 tracks。检测按钮会优先复用这条预览 stream 截取单帧，未开启预览时才短暂打开摄像头并在取帧后立即关闭。实时预览只在本地渲染，不进入 IPC，也不会保存到磁盘。

## 接口速查

renderer 侧统一通过 `window.companion.cameraAwareness` 调用主进程：

```ts
getConfig(): Promise<CameraAwarenessConfig>
updateConfig(partial: Partial<CameraAwarenessConfig>): Promise<CameraAwarenessConfig>
detectOnce(frame: CameraFrameInput): Promise<CameraDetectionResult>
processBackgroundFrame(frame: CameraFrameInput): Promise<CameraAwarenessSnapshot>
getSnapshot(): Promise<CameraAwarenessSnapshot>
```

核心数据结构：

```ts
type CameraFrameSource = 'settings-test' | 'background' | 'chat-command' | 'intent-command';
type CameraPresence = 'present' | 'absent' | 'uncertain';
type CameraAffect = 'positive' | 'neutral' | 'low_energy' | 'unclear';
type CameraStatus = 'present' | 'absent' | 'uncertain' | 'unavailable';

interface CameraFrameInput {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  capturedAt: number;
  source: CameraFrameSource;
}

interface CameraAwarenessConfig {
  enabled: boolean;
  backgroundDetectionEnabled: boolean;
  lightAffectEnabled: boolean;
  detectionIntervalMs: number;
  absentAfterMs: number;
  minConfidence: number;
  returnedReactionEnabled: boolean;
  debugPreviewEnabled: boolean;
  foregroundFaceGateEnabled: boolean;
  foregroundFaceMinHeightRatio: number;
  foregroundFaceMinAreaRatio: number;
}

interface CameraDetectionResult {
  presence: CameraPresence;
  confidence: number;
  affect: CameraAffect;
  reason: 'person_visible' | 'no_person_visible' | 'too_dark' | 'camera_blocked' | 'image_unclear' | 'api_error';
  checkedAt: number;
}

interface CameraAwarenessSnapshot {
  status: CameraStatus;
  lastDetection: CameraDetectionResult | null;
  lastChangedAt: number | null;
  lastReturnedAt: number | null;
  backgroundDetectionRunning: boolean;
  lastError?: string;
}
```

使用约定：`detectOnce` 只服务设置页测试，不触发气泡；`processBackgroundFrame` 才进入稳定状态机，并且只有稳定 `absent -> present` 会尝试回来回应。

## 验证

```bash
npm run build
node scripts/camera-awareness-contract.test.js
```

当前契约测试覆盖：默认配置、IPC 常量、Vision JSON 解析、非法响应降级、状态机离开/回来转换、`detectOnce` 不触发气泡、后台 runner、前景人脸 gate、`*` 命令和摄像头 workflow 接线。
