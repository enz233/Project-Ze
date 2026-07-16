const assert = require('assert');
const fs = require('fs');
const path = require('path');

function load(modulePath) {
  return require(`../dist/${modulePath}`);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
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
    analyzePrompt: 'camera-awareness:analyze-prompt',
    backgroundCaptureRequest: 'camera-awareness:background-capture-request',
    submitBackgroundFrame: 'camera-awareness:submit-background-frame',
  });
}

function testCameraIpcChannelNames() {
  const { CAMERA_AWARENESS_IPC } = load('core/camera-awareness-types.js');
  assert.strictEqual(CAMERA_AWARENESS_IPC.getConfig, 'camera-awareness:get-config');
  assert.strictEqual(CAMERA_AWARENESS_IPC.updateConfig, 'camera-awareness:update-config');
  assert.strictEqual(CAMERA_AWARENESS_IPC.detectOnce, 'camera-awareness:detect-once');
  assert.strictEqual(CAMERA_AWARENESS_IPC.processBackgroundFrame, 'camera-awareness:process-background-frame');
  assert.strictEqual(CAMERA_AWARENESS_IPC.getSnapshot, 'camera-awareness:get-snapshot');
  assert.strictEqual(CAMERA_AWARENESS_IPC.analyzePrompt, 'camera-awareness:analyze-prompt');
  assert.strictEqual(CAMERA_AWARENESS_IPC.backgroundCaptureRequest, 'camera-awareness:background-capture-request');
  assert.strictEqual(CAMERA_AWARENESS_IPC.submitBackgroundFrame, 'camera-awareness:submit-background-frame');
}

function testCameraPromptAnalysisHelpers() {
  const {
    buildCameraPromptAnalysisPrompt,
    buildCameraVisualQueryPrompt,
    cleanCameraPromptReply,
  } = load('core/vision-image-analyzer.js');

  const defaultPrompt = buildCameraPromptAnalysisPrompt('');
  assert(defaultPrompt.includes('英文星号 *'));
  assert(defaultPrompt.includes('问候'));

  const customPrompt = buildCameraPromptAnalysisPrompt('现在适合说什么？');
  assert(customPrompt.includes('现在适合说什么？'));
  assert(customPrompt.includes('英文星号 *'));

  assert.strictEqual(cleanCameraPromptReply('```text\n你好呀。\n```'), '你好呀。');
  assert.strictEqual(cleanCameraPromptReply(''), '我在这里。');

  const visualQueryPrompt = buildCameraVisualQueryPrompt('看看我今天穿的衣服是什么颜色');
  assert(visualQueryPrompt.includes('自然语言主动请求摄像头视觉帮助'));
  assert(visualQueryPrompt.includes('看看我今天穿的衣服是什么颜色'));
  assert(visualQueryPrompt.includes('可见内容'));
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

async function testCameraBackgroundRunnerFollowsConfig() {
  const { CameraAwarenessBackgroundRunner } = load('core/camera-awareness-background-runner.js');
  const { DEFAULT_CAMERA_AWARENESS_CONFIG } = load('core/camera-awareness-config.js');

  let config = { ...DEFAULT_CAMERA_AWARENESS_CONFIG };
  const scheduled = [];
  const cleared = [];
  const capturedFrames = [];
  const processedFrames = [];
  const runner = new CameraAwarenessBackgroundRunner({
    getConfig: () => config,
    captureFrame: async () => {
      const frame = { imageBase64: 'AAAA', mimeType: 'image/jpeg', width: 320, height: 180, capturedAt: 1, source: 'background' };
      capturedFrames.push(frame);
      return frame;
    },
    processFrame: async (frame) => {
      processedFrames.push(frame);
      return {
        status: 'present',
        lastDetection: null,
        lastChangedAt: null,
        lastReturnedAt: null,
        backgroundDetectionRunning: true,
      };
    },
  }, {
    setTimer: (callback, delayMs) => {
      scheduled.push({ callback, delayMs });
      return scheduled.length;
    },
    clearTimer: (timer) => cleared.push(timer),
  });

  runner.sync();
  assert.strictEqual(runner.isRunning(), false);
  assert.strictEqual(scheduled.length, 0);

  config = { ...DEFAULT_CAMERA_AWARENESS_CONFIG, enabled: true, backgroundDetectionEnabled: true, detectionIntervalMs: 30000 };
  runner.sync();
  assert.strictEqual(runner.isRunning(), true);
  assert.strictEqual(scheduled[0].delayMs, 30000);

  await runner.runOnce();
  assert.strictEqual(capturedFrames.length, 1);
  assert.strictEqual(processedFrames.length, 1);
  assert.strictEqual(processedFrames[0].source, 'background');

  config = { ...config, backgroundDetectionEnabled: false };
  runner.sync();
  assert.strictEqual(runner.isRunning(), false);
  assert(cleared.length > 0);
}

async function testCameraBackgroundRunnerReportsCaptureError() {
  const { CameraAwarenessBackgroundRunner } = load('core/camera-awareness-background-runner.js');
  const { DEFAULT_CAMERA_AWARENESS_CONFIG } = load('core/camera-awareness-config.js');

  const errors = [];
  const runner = new CameraAwarenessBackgroundRunner({
    getConfig: () => ({ ...DEFAULT_CAMERA_AWARENESS_CONFIG, enabled: true, backgroundDetectionEnabled: true }),
    captureFrame: async () => {
      throw new Error('permission denied');
    },
    processFrame: async () => {
      throw new Error('should not process failed capture');
    },
    onError: (error) => errors.push(error.message),
  }, {
    setTimer: () => 1,
    clearTimer: () => {},
  });

  await runner.runOnce();
  assert.deepStrictEqual(errors, ['permission denied']);
}

function testCameraSettingsIntegrationHooks() {
  const mainTs = readProjectFile('src/main/main.ts');
  const preloadTs = readProjectFile('src/main/preload.ts');
  const settingsHtml = readProjectFile('src/main/settings.html');

  assert(mainTs.includes("import { CameraAwarenessConfigManager } from '../core/camera-awareness-config';"));
  assert(mainTs.includes("import { CameraAwarenessBackgroundRunner } from '../core/camera-awareness-background-runner';"));
  assert(mainTs.includes("import { CameraAwarenessManager } from '../core/camera-awareness-manager';"));
  assert(mainTs.includes("import { CAMERA_AWARENESS_IPC, CameraAwarenessSnapshot, CameraFrameInput } from '../core/camera-awareness-types';"));
  assert(mainTs.includes("import { VisionImageAnalyzer } from '../core/vision-image-analyzer';"));
  assert(mainTs.includes('new CameraAwarenessManager('));
  assert(mainTs.includes('new CameraAwarenessBackgroundRunner('));
  assert(mainTs.includes('ipcMain.handle(CAMERA_AWARENESS_IPC.getConfig'));
  assert(mainTs.includes('ipcMain.handle(CAMERA_AWARENESS_IPC.updateConfig'));
  assert(mainTs.includes('ipcMain.handle(CAMERA_AWARENESS_IPC.detectOnce'));
  assert(mainTs.includes('ipcMain.handle(CAMERA_AWARENESS_IPC.processBackgroundFrame'));
  assert(mainTs.includes('ipcMain.handle(CAMERA_AWARENESS_IPC.submitBackgroundFrame'));
  assert(mainTs.includes('ipcMain.handle(CAMERA_AWARENESS_IPC.getSnapshot'));
  assert(mainTs.includes('ipcMain.handle(CAMERA_AWARENESS_IPC.analyzePrompt'));
  assert(mainTs.includes('setCameraPromptAnalyzer'));
  assert(mainTs.includes("camera-analysis:capture-request"));
  assert(mainTs.includes('requestCameraBackgroundFrame'));
  assert(mainTs.includes('requestCameraIntentFrame'));
  assert(mainTs.includes('CAMERA_AWARENESS_IPC.backgroundCaptureRequest'));
  assert(mainTs.includes('cameraVisualQuery: async'));
  assert(mainTs.includes('analyzeCameraVisualQuery'));
  assert(mainTs.includes('cameraAwarenessManager.detectOnce(frame)'));
  assert(mainTs.includes('logCameraAwarenessDebug(snapshot, frame)'));
  assert(mainTs.includes("person:'") || mainTs.includes("'person:'"));
  assert(mainTs.includes("'| state:'"));
  assert(mainTs.includes('logCameraAwarenessCaptureError(error, snapshot)'));

  assert(preloadTs.includes('cameraAwareness: {'));
  assert(preloadTs.includes("ipcRenderer.invoke('camera-awareness:get-config')"));
  assert(preloadTs.includes("ipcRenderer.invoke('camera-awareness:update-config', partial)"));
  assert(preloadTs.includes("ipcRenderer.invoke('camera-awareness:detect-once', frame)"));
  assert(preloadTs.includes("ipcRenderer.invoke('camera-awareness:process-background-frame', frame)"));
  assert(preloadTs.includes("ipcRenderer.invoke('camera-awareness:get-snapshot')"));
  assert(preloadTs.includes("ipcRenderer.on('camera-analysis:capture-request'"));
  assert(preloadTs.includes("ipcRenderer.invoke('camera-awareness:analyze-prompt'"));
  assert(preloadTs.includes("ipcRenderer.on('camera-awareness:background-capture-request'"));
  assert(preloadTs.includes("ipcRenderer.invoke('camera-awareness:submit-background-frame'"));

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
  assert(settingsHtml.includes('window.companion.cameraAwareness.getSnapshot()'));
  assert(!settingsHtml.includes('setInterval(runCameraBackgroundTick'));

  const chatManagerTs = readProjectFile('src/core/chat-manager.ts');
  const rendererTs = readProjectFile('src/renderer/renderer.ts');
  assert(chatManagerTs.includes("userMessage.startsWith('*')"));
  assert(chatManagerTs.includes('setCameraPromptAnalyzer'));
  assert(chatManagerTs.includes('tryBuildWorkflowFinalResponse'));
  assert(rendererTs.includes('captureCameraPromptFrame'));
  assert(rendererTs.includes("source: 'chat-command'"));
  assert(rendererTs.includes("payload.source === 'intent-command'"));
  assert(rendererTs.includes('captureCameraFrame(source)'));
  assert(rendererTs.includes("'intent-command'"));
  assert(rendererTs.includes('onPromptCaptureRequest'));
  assert(rendererTs.includes('onBackgroundCaptureRequest'));
  assert(rendererTs.includes('submitBackgroundFrame'));
}

async function run() {
  testCameraConfigDefaults();
  testCameraParserAcceptsValidJson();
  testCameraParserExtractsJsonFromText();
  testCameraParserFallsBackOnInvalidJson();
  testCameraPromptAnalysisHelpers();
  testTypeConstants();
  testCameraIpcChannelNames();
  testCameraSettingsIntegrationHooks();
  await testCameraAwarenessManagerStateMachine();
  await testDetectOnceDoesNotTriggerBubble();
  await testCameraBackgroundRunnerFollowsConfig();
  await testCameraBackgroundRunnerReportsCaptureError();
  console.log('camera-awareness-contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
