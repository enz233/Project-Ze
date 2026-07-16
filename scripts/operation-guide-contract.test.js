const assert = require('assert');
const { buildFallbackPlan, parseGuidePlan } = require('../dist/core/operation-guide-planner');
const { extractOperationGuideSoftwareName, getOperationGuideControlCommand } = require('../dist/core/operation-guide-intent');
const { parseProgressEvaluation } = require('../dist/core/operation-guide-progress-evaluator');

function testNaturalGuideIntentStartsGuide() {
  assert.strictEqual(extractOperationGuideSoftwareName('/guide Codex'), 'Codex');
  assert.strictEqual(extractOperationGuideSoftwareName('我想下载 Steam，下一步怎么做？'), 'Steam');
  assert.strictEqual(extractOperationGuideSoftwareName('帮我安装 Claude 客户端'), 'Claude 客户端');
  assert.strictEqual(extractOperationGuideSoftwareName('怎么配置 VS Code'), 'VS Code');
  assert.strictEqual(extractOperationGuideSoftwareName('今天聊聊 Steam 新闻'), null);
}

function testGuideControlCommands() {
  assert.strictEqual(getOperationGuideControlCommand('我完成了'), 'next');
  assert.strictEqual(getOperationGuideControlCommand('下一步'), 'next');
  assert.strictEqual(getOperationGuideControlCommand('重新识别'), 'reidentify');
  assert.strictEqual(getOperationGuideControlCommand('没指准'), 'reidentify');
  assert.strictEqual(getOperationGuideControlCommand('退出教程'), 'exit');
  assert.strictEqual(getOperationGuideControlCommand('停止指引'), 'exit');
  assert.strictEqual(getOperationGuideControlCommand('我想下载 Steam'), null);
}

function testParseGuidePlanFromJsonEnvelope() {
  const raw = 'Here is JSON:\n' + JSON.stringify({
    softwareName: 'Claude',
    sourceSummary: 'official docs',
    steps: [
      { id: 'a', action: 'click', target: 'Download button', instruction: 'Click Download.', expectedChange: 'Download page opens' },
      { id: 'b', action: 'invalid-action', target: 'Email input', instruction: 'Type your email.' },
      { id: 'c', action: 'click', instruction: 'Missing target.' }
    ]
  });
  const plan = parseGuidePlan(raw, 'Fallback');
  assert.strictEqual(plan.softwareName, 'Claude');
  assert.strictEqual(plan.steps.length, 2);
  assert.strictEqual(plan.steps[1].action, 'click');
}

function testFallbackPlan() {
  const plan = buildFallbackPlan('Steam');
  assert.strictEqual(plan.softwareName, 'Steam');
  assert.ok(plan.steps.length >= 4);
  assert.ok(plan.steps.length <= 12);
  assert.ok(plan.steps.every(step => step.target && step.instruction));
  assert.ok(plan.steps.some(step => step.instruction.includes('Steam')));
}

function testParseProgressEvaluation() {
  const result = parseProgressEvaluation('{"completed":true,"confidence":1.2,"currentStage":"下载页","nextTargetVisible":true,"reason":"看到安装按钮"}');
  assert.strictEqual(result.completed, true);
  assert.strictEqual(result.confidence, 1);
  assert.strictEqual(result.currentStage, '下载页');
  assert.strictEqual(result.nextTargetVisible, true);
  const fallback = parseProgressEvaluation('not json');
  assert.deepStrictEqual(fallback, { completed: false, confidence: 0, currentStage: '', nextTargetVisible: false, reason: 'Unable to parse progress evaluation.' });
}

testNaturalGuideIntentStartsGuide();
testGuideControlCommands();
testParseGuidePlanFromJsonEnvelope();
testFallbackPlan();
testParseProgressEvaluation();
console.log('operation-guide-contract tests passed');
