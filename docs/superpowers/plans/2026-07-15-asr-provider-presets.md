# ASR Provider Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ASR provider presets so Project-Ze Voice Input can offer OpenAI, 阿里百炼 / DashScope, and custom OpenAI-compatible options while reusing the existing OpenAI-compatible ASR engine.

**Architecture:** Add a user-facing `providerPreset` layer in `ASRConfig` and keep `provider` as the actual engine selector. Preset definitions live beside ASR config defaults; settings UI can display/apply presets, but runtime still calls `createASREngine(config)` and returns `OpenAICompatibleASREngine` for `provider: 'openai-compatible'`.

**Tech Stack:** Electron main/preload/settings HTML, TypeScript strict mode, dependency-free Node contract test (`scripts/voice-input-contract.test.js`), existing `JsonConfigStore<T>`, no new test framework.

## Global Constraints

- Implement the approved spec: `docs/superpowers/specs/2026-07-15-asr-provider-presets-design.md`.
- Do not add a dedicated 阿里百炼 ASR engine in this iteration.
- Do not claim every 百炼 model supports the current realtime or transcription endpoint.
- Do not hardcode an unverified 百炼 ASR model as a guaranteed default.
- Do not change renderer microphone capture, IPC channel names, or `VoiceInputManager` responsibilities.
- Keep `provider` as the actual engine selector; add `providerPreset` as the user-facing settings template.
- Never fill API keys from presets or examples.
- Keep `enabled: false` and `autoSendFinalTranscript: false` safe defaults.
- `npm test` and `npm run build` must pass before each implementation commit.

---

## File Structure

- Modify: `src/core/asr-config.ts` — add `ASRProviderPreset`, preset definitions, `applyASRProviderPreset(...)`, and default `providerPreset`.
- Modify: `src/core/asr-engine.ts` — keep factory behavior stable; tests prove 阿里百炼 preset still resolves through `openai-compatible`.
- Modify: `scripts/voice-input-contract.test.js` — add contract tests for presets and preset application.
- Modify: `src/config/asr.example.json` — add safe `providerPreset` example.
- Modify: `src/main/settings.html` — replace single provider dropdown with provider preset UI, add preset note and explicit “应用推荐配置” button.
- Modify: `README.md` — mention ASR provider presets and 阿里百炼 / DashScope preset.
- Modify: `PROJECT_INDEX.md` — document `providerPreset` vs `provider` and preset registry.
- Modify: `VERSION.md` — add an entry for ASR provider presets.
- Modify: `docs/configuration-security.md` — mention DashScope ASR API key is runtime-only.

---

## Task 1: Add ASR provider preset config contract

**Files:**
- Modify: `scripts/voice-input-contract.test.js`
- Modify: `src/core/asr-config.ts`
- Modify: `src/core/asr-engine.ts` only if the current factory does not already accept `provider: 'openai-compatible'`

**Interfaces:**
- Consumes:
  - Existing `DEFAULT_ASR_CONFIG` from `src/core/asr-config.ts`.
  - Existing `createASREngine(config: ASRConfig): ASREngine` from `src/core/asr-engine.ts`.
- Produces:
  - `export type ASRProvider = 'openai-compatible';`
  - `export type ASRProviderPreset = 'openai' | 'aliyun-bailian' | 'custom-openai-compatible';`
  - `export interface ASRProviderPresetDefinition { id: ASRProviderPreset; label: string; provider: ASRProvider; baseUrl: string; model: string; realtimePath: string; transcriptionPath: string; streamingMode: ASRStreamingMode; language: string; note: string; }`
  - `export const ASR_PROVIDER_PRESETS: Record<ASRProviderPreset, ASRProviderPresetDefinition>;`
  - `export function applyASRProviderPreset(config: ASRConfig, preset: ASRProviderPreset): ASRConfig;`
  - `ASRConfig.providerPreset: ASRProviderPreset`.

- [ ] **Step 1: Add failing preset tests**

In `scripts/voice-input-contract.test.js`, insert this function after `testAsrConfigDefaults()`:

```js
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
```

Update `run()` to call the new test immediately after `testAsrConfigDefaults()`:

```js
async function run() {
  testAsrConfigDefaults();
  testAsrProviderPresets();
  testAsrEngineFactoryAndParser();
  await testRealtimeTerminalEventHelper();
  await testRealtimeStreamWaitsForPostCommitFinal();
  testVoiceAudioCachePaths();
  testVoiceInputManagerExports();
  testVoiceIpcChannelNames();
  console.log('voice-input-contract tests passed');
}
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
npm test
```

Expected: FAIL with an assertion similar to `undefined !== 'openai'` for `DEFAULT_ASR_CONFIG.providerPreset`, or with missing `ASR_PROVIDER_PRESETS`.

- [ ] **Step 3: Replace ASR provider types and add preset helpers**

In `src/core/asr-config.ts`, replace the current provider type line:

```ts
export type ASRProvider = 'openai-compatible' | 'aliyun' | 'custom';
```

with:

```ts
export type ASRProvider = 'openai-compatible';
export type ASRProviderPreset = 'openai' | 'aliyun-bailian' | 'custom-openai-compatible';
```

After `ASRCacheConfig`, add this interface:

```ts
export interface ASRProviderPresetDefinition {
  id: ASRProviderPreset;
  label: string;
  provider: ASRProvider;
  baseUrl: string;
  model: string;
  realtimePath: string;
  transcriptionPath: string;
  streamingMode: ASRStreamingMode;
  language: string;
  note: string;
}
```

In `ASRConfig`, add `providerPreset` before `provider`:

```ts
  providerPreset: ASRProviderPreset;
  provider: ASRProvider;
```

After the `ASRConfig` interface and before `DEFAULT_ASR_CONFIG`, add the preset registry and helper:

```ts
export const ASR_PROVIDER_PRESETS: Record<ASRProviderPreset, ASRProviderPresetDefinition> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini-transcribe',
    realtimePath: '/realtime',
    transcriptionPath: '/audio/transcriptions',
    streamingMode: 'realtime',
    language: 'zh',
    note: 'OpenAI 官方语音识别接口，使用当前 OpenAI-compatible ASR 引擎。',
  },
  'aliyun-bailian': {
    id: 'aliyun-bailian',
    label: '阿里百炼 / DashScope',
    provider: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: '',
    realtimePath: '/realtime',
    transcriptionPath: '/audio/transcriptions',
    streamingMode: 'chunked-fallback',
    language: 'zh',
    note: '阿里百炼预设复用 OpenAI-compatible ASR 引擎；请填写 DashScope API Key 和兼容 ASR 模型。若所选模型不支持当前路径，请改用自定义路径或后续添加专用 provider engine。',
  },
  'custom-openai-compatible': {
    id: 'custom-openai-compatible',
    label: '自定义 OpenAI-compatible',
    provider: 'openai-compatible',
    baseUrl: '',
    model: '',
    realtimePath: '/realtime',
    transcriptionPath: '/audio/transcriptions',
    streamingMode: 'chunked-fallback',
    language: 'zh',
    note: '用于兼容 OpenAI audio/transcriptions 或 realtime 风格接口的第三方服务；Base URL、路径和模型由用户维护。',
  },
};

export function applyASRProviderPreset(config: ASRConfig, preset: ASRProviderPreset): ASRConfig {
  const definition = ASR_PROVIDER_PRESETS[preset];
  return {
    ...config,
    providerPreset: definition.id,
    provider: definition.provider,
    baseUrl: definition.baseUrl,
    model: definition.model,
    realtimePath: definition.realtimePath,
    transcriptionPath: definition.transcriptionPath,
    streamingMode: definition.streamingMode,
    language: definition.language,
    apiKey: config.apiKey,
    enabled: config.enabled,
    autoSendFinalTranscript: config.autoSendFinalTranscript,
    holdToTalkShortcut: config.holdToTalkShortcut,
    cache: config.cache,
  };
}
```

- [ ] **Step 4: Add default providerPreset**

In `DEFAULT_ASR_CONFIG`, add `providerPreset: 'openai'` before `provider`:

```ts
export const DEFAULT_ASR_CONFIG: ASRConfig = {
  enabled: false,
  providerPreset: 'openai',
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini-transcribe',
  realtimePath: '/realtime',
  transcriptionPath: '/audio/transcriptions',
  streamingMode: 'realtime',
  language: 'zh',
  autoSendFinalTranscript: false,
  holdToTalkShortcut: 'Ctrl+Shift+Space',
  cache: {
    enabled: true,
    retentionMinutes: 30,
    maxSessionBytes: 10 * 1024 * 1024,
  },
};
```

- [ ] **Step 5: Keep engine factory strict and stable**

Inspect `src/core/asr-engine.ts`. The factory should still be:

```ts
export function createASREngine(config: ASRConfig): ASREngine {
  if (config.provider === 'openai-compatible') {
    return new OpenAICompatibleASREngine();
  }
  throw new Error(`Unsupported ASR provider: ${config.provider}`);
}
```

If it already matches, leave it unchanged. If it has fallback behavior for unsupported providers, replace it with the code above.

- [ ] **Step 6: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected:

- `npm test`: PASS with `voice-input-contract tests passed`.
- `npm run build`: PASS with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/asr-config.ts src/core/asr-engine.ts scripts/voice-input-contract.test.js
git commit -m "feat(voice): add asr provider presets"
```

---

## Task 2: Add provider preset UI to ASR settings

**Files:**
- Modify: `src/main/settings.html`

**Interfaces:**
- Consumes:
  - Runtime config fields from Task 1: `providerPreset`, `provider`, `baseUrl`, `model`, `realtimePath`, `transcriptionPath`, `streamingMode`, `language`.
- Produces:
  - DOM elements:
    - `#asrProviderPreset`
    - `#applyASRPresetBtn`
    - `#asrProviderPresetNote`
  - JS helpers:
    - `getASRPresetDefinition(id)`
    - `updateASRPresetNote()`
    - `applySelectedASRPreset()`

- [ ] **Step 1: Replace ASR provider dropdown markup**

In `src/main/settings.html`, replace this block:

```html
      <div class="field">
        <label>供应商</label>
        <select id="asrProvider">
          <option value="openai-compatible">OpenAI-compatible</option>
        </select>
      </div>
```

with:

```html
      <div class="field">
        <label>供应商预设</label>
        <select id="asrProviderPreset">
          <option value="openai">OpenAI</option>
          <option value="aliyun-bailian">阿里百炼 / DashScope</option>
          <option value="custom-openai-compatible">自定义 OpenAI-compatible</option>
        </select>
        <div class="hint" id="asrProviderPresetNote">OpenAI 官方语音识别接口，使用当前 OpenAI-compatible ASR 引擎。</div>
      </div>

      <div class="field">
        <label>实际引擎</label>
        <select id="asrProvider">
          <option value="openai-compatible">OpenAI-compatible</option>
        </select>
        <div class="hint">实际引擎决定运行时代码路径；本轮所有预设都复用 OpenAI-compatible ASR 引擎。</div>
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary" id="applyASRPresetBtn">应用推荐配置</button>
      </div>
```

- [ ] **Step 2: Add settings-page preset definitions**

In the `<script>` section, insert this block immediately before `async function loadASRConfig()`:

```js
    var asrProviderPresets = {
      'openai': {
        label: 'OpenAI',
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini-transcribe',
        realtimePath: '/realtime',
        transcriptionPath: '/audio/transcriptions',
        streamingMode: 'realtime',
        language: 'zh',
        note: 'OpenAI 官方语音识别接口，使用当前 OpenAI-compatible ASR 引擎。',
      },
      'aliyun-bailian': {
        label: '阿里百炼 / DashScope',
        provider: 'openai-compatible',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: '',
        realtimePath: '/realtime',
        transcriptionPath: '/audio/transcriptions',
        streamingMode: 'chunked-fallback',
        language: 'zh',
        note: '阿里百炼预设复用 OpenAI-compatible ASR 引擎。请填写你的 DashScope API Key 和兼容 ASR 模型；如果所选模型不支持当前 realtime 或 transcription path，请改用自定义路径，或后续添加专用 provider engine。',
      },
      'custom-openai-compatible': {
        label: '自定义 OpenAI-compatible',
        provider: 'openai-compatible',
        baseUrl: '',
        model: '',
        realtimePath: '/realtime',
        transcriptionPath: '/audio/transcriptions',
        streamingMode: 'chunked-fallback',
        language: 'zh',
        note: '用于兼容 OpenAI audio/transcriptions 或 realtime 风格接口的第三方服务；Base URL、路径和模型由用户维护。',
      },
    };

    function getASRPresetDefinition(id) {
      return asrProviderPresets[id] || asrProviderPresets.openai;
    }

    function updateASRPresetNote() {
      var presetId = document.getElementById('asrProviderPreset').value || 'openai';
      var preset = getASRPresetDefinition(presetId);
      document.getElementById('asrProviderPresetNote').textContent = preset.note;
      document.getElementById('asrProvider').value = preset.provider;
    }

    function applySelectedASRPreset() {
      var presetId = document.getElementById('asrProviderPreset').value || 'openai';
      var preset = getASRPresetDefinition(presetId);
      document.getElementById('asrProvider').value = preset.provider;
      document.getElementById('asrBaseUrl').value = preset.baseUrl;
      document.getElementById('asrModel').value = preset.model;
      document.getElementById('asrRealtimePath').value = preset.realtimePath;
      document.getElementById('asrTranscriptionPath').value = preset.transcriptionPath;
      document.getElementById('asrStreamingMode').value = preset.streamingMode;
      document.getElementById('asrLanguage').value = preset.language;
      updateASRPresetNote();
    }
```

- [ ] **Step 3: Load providerPreset from config**

In `loadASRConfig()`, replace this line:

```js
      document.getElementById('asrProvider').value = config.provider || 'openai-compatible';
```

with:

```js
      document.getElementById('asrProviderPreset').value = config.providerPreset || 'openai';
      document.getElementById('asrProvider').value = config.provider || 'openai-compatible';
      updateASRPresetNote();
```

Keep the remaining field assignments unchanged.

- [ ] **Step 4: Save providerPreset in collected ASR config**

In `collectASRConfig()`, replace the start of the returned object:

```js
      return {
        enabled: document.getElementById('asrEnabled').checked,
        holdToTalkShortcut: document.getElementById('asrHoldToTalkShortcut').value.trim() || 'Ctrl+Shift+Space',
        provider: document.getElementById('asrProvider').value,
```

with:

```js
      return {
        enabled: document.getElementById('asrEnabled').checked,
        holdToTalkShortcut: document.getElementById('asrHoldToTalkShortcut').value.trim() || 'Ctrl+Shift+Space',
        providerPreset: document.getElementById('asrProviderPreset').value || 'openai',
        provider: document.getElementById('asrProvider').value,
```

- [ ] **Step 5: Wire preset dropdown and apply button**

Before the existing `document.getElementById('saveASRBtn').addEventListener('click', () => { ... })` block, insert:

```js
    document.getElementById('asrProviderPreset').addEventListener('change', updateASRPresetNote);
    document.getElementById('applyASRPresetBtn').addEventListener('click', function() {
      applySelectedASRPreset();
      showToast('已应用语音输入供应商推荐配置；API Key 不会自动填写', 'success');
    });
```

- [ ] **Step 6: Keep save validation strict**

Keep the existing provider validation in `saveASRBtn`:

```js
      if (config.provider !== 'openai-compatible') {
        showToast('语音输入当前仅支持 OpenAI-compatible 供应商', 'error');
        return;
      }
```

Keep the existing enabled validation:

```js
      if (config.enabled && (!config.baseUrl || !config.model || !config.apiKey)) {
        showToast('启用语音输入时需要 Base URL、模型和 API Key', 'error');
        return;
      }
```

This is required so 阿里百炼 preset with empty model cannot be enabled accidentally.

- [ ] **Step 7: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected:

- `npm test`: PASS with `voice-input-contract tests passed`.
- `npm run build`: PASS with no TypeScript errors.

- [ ] **Step 8: Manual settings verification**

Run:

```bash
npm run dev
```

Verify manually:

- Press F11 to open settings.
- Open `语音输入（ASR）` tab.
- Provider preset dropdown contains OpenAI, 阿里百炼 / DashScope, and 自定义 OpenAI-compatible.
- Selecting 阿里百炼 changes the note text but does not immediately overwrite Base URL/model/path.
- Clicking `应用推荐配置` fills Base URL with `https://dashscope.aliyuncs.com/compatible-mode/v1`, sets streaming mode to `chunked-fallback`, leaves API Key empty, and leaves model empty.
- Enabling ASR with empty model/API key shows `启用语音输入时需要 Base URL、模型和 API Key`.

- [ ] **Step 9: Commit**

```bash
git add src/main/settings.html
git commit -m "feat(voice): add asr provider preset settings"
```

---

## Task 3: Update safe example config and documentation

**Files:**
- Modify: `src/config/asr.example.json`
- Modify: `README.md`
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`
- Modify: `docs/configuration-security.md`

**Interfaces:**
- Consumes:
  - `providerPreset` field from Task 1.
  - Preset labels and behavior from Task 2.
- Produces:
  - Safe committed ASR example includes `providerPreset` and empty `apiKey`.
  - Documentation explains preset behavior and DashScope security boundary.

- [ ] **Step 1: Update ASR example config**

In `src/config/asr.example.json`, add `providerPreset` between `enabled` and `provider` so the file becomes:

```json
{
  "enabled": false,
  "providerPreset": "openai",
  "provider": "openai-compatible",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "",
  "model": "gpt-4o-mini-transcribe",
  "realtimePath": "/realtime",
  "transcriptionPath": "/audio/transcriptions",
  "streamingMode": "realtime",
  "language": "zh",
  "autoSendFinalTranscript": false,
  "holdToTalkShortcut": "Ctrl+Shift+Space",
  "cache": {
    "enabled": true,
    "retentionMinutes": 30,
    "maxSessionBytes": 10485760
  }
}
```

- [ ] **Step 2: Update README feature text**

In `README.md`, find the feature table row for Voice Input:

```md
| Voice Input (ASR) | 麦克风按钮 + 长按快捷键，流式识别到聊天输入框 | ✔ |
```

Replace it with:

```md
| Voice Input (ASR) | 麦克风按钮 + 长按快捷键，支持 OpenAI / 阿里百炼 / 自定义 OpenAI-compatible 预设 | ✔ |
```

Under the usage table that includes the mic button and `Ctrl+Shift+Space`, add this paragraph:

```md
ASR 供应商在 F11 设置的“语音输入”页配置。当前内置 OpenAI、阿里百炼 / DashScope、自定义 OpenAI-compatible 三个预设；阿里百炼预设复用 OpenAI-compatible ASR 引擎，需填写 DashScope API Key 和兼容 ASR 模型。
```

- [ ] **Step 3: Update PROJECT_INDEX core module notes**

In `PROJECT_INDEX.md`, replace the existing ASR config/core rows:

```md
- `asr-config.ts`：ASR 运行态配置，使用 `JsonConfigStore<T>` 保存到 Electron `userData/config/asr.json`。
- `asr-engine.ts` / `asr-openai-compatible.ts`：ASR 引擎接口与 OpenAI-compatible provider，主流程只依赖 `ASREngine.stream(...)`。
```

with:

```md
- `asr-config.ts`：ASR 运行态配置，使用 `JsonConfigStore<T>` 保存到 Electron `userData/config/asr.json`；`providerPreset` 表示设置页模板，`provider` 表示实际 ASR 引擎类型。
- `asr-engine.ts` / `asr-openai-compatible.ts`：ASR 引擎接口与 OpenAI-compatible provider，主流程只依赖 `ASREngine.stream(...)`；OpenAI、阿里百炼 / DashScope、自定义 OpenAI-compatible 预设当前都复用该引擎。
```

Under the ASR IPC rows or the nearby architecture notes, add:

```md
### ASR provider presets

语音输入设置页提供 OpenAI、阿里百炼 / DashScope、自定义 OpenAI-compatible 三个供应商预设。预设只负责填充 Base URL、路径、模型和流式模式等配置；运行时仍按 `provider` 字段选择实际引擎。本轮阿里百炼预设的 `provider` 仍为 `openai-compatible`，不包含专用百炼 ASR 协议实现。
```

- [ ] **Step 4: Update VERSION**

At the top of `VERSION.md`, under `## Unreleased` if it exists, add:

```md
- ASR 设置新增供应商预设：OpenAI、阿里百炼 / DashScope、自定义 OpenAI-compatible；阿里百炼当前作为 OpenAI-compatible 预设接入，不新增专用 ASR 引擎。
```

If `## Unreleased` is missing, insert this block above the latest version heading:

```md
## Unreleased
- ASR 设置新增供应商预设：OpenAI、阿里百炼 / DashScope、自定义 OpenAI-compatible；阿里百炼当前作为 OpenAI-compatible 预设接入，不新增专用 ASR 引擎。
```

- [ ] **Step 5: Update configuration security docs**

In `docs/configuration-security.md`, add or update the ASR runtime config rule so it includes this paragraph:

```md
ASR 供应商预设不会写入真实密钥。OpenAI、阿里百炼 / DashScope、自定义 OpenAI-compatible 的 ASR API Key 都只能保存在本地运行态 `asr.json`，不得提交到仓库；`src/config/asr.example.json` 必须保持 `apiKey` 为空。阿里百炼预设使用 DashScope compatible-mode Base URL，但模型名和 API Key 由用户在本地设置中填写。
```

- [ ] **Step 6: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected:

- `npm test`: PASS with `voice-input-contract tests passed`.
- `npm run build`: PASS with no TypeScript errors.

- [ ] **Step 7: Inspect for secrets and runtime files**

Run:

```bash
git status --short
git diff -- src/config/asr.example.json README.md PROJECT_INDEX.md VERSION.md docs/configuration-security.md
git grep -n "sk-\|apiKey.*[A-Za-z0-9]" -- ':!node_modules'
```

Expected:

- `src/config/asr.example.json` has `"apiKey": ""`.
- No real DashScope/OpenAI key appears.
- `src/config/asr.json` is not listed in git status.
- `git grep` shows only safe examples or code that reads/writes API key fields.

- [ ] **Step 8: Commit**

```bash
git add src/config/asr.example.json README.md PROJECT_INDEX.md VERSION.md docs/configuration-security.md
git commit -m "docs(voice): document asr provider presets"
```

---

## Task 4: Final verification and cleanup

**Files:**
- Modify only if verification exposes a concrete issue in files touched by Tasks 1-3.

**Interfaces:**
- Consumes:
  - Preset config from Task 1.
  - Settings UI from Task 2.
  - Docs/example config from Task 3.
- Produces:
  - Verified ASR provider preset feature with clean working tree or a final fix commit.

- [ ] **Step 1: Run automated verification**

Run:

```bash
npm test
npm run build
git status --short
```

Expected:

- `npm test`: PASS with `voice-input-contract tests passed`.
- `npm run build`: PASS.
- `git status --short`: clean, or only intentional verification fixes.

- [ ] **Step 2: Run manual app verification**

Run:

```bash
npm run dev
```

Verify:

- F11 settings opens.
- `语音输入（ASR）` tab shows provider preset dropdown.
- OpenAI preset note is shown by default.
- 阿里百炼 / DashScope preset note explains it uses OpenAI-compatible ASR engine.
- `应用推荐配置` for 阿里百炼 fills DashScope compatible-mode Base URL and leaves API key empty.
- Saving with ASR enabled and empty API key/model fails with the existing validation toast.
- Saving with ASR disabled succeeds without adding `src/config/asr.json` to git.

- [ ] **Step 3: Verify git safety**

Run:

```bash
git status --short
git log --oneline -n 6
git grep -n "dashscope.aliyuncs.com/compatible-mode/v1" -- src docs README.md PROJECT_INDEX.md VERSION.md
git grep -n "apiKey.*[A-Za-z0-9]\|sk-" -- ':!node_modules'
```

Expected:

- Recent commits include the design commit and implementation/doc commits.
- DashScope compatible-mode URL appears only in config presets, safe example/docs, or settings UI.
- No real API key appears.
- No audio cache or runtime `asr.json` file is tracked.

- [ ] **Step 4: Commit final fixes if needed**

If verification required code or documentation fixes, commit them:

```bash
git add <fixed-files>
git commit -m "fix(voice): stabilize asr provider presets"
```

If no fixes were needed, do not create an empty commit.

- [ ] **Step 5: Report final result**

Report:

- Commits created.
- Commands run and pass/fail results.
- Manual checks completed or skipped.
- Explicit limitation: 阿里百炼 is currently a preset over `OpenAICompatibleASREngine`; no dedicated 百炼 ASR engine exists yet.

---

## Self-Review Checklist

- Spec coverage:
  - Provider preset layer: Task 1.
  - 阿里百炼 / DashScope selectable preset: Tasks 1 and 2.
  - Reuse OpenAI-compatible engine: Tasks 1 and 4 verification.
  - Editable settings fields: Task 2 keeps existing fields and adds explicit apply button.
  - Safe examples and no real API keys: Task 3.
  - Documentation updates: Task 3.
  - Tests and build: every task includes `npm test` and `npm run build`.
- Placeholder scan:
  - This plan contains no incomplete implementation markers.
  - Every code-changing step includes exact code or exact replacement blocks.
- Type consistency:
  - `ASRProviderPreset` values match spec and settings option values: `openai`, `aliyun-bailian`, `custom-openai-compatible`.
  - `ASR_PROVIDER_PRESETS` keys match `ASRProviderPreset` exactly.
  - `applyASRProviderPreset(config, preset)` returns `ASRConfig` and preserves safety fields exactly as tests assert.
  - Settings UI `providerPreset` field name matches `ASRConfig.providerPreset` and `src/config/asr.example.json`.
