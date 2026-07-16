# Qwen-ASR Realtime Engine Design

日期：2026-07-16

## 背景

用户在 ASR 设置中选择阿里百炼 / DashScope 后遇到 `ASR transcription failed: 404`。当前实现把阿里百炼作为 OpenAI-compatible preset 处理，普通模式默认 `chunked-fallback` 会请求 `<Base URL>/audio/transcriptions`。用户提供的 Qwen-ASR 文档说明实时语音识别使用专用 WebSocket API，而不是 OpenAI `/audio/transcriptions` HTTP 转写接口。

Qwen-ASR 文档关键点：

- WebSocket URL：`wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=<model_name>`。
- `{WorkspaceId}` 必须替换为真实 Workspace ID。
- 鉴权在 WebSocket 握手请求头设置：`Authorization: Bearer <apiKey>`。
- 支持 VAD 和 Manual 模式；当前项目的录音按钮 / 设置页 10 秒测试更适合 Manual 模式。
- Manual 模式通过 `session.update` 将 `session.turn_detection` 设为 `null`，音频结束后发送 `input_audio_buffer.commit` 和 `session.finish`。
- 服务端以 `conversation.item.input_audio_transcription.text` 返回实时识别文本，以 `conversation.item.input_audio_transcription.completed` 返回最终文本。

## 目标

- 新增专用 Qwen-ASR realtime provider engine。
- 避免 Qwen-ASR 继续走 OpenAI-compatible `/audio/transcriptions` 路径。
- 设置页新增 Qwen-ASR 实时识别供应商预设。
- 支持 Workspace ID、API Key、模型和 Base URL 配置。
- 在主进程使用可传握手 headers 的 Node WebSocket 客户端。
- 保持 OpenAI-compatible ASR 行为不变。

## 非目标

- 不实现 Qwen-ASR VAD 模式。
- 不支持新加坡地域 UI 切换；本轮默认使用华北 2（北京）Workspace 专属域名，Base URL 仍可手动修改。
- 不新增长期音频存储。
- 不改变 renderer 录音交互、IPC channel 或 VoiceInputManager 主流程。

## 架构设计

新增 provider：

```txt
providerPreset: qwen-asr
provider: qwen-asr-realtime
```

新增引擎文件：

```txt
src/core/asr-qwen-realtime.ts
```

`createASREngine(config)` 根据 `config.provider` 分发：

```txt
openai-compatible  -> OpenAICompatibleASREngine
qwen-asr-realtime  -> QwenASRRealtimeEngine
```

主流程仍只依赖 `ASREngine.stream(input)`。`VoiceInputManager` 不需要知道 Qwen 协议细节。

## 配置设计

`ASRConfig` 新增：

```ts
workspaceId: string;
```

Qwen preset：

```txt
id: qwen-asr
label: Qwen-ASR 实时识别
provider: qwen-asr-realtime
baseUrl: wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com
realtimePath: /api-ws/v1/realtime
streamingMode: realtime
model: 用户填写
workspaceId: 用户填写
```

普通模式下，如果用户选择 Qwen-ASR，保存配置时必须保留 `provider: qwen-asr-realtime` 和 `streamingMode: realtime`，不能被普通模式默认的 `chunked-fallback` 覆盖。

## Qwen WebSocket 流程

1. 构造 URL：替换 Base URL 中的 `{WorkspaceId}`，拼接 `realtimePath`，并用 query 参数设置 `model`。
2. 创建 WebSocket 时传入 headers：
   - `Authorization: Bearer <apiKey>`
   - `X-DashScope-WorkSpace: <workspaceId>`
   - `user-agent: Project-Ze`
3. 连接打开后发送 Manual 模式 session update：

```json
{"type":"session.update","session":{"turn_detection":null}}
```

4. 每个音频 chunk 发送：

```json
{"type":"input_audio_buffer.append","audio":"<base64>"}
```

5. 音频结束后发送：

```json
{"type":"input_audio_buffer.commit"}
{"type":"session.finish"}
```

6. 将服务端事件归一化为项目 ASR transcript event：
   - `conversation.item.input_audio_transcription.text` -> `partial`
   - `conversation.item.input_audio_transcription.completed` -> `final`
   - `error` -> `error`

## 设置页设计

普通模式显示：

- 供应商预设（新增 Qwen-ASR 实时识别）
- Base URL
- Workspace ID（Qwen-ASR 必填）
- API Key
- 模型
- 语言
- 测试区

高级模式继续显示：

- 实际引擎
- Realtime Path
- Transcription Path
- 流式模式
- 缓存设置

Qwen-ASR 的提示文案说明它使用专用 WebSocket 协议，不会请求 OpenAI `/audio/transcriptions`。

## 错误处理

- Workspace ID 为空：返回 `Qwen-ASR Workspace ID is required`。
- 模型为空：返回 `Qwen-ASR model is required`。
- 握手失败：返回 `Qwen-ASR realtime connection did not open` 或底层 WebSocket error message。
- 服务端返回未知事件：忽略。
- 服务端返回无效 JSON：返回 recoverable error。

## 测试与验证

合同测试覆盖：

- `ASRConfig.workspaceId` 默认值为空字符串。
- `qwen-asr` preset 存在并映射到 `qwen-asr-realtime`。
- Qwen URL 构造会替换 Workspace ID 并添加 model query。
- Qwen headers 包含 Authorization 和 X-DashScope-WorkSpace。
- Manual session update 事件格式正确。
- Qwen text/completed 事件能归一化为 partial/final。
- `createASREngine()` 能返回 QwenASRRealtimeEngine。
- 设置页包含 Qwen-ASR 预设和 Workspace ID 输入框。

验证命令：

```bash
npm test
npm run build
git diff --check
```

## 验收标准

- 选择 Qwen-ASR 后不会再请求 `/audio/transcriptions`。
- 用户能填写 Workspace ID、API Key、模型并保存配置。
- Qwen-ASR 引擎使用 WebSocket handshake header 鉴权。
- 现有 OpenAI-compatible ASR 测试继续通过。
- 文档说明 Qwen-ASR 是专用 engine，不是 OpenAI-compatible preset。

## 自检

- 无 TBD/TODO 占位。
- 设计范围聚焦 Qwen-ASR realtime engine。
- 保持现有 ASR manager、IPC 和 renderer 录音交互不变。
- 配置、设置页、engine factory 和测试覆盖字段一致。
