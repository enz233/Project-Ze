# JO 修改说明：本地轻量人脸存在检测接口

## 修改目标

新增一个独立模块，先为“本地轻量化人脸感知”留出接口。它只判断画面里是否有可见人脸，不做身份识别，不推断年龄、性别、种族等敏感属性。

本次改动尚未接入现有 `*` 摄像头分析命令，也没有改动 `CameraAwarenessManager` 的 AI 视觉检测链路。

## 新增文件

- `src/core/local-face-presence-detector.ts`
  - 定义本地人脸存在检测统一接口。
  - 提供 `ShapeDetectionFacePresenceDetector`，适配浏览器原生 Shape Detection API 的 `FaceDetector`。
  - 提供 `NoopFacePresenceDetector`，用于当前环境不支持本地检测时安全降级。
  - 提供 `createDefaultLocalFacePresenceDetector()`，后续可作为工厂入口。

- `scripts/local-face-presence-detector-contract.test.js`
  - 使用 fake `FaceDetector` 验证接口输出。
  - 覆盖 present、absent、detector error、noop fallback。

## 设计接口

核心接口：

```ts
export interface LocalFacePresenceDetector {
  readonly source: LocalFacePresenceSource;
  isAvailable(): Promise<boolean>;
  detect(frame: unknown): Promise<LocalFacePresenceResult>;
  dispose?(): void;
}
```

统一结果：

```ts
export interface LocalFacePresenceResult {
  status: 'present' | 'absent' | 'uncertain' | 'unavailable';
  confidence: number;
  faceCount: number;
  boxes: LocalFaceBox[];
  checkedAt: number;
  source: 'shape-detection-api' | 'mediapipe-face-detector' | 'tfjs-face-detection' | 'tfjs-blazeface' | 'noop';
  reason: LocalFacePresenceReason;
  error?: string;
}
```

## 调研参考

本模块先参考三条成熟路线，但这次只落最轻的原生适配器：

- Shape Detection API / `FaceDetector`
  - 浏览器原生接口，直接返回人脸框，适合作为零依赖轻量入口。
  - 兼容性不稳定，所以模块提供 `NoopFacePresenceDetector` 降级，不把它写死为唯一实现。
  - 参考：https://developer.mozilla.org/en-US/docs/Web/API/FaceDetector
  - 参考：https://developer.chrome.com/docs/capabilities/shape-detection
  - 参考：https://wicg.github.io/shape-detection-api/

- MediaPipe Face Detector
  - Google AI Edge 的成熟本地视觉任务，能在图片或视频帧上做人脸检测。
  - 更适合后续作为稳定实现，但需要引入模型和运行时资源。
  - 参考：https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector

- TensorFlow.js face-detection / BlazeFace
  - TFJS 生态里也有人脸检测模型，适合纯前端模型推理路线。
  - `tfjs-blazeface` 可作为历史兼容方向，新的接入更建议评估 `@tensorflow-models/face-detection`。
  - 参考：https://github.com/tensorflow/tfjs-models/tree/master/face-detection
  - 参考：https://github.com/tensorflow/tfjs-models/tree/master/blazeface

## 为什么先用接口而不是直接上依赖

调研后更适合先预留统一接口：

- 浏览器原生 `FaceDetector` 不需要新增依赖，但兼容性不是所有环境都有。
- MediaPipe Face Detector 更成熟，但会引入模型和运行时资源。
- TFJS face-detection / BlazeFace 生态成熟，但会增加包体积和加载成本。

因此本次只先落一个独立模块，让后续实现可以在同一接口下替换。

## 后续接入方向

后续可以把 `*` 摄像头命令或 `CameraAwarenessManager` 改成：

```txt
renderer 拍摄摄像头单帧
  -> LocalFacePresenceDetector.detect(frame)
  -> 如果本地检测明确 present / absent，直接使用
  -> 如果 unavailable / uncertain，再按配置决定是否调用 Vision API
```

这样可以减少 token 消耗，并降低摄像头画面上传频率。

## 隐私边界

- 不保存摄像头图片。
- 不上传图片。
- 不识别身份。
- 不推断敏感属性。
- 只返回抽象结果：`present / absent / uncertain / unavailable`。

## 验证命令

```bash
npm run build
node scripts/local-face-presence-detector-contract.test.js
```
