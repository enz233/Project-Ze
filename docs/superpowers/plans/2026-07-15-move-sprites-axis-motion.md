# Move Sprites Axis Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接入 move 专用差分资源，把自动移动升级为可指定轴顺序的单轴分段移动，并提供不播放动画的直接切换接口。

**Architecture:** `MoveController` 继续作为主进程唯一窗口自动移动控制器，负责 anchor 换算、workArea clamp、axis segment 拆分、插值、取消和 `teleportTo()`。renderer 继续通过 `move-visual` IPC 接收方向事件，但改为播放 `src/assets/sprites/move/` 专用序列，并用 CSS 处理右移镜像和下移摆动。

**Tech Stack:** Electron 42、TypeScript 6、CommonJS、BrowserWindow、Electron screen/display API、renderer IIFE 脚本、CSS keyframes、现有 preload IPC 桥。

## Global Constraints

- 实施前先单独提交 `src/assets/sprites/move/` 素材。
- `moveTo()` 默认 `axisOrder` 为 `longer-axis-first`。
- `axisOrder` 支持 `'x-then-y' | 'y-then-x' | 'longer-axis-first'`。
- 新增 `teleportTo()` 直接切换接口，不播放 move 动画。
- `moveTo()` 和 `teleportTo()` 都必须执行 anchor 换算和 workArea clamp。
- 本次只实现 `visibilityMode: 'fully-visible'`，默认保证整个窗口可见。
- 用户拖拽视觉优先于自动 move 视觉，拖拽开始必须取消自动 move。
- 左右移动播放 `move_1` 到 `move_5`，每帧 300ms 循环；右移通过水平镜像复用同一套图。
- 上移播放 `up_1` / `up_2`，每 300ms 往返切换。
- 下移只使用 `down_0`，通过轻微 CSS 摆动表现下降。
- 完成实现后更新相关文档并提交 git。

---

## File Structure

- Commit assets: `src/assets/sprites/move/**` — 用户绘制的 move 专用差分资源，先独立提交。
- Modify: `src/core/move-controller.ts` — 扩展类型；把 `moveTo()` 改为单轴 segment 执行；新增 `teleportTo()`。
- Modify: `src/main/main.ts` — 新增 `teleport-to` IPC handle。
- Modify: `src/main/preload.ts` — 新增 `teleportTo(request)` preload 桥。
- Modify: `src/renderer/renderer.ts` — 新增 move sprite 序列播放器、`setMoveSprite()`、timer/class 清理逻辑。
- Modify: `src/renderer/style.css` — 新增右移镜像 class 和下移摆动 keyframes/class。
- Modify: `PROJECT_INDEX.md` — 记录资源目录、接口和 renderer 视觉规则。
- Modify: `VERSION.md` — 在 Unreleased 记录本次 move 优化。

---

### Task 1: Commit move sprite assets backup

**Files:**
- Add: `src/assets/sprites/move/**`

**Interfaces:**
- Produces: committed asset files used by renderer paths `<spritesRoot>/move/<group>/<frame>.png`.

- [ ] **Step 1: Inspect asset status**

Run:

```bash
git status --short src/assets/sprites/move
```

Expected: output lists `?? src/assets/sprites/move/` or individual untracked png files.

- [ ] **Step 2: Commit assets**

Run:

```bash
git add src/assets/sprites/move
git commit -m "chore: add move sprite assets"
```

Expected: commit succeeds and includes png assets.

- [ ] **Step 3: Confirm assets are clean**

Run:

```bash
git status --short src/assets/sprites/move
```

Expected: no output for `src/assets/sprites/move`.

---

### Task 2: Extend MoveController with axis segments and teleport

**Files:**
- Modify: `src/core/move-controller.ts`

**Interfaces:**
- Consumes: existing `MoveController.moveTo(request: MoveToRequest): Promise<MoveResult>` and `cancel(reason?: MoveCancelReason): void`.
- Produces: `MoveAxisOrder`, `MoveVisibilityMode`, extended `MoveToRequest`, `MoveController.teleportTo(request: MoveToRequest): MoveResult`.

- [ ] **Step 1: Replace type block and ActiveMove type**

In `src/core/move-controller.ts`, update the top type definitions to include:

```ts
export type MoveAnchor = 'top-left' | 'center';
export type MoveDirection = 'left' | 'right' | 'up' | 'down';
export type MoveAxisOrder = 'x-then-y' | 'y-then-x' | 'longer-axis-first';
export type MoveVisibilityMode = 'fully-visible';
export type MoveCancelReason = 'drag-start' | 'new-move' | 'manual' | 'window-destroyed';

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

Replace `ActiveMove` with:

```ts
interface ActiveMove {
  timers: ReturnType<typeof setInterval>[];
  resolve: (result: MoveResult) => void;
  reason?: string;
}

interface MoveSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
  direction: MoveDirection;
  distance: number;
}
```

- [ ] **Step 2: Replace `moveTo()` with segmented implementation**

Replace the existing `async moveTo(...)` method with:

```ts
  async moveTo(request: MoveToRequest): Promise<MoveResult> {
    if (!Number.isFinite(request.x) || !Number.isFinite(request.y)) {
      return this.result(false, false);
    }

    if (!this.window || this.window.isDestroyed()) {
      return this.result(false, true, 'window-destroyed');
    }

    if (this.activeMove) {
      this.cancel('new-move');
    }

    const [startX, startY] = this.window.getPosition();
    const target = this.resolveTarget(request);
    const segments = this.createSegments({ x: startX, y: startY }, target, request.axisOrder || 'longer-axis-first');

    if (segments.length === 0) {
      this.window.setPosition(target.x, target.y);
      this.sendVisual({ active: false, reason: request.reason });
      return { success: true, cancelled: false, finalPosition: target };
    }

    return new Promise<MoveResult>((resolve) => {
      this.activeMove = { timers: [], resolve, reason: request.reason };
      this.runSegments(segments, request, 0, target);
    });
  }
```

- [ ] **Step 3: Add `teleportTo()` after `moveTo()`**

```ts
  teleportTo(request: MoveToRequest): MoveResult {
    if (!Number.isFinite(request.x) || !Number.isFinite(request.y)) {
      return this.result(false, false);
    }

    if (!this.window || this.window.isDestroyed()) {
      return this.result(false, true, 'window-destroyed');
    }

    if (this.activeMove) {
      this.cancel('manual');
    }

    const target = this.resolveTarget(request);
    this.window.setPosition(target.x, target.y);
    this.sendVisual({ active: false, reason: request.reason });
    return { success: true, cancelled: false, finalPosition: target };
  }
```

- [ ] **Step 4: Add segment helpers before `resolveTarget()`**

```ts
  private createSegments(
    start: { x: number; y: number },
    target: { x: number; y: number },
    axisOrder: MoveAxisOrder,
  ): MoveSegment[] {
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const segments: MoveSegment[] = [];

    if (absX < 1 && absY < 1) return segments;

    const firstAxis = this.resolveFirstAxis(absX, absY, axisOrder);
    const axes = firstAxis === 'x' ? ['x', 'y'] : ['y', 'x'];
    let current = { x: start.x, y: start.y };

    for (const axis of axes) {
      if (axis === 'x' && absX >= 1) {
        const next = { x: target.x, y: current.y };
        segments.push({
          from: current,
          to: next,
          direction: dx >= 0 ? 'right' : 'left',
          distance: Math.abs(next.x - current.x),
        });
        current = next;
      }

      if (axis === 'y' && absY >= 1) {
        const next = { x: current.x, y: target.y };
        segments.push({
          from: current,
          to: next,
          direction: dy >= 0 ? 'down' : 'up',
          distance: Math.abs(next.y - current.y),
        });
        current = next;
      }
    }

    return segments;
  }

  private resolveFirstAxis(absX: number, absY: number, axisOrder: MoveAxisOrder): 'x' | 'y' {
    if (axisOrder === 'x-then-y') return 'x';
    if (axisOrder === 'y-then-x') return 'y';
    return absX >= absY ? 'x' : 'y';
  }

  private runSegments(
    segments: MoveSegment[],
    request: MoveToRequest,
    index: number,
    finalTarget: { x: number; y: number },
  ): void {
    if (!this.activeMove) return;
    if (index >= segments.length) {
      this.window.setPosition(finalTarget.x, finalTarget.y);
      this.finish(true, false);
      return;
    }

    const segment = segments[index];
    const durationMs = this.resolveSegmentDuration(segment, segments, request);
    const startedAt = Date.now();
    this.sendVisual({ active: true, direction: segment.direction, reason: request.reason });

    const timer = setInterval(() => {
      if (!this.window || this.window.isDestroyed()) {
        this.finish(false, true, 'window-destroyed');
        return;
      }

      const elapsed = Date.now() - startedAt;
      const t = Math.min(1, elapsed / durationMs);
      const eased = this.easeInOut(t);
      const nextX = Math.round(segment.from.x + (segment.to.x - segment.from.x) * eased);
      const nextY = Math.round(segment.from.y + (segment.to.y - segment.from.y) * eased);
      this.window.setPosition(nextX, nextY);

      if (t >= 1) {
        clearInterval(timer);
        if (this.activeMove) {
          this.activeMove.timers = this.activeMove.timers.filter((activeTimer) => activeTimer !== timer);
        }
        this.window.setPosition(segment.to.x, segment.to.y);
        this.runSegments(segments, request, index + 1, finalTarget);
      }
    }, FRAME_MS);

    this.activeMove.timers.push(timer);
  }

  private resolveSegmentDuration(segment: MoveSegment, segments: MoveSegment[], request: MoveToRequest): number {
    if (typeof request.durationMs === 'number' && Number.isFinite(request.durationMs)) {
      const totalDistance = segments.reduce((sum, item) => sum + item.distance, 0);
      const totalDuration = this.clamp(request.durationMs, MIN_EXPLICIT_DURATION_MS, MAX_EXPLICIT_DURATION_MS);
      if (totalDistance <= 0) return MIN_EXPLICIT_DURATION_MS;
      return this.clamp(totalDuration * (segment.distance / totalDistance), MIN_EXPLICIT_DURATION_MS, MAX_EXPLICIT_DURATION_MS);
    }
    return this.resolveDuration(segment.distance, request);
  }
```

- [ ] **Step 5: Update `finish()` for multiple timers**

Replace `finish(...)` with:

```ts
  private finish(success: boolean, cancelled: boolean, cancelReason?: MoveCancelReason): void {
    if (!this.activeMove) return;
    const active = this.activeMove;
    for (const timer of active.timers) {
      clearInterval(timer);
    }
    this.activeMove = null;
    this.sendVisual({ active: false, reason: active.reason });
    active.resolve(this.result(success, cancelled, cancelReason));
  }
```

- [ ] **Step 6: Build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/move-controller.ts
git commit -m "feat: segment move controller by axis"
```

---

### Task 3: Add teleport IPC bridge

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.ts`

**Interfaces:**
- Consumes: `MoveController.teleportTo(request: MoveToRequest): MoveResult`.
- Produces: IPC `teleport-to`; preload `window.companion.teleportTo(request): Promise<any>`.

- [ ] **Step 1: Add main process IPC handle**

In `src/main/main.ts`, after the existing `ipcMain.handle('move-to', ...)` block, add:

```ts
  ipcMain.handle('teleport-to', async (_event, request: MoveToRequest) => {
    if (!moveController) {
      return { success: false, cancelled: false, finalPosition: { x: 0, y: 0 } };
    }
    return moveController.teleportTo(request);
  });
```

- [ ] **Step 2: Add preload bridge**

In `src/main/preload.ts`, after `moveTo`, add:

```ts
  teleportTo: (request: any): Promise<any> => {
    return ipcRenderer.invoke('teleport-to', request);
  },
```

- [ ] **Step 3: Build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/main.ts src/main/preload.ts
git commit -m "feat: add teleport move ipc"
```

---

### Task 4: Replace renderer dragged fallback with move sprite player

**Files:**
- Modify: `src/renderer/renderer.ts`
- Modify: `src/renderer/style.css`

**Interfaces:**
- Consumes: `move-visual` payload `{ active: boolean; direction?: 'left' | 'right' | 'up' | 'down'; reason?: string }`.
- Produces: renderer playback from `<SPRITE_DIR>/move/move/move_*.png`, `<SPRITE_DIR>/move/up/up_*.png`, `<SPRITE_DIR>/move/down/down_0.png`.

- [ ] **Step 1: Add move animation variables**

In `src/renderer/renderer.ts`, near existing move visual variables, replace:

```ts
  var isMoveVisualActive = false;
  var currentMoveDirection: string | null = null;
```

with:

```ts
  var isMoveVisualActive = false;
  var currentMoveDirection: string | null = null;
  var moveAnimTimer: ReturnType<typeof setInterval> | null = null;
  var moveFrameIndex = 0;
  var moveUpForward = true;
```

- [ ] **Step 2: Clear move visual when drag starts**

In the `mousedown` handler, immediately before `setSprite('dragged');`, add:

```ts
      clearMoveVisualClasses();
      stopMoveAnimation();
```

- [ ] **Step 3: Replace `updateMoveVisual()`**

Replace the current `updateMoveVisual(payload: any): void` function with:

```ts
  function updateMoveVisual(payload: any): void {
    if (!payload || !payload.active) {
      if (!isMoveVisualActive) return;
      isMoveVisualActive = false;
      currentMoveDirection = null;
      clearMoveVisualClasses();
      stopMoveAnimation();
      lastVisualState = '';
      updateVisual(currentState, null);
      return;
    }

    if (isDragVisualActive) return;

    var direction = payload.direction || 'right';
    if (direction !== 'left' && direction !== 'right' && direction !== 'up' && direction !== 'down') {
      direction = 'right';
    }

    isMoveVisualActive = true;
    companionEl.className = 'move-visual';

    if (direction !== currentMoveDirection) {
      currentMoveDirection = direction;
      startMoveAnimation(direction);
    }
  }
```

- [ ] **Step 4: Add move sprite helper and animation functions before `setSprite()`**

```ts
  function setMoveSprite(group: string, frame: string): void {
    if (!SPRITE_DIR) return;
    var path = SPRITE_DIR + 'move/' + group + '/' + frame + '.png';
    console.log('[MoveSprite]', group + '/' + frame);
    spriteEl.src = path;
  }

  function startMoveAnimation(direction: string): void {
    stopMoveAnimation();
    clearMoveVisualClasses();
    moveFrameIndex = 0;
    moveUpForward = true;

    if (direction === 'right') {
      spriteEl.classList.add('companion-move-flip');
    }

    if (direction === 'left' || direction === 'right') {
      playMoveWalkFrame();
      moveAnimTimer = setInterval(playMoveWalkFrame, 300);
      return;
    }

    if (direction === 'up') {
      playMoveUpFrame();
      moveAnimTimer = setInterval(playMoveUpFrame, 300);
      return;
    }

    if (direction === 'down') {
      companionEl.classList.add('companion-move-down');
      setMoveSprite('down', 'down_0');
    }
  }

  function playMoveWalkFrame(): void {
    var frame = 'move_' + (moveFrameIndex + 1);
    setMoveSprite('move', frame);
    moveFrameIndex = (moveFrameIndex + 1) % 5;
  }

  function playMoveUpFrame(): void {
    var frame = moveUpForward ? 'up_1' : 'up_2';
    setMoveSprite('up', frame);
    moveUpForward = !moveUpForward;
  }

  function stopMoveAnimation(): void {
    if (moveAnimTimer) {
      clearInterval(moveAnimTimer);
      moveAnimTimer = null;
    }
    moveFrameIndex = 0;
    moveUpForward = true;
  }

  function clearMoveVisualClasses(): void {
    spriteEl.classList.remove('companion-move-flip');
    companionEl.classList.remove('companion-move-down');
  }
```

- [ ] **Step 5: Add CSS classes**

In `src/renderer/style.css`, after `#sprite` block, add:

```css
#sprite.companion-move-flip {
  transform: scaleX(-1);
}

@keyframes move-down-sway {
  0%, 100% { transform: translateX(-50%) rotate(0deg); }
  25% { transform: translateX(calc(-50% - 1px)) rotate(-1deg); }
  75% { transform: translateX(calc(-50% + 1px)) rotate(1deg); }
}

#companion.companion-move-down {
  animation: move-down-sway 0.6s ease-in-out infinite;
}
```

- [ ] **Step 6: Build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/renderer.ts src/renderer/style.css
git commit -m "feat: play move sprite sequences"
```

---

### Task 5: Update project docs and final verification

**Files:**
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`

**Interfaces:**
- Consumes: completed move controller, teleport IPC, renderer move sprite player.
- Produces: docs describing current move behavior and assets.

- [ ] **Step 1: Update `PROJECT_INDEX.md` directory tree**

In the assets section, add `src/assets/sprites/move/` after `sprites/basic/` description:

```md
    └── assets/
        └── sprites/
            ├── basic/      # 状态/拖拽差分图
            └── move/       # 自动移动差分：move_1~5、up_1~2、down_0
```

- [ ] **Step 2: Update `PROJECT_INDEX.md` core module quick reference**

Replace the `move-controller.ts` bullet with:

```md
- `move-controller.ts`：主进程自动移动控制器，提供 `moveTo` / `teleportTo` / `cancel` / `isMoving`；负责坐标 anchor、屏幕 clamp、按 X/Y 单轴分段平滑移动、axisOrder 和 renderer 移动视觉事件。
```

- [ ] **Step 3: Update `PROJECT_INDEX.md` renderer key points**

Add under renderer technical points:

```md
- **自动移动差分**：`move-visual` 激活时播放 `src/assets/sprites/move/` 专用序列；左右使用 `move_1~5` 300ms 循环，右移镜像；上移 `up_1/up_2` 往返；下移 `down_0` 加轻微摆动。
```

- [ ] **Step 4: Update IPC tables**

Add renderer -> main row near `move-to`:

```md
| teleport-to | MoveToRequest | 调试/后续模块用：直接切换桌宠到目标坐标，仍执行 clamp，不播放 move 动画 |
```

- [ ] **Step 5: Update `VERSION.md` Unreleased**

Add under `## Unreleased`:

```md
- Move 模块优化：接入 `src/assets/sprites/move/` 专用差分，自动移动改为可指定轴顺序的 X/Y 单轴分段移动，并新增 `teleportTo` 直接切换接口
```

- [ ] **Step 6: Final build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 7: Inspect status**

Run:

```bash
git status --short
```

Expected: only intended docs are modified before final docs commit.

- [ ] **Step 8: Commit docs**

```bash
git add PROJECT_INDEX.md VERSION.md docs/superpowers/plans/2026-07-15-move-sprites-axis-motion.md
git commit -m "docs: document move sprite axis motion"
```

---

## Self-Review

- Spec coverage: Task 1 commits assets; Task 2 implements `axisOrder`, single-axis segments, clamp reuse and `teleportTo`; Task 3 exposes teleport IPC/preload; Task 4 implements 300ms left/right/up playback, right mirror, down sway and timer/class cleanup; Task 5 updates documentation and version notes.
- Placeholder scan: no TBD/TODO/fill-in placeholders remain.
- Type consistency: `MoveAxisOrder`, `MoveVisibilityMode`, `MoveToRequest`, `MoveResult`, `teleportTo`, `move-visual`, and `teleport-to` names are consistent across tasks.
