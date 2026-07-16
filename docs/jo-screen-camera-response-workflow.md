# JO 修改说明：截图与拍摄结果接入统一回复工作流

## 修改目标

把截图和摄像头拍摄这两类多模态工具做“小步正式化”：自然语言入口仍由现有 Intent Router 判断，但一旦需要使用截图或摄像头，工具模块只负责产出 observation，最终用户可见回复统一交给聊天模型生成。

## 新链路

```txt
用户自然语言
  -> IntentClassifier / IntentRouter
  -> direct chat / screen workflow / camera workflow
  -> 工具执行并产出 observation
  -> ResponseWorkflowOrchestrator
  -> ChatManager.respondFromWorkflow(...)
  -> Ze 风格 <item> 气泡 / TTS
```

## 当前接入范围

- `screen_summary_response`
  - 工具：`ScreenAnalyzer.analyze(...)`
  - observation：`screen_summary`

- 截图自然语言触发词
  - 仍由 `IntentClassifier` 归类为 `screen_summary` 后进入同一条 workflow。
  - 新增覆盖：“看看屏幕 / 看一下当前屏幕 / 看看我的桌面在做什么 / 你看看这个 / 这是什么意思 / 上面写了什么 / 截个屏看看 / 截图分析”等自然说法。
  - 短句“你看看这个”“这是什么意思”会按当前屏幕理解，避免用户想触发截图时必须说标准指令。
  - 摄像头判断仍优先处理“看看我今天穿的衣服”“看看我手里拿的是什么”等无屏幕上下文的请求；带“桌面 / 屏幕 / 页面 / 窗口”的“看看我...”不会被误判成摄像头。

- `screen_target_pointer_response`
  - 工具：`ScreenTargetPointer.handle(..., { suppressResultBubble: true })`
  - observation：`screen_target_pointer`
  - 动作：`point_target`

- `camera_check_once_response`
  - 工具：`requestCameraIntentFrame()` + `CameraAwarenessManager.detectOnce(frame)`
  - observation：`camera_presence`

- `camera_visual_query_response`
  - 工具：`requestCameraIntentFrame()` + `VisionImageAnalyzer.analyzeCameraVisualQuery(frame, userText)`
  - observation：`camera_visual`

## 保留边界

- Intent Router 仍负责自然语言意图分类和能力门禁。
- Screen / Camera 模块不负责最终措辞，只返回工具观察结果。
- `BubbleOrchestrator` 仍只负责投递，不参与语言生成。
- 原始 observation 只作为本轮短期上下文，不默认写入长期记忆。
- `*` 摄像头快捷命令暂时保留原路径，避免一次性改变调试入口行为。

## 主要修改文件

- `src/core/response-workflow-types.ts`
  - 新增工作流类型、observation 类型、action result 和隐私边界。

- `src/core/response-workflow-orchestrator.ts`
  - 新增统一编排层，把 screen / camera 工具结果转为 `WorkflowResponseContext`。

- `src/core/chat-manager.ts`
  - 新增 `respondFromWorkflow(...)`，作为工作流最终回复入口。
  - `.` 截屏入口优先走 response workflow。
  - intent handler 已产出 workflow 最终回复时，不再额外发送旧式气泡或重复写入历史。

- `src/core/screen-target-pointer.ts`
  - 新增 `suppressResultBubble` 选项，让 workflow 控制最终说明文案。

- `src/main/main.ts`
  - 实例化 `ResponseWorkflowOrchestrator`。
  - `screen_summary`、`screen_target_pointer`、`camera_check_once`、`camera_visual_query` handler 改为调用 workflow。

- `src/core/intent-classifier.ts`
  - 扩展 `screen_summary` 自然语言触发词表，只影响截图/屏幕总结入口，不改变截图执行模块。

- `scripts/response-workflow-contract.test.js`
  - 覆盖截图总结、屏幕指向、摄像头人在/不在、摄像头视觉查询都必须委托给 chat responder 生成最终回复。

- `scripts/intent-router-contract.test.js`
  - 覆盖新增截图触发词必须路由到 `screen_summary`。

## 验证命令

```bash
npm run build
npm test
node scripts/camera-awareness-contract.test.js
```
