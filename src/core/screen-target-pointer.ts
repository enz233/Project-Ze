import { BrowserWindow } from 'electron';
import { BubbleOrchestrator } from './bubble-orchestrator';
import { MoveController } from './move-controller';
import { ScreenAnalyzer, ScreenCaptureFrame, ScreenTargetLocateResult } from './screen-analyzer';
import {
  SCREEN_FINGERPRINT_CHANGE_THRESHOLD,
  compareScreenFingerprints,
  describeScreenFingerprintDiff,
  summarizeScreenFingerprint,
} from './screen-fingerprint';
import { WindowActivityService } from './window-activity-service';

const SCREEN_POINTER_DEBUG = process.env.PROJECT_ZE_SCREEN_POINTER_DEBUG === '1';

function debugScreenTargetPointer(message: string, data: Record<string, unknown>): void {
  if (!SCREEN_POINTER_DEBUG) return;
  console.log(message, data);
}

export type PointerPose =
  | 'point-right'
  | 'point-right_down'
  | 'point-down'
  | 'point-left_down'
  | 'point-left'
  | 'point-left_up'
  | 'point-up'
  | 'point-right_up';
export type ScreenPointingSessionState = 'capturing' | 'locating' | 'moving' | 'pointing' | 'cancelled' | 'done';
export type ScreenTargetPointerCancelReason = 'new-request' | 'screen-changed' | 'drag-start' | 'manual';

export interface PointerPoseConfig {
  pose: PointerPose;
  pointerOffset: { x: number; y: number };
}

export interface PointVisualEvent {
  active: boolean;
  pose?: PointerPose;
  reason?: string;
}

export interface ScreenTargetPointerResult {
  handled: boolean;
  moved: boolean;
  message: string;
  locateResult?: ScreenTargetLocateResult;
  cancelReason?: ScreenTargetPointerCancelReason;
}

interface ScreenTargetPointerOptions {
  mainWindow: BrowserWindow;
  screenAnalyzer: ScreenAnalyzer;
  moveController: MoveController;
  bubbleOrchestrator: BubbleOrchestrator;
  windowActivityService: WindowActivityService;
}

const POINTER_KEYWORDS = [
  '指出',
  '指给我',
  '在哪',
  '在哪里',
  '帮我找',
  '找一下',
  '哪个按钮',
  '下载在哪',
  '怎么点',
  '指一下',
  '帮我指出',
  '请指出',
  '帮我指',
  '指给我看',
];

const CONFIDENCE_THRESHOLD = 0.72;
const POINT_HOLD_MS = 7000;
const MOVE_SCREEN_MONITOR_MS = 150;
const DEFAULT_POSES: Record<PointerPose, PointerPoseConfig> = {
  'point-right': { pose: 'point-right', pointerOffset: { x: 220, y: 135 } },
  'point-right_down': { pose: 'point-right_down', pointerOffset: { x: 210, y: 210 } },
  'point-down': { pose: 'point-down', pointerOffset: { x: 125, y: 235 } },
  'point-left_down': { pose: 'point-left_down', pointerOffset: { x: 40, y: 210 } },
  'point-left': { pose: 'point-left', pointerOffset: { x: 30, y: 135 } },
  'point-left_up': { pose: 'point-left_up', pointerOffset: { x: 40, y: 60 } },
  'point-up': { pose: 'point-up', pointerOffset: { x: 125, y: 35 } },
  'point-right_up': { pose: 'point-right_up', pointerOffset: { x: 210, y: 60 } },
};

export class ScreenTargetPointer {
  private mainWindow: BrowserWindow;
  private screenAnalyzer: ScreenAnalyzer;
  private moveController: MoveController;
  private bubbleOrchestrator: BubbleOrchestrator;
  private windowActivityService: WindowActivityService;
  private sessionId = 0;
  private state: ScreenPointingSessionState = 'done';
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private moveMonitorTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: ScreenTargetPointerOptions) {
    this.mainWindow = options.mainWindow;
    this.screenAnalyzer = options.screenAnalyzer;
    this.moveController = options.moveController;
    this.bubbleOrchestrator = options.bubbleOrchestrator;
    this.windowActivityService = options.windowActivityService;
  }

  isPointerRequest(message: string): boolean {
    const normalized = this.normalizePointerMessage(message).toLowerCase();
    if (!normalized) return false;
    return POINTER_KEYWORDS.some(keyword => normalized.includes(keyword.toLowerCase()));
  }

  private normalizePointerMessage(message: string): string {
    const trimmed = message.trim();
    return trimmed.startsWith('.') ? trimmed.slice(1).trim() : trimmed;
  }

  async handle(message: string): Promise<ScreenTargetPointerResult> {
    if (!this.isPointerRequest(message)) {
      return { handled: false, moved: false, message: '' };
    }

    const screenMessage = this.normalizePointerMessage(message);
    const id = this.startSession();
    const beforeTitle = await this.windowActivityService.getActiveWindowTitle();
    debugScreenTargetPointer('[ScreenTargetPointer][debug] session start:', {
      sessionId: id,
      messageLength: screenMessage.length,
      beforeTitlePresent: !!beforeTitle,
      windowBounds: this.mainWindow.getBounds(),
    });
    this.showBubble('我看看哦，先别动屏幕~');

    try {
      this.state = 'locating';
      const locateStartedAt = Date.now();
      const located = await this.screenAnalyzer.locateTarget(screenMessage);
      const locateElapsedMs = Date.now() - locateStartedAt;
      debugScreenTargetPointer('[ScreenTargetPointer][debug] located:', {
        sessionId: id,
        locateElapsedMs,
        frame: {
          origin: located.frame.origin,
          screenSize: located.frame.screenSize,
          imageSize: located.frame.imageSize,
          debug: located.frame.debug,
          fingerprint: summarizeScreenFingerprint(located.frame.fingerprint),
        },
        result: {
          found: located.result.found,
          confidence: located.result.confidence,
          hasPoint: !!located.result.point,
          labelLength: located.result.label?.length ?? 0,
          reasonLength: located.result.reason?.length ?? 0,
        },
      });
      if (!this.isCurrent(id)) {
        return this.cancelledResult('new-request');
      }

      const afterLocateTitle = await this.windowActivityService.getActiveWindowTitle();
      if (this.hasScreenChanged(beforeTitle, afterLocateTitle)) {
        debugScreenTargetPointer('[ScreenTargetPointer][debug] screen changed after locate:', { sessionId: id, beforeTitlePresent: !!beforeTitle, afterTitlePresent: !!afterLocateTitle });
        return this.cancelWithMessage('screen-changed');
      }

      const result = located.result;
      if (!this.canMove(result)) {
        const failureMessage = this.failureMessage(screenMessage, result);
        this.showBubble(failureMessage);
        this.finishSession();
        return { handled: true, moved: false, message: failureMessage, locateResult: result };
      }

      const fingerprintChanged = await this.hasFingerprintChangedBeforeMove(id, located.frame);
      if (!this.isCurrent(id)) {
        return this.cancelledResult('new-request');
      }
      if (fingerprintChanged) {
        debugScreenTargetPointer('[ScreenTargetPointer][debug] screen changed before move:', { sessionId: id });
        return this.screenChangedResult(result);
      }

      const screenPoint = this.screenAnalyzer.mapPointToScreen(located.frame, result.point!);
      const pose = this.choosePose(screenPoint);
      const moveTopLeft = {
        x: screenPoint.x - pose.pointerOffset.x,
        y: screenPoint.y - pose.pointerOffset.y,
      };
      debugScreenTargetPointer('[ScreenTargetPointer][debug] move target:', {
        sessionId: id,
        screenPoint,
        pose,
        moveTopLeft,
        windowBounds: this.mainWindow.getBounds(),
      });

      this.state = 'moving';
      let screenChangedDuringMove = false;
      this.startMoveScreenMonitor(id, beforeTitle, () => {
        screenChangedDuringMove = true;
        this.moveController.cancel('manual');
      });
      const moveResult = await this.moveController.moveTo({
        x: moveTopLeft.x,
        y: moveTopLeft.y,
        anchor: 'top-left',
        reason: 'screen-target-pointer',
        speedPxPerSec: 520,
      });

      this.clearMoveMonitor();

      if (!this.isCurrent(id)) {
        return this.cancelledResult('new-request');
      }

      const afterMoveTitle = await this.windowActivityService.getActiveWindowTitle();
      if (screenChangedDuringMove || this.hasScreenChanged(beforeTitle, afterMoveTitle)) {
        debugScreenTargetPointer('[ScreenTargetPointer][debug] screen changed after move:', {
          sessionId: id,
          beforeTitlePresent: !!beforeTitle,
          afterTitlePresent: !!afterMoveTitle,
          screenChangedDuringMove,
          moveCancelled: moveResult.cancelled,
        });
        return this.screenChangedResult(result);
      }

      debugScreenTargetPointer('[ScreenTargetPointer][debug] move finished:', {
        sessionId: id,
        moveCancelled: moveResult.cancelled,
        finalPosition: moveResult.finalPosition,
        afterTitlePresent: !!afterMoveTitle,
      });

      if (moveResult.cancelled) {
        const messageText = '好啦好啦，我不挡你~';
        this.clearPointVisual();
        this.finishSession();
        this.showBubble(messageText);
        return { handled: true, moved: false, message: messageText, locateResult: result, cancelReason: 'manual' };
      }

      this.state = 'pointing';
      this.sendPointVisual({ active: true, pose: pose.pose, reason: 'screen-target-pointer' });
      const successMessage = this.successMessage(result);
      this.showBubble(successMessage);
      this.startPointScreenMonitor(id, beforeTitle);
      this.schedulePointClear(id);
      return { handled: true, moved: true, message: successMessage, locateResult: result };
    } catch (error: any) {
      const messageText = '我没太看清楚。你把页面停在目标附近，再让我看一次吧。';
      console.error('[ScreenTargetPointer] 指示失败:', error?.message || error);
      this.clearPointVisual();
      this.finishSession();
      this.showBubble(messageText);
      return { handled: true, moved: false, message: messageText };
    }
  }

  cancel(reason: ScreenTargetPointerCancelReason = 'manual'): void {
    if (this.state === 'done' || this.state === 'cancelled') return;
    debugScreenTargetPointer('[ScreenTargetPointer][debug] cancel:', { sessionId: this.sessionId, state: this.state, reason });
    this.sessionId++;
    this.state = 'cancelled';
    this.moveController.cancel('manual');
    this.clearPointVisual();
    this.clearHoldTimer();
    this.clearMoveMonitor();
    if (reason === 'screen-changed') {
      this.showBubble(this.screenChangedMessage());
    } else if (reason === 'drag-start') {
      this.showBubble('好啦好啦，我不挡你~');
    }
  }

  private startSession(): number {
    this.cancel('new-request');
    this.sessionId++;
    this.state = 'capturing';
    return this.sessionId;
  }

  private finishSession(): void {
    this.state = 'done';
    this.clearHoldTimer();
    this.clearMoveMonitor();
  }

  private isCurrent(id: number): boolean {
    return id === this.sessionId && this.state !== 'cancelled';
  }

  private canMove(result: ScreenTargetLocateResult): boolean {
    return result.found === true
      && Number.isFinite(result.confidence)
      && result.confidence >= CONFIDENCE_THRESHOLD
      && !!result.point
      && Number.isFinite(result.point.x)
      && Number.isFinite(result.point.y);
  }

  private choosePose(screenPoint: { x: number; y: number }): PointerPoseConfig {
    const bounds = this.mainWindow.getBounds();
    const windowCenterX = bounds.x + bounds.width / 2;
    const windowCenterY = bounds.y + bounds.height / 2;
    const dx = screenPoint.x - windowCenterX;
    const dy = screenPoint.y - windowCenterY;
    const poseKey = this.poseFromDelta(dx, dy);
    const pose = DEFAULT_POSES[poseKey];

    debugScreenTargetPointer('[ScreenTargetPointer][debug] choose pose:', {
      screenPoint,
      windowBounds: bounds,
      windowCenter: { x: windowCenterX, y: windowCenterY },
      delta: { x: dx, y: dy },
      angleDegrees: Number.isFinite(dx) && Number.isFinite(dy) ? Math.atan2(dy, dx) * 180 / Math.PI : null,
      pose,
    });

    return pose;
  }

  private poseFromDelta(dx: number, dy: number): PointerPose {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 'point-right';
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return 'point-right';

    const normalizedDegrees = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    if (normalizedDegrees < 22.5 || normalizedDegrees >= 337.5) return 'point-right';
    if (normalizedDegrees < 67.5) return 'point-right_down';
    if (normalizedDegrees < 112.5) return 'point-down';
    if (normalizedDegrees < 157.5) return 'point-left_down';
    if (normalizedDegrees < 202.5) return 'point-left';
    if (normalizedDegrees < 247.5) return 'point-left_up';
    if (normalizedDegrees < 292.5) return 'point-up';
    return 'point-right_up';
  }

  private hasScreenChanged(beforeTitle: string, afterTitle: string): boolean {
    if (!beforeTitle || !afterTitle) return false;
    return beforeTitle !== afterTitle;
  }

  private async hasFingerprintChangedBeforeMove(sessionId: number, beforeFrame: ScreenCaptureFrame): Promise<boolean> {
    const beforeSummary = summarizeScreenFingerprint(beforeFrame.fingerprint);
    debugScreenTargetPointer('[ScreenTargetPointer][debug] fingerprint before move check start:', {
      sessionId,
      beforeFrame: {
        origin: beforeFrame.origin,
        screenSize: beforeFrame.screenSize,
        imageSize: beforeFrame.imageSize,
        debug: beforeFrame.debug,
        fingerprint: beforeSummary,
      },
    });

    if (!beforeFrame.fingerprint) {
      debugScreenTargetPointer('[ScreenTargetPointer][debug] fingerprint skip: missing before fingerprint', { sessionId, beforeSummary });
      return false;
    }

    const recaptureStartedAt = Date.now();
    const afterFrame = await this.screenAnalyzer.captureScreenFrame('screen-pointer-before-move');
    const recaptureElapsedMs = Date.now() - recaptureStartedAt;
    const afterSummary = summarizeScreenFingerprint(afterFrame?.fingerprint);
    debugScreenTargetPointer('[ScreenTargetPointer][debug] fingerprint after recapture:', {
      sessionId,
      recaptureElapsedMs,
      afterFrame: afterFrame
        ? {
          origin: afterFrame.origin,
          screenSize: afterFrame.screenSize,
          imageSize: afterFrame.imageSize,
          debug: afterFrame.debug,
          fingerprint: afterSummary,
        }
        : null,
    });

    if (!afterFrame?.fingerprint) {
      debugScreenTargetPointer('[ScreenTargetPointer][debug] fingerprint skip: missing after fingerprint', { sessionId, recaptureElapsedMs, afterSummary });
      return false;
    }

    const diff = compareScreenFingerprints(beforeFrame.fingerprint, afterFrame.fingerprint);
    const diffSummary = describeScreenFingerprintDiff(beforeFrame.fingerprint, afterFrame.fingerprint);
    if (diff === null) {
      debugScreenTargetPointer('[ScreenTargetPointer][debug] fingerprint skip: incomparable fingerprints', {
        sessionId,
        before: beforeSummary,
        after: afterSummary,
      });
      return false;
    }

    const changed = diff >= SCREEN_FINGERPRINT_CHANGE_THRESHOLD;
    debugScreenTargetPointer('[ScreenTargetPointer][debug] fingerprint diff before move:', {
      sessionId,
      diff,
      threshold: SCREEN_FINGERPRINT_CHANGE_THRESHOLD,
      changed,
      diffSummary,
      beforeDebug: beforeFrame.debug,
      afterDebug: afterFrame.debug,
      before: beforeSummary,
      after: afterSummary,
    });
    return changed;
  }

  private successMessage(result: ScreenTargetLocateResult): string {
    const label = result.label || '目标';
    if (result.confidence >= 0.9) return `这里是「${label}」。`;
    return `我觉得是这里，你看看是不是「${label}」。`;
  }

  private failureMessage(message: string, result: ScreenTargetLocateResult): string {
    const label = result.label || this.extractTargetHint(message);
    if (result.found && result.confidence > 0 && result.confidence < CONFIDENCE_THRESHOLD) {
      return `我看到了可能的位置，但不太确定是不是「${label}」。你可以说得更具体一点。`;
    }
    return `我没太看清楚「${label}」在哪里。你可以把页面停在目标附近，再让我看一次。`;
  }

  private extractTargetHint(message: string): string {
    return message
      .replace(/[。！？!?.]/g, '')
      .replace(/帮我/g, '')
      .replace(/请/g, '')
      .replace(/指出/g, '')
      .replace(/指一下/g, '')
      .replace(/在哪里/g, '')
      .replace(/在哪/g, '')
      .trim()
      .slice(0, 20) || '目标';
  }

  private cancelWithMessage(reason: ScreenTargetPointerCancelReason): ScreenTargetPointerResult {
    this.cancel(reason);
    return { handled: true, moved: false, message: this.screenChangedMessage(), cancelReason: reason };
  }

  private screenChangedResult(result?: ScreenTargetLocateResult): ScreenTargetPointerResult {
    const messageText = this.screenChangedMessage();
    this.clearPointVisual();
    this.finishSession();
    this.showBubble(messageText);
    return { handled: true, moved: false, message: messageText, locateResult: result, cancelReason: 'screen-changed' };
  }

  private cancelledResult(reason: ScreenTargetPointerCancelReason): ScreenTargetPointerResult {
    return { handled: true, moved: false, message: '', cancelReason: reason };
  }

  private screenChangedMessage(): string {
    return '屏幕变了，我刚才看到的位置可能不准啦。你重新发一次「.帮我指出xxx」吧。';
  }

  private showBubble(text: string): void {
    this.bubbleOrchestrator.show({ text, source: 'system', priority: 'high' });
  }

  private sendPointVisual(event: PointVisualEvent): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('point-visual', event);
    }
  }

  private clearPointVisual(): void {
    this.sendPointVisual({ active: false, reason: 'screen-target-pointer' });
  }

  private startMoveScreenMonitor(id: number, beforeTitle: string, onChanged: () => void): void {
    this.startScreenMonitor(id, beforeTitle, 'moving', onChanged);
  }

  private startPointScreenMonitor(id: number, beforeTitle: string): void {
    this.startScreenMonitor(id, beforeTitle, 'pointing', () => {
      this.cancel('screen-changed');
    });
  }

  private startScreenMonitor(
    id: number,
    beforeTitle: string,
    expectedState: ScreenPointingSessionState,
    onChanged: () => void
  ): void {
    this.clearMoveMonitor();
    let polling = false;
    this.moveMonitorTimer = setInterval(() => {
      if (polling || !this.isCurrent(id) || this.state !== expectedState) return;
      polling = true;
      this.windowActivityService.getActiveWindowTitle()
        .then(currentTitle => {
          if (this.isCurrent(id) && this.state === expectedState && this.hasScreenChanged(beforeTitle, currentTitle)) {
            debugScreenTargetPointer('[ScreenTargetPointer][debug] screen monitor changed:', {
              sessionId: id,
              expectedState,
              beforeTitlePresent: !!beforeTitle,
              currentTitlePresent: !!currentTitle,
            });
            onChanged();
            this.clearMoveMonitor();
          }
        })
        .catch(error => {
          console.error('[ScreenTargetPointer] 监控活动窗口失败:', error?.message || error);
        })
        .finally(() => {
          polling = false;
        });
    }, MOVE_SCREEN_MONITOR_MS);
  }

  private clearMoveMonitor(): void {
    if (this.moveMonitorTimer) {
      clearInterval(this.moveMonitorTimer);
      this.moveMonitorTimer = null;
    }
  }

  private schedulePointClear(id: number): void {
    this.clearHoldTimer();
    this.holdTimer = setTimeout(() => {
      if (!this.isCurrent(id)) return;
      this.clearPointVisual();
      this.finishSession();
    }, POINT_HOLD_MS);
  }

  private clearHoldTimer(): void {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }
}
