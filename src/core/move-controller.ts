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
