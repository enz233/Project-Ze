# Qwen-ASR Lightweight PCM Fix Design

日期：2026-07-16

## 背景

当前 Qwen-ASR 实时识别已经使用专用 `qwen-asr-realtime` WebSocket 引擎，不再走 OpenAI-compatible `/audio/transcriptions`。最近修复也已经覆盖了 delayed final、empty completed 和 settings 测试区的 PCM16 采集。

剩余风险在主聊天语音输入入口：renderer 普通录音仍使用 `MediaRecorder` 生成 `audio/webm;codecs=opus`。Qwen-ASR 实时模型更适合直接接收 PCM16 16kHz 音频；设置页测试已改为 PCM16 后，主入口仍可能出现连接正常但最终无文本。

用户要求本轮轻量快速上线，因此本设计只修复最可能影响真实使用的 Qwen 主入口音频格式，不做大范围重构。

## 目标

- Qwen-ASR 主聊天语音输入发送 `audio/pcm;rate=16000` PCM16 小端音频。
- OpenAI-compatible ASR 继续使用现有 `MediaRecorder` webm/opus 路径。
- 尽量复用设置页测试中已经验证过的 PCM 采集逻辑。
- 不修改 ASR IPC、VoiceInputManager、ASR engine factory 或 OpenAI provider 行为。
- 补充轻量合同测试和文档，快速上线。

## 非目标

- 不引入 ffmpeg 或后端转码依赖。
- 不实现 Qwen VAD 模式。
- 不重构 renderer 录音模块为共享库。
- 不改设置页测试流程。
- 不新增长期音频缓存或诊断面板。

## 方案

采用轻量分支策略：主聊天开始录音时读取 ASR 配置，如果 `config.provider === 'qwen-asr-realtime'`，走 Qwen PCM recorder；否则保留现有 MediaRecorder recorder。

### Qwen PCM recorder

在 renderer 主聊天语音输入附近新增少量 helper：

- 判断 Qwen 配置。
- 使用 Web Audio 创建 `AudioContext`、`MediaStreamSource`、`ScriptProcessorNode`。
- 将 Float32 samples 重采样到 16000Hz。
- 编码为 PCM16 little-endian base64。
- 每约 250ms flush 一段 chunk，通过现有 `window.companion.voiceInput.appendAudioChunk(...)` 发送。
- chunk 使用 `mimeType: 'audio/pcm;rate=16000'`。
- stop 时强制 flush 最后一段，关闭 AudioContext，断开节点，并停止麦克风 track。

### OpenAI-compatible 保持不变

非 Qwen provider 继续使用现有：

- `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')` 优先。
- `voiceRecorder.start(750)`。
- `audio/webm` chunk 上传逻辑不变。

## 错误处理

- 浏览器不支持 Web Audio 时，Qwen 路径显示“当前环境不支持 Qwen-ASR PCM 音频采集”。
- append PCM chunk 失败时沿用现有状态提示模式，显示“语音 PCM 分片发送失败”。
- 停止/取消时释放本地音频资源，避免麦克风占用。
- Qwen 服务端仍无文本时，继续使用现有 Qwen-ASR empty completion 错误提示。

## 测试与验证

合同测试轻量覆盖：

- renderer 包含 Qwen 主聊天 PCM recorder 判断。
- Qwen 主聊天路径发送 `audio/pcm;rate=16000`。
- OpenAI-compatible 路径仍包含 `MediaRecorder` webm/opus。

验证命令：

```bash
npm test
npm run build
git diff --check
```

## 文档更新

- 更新 `docs/qwen-asr-configuration.md`：说明设置页测试和主聊天 Qwen 路径都会发送 PCM16 16kHz。
- 更新 `PROJECT_INDEX.md`：记录 Qwen-ASR 主入口 PCM 快速修复。
- 更新 `VERSION.md`：Unreleased 增加本次修复说明。

## 验收标准

- 选择 Qwen-ASR 实时识别后，主聊天语音输入不再上传 webm/opus chunk。
- 主聊天 Qwen-ASR 上传 PCM16 16kHz chunk。
- OpenAI-compatible ASR 行为不变。
- `npm test`、`npm run build`、`git diff --check` 通过。

## 自检

- 无 TBD/TODO 占位。
- 范围聚焦轻量快速上线。
- 不改变既有 ASR 架构边界。
- 修复路径与现有设置页 Qwen PCM 测试行为一致。
