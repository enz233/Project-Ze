const assert = require('assert');
const {
  SCREEN_FINGERPRINT_CHANGE_THRESHOLD,
  createScreenFingerprintFromBitmap,
  compareScreenFingerprints,
  describeScreenFingerprintDiff,
  summarizeScreenFingerprint,
} = require('../dist/core/screen-fingerprint');

function rgba(width, height, fill) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = fill.r;
    out[i * 4 + 1] = fill.g;
    out[i * 4 + 2] = fill.b;
    out[i * 4 + 3] = fill.a == null ? 255 : fill.a;
  }
  return out;
}

function splitFrame(width, height) {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const value = x < width / 2 ? 0 : 255;
      out[offset] = value;
      out[offset + 1] = value;
      out[offset + 2] = value;
      out[offset + 3] = 255;
    }
  }
  return out;
}

const black = createScreenFingerprintFromBitmap(rgba(16, 9, { r: 0, g: 0, b: 0 }), 16, 9);
const blackAgain = createScreenFingerprintFromBitmap(rgba(16, 9, { r: 0, g: 0, b: 0 }), 16, 9);
const white = createScreenFingerprintFromBitmap(rgba(16, 9, { r: 255, g: 255, b: 255 }), 16, 9);
const split = createScreenFingerprintFromBitmap(splitFrame(16, 9), 16, 9);

assert(black, 'black fingerprint should be created');
assert(white, 'white fingerprint should be created');
assert.strictEqual(black.width, 16);
assert.strictEqual(black.height, 9);
assert.strictEqual(black.values.length, 16 * 9);
assert.strictEqual(compareScreenFingerprints(black, blackAgain), 0);
assert(compareScreenFingerprints(black, white) >= 0.99, 'black vs white should be near-max diff');
assert(compareScreenFingerprints(black, split) >= SCREEN_FINGERPRINT_CHANGE_THRESHOLD, 'split frame should exceed change threshold');
assert.strictEqual(createScreenFingerprintFromBitmap(Buffer.alloc(3), 16, 9), null, 'invalid bitmap length should return null');
assert.strictEqual(compareScreenFingerprints(black, null), null, 'missing fingerprint should return null diff');
assert.strictEqual(compareScreenFingerprints({ width: 1, height: 1, values: [0] }, black), null, 'mismatched dimensions should return null diff');

const blackSummary = summarizeScreenFingerprint(black);
assert.strictEqual(blackSummary.width, 16);
assert.strictEqual(blackSummary.height, 9);
assert.strictEqual(blackSummary.values, 16 * 9);
assert.strictEqual(blackSummary.min, 0);
assert.strictEqual(blackSummary.max, 0);
assert.strictEqual(blackSummary.mean, 0);
assert.strictEqual(blackSummary.sample.length, 8);
assert.strictEqual(typeof blackSummary.hash, 'string');
assert.strictEqual(blackSummary.hash.length, 8);

const splitDiffSummary = describeScreenFingerprintDiff(black, split);
assert(splitDiffSummary.average >= SCREEN_FINGERPRINT_CHANGE_THRESHOLD, 'diff summary average should match threshold behavior');
assert(splitDiffSummary.max >= 0.99, 'diff summary should include max cell diff');
assert(splitDiffSummary.cellsAbove020 > 0, 'diff summary should count changed cells');
assert.strictEqual(describeScreenFingerprintDiff(black, null), null, 'missing fingerprint should return null diff summary');

console.log('screen-fingerprint-contract tests passed');
