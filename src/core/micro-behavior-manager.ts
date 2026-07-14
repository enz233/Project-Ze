import { BrowserWindow } from 'electron';
import { ProactiveCandidate, ProactiveReason } from './proactive-reaction-system';
import { StateId } from './types';
import { getLogger } from './logger';
import microBehaviorConfig from '../config/micro-behaviors.json';

export type MicroBehaviorType = 'none' | 'pause' | 'wiggle' | 'lean' | 'state_hint' | 'bubble_delay';
export type MicroBehaviorDirection = 'left' | 'right' | 'up' | 'down' | 'center';
export type MicroBehaviorDecisionSource = 'reason_map' | 'default' | 'disabled' | 'invalid';

export interface MicroBehaviorPayload {
  id: string;
  behavior: MicroBehaviorType;
  durationMs: number;
  intensity?: number;
  direction?: MicroBehaviorDirection;
  state?: StateId;
}

export interface MicroBehaviorDecision {
  reason: ProactiveReason;
  behavior: MicroBehaviorType;
  durationMs: number;
  showBubble: boolean;
  bubbleDelayMs: number;
  state?: StateId;
  intensity?: number;
  direction?: MicroBehaviorDirection;
  source: MicroBehaviorDecisionSource;
}

export interface MicroBehaviorResult {
  decision: MicroBehaviorDecision;
  performed: boolean;
  shouldShowBubble: boolean;
  bubbleDelayMs: number;
  message: string;
}

export interface MicroBehaviorDebugSnapshot {
  enabled: boolean;
  lastDecision: MicroBehaviorDecision | null;
  lastResult: MicroBehaviorResult | null;
  recentBehaviors: Array<{
    time: string;
    reason: ProactiveReason;
    behavior: MicroBehaviorType;
    showBubble: boolean;
    success: boolean;
    source: MicroBehaviorDecisionSource;
  }>;
}

interface MicroBehaviorRule {
  behavior: MicroBehaviorType;
  durationMs?: number;
  showBubble?: boolean;
  bubbleDelayMs?: number;
  state?: StateId;
  intensity?: number;
  direction?: MicroBehaviorDirection;
}

interface MicroBehaviorConfig {
  enabled: boolean;
  defaultBehavior: MicroBehaviorRule;
  reasonMap: Partial<Record<ProactiveReason, MicroBehaviorRule>>;
}

const CONFIG = microBehaviorConfig as MicroBehaviorConfig;
const KNOWN_BEHAVIORS: MicroBehaviorType[] = ['none', 'pause', 'wiggle', 'lean', 'state_hint', 'bubble_delay'];
const KNOWN_DIRECTIONS: MicroBehaviorDirection[] = ['left', 'right', 'up', 'down', 'center'];

export class MicroBehaviorManager {
  private mainWindow: BrowserWindow;
  private lastDecision: MicroBehaviorDecision | null = null;
  private lastResult: MicroBehaviorResult | null = null;
  private recentBehaviors: MicroBehaviorDebugSnapshot['recentBehaviors'] = [];

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  evaluate(candidate: ProactiveCandidate): MicroBehaviorDecision {
    if (!CONFIG.enabled) {
      return this.createDecision(candidate.reason, { behavior: 'none', showBubble: true }, 'disabled');
    }

    const mapped = CONFIG.reasonMap[candidate.reason];
    if (mapped) {
      return this.createDecision(candidate.reason, mapped, 'reason_map');
    }

    return this.createDecision(candidate.reason, CONFIG.defaultBehavior, 'default');
  }

  perform(decision: MicroBehaviorDecision): MicroBehaviorResult {
    this.lastDecision = decision;

    const performed = this.sendPayload(decision);
    const result: MicroBehaviorResult = {
      decision,
      performed,
      shouldShowBubble: decision.showBubble,
      bubbleDelayMs: decision.bubbleDelayMs,
      message: performed ? 'micro behavior sent' : 'micro behavior skipped',
    };

    this.lastResult = result;
    this.recordRecent(decision, performed);
    getLogger().log('observer', `[MicroBehavior] ${decision.reason} -> ${decision.behavior}, bubble=${decision.showBubble}, performed=${performed}`);
    return result;
  }

  performForCandidate(candidate: ProactiveCandidate): MicroBehaviorResult {
    return this.perform(this.evaluate(candidate));
  }

  getDebugSnapshot(): MicroBehaviorDebugSnapshot {
    return {
      enabled: CONFIG.enabled,
      lastDecision: this.lastDecision,
      lastResult: this.lastResult,
      recentBehaviors: [...this.recentBehaviors],
    };
  }

  private createDecision(
    reason: ProactiveReason,
    rule: Partial<MicroBehaviorRule>,
    source: MicroBehaviorDecisionSource
  ): MicroBehaviorDecision {
    const fallback = CONFIG.defaultBehavior || { behavior: 'pause', durationMs: 700, showBubble: true, bubbleDelayMs: 0 };
    const behavior = this.normalizeBehavior(rule.behavior || fallback.behavior);
    const direction = this.normalizeDirection(rule.direction || fallback.direction || 'center');
    const valid = behavior !== null && direction !== null;

    if (!valid) {
      return {
        reason,
        behavior: 'none',
        durationMs: 0,
        showBubble: true,
        bubbleDelayMs: 0,
        source: 'invalid',
      };
    }

    return {
      reason,
      behavior,
      durationMs: this.normalizeMs(rule.durationMs ?? fallback.durationMs, 700),
      showBubble: rule.showBubble ?? fallback.showBubble ?? true,
      bubbleDelayMs: this.normalizeMs(rule.bubbleDelayMs ?? fallback.bubbleDelayMs, 0),
      state: rule.state || fallback.state,
      intensity: this.normalizeIntensity(rule.intensity ?? fallback.intensity),
      direction,
      source,
    };
  }

  private sendPayload(decision: MicroBehaviorDecision): boolean {
    if (decision.behavior === 'none') return false;
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return false;

    const payload: MicroBehaviorPayload = {
      id: `${Date.now()}-${decision.reason}`,
      behavior: decision.behavior,
      durationMs: decision.durationMs,
      intensity: decision.intensity,
      direction: decision.direction,
      state: decision.state,
    };

    this.mainWindow.webContents.send('micro-behavior', payload);
    return true;
  }

  private recordRecent(decision: MicroBehaviorDecision, success: boolean): void {
    this.recentBehaviors.unshift({
      time: new Date().toISOString(),
      reason: decision.reason,
      behavior: decision.behavior,
      showBubble: decision.showBubble,
      success,
      source: decision.source,
    });
    this.recentBehaviors = this.recentBehaviors.slice(0, 20);
  }

  private normalizeBehavior(value: unknown): MicroBehaviorType | null {
    return typeof value === 'string' && KNOWN_BEHAVIORS.includes(value as MicroBehaviorType)
      ? value as MicroBehaviorType
      : null;
  }

  private normalizeDirection(value: unknown): MicroBehaviorDirection | null {
    return typeof value === 'string' && KNOWN_DIRECTIONS.includes(value as MicroBehaviorDirection)
      ? value as MicroBehaviorDirection
      : null;
  }

  private normalizeMs(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  private normalizeIntensity(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.max(0, Math.min(1, value));
  }
}
