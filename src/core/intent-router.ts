import { IntentClassifier } from './intent-classifier';
import {
  IntentCapability,
  IntentDebugRecord,
  IntentDebugSnapshot,
  IntentDecision,
  IntentExecutionResult,
  IntentPermissionResult,
  IntentRequest,
  IntentRoutedDecision,
  isSensitiveCapability,
  summarizeIntentText,
} from './intent-types';

export interface IntentRouterOptions {
  classifier?: IntentClassifier;
  cameraEnabled?: () => boolean;
  debugLimit?: number;
}

const DEFAULT_DEBUG_LIMIT = 10;

export class IntentRouter {
  private readonly classifier: IntentClassifier;
  private readonly cameraEnabled: () => boolean;
  private readonly debugLimit: number;
  private readonly recent: IntentDebugRecord[] = [];

  constructor(options: IntentRouterOptions = {}) {
    this.classifier = options.classifier ?? new IntentClassifier();
    this.cameraEnabled = options.cameraEnabled ?? (() => false);
    this.debugLimit = options.debugLimit ?? DEFAULT_DEBUG_LIMIT;
  }

  async route(request: IntentRequest): Promise<IntentRoutedDecision> {
    const decision = await this.classifier.classify(request);
    const permission = this.applyPermissionPolicy(request, decision);
    const routed = { request, decision, permission };
    this.recordRoute(routed);
    return routed;
  }

  getDebugSnapshot(): IntentDebugSnapshot {
    return {
      recent: this.recent.map((record) => ({
        ...record,
        requiredCapabilities: [...record.requiredCapabilities],
        deniedCapabilities: [...record.deniedCapabilities],
      })),
    };
  }

  recordExecution(result: IntentExecutionResult): void {
    const last = this.recent[this.recent.length - 1];
    if (!last) return;
    last.executorStatus = result.status;
    last.executorMessage = result.message;
    last.executorError = result.error;
  }

  private applyPermissionPolicy(request: IntentRequest, decision: IntentDecision): IntentPermissionResult {
    const deniedCapabilities: IntentCapability[] = [];

    for (const capability of decision.requiredCapabilities) {
      if (!this.isCapabilityAllowed(request, decision, capability)) deniedCapabilities.push(capability);
    }

    if (deniedCapabilities.length > 0) {
      return {
        status: 'denied',
        reason: this.denialReason(request, decision, deniedCapabilities),
        deniedCapabilities,
      };
    }

    if (decision.intent === 'proactive_control' && decision.requiredCapabilities.includes('config_write')) {
      return {
        status: 'needs_confirmation',
        reason: 'proactive reminder changes require explicit confirmation before writing config',
        deniedCapabilities: [],
      };
    }

    return { status: 'allowed', reason: 'intent is allowed by local privacy policy', deniedCapabilities: [] };
  }

  private isCapabilityAllowed(request: IntentRequest, decision: IntentDecision, capability: IntentCapability): boolean {
    if (!isSensitiveCapability(capability)) return true;

    if (capability === 'screen_capture' || capability === 'vision' || capability === 'move_pointer') {
      if (request.source === 'screen_dot') return decision.explicitness !== 'ambiguous';
      return request.userInitiated && decision.explicitness === 'explicit';
    }

    if (capability === 'camera_frame') {
      return request.userInitiated && decision.explicitness === 'explicit' && this.cameraEnabled();
    }

    if (capability === 'config_write') {
      return request.userInitiated && decision.explicitness === 'explicit';
    }

    return false;
  }

  private denialReason(request: IntentRequest, decision: IntentDecision, deniedCapabilities: IntentCapability[]): string {
    if (deniedCapabilities.includes('camera_frame') && !this.cameraEnabled()) {
      return 'camera awareness is disabled; one-shot camera checks cannot run';
    }
    if (decision.explicitness !== 'explicit') {
      return 'sensitive capabilities require explicit user intent';
    }
    if (!request.userInitiated) {
      return 'sensitive capabilities require a user-initiated request';
    }
    return `blocked sensitive capabilities: ${deniedCapabilities.join(', ')}`;
  }

  private recordRoute(routed: IntentRoutedDecision): void {
    this.recent.push({
      occurredAt: new Date().toISOString(),
      source: routed.request.source,
      textSummary: summarizeIntentText(routed.request.text),
      intent: routed.decision.intent,
      confidence: routed.decision.confidence,
      reason: routed.decision.reason,
      usedLlmFallback: routed.decision.usedLlmFallback,
      requiredCapabilities: [...routed.decision.requiredCapabilities],
      permissionStatus: routed.permission.status,
      permissionReason: routed.permission.reason,
      deniedCapabilities: [...routed.permission.deniedCapabilities],
    });
    while (this.recent.length > this.debugLimit) this.recent.shift();
  }
}
