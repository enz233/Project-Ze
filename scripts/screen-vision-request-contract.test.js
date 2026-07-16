const assert = require('assert');
const {
  getScreenVisionImageDetail,
} = require('../dist/core/screen-vision-request');

assert.strictEqual(getScreenVisionImageDetail('screen-analysis'), 'low', 'ordinary screen analysis should keep low detail');
assert.strictEqual(getScreenVisionImageDetail('target-locate'), 'high', 'target locating should use high detail for UI coordinates/text');
assert.strictEqual(getScreenVisionImageDetail('unknown'), 'low', 'unknown vision purposes should default to low detail');

console.log('screen-vision-request-contract tests passed');
