import { CameraAwarenessConfigManager } from './camera-awareness-config';
import {
  CameraAwarenessConfig,
  CameraAwarenessDetectionResult,
  CameraAwarenessSnapshot,
  CameraFrameInput,
} from './camera-awareness-types';
import { VisionImageAnalyzer } from './vision-image-analyzer';

interface ProactiveBubblePort {
  tryShowProactive(text: string, source?: string): boolean;
}

export interface CameraAwarenessManagerOptions {
  bubbleOrchestrator?: ProactiveBubblePort;
  now?: () => number;
}

export class CameraAwarenessManager {
  private snapshot: CameraAwarenessSnapshot = {
    status: 'unavailable',
    lastDetection: null,
    lastChangedAt: null,
    lastReturnedAt: null,
    backgroundDetectionRunning: false,
  };
  private lastSeenAt: number | null = null;
  private readonly now: () => number;
  private readonly bubbleOrchestrator?: ProactiveBubblePort;

  constructor(
    private configManager: Pick<CameraAwarenessConfigManager, 'get' | 'update'>,
    private visionAnalyzer: Pick<VisionImageAnalyzer, 'detectCameraAwareness'>,
    options: CameraAwarenessManagerOptions = {}
  ) {
    this.now = options.now ?? (() => Date.now());
    this.bubbleOrchestrator = options.bubbleOrchestrator;
  }

  getConfig(): CameraAwarenessConfig {
    return this.configManager.get();
  }

  updateConfig(partial: Partial<CameraAwarenessConfig>): CameraAwarenessConfig {
    this.configManager.update(partial);
    const config = this.configManager.get();
    if (!config.enabled || !config.backgroundDetectionEnabled) {
      this.snapshot = {
        ...this.snapshot,
        status: 'unavailable',
        backgroundDetectionRunning: false,
      };
    }
    return config;
  }

  async detectOnce(frame: CameraFrameInput): Promise<CameraAwarenessDetectionResult> {
    const config = this.configManager.get();
    if (!config.enabled) {
      const disabled = this.createDisabledResult();
      this.snapshot = { ...this.snapshot, lastDetection: disabled, lastError: 'disabled' };
      return disabled;
    }

    const result = await this.detect(frame, config);
    this.snapshot = {
      ...this.snapshot,
      lastDetection: result,
      lastError: result.reason === 'api_error' ? 'vision_unavailable' : undefined,
    };
    return result;
  }

  async processBackgroundFrame(frame: CameraFrameInput): Promise<CameraAwarenessSnapshot> {
    const config = this.configManager.get();
    this.snapshot.backgroundDetectionRunning = Boolean(config.enabled && config.backgroundDetectionEnabled);

    if (!config.enabled || !config.backgroundDetectionEnabled) {
      this.snapshot = {
        ...this.snapshot,
        status: 'unavailable',
        backgroundDetectionRunning: false,
        lastError: 'disabled',
      };
      return this.getSnapshot();
    }

    const result = await this.detect(frame, config);
    this.applyDetection(result, config);
    return this.getSnapshot();
  }

  getSnapshot(): CameraAwarenessSnapshot {
    return { ...this.snapshot };
  }

  stop(): void {
    this.snapshot = {
      ...this.snapshot,
      status: 'unavailable',
      backgroundDetectionRunning: false,
    };
  }

  private async detect(
    frame: CameraFrameInput,
    config: CameraAwarenessConfig
  ): Promise<CameraAwarenessDetectionResult> {
    try {
      return await this.visionAnalyzer.detectCameraAwareness(frame, {
        lightAffectEnabled: config.lightAffectEnabled,
        minConfidence: config.minConfidence,
      });
    } catch (_error) {
      return {
        presence: 'uncertain',
        confidence: 0,
        affect: 'unclear',
        reason: 'api_error',
        checkedAt: this.now(),
      };
    }
  }

  private applyDetection(result: CameraAwarenessDetectionResult, config: CameraAwarenessConfig): void {
    const previousStatus = this.snapshot.status;
    const now = this.now();
    let nextStatus = previousStatus;

    if (result.presence === 'present' && result.confidence >= config.minConfidence) {
      nextStatus = 'present';
      this.lastSeenAt = now;
      if (previousStatus === 'absent' && config.returnedReactionEnabled) {
        this.emitReturned(result, now);
      }
    } else if (result.presence === 'absent') {
      if (this.lastSeenAt !== null && now - this.lastSeenAt >= config.absentAfterMs) {
        nextStatus = 'absent';
      } else if (previousStatus === 'unavailable' || previousStatus === 'uncertain') {
        nextStatus = 'uncertain';
      }
    } else if (previousStatus === 'unavailable') {
      nextStatus = 'uncertain';
    }

    this.snapshot = {
      ...this.snapshot,
      status: nextStatus,
      lastDetection: result,
      lastChangedAt: nextStatus !== previousStatus ? now : this.snapshot.lastChangedAt,
      backgroundDetectionRunning: true,
      lastError: result.reason === 'api_error' ? 'vision_unavailable' : undefined,
    };
  }

  private emitReturned(result: CameraAwarenessDetectionResult, occurredAt: number): void {
    const text = selectReturnedText(result.affect ?? 'unclear');
    const delivered = this.bubbleOrchestrator?.tryShowProactive(text, 'camera_awareness') ?? false;
    if (delivered) {
      this.snapshot.lastReturnedAt = occurredAt;
    }
  }

  private createDisabledResult(): CameraAwarenessDetectionResult {
    return {
      presence: 'uncertain',
      confidence: 0,
      affect: 'unclear',
      reason: 'api_error',
      checkedAt: this.now(),
    };
  }
}

export function selectReturnedText(affect: string): string {
  switch (affect) {
    case 'positive':
      return '回来啦，看起来状态不错～';
    case 'low_energy':
      return '回来啦，慢慢来就好。';
    case 'neutral':
      return '回来啦。';
    default:
      return '回来啦。';
  }
}
