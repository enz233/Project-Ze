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

async function run() {
  await testRuleClassifierNormalChatDoesNotNeedSensitiveCapabilities();
  await testRuleClassifierScreenSummaryFromNaturalLanguage();
  await testRuleClassifierScreenTargetExtractsTarget();
  await testRuleClassifierCameraCheckIsExplicitOneShot();
  console.log('intent-router contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
