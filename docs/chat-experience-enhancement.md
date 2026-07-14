# Chat Experience Enhancement

本阶段增强桌面伙伴的聊天输入与处理反馈，目标是让用户知道“消息已发送 / 正在处理 / 正在看屏幕 / 播放回复中”，同时保持主窗口轻量，不引入新的聊天面板。

## User interaction

- 右键伙伴打开聊天输入框。
- `Enter` 发送消息。
- `Ctrl+Enter` 在多行输入框中换行。
- `Esc` 关闭输入框。
- 消息发送后输入框自动收起，并显示轻量状态提示。

## Runtime status flow

主进程通过 IPC 向渲染进程发送聊天状态：

```txt
ChatManager
  → mainWindow.webContents.send('chat-status', { phase, message })
  → preload exposes window.companion.onChatStatus(...)
  → renderer updates #chat-status
```

当前状态：

- `idle`：空闲或短暂提示。
- `thinking`：普通聊天已发送，AI 正在回复。
- `screen`：`.` 开头的屏幕分析请求正在执行。
- `speaking`：TTS 模式下正在按顺序播放回复。
- `busy`：上一条消息仍在处理。
- `error`：配置缺失或调用失败。

## Files

- [src/core/chat-manager.ts](../src/core/chat-manager.ts)：新增 `sendChatStatus`，在聊天生命周期关键阶段发出状态。
- [src/main/preload.ts](../src/main/preload.ts)：暴露 `onChatStatus`。
- [src/renderer/index.html](../src/renderer/index.html)：聊天输入改为多行 `textarea`，新增状态节点。
- [src/renderer/renderer.ts](../src/renderer/renderer.ts)：新增输入发送体验与状态渲染逻辑。
- [src/renderer/style.css](../src/renderer/style.css)：新增聊天状态胶囊样式。

## Boundaries

本阶段不改变 AI 提示词、不改变记忆策略、不新增聊天窗口；只增强现有右键输入和气泡式聊天的即时反馈。
