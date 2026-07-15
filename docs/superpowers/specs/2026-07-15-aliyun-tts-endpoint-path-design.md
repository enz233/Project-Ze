# 阿里云百炼 TTS 接口路径可配置设计

日期：2026-07-15

## 背景

当前项目的阿里云百炼 TTS 无法正常使用。历史版本曾支持阿里云 TTS；当前重构后的实现保留了供应商引擎边界，但默认 `aliyunBaseURL` 误设为 OpenAI compatible `chat/completions` 地址，导致现有 `tts-aliyun.ts` 拼接后得到错误 URL。

用户希望继续支持阿里云 vd / 设计音色模型，同时不要依赖找不到文档入口的旧接口。最终选择：把阿里云 TTS 的 endpoint path 做成可配置项，默认走新版 DashScope MultiModalConversation 非实时语音合成接口。

## 目标

1. 修复当前阿里云 TTS 默认不可用的问题。
2. 默认使用新版非实时 Qwen-TTS / MultiModalConversation HTTP 接口。
3. 支持配置 `qwen3-tts-vd-2026-01-26` 等 vd 模型和自定义设计音色 ID。
4. 保留 endpoint path 可配置能力，便于用户在本地尝试官方旧路径或专属路径。
5. 不改动 `TTSManager`、renderer 播放链路、队列和字幕逻辑。

## 非目标

1. 本次不实现 WebSocket 实时 TTS。
2. 本次不改造 renderer 以支持 PCM 流式播放。
3. 本次不引入新的 TTS mode，例如 `aliyun-realtime`。
4. 本次不保证旧 `text2audio/generation` 接口仍可用，只提供可配置路径让用户自行验证。

## 配置设计

在 `TTSConfig` 增加字段：

```ts
aliyunEndpointPath: string;
```

默认值：

```ts
aliyunBaseURL: 'https://dashscope.aliyuncs.com/api/v1',
aliyunEndpointPath: '/services/aigc/multimodal-generation/generation',
aliyunModel: 'qwen3-tts-flash',
aliyunVoice: 'Cherry',
aliyunLanguage: 'auto',
```

vd 模型用法：

```json
{
  "mode": "aliyun",
  "aliyunBaseURL": "https://dashscope.aliyuncs.com/api/v1",
  "aliyunEndpointPath": "/services/aigc/multimodal-generation/generation",
  "aliyunModel": "qwen3-tts-vd-2026-01-26",
  "aliyunVoice": "实际设计音色ID"
}
```

如果用户要尝试历史路径，可手动改为：

```json
{
  "aliyunEndpointPath": "/services/aigc/text2audio/generation"
}
```

## 请求设计

`tts-aliyun.ts` 根据 `aliyunBaseURL + aliyunEndpointPath` 生成最终 URL。拼接时需要兼容：

- `aliyunBaseURL` 末尾带 `/` 或不带 `/`；
- `aliyunEndpointPath` 开头带 `/` 或不带 `/`；
- 用户误把完整 endpoint 填进 path 的情况不作为主要目标，但应尽量避免生成双斜杠。

默认完整请求地址为：

```text
POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
```

请求头：

```http
Content-Type: application/json
Authorization: Bearer <aliyunApiKey>
```

请求体：

```json
{
  "model": "qwen3-tts-flash",
  "input": {
    "text": "要合成的文本",
    "voice": "Cherry"
  }
}
```

如果 `aliyunLanguage !== 'auto'`，追加：

```json
{
  "input": {
    "language_type": "Chinese"
  }
}
```

不再默认发送未在当前文档片段中明确需要的 `parameters.format`，避免服务端因未知参数拒绝请求。

## 返回处理

沿用现有返回处理逻辑：

1. 如果 `output.audio.data` 存在，校验并规范化 base64 后直接返回；
2. 如果 `output.audio.url` 存在，下载完整音频文件并转为 base64 返回；
3. 如果两者都不存在，抛出“阿里云 TTS 未返回音频数据/返回格式异常”。

错误响应保留服务端 response body，方便定位 API Key、模型、音色、路径或权限问题。

## 设置页设计

在阿里云百炼 TTS 配置区增加一个文本框：

- 标签：`接口路径`
- 默认值：`/services/aigc/multimodal-generation/generation`
- 提示：`默认新版 MultiModalConversation；如需尝试历史接口可填 /services/aigc/text2audio/generation`

同时把 `API 地址` 占位符更新为：

```text
https://dashscope.aliyuncs.com/api/v1
```

模型下拉继续保留自定义输入，用户可填 vd 模型名。音色下拉继续保留自定义输入，用户可填设计音色 ID。

## 影响范围

预计修改文件：

- `src/core/tts-config.ts`
- `src/core/tts-aliyun.ts`
- `src/config/tts.example.json`
- `src/main/settings.html`

不修改：

- `src/core/tts-manager.ts`
- `src/core/tts-engine.ts`
- `src/main/preload.ts`
- `src/renderer/renderer.ts`

## 测试与验证

1. 运行 TypeScript 编译或项目现有检查命令，确认类型通过。
2. 检查默认配置和 example 配置一致。
3. 在设置页确认阿里云区域能加载、保存 `aliyunEndpointPath`。
4. 使用测试 TTS 按钮验证：
   - 默认 `qwen3-tts-flash + Cherry`；
   - 自定义 `qwen3-tts-vd-2026-01-26 + 设计音色ID`；
   - 如需要，手动切换 `aliyunEndpointPath` 到历史路径验证。

## 成功标准

1. 新安装或无本地 TTS 配置时，默认阿里云 Base URL 为 `https://dashscope.aliyuncs.com/api/v1`。
2. 默认 endpoint path 为 `/services/aigc/multimodal-generation/generation`。
3. 用户能在设置页修改 endpoint path。
4. 阿里云引擎最终请求 URL 可预测、无错误拼接。
5. vd 模型和设计音色 ID 能通过现有自定义模型/自定义音色字段配置。
6. 当前 TTS 播放、字幕、队列和停止行为保持不变。

## 自检

- 无 TBD/TODO 占位。
- 设计范围聚焦在阿里云非实时 HTTP TTS 修复，不包含 WebSocket 实时 TTS。
- 默认接口与用户提供的非实时 Qwen-TTS 文档一致。
- 旧接口不作为承诺功能，只作为可配置路径供尝试。
