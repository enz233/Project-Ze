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

  const mismatchedManagedPreset = normalizeASRConfigForLoad({
    ...DEFAULT_ASR_CONFIG,
    providerPreset: 'aliyun-bailian',
    baseUrl: 'https://example.test/v1',
    model: 'custom-transcribe',
    streamingMode: 'chunked-fallback',
  });
  assert.strictEqual(mismatchedManagedPreset.providerPreset, 'custom-openai-compatible');

  const validEmptyModelPreset = normalizeASRConfigForLoad({
    ...DEFAULT_ASR_CONFIG,
    providerPreset: 'aliyun-bailian',
    baseUrl: ASR_PROVIDER_PRESETS['aliyun-bailian'].baseUrl,
    model: '',
    realtimePath: ASR_PROVIDER_PRESETS['aliyun-bailian'].realtimePath,
    transcriptionPath: ASR_PROVIDER_PRESETS['aliyun-bailian'].transcriptionPath,
    streamingMode: ASR_PROVIDER_PRESETS['aliyun-bailian'].streamingMode,
    language: ASR_PROVIDER_PRESETS['aliyun-bailian'].language,
  });
  assert.strictEqual(validEmptyModelPreset.providerPreset, 'aliyun-bailian');
  assert.strictEqual(validEmptyModelPreset.model, '');

  const invalidApplied = applyASRProviderPreset(DEFAULT_ASR_CONFIG, 'missing-preset');
  assert.strictEqual(invalidApplied.providerPreset, 'openai');
  assert.strictEqual(invalidApplied.baseUrl, ASR_PROVIDER_PRESETS.openai.baseUrl);
}

function testAsrNormalizerDeepMergesCacheAndValidatesTypes() {
  const { DEFAULT_ASR_CONFIG, normalizeASRConfigForLoad } = load('core/asr-config.js');

  const normalized = normalizeASRConfigForLoad({
    provider: 'bad-provider',
    streamingMode: 'bad-mode',
    apiKey: 42,
    model: '',
    enabled: 'true',
    autoSendFinalTranscript: 'false',
    cache: {
      enabled: false,
    },
  });

  assert.strictEqual(normalized.provider, DEFAULT_ASR_CONFIG.provider);
  assert.strictEqual(normalized.streamingMode, DEFAULT_ASR_CONFIG.streamingMode);
  assert.strictEqual(normalized.apiKey, DEFAULT_ASR_CONFIG.apiKey);
  assert.strictEqual(normalized.model, '');
  assert.strictEqual(normalized.enabled, false);
  assert.strictEqual(normalized.autoSendFinalTranscript, false);
  assert.deepStrictEqual(normalized.cache, {
    enabled: false,
    retentionMinutes: DEFAULT_ASR_CONFIG.cache.retentionMinutes,
    maxSessionBytes: DEFAULT_ASR_CONFIG.cache.maxSessionBytes,
  });

  const invalidCache = normalizeASRConfigForLoad({
    cache: {
      enabled: 'yes',
      retentionMinutes: -1,
      maxSessionBytes: Number.NaN,
    },
  });
  assert.deepStrictEqual(invalidCache.cache, DEFAULT_ASR_CONFIG.cache);
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

function testJsonConfigStoreUpdateNormalizesMergedValue() {
  const Module = require('module');
  const originalLoad = Module._load;
  const configFiles = new Map();
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => '/virtual-user-data',
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  const originalFs = {
    existsSync: fs.existsSync,
    mkdirSync: fs.mkdirSync,
    readFileSync: fs.readFileSync,
    writeFileSync: fs.writeFileSync,
  };
  fs.existsSync = (targetPath) => targetPath === path.join('/virtual-user-data', 'config') || configFiles.has(targetPath) || originalFs.existsSync(targetPath);
  fs.mkdirSync = () => undefined;
  fs.readFileSync = (targetPath, options) => configFiles.has(targetPath) ? configFiles.get(targetPath) : originalFs.readFileSync(targetPath, options);
  fs.writeFileSync = (targetPath, value) => configFiles.set(targetPath, value);

  delete require.cache[require.resolve('../dist/core/json-config-store.js')];
  try {
    const { JsonConfigStore } = load('core/json-config-store.js');
    const store = new JsonConfigStore({
      fileName: 'sample.json',
      defaults: { mode: 'safe', nested: { enabled: true, count: 3 } },
      namespace: 'TestStore',
      normalize: (value) => ({
        mode: value.mode === 'safe' || value.mode === 'fast' ? value.mode : 'safe',
        nested: {
          enabled: typeof value.nested?.enabled === 'boolean' ? value.nested.enabled : true,
          count: typeof value.nested?.count === 'number' ? value.nested.count : 3,
        },
      }),
    });

    store.update({ mode: 'unsafe', nested: { enabled: false } });
    assert.deepStrictEqual(store.get(), { mode: 'safe', nested: { enabled: false, count: 3 } });
    assert.deepStrictEqual(
      JSON.parse(configFiles.get(path.join('/virtual-user-data', 'config', 'sample.json'))),
      { mode: 'safe', nested: { enabled: false, count: 3 } }
    );
  } finally {
    fs.existsSync = originalFs.existsSync;
    fs.mkdirSync = originalFs.mkdirSync;
    fs.readFileSync = originalFs.readFileSync;
    fs.writeFileSync = originalFs.writeFileSync;
    Module._load = originalLoad;
    delete require.cache[require.resolve('../dist/core/json-config-store.js')];
  }
}

function testSettingsAsrPresetContractMatchesCoreDefinitions() {
  const { ASR_PROVIDER_PRESETS } = load('core/asr-config.js');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'settings.html'), 'utf-8');
  for (const [id, preset] of Object.entries(ASR_PROVIDER_PRESETS)) {
    assert.ok(html.includes(`<option value="${id}"`), `settings.html missing ASR preset option ${id}`);
    assert.ok(html.includes(`'${id}': {`), `settings.html missing ASR preset object ${id}`);
    for (const [field, value] of Object.entries({
      provider: preset.provider,
      baseUrl: preset.baseUrl,
      model: preset.model,
      realtimePath: preset.realtimePath,
      transcriptionPath: preset.transcriptionPath,
      streamingMode: preset.streamingMode,
      language: preset.language,
    })) {
      assert.ok(
        html.includes(`${field}: '${value}'`),
        `settings.html missing ASR preset field ${id}.${field}: ${value}`
      );
    }
  }
  assert.match(html, /<select id="asrProvider"[^>]*disabled/);
  assert.match(html, /asrProviderPreset'\)\.addEventListener\('change', function\(\) \{\s*applySelectedASRPreset\(\);/);
  assert.match(html, /config\.model \?\? preset\.model/);
  assert.doesNotMatch(html, /config\.model \|\| 'gpt-4o-mini-transcribe'/);
}

async function testChunkedFallbackSmartConcatenatesChunks() {
  const { OpenAICompatibleASREngine, joinTranscriptParts } = load('core/asr-openai-compatible.js');
  const { DEFAULT_ASR_CONFIG } = load('core/asr-config.js');
  const originalFetch = globalThis.fetch;
  const responses = ['Hello', 'world', '，你好', 'Ze', '42'];
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ text: responses.shift() }),
  });
  try {
    assert.strictEqual(joinTranscriptParts(['第一段', '第二段']), '第一段第二段');
    assert.strictEqual(joinTranscriptParts(['Hello', 'world', '!']), 'Hello world!');
    assert.strictEqual(joinTranscriptParts(['版本', 'Ze', '42']), '版本Ze 42');

    async function* chunks() {
      for (let sequence = 1; sequence <= 5; sequence += 1) {
        yield { sessionId: 's1', sequence, mimeType: 'audio/webm', base64: 'AAAA', capturedAt: Date.now() };
      }
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
      { type: 'partial', text: 'Hello', sessionId: 's1' },
      { type: 'partial', text: 'world', sessionId: 's1' },
      { type: 'partial', text: '，你好', sessionId: 's1' },
      { type: 'partial', text: 'Ze', sessionId: 's1' },
      { type: 'partial', text: '42', sessionId: 's1' },
      { type: 'final', text: 'Hello world，你好Ze 42', sessionId: 's1' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testChunkedFallbackYieldsErrorOnTranscribeFailure() {
  const { OpenAICompatibleASREngine } = load('core/asr-openai-compatible.js');
  const { DEFAULT_ASR_CONFIG } = load('core/asr-config.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  try {
    async function* chunks() {
      yield { sessionId: 's2', sequence: 1, mimeType: 'audio/webm', base64: 'AAAA', capturedAt: Date.now() };
    }
    const engine = new OpenAICompatibleASREngine();
    const events = [];
    for await (const event of engine.stream({
      sessionId: 's2',
      config: { ...DEFAULT_ASR_CONFIG, streamingMode: 'chunked-fallback', apiKey: 'test-key' },
      chunks: chunks(),
    })) {
      events.push(event);
    }
    assert.deepStrictEqual(events, [
      { type: 'error', message: 'ASR transcription failed: 503', sessionId: 's2', recoverable: false },
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
  testAsrNormalizerDeepMergesCacheAndValidatesTypes();
  testJsonConfigStoreUpdateNormalizesMergedValue();
  testSettingsAsrPresetContractMatchesCoreDefinitions();
  testAsrEngineFactoryAndParser();
  await testRealtimeTerminalEventHelper();
  await testRealtimeStreamWaitsForPostCommitFinal();
  await testChunkedFallbackSmartConcatenatesChunks();
  await testChunkedFallbackYieldsErrorOnTranscribeFailure();
  testVoiceAudioCachePaths();
  testVoiceInputManagerExports();
  testVoiceIpcChannelNames();
  console.log('voice-input-contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
