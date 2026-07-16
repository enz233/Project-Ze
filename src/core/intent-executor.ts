import { IntentExecutionResult, IntentKind, IntentRoutedDecision } from './intent-types';

export type IntentExecutorHandler = (routed: IntentRoutedDecision) => Promise<IntentExecutionResult> | IntentExecutionResult;

export interface IntentExecutorHandlers {
  normalChat?: IntentExecutorHandler;
  screenSummary?: IntentExecutorHandler;
  screenTargetPointer?: IntentExecutorHandler;
  cameraCheckOnce?: IntentExecutorHandler;
  cameraVisualQuery?: IntentExecutorHandler;
  voiceInputHelp?: IntentExecutorHandler;
  settingsDebugHelp?: IntentExecutorHandler;
  proactiveExplain?: IntentExecutorHandler;
  proactiveControl?: IntentExecutorHandler;
}

export class IntentExecutor {
  constructor(private readonly handlers: IntentExecutorHandlers) {}

  async execute(routed: IntentRoutedDecision): Promise<IntentExecutionResult> {
    if (routed.permission.status === 'denied') {
      return { status: 'skipped', message: `Intent denied: ${routed.permission.reason}` };
    }
    if (routed.permission.status === 'needs_confirmation') {
      return { status: 'skipped', message: `Intent needs confirmation: ${routed.permission.reason}` };
    }

    const handler = this.getHandler(routed.decision.intent);
    if (!handler) {
      return { status: 'skipped', message: `No executor handler for intent ${routed.decision.intent}` };
    }

    try {
      return await handler(routed);
    } catch (error) {
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private getHandler(intent: IntentKind): IntentExecutorHandler | undefined {
    switch (intent) {
      case 'normal_chat': return this.handlers.normalChat;
      case 'screen_summary': return this.handlers.screenSummary;
      case 'screen_target_pointer': return this.handlers.screenTargetPointer;
      case 'camera_check_once': return this.handlers.cameraCheckOnce;
      case 'camera_visual_query': return this.handlers.cameraVisualQuery;
      case 'voice_input_help': return this.handlers.voiceInputHelp;
      case 'settings_debug_help': return this.handlers.settingsDebugHelp;
      case 'proactive_explain': return this.handlers.proactiveExplain;
      case 'proactive_control': return this.handlers.proactiveControl;
      case 'unknown': return undefined;
      default: return undefined;
    }
  }
}
