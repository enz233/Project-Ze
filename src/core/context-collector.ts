/**
 * Layer 1: 轻量上下文收集器
 *
 * 持续运行，无截图，无 LLM 调用。
 * 每 30 秒收集一次当前上下文信息。
 */

import { WindowActivityService } from './window-activity-service';

export interface ContextSnapshot {
  windowTitle: string;
  processName: string;
  windowDuration: number;   // 当前窗口停留秒数
  userActive: boolean;      // 用户是否活跃
  currentTime: Date;
}

export class ContextCollector {
  private activityService: WindowActivityService;
  private lastWindowTitle: string = '';
  private lastWindowChangeTime: number = Date.now();
  private lastUserActivityTime: number = Date.now();
  private activityListeners: (() => void)[] = [];

  constructor(activityService: WindowActivityService = new WindowActivityService()) {
    this.activityService = activityService;
    // 监听用户活动（鼠标/键盘）
    this.setupActivityListeners();
  }

  /** 收集当前上下文快照 */
  async collect(): Promise<ContextSnapshot> {
    const windowTitle = await this.activityService.getActiveWindowTitle();
    console.log('[Context] raw window title:', JSON.stringify(windowTitle));
    const now = Date.now();

    // 检测窗口变化
    if (windowTitle !== this.lastWindowTitle) {
      this.lastWindowTitle = windowTitle;
      this.lastWindowChangeTime = now;
    }

    const windowDuration = (now - this.lastWindowChangeTime) / 1000;
    const userActive = (now - this.lastUserActivityTime) < 5000; // 5秒内有活动
    const activity = this.activityService.classify(windowTitle);

    return {
      windowTitle,
      processName: activity.processName,
      windowDuration,
      userActive,
      currentTime: new Date(),
    };
  }

  /** 记录用户活动（由外部调用） */
  recordUserActivity(): void {
    this.lastUserActivityTime = Date.now();
  }

  /** 获取当前窗口停留时间（秒） */
  getWindowDuration(): number {
    return (Date.now() - this.lastWindowChangeTime) / 1000;
  }

  /** 用户是否活跃（5秒内有操作） */
  isUserActive(): boolean {
    return (Date.now() - this.lastUserActivityTime) < 5000;
  }

  /** 设置用户活动监听（鼠标/键盘） */
  private setupActivityListeners(): void {
    // 由外部通过 recordUserActivity() 调用
  }
}
