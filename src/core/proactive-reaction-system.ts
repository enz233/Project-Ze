import { ContextSnapshot } from './context-collector';
import { AIMemory } from './ai-memory';
import { getLogger } from './logger';
import proactiveConfig from '../config/proactive-reactions.json';

export type ActivityCategory = 'code' | 'document' | 'browser' | 'chat' | 'media' | 'game' | 'work' | 'unknown';
export type ProactiveReason =
  | 'work_to_rest'
  | 'rest_to_work'
  | 'long_focus'
  | 'returning_from_idle'
  | 'meaningful_app_switch'
  | 'recent_interaction_followup';

export interface ProactiveComponentContext {
  snapshot: ContextSnapshot;
  category: ActivityCategory;
  previousCategory: ActivityCategory;
  recentDirectInteraction: boolean;
}

export interface ProactiveComponentDecision {
  candidate: ProactiveCandidate | null;
  debug: ProactiveDebugSnapshot;
}

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

export interface ProactiveDebugSnapshot {
  category: ActivityCategory;
  previousCategory: ActivityCategory;
  lastDecision: string;
  lastCandidateReason: string;
  lastSuppressReason: string;
  lastDeliveredMessage: string;
  lastDeliveredAt: number;
  rollingCount: number;
  dailyDelivered: number;
  focusSessionKey: string;
  firedFocusThresholds: number[];
  lastDirectInteraction: DirectInteraction | null;
  configDescription: string;
}

interface ProactiveConfig {
  description: string;
  limits: {
    globalSpacingMs: number;
    rollingWindowMs: number;
    rollingLimit: number;
    dailyLimit: number;
    stableSwitchSeconds: number;
    recentInteractionSwitchSeconds: number;
    workToRestSeconds: number;
    restToWorkSeconds: number;
    idleReturnSeconds: number;
    directInteractionWindowMs: number;
    longFocusThresholdsSeconds: number[];
  };
  cooldownsMs: Record<ProactiveReason, number>;
  categories: Partial<Record<ActivityCategory, string[]>>;
  templates: Record<ProactiveReason, string[]>;
  aiWordingReasons: ProactiveReason[];
}

const CONFIG = proactiveConfig as ProactiveConfig;
const LIMITS = CONFIG.limits;
const GLOBAL_SPACING_MS = LIMITS.globalSpacingMs;
const ROLLING_WINDOW_MS = LIMITS.rollingWindowMs;
const ROLLING_LIMIT = LIMITS.rollingLimit;
const DAILY_LIMIT = LIMITS.dailyLimit;
const STABLE_SWITCH_SECONDS = LIMITS.stableSwitchSeconds;
const WORK_TO_REST_SECONDS = LIMITS.workToRestSeconds;
const REST_TO_WORK_SECONDS = LIMITS.restToWorkSeconds;
const IDLE_RETURN_SECONDS = LIMITS.idleReturnSeconds;
const DIRECT_INTERACTION_WINDOW_MS = LIMITS.directInteractionWindowMs;
const RECENT_INTERACTION_SWITCH_SECONDS = LIMITS.recentInteractionSwitchSeconds;
const LONG_FOCUS_THRESHOLDS = LIMITS.longFocusThresholdsSeconds;

const REASON_COOLDOWNS = CONFIG.cooldownsMs;

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
  private lastDeliveredAt = 0;
  private currentCategory: ActivityCategory = 'unknown';
  private lastDecision = 'not evaluated yet';
  private lastCandidateReason = '';
  private lastSuppressReason = '';

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
    this.currentCategory = category;
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

    if (!candidate) {
      this.lastDecision = `silent: ${previousCategory} → ${category}`;
      this.lastCandidateReason = '';
      this.lastSuppressReason = '';
      return null;
    }

    this.lastCandidateReason = candidate.reason;
    this.lastDecision = `candidate: ${candidate.reason}`;

    const suppressReason = this.getSuppressReason(candidate, now);
    if (suppressReason) {
      this.lastSuppressReason = suppressReason;
      this.lastDecision = `suppressed: ${candidate.reason} / ${suppressReason}`;
      getLogger().log('observer', `[Proactive] suppressed ${candidate.reason}: ${suppressReason}`);
      return null;
    }

    this.lastSuppressReason = '';
    getLogger().log('observer', `[Proactive] candidate ${candidate.reason}: ${candidate.contextSummary}`);
    return candidate;
  }

  /**
   * 主动部件入口：后续 AI/行为系统可以调用这里取得候选与调试状态。
   * 注意：这里仍只做本地候选判断，不直接发气泡、不截图。
   */
  evaluateComponent(snapshot: ContextSnapshot): ProactiveComponentDecision {
    const candidate = this.evaluate(snapshot);
    return {
      candidate,
      debug: this.getDebugSnapshot(),
    };
  }

  markDelivered(candidate: ProactiveCandidate, text?: string): void {
    const now = Date.now();
    this.resetDailyBudgetIfNeeded(now);
    this.lastReasonAt[candidate.reason] = now;
    this.deliveredAt.push(now);
    this.deliveredAt = this.deliveredAt.filter(t => now - t <= ROLLING_WINDOW_MS);
    this.dailyDelivered++;
    this.lastDeliveredMessage = text || candidate.message;
    this.lastDeliveredAt = now;
    this.lastDecision = `delivered: ${candidate.reason}`;
    getLogger().log('observer', `[Proactive] delivered ${candidate.reason}: ${this.lastDeliveredMessage}`);
  }

  getDebugSnapshot(): ProactiveDebugSnapshot {
    const now = Date.now();
    this.deliveredAt = this.deliveredAt.filter(t => now - t <= ROLLING_WINDOW_MS);
    return {
      category: this.currentCategory,
      previousCategory: this.previousCategory,
      lastDecision: this.lastDecision,
      lastCandidateReason: this.lastCandidateReason,
      lastSuppressReason: this.lastSuppressReason,
      lastDeliveredMessage: this.lastDeliveredMessage,
      lastDeliveredAt: this.lastDeliveredAt,
      rollingCount: this.deliveredAt.length,
      dailyDelivered: this.dailyDelivered,
      focusSessionKey: this.focusSessionKey,
      firedFocusThresholds: Array.from(this.firedFocusThresholds),
      lastDirectInteraction: this.lastDirectInteraction,
      configDescription: CONFIG.description,
    };
  }

  classify(snapshot: ContextSnapshot): ActivityCategory {
    const text = `${snapshot.processName || ''} ${snapshot.windowTitle || ''}`.toLowerCase();
    const ordered: ActivityCategory[] = ['code', 'document', 'media', 'game', 'chat', 'browser'];
    for (const category of ordered) {
      if (this.includesAny(text, CONFIG.categories[category] || [])) return category;
    }
    return 'unknown';
  }

  private evaluateTransition(
    snapshot: ContextSnapshot,
    category: ActivityCategory,
    previousCategory: ActivityCategory,
    previousDuration: number,
    changed: boolean
  ): ProactiveCandidate | null {
    const recentInteraction = this.hasRecentDirectInteraction();
    const stableRequirement = recentInteraction ? RECENT_INTERACTION_SWITCH_SECONDS : STABLE_SWITCH_SECONDS;
    if (!changed || previousDuration < stableRequirement) return null;

    const fromWork = this.isWorkCategory(previousCategory);
    const toWork = this.isWorkCategory(category);
    const fromRest = this.isRestCategory(previousCategory);
    const toRest = this.isRestCategory(category);

    if (fromWork && toRest && previousDuration >= WORK_TO_REST_SECONDS) {
      return this.createCandidate('work_to_rest', this.pickTemplate('work_to_rest'), 0.9, this.allowsAIWording('work_to_rest'), snapshot, category, previousCategory, previousDuration);
    }

    if (fromRest && toWork && previousDuration >= REST_TO_WORK_SECONDS) {
      return this.createCandidate('rest_to_work', this.pickTemplate('rest_to_work'), 0.78, this.allowsAIWording('rest_to_work'), snapshot, category, previousCategory, previousDuration);
    }

    if (category !== previousCategory && category !== 'unknown' && previousCategory !== 'unknown') {
      const newApp = snapshot.processName ? this.memory.isNewApp(snapshot.processName) : false;
      const frequentApp = snapshot.processName ? this.memory.isFrequentApp(snapshot.processName) : false;
      if (newApp || frequentApp || recentInteraction) {
        return this.createCandidate('meaningful_app_switch', this.pickTemplate('meaningful_app_switch'), 0.58, this.allowsAIWording('meaningful_app_switch'), snapshot, category, previousCategory, previousDuration);
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
        const templates = CONFIG.templates.long_focus;
        const message = threshold >= 90 * 60 ? (templates[1] || templates[0]) : templates[0];
        return this.createCandidate('long_focus', message, threshold >= 90 * 60 ? 0.86 : 0.74, this.allowsAIWording('long_focus') && threshold >= 90 * 60, snapshot, category, category, duration);
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
    return this.createCandidate('returning_from_idle', this.pickTemplate('returning_from_idle'), 0.82, this.allowsAIWording('returning_from_idle'), snapshot, category, this.previousCategory, idleSeconds);
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

  private pickTemplate(reason: ProactiveReason): string {
    const templates = CONFIG.templates[reason] || [];
    return templates[0] || '我在这里哦~';
  }

  private allowsAIWording(reason: ProactiveReason): boolean {
    return CONFIG.aiWordingReasons.includes(reason);
  }
}
