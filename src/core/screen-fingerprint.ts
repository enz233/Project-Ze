export interface ScreenFingerprint {
  width: number;
  height: number;
  values: number[];
}

export interface ScreenFingerprintSummary {
  width: number;
  height: number;
  values: number;
  min: number;
  max: number;
  mean: number;
  sample: number[];
  hash: string;
}

export interface ScreenFingerprintDiffSummary {
  average: number;
  max: number;
  p95: number;
  cellsAbove005: number;
  cellsAbove010: number;
  cellsAbove020: number;
}

export const SCREEN_FINGERPRINT_WIDTH = 16;
export const SCREEN_FINGERPRINT_HEIGHT = 9;
export const SCREEN_FINGERPRINT_CHANNELS = 4;
export const SCREEN_FINGERPRINT_CHANGE_THRESHOLD = 0.20;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function fingerprintHash(values: number[]): string {
  let hash = 2166136261;
  for (const value of values) {
    hash ^= Math.round(clamp01(value) * 255);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createScreenFingerprintFromBitmap(
  bitmap: Buffer | Uint8Array,
  width: number,
  height: number,
  channels = SCREEN_FINGERPRINT_CHANNELS
): ScreenFingerprint | null {
  if (!bitmap || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  if (!Number.isInteger(channels) || channels < 3) return null;

  const expectedLength = width * height * channels;
  if (bitmap.length < expectedLength) return null;

  const values: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * channels;
      const r = bitmap[offset] ?? 0;
      const g = bitmap[offset + 1] ?? 0;
      const b = bitmap[offset + 2] ?? 0;
      values.push(clamp01((r + g + b) / (255 * 3)));
    }
  }

  return { width, height, values };
}

export function summarizeScreenFingerprint(fingerprint?: ScreenFingerprint | null): ScreenFingerprintSummary | null {
  if (!fingerprint || fingerprint.values.length === 0) return null;

  let min = 1;
  let max = 0;
  let total = 0;
  for (const raw of fingerprint.values) {
    const value = clamp01(raw);
    if (value < min) min = value;
    if (value > max) max = value;
    total += value;
  }

  return {
    width: fingerprint.width,
    height: fingerprint.height,
    values: fingerprint.values.length,
    min: round4(min),
    max: round4(max),
    mean: round4(total / fingerprint.values.length),
    sample: fingerprint.values.slice(0, 8).map(value => round4(clamp01(value))),
    hash: fingerprintHash(fingerprint.values),
  };
}

export function describeScreenFingerprintDiff(
  a?: ScreenFingerprint | null,
  b?: ScreenFingerprint | null
): ScreenFingerprintDiffSummary | null {
  if (!a || !b) return null;
  if (a.width !== b.width || a.height !== b.height) return null;
  if (a.values.length !== b.values.length) return null;
  if (a.values.length === 0) return null;

  const diffs: number[] = [];
  let total = 0;
  let max = 0;
  let cellsAbove005 = 0;
  let cellsAbove010 = 0;
  let cellsAbove020 = 0;

  for (let i = 0; i < a.values.length; i++) {
    const diff = Math.abs(clamp01(a.values[i]) - clamp01(b.values[i]));
    diffs.push(diff);
    total += diff;
    if (diff > max) max = diff;
    if (diff >= 0.05) cellsAbove005++;
    if (diff >= 0.10) cellsAbove010++;
    if (diff >= 0.20) cellsAbove020++;
  }

  const sorted = diffs.slice().sort((left, right) => left - right);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);

  return {
    average: round4(total / a.values.length),
    max: round4(max),
    p95: round4(sorted[p95Index] ?? 0),
    cellsAbove005,
    cellsAbove010,
    cellsAbove020,
  };
}

export function compareScreenFingerprints(
  a?: ScreenFingerprint | null,
  b?: ScreenFingerprint | null
): number | null {
  return describeScreenFingerprintDiff(a, b)?.average ?? null;
}
