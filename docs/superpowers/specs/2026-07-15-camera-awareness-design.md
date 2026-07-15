# Camera Awareness 摄像头感知模块设计

日期：2026-07-15

## 背景

Project-Ze 当前已有屏幕截图与 Vision 分析能力，文档中将 `ScreenAnalyzer` 定义为唯一屏幕截图与 Vision 分析服务。后续桌宠希望能够通过摄像头“看见”用户，并在用户回来、状态轻松或低能量时做出轻柔回应。

摄像头不是当前项目核心模块，因此第一版应保持轻量：复用现有图片 Vision 分析体系，不新增复杂视觉平台，不做连续视频分析，不引入独立供应商体系。该模块的价值是增强陪伴感，而不是替代聊天、屏幕分析或主动回应主链路。

## 目标

1. 新增可选的摄像头感知能力，默认关闭。
2. 在设置页新增“摄像头感知”栏目，支持开关、后台低频检测、轻量状态线索、回来回应和立即检测一次。
3. 通过 renderer 获取摄像头单帧，压缩为低分辨率图片，经 IPC 交给 main/core 分析。
4. 复用现有图片 Vision 分析体系，判断摄像头单帧中的用户存在状态。
5. 支持一点点轻量状态线索：`positive` / `neutral` / `low_energy` / `unclear`，用于调整陪伴语气。
6. 使用本地状态机将单帧判断稳定为 `present` / `absent` / `uncertain` / `unavailable`。
7. 第一版只在后台检测的 `absent -> present` 时产生 `user_returned` 事件，并仍通过现有气泡门禁和冷却。
8. 明确接口、配置、IPC、状态机和文档边界，避免后续实现发散。

## 非目标

1. 不做实时视频流分析。
2. 不保存摄像头图片或视频到磁盘。
3. 不把摄像头画面写入长期记忆。
4. 不做人脸身份识别、人脸库、年龄、性别、种族等敏感属性判断。
5. 不做精细情绪识别、医学或心理诊断。
6. 不自动描述用户外貌、房间环境或具体行为。
7. 不因为 `present -> absent` 主动说话。
8. 不为摄像头单独复制一套 AI/Vision provider。
9. 不大改 `ScreenAnalyzer`；只轻量复用或轻抽图片 Vision 调用能力。
10. 不把摄像头感知设计成项目核心依赖；摄像头不可用时项目其它能力应正常运行。

## 推荐方案

采用轻量 **CameraAwarenessManager**，复用现有图片 Vision 分析能力。

```text
settings.html / renderer
  ├─ 摄像头感知设置栏目
  ├─ getUserMedia 获取摄像头权限
  ├─ canvas 截取低分辨率单帧
  └─ IPC 发送 CameraFrameInput

main / core
  ├─ CameraAwarenessConfigManager
  ├─ CameraAwarenessManager
  └─ VisionImageAnalyzer / 轻抽现有图片 Vision 调用
       └─ detectCameraAwareness(frame, options)

active reaction
  └─ absent -> present 时产生 user_returned，低优先级交给气泡/主动回应门禁
```

设计原则：屏幕和摄像头都是图片输入源，但不是同一个业务模块。屏幕分析继续由 `ScreenAnalyzer` 负责；摄像头感知由 `CameraAwarenessManager` 负责；底层图片 Vision 调用可以共享。

## 备选方案

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| 直接把摄像头逻辑塞进 `ScreenAnalyzer` | 实现最快，复用最直接 | `ScreenAnalyzer` 职责变宽，屏幕和摄像头隐私边界混在一起 | 不推荐 |
| 新增完整独立摄像头 Vision API 体系 | 边界清晰 | 重复 provider、请求、解析和错误处理逻辑 | 不推荐 |
| 轻抽/复用统一图片 Vision 分析层 | 复用现有能力，摄像头业务边界清楚，后续可扩展 | 需要小幅整理 Vision 调用入口 | 推荐 |

## 设置页设计

新增设置分组：

```text
摄像头感知
[ ] 启用摄像头感知
[ ] 后台低频检测
[ ] 轻量状态线索
检测间隔：30 秒 / 1 分钟 / 3 分钟 / 5 分钟
离开判定：1 分钟 / 2 分钟 / 5 分钟
[ ] 回来时轻柔回应
[ ] 调试预览
[立即检测一次]
检测结果：未检测 / 有人在 / 未看到人 / 不确定 / 摄像头不可用
```

默认配置：

```ts
const DEFAULT_CAMERA_AWARENESS_CONFIG: CameraAwarenessConfig = {
  enabled: false,
  backgroundDetectionEnabled: false,
  lightAffectEnabled: true,
  detectionIntervalMs: 60_000,
  absentAfterMs: 120_000,
  minConfidence: 0.65,
  returnedReactionEnabled: true,
  debugPreviewEnabled: false,
};
```

首次开启“启用摄像头感知”时，设置页展示短说明：

```text
摄像头感知会在你允许后截取低分辨率单帧，用当前图片分析能力判断是否有人在镜头前，并可选判断非常粗略的状态线索。它不会保存视频或图片，不会识别身份，也不会分析年龄、性别等敏感属性。后台低频检测默认关闭，你可以随时关闭。
```

开启“后台低频检测”时，再提示：

```text
后台低频检测开启后，Ze 会按设定间隔短暂获取摄像头单帧，用于判断你是否回来。不会连续录制视频。
```

## 用户交互

### 立即检测一次

“立即检测一次”只在设置页显示结果，不触发 Ze 气泡。

```text
用户点击立即检测一次
  -> renderer 请求摄像头权限
  -> 截取低分辨率单帧
  -> main 分析
  -> 设置页显示结果
  -> 不触发 user_returned
  -> 不写入主动回应冷却
```

示例结果：

```text
检测结果：有人在（置信度 0.82，状态线索：neutral）
检测结果：不确定（画面太暗）
检测失败：摄像头权限被拒绝
检测失败：图片分析服务不可用
```

### 后台低频检测

开启条件：

```text
enabled = true
backgroundDetectionEnabled = true
```

第一版采用简单策略：renderer 按间隔短暂打开摄像头、截取单帧、关闭摄像头，再交给 main 分析。不要做长期连续视频流处理。

### 主界面行为

第一版不新增主界面常驻摄像头 UI。只有稳定的 `absent -> present` 事件可触发轻柔回应，并且必须经过气泡系统门禁和冷却。

## 摄像头采集

第一版只采集单帧：

```text
getUserMedia
  -> video ready
  -> canvas 缩放绘制一帧
  -> toDataURL / Blob 转 JPEG base64
  -> stop tracks 释放摄像头
  -> IPC 发送给 main
```

建议采样参数：

```ts
const CAMERA_FRAME_WIDTH = 320;
const CAMERA_FRAME_HEIGHT = 180;
const CAMERA_FRAME_MIME = 'image/jpeg';
const CAMERA_FRAME_QUALITY = 0.72;
```

摄像头帧结构：

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

`imageBase64` 建议不包含 `data:image/...;base64,` 前缀；如果实现中保留前缀，IPC 处理层必须统一剥离后再传给 Vision。

## Vision 分析接口

不要设计复杂任务平台。第一版只需要一个小接口：

```ts
interface VisionImageAnalyzer {
  detectCameraAwareness(
    frame: CameraFrameInput,
    options: CameraAwarenessDetectOptions
  ): Promise<CameraAwarenessDetectionResult>;
}

interface CameraAwarenessDetectOptions {
  lightAffectEnabled: boolean;
  minConfidence: number;
}
```

检测结果：

```ts
interface CameraAwarenessDetectionResult {
  presence: 'present' | 'absent' | 'uncertain';
  confidence: number;
  affect?: 'positive' | 'neutral' | 'low_energy' | 'unclear';
  reason:
    | 'person_visible'
    | 'no_person_visible'
    | 'too_dark'
    | 'camera_blocked'
    | 'image_unclear'
    | 'api_error';
  checkedAt: number;
}
```

Vision prompt 应只要求结构化判断，不问开放问题：

```text
你会收到一张低分辨率摄像头单帧。请只做 Project-Ze 桌宠的轻量陪伴判断。

输出 JSON：
{
  "presence": "present" | "absent" | "uncertain",
  "confidence": 0 到 1,
  "affect": "positive" | "neutral" | "low_energy" | "unclear",
  "reason": "person_visible" | "no_person_visible" | "too_dark" | "camera_blocked" | "image_unclear"
}

规则：
- presence 只判断画面中是否有真实用户可见。
- 如果看不清、太暗、遮挡、无法判断，返回 uncertain。
- affect 只在用户可见且允许 light affect 时返回。
- affect 是非常粗略的陪伴线索，不是情绪诊断。
- 不识别身份。
- 不判断年龄、性别、种族等敏感属性。
- 不描述外貌和环境。
- 不输出 JSON 以外的内容。
```

当 `lightAffectEnabled = false` 时，prompt 应要求不返回 `affect`，或固定返回 `unclear`。parser 需兼容这两种情况。

## CameraAwarenessManager 接口

```ts
class CameraAwarenessManager {
  constructor(
    configManager: CameraAwarenessConfigManager,
    visionAnalyzer: VisionImageAnalyzer,
    options?: CameraAwarenessManagerOptions
  );

  getConfig(): CameraAwarenessConfig;

  updateConfig(
    partial: Partial<CameraAwarenessConfig>
  ): Promise<CameraAwarenessConfig>;

  detectOnce(
    frame: CameraFrameInput
  ): Promise<CameraAwarenessDetectionResult>;

  processBackgroundFrame(
    frame: CameraFrameInput
  ): Promise<CameraAwarenessSnapshot>;

  getSnapshot(): CameraAwarenessSnapshot;

  stop(): void;
}
```

接口语义：

- `detectOnce(frame)`：只返回检测结果，供设置页测试；不触发 `user_returned`，不写入主动回应冷却。
- `processBackgroundFrame(frame)`：更新稳定状态机；可能在 `absent -> present` 时产生低优先级回来事件。
- `stop()`：清理内部状态、取消后台相关等待；摄像头硬件释放由 renderer 侧完成。

配置结构：

```ts
interface CameraAwarenessConfig {
  enabled: boolean;
  backgroundDetectionEnabled: boolean;
  lightAffectEnabled: boolean;
  detectionIntervalMs: number;
  absentAfterMs: number;
  minConfidence: number;
  returnedReactionEnabled: boolean;
  debugPreviewEnabled: boolean;
}
```

状态快照：

```ts
interface CameraAwarenessSnapshot {
  status: 'present' | 'absent' | 'uncertain' | 'unavailable';
  lastDetection: CameraAwarenessDetectionResult | null;
  lastChangedAt: number | null;
  lastReturnedAt: number | null;
  backgroundDetectionRunning: boolean;
  lastError?: string;
}
```

## IPC 接口

renderer -> main：

```ts
'camera-awareness:get-config'
'camera-awareness:update-config'
'camera-awareness:detect-once'
'camera-awareness:process-background-frame'
'camera-awareness:get-snapshot'
```

建议签名：

```ts
getConfig(): Promise<CameraAwarenessConfig>
updateConfig(partial: Partial<CameraAwarenessConfig>): Promise<CameraAwarenessConfig>
detectOnce(frame: CameraFrameInput): Promise<CameraAwarenessDetectionResult>
processBackgroundFrame(frame: CameraFrameInput): Promise<CameraAwarenessSnapshot>
getSnapshot(): Promise<CameraAwarenessSnapshot>
```

main -> renderer 第一版不需要主动推送。设置页按需调用获取结果。后续如果需要实时同步，再新增：

```ts
'camera-awareness:snapshot-updated'
```

## 状态机

内部稳定状态：

```ts
type CameraAwarenessStatus =
  | 'present'
  | 'absent'
  | 'uncertain'
  | 'unavailable';
```

规则：

1. 初始状态为 `unavailable` 或 `uncertain`。
2. 检测到 `present` 且 `confidence >= minConfidence`：进入 `present`，记录 `lastSeenAt`。
3. 如果进入 `present` 前状态是 `absent`，且 `returnedReactionEnabled=true`，产生 `user_returned`。
4. 检测到 `absent` 时，不立即进入 `absent`；只有距离上次 `present` 超过 `absentAfterMs` 才进入 `absent`。
5. 检测到 `uncertain` 时，不覆盖当前稳定的 `present` / `absent`。
6. 摄像头权限拒绝、设备不可用或功能关闭时进入 `unavailable`，不触发主动回应。

伪逻辑：

```ts
if (result.presence === 'present' && result.confidence >= config.minConfidence) {
  if (snapshot.status === 'absent') {
    emitReturnedEvent(result);
  }
  status = 'present';
  lastSeenAt = now;
}

if (result.presence === 'absent') {
  if (lastSeenAt && now - lastSeenAt >= config.absentAfterMs) {
    status = 'absent';
  }
}

if (result.presence === 'uncertain') {
  // keep current stable status
}
```

## 主动回应接入

第一版只产生一个事件：

```ts
interface CameraAwarenessEvent {
  type: 'user_returned';
  source: 'camera_awareness';
  affect?: 'positive' | 'neutral' | 'low_energy' | 'unclear';
  confidence: number;
  occurredAt: number;
}
```

推荐流程：

```text
CameraAwarenessManager
  -> user_returned
  -> ObserverManager / ProactiveReactionSystem 或低优先级 BubbleOrchestrator 请求
  -> MicroBehaviorManager
  -> BubbleOrchestrator
  -> BubbleManager.tryShowProactiveBubble
```

如果第一版完整接入 `ProactiveReactionSystem` 成本偏高，可以先将事件映射为低优先级气泡请求，但不能绕过 `BubbleManager` 的状态门禁和冷却。

回来文案由主动回应或气泡层决定，摄像头模块不生成长文案。可使用本地模板：

```ts
const returnedTemplates = {
  neutral: ['回来啦。', '又见到你了。'],
  positive: ['回来啦，看起来状态不错～', '又见到你啦。'],
  low_energy: ['回来啦，慢慢来就好。', '先缓一缓也可以。'],
  unclear: ['回来啦。'],
};
```

文案约束：

- 不频繁说“我看到你”。
- 不描述具体外貌。
- 不说“你看起来很累”这种确定判断。
- `low_energy` 只用温和表达。
- 第一版不对 `present -> absent` 主动说话。

## 错误处理

错误码：

```ts
type CameraAwarenessErrorCode =
  | 'camera_permission_denied'
  | 'camera_not_found'
  | 'capture_failed'
  | 'vision_unavailable'
  | 'vision_parse_failed'
  | 'disabled';
```

| 错误 | 用户可见行为 | 状态 |
|---|---|---|
| 摄像头权限拒绝 | 设置页显示“摄像头权限被拒绝” | `unavailable` |
| 没有摄像头 | 设置页显示“未找到摄像头” | `unavailable` |
| 截图失败 | 设置页显示“截取画面失败” | 保持原状态 |
| Vision 不可用 | 设置页显示“图片分析服务不可用” | 保持或 `unavailable` |
| JSON 解析失败 | 显示“不确定”或“分析结果不可用” | `uncertain` |
| 功能关闭 | 不取帧、不分析 | `unavailable` |

后台检测错误只写日志、更新 `lastError`，不弹气泡、不频繁重试，下一轮按正常间隔再试。

## 隐私与数据边界

1. 摄像头感知默认关闭。
2. 后台低频检测默认关闭。
3. 不连续上传视频，只上传低分辨率单帧。
4. 不保存摄像头图片到磁盘。
5. 不写入长期记忆。
6. 不识别身份。
7. 不判断年龄、性别、种族等敏感属性。
8. 轻量状态线索只用于陪伴语气，不作为事实判断。
9. Debug/设置页只显示检测结果和错误原因；调试预览默认关闭。
10. 关闭功能后停止后续取帧和分析。

这些边界不用于限制后续体验扩展，而是保证第一版能力可信、可控、可关闭。

## 测试策略

### 单元测试

覆盖 `CameraAwarenessManager`：

- `detectOnce` 返回结果但不触发回来事件。
- `processBackgroundFrame` 在 `absent -> present` 时产生回来事件。
- `absentAfterMs` 未达到时不进入 `absent`。
- `uncertain` 不覆盖稳定状态。
- `confidence < minConfidence` 不进入 `present`。
- Vision 报错时更新 `lastError`，不触发气泡。

覆盖配置管理：

- 默认值正确。
- 更新配置后持久化。
- 缺字段时默认值合并。
- 非法区间回退或 clamp。

覆盖 Vision 解析：

```json
{"presence":"present","confidence":0.9,"affect":"neutral","reason":"person_visible"}
```

以及非 JSON、缺字段、非法枚举等异常响应，确保返回可控错误或 `uncertain`，不让主流程崩溃。

### 手动验证

1. 设置页显示新增栏目。
2. “立即检测一次”能请求摄像头权限。
3. 权限拒绝时设置页有提示。
4. 检测成功时显示 presence、confidence、affect。
5. 后台检测关闭时不会自动取帧。
6. 后台检测开启后按间隔取帧。
7. 关闭开关后停止取帧。
8. `absent -> present` 只在后台检测中触发轻柔回应。
9. Vision/API 不可用时项目其它聊天、TTS、屏幕分析能力不受影响。

## 文档与索引更新

实施完成后至少更新：

- `docs/camera-awareness.md`：模块说明、设置项、接口、隐私边界、调试方法。
- `PROJECT_INDEX.md`：core 模块速查、IPC 通道、常见修改场景和版本历史。
- `VERSION.md`：记录摄像头感知模块变更。

设计阶段只提交本文档。实施阶段再补充计划文档与模块说明。

## 范围控制

本模块不是项目核心。实施时优先完成最小闭环：

1. 设置页配置和立即检测一次。
2. 摄像头单帧采集。
3. 复用图片 Vision 分析得到结构化结果。
4. `CameraAwarenessManager` 状态机。
5. 后台低频检测可开关。
6. `user_returned` 轻柔回应接入。
7. 文档和基础测试。

不要在第一版加入：手势识别、持续流处理、复杂 provider 管理、主界面摄像头控件、长期视觉记忆、精细情绪模型或复杂 Debug 预览。
