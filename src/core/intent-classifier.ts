import {
  IntentCapability,
  IntentDecision,
  IntentExplicitness,
  IntentKind,
  IntentRequest,
} from './intent-types';

export type IntentLlmFallback = (request: IntentRequest, draft: IntentDecision) => Promise<unknown>;

export interface IntentClassifierOptions {
  llmFallback?: IntentLlmFallback;
  enableLlmFallback?: boolean;
  lowConfidenceThreshold?: number;
}

interface ParsedFallback {
  intent?: unknown;
  confidence?: unknown;
  reason?: unknown;
  target?: unknown;
  explicitness?: unknown;
  requires?: unknown;
}

const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.55;
const INTENT_KINDS: IntentKind[] = [
  'normal_chat',
  'screen_summary',
  'screen_target_pointer',
  'camera_check_once',
  'voice_input_help',
  'settings_debug_help',
  'proactive_explain',
  'proactive_control',
  'unknown',
];
const EXPLICITNESS_VALUES: IntentExplicitness[] = ['explicit', 'implicit', 'ambiguous'];
const CAPABILITIES: IntentCapability[] = [
  'llm',
  'screen_capture',
  'vision',
  'camera_frame',
  'move_pointer',
  'config_read',
  'config_write',
  'bubble',
  'tts',
];

export class IntentClassifier {
  private readonly llmFallback?: IntentLlmFallback;
  private readonly enableLlmFallback: boolean;
  private readonly lowConfidenceThreshold: number;

  constructor(options: IntentClassifierOptions = {}) {
    this.llmFallback = options.llmFallback;
    this.enableLlmFallback = options.enableLlmFallback ?? Boolean(options.llmFallback);
    this.lowConfidenceThreshold = options.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE_THRESHOLD;
  }

  async classify(request: IntentRequest): Promise<IntentDecision> {
    const draft = this.classifyByRules(request);
    if (!this.shouldUseLlmFallback(request, draft)) return draft;

    try {
      const raw = await this.llmFallback?.(request, draft);
      const parsed = this.normalizeFallback(raw, draft);
      return { ...parsed, usedLlmFallback: true };
    } catch (error) {
      return {
        ...draft,
        reason: `${draft.reason}; LLM fallback failed: ${error instanceof Error ? error.message : String(error)}`,
        usedLlmFallback: true,
      };
    }
  }

  private classifyByRules(request: IntentRequest): IntentDecision {
    const text = normalizeText(request.text);
    if (!text) return decision('unknown', 0.2, 'empty input', 'ambiguous', [], false);

    if (matchesAny(text, ['你刚才为什么突然说话', '为什么突然说话', '为什么提醒我', '为什么主动提醒'])) {
      return decision('proactive_explain', 0.9, 'user asks why the companion proactively spoke', 'explicit', ['config_read'], false);
    }

    if (matchesAny(text, ['先别主动提醒', '关闭主动提醒', '暂停主动提醒', '别主动提醒'])) {
      return decision('proactive_control', 0.86, 'user explicitly asks to control proactive reminders', 'explicit', ['config_write'], false);
    }

    if (matchesAny(text, ['语音识别没反应', '麦克风没反应', 'asr 出问题', '语音输入没反应', '语音识别好像没反应'])) {
      return decision('voice_input_help', 0.88, 'user asks for voice input diagnostics', 'explicit', ['config_read'], false);
    }

    if (matchesAny(text, ['设置在哪', '打开设置', '调试帮助', 'debug 面板', '配置帮助'])) {
      return decision('settings_debug_help', 0.76, 'user asks for settings or debug help', 'explicit', ['config_read'], false);
    }

    if (matchesAny(text, ['检测一下摄像头状态', '看一下摄像头状态', '摄像头感知有没有工作', '看看我在不在', '检测一下我在不在'])) {
      return decision('camera_check_once', 0.9, 'user explicitly requests one camera awareness check', 'explicit', ['camera_frame'], false);
    }

    const target = extractTarget(text);
    if (target) {
      return decision('screen_target_pointer', 0.88, `user asks to locate target: ${target}`, 'explicit', ['screen_capture', 'vision', 'move_pointer'], false, target);
    }

    if (request.source === 'screen_dot' || matchesAny(text, ['帮我看看这个页面', '看看这个页面', '分析屏幕', '当前页面讲什么', '屏幕上是什么', '这个页面在讲什么'])) {
      return decision('screen_summary', 0.86, 'user explicitly requests current screen summary', 'explicit', ['screen_capture', 'vision', 'llm'], false);
    }

    if (matchesAny(text, ['这里', '这个', '页面', '按钮', '摄像头', '主动', '语音', '设置'])) {
      return decision('unknown', 0.45, 'contextual words present but no safe rule matched', 'ambiguous', [], false);
    }

    return decision('normal_chat', 0.72, 'no multimodal intent matched', 'implicit', ['llm'], false);
  }

  private shouldUseLlmFallback(request: IntentRequest, draft: IntentDecision): boolean {
    if (!this.enableLlmFallback || !this.llmFallback) return false;
    if (draft.confidence >= this.lowConfidenceThreshold && draft.intent !== 'unknown') return false;
    return matchesAny(normalizeText(request.text), ['这里', '这个', '页面', '按钮', '摄像头', '主动', '语音', '设置']);
  }

  private normalizeFallback(raw: unknown, draft: IntentDecision): IntentDecision {
    const value: ParsedFallback = typeof raw === 'string' ? JSON.parse(raw) : (raw as ParsedFallback);
    const intent = INTENT_KINDS.includes(value.intent as IntentKind) ? value.intent as IntentKind : draft.intent;
    const confidence = typeof value.confidence === 'number' && Number.isFinite(value.confidence)
      ? Math.max(0, Math.min(1, value.confidence))
      : draft.confidence;
    const explicitness = EXPLICITNESS_VALUES.includes(value.explicitness as IntentExplicitness)
      ? value.explicitness as IntentExplicitness
      : draft.explicitness;
    const requiredCapabilities = Array.isArray(value.requires)
      ? value.requires.filter((capability): capability is IntentCapability => CAPABILITIES.includes(capability as IntentCapability))
      : draft.requiredCapabilities;
    const target = typeof value.target === 'string' && value.target.trim() ? value.target.trim() : draft.target;

    if (intent === 'screen_target_pointer' && !target) {
      return decision('unknown', 0.2, 'LLM fallback requested target pointer without target', 'ambiguous', [], true);
    }

    return {
      intent,
      confidence,
      reason: typeof value.reason === 'string' && value.reason.trim() ? value.reason.trim() : draft.reason,
      explicitness,
      requiredCapabilities,
      usedLlmFallback: true,
      ...(target ? { target } : {}),
    };
  }
}

function decision(
  intent: IntentKind,
  confidence: number,
  reason: string,
  explicitness: IntentExplicitness,
  requiredCapabilities: IntentCapability[],
  usedLlmFallback: boolean,
  target?: string
): IntentDecision {
  return { intent, confidence, reason, explicitness, requiredCapabilities, usedLlmFallback, ...(target ? { target } : {}) };
}

function normalizeText(text: string | undefined): string {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern.toLowerCase()));
}

function extractTarget(text: string): string | undefined {
  const normalized = normalizeText(text);
  const locateWords = ['指出', '在哪', '哪里', '帮我找', '找到'];
  if (!locateWords.some((word) => normalized.includes(word))) return undefined;

  const knownTargets = ['下载按钮', '登录按钮', '注册按钮', '关闭按钮', '提交按钮', '确认按钮', '取消按钮', '搜索框', '输入框', '链接'];
  const known = knownTargets.find((target) => normalized.includes(target));
  if (known) return known;

  const match = normalized.match(/(?:指出|帮我找|找到)([^，。！？?]{1,24})/);
  if (match?.[1]) return match[1].replace(/在哪|在哪里|位置/g, '').trim() || undefined;
  return undefined;
}
