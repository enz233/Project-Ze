const assert = require('assert');
const {
  POINT_SUCCESS_BUBBLE_HOLD_MS,
  shouldBlockSpriteDuringPointVisual,
} = require('../dist/renderer/point-visual-guard');

assert.strictEqual(POINT_SUCCESS_BUBBLE_HOLD_MS, 7000, 'point success bubble should match point hold duration');
assert.strictEqual(shouldBlockSpriteDuringPointVisual(true, 'idle'), true, 'idle sprite should not overwrite active point pose');
assert.strictEqual(shouldBlockSpriteDuringPointVisual(true, 'idle_blink_1'), true, 'blink sprite should not overwrite active point pose');
assert.strictEqual(shouldBlockSpriteDuringPointVisual(true, 'sleepy_blink'), true, 'state animation should not overwrite active point pose');
assert.strictEqual(shouldBlockSpriteDuringPointVisual(true, 'point-left'), false, 'point pose updates should be allowed while point visual is active');
assert.strictEqual(shouldBlockSpriteDuringPointVisual(true, 'dragged_left'), false, 'fallback point sprite should be allowed while point visual is active');
assert.strictEqual(shouldBlockSpriteDuringPointVisual(false, 'idle'), false, 'normal visual updates should work when point visual is inactive');

console.log('point-visual-guard-contract tests passed');
