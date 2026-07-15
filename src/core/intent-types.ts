export type IntentSource =
  | 'text_chat'
  | 'voice_asr'
  | 'screen_dot'
  | 'camera_awareness'
  | 'proactive_context'
  | 'debug_panel';

export type IntentKind =
  | 'normal_chat'
  | 'screen_summary'
  | 'screen_target_pointer'
  | 'camera_check_once'
  | 'voice_input_help'
  | 'settings_debug_help'
  | 'proactive_explain'
  | 'proactive_control'
  | 'unknown';

export type IntentCapability =
  | 'llm'
  | 'screen_capture'
  | 'vision'
  | 'camera_frame'
  | 'move_pointer'
  | 'config_read'
  | 'config_write'
  | 'bubble'
  | 'tts';

export type IntentExplicitness = 'explicit' | 'implicit' | 'ambiguous';
export type IntentPermissionStatus = 'allowed' | 'denied' | 'needs_confirmation';
export type IntentExecutionStatus = 'handled' | 'skipped' | 'failed';

export interface IntentRequest {
  source: IntentSource;
  text?: string;
  userInitiated: boolean;
  screenExplicitlyRequested?: boolean;
  cameraExplicitlyRequested?: boolean;
  metadata?: Record<string, unknown>;
}

export interface IntentDecision {
  intent: IntentKind;
  confidence: number;
  reason: string;
  explicitness: IntentExplicitness;
  requiredCapabilities: IntentCapability[];
  usedLlmFallback: boolean;
  target?: string;
}

export interface IntentPermissionResult {
  status: IntentPermissionStatus;
  reason: string;
  deniedCapabilities: IntentCapability[];
}

export interface IntentRoutedDecision {
  request: IntentRequest;
  decision: IntentDecision;
  permission: IntentPermissionResult;
}

export interface IntentExecutionResult {
  status: IntentExecutionStatus;
  message?: string;
  error?: string;
  debug?: Record<string, unknown>;
}

export interface IntentDebugRecord {
  occurredAt: string;
  source: IntentSource;
  textSummary: string;
  intent: IntentKind;
  confidence: number;
  reason: string;
  usedLlmFallback: boolean;
  requiredCapabilities: IntentCapability[];
  permissionStatus: IntentPermissionStatus;
  permissionReason: string;
  deniedCapabilities: IntentCapability[];
  executorStatus?: IntentExecutionStatus;
  executorMessage?: string;
  executorError?: string;
}

export interface IntentDebugSnapshot {
  recent: IntentDebugRecord[];
}

export function isSensitiveCapability(capability: IntentCapability): boolean {
  return capability === 'screen_capture'
    || capability === 'vision'
    || capability === 'camera_frame'
    || capability === 'move_pointer'
    || capability === 'config_write';
}

export function summarizeIntentText(text: string | undefined, maxLength = 80): string {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}
