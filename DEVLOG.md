# Quiet Companion 开发日志

## 2026-07-16 Camera background awareness runtime

- Moved camera background low-frequency detection out of the settings page timer and into a runtime background runner.
- The main process now syncs background detection start/stop when camera awareness config changes.
- The renderer still owns camera access and one-frame capture; the core manager still owns presence state transitions.
- Returned reactions only fire on stable `absent -> present` transitions and still go through proactive bubble cooldown gates.
- Added terminal debug output after each background camera detection, showing frame presence, confidence, stable state, reason, and source.

## 2026-07-16 Camera prompt command

- Added a chat command path that mirrors the existing `.` screen-analysis trigger: messages starting with `*` request one camera frame.
- The renderer owns camera permission and single-frame capture, then returns a 320px JPEG frame to the main process.
- The main process keeps AI analysis in `VisionImageAnalyzer`; `ChatManager` only recognizes the `*` command and shows the returned bubble.
- `*` with no extra text asks Ze for a short greeting. Text after `*` is used as the camera-frame prompt.

## v0.2.1 (2026-05-30)

### 今日完成

**AI 记忆系统**
- 对话历史持久化到 `chat-history.json`，重启不丢失
- 每累积 50 条对话，自动用 AI 生成长期记忆摘要
- 摘要注入系统提示词，AI 能"记住"用户偏好
- 设置窗口可查看历史条数和记忆摘要，支持清空

**情感前缀**
- 根据当前状态给 AI 消息加情感上下文（如 lonely 时加"你现在很孤单"）
- 状态切换后 4 秒内保持上一个状态的提示词，避免刚切换就对话的违和感

**AI 个性化问候**
- 启动时先显示固定问候（时间感知），3 秒后 AI 生成带时间/日期的个性化问候
- 问候融入长期记忆（如"上次聊的那个话题后来怎么样了？"）

**气泡独立化**
- 气泡从 companion 内部移出，使用 `position: fixed` 独立定位
- 人物晃动/呼吸/倾斜动画不再影响气泡

**交互优化**
- 右键打开对话输入框（避免与左键拖拽冲突）
- mousedown 加 `e.button !== 0` 检查，右键不触发拖拽

### Bug 修复
- 修复用户消息在 AI 请求中重复的问题
- 修复右键触发拖拽状态的问题
- 修复 `stopSleepAnim` 用 `clearInterval` 清 `setTimeout` 的问题
- 修复 `isLonelyAction` 状态变化时不会重置
- 修复 IPC 监听器重复注册
- 修复 PowerShell 活动监视命令引号嵌套问题
- 修复设置窗口可重复打开

### 技术笔记
- 日志系统：`src/core/logger.ts`，渲染进程 console 自动转发到文件
- 摘要是异步后台执行的，不阻塞用户对话
- 情感前缀不保存到历史，只影响当次 AI 回复

### 下一步
- 中优先级 bug 修复（blink isBlinking 阻塞、气泡淡出 timeout 等）
- 活动监视改用更可靠的前台窗口检测方式
- 考虑加入语音合成（VITS）或更多交互方式
