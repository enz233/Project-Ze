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
    cameraTools: {
      checkPresence: async () => {
        throw new Error('camera should not run for screen summary');
      },
      analyzeVisualQuery: async () => {
        throw new Error('camera should not run for screen summary');
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
  assert.strictEqual(calls[1][1].actionResults[0].action, 'capture_screen');
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
    cameraTools: {
      checkPresence: async () => {
        throw new Error('camera should not run for pointer');
      },
      analyzeVisualQuery: async () => {
        throw new Error('camera should not run for pointer');
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
  assert.deepStrictEqual(calls[0], ['handle', '指出下载按钮', { suppressResultBubble: true }]);
  assert.strictEqual(calls[1][0], 'respondFromWorkflow');
  assert.strictEqual(calls[1][1].observations[0].kind, 'screen_target_pointer');
  assert.strictEqual(calls[1][1].observations[0].target, '下载按钮');
  assert.strictEqual(calls[1][1].actionResults[0].action, 'point_target');
  assert.strictEqual(calls[1][1].actionResults[0].status, 'completed');
}

async function testCameraPresenceDelegatesFinalReplyToChatResponder() {
  const { ResponseWorkflowOrchestrator } = load('core/response-workflow-orchestrator.js');
  let contextSeen;
  const orchestrator = new ResponseWorkflowOrchestrator({
    screenAnalyzer: { analyze: async () => '' },
    screenTargetPointer: { handle: async () => ({ handled: false, moved: false, message: '' }) },
    cameraTools: {
      checkPresence: async () => ({
        presence: 'present',
        confidence: 0.91,
        affect: 'unclear',
        reason: 'person_visible',
      }),
      analyzeVisualQuery: async () => {
        throw new Error('visual query should not run for presence');
      },
    },
    chatResponder: {
      respondFromWorkflow: async (context) => {
        contextSeen = context;
        return {
          fullResponse: '<item>镜头前现在有人。</item>',
          visibleReplyProduced: true,
        };
      },
    },
  });

  const result = await orchestrator.run({
    workflow: 'camera_check_once_response',
    source: 'text_chat',
    userText: '看看我在不在',
    toolText: '看看我在不在',
  });

  assert.strictEqual(result.status, 'handled');
  assert.strictEqual(contextSeen.observations[0].kind, 'camera_presence');
  assert.strictEqual(contextSeen.observations[0].presence, 'present');
  assert.strictEqual(contextSeen.actionResults[0].action, 'capture_camera');
}

async function testCameraVisualQueryDelegatesFinalReplyToChatResponder() {
  const { ResponseWorkflowOrchestrator } = load('core/response-workflow-orchestrator.js');
  let contextSeen;
  const orchestrator = new ResponseWorkflowOrchestrator({
    screenAnalyzer: { analyze: async () => '' },
    screenTargetPointer: { handle: async () => ({ handled: false, moved: false, message: '' }) },
    cameraTools: {
      checkPresence: async () => {
        throw new Error('presence should not run for visual query');
      },
      analyzeVisualQuery: async (prompt) => `观察结果：${prompt}，画面里有一件深色上衣。`,
    },
    chatResponder: {
      respondFromWorkflow: async (context) => {
        contextSeen = context;
        return {
          fullResponse: '<item>看起来是偏深色的上衣。</item>',
          visibleReplyProduced: true,
        };
      },
    },
  });

  const result = await orchestrator.run({
    workflow: 'camera_visual_query_response',
    source: 'text_chat',
    userText: '看看我穿的衣服是什么颜色',
    toolText: '看看我穿的衣服是什么颜色',
  });

  assert.strictEqual(result.status, 'handled');
  assert.strictEqual(contextSeen.observations[0].kind, 'camera_visual');
  assert.match(contextSeen.observations[0].summary, /深色上衣/);
  assert(contextSeen.observations[0].warnings.includes('no_identity_or_sensitive_attribute_inference'));
  assert.strictEqual(contextSeen.actionResults[0].action, 'capture_camera');
}

async function testChatResponderFailureReturnsFallbackResult() {
  const { ResponseWorkflowOrchestrator } = load('core/response-workflow-orchestrator.js');
  const orchestrator = new ResponseWorkflowOrchestrator({
    screenAnalyzer: { analyze: async () => '屏幕分析文本。' },
    screenTargetPointer: { handle: async () => ({ handled: false, moved: false, message: '' }) },
    cameraTools: {
      checkPresence: async () => ({ presence: 'uncertain', confidence: 0, reason: 'api_error' }),
      analyzeVisualQuery: async () => '',
    },
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
  await testCameraPresenceDelegatesFinalReplyToChatResponder();
  await testCameraVisualQueryDelegatesFinalReplyToChatResponder();
  await testChatResponderFailureReturnsFallbackResult();
  console.log('response-workflow contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
