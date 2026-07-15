const assert = require('assert');

function load(modulePath) {
  return require(`../dist/${modulePath}`);
}

async function testRuleClassifierNormalChatDoesNotNeedSensitiveCapabilities() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier();

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '你好，今天状态怎么样？',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'normal_chat');
  assert.strictEqual(decision.explicitness, 'implicit');
  assert.deepStrictEqual(decision.requiredCapabilities, ['llm']);
  assert.strictEqual(decision.usedLlmFallback, false);
}

async function testRuleClassifierScreenSummaryFromNaturalLanguage() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier();

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '帮我看看这个页面在讲什么',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'screen_summary');
  assert.strictEqual(decision.explicitness, 'explicit');
  assert.ok(decision.confidence >= 0.8);
  assert.deepStrictEqual(decision.requiredCapabilities, ['screen_capture', 'vision', 'llm']);
}

async function testRuleClassifierScreenTargetExtractsTarget() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier();

  const decision = await classifier.classify({
    source: 'voice_asr',
    text: '指出下载按钮在哪',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'screen_target_pointer');
  assert.strictEqual(decision.target, '下载按钮');
  assert.deepStrictEqual(decision.requiredCapabilities, ['screen_capture', 'vision', 'move_pointer']);
}

async function testRuleClassifierCameraCheckIsExplicitOneShot() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier();

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '检测一下摄像头状态',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'camera_check_once');
  assert.strictEqual(decision.explicitness, 'explicit');
  assert.deepStrictEqual(decision.requiredCapabilities, ['camera_frame']);
}

async function testRouterAllowsExplicitScreenSummaryFromTextChat() {
  const { IntentRouter } = load('core/intent-router.js');
  const router = new IntentRouter();

  const routed = await router.route({
    source: 'text_chat',
    text: '帮我看看这个页面',
    userInitiated: true,
  });

  assert.strictEqual(routed.decision.intent, 'screen_summary');
  assert.strictEqual(routed.permission.status, 'allowed');
}

async function testRouterDeniesAmbiguousSensitiveFallback() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const { IntentRouter } = load('core/intent-router.js');
  const classifier = new IntentClassifier({
    enableLlmFallback: true,
    llmFallback: async () => ({
      intent: 'camera_check_once',
      confidence: 0.9,
      reason: 'bad fallback tries camera without explicit request',
      explicitness: 'ambiguous',
      requires: ['camera_frame'],
    }),
  });
  const router = new IntentRouter({ classifier, cameraEnabled: () => true });

  const routed = await router.route({
    source: 'text_chat',
    text: '这个好像有点怪',
    userInitiated: true,
  });

  assert.strictEqual(routed.decision.intent, 'camera_check_once');
  assert.strictEqual(routed.permission.status, 'denied');
  assert.match(routed.permission.reason, /explicit/);
}

async function testRouterRequiresCameraConfigForCameraCheck() {
  const { IntentRouter } = load('core/intent-router.js');
  const router = new IntentRouter({ cameraEnabled: () => false });

  const routed = await router.route({
    source: 'text_chat',
    text: '检测一下摄像头状态',
    userInitiated: true,
  });

  assert.strictEqual(routed.decision.intent, 'camera_check_once');
  assert.strictEqual(routed.permission.status, 'denied');
  assert.match(routed.permission.reason, /camera awareness is disabled/);
}

async function testRouterRecordsDebugSnapshot() {
  const { IntentRouter } = load('core/intent-router.js');
  const router = new IntentRouter({ debugLimit: 2 });

  await router.route({ source: 'text_chat', text: '你好', userInitiated: true });
  await router.route({ source: 'text_chat', text: '帮我看看这个页面', userInitiated: true });
  await router.route({ source: 'voice_asr', text: '指出下载按钮', userInitiated: true });

  const snapshot = router.getDebugSnapshot();
  assert.strictEqual(snapshot.recent.length, 2);
  assert.strictEqual(snapshot.recent[0].intent, 'screen_summary');
  assert.strictEqual(snapshot.recent[1].intent, 'screen_target_pointer');
  assert.strictEqual(snapshot.recent[1].permissionStatus, 'allowed');
}

async function testRouterAddsCameraCapabilityBeforePermissionGate() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const { IntentRouter } = load('core/intent-router.js');
  const classifier = new IntentClassifier({
    enableLlmFallback: true,
    llmFallback: async () => ({
      intent: 'camera_check_once',
      confidence: 0.95,
      reason: 'bad fallback omits camera requirement',
      explicitness: 'explicit',
      requires: [],
    }),
  });
  const router = new IntentRouter({ classifier, cameraEnabled: () => false });

  const routed = await router.route({
    source: 'text_chat',
    text: '摄像头这个好像有点怪',
    userInitiated: true,
  });

  assert.strictEqual(routed.decision.intent, 'camera_check_once');
  assert.strictEqual(routed.permission.status, 'denied');
  assert.match(routed.permission.reason, /camera awareness is disabled/);
  assert.deepStrictEqual(routed.permission.deniedCapabilities, ['camera_frame']);
}

async function testRouterDebugSnapshotUsesIntentRequiredCapabilities() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const { IntentRouter } = load('core/intent-router.js');
  const classifier = new IntentClassifier({
    enableLlmFallback: true,
    llmFallback: async () => ({
      intent: 'screen_summary',
      confidence: 0.95,
      reason: 'bad fallback omits screen requirements',
      explicitness: 'explicit',
      requires: [],
    }),
  });
  const router = new IntentRouter({ classifier });

  await router.route({ source: 'text_chat', text: '页面这个好像有点怪', userInitiated: true });

  const snapshot = router.getDebugSnapshot();
  assert.strictEqual(snapshot.recent.length, 1);
  assert.ok(snapshot.recent[0].requiredCapabilities.includes('screen_capture'));
  assert.ok(snapshot.recent[0].requiredCapabilities.includes('vision'));
}

async function testRouterNegativeDebugLimitDoesNotHangAndKeepsNoRecentRecords() {
  const { IntentRouter } = load('core/intent-router.js');
  const router = new IntentRouter({ debugLimit: -1 });

  const routed = await Promise.race([
    router.route({ source: 'text_chat', text: '你好', userInitiated: true }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('route hung with negative debugLimit')), 500)),
  ]);

  assert.strictEqual(routed.permission.status, 'allowed');
  assert.strictEqual(router.getDebugSnapshot().recent.length, 0);
}

async function run() {
  await testRuleClassifierNormalChatDoesNotNeedSensitiveCapabilities();
  await testRuleClassifierScreenSummaryFromNaturalLanguage();
  await testRuleClassifierScreenTargetExtractsTarget();
  await testRuleClassifierCameraCheckIsExplicitOneShot();
  await testRouterAllowsExplicitScreenSummaryFromTextChat();
  await testRouterDeniesAmbiguousSensitiveFallback();
  await testRouterRequiresCameraConfigForCameraCheck();
  await testRouterRecordsDebugSnapshot();
  await testRouterAddsCameraCapabilityBeforePermissionGate();
  await testRouterDebugSnapshotUsesIntentRequiredCapabilities();
  await testRouterNegativeDebugLimitDoesNotHangAndKeepsNoRecentRecords();
  console.log('intent-router contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
