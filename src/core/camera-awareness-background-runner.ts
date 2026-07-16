import {
  CameraAwarenessConfig,
  CameraAwarenessSnapshot,
  CameraFrameInput,
} from './camera-awareness-types';

export interface CameraAwarenessBackgroundRunnerPorts {
  getConfig(): CameraAwarenessConfig | null | undefined;
  captureFrame(): Promise<CameraFrameInput>;
  processFrame(frame: CameraFrameInput): Promise<CameraAwarenessSnapshot>;
  onError?(error: Error): void;
}

export interface CameraAwarenessBackgroundRunnerOptions {
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

const DEFAULT_BACKGROUND_INTERVAL_MS = 60 * 1000;

export class CameraAwarenessBackgroundRunner {
  private timer: unknown = null;
  private running = false;
  private inFlight = false;
  private intervalMs = DEFAULT_BACKGROUND_INTERVAL_MS;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;

  constructor(
    private readonly ports: CameraAwarenessBackgroundRunnerPorts,
    options: CameraAwarenessBackgroundRunnerOptions = {}
  ) {
    this.setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  }

  sync(): void {
    const config = this.ports.getConfig();
    if (!config?.enabled || !config.backgroundDetectionEnabled) {
      this.stop();
      return;
    }

    this.start(config.detectionIntervalMs);
  }

  start(intervalMs: number): void {
    const nextInterval = normalizeIntervalMs(intervalMs);
    const intervalChanged = nextInterval !== this.intervalMs;
    this.intervalMs = nextInterval;

    if (!this.running) {
      this.running = true;
      this.scheduleNext();
      return;
    }

    if (intervalChanged) {
      this.scheduleNext();
    }
  }

  stop(): void {
    this.running = false;
    this.clearScheduled();
  }

  isRunning(): boolean {
    return this.running;
  }

  async runOnce(): Promise<void> {
    const config = this.ports.getConfig();
    if (!config?.enabled || !config.backgroundDetectionEnabled) {
      this.stop();
      return;
    }
    if (this.inFlight) {
      return;
    }

    this.inFlight = true;
    try {
      const frame = await this.ports.captureFrame();
      await this.ports.processFrame(frame);
    } catch (error: any) {
      this.ports.onError?.(toError(error));
    } finally {
      this.inFlight = false;
      if (this.running) {
        this.scheduleNext();
      }
    }
  }

  private scheduleNext(): void {
    this.clearScheduled();
    if (!this.running) return;
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.runOnce();
    }, this.intervalMs);
  }

  private clearScheduled(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }
}

function normalizeIntervalMs(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_BACKGROUND_INTERVAL_MS;
  return Math.max(30 * 1000, Math.min(5 * 60 * 1000, Math.round(number)));
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}
