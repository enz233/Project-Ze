import { BrowserWindow, screen } from 'electron';

export type MoveAnchor = 'top-left' | 'center';
export type MoveDirection = 'left' | 'right' | 'up' | 'down';
export type MoveCancelReason = 'drag-start' | 'new-move' | 'manual' | 'window-destroyed';
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
  timers: ReturnType<typeof setInterval>[];
  resolve: (result: MoveResult) => void;
  reason?: string;
}

interface MoveSegment {
  x: number;
  y: number;
  distance: number;
  direction: MoveDirection;
}

const DEFAULT_SPEED_PX_PER_SEC = 320;
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
    if (!this.isValidRequest(request)) {
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
    const totalDistance = Math.abs(dx) + Math.abs(dy);

    if (totalDistance < 1) {
      this.window.setPosition(target.x, target.y);
      this.sendVisual({ active: false, reason: request.reason });
      return { success: true, cancelled: false, finalPosition: target };
    }

    const segments = this.buildSegments({ x: startX, y: startY }, target, request.axisOrder);
    const totalDurationMs = this.resolveDuration(totalDistance, request);

    return new Promise<MoveResult>((resolve) => {
      const activeMove: ActiveMove = { timers: [], resolve, reason: request.reason };
      this.activeMove = activeMove;
      this.runSegment(activeMove, segments, 0, target, totalDurationMs, totalDistance, request.reason);
    });
  }

  teleportTo(request: MoveToRequest): MoveResult {
    if (!this.isValidRequest(request)) {
      return this.result(false, false);
    }

    if (!this.window || this.window.isDestroyed()) {
      return this.result(false, true, 'window-destroyed');
    }

    if (this.activeMove) {
      this.cancel('new-move');
    }

    const target = this.resolveTarget(request);
    this.window.setPosition(target.x, target.y);
    this.sendVisual({ active: false, reason: request.reason });
    return { success: true, cancelled: false, finalPosition: target };
  }

  cancel(reason: MoveCancelReason = 'manual'): void {
    if (!this.activeMove) return;
    this.finish(false, true, reason);
  }

  private runSegment(
    activeMove: ActiveMove,
    segments: MoveSegment[],
    index: number,
    target: { x: number; y: number },
    totalDurationMs: number,
    totalDistance: number,
    reason?: string,
  ): void {
    if (this.activeMove !== activeMove) return;

    const segment = segments[index];
    if (!segment) {
      this.window.setPosition(target.x, target.y);
      this.finish(true, false);
      return;
    }

    if (!this.window || this.window.isDestroyed()) {
      this.finish(false, true, 'window-destroyed');
      return;
    }

    const [startX, startY] = this.window.getPosition();
    const dx = segment.x - startX;
    const dy = segment.y - startY;
    const durationMs = this.resolveSegmentDuration(segment.distance, totalDistance, totalDurationMs, segments.length);
    const startedAt = Date.now();

    this.sendVisual({ active: true, direction: segment.direction, reason });

    const timer = setInterval(() => {
      if (this.activeMove !== activeMove) {
        clearInterval(timer);
        return;
      }

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

      if (t >= 1) {
        clearInterval(timer);
        activeMove.timers = activeMove.timers.filter((activeTimer) => activeTimer !== timer);
        this.window.setPosition(segment.x, segment.y);
        this.runSegment(activeMove, segments, index + 1, target, totalDurationMs, totalDistance, reason);
      }
    }, FRAME_MS);

    activeMove.timers.push(timer);
  }

  private buildSegments(
    start: { x: number; y: number },
    target: { x: number; y: number },
    axisOrder: MoveAxisOrder = 'longer-axis-first',
  ): MoveSegment[] {
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const xSegment: MoveSegment | null = Math.abs(dx) >= 1
      ? {
          x: target.x,
          y: start.y,
          distance: Math.abs(dx),
          direction: dx >= 0 ? 'right' : 'left',
        }
      : null;
    const ySegment: MoveSegment | null = Math.abs(dy) >= 1
      ? {
          x: target.x,
          y: target.y,
          distance: Math.abs(dy),
          direction: dy >= 0 ? 'down' : 'up',
        }
      : null;

    if (xSegment && ySegment) {
      if (axisOrder === 'x-then-y') return [xSegment, ySegment];
      if (axisOrder === 'y-then-x') return [
        { ...ySegment, x: start.x },
        { ...xSegment, y: target.y },
      ];
      if (Math.abs(dx) >= Math.abs(dy)) return [xSegment, ySegment];
      return [
        { ...ySegment, x: start.x },
        { ...xSegment, y: target.y },
      ];
    }

    if (xSegment) return [{ ...xSegment, y: target.y }];
    if (ySegment) return [{ ...ySegment, x: target.x }];
    return [];
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
    const minX = workArea.x;
    const minY = workArea.y;
    const maxX = Math.max(minX, workArea.x + workArea.width - width);
    const maxY = Math.max(minY, workArea.y + workArea.height - height);
    return {
      x: Math.round(Math.min(maxX, Math.max(minX, x))),
      y: Math.round(Math.min(maxY, Math.max(minY, y))),
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

  private resolveSegmentDuration(
    segmentDistance: number,
    totalDistance: number,
    totalDurationMs: number,
    segmentCount: number,
  ): number {
    if (segmentCount <= 1 || totalDistance <= 0) return totalDurationMs;
    return Math.max(FRAME_MS, Math.round(totalDurationMs * (segmentDistance / totalDistance)));
  }

  private finish(success: boolean, cancelled: boolean, cancelReason?: MoveCancelReason): void {
    if (!this.activeMove) return;
    const active = this.activeMove;
    active.timers.forEach((timer) => clearInterval(timer));
    active.timers = [];
    this.activeMove = null;
    try {
      this.sendVisual({ active: false, reason: active.reason });
    } finally {
      active.resolve(this.result(success, cancelled, cancelReason));
    }
  }

  private isValidRequest(request: MoveToRequest): request is MoveToRequest {
    return typeof request === 'object'
      && request !== null
      && Number.isFinite(request.x)
      && Number.isFinite(request.y);
  }

  private result(success: boolean, cancelled: boolean, cancelReason?: MoveCancelReason): MoveResult {
    if (!this.window || this.window.isDestroyed()) {
      return { success, cancelled, cancelReason, finalPosition: { x: 0, y: 0 } };
    }
    const [x, y] = this.window.getPosition();
    return { success, cancelled, cancelReason, finalPosition: { x, y } };
  }

  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
