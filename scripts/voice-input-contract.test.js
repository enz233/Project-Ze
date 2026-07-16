const assert = require('assert');
const fs = require('fs');
const path = require('path');

function load(modulePath) {
  return require(`../dist/${modulePath}`);
}

function testAsrConfigDefaults() {
  const { DEFAULT_ASR_CONFIG } = load('core/asr-config.js');
  assert.strictEqual(DEFAULT_ASR_CONFIG.enabled, false);
  assert.strictEqual(DEFAULT_ASR_CONFIG.advancedSettingsEnabled, false);
  assert.strictEqual(DEFAULT_ASR_CONFIG.provider, 'openai-compatible');
  assert.strictEqual(DEFAULT_ASR_CONFIG.baseUrl, 'https://api.openai.com/v1');
  assert.strictEqual(DEFAULT_ASR_CONFIG.apiKey, '');
  assert.strictEqual(DEFAULT_ASR_CONFIG.model, 'gpt-4o-mini-transcribe');
  assert.strictEqual(DEFAULT_ASR_CONFIG.realtimePath, '/realtime');
  assert.strictEqual(DEFAULT_ASR_CONFIG.transcriptionPath, '/audio/transcriptions');
  assert.strictEqual(DEFAULT_ASR_CONFIG.streamingMode, 'chunked-fallback');
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
  assert.strictEqual(DEFAULT_ASR_CONFIG.workspaceId, '');
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

  assert.strictEqual(ASR_PROVIDER_PRESETS['qwen-asr'].label, 'Qwen-ASR 实时识别');
  assert.strictEqual(ASR_PROVIDER_PRESETS['qwen-asr'].provider, 'qwen-asr-realtime');
  assert.strictEqual(ASR_PROVIDER_PRESETS['qwen-asr'].baseUrl, 'wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com');
  assert.strictEqual(ASR_PROVIDER_PRESETS['qwen-asr'].realtimePath, '/api-ws/v1/realtime');
  assert.strictEqual(ASR_PROVIDER_PRESETS['qwen-asr'].streamingMode, 'realtime');
  assert.strictEqual(ASR_PROVIDER_PRESETS['qwen-asr'].model, '');

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
    advancedSettingsEnabled: true,
    providerPreset: 'aliyun-bailian',
    baseUrl: 'https://example.test/v1',
    model: 'custom-transcribe',
    streamingMode: 'chunked-fallback',
  });
  assert.strictEqual(mismatchedManagedPreset.providerPreset, 'aliyun-bailian');

  const validEmptyModelPreset = normalizeASRConfigForLoad({
    ...DEFAULT_ASR_CONFIG,
    advancedSettingsEnabled: true,
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

  const advancedEnabled = normalizeASRConfigForLoad({ advancedSettingsEnabled: true });
  assert.strictEqual(advancedEnabled.advancedSettingsEnabled, true);

  const invalidAdvancedFlag = normalizeASRConfigForLoad({ advancedSettingsEnabled: 'true' });
  assert.strictEqual(invalidAdvancedFlag.advancedSettingsEnabled, false);
}

function testAsrAdvancedSettingsNormalization() {
  const { DEFAULT_ASR_CONFIG, normalizeASRConfigForLoad } = load('core/asr-config.js');

  const explicitFalse = normalizeASRConfigForLoad({
    enabled: true,
    advancedSettingsEnabled: false,
    providerPreset: 'custom-openai-compatible',
    provider: 'openai-compatible',
    baseUrl: 'https://example.test/v1',
    apiKey: 'keep-key',
    model: 'keep-model',
    realtimePath: '/custom/realtime',
    transcriptionPath: '/custom/transcriptions',
    streamingMode: 'realtime',
    language: 'en',
    autoSendFinalTranscript: true,
    holdToTalkShortcut: 'Alt+Space',
    cache: {
      enabled: false,
      retentionMinutes: 5,
      maxSessionBytes: 12345,
    },
  });
  assert.strictEqual(explicitFalse.enabled, true);
  assert.strictEqual(explicitFalse.advancedSettingsEnabled, false);
  assert.strictEqual(explicitFalse.apiKey, 'keep-key');
  assert.strictEqual(explicitFalse.model, 'keep-model');
  assert.strictEqual(explicitFalse.language, 'en');
  assert.strictEqual(explicitFalse.autoSendFinalTranscript, true);
  assert.strictEqual(explicitFalse.holdToTalkShortcut, 'Alt+Space');
  assert.strictEqual(explicitFalse.providerPreset, 'custom-openai-compatible');
  assert.strictEqual(explicitFalse.provider, 'openai-compatible');
  assert.strictEqual(explicitFalse.baseUrl, 'https://example.test/v1');
  assert.strictEqual(explicitFalse.realtimePath, '/realtime');
  assert.strictEqual(explicitFalse.transcriptionPath, '/audio/transcriptions');
  assert.strictEqual(explicitFalse.streamingMode, 'chunked-fallback');
  assert.deepStrictEqual(explicitFalse.cache, DEFAULT_ASR_CONFIG.cache);

  const legacyCustomEndpoint = normalizeASRConfigForLoad({
    enabled: true,
    baseUrl: 'https://example.test/v1',
    apiKey: 'legacy-key',
    model: 'legacy-model',
    streamingMode: 'realtime',
  });
  assert.strictEqual(legacyCustomEndpoint.advancedSettingsEnabled, true);
  assert.strictEqual(legacyCustomEndpoint.providerPreset, 'custom-openai-compatible');
  assert.strictEqual(legacyCustomEndpoint.baseUrl, 'https://example.test/v1');
  assert.strictEqual(legacyCustomEndpoint.model, 'legacy-model');
  assert.strictEqual(legacyCustomEndpoint.streamingMode, 'realtime');

  const legacyOpenAiRealtimeOnly = normalizeASRConfigForLoad({
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini-transcribe',
    realtimePath: '/realtime',
    transcriptionPath: '/audio/transcriptions',
    streamingMode: 'realtime',
  });
  assert.strictEqual(legacyOpenAiRealtimeOnly.advancedSettingsEnabled, false);
  assert.strictEqual(legacyOpenAiRealtimeOnly.providerPreset, 'openai');
  assert.strictEqual(legacyOpenAiRealtimeOnly.streamingMode, 'chunked-fallback');
  assert.deepStrictEqual(legacyOpenAiRealtimeOnly.cache, DEFAULT_ASR_CONFIG.cache);
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

function testRendererQwenMainVoiceUsesPCM() {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.ts'), 'utf8');
  assert.match(renderer, /function isQwenASRVoiceConfig\(config:\s*any\):\s*boolean\s*\{/);
  assert.match(renderer, /function createQwenPCMVoiceRecorder\(stream:\s*MediaStream,\s*sessionId:\s*string\):[\s\S]*?\{/);
  assert.match(renderer, /if \(isQwenASRVoiceConfig\(config\)\)/);
  assert.match(renderer, /mimeType: 'audio\/pcm;rate=16000'/);
  assert.match(renderer, /语音 PCM 分片发送失败/);
  assert.match(renderer, /MediaRecorder\.isTypeSupported\('audio\/webm;codecs=opus'\)/);
  assert.match(renderer, /startupStream\.getTracks\(\)\.forEach/);
  assert.match(renderer, /window\.companion\.voiceInput\.cancel\(startupSessionId\)/);
  assert.match(renderer, /voiceLastSessionId === startupSessionId/);
  assert.match(renderer, /voiceRecorder = null/);
  assert.match(renderer, /语音输入启动失败：/);
}

function testRendererVoiceInputKeepsChatAreaInteractive() {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.ts'), 'utf8');
  assert.match(renderer, /function keepWindowInteractiveForChatInput\(\):\s*void\s*\{/);
  assert.match(renderer, /function releaseWindowInteractionAfterChatInput\(\):\s*void\s*\{/);
  assert.match(renderer, /chatInputWrapEl\.addEventListener\('mouseenter'/);
  assert.match(renderer, /chatInputWrapEl\.addEventListener\('mouseleave'/);
  assert.match(renderer, /openChatInput[\s\S]*?keepWindowInteractiveForChatInput\(\)/);
  assert.match(renderer, /keepChatInputOpen[\s\S]*?keepWindowInteractiveForChatInput\(\)/);
  assert.match(renderer, /closeChatInput[\s\S]*?releaseWindowInteractionAfterChatInput\(\)/);
  assert.match(renderer, /if \(!chatInputWrapEl\.classList\.contains\('hidden'\)\) return/);
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
  for (const id of [
    'asrMicStatus',
    'asrMicLevelBar',
    'asrMicLevelText',
    'asrMicTestBtn',
    'asrRecognitionProgressBar',
    'asrRecognitionProgressText',
    'asrRecognitionTestBtn',
    'asrRecognitionResult',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `settings.html missing ASR test control #${id}`);
  }
  for (const id of [
    'asrAdvancedSettingsEnabled',
    'asrAdvancedSettingsSection',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `settings.html missing ASR advanced setting #${id}`);
  }
  assert.match(html, /显示高级 ASR 设置/);
  assert.match(html, /供应商预设[\s\S]*?<select id="asrProviderPreset">/);
  assert.match(html, /<option value="qwen-asr">Qwen-ASR 实时识别<\/option>/);
  assert.match(html, /Base URL（启用后必填）[\s\S]*?<input type="text" id="asrBaseUrl"/);
  assert.match(html, /id="asrWorkspaceId"/);
  assert.match(html, /wss:\/\/\{WorkspaceId\}\.cn-beijing\.maas\.aliyuncs\.com/);
  assert.match(html, /function getDefaultASRAdvancedFields\(\)/);
  assert.match(html, /function toggleASRAdvancedSettings\(\)/);
  assert.match(html, /advancedSettingsEnabled: isASRAdvancedSettingsEnabled\(\)/);
  assert.match(html, /providerPreset: providerPreset/);
  assert.match(html, /baseUrl: document\.getElementById\('asrBaseUrl'\)\.value\.trim\(\)/);
  assert.match(html, /streamingMode: 'chunked-fallback'/);
  assert.match(html, /saveASRConfig\(config\)[\s\S]*?voiceInput\.start/);
  assert.match(html, /async function saveASRConfigForRecognitionTest\(config\)/);
  assert.match(html, /try \{[\s\S]*?await saveASRConfigForRecognitionTest\(config\);[\s\S]*?window\.companion\.voiceInput\.start/);
  assert.match(html, /catch \(error\) \{[\s\S]*?formatASRRecognitionErrorMessage\(error && error\.message \? error\.message : String\(error\)\)[\s\S]*?setASRMicStatus\('语音识别测试启动失败：' \+ message, true\)/);
  assert.match(html, /function formatASRRecognitionErrorMessage\(message\)/);
  assert.match(html, /实时识别连接失败/);
  assert.match(html, /chunked-fallback 后重试/);
  assert.match(html, /测试麦克风音量/);
  assert.match(html, /测试语音识别 10 秒/);
  assert.match(html, /可能产生 API 调用/);
  assert.match(html, /<select id="asrProvider"[^>]*disabled/);
  assert.match(html, /<option value="qwen-asr-realtime">Qwen-ASR Realtime<\/option>/);
  assert.match(html, /Qwen-ASR 使用专用 WebSocket ASR 引擎/);
  assert.doesNotMatch(html, /所有预设都复用 OpenAI-compatible ASR 引擎/);
  assert.match(html, /config\.provider !== 'openai-compatible' && config\.provider !== 'qwen-asr-realtime'/);
  assert.match(html, /function hasQwenRealtimeBaseUrlMismatch\(config\)/);
  assert.match(html, /请选择“Qwen-ASR 实时识别”预设/);
  assert.match(html, /fetch failed 通常表示当前 OpenAI-compatible 引擎正在请求 wss WebSocket 地址/);
  assert.match(html, /function isQwenASRRecognitionConfig\(config\)/);
  assert.match(html, /function resampleFloat32ToTargetRate\(samples, sourceRate, targetRate\)/);
  assert.match(html, /function encodePCM16Base64\(samples\)/);
  assert.match(html, /mimeType: 'audio\/pcm;rate=16000'/);
  assert.match(html, /startQwenPCMRecognitionTest\(config, startToken, startupResources\)/);
  assert.match(html, /asrProviderPreset'\)\.addEventListener\('change', function\(\) \{[\s\S]*?applySelectedASRPreset\(\);/);
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

function testQwenAsrRealtimeHelpers() {
  const {
    createQwenASRRealtimeUrl,
    createQwenASRHeaders,
    createQwenManualSessionUpdateEvent,
    normalizeQwenASREvent,
  } = load('core/asr-qwen-realtime.js');
  const { DEFAULT_ASR_CONFIG } = load('core/asr-config.js');
  const config = {
    ...DEFAULT_ASR_CONFIG,
    provider: 'qwen-asr-realtime',
    providerPreset: 'qwen-asr',
    baseUrl: 'wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com',
    workspaceId: 'ws-123',
    apiKey: 'test-key',
    model: 'qwen-asr-realtime',
    realtimePath: '/api-ws/v1/realtime',
  };

  assert.strictEqual(
    createQwenASRRealtimeUrl(config),
    'wss://ws-123.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=qwen-asr-realtime'
  );
  assert.deepStrictEqual(createQwenASRHeaders(config), {
    Authorization: 'Bearer test-key',
    'X-DashScope-WorkSpace': 'ws-123',
    'user-agent': 'Project-Ze',
  });
  assert.deepStrictEqual(createQwenManualSessionUpdateEvent(), {
    type: 'session.update',
    session: { turn_detection: null },
  });
  assert.deepStrictEqual(
    normalizeQwenASREvent({ type: 'conversation.item.input_audio_transcription.text', text: '实时文本' }, 's1'),
    { type: 'partial', text: '实时文本', sessionId: 's1' }
  );
  assert.deepStrictEqual(
    normalizeQwenASREvent({ type: 'conversation.item.input_audio_transcription.completed', transcript: '最终文本' }, 's1'),
    { type: 'final', text: '最终文本', sessionId: 's1' }
  );
  assert.deepStrictEqual(
    normalizeQwenASREvent({ type: 'conversation.item.input_audio_transcription.completed', transcript: '' }, 's1'),
    {
      type: 'error',
      message: 'Qwen-ASR 已结束但未返回识别文本：请确认麦克风有声音、录音格式被模型支持，或查看阿里云侧错误事件。',
      sessionId: 's1',
      recoverable: false,
    }
  );
  assert.deepStrictEqual(
    normalizeQwenASREvent({ type: 'session.finished' }, 's1'),
    {
      type: 'error',
      message: 'Qwen-ASR 已结束但未返回识别文本：请确认麦克风有声音、录音格式被模型支持，或查看阿里云侧错误事件。',
      sessionId: 's1',
      recoverable: false,
    }
  );
}

async function collectQwenEventsWithFakeSocket(FakeQwenWebSocket) {
  const qwenModulePath = path.join(__dirname, '..', 'dist', 'core', 'asr-qwen-realtime.js');
  const wsModulePath = require.resolve('ws');
  const originalWsCache = require.cache[wsModulePath];
  delete require.cache[qwenModulePath];
  require.cache[wsModulePath] = {
    id: wsModulePath,
    filename: wsModulePath,
    loaded: true,
    exports: FakeQwenWebSocket,
  };

  try {
    const { QwenASRRealtimeEngine } = require(qwenModulePath);
    const { DEFAULT_ASR_CONFIG } = load('core/asr-config.js');
    async function* chunks() {
      yield { sessionId: 's1', sequence: 1, mimeType: 'audio/webm', base64: 'AAAA', capturedAt: Date.now() };
    }

    const engine = new QwenASRRealtimeEngine();
    const events = [];
    for await (const event of engine.stream({
      sessionId: 's1',
      config: {
        ...DEFAULT_ASR_CONFIG,
        provider: 'qwen-asr-realtime',
        providerPreset: 'qwen-asr',
        baseUrl: 'wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com',
        workspaceId: 'ws-123',
        apiKey: 'test-key',
        model: 'qwen-asr-realtime',
        realtimePath: '/api-ws/v1/realtime',
      },
      chunks: chunks(),
    })) {
      events.push(event);
    }
    return events;
  } finally {
    delete require.cache[qwenModulePath];
    if (originalWsCache) {
      require.cache[wsModulePath] = originalWsCache;
    } else {
      delete require.cache[wsModulePath];
    }
  }
}

async function testQwenRealtimeStreamWaitsForDelayedFinal() {
  class FakeQwenWebSocket {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.listeners = { open: [], message: [], close: [], error: [] };
      this.sent = [];
      this.closed = false;
      setTimeout(() => this.emit('open'), 0);
    }

    on(type, listener) {
      this.listeners[type].push(listener);
    }

    send(payload) {
      const parsed = JSON.parse(payload);
      this.sent.push(parsed);
      if (parsed.type === 'session.finish') {
        setTimeout(() => {
          this.emit('message', Buffer.from(JSON.stringify({
            type: 'conversation.item.input_audio_transcription.completed',
            transcript: '延迟最终文本',
          })));
        }, 1200);
      }
    }

    close() {
      this.closed = true;
      this.emit('close');
    }

    emit(type, event) {
      for (const listener of this.listeners[type]) listener(event);
    }
  }

  const events = await collectQwenEventsWithFakeSocket(FakeQwenWebSocket);
  assert.deepStrictEqual(events, [{ type: 'final', text: '延迟最终文本', sessionId: 's1' }]);
}

async function testQwenRealtimeStreamReportsMissingTranscription() {
  class FakeQwenWebSocket {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.listeners = { open: [], message: [], close: [], error: [] };
      setTimeout(() => this.emit('open'), 0);
    }

    on(type, listener) {
      this.listeners[type].push(listener);
    }

    send(payload) {
      const parsed = JSON.parse(payload);
      if (parsed.type === 'session.finish') {
        setTimeout(() => {
          this.emit('message', Buffer.from(JSON.stringify({ type: 'session.finished' })));
          this.emit('close');
        }, 25);
      }
    }

    close() {
      this.emit('close');
    }

    emit(type, event) {
      for (const listener of this.listeners[type]) listener(event);
    }
  }

  const events = await collectQwenEventsWithFakeSocket(FakeQwenWebSocket);
  assert.deepStrictEqual(events, [{
    type: 'error',
    message: 'Qwen-ASR 已结束但未返回识别文本：请确认麦克风有声音、录音格式被模型支持，或查看阿里云侧错误事件。',
    sessionId: 's1',
    recoverable: false,
  }]);
}

async function testQwenRealtimeStreamReportsCloseWithoutTranscription() {
  class FakeQwenWebSocket {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.listeners = { open: [], message: [], close: [], error: [] };
      setTimeout(() => this.emit('open'), 0);
    }

    on(type, listener) {
      this.listeners[type].push(listener);
    }

    send(payload) {
      const parsed = JSON.parse(payload);
      if (parsed.type === 'session.finish') {
        setTimeout(() => this.emit('close'), 25);
      }
    }

    close() {
      this.emit('close');
    }

    emit(type, event) {
      for (const listener of this.listeners[type]) listener(event);
    }
  }

  const events = await collectQwenEventsWithFakeSocket(FakeQwenWebSocket);
  assert.deepStrictEqual(events, [{
    type: 'error',
    message: 'Qwen-ASR 已结束但未返回识别文本：请确认麦克风有声音、录音格式被模型支持，或查看阿里云侧错误事件。',
    sessionId: 's1',
    recoverable: false,
  }]);
}

function testAsrEngineFactoryAndParser() {
  const { createASREngine } = load('core/asr-engine.js');
  const { DEFAULT_ASR_CONFIG } = load('core/asr-config.js');
  const { normalizeTranscriptEvent } = load('core/asr-openai-compatible.js');

  const engine = createASREngine(DEFAULT_ASR_CONFIG);
  assert.strictEqual(engine.provider, 'openai-compatible');
  assert.strictEqual(engine.supportsStreaming({ ...DEFAULT_ASR_CONFIG, streamingMode: 'realtime' }), true);
  const qwenEngine = createASREngine({ ...DEFAULT_ASR_CONFIG, provider: 'qwen-asr-realtime' });
  assert.strictEqual(qwenEngine.provider, 'qwen-asr-realtime');
  assert.strictEqual(qwenEngine.supportsStreaming({ ...DEFAULT_ASR_CONFIG, provider: 'qwen-asr-realtime' }), true);
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
      config: { ...DEFAULT_ASR_CONFIG, streamingMode: 'realtime', apiKey: 'test-key', baseUrl: 'https://example.test/v1' },
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
  testAsrAdvancedSettingsNormalization();
  testAsrPresetKeyIsPersistedInsteadOfDefinitionId();
  testAsrNormalizerDeepMergesCacheAndValidatesTypes();
  testJsonConfigStoreUpdateNormalizesMergedValue();
  testSettingsAsrPresetContractMatchesCoreDefinitions();
  testRendererQwenMainVoiceUsesPCM();
  testRendererVoiceInputKeepsChatAreaInteractive();
  testAsrEngineFactoryAndParser();
  testQwenAsrRealtimeHelpers();
  await testQwenRealtimeStreamWaitsForDelayedFinal();
  await testQwenRealtimeStreamReportsMissingTranscription();
  await testQwenRealtimeStreamReportsCloseWithoutTranscription();
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
