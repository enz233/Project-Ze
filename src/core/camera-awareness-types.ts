export type CameraAwarenessStatus = 'present' | 'absent' | 'uncertain' | 'unavailable';
export type CameraPresence = 'present' | 'absent' | 'uncertain';
export type CameraAffect = 'positive' | 'neutral' | 'low_energy' | 'unclear';

export type CameraAwarenessReason =
  | 'person_visible'
  | 'no_person_visible'
  | 'foreground_face_too_small'
  | 'too_dark'
  | 'camera_blocked'
  | 'image_unclear'
  | 'api_error';

export type CameraForegroundFaceGateStatus = 'passed' | 'blocked' | 'unavailable' | 'error';

export type CameraForegroundFaceGateReason =
  | 'large_face_visible'
  | 'face_too_small'
  | 'no_face_visible'
  | 'api_unavailable'
  | 'detector_error'
  | 'disabled';

export type CameraAwarenessErrorCode =
  | 'camera_permission_denied'
  | 'camera_not_found'
  | 'capture_failed'
  | 'vision_unavailable'
  | 'vision_parse_failed'
  | 'disabled';

export interface CameraAwarenessConfig {
  enabled: boolean;
  backgroundDetectionEnabled: boolean;
  lightAffectEnabled: boolean;
  detectionIntervalMs: number;
  absentAfterMs: number;
  minConfidence: number;
  foregroundFaceGateEnabled: boolean;
  foregroundFaceMinHeightRatio: number;
  foregroundFaceMinAreaRatio: number;
  returnedReactionEnabled: boolean;
  debugPreviewEnabled: boolean;
}

export interface CameraForegroundFaceGateBox {
  x: number;
  y: number;
  width: number;
  height: number;
  heightRatio: number;
  areaRatio: number;
}

export interface CameraForegroundFaceGateSnapshot {
  status: CameraForegroundFaceGateStatus;
  faceCount: number;
  largestFace?: CameraForegroundFaceGateBox;
  minHeightRatio: number;
  minAreaRatio: number;
  reason: CameraForegroundFaceGateReason;
  error?: string;
}

export interface CameraFrameInput {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  capturedAt: number;
  source: 'settings-test' | 'background' | 'chat-command' | 'intent-command';
  foregroundFaceGate?: CameraForegroundFaceGateSnapshot;
}

export interface CameraAwarenessDetectOptions {
  lightAffectEnabled: boolean;
  minConfidence: number;
  foregroundFaceGateEnabled: boolean;
  foregroundFaceMinHeightRatio: number;
  foregroundFaceMinAreaRatio: number;
}

export interface CameraAwarenessDetectionResult {
  presence: CameraPresence;
  confidence: number;
  affect?: CameraAffect;
  reason: CameraAwarenessReason;
  checkedAt: number;
}

export interface CameraAwarenessSnapshot {
  status: CameraAwarenessStatus;
  lastDetection: CameraAwarenessDetectionResult | null;
  lastChangedAt: number | null;
  lastReturnedAt: number | null;
  backgroundDetectionRunning: boolean;
  lastError?: string;
}

export interface CameraAwarenessEvent {
  type: 'user_returned';
  source: 'camera_awareness';
  affect?: CameraAffect;
  confidence: number;
  occurredAt: number;
}

export const CAMERA_AWARENESS_IPC = {
  getConfig: 'camera-awareness:get-config',
  updateConfig: 'camera-awareness:update-config',
  detectOnce: 'camera-awareness:detect-once',
  processBackgroundFrame: 'camera-awareness:process-background-frame',
  getSnapshot: 'camera-awareness:get-snapshot',
  analyzePrompt: 'camera-awareness:analyze-prompt',
  backgroundCaptureRequest: 'camera-awareness:background-capture-request',
  submitBackgroundFrame: 'camera-awareness:submit-background-frame',
} as const;
