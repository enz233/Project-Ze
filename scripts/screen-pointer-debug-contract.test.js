const assert = require('assert');
const {
  buildScreenPointerDebugFileName,
  isScreenPointerDebugEnabled,
  sanitizeScreenPointerDebugLabel,
} = require('../dist/core/screen-pointer-debug');

assert.strictEqual(isScreenPointerDebugEnabled({ PROJECT_ZE_SCREEN_POINTER_DEBUG: '1' }), true);
assert.strictEqual(isScreenPointerDebugEnabled({ PROJECT_ZE_SCREEN_POINTER_DEBUG: '0' }), false);
assert.strictEqual(isScreenPointerDebugEnabled({}), false);

assert.strictEqual(sanitizeScreenPointerDebugLabel('screen-pointer-before-locate'), 'screen-pointer-before-locate');
assert.strictEqual(sanitizeScreenPointerDebugLabel('../秘密 frame'), 'frame');
assert.strictEqual(sanitizeScreenPointerDebugLabel(''), 'frame');

const fileName = buildScreenPointerDebugFileName({
  sequence: 7,
  label: 'screen-pointer-before-move',
  sourceDisplayId: 'screen:0:0',
  width: 1280,
  height: 800,
  capturedAt: '2026-07-16T14:30:12.123Z',
});

assert.strictEqual(
  fileName,
  '20260716-143012-123-frame-0007-screen-pointer-before-move-display-screen-0-0-1280x800.png'
);
assert(!fileName.includes(':'), 'debug file name should be Windows-safe');
assert(!fileName.includes('/'), 'debug file name should not contain path separators');
assert(fileName.endsWith('.png'), 'debug file name should be a png');

console.log('screen-pointer-debug-contract tests passed');
