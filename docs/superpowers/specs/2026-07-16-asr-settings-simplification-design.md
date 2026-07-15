# ASR 设置简化设计

日期：2026-07-16

## 背景

当前语音输入（ASR）设置页暴露了较多 provider、Base URL、Realtime Path、Transcription Path、流式模式和缓存字段。它们来自早期“OpenAI-compatible + realtime + fallback + provider presets”的扩展设计，但普通用户只想启用语音输入并完成一次识别测试。

近期手动测试暴露了两个体验问题：

1. 用户勾选启用但未保存时，设置页表单验证通过，主进程仍读取旧配置并报 `Voice input is disabled`。
2. 默认或误选 `realtime` 时，当前服务商、模型或网络不支持 Realtime WebSocket，会报 `ASR realtime connection did not open`，用户难以判断应改什么。

本轮目标是收敛设置页体验：普通模式隐藏高级调用细节，保留一个“显示高级 ASR 设置”开关给需要自定义 endpoint/protocol 的用户。

## 目标

- 默认让语音输入设置页只显示普通用户必须填写的字段。
- 新增“显示高级 ASR 设置”开关，关闭时隐藏 provider/path/streaming/cache 等复杂字段。
- 普通模式默认使用更稳定的 `chunked-fallback`，避免测试识别默认进入 Realtime WebSocket。
- 识别测试启动前保存当前有效表单配置，避免页面状态和主进程运行态配置不一致。
- Realtime 失败时给出面向用户的可操作错误提示。
- 更新项目文档，说明普通/高级 ASR 设置边界。

## 非目标

- 不新增专用阿里百炼 / DashScope ASR engine。
- 不验证或承诺任何第三方模型支持 OpenAI Realtime WebSocket。
- 不移除现有 ASR engine、provider preset、realtime path 或 cache 配置字段。
- 不改变主聊天输入的录音按钮和 hold-to-talk 交互。
- 不改变运行态配置文件位置：仍为 Electron `userData/config/asr.json`。

## 用户界面设计

### 普通模式（默认）

语音输入页默认显示：

- 启用语音输入
- API Key
- 模型
- 语言
- 识别完成后自动发送
- 语音输入测试区域：麦克风音量测试、10 秒语音识别测试、进度和结果
- “显示高级 ASR 设置”复选框

普通模式隐藏：

- 供应商预设
- 实际引擎
- Base URL
- Realtime Path
- Transcription Path
- 流式模式
- 缓存设置

### 高级模式

勾选“显示高级 ASR 设置”后显示上述隐藏字段。高级模式用于：

- 自定义 OpenAI-compatible endpoint。
- 阿里百炼 / DashScope 或其他第三方兼容服务。
- 手动调整 `realtime` / `chunked-fallback`。
- 调整 transcription/realtime path。
- 调整短期音频缓存参数。

### 普通模式默认值

高级设置关闭时，保存或测试前应将隐藏字段补成稳定默认值：

```txt
providerPreset: openai
provider: openai-compatible
baseUrl: https://api.openai.com/v1
realtimePath: /realtime
transcriptionPath: /audio/transcriptions
streamingMode: chunked-fallback
cache.enabled: true
cache.retentionMinutes: 30
cache.maxSessionBytes: 10485760
```

其中 `streamingMode: chunked-fallback` 是刻意选择：设置页 10 秒识别测试优先使用普通转写路径，避免用户在不了解 Realtime 协议限制时遇到 WebSocket 握手失败。

## 数据流

### 加载设置

1. 设置页调用 `window.companion.loadASRConfig()`。
2. 填充普通字段和高级字段。
3. 根据配置中的高级开关状态决定是否显示高级区域。
4. 如果旧配置没有高级开关字段，默认关闭高级模式。

### 保存设置

1. `collectASRConfig()` 收集普通字段。
2. 如果高级开关关闭，使用普通模式默认值覆盖隐藏字段。
3. 如果高级开关打开，读取并保存高级字段。
4. 保持现有校验：启用 ASR 时必须有 API Key 和模型；高级模式下如果 Base URL 为空也要提示。
5. 调用 `window.companion.saveASRConfig(config)`，让主进程和其他窗口拿到最新运行态配置。

### 语音识别测试

1. 点击“测试语音识别 10 秒”。
2. 收集当前表单配置。
3. 校验启用状态、API Key、模型以及必要 endpoint 字段。
4. 校验通过后，先调用 `saveASRConfig(config)` 并等待返回。
5. 再调用 `window.companion.voiceInput.start({ source: 'settings-test', mimeType })`。
6. 这样主进程 `VoiceInputManager` 读取到的就是刚保存的配置，不会再因为旧配置 `enabled: false` 报错。

## 错误处理

- 未启用：显示“语音输入未开启：请先勾选启用语音输入”。
- 缺少 API Key / 模型：显示缺失字段列表。
- 普通模式下隐藏 Base URL，因此不要求用户填写 Base URL。
- 高级模式下 Base URL 为空：提示“高级 ASR 设置缺少 Base URL”。
- Realtime WebSocket 未打开：将底层 `ASR realtime connection did not open` 映射为：

```txt
实时识别连接失败：当前服务商、模型或网络可能不支持 Realtime WebSocket。可关闭高级 ASR 设置，或将流式模式改为 chunked-fallback 后重试。
```

底层日志可以继续保留原始错误，便于开发者诊断。

## 配置兼容性

为了不破坏旧配置，新增字段应是可选/有默认值的。例如：

```ts
advancedSettingsEnabled?: boolean;
```

加载旧 `asr.json` 时，如果没有该字段，视为 `false`。

保存新配置时写入该字段。普通模式关闭时仍保存隐藏字段的默认值，保证主进程不需要知道 UI 模式。

## 测试与验证

自动验证：

- `npm test`
- `npm run build`

合同测试应覆盖：

- ASR 默认配置包含 `advancedSettingsEnabled: false`。
- 普通模式默认流式模式为 `chunked-fallback`，或设置页保存普通模式时会写入 `chunked-fallback`。
- 设置页 HTML 包含“显示高级 ASR 设置”开关和高级区域标识。

手动验证：

1. F11 打开设置页，语音输入页默认只显示普通字段。
2. 高级字段默认不可见。
3. 勾选“显示高级 ASR 设置”后，高级字段出现。
4. 关闭高级设置，填写 API Key / 模型并保存，配置可保存成功。
5. 直接点击“测试语音识别 10 秒”会先保存当前表单配置，不再报 `Voice input is disabled`。
6. 高级模式选择 realtime 且连接失败时，显示可操作的 Realtime 失败提示。

## 文档更新

实现时需要更新：

- `PROJECT_INDEX.md`：说明 ASR 设置页默认隐藏高级 provider/path/streaming/cache 字段。
- `VERSION.md`：Unreleased 增加 ASR 设置简化记录。
- 如 README 提到 ASR provider presets，应保持其属于 Unreleased/高级设置增强的边界说明。

## 验收标准

- 普通用户可以不理解 Base URL、Path、Realtime，也能完成 ASR 基础配置与识别测试。
- 高级用户仍能打开高级设置，配置第三方 OpenAI-compatible endpoint 或 realtime。
- 识别测试不会再因为“表单已启用但未保存”触发 `Voice input is disabled`。
- 普通模式默认不走 Realtime WebSocket。
- 测试和构建通过。

## 自检

- 无 TBD/TODO 占位。
- 设计范围聚焦设置页简化和错误提示，不新增 ASR provider。
- 普通模式与高级模式的字段边界明确。
- 配置兼容性明确：旧配置默认高级设置关闭。
- 测试与文档更新范围明确。
