# Move Sprites Axis Motion 设计

日期：2026-07-15

## 背景

当前 move 模块已经提供主进程侧 `MoveController`，可以通过 `moveTo()` 将桌宠平滑移动到屏幕坐标，并通过 `move-visual` IPC 通知 renderer 显示方向视觉。第一版视觉主要复用 `dragged_left/right/up/down`，路径也是从起点到终点的一段插值。

本次新增了移动专用差分资源：

```text
src/assets/sprites/move/
├── move/
│   ├── move_1.png
│   ├── move_2.png
│   ├── move_3.png
│   ├── move_4.png
│   └── move_5.png
├── up/
│   ├── up_1.png
│   └── up_2.png
└── down/
    ├── down_0.png
    ├── down_1.png
    └── down_2.png
```

这些资源用于自动移动过程，而不是拖拽状态。为了让方向差分稳定播放，本次将自动移动路径从斜向单段插值调整为最多两个单轴 segment：先移动 X 或 Y，再移动另一轴。

## 目标

1. 接入 `src/assets/sprites/move/` 下的 move 专用差分。
2. 左右移动播放 `move_1` 到 `move_5`，每帧间隔 300ms，循环播放。
3. 右移复用左右移动差分，通过水平镜像显示。
4. 上移播放 `up_1` / `up_2`，每 300ms 往返切换。
5. 下移只使用 `down_0`，通过轻微 CSS 摆动表现下降。
6. `moveTo()` 从直线插值改为最多两个单轴移动 segment。
7. 调用方可指定轴顺序，默认使用距离长的轴优先。
8. 新增直接切换接口，允许不播放 move 动画直接到目标位置。
9. `moveTo()` 和直接切换都必须 clamp 到屏幕可用区域，默认保证整个窗口可见。
10. 为后续“部分出屏但保留可见区域”和更多动作差分预留接口空间。

## 非目标

1. 本次不实现完整动作系统或路径规划器。
2. 本次不实现避障、复杂曲线运动或物理惯性。
3. 本次不实现部分出屏模式，只预留设计点。
4. 本次不删除 `down_1.png` / `down_2.png`，但当前不使用。
5. 本次不改变用户拖拽逻辑；拖拽仍然优先并取消自动移动。

## 推荐方案

采用 **MoveController 单轴分段 + renderer move 专用序列播放器**。

- 主进程继续负责窗口位置、目标 clamp、取消和结果返回。
- `moveTo()` 将目标拆成最多两个单轴 segment，每段只发送一个稳定方向。
- renderer 根据方向播放 move 专用差分序列。
- 新增 `teleportTo()` 直接切换到目标点，复用 anchor 和 clamp 逻辑，但不播放移动动画。

该方案比“只改 renderer 视觉”更符合资源播放需求，也比“完整动作系统”更轻量，适合当前阶段落地。

## MoveController 接口设计

现有 `moveTo()` 保留，但扩展请求参数：

```ts
export type MoveAxisOrder = 'x-then-y' | 'y-then-x' | 'longer-axis-first';
export type MoveVisibilityMode = 'fully-visible';

export interface MoveToRequest {
  x: number;
  y: number;
  anchor?: MoveAnchor;
  durationMs?: number;
  speedPxPerSec?: number;
  reason?: string;
  axisOrder?: MoveAxisOrder;
  visibilityMode?: MoveVisibilityMode;
}
```

### 轴顺序

`axisOrder` 默认值为 `longer-axis-first`。

规则：

1. `x-then-y`：先横向移动，再纵向移动。
2. `y-then-x`：先纵向移动，再横向移动。
3. `longer-axis-first`：比较目标与起点的 `abs(dx)` / `abs(dy)`，横向距离更长则先 X，纵向距离更长则先 Y。
4. 如果某个轴距离小于 1px，则跳过该轴。
5. 如果两轴距离都小于 1px，则直接结束，不播放移动动画。

每个 segment 独立计算方向：

- X segment：`left` 或 `right`
- Y segment：`up` 或 `down`

主进程在每个 segment 开始时发送：

```ts
{ active: true, direction, reason }
```

全部 segment 完成、取消或窗口销毁时发送：

```ts
{ active: false, reason }
```

### segment 时长

默认继续使用现有速度模型：根据 segment 距离和 `speedPxPerSec` 推导时长。当前默认速度为 `320px/s`，用于让自动行走更自然。

如果调用方显式传 `durationMs`，该时长表示整段 move 的总预算。实现时按各 segment 距离占比分配时长，并保留最短时长保护，避免极短 segment 闪跳。若只有一个 segment，则直接使用该时长。

### 当前接口快照

Move 模块当前保持轻量接口：

- `moveTo(request): Promise<MoveResult>`：按 X/Y 单轴分段移动。
- `teleportTo(request): MoveResult`：直接切换到目标位置。
- `cancel(reason?)`：取消当前自动移动。
- `isMoving()`：查询是否正在自动移动。

设置页和 preload 暴露的临时调试入口对应 IPC 为 `move-to` / `teleport-to`；renderer 只消费 `move-visual` 方向事件，不负责窗口坐标。

### 直接切换接口

新增：

```ts
teleportTo(request: MoveToRequest): MoveResult
```

行为：

1. 如当前正在自动移动，先取消当前 move。
2. 校验目标坐标为有限数字。
3. 按 `anchor` 换算目标左上角。
4. 按 `visibilityMode` clamp 到屏幕可用区域。
5. 直接调用 `BrowserWindow.setPosition(target.x, target.y)`。
6. 发送 `{ active: false }`，避免旧移动视觉残留。
7. 返回最终位置。

`teleportTo()` 不播放 move 差分，也不把 `durationMs: 0` 作为特殊隐式语义。需要直接切换时应显式调用该接口。

### 屏幕边界

本次只实现：

```ts
visibilityMode: 'fully-visible'
```

默认行为：最终目标保持在目标显示器 `workArea` 内。自动移动尊重当前窗口真实位置作为起点，不在开始时强行修正起点，避免贴近右上角等边缘位置时先向下跳一下。

后续可扩展：

```ts
visibilityMode?: 'fully-visible' | 'partially-visible';
minVisibleWidth?: number;
minVisibleHeight?: number;
```

特殊动作如探头、贴边、攀爬可以使用部分出屏模式，但仍必须保留可见区域，不允许角色完全走出屏幕。

## Renderer 移动视觉设计

renderer 监听 `move-visual` 后进入自动移动视觉模式。该模式优先级低于用户拖拽，高于状态系统视觉。

优先级：

1. 用户拖拽视觉
2. 自动 move 视觉
3. 状态系统视觉

### 左右移动

资源：

```text
move/move_1.png
move/move_2.png
move/move_3.png
move/move_4.png
move/move_5.png
```

规则：

- `right`：按 `move_1 → move_2 → move_3 → move_4 → move_5 → move_1` 循环。
- `left`：播放同一序列，但对角色图片水平镜像。
- 帧间隔固定为 300ms。
- 方向从 left 切到 right 或从 right 切到 left 时，重置到 `move_1`。

### 上移

资源：

```text
up/up_1.png
up/up_2.png
```

规则：

- `up_1 ↔ up_2` 往返切换。
- 帧间隔固定为 300ms。
- 不镜像。

### 下移

资源：

```text
down/down_0.png
```

规则：

- 只显示 `down_0`。
- 增加轻微 CSS 摆动 class。
- 当前不使用 `down_1` 和 `down_2`。

摆动应该轻微，建议左右位移 1px 到 2px，旋转 1deg 到 2deg，周期约 0.6s。不要增加明显上下 bounce，因为窗口本身已经在下降。

### timer 和 class 清理

renderer 需要为 move 视觉维护独立 timer 和当前方向。

以下场景必须清理 move timer、帧索引和 move CSS class：

1. 收到 `active:false`。
2. 收到新方向并切换动画组。
3. 用户拖拽开始。
4. 状态视觉重新接管前。

清理内容包括：

- move animation interval
- 当前帧索引
- 右移镜像 class
- 下移摆动 class
- move active 标记

清理后调用现有 `updateVisual(currentState, null)` 回到当前状态视觉。

## 资源路径设计

不要把 move 专用资源塞入旧的 `sprites/basic/` 状态映射。

新增 renderer 内部函数：

```ts
setMoveSprite(group: 'move' | 'up' | 'down', frame: string): void
```

路径语义：

```text
<spritesRoot>/move/<group>/<frame>.png
```

例如：

```text
<spritesRoot>/move/move/move_1.png
<spritesRoot>/move/up/up_1.png
<spritesRoot>/move/down/down_0.png
```

`setSprite(name)` 继续负责状态精灵和拖拽精灵；`setMoveSprite()` 只负责自动 move 资源，避免污染状态视觉映射。

## CSS 设计

右移镜像使用 CSS class，而不是复制图片：

```css
.companion-move-flip {
  transform: scaleX(-1);
}
```

下移摆动使用独立 class：

```css
.companion-move-down {
  animation: move-down-sway 0.6s ease-in-out infinite alternate;
}
```

如果现有状态动画也使用 `transform`，实现时需要避免 transform 冲突。优先使用 class 组合测试；若冲突明显，再拆分外层容器动画和图片镜像。当前设计不要求立即重构 DOM 结构。

## IPC 与 preload

现有 `move-visual` 保留。

若当前已有 `move-to` preload 调试接口，则新增对应直接切换接口：

```ts
teleportTo(request): Promise<MoveResult>
```

主进程 IPC：

```ts
ipcMain.handle('teleport-to', async (_event, request: MoveToRequest) => {
  return moveController.teleportTo(request);
});
```

preload：

```ts
teleportTo: (request: any) => ipcRenderer.invoke('teleport-to', request)
```

该接口用于调试和后续模块，不代表普通 UI 必须暴露按钮。

## 错误处理

1. 非有限坐标：不移动，返回 `success:false`。
2. 窗口销毁：返回 `cancelled:true`，`cancelReason:'window-destroyed'`。
3. 新 move 到来：取消旧 move，旧 move 返回 `cancelReason:'new-move'`。
4. 用户拖拽：取消当前 move，返回 `cancelReason:'drag-start'`。
5. `teleportTo()` 会取消当前 move，但自身不视为动画取消；如果目标有效且窗口可用，应返回 `success:true`。

普通取消不抛异常，通过 `MoveResult` 表达。

## 测试与验证

1. `npm run build` 通过。
2. `moveTo()` 默认按距离长轴优先拆分 segment。
3. `axisOrder:'x-then-y'` 强制先 X 后 Y。
4. `axisOrder:'y-then-x'` 强制先 Y 后 X。
5. 单轴目标只执行一个 segment。
6. `teleportTo()` 直接设置最终位置，不播放 move 动画。
7. `moveTo()` 和 `teleportTo()` 都 clamp 到 `workArea`，默认整个窗口可见。
8. 自动移动过程中拖拽会取消 move。
9. 左移播放 `move_1` 到 `move_5` 循环。
10. 右移播放同序列并镜像。
11. 上移 `up_1` / `up_2` 往返切换。
12. 下移显示 `down_0` 并轻微摆动。
13. move 结束、取消、切换方向后没有 timer 或 CSS class 残留。

## 提交策略

当前 `src/assets/sprites/move/` 是未提交资源。实施前先单独提交资源，便于回退：

```bash
git add src/assets/sprites/move
git commit -m "chore: add move sprite assets"
```

实现完成后提交代码与文档：

```bash
git commit -m "feat: animate axis-based move sprites"
```

如文档更新较多，可额外拆分：

```bash
git commit -m "docs: document move sprite motion"
```

## 成功标准

- 自动移动不再斜向滑动，而是按 X/Y 单轴分段移动。
- 调用方可以指定轴顺序，默认长轴优先。
- 存在直接切换到目标位置的接口，并且仍执行 clamp。
- 所有普通移动目标默认保持整个窗口可见。
- 左右、上、下方向均使用 move 专用差分或 CSS 视觉。
- 右移动作通过镜像复用左右移动差分。
- move 结束、取消、拖拽打断后没有动画残留。
- 项目文档记录资源目录、接口和行为边界。

## 自检

- 无 TBD/TODO 占位。
- 设计聚焦于 move 差分接入和单轴移动，不提前实现完整动作系统。
- 主进程和 renderer 边界清晰：主进程负责坐标与路径，renderer 负责视觉序列。
- 直接切换、axisOrder、clamp、拖拽取消和后续部分出屏扩展均有明确语义。
