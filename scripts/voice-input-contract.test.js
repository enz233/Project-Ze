const assert = require('assert');

function load(modulePath) {
  return require(`../dist/${modulePath}`);
}

function testAsrConfigDefaults() {
  const { DEFAULT_ASR_CONFIG } = load('core/asr-config.js');
  assert.strictEqual(DEFAULT_ASR_CONFIG.enabled, false);
  assert.strictEqual(DEFAULT_ASR_CONFIG.provider, 'openai-compatible');
  assert.strictEqual(DEFAULT_ASR_CONFIG.baseUrl, 'https://api.openai.com/v1');
  assert.strictEqual(DEFAULT_ASR_CONFIG.apiKey, '');
  assert.strictEqual(DEFAULT_ASR_CONFIG.model, 'gpt-4o-mini-transcribe');
  assert.strictEqual(DEFAULT_ASR_CONFIG.realtimePath, '/realtime');
  assert.strictEqual(DEFAULT_ASR_CONFIG.transcriptionPath, '/audio/transcriptions');
  assert.strictEqual(DEFAULT_ASR_CONFIG.streamingMode, 'realtime');
  assert.strictEqual(DEFAULT_ASR_CONFIG.language, 'zh');
  assert.strictEqual(DEFAULT_ASR_CONFIG.autoSendFinalTranscript, false);
  assert.strictEqual(DEFAULT_ASR_CONFIG.holdToTalkShortcut, 'Ctrl+Shift+Space');
  assert.deepStrictEqual(DEFAULT_ASR_CONFIG.cache, {
    enabled: true,
    retentionMinutes: 30,
    maxSessionBytes: 10 * 1024 * 1024,
  });
}

function testAsrEngineFactoryAndParser() {
  const { createASREngine } = load('core/asr-engine.js');
  const { DEFAULT_ASR_CONFIG } = load('core/asr-config.js');
  const { normalizeTranscriptEvent } = load('core/asr-openai-compatible.js');

  const engine = createASREngine(DEFAULT_ASR_CONFIG);
  assert.strictEqual(engine.provider, 'openai-compatible');
  assert.strictEqual(engine.supportsStreaming(DEFAULT_ASR_CONFIG), true);

  assert.deepStrictEqual(
    normalizeTranscriptEvent({ type: 'partial', text: '你好' }, 's1'),
    { type: 'partial', text: '你好', sessionId: 's1' }
  );

  assert.deepStrictEqual(
    normalizeTranscriptEvent({ type: 'final', text: '你好 Ze' }, 's1'),
    { type: 'final', text: '你好 Ze', sessionId: 's1' }
  );

  assert.deepStrictEqual(
    normalizeTranscriptEvent({ type: 'transcript.delta', delta: '正在说' }, 's1'),
    { type: 'partial', text: '正在说', sessionId: 's1' }
  );

  assert.deepStrictEqual(
    normalizeTranscriptEvent({ type: 'transcript.completed', transcript: '完成' }, 's1'),
    { type: 'final', text: '完成', sessionId: 's1' }
  );

  assert.strictEqual(normalizeTranscriptEvent({ type: 'unknown' }, 's1'), null);
}

function testVoiceAudioCachePaths() {
  const { createVoiceAudioRefPath } = load('core/voice-audio-cache.js');
  assert.strictEqual(
    createVoiceAudioRefPath('abc123', 7),
    'voice-input/abc123/chunk-000007.webm'
  );
}

function run() {
  testAsrConfigDefaults();
  testAsrEngineFactoryAndParser();
  testVoiceAudioCachePaths();
  console.log('voice-input-contract tests passed');
}

run();
