import { BrowserWindow } from 'electron';
import { BubbleOrchestrator } from './bubble-orchestrator';
import { MoveController } from './move-controller';
import { ScreenAnalyzer, ScreenTargetLocateResult } from './screen-analyzer';
import { WindowActivityService } from './window-activity-service';

export type PointerPose = 'point-right' | 'point-left' | 'point-up' | 'point-down';
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
  '位置',
];

const CONFIDENCE_THRESHOLD = 0.72;
const POINT_HOLD_MS = 5000;
const DEFAULT_POSES: Record<PointerPose, PointerPoseConfig> = {
  'point-right': { pose: 'point-right', pointerOffset: { x: 220, y: 135 } },
  'point-left': { pose: 'point-left', pointerOffset: { x: 30, y: 135 } },
  'point-up': { pose: 'point-up', pointerOffset: { x: 125, y: 35 } },
  'point-down': { pose: 'point-down', pointerOffset: { x: 125, y: 235 } },
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

  constructor(options: ScreenTargetPointerOptions) {
    this.mainWindow = options.mainWindow;
    this.screenAnalyzer = options.screenAnalyzer;
    this.moveController = options.moveController;
    this.bubbleOrchestrator = options.bubbleOrchestrator;
    this.windowActivityService = options.windowActivityService;
  }

  isPointerRequest(message: string): boolean {
    const normalized = message.trim().toLowerCase();
    if (!normalized) return false;
    return POINTER_KEYWORDS.some(keyword => normalized.includes(keyword.toLowerCase()));
  }

  async handle(message: string): Promise<ScreenTargetPointerResult> {
    if (!this.isPointerRequest(message)) {
      return { handled: false, moved: false, message: '' };
    }

    const id = this.startSession();
    const beforeTitle = await this.windowActivityService.getActiveWindowTitle();
    this.showBubble('我看看哦，先别动屏幕~');

    try {
      this.state = 'locating';
      const located = await this.screenAnalyzer.locateTarget(message);
      if (!this.isCurrent(id)) {
        return this.cancelledResult('new-request');
      }

      const afterLocateTitle = await this.windowActivityService.getActiveWindowTitle();
      if (this.hasScreenChanged(beforeTitle, afterLocateTitle)) {
        return this.cancelWithMessage('screen-changed');
      }

      const result = located.result;
      if (!this.canMove(result)) {
        const failureMessage = this.failureMessage(message, result);
        this.showBubble(failureMessage);
        this.finishSession();
        return { handled: true, moved: false, message: failureMessage, locateResult: result };
      }

      const screenPoint = this.screenAnalyzer.mapPointToScreen(located.frame, result.point!);
      const pose = this.choosePose(screenPoint);
      const moveTopLeft = {
        x: screenPoint.x - pose.pointerOffset.x,
        y: screenPoint.y - pose.pointerOffset.y,
      };

      this.state = 'moving';
      const moveResult = await this.moveController.moveTo({
        x: moveTopLeft.x,
        y: moveTopLeft.y,
        anchor: 'top-left',
        reason: 'screen-target-pointer',
        speedPxPerSec: 520,
      });

      if (!this.isCurrent(id)) {
        return this.cancelledResult('new-request');
      }

      const afterMoveTitle = await this.windowActivityService.getActiveWindowTitle();
      if (this.hasScreenChanged(beforeTitle, afterMoveTitle)) {
        return this.cancelWithMessage('screen-changed');
      }

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
    this.sessionId++;
    this.state = 'cancelled';
    this.moveController.cancel('manual');
    this.clearPointVisual();
    this.clearHoldTimer();
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
  }

  private isCurrent(id: number): boolean {
    return id === this.sessionId && this.state !== 'cancelled';
  }

  private canMove(result: ScreenTargetLocateResult): boolean {
    return result.found === true && !!result.point && result.confidence >= CONFIDENCE_THRESHOLD;
  }

  private choosePose(screenPoint: { x: number; y: number }): PointerPoseConfig {
    const bounds = this.mainWindow.getBounds();
    const windowCenterX = bounds.x + bounds.width / 2;
    const windowCenterY = bounds.y + bounds.height / 2;
    const dx = screenPoint.x - windowCenterX;
    const dy = screenPoint.y - windowCenterY;

    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? DEFAULT_POSES['point-right'] : DEFAULT_POSES['point-left'];
    }
    return dy >= 0 ? DEFAULT_POSES['point-down'] : DEFAULT_POSES['point-up'];
  }

  private hasScreenChanged(beforeTitle: string, afterTitle: string): boolean {
    if (!beforeTitle || !afterTitle) return false;
    return beforeTitle !== afterTitle;
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
