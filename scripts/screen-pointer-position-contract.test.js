const assert = require('assert');
const {
  POINT_MOVE_X_CALIBRATION_PX,
  calculatePointMoveTopLeft,
} = require('../dist/core/screen-pointer-position');

assert.strictEqual(POINT_MOVE_X_CALIBRATION_PX, 10, 'point move x calibration should be +10px');
assert.deepStrictEqual(
  calculatePointMoveTopLeft({ x: 300, y: 200 }, { x: 120, y: 80 }),
  { x: 190, y: 120 },
  'point move top-left should align pointer offset then shift x by +10px'
);

console.log('screen-pointer-position-contract tests passed');
