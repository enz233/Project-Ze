const assert = require('assert');

function load(modulePath) {
  return require(`../dist/${modulePath}`);
}

async function testScreenSummaryDelegatesFinalReplyToChatResponder() {
  const { ResponseWorkflowOrchestrator } = load('core/response-workflow-orchestrator.js');
  const calls = [];
  const orchestrator = new ResponseWorkflowOrchestrator({
    screenAnalyzer: {
      analyze: async (message) => {
        calls.push(['analyze', message]);
        return '当前页面是一个软件下载页，右上角有下载入口。';
      },
    },
    screenTargetPointer: {
      handle: async () => {
        throw new Error('pointer should not run for screen summary');
      },
    },
    chatResponder: {
      respondFromWorkflow: async (context) => {
        calls.push(['respondFromWorkflow', context]);
        return {
          fullResponse: '<item>我看到了，这是一个软件下载页面。</item>',
          visibleReplyProduced: true,
        };
      },
    },
  });

  const result = await orchestrator.run({
    workflow: 'screen_summary_response',
    source: 'screen_dot',
    userText: '.看看这个页面',
    toolText: '看看这个页面',
  });

  assert.strictEqual(result.status, 'handled');
  assert.strictEqual(result.visibleReplyProduced, true);
  assert.deepStrictEqual(calls[0], ['analyze', '看看这个页面']);
  assert.strictEqual(calls[1][0], 'respondFromWorkflow');
  assert.strictEqual(calls[1][1].privacy.persistRawObservations, false);
  assert.strictEqual(calls[1][1].privacy.allowVisibleReplyInHistory, true);
  assert.strictEqual(calls[1][1].observations[0].kind, 'screen_summary');
  assert.strictEqual(calls[1][1].observations[0].summary, '当前页面是一个软件下载页，右上角有下载入口。');
}

async function testScreenTargetPointerSuppressesDirectResultBubbleAndDelegatesToChat() {
  const { ResponseWorkflowOrchestrator } = load('core/response-workflow-orchestrator.js');
  const calls = [];
  const orchestrator = new ResponseWorkflowOrchestrator({
    screenAnalyzer: {
      analyze: async () => {
        throw new Error('summary should not run for pointer');
      },
    },
    screenTargetPointer: {
      handle: async (message, options) => {
        calls.push(['handle', message, options]);
        return {
          handled: true,
          moved: true,
          message: '这里是「下载按钮」。',
          locateResult: {
            found: true,
            label: '下载按钮',
            confidence: 0.88,
            point: { x: 100, y: 80 },
            reason: '目标在右上角。',
          },
        };
      },
    },
    chatResponder: {
      respondFromWorkflow: async (context) => {
        calls.push(['respondFromWorkflow', context]);
        return {
          fullResponse: '<item>我找到下载按钮啦，已经过去指给你看了。</item>',
          visibleReplyProduced: true,
        };
      },
    },
  });

  const result = await orchestrator.run({
    workflow: 'screen_target_pointer_response',
    source: 'screen_dot',
    userText: '.指出下载按钮',
    toolText: '指出下载按钮',
  });

  assert.strictEqual(result.status, 'handled');
  assert.strictEqual(result.visibleReplyProduced, true);
  assert.deepStrictEqual(calls[0], ['handle', '指出下载按钮', { suppressResultBubble: true }]);
  assert.strictEqual(calls[1][0], 'respondFromWorkflow');
  assert.strictEqual(calls[1][1].observations[0].kind, 'screen_target_pointer');
  assert.strictEqual(calls[1][1].observations[0].target, '下载按钮');
  assert.strictEqual(calls[1][1].actionResults[0].action, 'point_target');
  assert.strictEqual(calls[1][1].actionResults[0].status, 'completed');
}

async function testPointerCancellationBecomesCancelledActionResult() {
  const { ResponseWorkflowOrchestrator } = load('core/response-workflow-orchestrator.js');
  let workflowContext;
  const orchestrator = new ResponseWorkflowOrchestrator({
    screenAnalyzer: { analyze: async () => '' },
    screenTargetPointer: {
      handle: async () => ({
        handled: true,
        moved: false,
        message: '屏幕变了，我刚才看到的位置可能不准啦。',
        cancelReason: 'screen-changed',
      }),
    },
    chatResponder: {
      respondFromWorkflow: async (context) => {
        workflowContext = context;
        return {
          fullResponse: '<item>刚才屏幕变了，我怕指错，所以没有移动。</item>',
          visibleReplyProduced: true,
        };
      },
    },
  });

  const result = await orchestrator.run({
    workflow: 'screen_target_pointer_response',
    source: 'screen_dot',
    userText: '.指出搜索框',
    toolText: '指出搜索框',
  });

  assert.strictEqual(result.status, 'handled');
  assert.strictEqual(workflowContext.actionResults[0].status, 'cancelled');
  assert.strictEqual(workflowContext.actionResults[0].debugReason, 'screen-changed');
}

async function testChatResponderFailureReturnsFallbackResult() {
  const { ResponseWorkflowOrchestrator } = load('core/response-workflow-orchestrator.js');
  const orchestrator = new ResponseWorkflowOrchestrator({
    screenAnalyzer: { analyze: async () => '屏幕分析文本。' },
    screenTargetPointer: { handle: async () => ({ handled: false, moved: false, message: '' }) },
    chatResponder: {
      respondFromWorkflow: async () => {
        throw new Error('chat unavailable');
      },
    },
  });

  const result = await orchestrator.run({
    workflow: 'screen_summary_response',
    source: 'screen_dot',
    userText: '.看看屏幕',
    toolText: '看看屏幕',
  });

  assert.strictEqual(result.status, 'fallback');
  assert.strictEqual(result.visibleReplyProduced, false);
  assert.match(result.error, /chat unavailable/);
  assert.match(result.fallbackMessage, /屏幕结果已生成/);
}

async function run() {
  await testScreenSummaryDelegatesFinalReplyToChatResponder();
  await testScreenTargetPointerSuppressesDirectResultBubbleAndDelegatesToChat();
  await testPointerCancellationBecomesCancelledActionResult();
  await testChatResponderFailureReturnsFallbackResult();
  console.log('response-workflow contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
