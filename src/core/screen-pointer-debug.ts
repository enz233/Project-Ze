export interface ScreenPointerDebugEnv {
  PROJECT_ZE_SCREEN_POINTER_DEBUG?: string;
}

export interface ScreenPointerDebugFileNameInput {
  sequence: number;
  label?: string;
  sourceDisplayId?: string;
  width: number;
  height: number;
  capturedAt: string;
}

export function isScreenPointerDebugEnabled(env: ScreenPointerDebugEnv = process.env): boolean {
  return env.PROJECT_ZE_SCREEN_POINTER_DEBUG === '1';
}

export function sanitizeScreenPointerDebugLabel(label?: string): string {
  const sanitized = String(label || 'frame')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return sanitized || 'frame';
}

function sanitizeFileSegment(value?: string): string {
  const sanitized = String(value || 'unknown')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return sanitized || 'unknown';
}

function formatCapturedAt(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/);
  if (!match) return sanitizeFileSegment(value);
  return `${match[1]}${match[2]}${match[3]}-${match[4]}${match[5]}${match[6]}-${match[7]}`;
}

export function buildScreenPointerDebugFileName(input: ScreenPointerDebugFileNameInput): string {
  const sequence = Number.isInteger(input.sequence) && input.sequence >= 0 ? input.sequence : 0;
  const safeSequence = String(sequence).padStart(4, '0');
  const label = sanitizeScreenPointerDebugLabel(input.label);
  const sourceDisplayId = sanitizeFileSegment(input.sourceDisplayId);
  const width = Number.isFinite(input.width) && input.width > 0 ? Math.round(input.width) : 0;
  const height = Number.isFinite(input.height) && input.height > 0 ? Math.round(input.height) : 0;
  return `${formatCapturedAt(input.capturedAt)}-frame-${safeSequence}-${label}-display-${sourceDisplayId}-${width}x${height}.png`;
}
