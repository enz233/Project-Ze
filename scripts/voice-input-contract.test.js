const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

function testAsrProviderPresets() {
  const {
    DEFAULT_ASR_CONFIG,
    ASR_PROVIDER_PRESETS,
    applyASRProviderPreset,
  } = load('core/asr-config.js');
  const { createASREngine } = load('core/asr-engine.js');

  assert.strictEqual(DEFAULT_ASR_CONFIG.providerPreset, 'openai');
  assert.strictEqual(ASR_PROVIDER_PRESETS.openai.provider, 'openai-compatible');
  assert.strictEqual(ASR_PROVIDER_PRESETS.openai.baseUrl, 'https://api.openai.com/v1');

  assert.strictEqual(ASR_PROVIDER_PRESETS['aliyun-bailian'].label, '阿里百炼 / DashScope');
  assert.strictEqual(ASR_PROVIDER_PRESETS['aliyun-bailian'].provider, 'openai-compatible');
  assert.strictEqual(
    ASR_PROVIDER_PRESETS['aliyun-bailian'].baseUrl,
    'https://dashscope.aliyuncs.com/compatible-mode/v1'
  );
  assert.strictEqual(ASR_PROVIDER_PRESETS['aliyun-bailian'].model, '');
  assert.match(ASR_PROVIDER_PRESETS['aliyun-bailian'].note, /OpenAI-compatible/);

  assert.strictEqual(ASR_PROVIDER_PRESETS['custom-openai-compatible'].provider, 'openai-compatible');
  assert.strictEqual(ASR_PROVIDER_PRESETS['custom-openai-compatible'].baseUrl, '');

  const config = {
    ...DEFAULT_ASR_CONFIG,
    apiKey: 'keep-secret',
    enabled: true,
    autoSendFinalTranscript: true,
    holdToTalkShortcut: 'Alt+Space',
    cache: {
      enabled: false,
      retentionMinutes: 5,
      maxSessionBytes: 12345,
    },
  };
  const applied = applyASRProviderPreset(config, 'aliyun-bailian');
  assert.strictEqual(applied.providerPreset, 'aliyun-bailian');
  assert.strictEqual(applied.provider, 'openai-compatible');
  assert.strictEqual(applied.baseUrl, 'https://dashscope.aliyuncs.com/compatible-mode/v1');
  assert.strictEqual(applied.model, '');
  assert.strictEqual(applied.apiKey, 'keep-secret');
  assert.strictEqual(applied.enabled, true);
  assert.strictEqual(applied.autoSendFinalTranscript, true);
  assert.strictEqual(applied.holdToTalkShortcut, 'Alt+Space');
  assert.deepStrictEqual(applied.cache, config.cache);

  const engine = createASREngine(applied);
  assert.strictEqual(engine.provider, 'openai-compatible');
}

function testAsrPresetBackwardCompatibilityAndInvalidFallback() {
  const {
    DEFAULT_ASR_CONFIG,
    ASR_PROVIDER_PRESETS,
    applyASRProviderPreset,
    normalizeASRConfigForLoad,
  } = load('core/asr-config.js');

  const customLegacy = normalizeASRConfigForLoad({
    ...DEFAULT_ASR_CONFIG,
    providerPreset: undefined,
    baseUrl: 'https://example.test/v1',
    model: 'custom-transcribe',
  });
  assert.strictEqual(customLegacy.providerPreset, 'custom-openai-compatible');
  assert.strictEqual(customLegacy.baseUrl, 'https://example.test/v1');
  assert.strictEqual(customLegacy.model, 'custom-transcribe');

  const openAiLegacy = normalizeASRConfigForLoad({
    ...DEFAULT_ASR_CONFIG,
    providerPreset: undefined,
  });
  assert.strictEqual(openAiLegacy.providerPreset, 'openai');

  const invalidApplied = applyASRProviderPreset(DEFAULT_ASR_CONFIG, 'missing-preset');
  assert.strictEqual(invalidApplied.providerPreset, 'openai');
  assert.strictEqual(invalidApplied.baseUrl, ASR_PROVIDER_PRESETS.openai.baseUrl);
}

function testAsrPresetKeyIsPersistedInsteadOfDefinitionId() {
  const { DEFAULT_ASR_CONFIG, ASR_PROVIDER_PRESETS, applyASRProviderPreset } = load('core/asr-config.js');
  const originalId = ASR_PROVIDER_PRESETS['aliyun-bailian'].id;
  try {
    ASR_PROVIDER_PRESETS['aliyun-bailian'].id = 'openai';
    const applied = applyASRProviderPreset(DEFAULT_ASR_CONFIG, 'aliyun-bailian');
    assert.strictEqual(applied.providerPreset, 'aliyun-bailian');
  } finally {
    ASR_PROVIDER_PRESETS['aliyun-bailian'].id = originalId;
  }
}

function testSettingsAsrPresetContractMatchesCoreDefinitions() {
  const { ASR_PROVIDER_PRESETS } = load('core/asr-config.js');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'settings.html'), 'utf-8');
  for (const [id, preset] of Object.entries(ASR_PROVIDER_PRESETS)) {
    assert.ok(html.includes(`<option value="${id}"`), `settings.html missing ASR preset option ${id}`);
    for (const value of [preset.baseUrl, preset.model, preset.realtimePath, preset.transcriptionPath, preset.streamingMode, preset.language]) {
      if (value) assert.ok(html.includes(value), `settings.html missing ASR preset value ${id}: ${value}`);
    }
  }
  assert.match(html, /<select id="asrProvider"[^>]*disabled/);
  assert.match(html, /asrProviderPreset'\)\.addEventListener\('change', function\(\) \{\s*applySelectedASRPreset\(\);/);
}

async function testChunkedFallbackFinalConcatenatesAllChunks() {
  const { OpenAICompatibleASREngine } = load('core/asr-openai-compatible.js');
  const { DEFAULT_ASR_CONFIG } = load('core/asr-config.js');
  const originalFetch = globalThis.fetch;
  const responses = ['第一段', '第二段'];
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ text: responses.shift() }),
  });
  try {
    async function* chunks() {
      yield { sessionId: 's1', sequence: 1, mimeType: 'audio/webm', base64: 'AAAA', capturedAt: Date.now() };
      yield { sessionId: 's1', sequence: 2, mimeType: 'audio/webm', base64: 'BBBB', capturedAt: Date.now() };
    }
    const engine = new OpenAICompatibleASREngine();
    const events = [];
    for await (const event of engine.stream({
      sessionId: 's1',
      config: { ...DEFAULT_ASR_CONFIG, streamingMode: 'chunked-fallback', apiKey: 'test-key' },
      chunks: chunks(),
    })) {
      events.push(event);
    }
    assert.deepStrictEqual(events, [
      { type: 'partial', text: '第一段', sessionId: 's1' },
      { type: 'partial', text: '第二段', sessionId: 's1' },
      { type: 'final', text: '第一段第二段', sessionId: 's1' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function testAsrEngineFactoryAndParser() {
  const { createASREngine } = load('core/asr-engine.js');
  const { DEFAULT_ASR_CONFIG } = load('core/asr-config.js');
  const { normalizeTranscriptEvent } = load('core/asr-openai-compatible.js');

  const engine = createASREngine(DEFAULT_ASR_CONFIG);
  assert.strictEqual(engine.provider, 'openai-compatible');
  assert.strictEqual(engine.supportsStreaming(DEFAULT_ASR_CONFIG), true);
  assert.throws(
    () => createASREngine({ ...DEFAULT_ASR_CONFIG, provider: 'custom' }),
    /Unsupported ASR provider/
  );

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

async function testRealtimeTerminalEventHelper() {
  const { isRealtimeTerminalEvent } = load('core/asr-openai-compatible.js');

  assert.strictEqual(isRealtimeTerminalEvent({ type: 'partial', text: '还在听', sessionId: 's1' }), false);
  assert.strictEqual(isRealtimeTerminalEvent({ type: 'final', text: '完成', sessionId: 's1' }), true);
  assert.strictEqual(
    isRealtimeTerminalEvent({ type: 'error', message: 'provider failed', sessionId: 's1', recoverable: false }),
    true
  );
}

async function testRealtimeStreamWaitsForPostCommitFinal() {
  const { OpenAICompatibleASREngine } = load('core/asr-openai-compatible.js');
  const { DEFAULT_ASR_CONFIG } = load('core/asr-config.js');
  const originalWebSocket = globalThis.WebSocket;
  const sockets = [];

  class FakeWebSocket {
    constructor(url, protocols) {
      this.url = url;
      this.protocols = protocols;
      this.listeners = { open: [], message: [], close: [], error: [] };
      this.sent = [];
      this.closed = false;
      sockets.push(this);
      setTimeout(() => this.emit('open', {}), 0);
    }

    addEventListener(type, listener) {
      this.listeners[type].push(listener);
    }

    send(payload) {
      this.sent.push(JSON.parse(payload));
      if (this.sent.at(-1).type === 'input_audio_buffer.commit') {
        setTimeout(() => {
          this.emit('message', { data: JSON.stringify({ type: 'transcript.completed', transcript: '最终文本' }) });
        }, 25);
      }
    }

    close() {
      this.closed = true;
      this.emit('close', {});
    }

    emit(type, event) {
      for (const listener of this.listeners[type]) listener(event);
    }
  }

  globalThis.WebSocket = FakeWebSocket;
  try {
    async function* chunks() {
      yield { sessionId: 's1', sequence: 1, mimeType: 'audio/webm', base64: 'AAAA', capturedAt: Date.now() };
    }

    const engine = new OpenAICompatibleASREngine();
    const events = [];
    for await (const event of engine.stream({
      sessionId: 's1',
      config: { ...DEFAULT_ASR_CONFIG, apiKey: 'test-key', baseUrl: 'https://example.test/v1' },
      chunks: chunks(),
    })) {
      events.push(event);
    }

    assert.deepStrictEqual(events, [{ type: 'final', text: '最终文本', sessionId: 's1' }]);
    assert.strictEqual(sockets.length, 1);
    assert.strictEqual(sockets[0].protocols[1], 'openai-insecure-api-key.test-key');
    assert.deepStrictEqual(sockets[0].sent[0], { type: 'session.auth', api_key: 'test-key' });
    assert.strictEqual(sockets[0].sent.at(-1).type, 'input_audio_buffer.commit');
    assert.strictEqual(sockets[0].closed, true);
  } finally {
    globalThis.WebSocket = originalWebSocket;
  }
}

function testVoiceAudioCachePaths() {
  const { createVoiceAudioRefPath } = load('core/voice-audio-cache.js');
  assert.strictEqual(
    createVoiceAudioRefPath('abc123', 7),
    'voice-input/abc123/chunk-000007.webm'
  );
}

function testVoiceInputManagerExports() {
  const managerModule = load('core/voice-input-manager.js');
  assert.strictEqual(typeof managerModule.createVoiceSessionId, 'function');
  assert.match(managerModule.createVoiceSessionId(), /^voice-\d+-[a-z0-9]+$/);
}

function testVoiceIpcChannelNames() {
  const channels = [
    'load-asr-config',
    'save-asr-config',
    'voice-input-start',
    'voice-input-audio-chunk',
    'voice-input-stop',
    'voice-input-cancel',
    'voice-input-status',
    'voice-input-transcript',
  ];
  assert.strictEqual(channels.includes('voice-input-transcript'), true);
}

async function run() {
  testAsrConfigDefaults();
  testAsrProviderPresets();
  testAsrPresetBackwardCompatibilityAndInvalidFallback();
  testAsrPresetKeyIsPersistedInsteadOfDefinitionId();
  testSettingsAsrPresetContractMatchesCoreDefinitions();
  testAsrEngineFactoryAndParser();
  await testRealtimeTerminalEventHelper();
  await testRealtimeStreamWaitsForPostCommitFinal();
  await testChunkedFallbackFinalConcatenatesAllChunks();
  testVoiceAudioCachePaths();
  testVoiceInputManagerExports();
  testVoiceIpcChannelNames();
  console.log('voice-input-contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
