# Move Controller 模块设计

日期：2026-07-15

## 背景

Quiet Companion 当前已有两类窗口移动能力：

1. 用户拖拽：renderer 负责拖拽视觉差分，main 进程轮询鼠标位置并调用 `BrowserWindow.setPosition()`。
2. renderer 相对移动：`window-move-by` IPC 直接把窗口移动一个 delta，没有路径、动画、取消规则或模块接口。

后续模块需要一种独立、可复用的移动能力：给定屏幕坐标，桌宠可以平滑移动过去，并在移动过程中显示方向差分。该能力应有明确接口和文档，供后续主动行为、屏幕分析、调试工具或其它模块调用。

## 目标

1. 新增独立 `move` 模块，作为主进程侧窗口自动移动控制器。
2. 提供明确的 `moveTo()` / `cancel()` / `isMoving()` 接口。
3. 坐标默认解释为窗口左上角，同时支持 `anchor: 'center'`。
4. 自动移动目标 clamp 到当前显示器可用区域内，避免桌宠移出屏幕不可见。
5. 用户开始拖拽时立即取消当前自动移动。
6. 移动过程中向 renderer 发送方向视觉事件，renderer 切换移动方向差分。
7. 如果暂时没有 move 专用素材，第一版复用现有 `dragged_left/right/up/down` 方向差分。
8. 为后续“屏幕边缘攀爬”差分预留接口和命名空间。

## 非目标

1. 第一版不实现真实物理路径规划、避障或窗口边缘攀爬。
2. 第一版不把 move 纳入 `StateId` 状态系统，不新增 `moving` 状态。
3. 第一版不持久化 move 配置。
4. 第一版不添加复杂 UI，仅保留内部接口和可选调试入口。
5. 第一版不改变用户拖拽的现有体验。

## 推荐方案

采用 **主进程 MoveController + renderer 方向差分**。

- `src/core/move-controller.ts` 负责路径、插值、目标 clamp、取消和结果返回。
- `src/main/main.ts` 创建 `MoveController`，把 `mainWindow` 和 renderer 事件发送函数传入。
- renderer 只负责收到移动视觉事件后切换差分，不负责实际窗口坐标。
- 后续其它主进程模块通过 `moveController.moveTo(...)` 调用移动能力。

不推荐把移动做成状态系统新状态 `moving`，因为路径运动控制和情绪/交互状态属于不同维度。移动可以发生在 idle、curious 或后续主动行为期间；把它塞进状态系统会让 `TransitionEngine` 承担窗口运动细节，边界不清。

## 核心接口

新增类型建议放在 `src/core/move-controller.ts` 内，后续如多模块复用再抽到 `types.ts`。

```ts
export type MoveAnchor = 'top-left' | 'center';
export type MoveDirection = 'left' | 'right' | 'up' | 'down';
export type MoveCancelReason = 'drag-start' | 'new-move' | 'manual' | 'window-destroyed';

export interface MoveToRequest {
  x: number;
  y: number;
  anchor?: MoveAnchor;      // 默认 'top-left'
  durationMs?: number;      // 优先级高于 speedPxPerSec
  speedPxPerSec?: number;   // 默认 500
  reason?: string;          // 调用来源，例如 'observer' / 'debug' / 'screen-focus'
}

export interface MoveResult {
  success: boolean;
  cancelled: boolean;
  cancelReason?: MoveCancelReason;
  finalPosition: { x: number; y: number };
}
```

### 坐标语义

`anchor` 默认值为 `top-left`：

```ts
moveController.moveTo({ x: 100, y: 100 });
```

表示把 Electron 窗口左上角移动到屏幕坐标 `(100, 100)`。

`anchor: 'center'`：

```ts
moveController.moveTo({ x: 960, y: 540, anchor: 'center' });
```

表示把桌宠窗口中心移动到屏幕坐标 `(960, 540)`。模块内部根据当前窗口尺寸换算左上角：

```ts
left = x - windowWidth / 2;
top = y - windowHeight / 2;
```

后续模块调用时建议显式写 `anchor`，除非确实想使用默认左上角。

## MoveController 职责

`MoveController` 管理一个当前移动任务：

```ts
class MoveController {
  moveTo(request: MoveToRequest): Promise<MoveResult>;
  cancel(reason?: MoveCancelReason): void;
  isMoving(): boolean;
}
```

### 目标 clamp

移动前根据目标点所在显示器的 `workArea` clamp 目标左上角。

规则：

1. 如果 `anchor === 'center'`，先换算为左上角。
2. 根据目标点找到最近或包含该点的 display。
3. 使用 display 的 `workArea` 而非完整 `bounds`，避免任务栏区域。
4. 让整个窗口尽量留在 `workArea` 内：

```ts
left = clamp(left, workArea.x, workArea.x + workArea.width - windowWidth);
top = clamp(top, workArea.y, workArea.y + workArea.height - windowHeight);
```

如果窗口尺寸大于 workArea，则保持 workArea 起点，避免出现反向范围。

### 移动插值

第一版使用 16ms `setInterval` tick。

默认速度：`500px/s`。

距离到时长：

```ts
durationMs = distance / speedPxPerSec * 1000;
```

限制范围：

- 最短 `180ms`，避免短距离闪跳。
- 最长 `3000ms`，避免超远移动过慢。

如果调用方显式传 `durationMs`，则使用调用方时长，但仍 clamp 到 `120ms ~ 5000ms`。

插值函数使用 ease-in-out，第一版可使用：

```ts
const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
```

每帧调用：

```ts
mainWindow.setPosition(Math.round(x), Math.round(y));
```

结束时强制设置最终位置，避免累计误差。

### 并发和取消

- 如果 `moveTo()` 期间再次调用 `moveTo()`，旧移动以 `cancelReason: 'new-move'` 结束，新移动开始。
- 用户拖拽开始时，`main.ts` 调用 `moveController.cancel('drag-start')`。
- 如果窗口销毁，当前移动以 `cancelReason: 'window-destroyed'` 结束。
- `cancel('manual')` 供后续模块或调试入口使用。

拖拽优先级高于自动移动。拖拽期间拒绝或立即取消自动移动，不与用户抢 `setPosition()`。

## Renderer 视觉事件

新增主进程到 renderer 的 IPC：

```ts
move-visual
```

事件数据：

```ts
interface MoveVisualEvent {
  active: boolean;
  direction?: MoveDirection;
  edge?: 'left' | 'right' | 'top' | 'bottom';
  reason?: string;
}
```

第一版只要求 `active` 和 `direction`。

示例：

```ts
mainWindow.webContents.send('move-visual', {
  active: true,
  direction: 'right',
  reason: 'screen-focus',
});

mainWindow.webContents.send('move-visual', { active: false });
```

`edge` 预留给后续攀爬差分：当目标被 clamp 到屏幕边缘时，可标记贴边方向。

## Renderer 视觉设计

renderer 新增 `onMoveVisual` 监听。

移动视觉规则：

1. 收到 `active: true` 后进入自动移动视觉模式。
2. 根据 `direction` 切换精灵：
   - 优先使用 `move_left/right/up/down`。
   - 如果资源不存在或第一版未提供，复用 `dragged_left/right/up/down`。
3. 移动视觉模式期间不覆盖用户拖拽视觉；如果用户拖拽开始，拖拽视觉优先。
4. 收到 `active: false` 后退出自动移动视觉模式，并调用现有状态视觉刷新逻辑回到当前状态。

第一版可以先不新增素材文件，直接复用现有 dragged 方向差分，保证功能可见。

后续素材命名建议：

```text
src/assets/sprites/basic/move/move_left.png
src/assets/sprites/basic/move/move_right.png
src/assets/sprites/basic/move/move_up.png
src/assets/sprites/basic/move/move_down.png
src/assets/sprites/basic/move/move_climb_left.png
src/assets/sprites/basic/move/move_climb_right.png
src/assets/sprites/basic/move/move_climb_up.png
src/assets/sprites/basic/move/move_climb_down.png
```

现有 `setSprite(name)` 会按前缀选择目录。实现时若要支持 `move_*`，需要把 renderer 的 sprite 目录映射扩展到 `move/`；否则第一版复用 `dragged_*` 不需要新增目录。

## 主进程集成

`main.ts` 中新增全局：

```ts
let moveController: MoveController;
```

在 `app.whenReady()` 创建 `mainWindow` 后初始化：

```ts
moveController = new MoveController(mainWindow, {
  sendVisual: (event) => mainWindow.webContents.send('move-visual', event),
});
```

在拖拽开始 IPC 中增加：

```ts
moveController?.cancel('drag-start');
```

这行应在 `isDragging = true` 前后都可，但必须在拖拽轮询开始前执行，避免自动 move 和拖拽同时调用 `setPosition()`。

保留现有 `window-move-by` IPC 不变。它是相对即时移动，move 模块提供的是平滑移动和未来模块接口。

## 预留调用入口

第一版主要给内部模块用，不要求公开给 renderer。为调试和未来扩展可选择新增 IPC handle：

```ts
ipcMain.handle('move-to', async (_event, request: MoveToRequest) => {
  return await moveController.moveTo(request);
});
```

preload 可暂不公开给普通 renderer UI，避免外部随意调用。若需要手动测试，可在调试窗口或临时开发路径中使用。

后续模块调用示例：

```ts
await moveController.moveTo({
  x: 100,
  y: 100,
  anchor: 'top-left',
  reason: 'debug',
});

await moveController.moveTo({
  x: target.x,
  y: target.y,
  anchor: 'center',
  speedPxPerSec: 420,
  reason: 'screen-focus',
});
```

## 错误处理与结果

`moveTo()` 不因普通取消抛异常，而是 resolve：

```ts
{ success: false, cancelled: true, cancelReason: 'drag-start', finalPosition }
```

只有编程错误或窗口不可用才应返回失败结果：

```ts
{ success: false, cancelled: true, cancelReason: 'window-destroyed', finalPosition }
```

坐标为非有限数字时，`moveTo()` 返回失败并不移动：

```ts
{ success: false, cancelled: false, finalPosition: currentPosition }
```

如果需要更详细错误，后续可扩展 `error?: string` 字段；第一版先保持结果结构简单。

## 测试与验证

1. TypeScript 编译通过。
2. 调用 `moveTo({ x: 100, y: 100 })` 时窗口平滑移动到左上角坐标附近。
3. 调用 `moveTo({ x, y, anchor: 'center' })` 时窗口中心移动到目标点附近。
4. 传入屏幕外坐标时，窗口最终留在当前显示器可用区域内。
5. 自动移动过程中开始拖拽，自动移动立即停止，拖拽保持现有体验。
6. 自动移动过程中 renderer 能显示方向差分；无 move 专用素材时复用 dragged 方向差分。
7. 自动移动结束后，renderer 回到状态系统当前视觉。

## 成功标准

- 项目存在独立 `MoveController` 模块。
- 后续模块可以通过明确接口调用 `moveTo()`。
- 默认坐标语义为左上角，同时支持中心点。
- 自动移动不会把桌宠移出屏幕可用区域。
- 用户拖拽优先，会取消自动移动。
- 移动过程有方向差分视觉。
- 设计为后续屏幕边缘攀爬差分保留 `edge` 和 `move_climb_*` 命名空间。

## 自检

- 无占位符。
- 第一版范围聚焦，不实现攀爬和复杂路径规划。
- 模块边界清晰：MoveController 管移动，renderer 管视觉，状态系统不承担路径控制。
- 接口明确，默认 anchor 和 center anchor 语义已写清。
- 拖拽取消、屏幕 clamp、视觉事件和后续扩展点均有定义。
