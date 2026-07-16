# Qwen-ASR 实时语音识别配置说明

日期：2026-07-16

本文说明 Project-Ze 中阿里云百炼 Qwen-ASR 实时语音识别的配置方式、运行路径和常见排查点。

## 什么时候选择 Qwen-ASR 实时识别

在设置页的“语音输入（ASR）”中，阿里云相关入口有两个含义不同的预设：

- **阿里百炼 / DashScope**：保留给 OpenAI-compatible 风格接口，会走 `/audio/transcriptions`，不适用于 Qwen-ASR 实时语音识别 WebSocket API。
- **Qwen-ASR 实时识别**：使用项目内专用 `qwen-asr-realtime` 引擎，会通过 WebSocket 连接阿里云百炼 Qwen-ASR 实时识别接口。

如果你要使用本文开头提到的 Qwen-ASR 实时语音识别 WebSocket API，请选择 **Qwen-ASR 实时识别**，不要选择“阿里百炼 / DashScope”。

## 设置页填写方式

F11 打开设置页，进入“语音输入（ASR）”：

1. 勾选 **启用语音输入**。
2. **供应商预设** 选择 `Qwen-ASR 实时识别`。
3. **Base URL** 保持默认：

   ```txt
   wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com
   ```

   一般不需要手动把 `{WorkspaceId}` 替换掉；项目运行时会用下面的 Workspace ID 字段替换。

4. **Workspace ID** 填写阿里云百炼业务空间 ID，例如：

   ```txt
   ws-xxxxxxxx
   ```

5. **API Key** 填写阿里云百炼 / DashScope API Key。项目会在 WebSocket 握手请求头中发送：

   ```txt
   Authorization: Bearer <API Key>
   X-DashScope-WorkSpace: <Workspace ID>
   ```

6. **模型** 填写阿里云文档中可用的 Qwen-ASR 模型名，例如你的业务空间开通的实时 ASR 模型名。
7. **语言** 默认 `zh` 即可。
8. 高级 ASR 设置通常保持关闭；如果打开，确认：
   - 实际引擎：`Qwen-ASR Realtime`
   - Realtime Path：`/api-ws/v1/realtime`
   - 流式模式：`Realtime`
9. 点击 **保存语音输入设置**。
10. 使用“测试语音识别 10 秒”验证。

## 实际请求形态

项目会构造如下 WebSocket URL：

```txt
wss://<Workspace ID>.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=<模型名>
```

连接打开后使用 Manual 模式：

```json
{"type":"session.update","session":{"turn_detection":null}}
```

录音 chunk 会以 `input_audio_buffer.append` 发送，录音结束后发送：

```json
{"type":"input_audio_buffer.commit"}
{"type":"session.finish"}
```

服务端的：

- `conversation.item.input_audio_transcription.text` 会显示为实时 partial 文本。
- `conversation.item.input_audio_transcription.completed` 会作为最终识别结果。

## 本轮排查结论

已确认当前实现的基本链路是对的：

- 配置中已有 `qwen-asr-realtime` provider。
- 设置页已有 `Qwen-ASR 实时识别` 预设和 Workspace ID 字段。
- 引擎会使用 `ws` Node WebSocket 客户端，并在握手时携带 `Authorization` 请求头。
- `npm test` 和 `npm run build` 均可通过。

发现并修复的问题：Qwen-ASR 最终 `completed` 事件可能在客户端发送 `session.finish` 后超过 1 秒才返回。原先引擎只等待 1 秒，可能导致测试区显示空结果或“未识别到文字”。现在等待窗口调整为 15 秒，并补充了合同测试覆盖延迟 final 事件。

## 常见错误排查

### 显示 `fetch failed`

如果 Base URL 是 `wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`，但供应商预设仍选择 **阿里百炼 / DashScope**，项目会使用 OpenAI-compatible 引擎去 `fetch()` 一个 WebSocket 地址，常见表现就是 `fetch failed`。

修复方式：供应商预设改为 **Qwen-ASR 实时识别**，然后确认实际引擎为 `Qwen-ASR Realtime`。

### 仍然出现 `/audio/transcriptions` 或 404

通常是选错了预设。请确认：

- 供应商预设是 `Qwen-ASR 实时识别`。
- 高级设置里的实际引擎是 `Qwen-ASR Realtime`。
- 不要用 `阿里百炼 / DashScope` 预设调用 Qwen-ASR 实时识别。

### 缺少 Workspace ID

设置页会提示缺少 Workspace ID。填写阿里云百炼业务空间 ID 后保存。

### 401 / 403 / 连接打不开

优先检查：

- API Key 是否来自同一个阿里云账号/业务空间。
- Workspace ID 是否正确。
- 模型名是否在该业务空间可用。
- Base URL 是否仍是 `wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`。
- 当前网络是否能访问阿里云百炼 WebSocket 服务。

### 显示“未识别到文字”或服务端结束但没有文本

如果连接、录音和结束流程都显示成功，但服务端没有返回 `conversation.item.input_audio_transcription.text`，或返回了空的 `conversation.item.input_audio_transcription.completed`，项目现在会显示可操作错误：

```txt
Qwen-ASR 已结束但未返回识别文本：请确认麦克风有声音、录音格式被模型支持，或查看阿里云侧错误事件。
```

排查顺序：

1. 测试时确认“正在录音测试，请说话…”期间音量条有明显变化；测试结束后音量显示回到 0% 是正常的。
2. 确认系统输入设备不是静音、不是错误麦克风。
3. 设置页的 Qwen-ASR 识别测试和主聊天 Qwen-ASR 语音输入都会绕过浏览器 `MediaRecorder` 的 `audio/webm;codecs=opus`，改用 Web Audio 采集并发送 `audio/pcm;rate=16000` PCM16 小端音频，避免实时 ASR 模型因 webm/opus 不兼容而只结束会话、不返回文本。
4. 如果音量正常且仍无文本，查看日志中的 Qwen-ASR 服务端错误事件，确认是否返回模型、权限或更细的音频格式要求。

## 相关本地 ASR 方案

如果你希望使用本机 FunASR runtime，而不是阿里云 Qwen-ASR WebSocket 服务，请查看 `docs/funasr-local-asr.md`。FunASR 本地识别不要求 API Key 或模型字段，但需要你先手动启动 FunASR runtime 服务。
