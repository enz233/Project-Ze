import { IntentSource } from './intent-types';
import { CameraAffect, CameraPresence } from './camera-awareness-types';
import { ScreenTargetPointerResult } from './screen-target-pointer';

export type ResponseWorkflowKind =
  | 'screen_summary_response'
  | 'screen_target_pointer_response'
  | 'camera_check_once_response'
  | 'camera_visual_query_response';

export type WorkflowObservationKind =
  | 'screen_summary'
  | 'screen_target_pointer'
  | 'camera_presence'
  | 'camera_visual';

export type WorkflowAction = 'none' | 'capture_screen' | 'capture_camera' | 'point_target';
export type WorkflowActionStatus = 'completed' | 'skipped' | 'failed' | 'cancelled';
export type WorkflowExecutionStatus = 'handled' | 'failed' | 'fallback';
export type WorkflowSource = Extract<IntentSource, 'screen_dot' | 'text_chat' | 'voice_asr'>;

export interface WorkflowObservation {
  kind: WorkflowObservationKind;
  source: WorkflowSource;
  userText: string;
  summary?: string;
  target?: string;
  found?: boolean;
  confidence?: number;
  reason?: string;
  presence?: CameraPresence;
  affect?: CameraAffect;
  warnings?: string[];
}

export interface WorkflowActionResult {
  action: WorkflowAction;
  status: WorkflowActionStatus;
  messageForModel: string;
  debugReason?: string;
}

export interface WorkflowResponseContext {
  workflow: ResponseWorkflowKind;
  userText: string;
  observations: WorkflowObservation[];
  actionResults: WorkflowActionResult[];
  privacy: {
    persistRawObservations: false;
    allowVisibleReplyInHistory: true;
  };
}

export interface WorkflowChatResponseResult {
  fullResponse: string;
  visibleReplyProduced: boolean;
}

export interface WorkflowExecutionResult {
  workflow: ResponseWorkflowKind;
  status: WorkflowExecutionStatus;
  visibleReplyProduced: boolean;
  debugSummary: string;
  error?: string;
  fallbackMessage?: string;
}

export interface ResponseWorkflowRequest {
  workflow: ResponseWorkflowKind;
  source: WorkflowSource;
  userText: string;
  toolText: string;
}

export interface ScreenSummaryTool {
  analyze(userMessage: string): Promise<string>;
}

export interface ScreenTargetPointerTool {
  handle(message: string, options?: { suppressResultBubble?: boolean }): Promise<ScreenTargetPointerResult>;
}

export interface CameraWorkflowTools {
  checkPresence(): Promise<{
    presence: CameraPresence;
    confidence: number;
    affect?: CameraAffect;
    reason: string;
  }>;
  analyzeVisualQuery(userPrompt: string): Promise<string>;
}

export interface WorkflowChatResponder {
  respondFromWorkflow(context: WorkflowResponseContext): Promise<WorkflowChatResponseResult>;
}

export function createWorkflowPrivacy(): WorkflowResponseContext['privacy'] {
  return {
    persistRawObservations: false,
    allowVisibleReplyInHistory: true,
  };
}

export function actionStatusFromPointerResult(result: ScreenTargetPointerResult): WorkflowActionStatus {
  if (result.cancelReason) return 'cancelled';
  if (!result.handled) return 'skipped';
  if (result.moved) return 'completed';
  if (result.locateResult && !result.moved) return 'skipped';
  return result.message ? 'failed' : 'skipped';
}
