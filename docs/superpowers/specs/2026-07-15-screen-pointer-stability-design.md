# Screen Pointer Stability 轻量截图指纹判定设计

日期：2026-07-15

## 背景

Screen Target Pointer 已能通过 `.` 显式屏幕分析请求定位目标、移动桌宠并显示指向差分。运行日志和现有设计显示目标定位、坐标换算、移动和指向主链路已具备清晰边界，但屏幕变化判定仍需要补强：

- 前台窗口标题在当前环境中经常为空字符串，单靠标题变化无法可靠判断屏幕是否变化。
- 最常见的目标失效场景是用户在 Vision 等待期间滚动或切换页面，导致 Vision 返回的旧坐标不再对应当前屏幕。
- 滚轮事件不是可靠的屏幕变化事实：滚轮可能没有实际滚动页面，也可能被应用拦截为缩放、横向滚动或其它自定义交互。
- 持续截图监控、全局输入 hook、桌宠窗口区域排除都会显著增加复杂度，不适合第一版目标指示的验证阶段。

因此本轮采用强制轻量化方案：**只在 Vision 定位前后各取一次截图指纹，若两次截图明显不同，则取消本次指示**。不做 wheel IPC，不做全局输入 hook，不做持续截图监控。

## 目标

1. 在 Vision 定位等待期间，如果屏幕内容明显变化，取消旧指向坐标。
2. 第一版只多一次截图，不引入后台持续监控。
3. 使用极简截图 fingerprint，只判断“明显变了”，不追求精确视觉理解。
4. 阈值保持保守：宁可漏掉轻微变化，也不要误杀正常流程。
5. 保留现有前台窗口变化检测作为轻量辅助保护。
6. 保持第一版边界：不自动点击、不自动滚动、不自动重试、不处理普通聊天自然语言触发。

## 非目标

1. 本轮不实现 wheel IPC 或 renderer 滚轮监听。
2. 本轮不实现全局鼠标/键盘 hook，不检测滚动条拖动、键盘 PageDown、触控板手势等具体输入事件。
3. 本轮不做 pointing 期间或 moving 期间的截图轮询。
4. 本轮不排除桌宠窗口区域，也不做窗口 bounds 到截图坐标的映射。
5. 本轮不做复杂图像算法、目标区域追踪、光流、OCR 或相似度模型。
6. 本轮不做候选确认 UI。
7. 本轮不更改 Vision 定位、坐标换算、pointerOffset 或 MoveController 行为。
8. 本轮不移除现有 debug 日志；日志后续可单独清理或加开关。

## 推荐方案

采用 Vision 定位前后的单次轻量截图指纹比对：

```text
capture frame A + fingerprint A
  ↓
Vision locate
  ↓
capture frame B + fingerprint B
  ↓
diff(A, B)
  ├─ diff >= 0.20：认为屏幕明显变化，取消
  └─ diff < 0.20：继续移动和指向
```

### 1. 指纹采样时机

只在关键节点采样：

1. `ScreenTargetPointer` 发起定位截图时，记录 frame A 的 fingerprint。
2. Vision 返回定位结果后、调用 `MoveController.moveTo()` 前，再截一次 frame B 并记录 fingerprint。
3. 比较 A/B 指纹。
4. 差异明显时取消并提示用户重新发起请求。
5. 差异不明显时继续现有移动和指向流程。

本轮不在移动后、pointing 期间或后台 idle 状态继续截图。

### 2. fingerprint 极简算法

不做复杂图像算法。第一版 fingerprint 只表达全屏亮度粗略分布：

```ts
interface ScreenFingerprint {
  width: number;  // 例如 16 或 24
  height: number; // 例如 9 或 14
  values: number[]; // 0..1 灰度平均值，长度为 width * height
}
```

生成方式：

1. 将截图缩小到很低分辨率，例如 `16x9` 或 `24x14`。
2. 对每个小格计算灰度平均值。
3. 灰度归一化到 `0..1`。
4. 保存为短数组。

比较方式：

```ts
diff = average(abs(a.values[i] - b.values[i]))
```

如果两张截图尺寸或 fingerprint 配置不一致，则不强行取消，可记录日志并继续主流程，避免因为检测异常误杀。

### 3. 阈值策略

第一版只设置一个保守硬阈值：

```text
diff >= 0.20：取消
diff < 0.20：继续
```

解释：

- `0.20` 代表全屏低分辨率亮度分布出现明显变化。
- 低于阈值时即使可能有轻微滚动、广告闪动或动画变化，也先继续。
- 不设置中间灰区取消逻辑；中间灰区第一版全部归为继续。

该策略的目标是减少误取消，而不是捕捉每一次微小变化。

### 4. 保留窗口变化检测

保留现有 `ScreenTargetPointer` 中的前台窗口变化检测：

- session 开始时记录 `beforeTitle` 或窗口上下文。
- locating 后检查一次。
- moving / pointing 期间可保留现有低频检查。
- 标题为空时不因为空标题取消。
- 两者都非空且不同，取消。

窗口检测覆盖窗口切换等轻量场景；截图 fingerprint 覆盖 Vision 等待期间页面内容明显变化。

### 5. 不做 wheel IPC 的原因

本轮明确不做 renderer `wheel` IPC：

- wheel 是输入事件，不是屏幕变化结果。
- wheel 可能未命中可滚动区域，不应导致误取消。
- wheel 可能被应用用于缩放、横向滚动或自定义交互，和目标坐标是否失效没有稳定对应关系。
- 触控板会产生大量连续 wheel 事件，需要节流、去抖和状态判断，复杂度上升。
- 截图前后 diff 直接判断屏幕事实，更符合“旧坐标是否仍可信”的目标。

如果后续仍需覆盖 pointing 期间滚动，再另行设计低频截图检测或用户显式暂停机制，而不是把第一版做成输入监控系统。

## 数据流

### 成功指向流程

```text
用户输入 .帮我指出搜索框在哪
  ↓
ChatManager 路由到 ScreenTargetPointer
  ↓
ScreenTargetPointer startSession
  ↓
ScreenAnalyzer 截图 frame A
  ↓
生成 fingerprint A
  ↓
Vision 结构化定位
  ↓
ScreenAnalyzer 再截 frame B
  ↓
生成 fingerprint B 并 diff
  ↓
diff < 0.20 且窗口变化检测通过
  ↓
坐标换算 + pose 选择 + MoveController.moveTo
  ↓
point-visual 指向
```

### 屏幕变化取消流程

```text
用户在 Vision 等待期间滚动或切换页面
  ↓
Vision 返回旧截图中的目标坐标
  ↓
移动前再次截图 frame B
  ↓
fingerprint diff >= 0.20
  ↓
ScreenTargetPointer 取消本次 session
  ↓
清理 move/point visual，提示重新发起请求
```

取消文案复用现有 `screen-changed`：

```text
屏幕变了，我刚才看到的位置可能不准啦。你重新发一次「.帮我指出xxx」吧。
```

## 状态与接口

### ScreenAnalyzer

建议在截图服务边界提供可复用 fingerprint 生成能力，避免 `ScreenTargetPointer` 直接理解图像细节：

```ts
interface ScreenCaptureFrame {
  imageBase64: string;
  origin: { x: number; y: number };
  size: { width: number; height: number };
  scaleFactor?: number;
  fingerprint?: ScreenFingerprint;
}
```

或者提供独立工具函数：

```ts
createScreenFingerprint(frame: ScreenCaptureFrame): ScreenFingerprint | null
compareScreenFingerprints(a: ScreenFingerprint, b: ScreenFingerprint): number | null
```

实际落点以现有代码结构为准，但职责边界保持：截图和图像派生信息属于 `ScreenAnalyzer` 或相邻纯工具，`ScreenTargetPointer` 只消费 fingerprint diff 结果决定是否取消。

### ScreenTargetPointer

`ScreenTargetPointer` 增加一个移动前稳定性检查步骤：

```text
locate result valid
  ↓
capture/check current fingerprint
  ↓
if changed: cancel('screen-changed') and stop
  ↓
moveTo + point visual
```

取消仍复用现有 `cancel('screen-changed')` 或等价内部取消逻辑，确保：

- 增加 sessionId，使旧异步流程失效。
- 取消 MoveController。
- 清理 point visual。
- 清理定时器。
- 显示 screen-changed 气泡。

## 错误处理

1. frame A 没有 fingerprint：记录日志，继续主流程，不取消。
2. frame B 截图失败：记录日志，继续主流程，不取消，避免检测异常破坏主要功能。
3. fingerprint 尺寸不一致：记录日志，继续主流程。
4. diff 计算异常：记录日志，继续主流程。
5. diff >= 0.20：取消本次 session，不自动重试。
6. diff < 0.20：继续移动。
7. 用户拖拽桌宠：继续走现有 drag-start cancel，不依赖 fingerprint。
8. 用户发起新的屏幕分析：继续走现有新 session 取代旧 session 机制。

## 测试与验证

1. `.帮我指出搜索框在哪` 正常定位并移动。
2. Vision 等待期间保持页面不动，应继续移动并显示 point visual。
3. Vision 等待期间明显滚动/切换页面，应在移动前取消并显示 screen-changed 文案。
4. pointing 期间滚动页面，本轮不保证取消，需记录为已知边界。
5. 小动画、广告轻微闪动、桌宠自身静止区域轻微变化不应高频误取消。
6. `.总结这个页面` 仍走普通屏幕分析。
7. 拖拽桌宠仍显示 `好啦好啦，我不挡你~`。
8. `npm run build` 通过。
9. `npm test` 如项目脚本存在则通过。

## 后续增强

如果第一版验证后仍需要更完整覆盖，可按优先级独立设计：

1. pointing 期间低频截图 fingerprint 检测，但必须控制频率和成本。
2. 排除桌宠窗口区域，降低桌宠动画/移动带来的误判。
3. 只对目标周边或页面主体区域采样，而不是全屏采样。
4. 针对键盘滚动、滚动条拖动、页面自动刷新等场景增加更明确的 UX 提示。
5. 候选确认 UI，允许用户在不确定时确认目标。

wheel IPC 和全局输入 hook 不作为优先方向，除非后续有明确证据表明输入事件比截图事实更适合当前体验。

## 成功标准

- Vision 等待期间屏幕明显变化时，active screen pointer session 会在移动前取消。
- 取消逻辑复用现有 screen-changed 文案与清理流程。
- 不引入持续截图监控、wheel IPC 或全局输入 hook。
- 不让桌宠自身移动成为本轮屏幕变化判定输入；本轮只在移动前做第二次截图。
- 构建通过，现有屏幕目标指示主流程不回退。

## 自检

- 无 TBD/TODO 占位符。
- 设计范围聚焦于 Vision 前后一次截图 fingerprint 比对。
- wheel IPC、全局 hook、持续监控和桌宠区域排除均明确排除在本轮之外。
- 与现有 ScreenTargetPointer cancel/sessionId 机制兼容。
