# TTS 测试错误提示设计

日期：2026-07-15

## 背景

设置页“测试语音”失败时，当前只显示泛化的 `TTS 连接失败`。阿里云百炼实际返回的错误码和错误信息只出现在主进程控制台里，例如 `AllocationQuota.FreeTierOnly` 或 `InvalidParameter: Model not exist`，用户无法在设置界面直接判断是额度、模型、音色、权限还是地址问题。

根因是供应商引擎的 `test()` 方法吞掉了 `synthesize()` 抛出的详细错误，只返回 `false`。`TTSManager.test()` 本身已经支持把捕获到的异常返回给设置页。

## 目标

1. 设置页测试语音失败时显示具体错误原因。
2. 阿里云错误优先显示 HTTP 状态码、阿里云错误 code 和 message。
3. 不改变正常 TTS 播放链路。
4. 不改变设置页 UI 结构。
5. 保持其它 TTS 引擎行为不变。

## 设计

### 阿里云错误格式化

在 `TTSAliyun` 内新增一个私有方法，负责把非 2xx 响应转换为用户可读错误：

- 如果响应 body 是 JSON，并包含 `code` 或 `message`，格式化为：
  `阿里云 TTS 请求失败 (403): AllocationQuota.FreeTierOnly - The free quota has been exhausted...`
- 如果响应 body 不是 JSON，保留原始文本：
  `阿里云 TTS 请求失败 (403): <raw body>`
- 如果响应 body 为空，显示：
  `阿里云 TTS 请求失败 (403)`

### 测试错误透传

把 `TTSAliyun.test()` 从吞错误改成透传错误：

```ts
async test(): Promise<boolean> {
  await this.synthesize('测试');
  return true;
}
```

这样 `TTSManager.test()` 的现有 catch 会返回：

```ts
{ success: false, message: 'TTS 测试失败: ' + error.message }
```

设置页现有 toast 会直接显示这段 message。

## 影响范围

预计只修改：

- `src/core/tts-aliyun.ts`

不修改：

- `src/core/tts-manager.ts`
- `src/main/settings.html`
- `src/core/tts-engine.ts`
- renderer 播放链路

## 验证

1. 运行 `npm run build`。
2. 确认阿里云 `test()` 不再吞异常。
3. 确认 `response.ok === false` 时错误信息包含 HTTP 状态码。
4. 对阿里云 JSON 错误，错误信息包含 `code` 和 `message`。

## 成功标准

设置页“测试语音”失败时，不再只显示 `TTS 连接失败`，而是显示类似：

```text
TTS 测试失败: 阿里云 TTS 请求失败 (403): AllocationQuota.FreeTierOnly - The free quota has been exhausted...
```

## 自检

- 无占位符。
- 范围聚焦在测试错误提示。
- 不改动播放链路。
- 不影响其它 TTS 引擎。
