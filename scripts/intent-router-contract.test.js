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

async function testRuleClassifierCameraVisualQueryIsExplicit() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier();

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '帮我看看我今天穿的衣服是什么颜色',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'camera_visual_query');
  assert.strictEqual(decision.explicitness, 'explicit');
  assert.deepStrictEqual(decision.requiredCapabilities, ['camera_frame', 'vision', 'llm']);
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

async function testRouterRequiresCameraConfigForCameraVisualQuery() {
  const { IntentRouter } = load('core/intent-router.js');
  const router = new IntentRouter({ cameraEnabled: () => false });

  const routed = await router.route({
    source: 'text_chat',
    text: '看看我手里拿的是什么',
    userInitiated: true,
  });

  assert.strictEqual(routed.decision.intent, 'camera_visual_query');
  assert.strictEqual(routed.permission.status, 'denied');
  assert.match(routed.permission.reason, /camera awareness is disabled/);
  assert.deepStrictEqual(routed.permission.deniedCapabilities, ['camera_frame']);
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

async function testLlmFallbackCanClassifyAmbiguousPageRequest() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier({
    enableLlmFallback: true,
    llmFallback: async () => JSON.stringify({
      intent: 'screen_summary',
      confidence: 0.81,
      reason: '用户用“这里”指代当前页面并要求解释',
      explicitness: 'explicit',
      requires: ['screen_capture', 'vision', 'llm'],
    }),
  });

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '这里帮我看一下',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'screen_summary');
  assert.strictEqual(decision.usedLlmFallback, true);
  assert.deepStrictEqual(decision.requiredCapabilities, ['screen_capture', 'vision', 'llm']);
}

async function testLlmFallbackMissingTargetDowngradesToUnknown() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier({
    enableLlmFallback: true,
    llmFallback: async () => ({
      intent: 'screen_target_pointer',
      confidence: 0.9,
      reason: 'missing target should be unsafe',
      explicitness: 'explicit',
      requires: ['screen_capture', 'vision', 'move_pointer'],
    }),
  });

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '这个按钮帮我看看',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'unknown');
  assert.deepStrictEqual(decision.requiredCapabilities, []);
}

async function testLlmFallbackInvalidJsonFallsBackToDraft() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier({
    enableLlmFallback: true,
    llmFallback: async () => '{not json',
  });

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '这个设置帮我看一下',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'unknown');
  assert.strictEqual(decision.usedLlmFallback, true);
  assert.match(decision.reason, /LLM fallback failed/);
}

async function testLlmFallbackInvalidIntentDropsSensitiveCapabilities() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier({
    enableLlmFallback: true,
    llmFallback: async () => ({
      intent: 'delete_everything',
      confidence: 0.91,
      reason: 'invalid intent must not carry config write',
      explicitness: 'explicit',
      requires: ['config_write'],
    }),
  });

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '这个设置帮我看一下',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'unknown');
  assert.deepStrictEqual(decision.requiredCapabilities, []);
}

async function testLlmFallbackLowConfidenceDropsSensitiveCapabilities() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier({
    enableLlmFallback: true,
    lowConfidenceThreshold: 0.7,
    llmFallback: async () => ({
      intent: 'screen_summary',
      confidence: 0.2,
      reason: 'low confidence must not keep screen capability',
      explicitness: 'explicit',
      requires: ['screen_capture', 'vision'],
    }),
  });

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '这里帮我看一下',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'unknown');
  assert.deepStrictEqual(decision.requiredCapabilities, []);
}

async function testLlmFallbackLowConfidenceNormalChatDropsSensitiveCapabilities() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier({
    enableLlmFallback: true,
    lowConfidenceThreshold: 0.7,
    llmFallback: async () => ({
      intent: 'normal_chat',
      confidence: 0.2,
      reason: 'normal chat must stay safe',
      explicitness: 'implicit',
      requires: ['config_write', 'move_pointer'],
    }),
  });

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '这个设置帮我看一下',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'unknown');
  assert.deepStrictEqual(decision.requiredCapabilities, []);
}

async function testExecutorDispatchesAllowedScreenTarget() {
  const { IntentRouter } = load('core/intent-router.js');
  const { IntentExecutor } = load('core/intent-executor.js');
  const router = new IntentRouter();
  const calls = [];
  const executor = new IntentExecutor({
    screenTargetPointer: async (routed) => {
      calls.push(routed.decision.target);
      return { status: 'handled', message: 'pointed' };
    },
  });

  const routed = await router.route({ source: 'text_chat', text: '指出下载按钮', userInitiated: true });
  const result = await executor.execute(routed);

  assert.strictEqual(result.status, 'handled');
  assert.deepStrictEqual(calls, ['下载按钮']);
}

async function testExecutorDispatchesAllowedCameraVisualQuery() {
  const { IntentRouter } = load('core/intent-router.js');
  const { IntentExecutor } = load('core/intent-executor.js');
  const router = new IntentRouter({ cameraEnabled: () => true });
  const calls = [];
  const executor = new IntentExecutor({
    cameraVisualQuery: async (routed) => {
      calls.push(routed.request.text);
      return { status: 'handled', message: 'camera observation' };
    },
  });

  const routed = await router.route({ source: 'text_chat', text: '看看我手里拿的是什么', userInitiated: true });
  const result = await executor.execute(routed);

  assert.strictEqual(result.status, 'handled');
  assert.deepStrictEqual(calls, ['看看我手里拿的是什么']);
}

async function testExecutorSkipsDeniedDecision() {
  const { IntentRouter } = load('core/intent-router.js');
  const { IntentExecutor } = load('core/intent-executor.js');
  const router = new IntentRouter({ cameraEnabled: () => false });
  const executor = new IntentExecutor({
    cameraCheckOnce: async () => ({ status: 'handled', message: 'should not run' }),
  });

  const routed = await router.route({ source: 'text_chat', text: '检测一下摄像头状态', userInitiated: true });
  const result = await executor.execute(routed);

  assert.strictEqual(result.status, 'skipped');
  assert.match(result.message, /denied/);
}

async function testExecutorReportsMissingHandler() {
  const { IntentRouter } = load('core/intent-router.js');
  const { IntentExecutor } = load('core/intent-executor.js');
  const router = new IntentRouter();
  const executor = new IntentExecutor({});

  const routed = await router.route({ source: 'text_chat', text: '帮我看看这个页面', userInitiated: true });
  const result = await executor.execute(routed);

  assert.strictEqual(result.status, 'skipped');
  assert.match(result.message, /No executor handler/);
}

async function run() {
  await testRuleClassifierNormalChatDoesNotNeedSensitiveCapabilities();
  await testRuleClassifierScreenSummaryFromNaturalLanguage();
  await testRuleClassifierScreenTargetExtractsTarget();
  await testRuleClassifierCameraCheckIsExplicitOneShot();
  await testRuleClassifierCameraVisualQueryIsExplicit();
  await testRouterAllowsExplicitScreenSummaryFromTextChat();
  await testRouterDeniesAmbiguousSensitiveFallback();
  await testRouterRequiresCameraConfigForCameraCheck();
  await testRouterRequiresCameraConfigForCameraVisualQuery();
  await testRouterRecordsDebugSnapshot();
  await testRouterAddsCameraCapabilityBeforePermissionGate();
  await testRouterDebugSnapshotUsesIntentRequiredCapabilities();
  await testRouterNegativeDebugLimitDoesNotHangAndKeepsNoRecentRecords();
  await testLlmFallbackCanClassifyAmbiguousPageRequest();
  await testLlmFallbackMissingTargetDowngradesToUnknown();
  await testLlmFallbackInvalidJsonFallsBackToDraft();
  await testLlmFallbackInvalidIntentDropsSensitiveCapabilities();
  await testLlmFallbackLowConfidenceDropsSensitiveCapabilities();
  await testLlmFallbackLowConfidenceNormalChatDropsSensitiveCapabilities();
  await testExecutorDispatchesAllowedScreenTarget();
  await testExecutorDispatchesAllowedCameraVisualQuery();
  await testExecutorSkipsDeniedDecision();
  await testExecutorReportsMissingHandler();
  console.log('intent-router contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
