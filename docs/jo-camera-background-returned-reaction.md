# JO 修改说明：摄像头后台低频检测与回来回应

## 修改目标

把“后台低频检测”从设置页里的临时 `setInterval` 改成真正的运行时能力：

- 用户打开“启用摄像头感知”和“后台低频检测”后，主进程按 `detectionIntervalMs` 调度检测。
- 每次检测只请求 renderer 拍一张低分辨率摄像头单帧，拍完立即关闭摄像头 track。
- 只有后台状态机确认从 `absent` 变回 `present`，且“回来时轻柔回应”开启时，才尝试发出“回来啦”类似气泡。
- 回来气泡继续经过 `BubbleOrchestrator.tryShowProactive()`，不会绕过原有状态门禁和气泡冷却。

## 行为边界

- `detectOnce(frame)` 仍然只用于设置页“立即检测一次”，不会触发气泡。
- 后台检测不会因为单次 `present` 直接问候，必须先进入稳定 `absent`。
- 设置页不再自己开后台检测计时器，避免设置窗口打开时产生重复检测。
- 摄像头仍由 renderer 侧访问；core 层不直接调用 `getUserMedia`。
- 本次没有把本地轻量人脸检测模块接入运行链路，当前后台检测仍复用 Vision API 结构化判断。

## 新增文件

- `src/core/camera-awareness-background-runner.ts`
  - 独立后台调度器。
  - 只读取配置、按间隔请求取帧、把帧交给状态机。
  - 不依赖 Electron，不直接打开摄像头。

## 修改文件

- `src/core/camera-awareness-types.ts`
  - 新增后台取帧 request / submit IPC 常量。

- `src/core/camera-awareness-manager.ts`
  - 新增 `recordBackgroundError()`，用于记录后台拍摄失败或超时，不误改人在/不在状态。

- `src/main/main.ts`
  - 创建 `CameraAwarenessBackgroundRunner`。
  - 保存摄像头感知配置后同步启动 / 停止后台检测。
  - 新增后台单帧 requestId 桥接：主进程请求、renderer 拍摄、主进程收到 frame 后交给状态机。

- `src/main/preload.ts`
  - 新增 `cameraAwareness.onBackgroundCaptureRequest()`。
  - 新增 `cameraAwareness.submitBackgroundFrame()`。

- `src/renderer/renderer.ts`
  - 把摄像头单帧拍摄函数参数化为 `source`。
  - `*` 命令继续使用 `chat-command`。
  - 后台低频检测使用 `background`，不更新聊天状态 UI。

- `src/main/settings.html`
  - 移除设置页本地后台 `setInterval`。
  - 保存配置后只刷新 snapshot，后台循环由主进程负责。

- `scripts/camera-awareness-contract.test.js`
  - 增加后台运行器契约测试。
  - 增加后台 IPC / preload / renderer 接线检查。

- `docs/camera-awareness-core.md`
  - 更新后台低频检测的实际运行链路。

## 运行链路

```txt
设置页保存配置
  -> main: cameraAwarenessManager.updateConfig()
  -> main: cameraAwarenessBackgroundRunner.sync()
  -> runner 按 detectionIntervalMs 请求一帧
  -> mainWindow renderer: getUserMedia 拍摄 320px JPEG
  -> main: cameraAwarenessManager.processBackgroundFrame(frame)
  -> CameraAwarenessManager 判断 present / absent 状态转换
  -> absent -> present 且 returnedReactionEnabled=true
  -> BubbleOrchestrator.tryShowProactive(text, 'camera_awareness')
  -> BubbleManager 状态门禁 + 90 秒主动气泡冷却
```

## 验证命令

```bash
npm run build
node scripts/camera-awareness-contract.test.js
```

此外建议运行：

```bash
npm test
node scripts/local-face-presence-detector-contract.test.js
```
