# FunASR Local ASR Provider Design

日期：2026-07-16

## 背景

Project-Ze 已有语音输入基础设施：右键聊天输入框、麦克风按钮、hold-to-talk 快捷键、`VoiceInputManager`、`ASREngine.stream(...)` provider 抽象、设置页 ASR 普通/高级模式、以及 Qwen-ASR 实时识别 provider。

用户希望在“不调用第三方云 API”的前提下实现自由说话转文字，并指定优先尝试 `modelscope/FunASR`。本设计将 FunASR 作为本机 runtime 服务接入 Project-Ze，而不是把 FunASR Python/C++/ONNX 依赖直接嵌入 Electron 主程序。

## 目标

- 新增 `FunASR 本地识别` ASR provider preset。
- 通过本机 WebSocket 连接已启动的 FunASR runtime 服务，默认地址为 `ws://127.0.0.1:10096`。
- 支持自由说话转文字，识别结果进入现有聊天输入框。
- 复用现有麦克风按钮、hold-to-talk 快捷键、textarea partial/final 更新和 Enter 发送路径。
- 复用现有 `VoiceInputManager` 与 `ASREngine.stream(...)` 边界。
- 设置页明确说明：Project-Ze 第一版只负责连接 FunASR runtime，不负责安装、下载模型或启动服务。
- 设置页提供连接测试和 10 秒语音识别测试。
- 保持 Qwen-ASR 和 OpenAI-compatible ASR 行为不变。

## 非目标

- 不自动安装 Docker、Python、FunASR 或其 runtime 依赖。
- 不自动下载或管理 FunASR 模型。
- 不把 FunASR runtime 打包进 Electron 应用。
- 不实现 FunASR 服务生命周期管理、一键启动、重启或后台守护。
- 不新增唤醒词、声纹识别、说话人识别或情绪识别。
- 不替换现有 Qwen-ASR provider。
- 不默认连接远程 FunASR 服务；第一版推荐本机 `127.0.0.1` / `localhost`。

## 推荐方案

采用 **FunASR 本机 runtime provider**：

```txt
Renderer PCM recorder
  -> preload voiceInput IPC
  -> VoiceInputManager
  -> createASREngine(config)
  -> FunASRLocalEngine
  -> FunASR WebSocket runtime
  -> ASRTranscriptEvent partial/final/error
  -> renderer textarea
```

Project-Ze 只实现 FunASR WebSocket 客户端和协议归一化。FunASR 的模型选择、VAD、标点、2pass 策略和 runtime 部署由用户在 FunASR 服务端完成。

## 备选方案对比

| 方案 | 优点 | 缺点 | 决策 |
|---|---|---|---|
| FunASR 本机 runtime provider | 中文自由听写更合适；本机/离线；符合现有 `ASREngine`；不污染 Electron 依赖 | 需要用户手动启动服务；需要适配 WebSocket 协议 | 选择 |
| Windows 系统语音识别 helper | Windows-only 轻；无需模型服务 | 中文自由听写效果不确定；helper/API 细节需验证 | 后续 fallback |
| FunASR 深度内嵌 SDK | 用户体验更完整 | 打包、模型、依赖、进程管理复杂 | 不做第一版 |
| Web Speech API | 原型最快 | Electron 支持和隐私边界不稳定 | 不做正式路径 |

## Provider 与配置

新增 provider preset：

```txt
providerPreset: funasr-local
provider: funasr-local-runtime
label: FunASR 本地识别
baseUrl: ws://127.0.0.1:10096
streamingMode: realtime
language: zh
apiKey: 不需要
model: 不要求，由 FunASR runtime 服务端决定
```

配置兼容规则：

- `ASRConfig.provider` 增加 `funasr-local-runtime`。
- provider preset 增加 `funasr-local`。
- 选择 FunASR 时不校验 API Key。
- 选择 FunASR 时模型字段为可选；如果旧配置中存在模型值，可以保留但不参与客户端校验。
- Base URL 必须是 `ws://` 或 `wss://`。
- 第一版默认推荐 `ws://127.0.0.1:10096`。
- 如果用户填写非 localhost 地址，设置页应提示这是高级用法，需自行确保服务授权和网络安全。

## 设置页设计

普通模式新增供应商预设：`FunASR 本地识别`。

选择该预设后：

- 显示启用语音输入、供应商预设、Base URL、语言、识别完成后自动发送、测试连接、10 秒识别测试。
- API Key 字段不作为必填项；可隐藏、禁用或显示“不需要”。
- 模型字段不作为必填项；可隐藏、禁用或显示“由 FunASR runtime 服务端决定”。
- OpenAI transcription path、Qwen workspace 等 provider-specific 字段不参与普通模式配置。

设置页必须显示明确说明：

```txt
FunASR 本地识别不会调用云端 API，但需要你先在本机启动 FunASR runtime WebSocket 服务。

默认连接地址：
ws://127.0.0.1:10096

Project-Ze 第一版只负责连接该服务，不会自动安装 FunASR、下载模型或启动 Docker/Python 进程。

请先按 FunASR 文档启动 runtime 服务，然后点击“测试连接”或“测试语音识别 10 秒”。
```

## 音频输入策略

FunASR provider 使用现有 Qwen 主入口 PCM 快速修复中的 PCM16 采集路线：

- renderer 采集麦克风音频。
- 重采样为 16kHz。
- 编码为 PCM16 little-endian。
- chunk MIME 使用 `audio/pcm;rate=16000`。
- 通过现有 `voiceInput.appendAudioChunk(...)` IPC 发送。

OpenAI-compatible provider 继续保留现有 `MediaRecorder` webm/opus 路径。Qwen-ASR 继续使用已有 PCM16 路径。

## FunASRLocalEngine

新增 engine 文件建议：

```txt
src/core/asr-funasr-local.ts
```

职责：

- 根据 `ASRConfig.baseUrl` 建立 WebSocket 连接。
- 按 FunASR runtime WebSocket 协议发送开始参数、音频 chunk 和结束事件。
- 解析 FunASR 返回 JSON。
- 将识别结果归一化为项目现有 `ASRTranscriptEvent`：
  - 中间文本 -> `{ type: 'partial', text, sessionId }`
  - 最终文本 -> `{ type: 'final', text, sessionId }`
  - 连接、协议或服务端异常 -> `{ type: 'error', message, sessionId, recoverable }`
- 隐藏 FunASR 字段差异，不让 renderer 或 `VoiceInputManager` 依赖 FunASR 协议细节。

如果 FunASR runtime 返回字段在不同模式间存在差异，engine 内部应兼容常见字段，例如 `text`、`mode`、`is_final`、`timestamp` 或服务端错误字段。最终以实际服务联调结果为准，但对外事件类型保持稳定。

## 连接测试

设置页新增或复用连接测试能力：

1. 收集当前表单配置。
2. 如果 provider 是 `funasr-local-runtime`，校验 Base URL scheme 为 `ws://` 或 `wss://`。
3. 尝试建立 WebSocket 连接。
4. 连接成功后立即关闭，显示“FunASR 本地服务连接成功”。
5. 连接失败时显示可操作错误。

错误文案：

```txt
FunASR 本地服务连接失败：请确认 FunASR runtime 已启动，端口与 Base URL 一致，并且 WebSocket 服务可访问。
```

常见排查提示：

- 服务未启动。
- 端口不是 `10096`。
- Docker 未映射端口。
- 启动的是 offline 文件转写服务而不是 online/2pass WebSocket 实时服务。
- 防火墙阻止本机连接。

## 10 秒识别测试

设置页现有“测试语音识别 10 秒”继续复用：

1. 测试前保存当前表单配置，避免运行态仍读取旧配置。
2. FunASR provider 不要求 API Key 和模型。
3. 录音路径使用 PCM16 16kHz。
4. `VoiceInputManager` 选择 `FunASRLocalEngine`。
5. partial 文本可显示在测试区；final 文本作为测试结果。
6. 如果 10 秒内无 final，但有 partial，可以显示 partial 并提示服务未返回最终结果。

## 错误处理

- Base URL 为空：提示“FunASR Base URL 不能为空”。
- Base URL 非 WebSocket：提示“FunASR Base URL 必须以 ws:// 或 wss:// 开头”。
- WebSocket 连接失败：显示 FunASR 本地服务连接失败文案。
- 服务端返回无效 JSON：返回 recoverable error，并保留日志用于诊断。
- 服务端断连：如果已有 partial，保留 partial 文本；否则显示连接中断。
- 识别结束但无文本：提示“FunASR 未返回识别文本，请确认服务模式、音频格式和模型配置”。

## 安全与隐私

- 默认只推荐连接本机 `127.0.0.1` / `localhost`。
- FunASR provider 不发送 API Key。
- 原始音频仍遵循现有短期音频缓存策略，不新增长期存储。
- Project-Ze 不负责 FunASR 服务端访问控制；如果用户填写远程地址，设置页应提示该服务可能接收麦克风音频。
- 识别后的文本进入现有聊天输入路径，并按现有聊天历史/IntentRouter 规则处理。

## 文档更新

实现时需要更新：

- `PROJECT_INDEX.md`：记录新增 FunASR 本地 ASR provider、默认连接方式和不内置 runtime 的边界。
- `VERSION.md`：Unreleased 增加 FunASR 本地识别记录。
- `docs/qwen-asr-configuration.md` 或新增 `docs/funasr-local-asr.md`：说明 FunASR 本地服务启动前提、默认地址、设置页字段和常见排查。

## 测试与验证

自动验证：

```bash
npm test
npm run build
git diff --check
```

合同测试建议覆盖：

- ASR provider presets 包含 `funasr-local`。
- `funasr-local` 映射到 `funasr-local-runtime`。
- FunASR preset 默认 Base URL 为 `ws://127.0.0.1:10096`。
- FunASR provider 不要求 API Key。
- FunASR provider 不要求模型。
- `createASREngine()` 能创建 `FunASRLocalEngine`。
- 设置页包含 FunASR 本地识别说明文案。
- FunASR 主聊天路径使用 `audio/pcm;rate=16000`。

手动验证：

1. F11 打开设置页，选择 `FunASR 本地识别`。
2. 确认设置页显示“需先手动启动 FunASR runtime”的说明。
3. 未启动 FunASR 服务时，连接测试显示可操作错误。
4. 启动 FunASR runtime 服务后，连接测试成功。
5. 10 秒识别测试可以显示中文识别结果。
6. 主聊天麦克风按钮和 hold-to-talk 均能将 final 文本写入 textarea。
7. Qwen-ASR 和 OpenAI-compatible ASR 行为不变。

## 验收标准

- 用户可以在设置页选择 `FunASR 本地识别`。
- 设置页明确说明 Project-Ze 不会自动安装、下载模型或启动 FunASR。
- 未填写 API Key 和模型时，FunASR provider 仍可保存配置并运行测试。
- FunASR provider 连接本机 WebSocket runtime 并产出 partial/final 文本。
- 识别结果复用现有聊天输入路径，不新增独立语音聊天面板。
- 自动测试、构建和 diff 检查通过。

## 自检

- 无 TBD/TODO 占位。
- 设计范围聚焦 FunASR 本机 runtime provider，不包含自动部署 FunASR。
- 配置、设置页、音频格式、错误处理和测试边界明确。
- 与现有 VoiceInputManager、ASREngine、麦克风按钮和 hold-to-talk 设计兼容。
- Qwen-ASR 与 OpenAI-compatible provider 行为保持不变。
