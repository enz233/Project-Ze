import { ContextSnapshot } from './context-collector';
import { AIMemory } from './ai-memory';
import { getLogger } from './logger';

export type ActivityCategory = 'code' | 'document' | 'browser' | 'chat' | 'media' | 'game' | 'work' | 'unknown';
export type ProactiveReason =
  | 'work_to_rest'
  | 'rest_to_work'
  | 'long_focus'
  | 'returning_from_idle'
  | 'meaningful_app_switch'
  | 'recent_interaction_followup';

export interface ProactiveCandidate {
  reason: ProactiveReason;
  message: string;
  importance: number;
  allowAIWording: boolean;
  contextSummary: string;
  category: ActivityCategory;
  previousCategory?: ActivityCategory;
}

interface DirectInteraction {
  type: string;
  detail: string;
  timestamp: number;
}

const GLOBAL_SPACING_MS = 120 * 1000;
const ROLLING_WINDOW_MS = 30 * 60 * 1000;
const ROLLING_LIMIT = 2;
const DAILY_LIMIT = 8;
const STABLE_SWITCH_SECONDS = 120;
const WORK_TO_REST_SECONDS = 25 * 60;
const REST_TO_WORK_SECONDS = 5 * 60;
const IDLE_RETURN_SECONDS = 10 * 60;
const DIRECT_INTERACTION_WINDOW_MS = 5 * 60 * 1000;
const LONG_FOCUS_THRESHOLDS = [45 * 60, 90 * 60];

const REASON_COOLDOWNS: Record<ProactiveReason, number> = {
  work_to_rest: 20 * 60 * 1000,
  rest_to_work: 15 * 60 * 1000,
  long_focus: 0,
  returning_from_idle: 20 * 60 * 1000,
  meaningful_app_switch: 12 * 60 * 1000,
  recent_interaction_followup: 10 * 60 * 1000,
};

/**
 * 情境化主动回应系统。
 * 只负责本地候选判断与节奏控制，不直接发气泡、不截图。
 */
export class ProactiveReactionSystem {
  private memory: AIMemory;
  private previousSnapshot: ContextSnapshot | null = null;
  private previousCategory: ActivityCategory = 'unknown';
  private focusSessionKey = '';
  private focusSessionStart = 0;
  private firedFocusThresholds = new Set<number>();
  private idleStartedAt: number | null = null;
  private lastDirectInteraction: DirectInteraction | null = null;
  private lastReasonAt: Partial<Record<ProactiveReason, number>> = {};
  private deliveredAt: number[] = [];
  private dailyDelivered = 0;
  private dailyDate = '';
  private lastDeliveredMessage = '';

  constructor(memory: AIMemory) {
    this.memory = memory;
  }

  recordDirectInteraction(type: string, detail: string = ''): void {
    this.lastDirectInteraction = { type, detail, timestamp: Date.now() };
    getLogger().log('observer', `[Proactive] direct interaction: ${type}${detail ? ' / ' + detail : ''}`);
  }

  evaluate(snapshot: ContextSnapshot): ProactiveCandidate | null {
    const now = Date.now();
    this.resetDailyBudgetIfNeeded(now);

    const category = this.classify(snapshot);
    const previous = this.previousSnapshot;
    const previousCategory = this.previousCategory;
    const changedWindow = !!previous && snapshot.windowTitle !== previous.windowTitle;
    const changedProcess = !!previous && snapshot.processName !== previous.processName;
    const previousDuration = previous?.windowDuration || 0;

    this.updateIdleState(snapshot, now);
    this.updateFocusSession(snapshot, category, now);

    let candidate: ProactiveCandidate | null = null;

    if (previous && (changedWindow || changedProcess)) {
      candidate = this.evaluateTransition(snapshot, category, previousCategory, previousDuration, changedProcess || changedWindow);
    }

    if (!candidate) {
      candidate = this.evaluateLongFocus(snapshot, category);
    }

    if (!candidate) {
      candidate = this.evaluateReturning(snapshot, category, now, changedWindow || changedProcess);
    }

    this.previousSnapshot = snapshot;
    this.previousCategory = category;

    if (!candidate) return null;

    const suppressReason = this.getSuppressReason(candidate, now);
    if (suppressReason) {
      getLogger().log('observer', `[Proactive] suppressed ${candidate.reason}: ${suppressReason}`);
      return null;
    }

    getLogger().log('observer', `[Proactive] candidate ${candidate.reason}: ${candidate.contextSummary}`);
    return candidate;
  }

  markDelivered(candidate: ProactiveCandidate, text?: string): void {
    const now = Date.now();
    this.resetDailyBudgetIfNeeded(now);
    this.lastReasonAt[candidate.reason] = now;
    this.deliveredAt.push(now);
    this.deliveredAt = this.deliveredAt.filter(t => now - t <= ROLLING_WINDOW_MS);
    this.dailyDelivered++;
    this.lastDeliveredMessage = text || candidate.message;
    getLogger().log('observer', `[Proactive] delivered ${candidate.reason}: ${this.lastDeliveredMessage}`);
  }

  classify(snapshot: ContextSnapshot): ActivityCategory {
    const text = `${snapshot.processName || ''} ${snapshot.windowTitle || ''}`.toLowerCase();
    if (this.includesAny(text, ['visual studio code', 'vscode', 'cursor', 'webstorm', 'intellij', 'pycharm'])) return 'code';
    if (this.includesAny(text, ['word', 'powerpoint', 'excel', 'notion', 'wps', '飞书', '钉钉'])) return 'document';
    if (this.includesAny(text, ['youtube', 'bilibili', '爱奇艺', '腾讯视频', 'netflix'])) return 'media';
    if (this.includesAny(text, ['steam', 'epic', 'wegame', 'game', '游戏'])) return 'game';
    if (this.includesAny(text, ['wechat', '微信', 'qq', 'telegram', 'discord', 'slack'])) return 'chat';
    if (this.includesAny(text, ['chrome', 'edge', 'firefox', 'opera', 'browser', '浏览器'])) return 'browser';
    return 'unknown';
  }

  private evaluateTransition(
    snapshot: ContextSnapshot,
    category: ActivityCategory,
    previousCategory: ActivityCategory,
    previousDuration: number,
    changed: boolean
  ): ProactiveCandidate | null {
    if (!changed || previousDuration < STABLE_SWITCH_SECONDS) return null;

    const fromWork = this.isWorkCategory(previousCategory);
    const toWork = this.isWorkCategory(category);
    const fromRest = this.isRestCategory(previousCategory);
    const toRest = this.isRestCategory(category);
    const recentInteraction = this.hasRecentDirectInteraction();

    if (fromWork && toRest && previousDuration >= WORK_TO_REST_SECONDS) {
      return this.createCandidate('work_to_rest', '辛苦啦，休息一下也很好~', 0.9, true, snapshot, category, previousCategory, previousDuration);
    }

    if (fromRest && toWork && previousDuration >= REST_TO_WORK_SECONDS) {
      return this.createCandidate('rest_to_work', '回来啦，我安静陪你~', 0.78, false, snapshot, category, previousCategory, previousDuration);
    }

    if (category !== previousCategory && category !== 'unknown' && previousCategory !== 'unknown') {
      const newApp = snapshot.processName ? this.memory.isNewApp(snapshot.processName) : false;
      const frequentApp = snapshot.processName ? this.memory.isFrequentApp(snapshot.processName) : false;
      if (newApp || frequentApp || recentInteraction) {
        return this.createCandidate('meaningful_app_switch', '换个东西看看吗？', 0.58, false, snapshot, category, previousCategory, previousDuration);
      }
    }

    return null;
  }

  private evaluateLongFocus(snapshot: ContextSnapshot, category: ActivityCategory): ProactiveCandidate | null {
    if (!this.isWorkCategory(category)) return null;
    const duration = snapshot.windowDuration;
    for (const threshold of LONG_FOCUS_THRESHOLDS) {
      if (duration >= threshold && !this.firedFocusThresholds.has(threshold)) {
        this.firedFocusThresholds.add(threshold);
        const message = threshold >= 90 * 60 ? '好久没休息了，肩膀放松一下。' : '你专注一会儿啦，眨眨眼~';
        return this.createCandidate('long_focus', message, threshold >= 90 * 60 ? 0.86 : 0.74, threshold >= 90 * 60, snapshot, category, category, duration);
      }
    }
    return null;
  }

  private evaluateReturning(snapshot: ContextSnapshot, category: ActivityCategory, now: number, changed: boolean): ProactiveCandidate | null {
    if (!this.idleStartedAt) return null;
    const idleSeconds = (now - this.idleStartedAt) / 1000;
    if (idleSeconds < IDLE_RETURN_SECONDS) return null;
    if (!snapshot.userActive && !changed) return null;
    this.idleStartedAt = null;
    return this.createCandidate('returning_from_idle', '回来啦，我还在这里~', 0.82, true, snapshot, category, this.previousCategory, idleSeconds);
  }

  private updateIdleState(snapshot: ContextSnapshot, now: number): void {
    if (!snapshot.userActive) {
      if (!this.idleStartedAt) this.idleStartedAt = now;
      return;
    }
    // 不在这里清空 idleStartedAt；returning 规则需要看到刚恢复活跃。
  }

  private updateFocusSession(snapshot: ContextSnapshot, category: ActivityCategory, now: number): void {
    if (!this.isWorkCategory(category)) {
      this.focusSessionKey = '';
      this.focusSessionStart = 0;
      this.firedFocusThresholds.clear();
      return;
    }

    const key = `${category}:${snapshot.processName || snapshot.windowTitle}`;
    if (key !== this.focusSessionKey) {
      this.focusSessionKey = key;
      this.focusSessionStart = now;
      this.firedFocusThresholds.clear();
    }
  }

  private createCandidate(
    reason: ProactiveReason,
    message: string,
    importance: number,
    allowAIWording: boolean,
    snapshot: ContextSnapshot,
    category: ActivityCategory,
    previousCategory: ActivityCategory | undefined,
    durationSeconds: number
  ): ProactiveCandidate {
    const contextSummary = [
      previousCategory ? `${previousCategory} → ${category}` : category,
      snapshot.processName || 'unknown app',
      `${Math.round(durationSeconds)}s`,
    ].join(' | ');
    return { reason, message, importance, allowAIWording, contextSummary, category, previousCategory };
  }

  private getSuppressReason(candidate: ProactiveCandidate, now: number): string | null {
    this.deliveredAt = this.deliveredAt.filter(t => now - t <= ROLLING_WINDOW_MS);

    const lastAny = this.deliveredAt[this.deliveredAt.length - 1] || 0;
    if (lastAny && now - lastAny < GLOBAL_SPACING_MS) return 'global spacing';

    if (this.deliveredAt.length >= ROLLING_LIMIT) return 'rolling budget';
    if (this.dailyDelivered >= DAILY_LIMIT) return 'daily budget';

    const cooldown = REASON_COOLDOWNS[candidate.reason];
    const lastReason = this.lastReasonAt[candidate.reason] || 0;
    if (cooldown > 0 && lastReason && now - lastReason < cooldown) return 'reason cooldown';

    if (candidate.message === this.lastDeliveredMessage) return 'duplicate message';
    return null;
  }

  private resetDailyBudgetIfNeeded(now: number): void {
    const today = new Date(now).toDateString();
    if (today !== this.dailyDate) {
      this.dailyDate = today;
      this.dailyDelivered = 0;
      this.deliveredAt = [];
    }
  }

  private hasRecentDirectInteraction(): boolean {
    if (!this.lastDirectInteraction) return false;
    return Date.now() - this.lastDirectInteraction.timestamp <= DIRECT_INTERACTION_WINDOW_MS;
  }

  private isWorkCategory(category: ActivityCategory): boolean {
    return category === 'code' || category === 'document' || category === 'work';
  }

  private isRestCategory(category: ActivityCategory): boolean {
    return category === 'media' || category === 'game' || category === 'chat' || category === 'browser';
  }

  private includesAny(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
  }
}
