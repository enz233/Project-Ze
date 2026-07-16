# JO 修改说明：摄像头能力接入 Intent Workflow

## 修改目标

把摄像头能力接入原项目新增的 Intent Router / Intent Executor 工作流，让用户不只依赖 `*` 符号，也可以通过自然语言主动触发摄像头能力。

## 新增工作流意图

- `camera_check_once`
  - 用于“看看我在不在”“检测一下摄像头状态”这类人在/不在检查。
  - 执行时拍摄一张 `intent-command` 单帧，并调用 `CameraAwarenessManager.detectOnce(frame)`。
  - 不进入后台状态机，不触发“回来啦”气泡。

- `camera_visual_query`
  - 用于“看看我今天穿的衣服是什么颜色”“看看我手里拿的是什么”“镜头里有什么”这类开放摄像头视觉问题。
  - 执行时拍摄一张 `intent-command` 单帧，并调用 `VisionImageAnalyzer.analyzeCameraVisualQuery(frame, userText)`。
  - 视觉分析结果作为短期 workflow observation，再由 `ChatManager` 尝试交给聊天模型生成最终 Ze 风格回复。

## 保留的既有边界

- `*` 入口仍然保留，继续作为显式摄像头单帧分析命令。
- 后台低频检测仍由 `CameraAwarenessBackgroundRunner` 驱动。
- `camera_check_once` 使用 `detectOnce`，不会触发后台 `absent -> present` 回来回应。
- `camera_visual_query` 只在用户主动明确请求时触发。
- 摄像头敏感能力仍经过 Intent Router 权限门禁：`camera_frame` 必须 userInitiated + explicit，并且摄像头感知配置已启用。

## 修改文件

- `src/core/intent-types.ts`
  - 新增 `camera_visual_query` intent。

- `src/core/intent-classifier.ts`
  - 新增自然语言摄像头视觉查询规则。

- `src/core/intent-router.ts`
  - 为 `camera_visual_query` 自动补齐 `camera_frame / vision / llm` 能力。

- `src/core/intent-executor.ts`
  - 新增 `cameraVisualQuery` handler。

- `src/main/main.ts`
  - `cameraCheckOnce` 从占位实现改为真实单帧检测。
  - 新增 `cameraVisualQuery` 执行逻辑。
  - 新增 `requestCameraIntentFrame()`，通过 renderer 拍摄 `intent-command` 单帧。

- `src/renderer/renderer.ts`
  - 后台取帧 IPC 可根据 payload source 生成 `background` 或 `intent-command` 帧。

- `src/core/vision-image-analyzer.ts`
  - 新增 `analyzeCameraVisualQuery()` 和 `buildCameraVisualQueryPrompt()`。

- `src/core/chat-manager.ts`
  - 对带 `finalChatResponse` debug 标记的摄像头 workflow 结果，尝试交给聊天模型生成最终可见回复。

- `scripts/intent-router-contract.test.js`
  - 覆盖 `camera_visual_query` 分类、权限和 executor 分发。

- `scripts/camera-awareness-contract.test.js`
  - 覆盖摄像头 workflow 接线和视觉 query prompt helper。

## 运行链路

```txt
用户：看看我手里拿的是什么
  -> IntentClassifier: camera_visual_query
  -> IntentRouter: camera_frame + vision + llm 权限检查
  -> IntentExecutor.cameraVisualQuery
  -> main 请求 renderer 拍摄 intent-command 单帧
  -> VisionImageAnalyzer.analyzeCameraVisualQuery(frame, userText)
  -> ChatManager.tryBuildWorkflowFinalResponse(...)
  -> 聊天模型生成最终 Ze 风格回复
```

```txt
用户：看看我在不在
  -> IntentClassifier: camera_check_once
  -> IntentRouter: camera_frame 权限检查
  -> IntentExecutor.cameraCheckOnce
  -> main 请求 renderer 拍摄 intent-command 单帧
  -> CameraAwarenessManager.detectOnce(frame)
  -> ChatManager 生成最终可见回复
```

## 验证命令

```bash
npm run build
npm test
node scripts/camera-awareness-contract.test.js
node scripts/local-face-presence-detector-contract.test.js
```
