import { BrowserWindow } from 'electron';
import { TimeAwareness } from './time-awareness';
import { StateManager } from './state-manager';
import { WindowActivityService } from './window-activity-service';

/**
 * 气泡管理器 - 管理时间问候、交互气泡、活动监视
 */
export class BubbleManager {
  private mainWindow: BrowserWindow;
  private timeAwareness: TimeAwareness;
  private stateManager: StateManager;
  private activityService: WindowActivityService;
  private activityMonitorTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivityBubble: string = '';
  private lastActivityBubbleTime: number = 0;
  private lastProactiveBubbleTime: number = 0;
  private onActivityCallback: ((title: string) => void) | null = null;

  constructor(
    mainWindow: BrowserWindow,
    timeAwareness: TimeAwareness,
    stateManager: StateManager,
    activityService: WindowActivityService = new WindowActivityService()
  ) {
    this.mainWindow = mainWindow;
    this.timeAwareness = timeAwareness;
    this.stateManager = stateManager;
    this.activityService = activityService;
  }

  /** 设置活动检测回调 */
  setOnActivity(callback: (title: string) => void): void {
    this.onActivityCallback = callback;
  }

  /** 启动时发送问候语 */
  showGreeting(): void {
    const greeting = this.timeAwareness.getGreeting();
    this.sendBubble(greeting);
  }

  /** 启动活动监视 */
  startActivityMonitor(intervalMs: number = 45000): void {
    if (this.activityMonitorTimer) return;
    this.activityMonitorTimer = setInterval(() => {
      this.checkActivity();
    }, intervalMs);
  }

  /** 停止活动监视 */
  stopActivityMonitor(): void {
    if (this.activityMonitorTimer) {
      clearInterval(this.activityMonitorTimer);
      this.activityMonitorTimer = null;
    }
  }

  /** 检测当前活动 */
  private async checkActivity(): Promise<void> {
    try {
      const title = await this.activityService.getActiveWindowTitle();
      if (!title) return;

      // 通知回调
      if (this.onActivityCallback) {
        this.onActivityCallback(title);
      }

      const activity = this.activityService.classify(title);
      const bubble = activity.bubble || null;
      const now = Date.now();
      const ACTIVITY_BUBBLE_COOLDOWN = 20 * 60 * 1000;
      if (bubble && bubble !== this.lastActivityBubble && now - this.lastActivityBubbleTime > ACTIVITY_BUBBLE_COOLDOWN) {
        this.lastActivityBubble = bubble;
        this.lastActivityBubbleTime = now;
        this.sendBubble(bubble);
      }
    } catch (e) {
      // 静默失败
    }
  }

  /** 尝试发送主动气泡，统一状态门禁和短间隔 */
  tryShowProactiveBubble(text: string, source: string = 'proactive'): boolean {
    const currentState = this.stateManager.getCurrentState();
    const allowed = ['idle', 'curious', 'comfortable'];
    if (!allowed.includes(currentState)) {
      console.log(`[BubbleManager] proactive suppressed by state: ${currentState} (${source})`);
      return false;
    }

    const now = Date.now();
    const PROACTIVE_BUBBLE_SPACING = 90 * 1000;
    if (now - this.lastProactiveBubbleTime < PROACTIVE_BUBBLE_SPACING) {
      console.log(`[BubbleManager] proactive suppressed by spacing (${source})`);
      return false;
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('show-bubble', text);
      this.lastProactiveBubbleTime = now;
      return true;
    }
    return false;
  }

  /** 发送气泡到渲染进程（仅在特定状态下） */
  sendBubble(text: string): void {
    const currentState = this.stateManager.getCurrentState();
    const allowed = ['idle', 'curious', 'comfortable'];
    if (!allowed.includes(currentState)) return;

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('show-bubble', text);
    }
  }
}
