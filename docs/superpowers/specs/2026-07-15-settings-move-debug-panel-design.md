# Settings Move Debug Panel 设计

日期：2026-07-15

## 背景

Move 模块已支持 `moveTo()` 单轴分段移动和 `teleportTo()` 直接切换。为了临时验证坐标、clamp、移动方向差分和直接切换行为，需要一个轻量测试入口。

当前设置窗口由 `src/main/settings.html` 提供，F11 打开，适合承载临时调试控件；该入口不应进入正式用户功能，也不保存配置。

## 目标

1. 在设置页新增“Move 测试（临时）”区块。
2. 支持输入目标坐标 `x` / `y`。
3. 支持选择 anchor：`top-left` 或 `center`。
4. 支持两种动作：
   - `moveTo`：播放自动移动动画移动到目标点。
   - `teleportTo`：直接切换到目标点，不播放移动动画。
5. 显示调用结果，包括 success、cancelled、cancelReason 和 finalPosition。
6. 不持久化任何输入值，不影响正式设置保存。

## 非目标

1. 不新增正式产品功能入口。
2. 不新增配置项或持久化字段。
3. 不改变 move 模块行为。
4. 不处理复杂路径预设、屏幕点选或可视化地图。

## 设计

在 `src/main/settings.html` 中加入一个独立 debug section：

- 两个 number input：`move-test-x`、`move-test-y`
- 一个 select：`move-test-anchor`
  - `top-left`
  - `center`
- 两个 button：
  - “Move 到坐标”
  - “Teleport 到坐标”
- 一个结果文本区域：`move-test-result`

设置页脚本读取输入：

```js
const request = {
  x: Number(xInput.value),
  y: Number(yInput.value),
  anchor: anchorSelect.value
};
```

校验：

- `x` / `y` 必须是有限数字。
- 校验失败时只更新结果文本，不调用 IPC。

调用：

```js
window.companion.moveTo(request)
window.companion.teleportTo(request)
```

结果显示为短文本，例如：

```text
success=true cancelled=false final=(100, 200)
```

失败或取消时显示：

```text
success=false cancelled=true reason=drag-start final=(x, y)
```

## 依赖与边界

- 依赖 preload 已暴露 `moveTo` / `teleportTo`。
- `moveTo` / `teleportTo` 的 clamp、anchor 和取消规则仍由主进程 `MoveController` 负责。
- 设置页只负责收集输入和显示结果。
- 该区块标题必须标注“临时”或“Debug”，便于后续删除。

## 验证

1. `npm run build` 通过。
2. 打开设置页可看到“Move 测试（临时）”。
3. 输入有效坐标后点击 Move，桌宠播放 move 动画移动。
4. 输入有效坐标后点击 Teleport，桌宠直接到目标点。
5. 输入非法坐标时不调用 IPC，并显示错误提示。
6. 返回结果能显示 finalPosition。

## 文档更新

- 更新 `PROJECT_INDEX.md` 的设置窗口说明，标记该入口为临时 move debug panel。
- 更新 `VERSION.md` Unreleased，记录设置页新增临时 move 测试入口。

## 自检

- 无占位符。
- 范围限定在设置页临时测试入口。
- 不修改 move 模块行为，不新增持久化配置。
- 与现有文档优先和任务后提交要求一致。
