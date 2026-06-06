/**
 * 情绪权重系统
 *
 * 每个情绪拥有 0~100 权重，系统自动衰减，取权重最高者为主情绪。
 * 与 UI 完全解耦，纯逻辑模块。
 */

export interface EmotionWeights {
  [emotion: string]: number;
}

export interface EmotionDecayRates {
  [emotion: string]: number;
}

/** 默认衰减率（每秒减少量） */
const DEFAULT_DECAY_RATE = 0.5;

/** 情绪中文标签（用于 AI 提示词） */
const EMOTION_LABELS: Record<string, string> = {
  idle: '平静',
  curious: '好奇',
  sleepy: '困倦',
  lonely: '孤独',
  comfortable: '舒适',
  tried: '疲惫',
  dragged: '被拉扯',
  sleeping: '沉睡',
};

/** 默认衰减率配置 */
const DEFAULT_DECAY_RATES: EmotionDecayRates = {
  idle: 0.3,
  curious: 1.0,
  sleepy: 0.2,
  lonely: 0.3,
  comfortable: 0.5,
  tried: 0.4,
  dragged: 2.0,
  sleeping: 0.1,
};

export class EmotionSystem {
  private weights: EmotionWeights = {};
  private decayRates: EmotionDecayRates;
  private lastTickTime: number = Date.now();

  constructor(decayRates?: EmotionDecayRates) {
    this.decayRates = { ...DEFAULT_DECAY_RATES, ...decayRates };
  }

  // ==================== 初始化 ====================

  /** 初始化情绪基线（启动时调用一次） */
  init(options?: { isNight?: boolean }): void {
    this.weights = {
      idle: 50,
      curious: 0,
      sleepy: options?.isNight ? 40 : 0,
      lonely: 0,
      comfortable: 0,
      tried: 0,
      dragged: 0,
      sleeping: 0,
    };
    this.lastTickTime = Date.now();
  }

  // ==================== 增减接口 ====================

  /** 直接设置权重（钳位到 0~100） */
  set(emotion: string, value: number): void {
    this.weights[emotion] = this.clamp(value);
  }

  /** 增加权重（钳位到 100） */
  increase(emotion: string, amount: number): void {
    const current = this.weights[emotion] || 0;
    this.weights[emotion] = this.clamp(current + amount);
  }

  /** 减少权重（钳位到 0） */
  decrease(emotion: string, amount: number): void {
    const current = this.weights[emotion] || 0;
    this.weights[emotion] = this.clamp(current - amount);
  }

  // ==================== 衰减 ====================

  /** 每次调用按时间差衰减所有权重 */
  tick(): void {
    const now = Date.now();
    const deltaSeconds = (now - this.lastTickTime) / 1000;
    this.lastTickTime = now;

    if (deltaSeconds <= 0 || deltaSeconds > 60) return;

    for (const emotion of Object.keys(this.weights)) {
      const rate = this.decayRates[emotion] ?? DEFAULT_DECAY_RATE;
      this.weights[emotion] = this.clamp(this.weights[emotion] - rate * deltaSeconds);
    }
  }

  /** 设置某情绪的衰减速率（每秒） */
  setDecayRate(emotion: string, rate: number): void {
    this.decayRates[emotion] = rate;
  }

  // ==================== 查询 ====================

  /** 返回权重最高的情绪（空则返回 'idle'） */
  getPrimary(): string {
    let maxEmotion = 'idle';
    let maxWeight = 0;

    for (const [emotion, weight] of Object.entries(this.weights)) {
      if (weight > maxWeight) {
        maxWeight = weight;
        maxEmotion = emotion;
      }
    }

    return maxEmotion;
  }

  /** 获取某情绪权重 */
  getWeight(emotion: string): number {
    return this.weights[emotion] || 0;
  }

  /** 获取所有权重快照 */
  getAll(): EmotionWeights {
    return { ...this.weights };
  }

  /** 获取权重最高的前 N 个情绪 */
  getTop(n: number = 3): Array<{ emotion: string; weight: number }> {
    return Object.entries(this.weights)
      .map(([emotion, weight]) => ({ emotion, weight }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, n);
  }

  // ==================== AI 提示词 ====================

  /** 生成给 AI 的情绪提示词 */
  toPromptString(): string {
    const entries = Object.entries(this.weights)
      .filter(([_, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) return '';

    const parts = entries.map(([emotion, weight]) => {
      const label = EMOTION_LABELS[emotion] || emotion;
      return `${label}(${weight})`;
    });

    return `当前情绪状态：${parts.join('，')}`;
  }

  // ==================== 重置 ====================

  /** 所有权重归零 */
  reset(): void {
    for (const emotion of Object.keys(this.weights)) {
      this.weights[emotion] = 0;
    }
  }

  /** 重置指定情绪 */
  resetEmotion(emotion: string): void {
    this.weights[emotion] = 0;
  }

  // ==================== 内部 ====================

  private clamp(value: number): number {
    return Math.max(0, Math.min(100, value));
  }
}
