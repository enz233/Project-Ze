export interface ScreenFingerprint {
  width: number;
  height: number;
  values: number[];
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

export function compareScreenFingerprints(
  a?: ScreenFingerprint | null,
  b?: ScreenFingerprint | null
): number | null {
  if (!a || !b) return null;
  if (a.width !== b.width || a.height !== b.height) return null;
  if (a.values.length !== b.values.length) return null;
  if (a.values.length === 0) return null;

  let total = 0;
  for (let i = 0; i < a.values.length; i++) {
    const left = clamp01(a.values[i]);
    const right = clamp01(b.values[i]);
    total += Math.abs(left - right);
  }

  return total / a.values.length;
}
