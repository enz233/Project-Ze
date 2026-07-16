const assert = require('assert');

function load(modulePath) {
  return require(`../dist/${modulePath}`);
}

async function testShapeDetectionAdapterDetectsFace() {
  const { ShapeDetectionFacePresenceDetector } = load('core/local-face-presence-detector.js');

  class FakeFaceDetector {
    constructor(options) {
      this.options = options;
    }

    async detect(frame) {
      return frame.faces;
    }
  }

  const detector = new ShapeDetectionFacePresenceDetector({
    faceDetectorCtor: FakeFaceDetector,
    maxDetectedFaces: 2,
    now: () => 1234,
  });

  assert.strictEqual(await detector.isAvailable(), true);
  const result = await detector.detect({
    faces: [
      { boundingBox: { x: 10, y: 20, width: 30, height: 40 } },
      { boundingBox: { x: 50, y: 60, width: 70, height: 80 } },
    ],
  });

  assert.deepStrictEqual(result, {
    status: 'present',
    confidence: 1,
    faceCount: 2,
    boxes: [
      { x: 10, y: 20, width: 30, height: 40 },
      { x: 50, y: 60, width: 70, height: 80 },
    ],
    checkedAt: 1234,
    source: 'shape-detection-api',
    reason: 'face_visible',
    error: undefined,
  });
}

async function testShapeDetectionAdapterReturnsAbsent() {
  const { ShapeDetectionFacePresenceDetector } = load('core/local-face-presence-detector.js');

  class FakeFaceDetector {
    async detect() {
      return [];
    }
  }

  const detector = new ShapeDetectionFacePresenceDetector({
    faceDetectorCtor: FakeFaceDetector,
    now: () => 2222,
  });

  const result = await detector.detect({ frame: true });
  assert.strictEqual(result.status, 'absent');
  assert.strictEqual(result.faceCount, 0);
  assert.strictEqual(result.reason, 'no_face_visible');
  assert.strictEqual(result.source, 'shape-detection-api');
  assert.strictEqual(result.checkedAt, 2222);
}

async function testShapeDetectionAdapterHandlesErrors() {
  const { ShapeDetectionFacePresenceDetector } = load('core/local-face-presence-detector.js');

  class FakeFaceDetector {
    async detect() {
      throw new Error('camera frame rejected');
    }
  }

  const detector = new ShapeDetectionFacePresenceDetector({
    faceDetectorCtor: FakeFaceDetector,
    now: () => 3333,
  });

  const result = await detector.detect({ frame: true });
  assert.strictEqual(result.status, 'uncertain');
  assert.strictEqual(result.reason, 'detector_error');
  assert.strictEqual(result.error, 'camera frame rejected');
}

async function testNoopDetector() {
  const { NoopFacePresenceDetector, createDefaultLocalFacePresenceDetector } = load('core/local-face-presence-detector.js');

  const noop = new NoopFacePresenceDetector(() => 4444);
  assert.strictEqual(await noop.isAvailable(), false);
  assert.deepStrictEqual(await noop.detect({ frame: true }), {
    status: 'unavailable',
    confidence: 0,
    faceCount: 0,
    boxes: [],
    checkedAt: 4444,
    source: 'noop',
    reason: 'api_unavailable',
  });

  const defaultDetector = createDefaultLocalFacePresenceDetector({ now: () => 5555 });
  assert.strictEqual(defaultDetector.source, 'noop');
}

async function run() {
  await testShapeDetectionAdapterDetectsFace();
  await testShapeDetectionAdapterReturnsAbsent();
  await testShapeDetectionAdapterHandlesErrors();
  await testNoopDetector();
  console.log('local-face-presence-detector contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
