const assert = require('assert');
const {
  DEFAULT_SCREEN_CAPTURE_WIDTH,
  computeScreenCaptureThumbnailSize,
} = require('../dist/core/screen-capture-frame');

const tallDisplay = computeScreenCaptureThumbnailSize({ width: 1707, height: 1067 });
assert.strictEqual(tallDisplay.width, DEFAULT_SCREEN_CAPTURE_WIDTH);
assert.strictEqual(tallDisplay.height, 800, '1707x1067 capture should preserve display aspect ratio instead of forcing 720p');
assert(Math.abs(tallDisplay.width / tallDisplay.height - 1707 / 1067) < 0.002, 'thumbnail aspect ratio should match display aspect ratio');

const standardDisplay = computeScreenCaptureThumbnailSize({ width: 1920, height: 1080 });
assert.deepStrictEqual(standardDisplay, { width: 1280, height: 720 }, '16:9 display can still use 1280x720');

const invalidDisplay = computeScreenCaptureThumbnailSize({ width: 0, height: 0 });
assert.deepStrictEqual(invalidDisplay, { width: 1280, height: 720 }, 'invalid display size should fall back safely');

console.log('screen-capture-frame-contract tests passed');
