/**
 * 情绪更新器
 *
 * 根据游戏事件驱动 EmotionSystem 的权重增减。
 * 纯逻辑，不涉及 UI。
 */

import { EmotionSystem } from './emotion-system';
import { TimeAwareness } from './time-awareness';

export class EmotionUpdater {
  private emotion: EmotionSystem;
  private timeAwareness: TimeAwareness;
  private lastInteractionTime: number = Date.now();

  constructor(emotion: EmotionSystem, timeAwareness: TimeAwareness) {
    this.emotion = emotion;
    this.timeAwareness = timeAwareness;
  }

  /** 每秒调用一次，处理时间相关的情绪变化 */
  tick(): void {
    // 衰减所有情绪
    this.emotion.tick();

    // sleepy: 随时间缓慢增加，夜晚加速
    const sleepyRate = this.timeAwareness.isNightTime() ? 0.3 : 0.05;
    if (!this.timeAwareness.isLateNight()) {
      this.emotion.increase('sleepy', sleepyRate);
    }

    // sleeping: 深夜时段固定为最高
    if (this.timeAwareness.isLateNight()) {
      this.emotion.set('sleeping', 100);
    }

    // idle: 其他情绪都低时自然升高
    const primary = this.emotion.getPrimary();
    const primaryWeight = this.emotion.getWeight(primary);
    if (primaryWeight < 20) {
      this.emotion.increase('idle', 0.2);
    }

    // curious: 随机小幅波动
    if (Math.random() < 0.1) {
      this.emotion.increase('curious', Math.random() * 2);
    }

    // lonely: 根据无交互时间增加
    const noInteractionSeconds = (Date.now() - this.lastInteractionTime) / 1000;
    this.onNoInteraction(noInteractionSeconds);
  }

  /** 鼠标靠近 */
  onCursorNear(): void {
    this.emotion.increase('curious', 5);
  }

  /** 鼠标离开 */
  onCursorLeave(): void {
    this.emotion.decrease('curious', 10);
  }

  /** 用户交互（点击、输入等） */
  onInteraction(): void {
    this.lastInteractionTime = Date.now();
    this.emotion.decrease('sleepy', 5);
    this.emotion.decrease('lonely', 30);
    this.emotion.increase('comfortable', 10);
    this.emotion.decrease('sleeping', 20);
  }

  /** 长时间无交互（由 tick 中调用） */
  onNoInteraction(seconds: number): void {
    // lonely: 随无交互时间增加，但有上限
    const currentLonely = this.emotion.getWeight('lonely');
    if (currentLonely >= 80) return; // 已经很高了，不再增加

    if (seconds > 600) {
      this.emotion.set('lonely', 80);
    } else if (seconds > 300) {
      this.emotion.increase('lonely', 1.0);
    } else if (seconds > 60) {
      this.emotion.increase('lonely', 0.5);
    }
  }

  /** 拖拽开始 */
  onDragStart(): void {
    this.emotion.set('dragged', 100);
  }

  /** 拖拽中 */
  onDragging(durationSeconds: number): void {
    // dragged 保持最高
    this.emotion.set('dragged', 100);
    // 长时间拖拽增加 tried
    if (durationSeconds > 5) {
      this.emotion.increase('tried', 0.5);
    }
  }

  /** 拖拽结束 */
  onDragEnd(): void {
    // dragged 快速衰减（衰减率已经设为 2.0）
    // 不需要额外操作，tick 会自动衰减
  }

  /** 获取情绪系统实例（供外部查询） */
  getEmotionSystem(): EmotionSystem {
    return this.emotion;
  }
}
