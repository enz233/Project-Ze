# Screen Pointer Stability 轻量屏幕变化判定设计

日期：2026-07-15

## 背景

Screen Target Pointer 已能通过 `.` 显式屏幕分析请求定位目标、移动桌宠并显示指向差分。运行日志显示目标定位和坐标换算主链路已跑通，但当前屏幕变化判定仍偏弱：

- 前台窗口标题在当前环境中经常为空字符串，单靠标题变化无法可靠判断屏幕是否变化。
- 最常见的目标失效场景是用户在定位、移动或指向期间滚动页面。
- 截图指纹可以检测更多内容变化，但需要小心避免把桌宠自身移动、动画或遮挡误判成屏幕变化。

因此本设计先做一个轻量版本：**窗口上下文检测 + 鼠标滚轮检测**。截图指纹只作为后续增强方向记录，不在本轮实现。

## 目标

1. 在屏幕目标指示 session 期间，如果用户滚动页面，及时取消旧指向。
2. 保留现有前台窗口变化检测，作为窗口切换/标题变化的轻量保护。
3. 不引入持续截图监控，不在本轮实现截图指纹。
4. 避免桌宠自身移动或 point visual 变化触发误取消。
5. 保持第一版边界：不自动点击、不自动滚动、不自动重试、不处理普通聊天自然语言触发。

## 非目标

1. 本轮不实现截图 fingerprint 或图像 diff。
2. 本轮不通过全局鼠标 hook 检测外部应用滚动条拖动，也不覆盖键盘 PageDown、页面自动刷新等所有内容变化。拖动滚动条属于后续截图指纹增强要优先覆盖的场景。
3. 本轮不做候选确认 UI。
4. 本轮不更改 Vision 定位、坐标换算、pointerOffset 或 MoveController 行为。
5. 本轮不移除现有 debug 日志；日志后续可单独清理或加开关。

## 推荐方案

采用两类轻量信号：

```text
ScreenTargetPointer active session
  ├─ WindowActivityService：前台窗口标题/上下文变化
  └─ renderer wheel event：用户滚轮滚动
```

### 1. 窗口变化检测

保留现有 `ScreenTargetPointer` 中的窗口变化检测：

- session 开始时记录 `beforeTitle`。
- locating 后检查一次。
- moving 期间低频轮询。
- pointing 期间低频轮询。

当前环境里标题可能为空，因此规则保持保守：

- `beforeTitle` 或 `afterTitle` 为空时，不因为标题为空而取消。
- 两者都非空且不同，取消。

这个检测只覆盖窗口上下文变化，不尝试理解页面内容是否滚动。

### 2. 滚轮变化检测

新增 renderer 到 main 的滚轮事件通知：

```text
renderer wheel
  ↓
preload sendScreenWheel()
  ↓
main ipcMain.on('screen-wheel')
  ↓
screenTargetPointer?.cancelIfActive('screen-changed') 或 cancel('screen-changed')
```

实现原则：

- renderer 只负责把用户滚轮事件通知给主进程。
- main 不需要知道滚轮方向或距离，第一版只把它当作“屏幕可能变化”的信号。
- `ScreenTargetPointer` 只在 active session 时响应；无 active session 时忽略。
- 使用现有 `screen-changed` 取消文案：

```text
屏幕变了，我刚才看到的位置可能不准啦。你重新发一次「.帮我指出xxx」吧。
```

### 3. 避免桌宠自身影响

滚轮检测只响应用户真实 `wheel` 事件，不响应桌宠移动、point visual 切换或普通状态动画。

窗口检测仍可能受前台窗口服务质量影响，但不会把桌宠自身坐标变化作为取消条件。

本轮不做截图指纹，原因是截图会包含桌宠自身。如果桌宠移动或动画改变截图像素，简单 fingerprint 可能误判。因此先记录为后续增强，等需要时再设计“排除桌宠区域”或“只对目标周边/页面区域取样”的方案。

## 数据流

### 成功指向流程

```text
用户输入 .帮我指出搜索框在哪
  ↓
ChatManager 路由到 ScreenTargetPointer
  ↓
ScreenTargetPointer startSession
  ↓
ScreenAnalyzer 截图 + Vision 定位
  ↓
窗口变化检测通过
  ↓
坐标换算 + pose 选择 + MoveController.moveTo
  ↓
point-visual 指向
```

### 滚轮取消流程

```text
用户滚动页面
  ↓
renderer 捕获 wheel
  ↓
main 收到 screen-wheel IPC
  ↓
ScreenTargetPointer 如果处于 locating/moving/pointing，则 cancel('screen-changed')
  ↓
清理 move/point visual，提示重新发起请求
```

## 状态与接口

### renderer / preload

新增主进程通知接口：

```ts
sendScreenWheel(): void
```

renderer 在 `wheel` 事件中调用。可以做最小节流，例如 300ms 内只发送一次，避免触控板连续滚动造成 IPC 风暴。

### main

新增 IPC：

```ts
ipcMain.on('screen-wheel', () => {
  screenTargetPointer?.cancel('screen-changed');
});
```

如果 `ScreenTargetPointer.cancel()` 在 `done/cancelled` 状态下已是 no-op，则 main 不需要额外判断。

### ScreenTargetPointer

复用现有：

```ts
cancel(reason: 'screen-changed')
```

不新增复杂状态。`cancel()` 已负责：

- 增加 sessionId，使旧异步流程失效。
- 取消 MoveController。
- 清理 point visual。
- 清理定时器。
- 显示 screen-changed 气泡。

## 错误处理

1. renderer wheel IPC 发送失败：不影响主流程，仅失去滚轮取消能力。
2. 无 active pointing session 时收到滚轮：忽略。
3. 连续滚轮：首次取消后状态变为 cancelled，后续 cancel no-op。
4. 用户拖拽桌宠：继续走现有 drag-start cancel，不依赖 wheel。

## 测试与验证

1. `.帮我指出搜索框在哪` 正常定位并移动。
2. pointing 期间滚动鼠标滚轮，应取消并显示 screen-changed 文案。
3. locating 或 moving 期间滚动鼠标滚轮，应取消旧 session，不继续显示成功指向。
4. 无 pointer session 时滚轮不应触发屏幕变化气泡。
5. 普通聊天不触发截图或指向。
6. `.总结这个页面` 仍走普通屏幕分析。
7. 拖拽桌宠仍显示 `好啦好啦，我不挡你~`。
8. `npm run build` 通过。
9. `npm test` 如项目脚本存在则通过。

## 后续增强：截图指纹

后续如果还需要检测非滚轮导致的页面内容变化，可单独设计截图指纹方案。注意事项：

- 优先覆盖拖动滚动条、键盘滚动、页面自动刷新等没有 wheel IPC 的内容变化。
- 需要避免桌宠自身移动/动画导致误判。
- 可考虑排除桌宠窗口区域。
- 可考虑只在 Vision 等待期间或移动前检查一次，而不是持续监控。
- 可考虑对目标周边区域或页面主体区域取样。

本轮仅记录该方向，不实现。

## 成功标准

- 用户滚动页面时，active screen pointer session 会取消。
- 取消逻辑复用现有 screen-changed 文案与清理流程。
- 不引入持续截图监控。
- 不让桌宠自身移动成为屏幕变化判定输入。
- 构建通过，现有屏幕目标指示主流程不回退。

## 自检

- 无 TBD/TODO 占位符。
- 设计范围聚焦于窗口检测和滚轮检测。
- 截图指纹明确暂缓，避免本轮过度复杂化。
- 与现有 ScreenTargetPointer cancel/sessionId 机制兼容。
