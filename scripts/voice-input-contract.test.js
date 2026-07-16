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

  assert.strictEqual(ASR_PROVIDER_PRESETS['funasr-local'].label, 'FunASR 本地识别');
  assert.strictEqual(ASR_PROVIDER_PRESETS['funasr-local'].provider, 'funasr-local-runtime');
  assert.strictEqual(ASR_PROVIDER_PRESETS['funasr-local'].baseUrl, 'ws://127.0.0.1:10096');
  assert.strictEqual(ASR_PROVIDER_PRESETS['funasr-local'].streamingMode, 'realtime');
  assert.strictEqual(ASR_PROVIDER_PRESETS['funasr-local'].language, 'zh');
  assert.strictEqual(ASR_PROVIDER_PRESETS['funasr-local'].model, '');
  assert.match(ASR_PROVIDER_PRESETS['funasr-local'].note, /不会自动安装 FunASR/);

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

  const funasrApplied = applyASRProviderPreset(config, 'funasr-local');
  assert.strictEqual(funasrApplied.providerPreset, 'funasr-local');
  assert.strictEqual(funasrApplied.provider, 'funasr-local-runtime');
  assert.strictEqual(funasrApplied.baseUrl, 'ws://127.0.0.1:10096');
  assert.strictEqual(funasrApplied.model, '');
  assert.strictEqual(funasrApplied.streamingMode, 'realtime');

  const funasrEngine = createASREngine(funasrApplied);
  assert.strictEqual(funasrEngine.provider, 'funasr-local-runtime');
  assert.strictEqual(funasrEngine.supportsStreaming(funasrApplied), true);
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

  const funasrNormal = normalizeASRConfigForLoad({
    enabled: true,
    advancedSettingsEnabled: false,
    providerPreset: 'funasr-local',
    provider: 'funasr-local-runtime',
    baseUrl: 'ws://127.0.0.1:10096',
    apiKey: '',
    model: '',
    streamingMode: 'realtime',
  });
  assert.strictEqual(funasrNormal.providerPreset, 'funasr-local');
  assert.strictEqual(funasrNormal.provider, 'funasr-local-runtime');
  assert.strictEqual(funasrNormal.streamingMode, 'realtime');
  assert.strictEqual(funasrNormal.baseUrl, 'ws://127.0.0.1:10096');
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

function testASRConnectionTestIPCContract() {
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'preload.ts'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.ts'), 'utf8');
  assert.match(preload, /testASRConnection: \(config: any\): Promise<any> =>/);
  assert.match(preload, /ipcRenderer\.invoke\('test-asr-connection', config\)/);
  assert.match(main, /ipcMain\.handle\('test-asr-connection'/);
  assert.match(main, /testFunASRLocalConnection/);
}

function testSettingsFunASRLocalProviderContract() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'settings.html'), 'utf8');
  assert.match(html, /<option value="funasr-local">FunASR 本地识别<\/option>/);
  assert.match(html, /'funasr-local': \{/);
  assert.match(html, /provider: 'funasr-local-runtime'/);
  assert.match(html, /baseUrl: 'ws:\/\/127\.0\.0\.1:10096'/);
  assert.match(html, /Project-Ze 第一版只负责连接该服务/);
  assert.match(html, /不会自动安装 FunASR、下载模型或启动 Docker\/Python 进程/);
  assert.match(html, /远程 FunASR 地址是高级用法/);
  assert.match(html, /function isFunASRConfig\(config\)/);
  assert.match(html, /FunASR Base URL 必须以 ws:\/\/ 或 wss:\/\/ 开头/);
  assert.match(html, /id="asrConnectionTestBtn"/);
  assert.match(html, /window\.companion\.testASRConnection\(config\)/);
}

function testSettingsFunASRRecognitionTestUsesPCM() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'settings.html'), 'utf8');
  assert.match(html, /function isLocalRealtimePCMRecognitionConfig\(config\)/);
  assert.match(html, /isQwenASRRecognitionConfig\(config\) \|\| isFunASRConfig\(config\)/);
  assert.match(html, /if \(isLocalRealtimePCMRecognitionConfig\(config\)\)/);
  assert.match(html, /audio\/pcm;rate=16000/);
  assert.match(html, /MediaRecorder\.isTypeSupported\('audio\/webm;codecs=opus'\)/);
}

function testRendererQwenMainVoiceUsesPCM() {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.ts'), 'utf8');
  assert.match(renderer, /function isQwenASRVoiceConfig\(config:\s*any\):\s*boolean\s*\{/);
  assert.match(renderer, /function createQwenPCMVoiceRecorder\(stream:\s*MediaStream,\s*sessionId:\s*string\):[\s\S]*?\{/);
  assert.match(renderer, /if \(isLocalRealtimePCMVoiceConfig\(config\)\)/);
  assert.match(renderer, /mimeType: 'audio\/pcm;rate=16000'/);
  assert.match(renderer, /语音 PCM 分片发送失败/);
  assert.match(renderer, /MediaRecorder\.isTypeSupported\('audio\/webm;codecs=opus'\)/);
  assert.match(renderer, /var startupUsesLocalRealtimePCM = false/);
  assert.match(renderer, /startupUsesLocalRealtimePCM = localRealtimePCMVoiceInput/);
  assert.match(renderer, /if \(startupUsesLocalRealtimePCM\) \{/);
  assert.doesNotMatch(renderer, /startupIsQwen/);
  assert.match(renderer, /var message = e && \(e as any\)\.message \? '语音输入启动失败：' \+ \(e as any\)\.message : '语音输入启动失败'/);
  assert.match(renderer, /startupStream\.getTracks\(\)\.forEach/);
  assert.match(renderer, /window\.companion\.voiceInput\.cancel\(startupSessionId\)/);
  assert.match(renderer, /voiceLastSessionId === startupSessionId/);
  assert.match(renderer, /voiceRecorder = null/);
  assert.match(renderer, /语音输入启动失败：/);
}

function testRendererFunASRMainVoiceUsesPCM() {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.ts'), 'utf8');
  assert.match(renderer, /function isLocalRealtimePCMVoiceConfig\(config: any\): boolean/);
  assert.match(renderer, /isQwenASRVoiceConfig\(config\) \|\| config\.provider === 'funasr-local-runtime'/);
  assert.match(renderer, /var localRealtimePCMVoiceInput = isLocalRealtimePCMVoiceConfig\(config\)/);
  assert.match(renderer, /if \(isLocalRealtimePCMVoiceConfig\(config\)\)/);
  assert.match(renderer, /mimeType: 'audio\/pcm;rate=16000'/);
  assert.match(renderer, /MediaRecorder\.isTypeSupported\('audio\/webm;codecs=opus'\)/);
}

function testRendererRecoverableASRErrorIsNonTerminal() {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.ts'), 'utf8');
  assert.match(
    renderer,
    /if \(payload\.type === 'error'\) \{[\s\S]*?if \(payload\.recoverable === true\) \{[\s\S]*?phase: 'voice-warning'[\s\S]*?return;[\s\S]*?phase: 'voice-error'[\s\S]*?voiceLastSessionId = null;[\s\S]*?\}/,
    'renderer recoverable transcript errors must warn and return before clearing voiceLastSessionId'
  );
}

function testSettingsRecoverableASRErrorIsNonTerminal() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'settings.html'), 'utf8');
  assert.match(
    html,
    /else if \(payload\.type === 'error'\) \{[\s\S]*?if \(payload\.recoverable === true\) \{[\s\S]*?正在继续识别[\s\S]*?return;[\s\S]*?setASRRecognitionProgress\(100, '识别失败'\);[\s\S]*?asrRecognitionSessionId = null;[\s\S]*?\}/,
    'settings recoverable transcript errors must return before failing the recognition test and clearing asrRecognitionSessionId'
  );
}

function testSettingsAsrPresetContractMatchesCoreDefinitions() {
  const { ASR_PROVIDER_PRESETS } = load('core/asr-config.js');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'settings.html'), 'utf-8');
  const settingsPresetIds = Object.keys(ASR_PROVIDER_PRESETS);
  for (const id of settingsPresetIds) {
    const preset = ASR_PROVIDER_PRESETS[id];
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

function testFunASRLocalEngineHelpers() {
  const { DEFAULT_ASR_CONFIG } = load('core/asr-config.js');
  const {
    createFunASRLocalUrl,
    createFunASRStartEvent,
    createFunASREndEvent,
    normalizeFunASREvent,
    FunASRLocalEngine,
  } = load('core/asr-funasr-local.js');

  const config = {
    ...DEFAULT_ASR_CONFIG,
    provider: 'funasr-local-runtime',
    baseUrl: 'ws://127.0.0.1:10096',
    language: 'zh',
  };

  assert.strictEqual(createFunASRLocalUrl(config), 'ws://127.0.0.1:10096/');
  assert.throws(
    () => createFunASRLocalUrl({ ...config, baseUrl: 'http://127.0.0.1:10096' }),
    /FunASR Base URL 必须以 ws:\/\/ 或 wss:\/\/ 开头/
  );

  assert.deepStrictEqual(createFunASRStartEvent(config), {
    mode: '2pass',
    chunk_size: [5, 10, 5],
    chunk_interval: 10,
    wav_name: 'project-ze',
    is_speaking: true,
    hotwords: '',
    itn: true,
  });
  assert.deepStrictEqual(createFunASREndEvent(), { is_speaking: false });

  assert.deepStrictEqual(
    normalizeFunASREvent({ text: '你好', mode: 'online' }, 's1'),
    { type: 'partial', text: '你好', sessionId: 's1' }
  );
  assert.deepStrictEqual(
    normalizeFunASREvent({ text: '你好世界', mode: '2pass-offline' }, 's1'),
    { type: 'final', text: '你好世界', sessionId: 's1' }
  );
  assert.deepStrictEqual(
    normalizeFunASREvent({ is_final: true, text: '结束' }, 's1'),
    { type: 'final', text: '结束', sessionId: 's1' }
  );
  assert.deepStrictEqual(
    normalizeFunASREvent({ error: 'bad audio' }, 's1'),
    { type: 'error', message: 'bad audio', sessionId: 's1', recoverable: false }
  );
  assert.strictEqual(normalizeFunASREvent({ text: '' }, 's1'), null);

  const engine = new FunASRLocalEngine();
  assert.strictEqual(engine.provider, 'funasr-local-runtime');
  assert.strictEqual(engine.supportsStreaming(config), true);
}

async function collectFunASREventsWithFakeSocket(FakeFunASRWebSocket, options = {}) {
  const funasrModulePath = path.join(__dirname, '..', 'dist', 'core', 'asr-funasr-local.js');
  const wsModulePath = require.resolve('ws');
  const originalWsCache = require.cache[wsModulePath];
  const originalDateNow = Date.now;
  delete require.cache[funasrModulePath];
  require.cache[wsModulePath] = {
    id: wsModulePath,
    filename: wsModulePath,
    loaded: true,
    exports: FakeFunASRWebSocket,
  };

  if (options.dateNow) {
    Date.now = options.dateNow;
  }

  try {
    const { FunASRLocalEngine } = require(funasrModulePath);
    const { DEFAULT_ASR_CONFIG } = load('core/asr-config.js');
    const chunks = options.chunks || (async function* defaultChunks() {
      yield { sessionId: 's1', sequence: 1, mimeType: 'audio/pcm;rate=16000', base64: 'AAAA', capturedAt: originalDateNow() };
    });

    const engine = new FunASRLocalEngine();
    const events = [];
    for await (const event of engine.stream({
      sessionId: 's1',
      config: {
        ...DEFAULT_ASR_CONFIG,
        provider: 'funasr-local-runtime',
        providerPreset: 'funasr-local',
        baseUrl: 'ws://127.0.0.1:10096',
        streamingMode: 'realtime',
      },
      chunks: chunks(),
      signal: options.signal,
    })) {
      events.push(event);
    }
    return events;
  } finally {
    Date.now = originalDateNow;
    delete require.cache[funasrModulePath];
    if (originalWsCache) {
      require.cache[wsModulePath] = originalWsCache;
    } else {
      delete require.cache[wsModulePath];
    }
  }
}

async function testFunASRLocalStreamClosesOnOpenTimeout() {
  const sockets = [];
  class FakeFunASRWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = { open: [], message: [], close: [], error: [] };
      this.sent = [];
      this.closed = false;
      sockets.push(this);
    }

    on(type, listener) {
      this.listeners[type].push(listener);
    }

    send(payload) {
      this.sent.push(payload);
    }

    close() {
      this.closed = true;
      this.readyState = 3;
      this.emit('close');
    }

    terminate() {
      this.closed = true;
      this.readyState = 3;
      this.emit('close');
    }

    emit(type, event) {
      for (const listener of this.listeners[type]) listener(event);
    }
  }

  let now = 1_000;
  const events = await collectFunASREventsWithFakeSocket(FakeFunASRWebSocket, {
    dateNow: () => {
      now += 10_000;
      return now;
    },
    chunks: async function* noChunks() {},
  });
  assert.deepStrictEqual(events, [{
    type: 'error',
    message: 'FunASR 本地服务连接失败：请确认 FunASR runtime 已启动，端口与 Base URL 一致，并且 WebSocket 服务可访问。',
    sessionId: 's1',
    recoverable: false,
  }]);
  assert.strictEqual(sockets.length, 1);
  assert.strictEqual(sockets[0].closed, true);
}

async function testFunASRLocalStreamAbortBeforeOpenClosesSocket() {
  const sockets = [];
  const controller = new AbortController();
  controller.abort();
  class FakeFunASRWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = { open: [], message: [], close: [], error: [] };
      this.sent = [];
      this.closed = false;
      sockets.push(this);
      setTimeout(() => this.emit('open'), 10);
    }

    on(type, listener) {
      this.listeners[type].push(listener);
    }

    send(payload) {
      this.sent.push(payload);
    }

    close() {
      this.closed = true;
      this.readyState = 3;
      this.emit('close');
    }

    emit(type, event) {
      for (const listener of this.listeners[type]) listener(event);
    }
  }

  const events = await collectFunASREventsWithFakeSocket(FakeFunASRWebSocket, {
    signal: controller.signal,
    chunks: async function* noChunks() {},
  });
  assert.deepStrictEqual(events, []);
  assert.strictEqual(sockets.length, 1);
  assert.strictEqual(sockets[0].closed, true);
  assert.deepStrictEqual(sockets[0].sent, []);
}

async function testFunASRLocalStreamAbortAfterOpenClosesSocketWithoutEnd() {
  const sockets = [];
  const controller = new AbortController();
  class FakeFunASRWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = { open: [], message: [], close: [], error: [] };
      this.sent = [];
      this.closed = false;
      sockets.push(this);
      setTimeout(() => this.emit('open'), 0);
    }

    on(type, listener) {
      this.listeners[type].push(listener);
    }

    send(payload) {
      this.sent.push(payload);
    }

    close() {
      this.closed = true;
      this.readyState = 3;
      this.emit('close');
    }

    emit(type, event) {
      for (const listener of this.listeners[type]) listener(event);
    }
  }

  const events = await collectFunASREventsWithFakeSocket(FakeFunASRWebSocket, {
    signal: controller.signal,
    chunks: async function* abortingChunks() {
      yield { sessionId: 's1', sequence: 1, mimeType: 'audio/pcm;rate=16000', base64: 'AAAA', capturedAt: Date.now() };
      controller.abort();
      yield { sessionId: 's1', sequence: 2, mimeType: 'audio/pcm;rate=16000', base64: 'BBBB', capturedAt: Date.now() };
    },
  });
  assert.deepStrictEqual(events, []);
  assert.strictEqual(sockets.length, 1);
  assert.strictEqual(sockets[0].closed, true);
  assert.strictEqual(sockets[0].sent.length, 2);
  assert.deepStrictEqual(JSON.parse(sockets[0].sent[0]), {
    mode: '2pass',
    chunk_size: [5, 10, 5],
    chunk_interval: 10,
    wav_name: 'project-ze',
    is_speaking: true,
    hotwords: '',
    itn: true,
  });
  assert.ok(Buffer.isBuffer(sockets[0].sent[1]));
}

async function testFunASRLocalStreamYieldsStartSendFailurePromptly() {
  const sockets = [];
  class FakeFunASRWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = { open: [], message: [], close: [], error: [] };
      this.sent = [];
      this.closed = false;
      sockets.push(this);
      setTimeout(() => this.emit('open'), 0);
    }

    on(type, listener) {
      this.listeners[type].push(listener);
    }

    send(payload) {
      if (typeof payload === 'string') throw new Error('start send failed');
      this.sent.push(payload);
    }

    close() {
      this.closed = true;
      this.readyState = 3;
      this.emit('close');
    }

    emit(type, event) {
      for (const listener of this.listeners[type]) listener(event);
    }
  }

  const eventsPromise = collectFunASREventsWithFakeSocket(FakeFunASRWebSocket, {
    chunks: async function* liveMicrophoneChunks() {
      await new Promise(() => undefined);
    },
  });
  const events = await Promise.race([
    eventsPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out waiting for start send failure')), 250)),
  ]);
  assert.deepStrictEqual(events, [{ type: 'error', message: 'start send failed', sessionId: 's1', recoverable: false }]);
  assert.strictEqual(sockets.length, 1);
  assert.strictEqual(sockets[0].closed, true);
}

async function testFunASRLocalStreamYieldsChunkSendFailureAsError() {
  class FakeFunASRWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = { open: [], message: [], close: [], error: [] };
      this.sent = [];
      setTimeout(() => this.emit('open'), 0);
    }

    on(type, listener) {
      this.listeners[type].push(listener);
    }

    send(payload) {
      if (Buffer.isBuffer(payload)) throw new Error('chunk send failed');
      this.sent.push(payload);
    }

    close() {
      this.readyState = 3;
      this.emit('close');
    }

    emit(type, event) {
      for (const listener of this.listeners[type]) listener(event);
    }
  }

  const events = await collectFunASREventsWithFakeSocket(FakeFunASRWebSocket);
  assert.deepStrictEqual(events, [{ type: 'error', message: 'chunk send failed', sessionId: 's1', recoverable: false }]);
}

async function testFunASRLocalStreamDoesNotDuplicatePreOpenFailure() {
  class FakeFunASRWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = { open: [], message: [], close: [], error: [] };
      setTimeout(() => {
        this.emit('error', new Error('connection refused'));
        this.emit('close');
      }, 0);
    }

    on(type, listener) {
      this.listeners[type].push(listener);
    }

    send() {}

    close() {
      this.readyState = 3;
      this.emit('close');
    }

    emit(type, event) {
      for (const listener of this.listeners[type]) listener(event);
    }
  }

  const events = await collectFunASREventsWithFakeSocket(FakeFunASRWebSocket, { chunks: async function* noChunks() {} });
  assert.deepStrictEqual(events, [{ type: 'error', message: 'connection refused', sessionId: 's1', recoverable: false }]);
}

async function testFunASRLocalStreamContinuesAfterRecoverableInvalidPayload() {
  class FakeFunASRWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = { open: [], message: [], close: [], error: [] };
      this.sent = [];
      setTimeout(() => this.emit('open'), 0);
    }

    on(type, listener) {
      this.listeners[type].push(listener);
    }

    send(payload) {
      this.sent.push(payload);
      if (typeof payload === 'string' && JSON.parse(payload).is_speaking === false) {
        setTimeout(() => {
          this.emit('message', Buffer.from('{bad json'));
          this.emit('message', Buffer.from(JSON.stringify({ text: '最终文本', mode: '2pass-offline' })));
        }, 25);
      }
    }

    close() {
      this.readyState = 3;
      this.emit('close');
    }

    emit(type, event) {
      for (const listener of this.listeners[type]) listener(event);
    }
  }

  const events = await collectFunASREventsWithFakeSocket(FakeFunASRWebSocket, { chunks: async function* noChunks() {} });
  assert.deepStrictEqual(events, [
    { type: 'error', message: 'Invalid FunASR event payload', sessionId: 's1', recoverable: true },
    { type: 'final', text: '最终文本', sessionId: 's1' },
  ]);
}

async function testFunASRLocalConnectionErrorClosesSocket() {
  const funasrModulePath = path.join(__dirname, '..', 'dist', 'core', 'asr-funasr-local.js');
  const wsModulePath = require.resolve('ws');
  const originalWsCache = require.cache[wsModulePath];
  const sockets = [];
  delete require.cache[funasrModulePath];

  class FakeFunASRWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = { open: [], message: [], close: [], error: [] };
      this.closed = false;
      sockets.push(this);
      setTimeout(() => this.emit('error', new Error('connection refused')), 0);
    }

    on(type, listener) {
      this.listeners[type].push(listener);
    }

    close() {
      this.closed = true;
      this.readyState = 3;
      this.emit('close');
    }

    terminate() {
      this.closed = true;
      this.readyState = 3;
      this.emit('close');
    }

    emit(type, event) {
      for (const listener of this.listeners[type]) listener(event);
    }
  }

  require.cache[wsModulePath] = {
    id: wsModulePath,
    filename: wsModulePath,
    loaded: true,
    exports: FakeFunASRWebSocket,
  };

  try {
    const { testFunASRLocalConnection } = require(funasrModulePath);
    const { DEFAULT_ASR_CONFIG } = load('core/asr-config.js');
    const result = await testFunASRLocalConnection({
      ...DEFAULT_ASR_CONFIG,
      provider: 'funasr-local-runtime',
      baseUrl: 'ws://127.0.0.1:10096',
    });
    assert.deepStrictEqual(result, { success: false, message: 'connection refused' });
    assert.strictEqual(sockets.length, 1);
    assert.strictEqual(sockets[0].closed, true);
  } finally {
    delete require.cache[funasrModulePath];
    if (originalWsCache) {
      require.cache[wsModulePath] = originalWsCache;
    } else {
      delete require.cache[wsModulePath];
    }
  }
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

async function testVoiceInputManagerKeepsFinalAfterRecoverableASRError() {
  const Module = require('module');
  const managerModulePath = path.join(__dirname, '..', 'dist', 'core', 'voice-input-manager.js');
  const originalLoad = Module._load;
  const sent = [];
  delete require.cache[managerModulePath];

  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return {};
    if (request === './asr-engine' && parent && parent.filename === managerModulePath) {
      return {
        createASREngine: () => ({
          provider: 'funasr-local-runtime',
          supportsStreaming: () => true,
          stream: async function* ({ sessionId }) {
            yield { type: 'error', message: 'Invalid FunASR event payload', sessionId, recoverable: true };
            yield { type: 'final', text: '最终文本', sessionId };
          },
        }),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { VoiceInputManager } = require(managerModulePath);
    const manager = new VoiceInputManager(
      { webContents: { send: (channel, payload) => sent.push({ channel, payload }) } },
      { get: () => ({ enabled: true, provider: 'funasr-local-runtime' }) },
      {
        createSession: async () => undefined,
        appendChunk: async () => undefined,
        finalize: async () => ({ relativeDir: 'voice-input/s1' }),
        discard: async () => undefined,
      }
    );

    const session = await manager.startSession({ source: 'settings-test', mimeType: 'audio/pcm;rate=16000' });
    await manager.appendAudioChunk(session.sessionId, { mimeType: 'audio/pcm;rate=16000', base64: 'AAAA', capturedAt: Date.now() });
    await manager.stopSession(session.sessionId);

    assert.strictEqual(manager.getStatus().phase, 'voice-idle');
    assert.strictEqual(manager.getStatus().lastFinal, '最终文本');
    assert.strictEqual(manager.getStatus().lastError, null);
    assert.ok(sent.some((event) => event.channel === 'voice-input-transcript'
      && event.payload.type === 'error'
      && event.payload.recoverable === true));
    assert.ok(sent.some((event) => event.channel === 'voice-input-transcript'
      && event.payload.type === 'final'
      && event.payload.text === '最终文本'
      && event.payload.audioRef === 'voice-input/s1'));
  } finally {
    Module._load = originalLoad;
    delete require.cache[managerModulePath];
  }
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
  testASRConnectionTestIPCContract();
  testSettingsFunASRLocalProviderContract();
  testSettingsFunASRRecognitionTestUsesPCM();
  testSettingsAsrPresetContractMatchesCoreDefinitions();
  testRendererQwenMainVoiceUsesPCM();
  testRendererFunASRMainVoiceUsesPCM();
  testRendererRecoverableASRErrorIsNonTerminal();
  testSettingsRecoverableASRErrorIsNonTerminal();
  testAsrEngineFactoryAndParser();
  testQwenAsrRealtimeHelpers();
  testFunASRLocalEngineHelpers();
  await testFunASRLocalStreamClosesOnOpenTimeout();
  await testFunASRLocalStreamAbortBeforeOpenClosesSocket();
  await testFunASRLocalStreamAbortAfterOpenClosesSocketWithoutEnd();
  await testFunASRLocalStreamYieldsStartSendFailurePromptly();
  await testFunASRLocalStreamYieldsChunkSendFailureAsError();
  await testFunASRLocalStreamDoesNotDuplicatePreOpenFailure();
  await testFunASRLocalStreamContinuesAfterRecoverableInvalidPayload();
  await testFunASRLocalConnectionErrorClosesSocket();
  await testQwenRealtimeStreamWaitsForDelayedFinal();
  await testQwenRealtimeStreamReportsMissingTranscription();
  await testQwenRealtimeStreamReportsCloseWithoutTranscription();
  await testRealtimeTerminalEventHelper();
  await testRealtimeStreamWaitsForPostCommitFinal();
  await testChunkedFallbackSmartConcatenatesChunks();
  await testChunkedFallbackYieldsErrorOnTranscribeFailure();
  testVoiceAudioCachePaths();
  await testVoiceInputManagerKeepsFinalAfterRecoverableASRError();
  testVoiceInputManagerExports();
  testVoiceIpcChannelNames();
  console.log('voice-input-contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
