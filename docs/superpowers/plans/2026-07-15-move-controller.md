# Move Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增独立 move 模块，使后续模块可以通过明确接口把桌宠平滑移动到屏幕坐标，并在移动过程中显示方向差分。

**Architecture:** 新建 `MoveController` 作为主进程侧窗口运动控制器，负责坐标 anchor 换算、屏幕可用区域 clamp、插值、取消和 visual IPC。`main.ts` 持有 controller 并在拖拽开始时取消自动移动；renderer 监听 `move-visual` 并复用现有 dragged 方向差分显示移动过程。

**Tech Stack:** Electron 42、TypeScript 6、CommonJS、BrowserWindow、Electron screen/display API、renderer IIFE 脚本、现有 preload IPC 桥。

## Global Constraints

- 默认坐标语义为窗口左上角 `anchor: 'top-left'`。
- 同时支持 `anchor: 'center'`，将目标点解释为窗口中心点。
- 目标位置必须 clamp 到显示器可用区域内。
- 用户拖拽必须立即取消自动移动。
- 不新增 `moving` 状态，不把路径运动塞进状态系统。
- 第一版不实现攀爬，只预留 `edge` 和 `move_climb_*` 命名空间。
- 第一版无 move 专用素材时复用 `dragged_left/right/up/down`。

---

## File Structure

- Create: `src/core/move-controller.ts`
  - 独立移动控制器，导出 `MoveController` 和 move 相关类型。
- Modify: `src/main/main.ts`
  - 初始化 `MoveController`，拖拽开始时取消移动，增加内部/调试 `move-to` IPC handle。
- Modify: `src/main/preload.ts`
  - 增加 `onMoveVisual` 和 `moveTo` 桥接，便于 renderer 视觉监听和后续调试调用。
- Modify: `src/renderer/renderer.ts`
  - 监听 `move-visual`，切换/退出自动移动视觉。
- Optional inspect: `docs/superpowers/specs/2026-07-15-move-controller-design.md`
  - 设计依据。

---

### Task 1: Create MoveController core module

**Files:**
- Create: `src/core/move-controller.ts`

**Interfaces:**
- Produces: `MoveController.moveTo(request: MoveToRequest): Promise<MoveResult>`
- Produces: `MoveController.cancel(reason?: MoveCancelReason): void`
- Produces: `MoveController.isMoving(): boolean`
- Produces types: `MoveAnchor`, `MoveDirection`, `MoveCancelReason`, `MoveToRequest`, `MoveResult`, `MoveVisualEvent`

- [ ] **Step 1: Create `src/core/move-controller.ts` with full implementation**

```ts
import { BrowserWindow, screen } from 'electron';

export type MoveAnchor = 'top-left' | 'center';
export type MoveDirection = 'left' | 'right' | 'up' | 'down';
export type MoveCancelReason = 'drag-start' | 'new-move' | 'manual' | 'window-destroyed';

export interface MoveToRequest {
  x: number;
  y: number;
  anchor?: MoveAnchor;
  durationMs?: number;
  speedPxPerSec?: number;
  reason?: string;
}

export interface MoveResult {
  success: boolean;
  cancelled: boolean;
  cancelReason?: MoveCancelReason;
  finalPosition: { x: number; y: number };
}

export interface MoveVisualEvent {
  active: boolean;
  direction?: MoveDirection;
  edge?: 'left' | 'right' | 'top' | 'bottom';
  reason?: string;
}

interface MoveControllerOptions {
  sendVisual: (event: MoveVisualEvent) => void;
}

interface ActiveMove {
  timer: ReturnType<typeof setInterval>;
  resolve: (result: MoveResult) => void;
  reason?: string;
}

const DEFAULT_SPEED_PX_PER_SEC = 500;
const MIN_AUTO_DURATION_MS = 180;
const MAX_AUTO_DURATION_MS = 3000;
const MIN_EXPLICIT_DURATION_MS = 120;
const MAX_EXPLICIT_DURATION_MS = 5000;
const FRAME_MS = 16;

export class MoveController {
  private window: BrowserWindow;
  private sendVisual: (event: MoveVisualEvent) => void;
  private activeMove: ActiveMove | null = null;

  constructor(window: BrowserWindow, options: MoveControllerOptions) {
    this.window = window;
    this.sendVisual = options.sendVisual;
  }

  isMoving(): boolean {
    return this.activeMove !== null;
  }

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
    const dx = target.x - startX;
    const dy = target.y - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 1) {
      this.window.setPosition(target.x, target.y);
      this.sendVisual({ active: false, reason: request.reason });
      return { success: true, cancelled: false, finalPosition: target };
    }

    const durationMs = this.resolveDuration(distance, request);
    const startedAt = Date.now();
    let lastDirection = this.directionFromDelta(dx, dy);
    this.sendVisual({ active: true, direction: lastDirection, reason: request.reason });

    return new Promise<MoveResult>((resolve) => {
      const timer = setInterval(() => {
        if (!this.window || this.window.isDestroyed()) {
          this.finish(false, true, 'window-destroyed');
          return;
        }

        const elapsed = Date.now() - startedAt;
        const t = Math.min(1, elapsed / durationMs);
        const eased = this.easeInOut(t);
        const nextX = Math.round(startX + dx * eased);
        const nextY = Math.round(startY + dy * eased);
        this.window.setPosition(nextX, nextY);

        const remainingDirection = this.directionFromDelta(target.x - nextX, target.y - nextY);
        if (remainingDirection !== lastDirection) {
          lastDirection = remainingDirection;
          this.sendVisual({ active: true, direction: lastDirection, reason: request.reason });
        }

        if (t >= 1) {
          this.window.setPosition(target.x, target.y);
          this.finish(true, false);
        }
      }, FRAME_MS);

      this.activeMove = { timer, resolve, reason: request.reason };
    });
  }

  cancel(reason: MoveCancelReason = 'manual'): void {
    if (!this.activeMove) return;
    this.finish(false, true, reason);
  }

  private resolveTarget(request: MoveToRequest): { x: number; y: number } {
    const bounds = this.window.getBounds();
    let targetX = request.x;
    let targetY = request.y;

    if ((request.anchor || 'top-left') === 'center') {
      targetX = request.x - bounds.width / 2;
      targetY = request.y - bounds.height / 2;
    }

    return this.clampToWorkArea(targetX, targetY, bounds.width, bounds.height);
  }

  private clampToWorkArea(x: number, y: number, width: number, height: number): { x: number; y: number } {
    const display = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
    const workArea = display.workArea;
    const maxX = Math.max(workArea.x, workArea.x + workArea.width - width);
    const maxY = Math.max(workArea.y, workArea.y + workArea.height - height);
    return {
      x: Math.round(this.clamp(x, workArea.x, maxX)),
      y: Math.round(this.clamp(y, workArea.y, maxY)),
    };
  }

  private resolveDuration(distance: number, request: MoveToRequest): number {
    if (typeof request.durationMs === 'number' && Number.isFinite(request.durationMs)) {
      return this.clamp(request.durationMs, MIN_EXPLICIT_DURATION_MS, MAX_EXPLICIT_DURATION_MS);
    }
    const speed = typeof request.speedPxPerSec === 'number' && request.speedPxPerSec > 0
      ? request.speedPxPerSec
      : DEFAULT_SPEED_PX_PER_SEC;
    return this.clamp((distance / speed) * 1000, MIN_AUTO_DURATION_MS, MAX_AUTO_DURATION_MS);
  }

  private finish(success: boolean, cancelled: boolean, cancelReason?: MoveCancelReason): void {
    if (!this.activeMove) return;
    const active = this.activeMove;
    clearInterval(active.timer);
    this.activeMove = null;
    this.sendVisual({ active: false, reason: active.reason });
    active.resolve(this.result(success, cancelled, cancelReason));
  }

  private result(success: boolean, cancelled: boolean, cancelReason?: MoveCancelReason): MoveResult {
    if (!this.window || this.window.isDestroyed()) {
      return { success, cancelled, cancelReason, finalPosition: { x: 0, y: 0 } };
    }
    const [x, y] = this.window.getPosition();
    return { success, cancelled, cancelReason, finalPosition: { x, y } };
  }

  private directionFromDelta(dx: number, dy: number): MoveDirection {
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
  }

  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
```

- [ ] **Step 2: Build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add src/core/move-controller.ts
git commit -m "feat: add move controller module"
```

---

### Task 2: Integrate MoveController in main and preload

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.ts`

**Interfaces:**
- Consumes: `MoveController`, `MoveToRequest`, `MoveVisualEvent` from `src/core/move-controller.ts`.
- Produces: global `moveController`, IPC handle `move-to`, preload method `moveTo(request)`, preload listener `onMoveVisual(callback)`.

- [ ] **Step 1: Import MoveController types in `src/main/main.ts`**

Add after existing core imports:

```ts
import { MoveController, MoveToRequest } from '../core/move-controller';
```

- [ ] **Step 2: Add global controller variable**

After `let windowActivityService: WindowActivityService;`, add:

```ts
let moveController: MoveController;
```

- [ ] **Step 3: Initialize controller after TTS manager initialization**

In `app.whenReady().then(...)` or the initialization block where managers are constructed, after `ttsManager = new TTSManager(mainWindow, ttsConfigManager);`, add:

```ts
  moveController = new MoveController(mainWindow, {
    sendVisual: (event) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('move-visual', event);
      }
    },
  });
```

- [ ] **Step 4: Cancel move on drag start**

In `ipcMain.on('drag-start', ...)`, add before drag polling begins:

```ts
    moveController?.cancel('drag-start');
```

A good location is immediately after `transitionEngine?.handleDragStart();`.

- [ ] **Step 5: Add move-to IPC handle**

In `setupIPC()`, near other IPC handlers, add:

```ts
  ipcMain.handle('move-to', async (_event, request: MoveToRequest) => {
    if (!moveController) {
      return { success: false, cancelled: false, finalPosition: { x: 0, y: 0 } };
    }
    return await moveController.moveTo(request);
  });
```

- [ ] **Step 6: Add preload bridge**

In `src/main/preload.ts`, inside `contextBridge.exposeInMainWorld('companion', { ... })`, add:

```ts
  moveTo: (request: any): Promise<any> => {
    return ipcRenderer.invoke('move-to', request);
  },
  onMoveVisual: (callback: (payload: any) => void) => {
    ipcRenderer.on('move-visual', (_event, payload) => callback(payload));
  },
```

Place these near `sendWindowMoveBy` and other movement-related APIs.

- [ ] **Step 7: Build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/main/main.ts src/main/preload.ts
git commit -m "feat: wire move controller ipc"
```

---

### Task 3: Add renderer move visual handling

**Files:**
- Modify: `src/renderer/renderer.ts`

**Interfaces:**
- Consumes: preload `window.companion.onMoveVisual(callback)` payload `{ active: boolean; direction?: 'left' | 'right' | 'up' | 'down'; reason?: string }`.
- Produces: move visual mode that reuses `dragged_<direction>` sprites and exits back to current state.

- [ ] **Step 1: Add move visual state variables**

Near drag visual variables, after `var isDragVisualActive = false;`, add:

```ts
  var isMoveVisualActive = false;
  var currentMoveDirection: string | null = null;
```

- [ ] **Step 2: Register move visual listener**

In `setupStateListeners()`, after `onMicroBehavior` or before chat status listener, add:

```ts
    // 主进程发来的自动移动视觉
    // @ts-ignore
    window.companion.onMoveVisual(function (payload: any) {
      updateMoveVisual(payload);
    });
```

- [ ] **Step 3: Add updateMoveVisual function**

Before `playMicroBehavior(payload: any): void`, add:

```ts
  function updateMoveVisual(payload: any): void {
    if (!payload || !payload.active) {
      if (!isMoveVisualActive) return;
      isMoveVisualActive = false;
      currentMoveDirection = null;
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
    companionEl.className = 'dragged';

    if (direction !== currentMoveDirection) {
      currentMoveDirection = direction;
      setSprite('dragged_' + direction);
    }
  }
```

- [ ] **Step 4: Prevent state updates from overriding move visual**

In `updateVisual`, after the drag visual guard:

```ts
    // 拖拽期间不覆盖精灵图
    if (isDragVisualActive) return;
```

add:

```ts
    // 自动移动期间不覆盖移动方向差分
    if (isMoveVisualActive) return;
```

- [ ] **Step 5: Build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/renderer/renderer.ts
git commit -m "feat: show move direction visuals"
```

---

### Task 4: Final verification and docs/index update

**Files:**
- Modify: `PROJECT_INDEX.md`
- Inspect: `src/core/move-controller.ts`
- Inspect: `src/main/main.ts`
- Inspect: `src/main/preload.ts`
- Inspect: `src/renderer/renderer.ts`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: build-verified move module and updated project index.

- [ ] **Step 1: Update `PROJECT_INDEX.md` core module list**

Add to the core module quick reference near other managers:

```md
- `move-controller.ts`：主进程自动移动控制器，提供 `moveTo` / `cancel` / `isMoving`，负责坐标 anchor、屏幕 clamp、平滑移动和 renderer 移动视觉事件。
```

- [ ] **Step 2: Update IPC section**

Add renderer → main row:

```md
| move-to | MoveToRequest | 调试/后续模块用：平滑移动桌宠到目标坐标 |
```

Add main → renderer row:

```md
| move-visual | {active, direction, edge?, reason?} | 自动移动过程方向差分 |
```

- [ ] **Step 3: Run final build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Inspect status**

Run: `git status --short`

Expected: only `PROJECT_INDEX.md` modified before final commit.

- [ ] **Step 5: Commit docs update**

Run:

```bash
git add PROJECT_INDEX.md
git commit -m "docs: document move controller module"
```

---

## Self-Review

- Spec coverage: Task 1 implements independent controller, anchors, clamp, duration, cancellation and visual emission. Task 2 wires main/preload and drag cancellation. Task 3 implements renderer direction visual fallback using dragged sprites. Task 4 updates project documentation.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: `MoveToRequest`, `MoveResult`, `MoveVisualEvent`, `MoveDirection`, and `MoveCancelReason` names match across tasks.
