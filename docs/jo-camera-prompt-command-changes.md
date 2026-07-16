# JO 修改说明：`*` 摄像头单帧分析命令

## 修改目标

新增一个与现有 `.` 截屏分析命令同级的聊天入口：

- `.` 开头：触发屏幕截图分析。
- `*` 开头：触发摄像头单帧分析。

用户输入 `*` 时，Ze 会临时打开摄像头拍一张低分辨率图片，并输出一句简短问候。用户输入 `*` 后带提示词时，提示词会作为这张摄像头照片的分析请求。

示例：

```txt
*
*现在适合说什么？
*帮我看看我是不是在镜头里
```

## 设计边界

这次改动保持 Project-Ze 原有模块分层：

- `ChatManager` 只负责识别 `*` 命令和展示结果。
- `renderer` 只负责摄像头权限、单帧拍摄和关闭摄像头。
- `main` 只做一次性 IPC 请求桥。
- `VisionImageAnalyzer` 负责视觉模型调用和回复清洗。
- 现有摄像头 presence 状态机没有被改成强依赖聊天命令。

摄像头不会持续开启；`*` 命令每次只拍一张 320px 宽 JPEG 单帧，拍完立即停止摄像头 track。

## 修改文件

- `src/core/chat-manager.ts`
  - 新增 `*` 开头消息分支。
  - 新增 `setCameraPromptAnalyzer()`，由主进程注入摄像头分析能力。
  - `*` 命令会记录到聊天记忆，交互类型为 `camera-analysis`。

- `src/renderer/renderer.ts`
  - 新增 `captureCameraPromptFrame()`。
  - 监听 `camera-analysis:capture-request`。
  - 使用 `navigator.mediaDevices.getUserMedia({ video, audio: false })` 获取单帧。

- `src/main/main.ts`
  - 新增 `requestCameraPromptAnalysis()`。
  - 新增 pending request map，用 `requestId` 关联 ChatManager 请求和 renderer 回传帧。
  - 新增 `camera-awareness:analyze-prompt` IPC handler。

- `src/main/preload.ts`
  - 在 `window.companion.cameraAwareness` 下新增：
    - `onPromptCaptureRequest()`
    - `submitPromptFrame()`

- `src/core/vision-image-analyzer.ts`
  - 新增 `analyzeCameraPrompt()`。
  - 新增 `buildCameraPromptAnalysisPrompt()`。
  - 新增 `cleanCameraPromptReply()`。
  - 默认 `*` 无提示词时，生成简短问候。

- `src/core/camera-awareness-types.ts`
  - `CameraFrameInput.source` 新增 `chat-command`。
  - `CAMERA_AWARENESS_IPC` 新增 `analyzePrompt`。

- `scripts/camera-awareness-contract.test.js`
  - 补充新增 IPC、`*` 命令接线、prompt helper 的契约检查。

- `README.md`
  - Usage 表格中新增 `*` 开头消息说明。

- `DEVLOG.md`
  - 新增本次 camera prompt command 修改记录。

## 隐私与安全

- 只在用户主动输入 `*` 时触发。
- 不做后台持续摄像头采样。
- 不保存摄像头图片到磁盘。
- 不识别身份，不要求模型推断年龄、性别、种族等敏感属性。
- Vision API 未配置时，会返回“摄像头分析还没有配置 Vision API。”，不会假装分析。

## 验证结果

已运行：

```bash
npm run build
npm test
node scripts/camera-awareness-contract.test.js
```

结果均通过。

还做了 Electron 启动冒烟测试：主程序启动 6 秒后仍然存活，随后由测试脚本手动关闭。

## 注意事项

- 使用 `*` 命令需要系统允许摄像头权限。
- 需要在设置中配置可用的 Vision API，才会有真实视觉分析结果。
- 当前实现是 AI 视觉分析，不是本地人脸检测；如果后续要减少 token 消耗，可以在此入口前增加本地轻量 presence detector。
