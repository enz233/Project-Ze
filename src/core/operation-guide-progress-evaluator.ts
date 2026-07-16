import { OperationGuideProgressEvaluation } from './operation-guide-types';

const FALLBACK_PROGRESS_EVALUATION: OperationGuideProgressEvaluation = {
  completed: false,
  confidence: 0,
  currentStage: '',
  nextTargetVisible: false,
  reason: 'Unable to parse progress evaluation.'
};

export function parseProgressEvaluation(raw: string): OperationGuideProgressEvaluation {
  const parsed = parseJsonEnvelope(raw);
  if (!isRecord(parsed)) return { ...FALLBACK_PROGRESS_EVALUATION };

  return {
    completed: normalizeBoolean(parsed.completed),
    confidence: clampConfidence(parsed.confidence),
    currentStage: cleanText(parsed.currentStage),
    nextTargetVisible: normalizeBoolean(parsed.nextTargetVisible),
    reason: cleanText(parsed.reason)
  };
}

function parseJsonEnvelope(raw: string): unknown {
  const objectText = extractJsonObject(raw);
  if (!objectText) return null;
  try {
    return JSON.parse(objectText);
  } catch {
    return null;
  }
}

function extractJsonObject(raw: string): string | null {
  const text = String(raw || '');
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === '1' || normalized === '是' || normalized === '已完成';
  }
  return false;
}

function clampConfidence(value: unknown): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  if (numberValue < 0) return 0;
  if (numberValue > 1) return 1;
  return numberValue;
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
