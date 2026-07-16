const assert = require('assert');
const fs = require('fs');
const path = require('path');

function load(modulePath) {
  return require(`../dist/${modulePath}`);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function assertIncludes(source, expected, message) {
  assert(source.includes(expected), message);
}

function testCameraConfigDefaults() {
  const { DEFAULT_CAMERA_AWARENESS_CONFIG } = load('core/camera-awareness-config.js');
  assert.deepStrictEqual(DEFAULT_CAMERA_AWARENESS_CONFIG, {
    enabled: false,
    backgroundDetectionEnabled: false,
    lightAffectEnabled: true,
    detectionIntervalMs: 60 * 1000,
    absentAfterMs: 120 * 1000,
    minConfidence: 0.65,
    returnedReactionEnabled: true,
    debugPreviewEnabled: false,
  });
}

function testCameraParserAcceptsValidJson() {
  const { parseCameraAwarenessResponse } = load('core/vision-image-analyzer.js');
  const result = parseCameraAwarenessResponse(
    '{"presence":"present","confidence":0.9,"affect":"neutral","reason":"person_visible"}',
    1234
  );
  assert.deepStrictEqual(result, {
    presence: 'present',
    confidence: 0.9,
    affect: 'neutral',
    reason: 'person_visible',
    checkedAt: 1234,
  });
}

function testCameraParserExtractsJsonFromText() {
  const { parseCameraAwarenessResponse } = load('core/vision-image-analyzer.js');
  const result = parseCameraAwarenessResponse(
    '结果如下：\n```json\n{"presence":"absent","confidence":0.78,"reason":"no_person_visible"}\n```',
    5678
  );
  assert.deepStrictEqual(result, {
    presence: 'absent',
    confidence: 0.78,
    affect: 'unclear',
    reason: 'no_person_visible',
    checkedAt: 5678,
  });
}

function testCameraParserFallsBackOnInvalidJson() {
  const { parseCameraAwarenessResponse } = load('core/vision-image-analyzer.js');
  const result = parseCameraAwarenessResponse('not json', 9999);
  assert.deepStrictEqual(result, {
    presence: 'uncertain',
    confidence: 0,
    affect: 'unclear',
    reason: 'api_error',
    checkedAt: 9999,
  });
}

function testTypeConstants() {
  const types = load('core/camera-awareness-types.js');
  assert.deepStrictEqual(types.CAMERA_AWARENESS_IPC, {
    getConfig: 'camera-awareness:get-config',
    updateConfig: 'camera-awareness:update-config',
    detectOnce: 'camera-awareness:detect-once',
    processBackgroundFrame: 'camera-awareness:process-background-frame',
    getSnapshot: 'camera-awareness:get-snapshot',
  });
}

function testCameraIpcChannelNames() {
  const { CAMERA_AWARENESS_IPC } = load('core/camera-awareness-types.js');
  assert.strictEqual(CAMERA_AWARENESS_IPC.getConfig, 'camera-awareness:get-config');
  assert.strictEqual(CAMERA_AWARENESS_IPC.updateConfig, 'camera-awareness:update-config');
  assert.strictEqual(CAMERA_AWARENESS_IPC.detectOnce, 'camera-awareness:detect-once');
  assert.strictEqual(CAMERA_AWARENESS_IPC.processBackgroundFrame, 'camera-awareness:process-background-frame');
  assert.strictEqual(CAMERA_AWARENESS_IPC.getSnapshot, 'camera-awareness:get-snapshot');
}

async function testCameraAwarenessManagerStateMachine() {
  const { CameraAwarenessManager } = load('core/camera-awareness-manager.js');
  const { DEFAULT_CAMERA_AWARENESS_CONFIG } = load('core/camera-awareness-config.js');

  let now = 10_000;
  const detections = [];
  const bubbles = [];
  const configManager = {
    get: () => ({ ...DEFAULT_CAMERA_AWARENESS_CONFIG, enabled: true, backgroundDetectionEnabled: true, absentAfterMs: 1000 }),
    update: () => {},
  };
  const visionAnalyzer = {
    detectCameraAwareness: async () => detections.shift(),
  };
  const bubbleOrchestrator = {
    tryShowProactive: (text, source) => {
      bubbles.push({ text, source });
      return true;
    },
  };

  const manager = new CameraAwarenessManager(configManager, visionAnalyzer, {
    bubbleOrchestrator,
    now: () => now,
  });
  const frame = { imageBase64: 'AAAA', mimeType: 'image/jpeg', width: 320, height: 180, capturedAt: now, source: 'background' };

  detections.push({ presence: 'present', confidence: 0.9, affect: 'neutral', reason: 'person_visible', checkedAt: now });
  let snapshot = await manager.processBackgroundFrame(frame);
  assert.strictEqual(snapshot.status, 'present');
  assert.strictEqual(bubbles.length, 0);

  now += 500;
  detections.push({ presence: 'absent', confidence: 0.9, affect: 'unclear', reason: 'no_person_visible', checkedAt: now });
  snapshot = await manager.processBackgroundFrame(frame);
  assert.strictEqual(snapshot.status, 'present');

  now += 700;
  detections.push({ presence: 'absent', confidence: 0.9, affect: 'unclear', reason: 'no_person_visible', checkedAt: now });
  snapshot = await manager.processBackgroundFrame(frame);
  assert.strictEqual(snapshot.status, 'absent');

  now += 100;
  detections.push({ presence: 'present', confidence: 0.92, affect: 'positive', reason: 'person_visible', checkedAt: now });
  snapshot = await manager.processBackgroundFrame(frame);
  assert.strictEqual(snapshot.status, 'present');
  assert.strictEqual(bubbles.length, 1);
  assert.deepStrictEqual(bubbles[0], { text: '回来啦，看起来状态不错～', source: 'camera_awareness' });
  assert.strictEqual(snapshot.lastReturnedAt, now);
}

async function testDetectOnceDoesNotTriggerBubble() {
  const { CameraAwarenessManager } = load('core/camera-awareness-manager.js');
  const { DEFAULT_CAMERA_AWARENESS_CONFIG } = load('core/camera-awareness-config.js');

  const bubbles = [];
  const configManager = {
    get: () => ({ ...DEFAULT_CAMERA_AWARENESS_CONFIG, enabled: true, backgroundDetectionEnabled: true }),
    update: () => {},
  };
  const visionAnalyzer = {
    detectCameraAwareness: async () => ({ presence: 'present', confidence: 0.95, affect: 'positive', reason: 'person_visible', checkedAt: 1 }),
  };
  const manager = new CameraAwarenessManager(configManager, visionAnalyzer, {
    bubbleOrchestrator: { tryShowProactive: (text, source) => { bubbles.push({ text, source }); return true; } },
    now: () => 1,
  });

  const frame = { imageBase64: 'AAAA', mimeType: 'image/jpeg', width: 320, height: 180, capturedAt: 1, source: 'settings-test' };
  const result = await manager.detectOnce(frame);
  assert.strictEqual(result.presence, 'present');
  assert.strictEqual(manager.getSnapshot().status, 'unavailable');
  assert.strictEqual(bubbles.length, 0);
}

function testCameraBackgroundRunnerContract() {
  const root = path.join(__dirname, '..');
  const runnerSource = fs.readFileSync(path.join(root, 'src/core/camera-awareness-background-runner.ts'), 'utf8');
  assertIncludes(runnerSource, 'export class CameraAwarenessBackgroundRunner', 'background runner class should be exported');
  assertIncludes(runnerSource, 'sync()', 'background runner should expose sync()');
  assertIncludes(runnerSource, 'requestFrame', 'background runner should request frames through injected callback');
  assertIncludes(runnerSource, 'processFrame', 'background runner should process returned frames through injected callback');
  assertIncludes(runnerSource, 'recordError', 'background runner should record capture errors without changing presence state');
}

function testCameraSettingsIntegrationHooks() {
  const mainTs = readProjectFile('src/main/main.ts');
  const preloadTs = readProjectFile('src/main/preload.ts');
  const settingsHtml = readProjectFile('src/main/settings.html');

  assert(mainTs.includes("import { CameraAwarenessConfigManager } from '../core/camera-awareness-config';"));
  assert(mainTs.includes("import { CameraAwarenessManager } from '../core/camera-awareness-manager';"));
  assert(mainTs.includes("import { CAMERA_AWARENESS_IPC, CameraFrameInput } from '../core/camera-awareness-types';"));
  assert(mainTs.includes("import { VisionImageAnalyzer } from '../core/vision-image-analyzer';"));
  assert(mainTs.includes('new CameraAwarenessManager('));
  assert(mainTs.includes('ipcMain.handle(CAMERA_AWARENESS_IPC.getConfig'));
  assert(mainTs.includes('ipcMain.handle(CAMERA_AWARENESS_IPC.updateConfig'));
  assert(mainTs.includes('ipcMain.handle(CAMERA_AWARENESS_IPC.detectOnce'));
  assert(mainTs.includes('ipcMain.handle(CAMERA_AWARENESS_IPC.processBackgroundFrame'));
  assert(mainTs.includes('ipcMain.handle(CAMERA_AWARENESS_IPC.getSnapshot'));

  assert(preloadTs.includes('cameraAwareness: {'));
  assert(preloadTs.includes("ipcRenderer.invoke('camera-awareness:get-config')"));
  assert(preloadTs.includes("ipcRenderer.invoke('camera-awareness:update-config', partial)"));
  assert(preloadTs.includes("ipcRenderer.invoke('camera-awareness:detect-once', frame)"));
  assert(preloadTs.includes("ipcRenderer.invoke('camera-awareness:process-background-frame', frame)"));
  assert(preloadTs.includes("ipcRenderer.invoke('camera-awareness:get-snapshot')"));

  assert(settingsHtml.includes('data-tab="camera"'));
  assert(settingsHtml.includes('id="tab-camera"'));
  assert(settingsHtml.includes('id="cameraAwarenessEnabled"'));
  assert(settingsHtml.includes('id="cameraBackgroundEnabled"'));
  assert(settingsHtml.includes('id="testCameraAwarenessBtn"'));
  assert(settingsHtml.includes('id="cameraLivePreview"'));
  assert(settingsHtml.includes('id="startCameraPreviewBtn"'));
  assert(settingsHtml.includes('id="stopCameraPreviewBtn"'));
  assert(settingsHtml.includes('function captureCameraFrame(source)'));
  assert(settingsHtml.includes('function startCameraPreview()'));
  assert(settingsHtml.includes('function stopCameraPreview()'));
  assert(settingsHtml.includes('navigator.mediaDevices.getUserMedia'));
  assert(settingsHtml.includes('source: source'));
  assert(settingsHtml.includes('window.companion.cameraAwareness.detectOnce(frame)'));
  assert(settingsHtml.includes('window.companion.cameraAwareness.processBackgroundFrame(frame)'));
}

async function run() {
  testCameraConfigDefaults();
  testCameraParserAcceptsValidJson();
  testCameraParserExtractsJsonFromText();
  testCameraParserFallsBackOnInvalidJson();
  testTypeConstants();
  testCameraIpcChannelNames();
  testCameraBackgroundRunnerContract();
  testCameraSettingsIntegrationHooks();
  await testCameraAwarenessManagerStateMachine();
  await testDetectOnceDoesNotTriggerBubble();
  console.log('camera-awareness-contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
