# ASR Settings Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the ASR settings page by hiding advanced provider/path/streaming/cache controls behind an explicit advanced-settings toggle, defaulting normal usage to stable chunked transcription, and saving current form values before recognition tests.

**Architecture:** Add a persistent `advancedSettingsEnabled` flag to `ASRConfig` with backwards-compatible normalization. The settings page keeps all existing advanced fields and engine wiring, but wraps them in an advanced section that is hidden by default; when hidden, `collectASRConfig()` writes safe default advanced values. Recognition tests save the current valid config before starting a `VoiceInputManager` session so renderer form state and main-process runtime config stay in sync.

**Tech Stack:** Electron settings HTML/inline JS, TypeScript strict mode, existing `JsonConfigStore<T>`, existing dependency-free `scripts/voice-input-contract.test.js`, existing `npm test` / `npm run build`.

## Global Constraints

- Do not add a dedicated 阿里百炼 / DashScope ASR engine.
- Do not verify or claim any third-party model supports OpenAI Realtime WebSocket.
- Do not remove existing ASR engine, provider preset, realtime path, transcription path, streaming mode, or cache config fields.
- Do not change main chat input recording button or hold-to-talk behavior.
- Runtime ASR config remains Electron `userData/config/asr.json`.
- Normal settings mode defaults to `streamingMode: 'chunked-fallback'`.
- Recognition test must save current valid form config before calling `voice-input-start`.
- Required verification after every implementation task: `npm test` and `npm run build`.

---

## File Structure

- Modify `src/core/asr-config.ts`: add `advancedSettingsEnabled: boolean`, normalize it, and set default normal-mode streaming to `chunked-fallback`.
- Modify `src/config/asr.example.json`: add safe `advancedSettingsEnabled: false` and default `streamingMode: "chunked-fallback"`.
- Modify `scripts/voice-input-contract.test.js`: add contract coverage for default advanced flag, settings DOM IDs, normal-mode defaults, and realtime error copy.
- Modify `src/main/settings.html`: add the advanced toggle and wrapper, hide/show advanced fields, default hidden fields when advanced is off, save before recognition test, and map realtime open failures to clearer copy.
- Modify `PROJECT_INDEX.md`: document simplified ASR settings and advanced setting boundary.
- Modify `VERSION.md`: add an Unreleased note for ASR settings simplification.

---

## Task 1: Add ASR advanced-settings config contract

**Files:**
- Modify: `scripts/voice-input-contract.test.js`
- Modify: `src/core/asr-config.ts`
- Modify: `src/config/asr.example.json`

**Interfaces:**
- Consumes: existing `ASRConfig`, `DEFAULT_ASR_CONFIG`, `normalizeASRConfigForLoad(config: Partial<ASRConfig>): ASRConfig`.
- Produces:
  - `ASRConfig.advancedSettingsEnabled: boolean`
  - `DEFAULT_ASR_CONFIG.advancedSettingsEnabled === false`
  - `DEFAULT_ASR_CONFIG.streamingMode === 'chunked-fallback'`
  - `normalizeASRConfigForLoad(...)` preserving valid boolean `advancedSettingsEnabled` and defaulting missing/invalid values to `false`.

- [ ] **Step 1: Extend the failing config contract test**

In `scripts/voice-input-contract.test.js`, update `testAsrConfigDefaults()` so the assertions around defaults include `advancedSettingsEnabled` and the new normal-mode streaming default:

```js
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
```

- [ ] **Step 2: Extend normalizer coverage**

In `testAsrNormalizerDeepMergesCacheAndValidatesTypes()`, add these assertions after the existing `invalidCache` assertion:

```js
  const advancedEnabled = normalizeASRConfigForLoad({ advancedSettingsEnabled: true });
  assert.strictEqual(advancedEnabled.advancedSettingsEnabled, true);

  const invalidAdvancedFlag = normalizeASRConfigForLoad({ advancedSettingsEnabled: 'true' });
  assert.strictEqual(invalidAdvancedFlag.advancedSettingsEnabled, false);
```

- [ ] **Step 3: Run test to verify RED**

Run:

```bash
npm test
```

Expected: FAIL with an assertion similar to `undefined !== false` for `DEFAULT_ASR_CONFIG.advancedSettingsEnabled`, or `realtime !== chunked-fallback` for the default streaming mode.

- [ ] **Step 4: Add `advancedSettingsEnabled` to the config type**

In `src/core/asr-config.ts`, add the field to `ASRConfig` immediately after `enabled`:

```ts
export interface ASRConfig {
  enabled: boolean;
  advancedSettingsEnabled: boolean;
  providerPreset: ASRProviderPreset;
  provider: ASRProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  realtimePath: string;
  transcriptionPath: string;
  streamingMode: ASRStreamingMode;
  language: string;
  autoSendFinalTranscript: boolean;
  holdToTalkShortcut: string;
  cache: ASRCacheConfig;
}
```

- [ ] **Step 5: Normalize the new flag**

In `normalizeASRConfigForLoad()`, add this property after `enabled:`:

```ts
    advancedSettingsEnabled: normalizeBoolean(raw.advancedSettingsEnabled, DEFAULT_ASR_CONFIG.advancedSettingsEnabled),
```

The start of the normalized object should now be:

```ts
  const normalized: ASRConfig = {
    ...DEFAULT_ASR_CONFIG,
    ...config,
    enabled: normalizeBoolean(raw.enabled, DEFAULT_ASR_CONFIG.enabled),
    advancedSettingsEnabled: normalizeBoolean(raw.advancedSettingsEnabled, DEFAULT_ASR_CONFIG.advancedSettingsEnabled),
    provider: isASRProvider(raw.provider) ? raw.provider : DEFAULT_ASR_CONFIG.provider,
```

- [ ] **Step 6: Update defaults**

In `DEFAULT_ASR_CONFIG`, add `advancedSettingsEnabled: false` after `enabled: false`, and change streaming mode to the normal-mode fallback default:

```ts
export const DEFAULT_ASR_CONFIG: ASRConfig = {
  enabled: false,
  advancedSettingsEnabled: false,
  providerPreset: DEFAULT_ASR_PROVIDER_PRESET,
  provider: OPENAI_ASR_PRESET.provider,
  baseUrl: OPENAI_ASR_PRESET.baseUrl,
  apiKey: '',
  model: OPENAI_ASR_PRESET.model,
  realtimePath: OPENAI_ASR_PRESET.realtimePath,
  transcriptionPath: OPENAI_ASR_PRESET.transcriptionPath,
  streamingMode: 'chunked-fallback',
  language: OPENAI_ASR_PRESET.language,
  autoSendFinalTranscript: false,
  holdToTalkShortcut: 'Ctrl+Shift+Space',
  cache: {
    enabled: true,
    retentionMinutes: 30,
    maxSessionBytes: 10 * 1024 * 1024,
  },
};
```

Do not change `ASR_PROVIDER_PRESETS.openai.streamingMode`; it may remain `realtime` for advanced preset application.

- [ ] **Step 7: Update safe example config**

In `src/config/asr.example.json`, add `advancedSettingsEnabled` after `enabled`, and set `streamingMode` to `chunked-fallback`:

```json
{
  "enabled": false,
  "advancedSettingsEnabled": false,
  "providerPreset": "openai",
  "provider": "openai-compatible",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "",
  "model": "gpt-4o-mini-transcribe",
  "realtimePath": "/realtime",
  "transcriptionPath": "/audio/transcriptions",
  "streamingMode": "chunked-fallback",
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

- [ ] **Step 8: Run verification**

Run:

```bash
npm test
npm run build
```

Expected:

- `npm test`: PASS with all contract tests passing.
- `npm run build`: PASS with no TypeScript errors.

- [ ] **Step 9: Commit Task 1**

```bash
git status --short
git add src/core/asr-config.ts src/config/asr.example.json scripts/voice-input-contract.test.js
git commit -m "feat(voice): add asr advanced settings flag"
```

---

## Task 2: Hide advanced ASR settings by default

**Files:**
- Modify: `scripts/voice-input-contract.test.js`
- Modify: `src/main/settings.html`

**Interfaces:**
- Consumes: `ASRConfig.advancedSettingsEnabled` from Task 1.
- Produces DOM IDs:
  - `asrAdvancedSettingsEnabled`
  - `asrAdvancedSettingsSection`
- Produces JS helpers:
  - `getDefaultASRAdvancedFields(): object`
  - `isASRAdvancedSettingsEnabled(): boolean`
  - `toggleASRAdvancedSettings(): void`
- Updates `collectASRConfig()` to use default advanced fields when the advanced toggle is off.

- [ ] **Step 1: Add failing settings contract assertions**

In `testSettingsAsrPresetContractMatchesCoreDefinitions()`, after the existing ASR test control ID loop, add:

```js
  for (const id of [
    'asrAdvancedSettingsEnabled',
    'asrAdvancedSettingsSection',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `settings.html missing ASR advanced setting #${id}`);
  }
  assert.match(html, /显示高级 ASR 设置/);
  assert.match(html, /function getDefaultASRAdvancedFields\(\)/);
  assert.match(html, /function toggleASRAdvancedSettings\(\)/);
  assert.match(html, /advancedSettingsEnabled: isASRAdvancedSettingsEnabled\(\)/);
  assert.match(html, /streamingMode: 'chunked-fallback'/);
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
npm test
```

Expected: FAIL because `asrAdvancedSettingsEnabled` or `getDefaultASRAdvancedFields()` is missing.

- [ ] **Step 3: Insert the advanced toggle markup**

In `src/main/settings.html`, inside `#tab-asr`, replace the current ASR enable hint block:

```html
      <div class="field">
        <label><input type="checkbox" id="asrEnabled"> 启用语音输入</label>
        <div class="hint">右键输入框中显示麦克风按钮；快捷键默认为 Ctrl+Shift+Space 长按说话。开启前需要填写 Base URL、API Key 和模型。</div>
        <div class="hint" id="asrValidationMessage" style="display: none; color: #c62828; margin-top: 6px;"></div>
      </div>
```

with:

```html
      <div class="field">
        <label><input type="checkbox" id="asrEnabled"> 启用语音输入</label>
        <div class="hint">右键输入框中显示麦克风按钮；快捷键默认为 Ctrl+Shift+Space 长按说话。普通模式只需要填写 API Key 和模型。</div>
        <div class="hint" id="asrValidationMessage" style="display: none; color: #c62828; margin-top: 6px;"></div>
      </div>

      <div class="field">
        <label><input type="checkbox" id="asrAdvancedSettingsEnabled"> 显示高级 ASR 设置</label>
        <div class="hint">默认关闭。只有需要自定义供应商、Base URL、Realtime/Transcription Path、流式模式或缓存时再开启。</div>
      </div>
```

- [ ] **Step 4: Wrap advanced fields in an advanced section**

Immediately before the existing provider preset field:

```html
      <div class="field">
        <label>供应商预设</label>
```

insert:

```html
      <div id="asrAdvancedSettingsSection" style="display: none;">
        <h2 style="margin-top: 20px;">高级 ASR 设置</h2>
        <hr class="divider">
        <div class="hint" style="margin-bottom: 10px; color: #666;">
          仅在需要第三方 OpenAI-compatible endpoint、Realtime WebSocket 或自定义缓存策略时开启。普通语音识别测试默认使用 chunked-fallback。
        </div>
```

Then close the wrapper immediately after the streaming mode field block:

```html
      <div class="field">
        <label>流式模式</label>
        <select id="asrStreamingMode">
          <option value="realtime">Realtime</option>
          <option value="chunked-fallback">Chunked fallback</option>
        </select>
      </div>
```

by adding:

```html
      </div>
```

Do not place API Key, model, language, auto-send, or test controls inside the advanced wrapper.

- [ ] **Step 5: Move cache fields into the advanced section**

Move these existing blocks from below auto-send into the advanced section before its closing `</div>`:

```html
      <div class="field">
        <label><input type="checkbox" id="asrCacheEnabled"> 启用短期音频缓存</label>
      </div>

      <div class="field">
        <label>缓存保留分钟</label>
        <input type="text" id="asrCacheRetention" placeholder="30">
      </div>

      <div class="field">
        <label>单次录音最大字节</label>
        <input type="text" id="asrCacheMaxBytes" placeholder="10485760">
      </div>
```

After this step, the order in `#tab-asr` should be:

```txt
启用语音输入
显示高级 ASR 设置
长按说话快捷键
高级 ASR 设置 wrapper: provider preset, provider, apply preset, Base URL, paths, streaming, cache
API Key
模型
语言
测试区
自动发送
保存按钮
```

- [ ] **Step 6: Add settings helpers**

In the `<script>` section near `getASRPresetDefinition()`, add:

```js
    function getDefaultASRAdvancedFields() {
      return {
        providerPreset: 'openai',
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        realtimePath: '/realtime',
        transcriptionPath: '/audio/transcriptions',
        streamingMode: 'chunked-fallback',
        cache: {
          enabled: true,
          retentionMinutes: 30,
          maxSessionBytes: 10485760,
        },
      };
    }

    function isASRAdvancedSettingsEnabled() {
      return !!document.getElementById('asrAdvancedSettingsEnabled').checked;
    }

    function toggleASRAdvancedSettings() {
      var section = document.getElementById('asrAdvancedSettingsSection');
      var enabled = isASRAdvancedSettingsEnabled();
      section.style.display = enabled ? 'block' : 'none';
    }
```

- [ ] **Step 7: Load and toggle advanced mode**

In `loadASRConfig()`, after setting `asrEnabled`, add:

```js
      document.getElementById('asrAdvancedSettingsEnabled').checked = !!config.advancedSettingsEnabled;
```

At the end of `loadASRConfig()`, after cache fields are populated, add:

```js
      toggleASRAdvancedSettings();
```

- [ ] **Step 8: Update `collectASRConfig()`**

Replace the whole `collectASRConfig()` function with:

```js
    function collectASRConfig() {
      var advancedEnabled = isASRAdvancedSettingsEnabled();
      var defaults = getDefaultASRAdvancedFields();
      var advanced = advancedEnabled ? {
        providerPreset: document.getElementById('asrProviderPreset').value || 'openai',
        provider: document.getElementById('asrProvider').value,
        baseUrl: document.getElementById('asrBaseUrl').value.trim(),
        realtimePath: document.getElementById('asrRealtimePath').value.trim(),
        transcriptionPath: document.getElementById('asrTranscriptionPath').value.trim(),
        streamingMode: document.getElementById('asrStreamingMode').value,
        cache: {
          enabled: document.getElementById('asrCacheEnabled').checked,
          retentionMinutes: Number(document.getElementById('asrCacheRetention').value || 30),
          maxSessionBytes: Number(document.getElementById('asrCacheMaxBytes').value || 10485760),
        },
      } : defaults;

      return {
        enabled: document.getElementById('asrEnabled').checked,
        advancedSettingsEnabled: advancedEnabled,
        holdToTalkShortcut: document.getElementById('asrHoldToTalkShortcut').value.trim() || 'Ctrl+Shift+Space',
        providerPreset: advanced.providerPreset,
        provider: advanced.provider,
        baseUrl: advanced.baseUrl,
        apiKey: document.getElementById('asrApiKey').value,
        model: document.getElementById('asrModel').value.trim(),
        realtimePath: advanced.realtimePath,
        transcriptionPath: advanced.transcriptionPath,
        streamingMode: advanced.streamingMode,
        language: document.getElementById('asrLanguage').value.trim() || 'zh',
        autoSendFinalTranscript: document.getElementById('asrAutoSend').checked,
        cache: advanced.cache,
      };
    }
```

- [ ] **Step 9: Wire advanced toggle listener**

Near the existing ASR event listeners, before the `saveASRBtn` listener, add:

```js
    document.getElementById('asrAdvancedSettingsEnabled').addEventListener('change', toggleASRAdvancedSettings);
```

- [ ] **Step 10: Run verification**

Run:

```bash
npm test
npm run build
```

Expected:

- `npm test`: PASS.
- `npm run build`: PASS.

- [ ] **Step 11: Commit Task 2**

```bash
git status --short
git add src/main/settings.html scripts/voice-input-contract.test.js
git commit -m "feat(voice): hide advanced asr settings by default"
```

---

## Task 3: Save current ASR config before recognition test and improve realtime failure copy

**Files:**
- Modify: `scripts/voice-input-contract.test.js`
- Modify: `src/main/settings.html`

**Interfaces:**
- Consumes: `collectASRConfig()`, `validateASRRecognitionTestConfig(config)`, `window.companion.saveASRConfig(config)`, `window.companion.voiceInput.start(...)`.
- Produces:
  - `saveASRConfigForRecognitionTest(config): Promise<any>`
  - `formatASRRecognitionErrorMessage(message: string): string`
  - recognition test startup saves config before `voiceInput.start(...)`.

- [ ] **Step 1: Add failing contract assertions**

In `testSettingsAsrPresetContractMatchesCoreDefinitions()`, add these assertions after the assertions from Task 2:

```js
  assert.match(html, /async function saveASRConfigForRecognitionTest\(config\)/);
  assert.match(html, /await saveASRConfigForRecognitionTest\(config\);[\s\S]*?window\.companion\.voiceInput\.start/);
  assert.match(html, /function formatASRRecognitionErrorMessage\(message\)/);
  assert.match(html, /实时识别连接失败/);
  assert.match(html, /chunked-fallback 后重试/);
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
npm test
```

Expected: FAIL because `saveASRConfigForRecognitionTest` and `formatASRRecognitionErrorMessage` are missing.

- [ ] **Step 3: Add recognition test save helper**

In `src/main/settings.html`, near `validateASRRecognitionTestConfig(config)`, add:

```js
    async function saveASRConfigForRecognitionTest(config) {
      var savedConfig = await window.companion.saveASRConfig(config);
      setASRValidationMessage('');
      debugASRSettings('recognition test config saved', {
        enabled: !!(savedConfig && savedConfig.enabled),
        advancedSettingsEnabled: !!(savedConfig && savedConfig.advancedSettingsEnabled),
        streamingMode: savedConfig && savedConfig.streamingMode,
        providerPreset: savedConfig && savedConfig.providerPreset,
        hasApiKey: !!(savedConfig && savedConfig.apiKey),
        model: savedConfig && savedConfig.model,
      });
      return savedConfig;
    }
```

- [ ] **Step 4: Add realtime error formatter**

Near `setASRRecognitionResult(text)`, add:

```js
    function formatASRRecognitionErrorMessage(message) {
      var text = message || '语音识别失败';
      if (text.indexOf('ASR realtime connection did not open') >= 0) {
        return '实时识别连接失败：当前服务商、模型或网络可能不支持 Realtime WebSocket。可关闭高级 ASR 设置，或将流式模式改为 chunked-fallback 后重试。';
      }
      return text;
    }
```

- [ ] **Step 5: Save before starting recognition**

In `startASRRecognitionTest()`, immediately after:

```js
      const config = collectASRConfig();
      if (!validateASRRecognitionTestConfig(config)) return;
```

add:

```js
      await saveASRConfigForRecognitionTest(config);
```

The start of the function should be:

```js
    async function startASRRecognitionTest() {
      if (asrRecognitionRunning || asrRecognitionStopping) return;
      const config = collectASRConfig();
      if (!validateASRRecognitionTestConfig(config)) return;
      await saveASRConfigForRecognitionTest(config);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setASRMicStatus('当前环境不支持麦克风访问', true);
        return;
      }
```

- [ ] **Step 6: Apply formatted error copy in catch path**

In `startASRRecognitionTest()` catch block, replace the startup failure status line:

```js
        setASRMicStatus('语音识别测试启动失败：' + (error && error.message ? error.message : String(error)), true);
```

with:

```js
        const message = formatASRRecognitionErrorMessage(error && error.message ? error.message : String(error));
        setASRMicStatus('语音识别测试启动失败：' + message, true);
```

- [ ] **Step 7: Apply formatted error copy in status/transcript listeners**

In the `window.companion.voiceInput.onStatus(...)` handler, replace:

```js
          setASRMicStatus(payload.message || '语音识别失败', true);
```

with:

```js
          setASRMicStatus(formatASRRecognitionErrorMessage(payload.message || '语音识别失败'), true);
```

In the `window.companion.voiceInput.onTranscript(...)` handler for `payload.type === 'error'`, replace:

```js
          setASRMicStatus(payload.message || '语音识别失败', true);
```

with:

```js
          setASRMicStatus(formatASRRecognitionErrorMessage(payload.message || '语音识别失败'), true);
```

- [ ] **Step 8: Run verification**

Run:

```bash
npm test
npm run build
```

Expected:

- `npm test`: PASS.
- `npm run build`: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git status --short
git add src/main/settings.html scripts/voice-input-contract.test.js
git commit -m "fix(voice): save asr config before recognition test"
```

---

## Task 4: Update documentation and final verification

**Files:**
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`

**Interfaces:**
- Consumes: behavior implemented by Tasks 1-3.
- Produces: current project docs describing normal/advanced ASR settings and Unreleased version note.

- [ ] **Step 1: Update `PROJECT_INDEX.md` ASR config note**

In `PROJECT_INDEX.md`, replace the existing `asr-config.ts` bullet with:

```md
- `asr-config.ts`：ASR 运行态配置，使用 `JsonConfigStore<T>` 保存到 Electron `userData/config/asr.json`；`advancedSettingsEnabled` 控制设置页是否显示 provider/path/streaming/cache 高级字段；普通模式隐藏高级字段并默认使用 `chunked-fallback`；`providerPreset` 属于 Unreleased 供应商预设增强，`provider` 表示实际 ASR 引擎类型。
```

- [ ] **Step 2: Add settings page note to `PROJECT_INDEX.md`**

In `PROJECT_INDEX.md` under `### 主进程 main.ts`, after the settings window bullet, add this sentence to the same bullet or as a new bullet:

```md
- **语音输入设置**：默认只显示启用、API Key、模型、语言、自动发送和测试区；“显示高级 ASR 设置”打开后才显示供应商预设、Base URL、Realtime/Transcription Path、流式模式和缓存参数。
```

- [ ] **Step 3: Update `VERSION.md` Unreleased section**

At the top of the `## Unreleased` list in `VERSION.md`, add:

```md
- ASR 设置简化：默认隐藏供应商、Base URL、Realtime/Transcription Path、流式模式和缓存等高级字段；普通模式默认使用 `chunked-fallback`，识别测试前会保存当前有效配置，并对 Realtime WebSocket 连接失败给出可操作提示
```

- [ ] **Step 4: Run final automated verification**

Run:

```bash
npm test
npm run build
git diff --check
git status --short
```

Expected:

- `npm test`: PASS.
- `npm run build`: PASS.
- `git diff --check`: no output.
- `git status --short`: only intentional doc changes before commit.

- [ ] **Step 5: Commit Task 4**

```bash
git status --short
git add PROJECT_INDEX.md VERSION.md
git commit -m "docs: document asr settings simplification"
```

- [ ] **Step 6: Manual verification checklist**

Run:

```bash
npm run dev
```

Manual checks:

1. Press F11 and open `语音输入（ASR）`.
2. Confirm advanced provider/path/streaming/cache fields are hidden by default.
3. Confirm `显示高级 ASR 设置` shows those fields when checked and hides them again when unchecked.
4. In normal mode, fill API Key and model, enable ASR, click `测试语音识别 10 秒` without pressing save first; it should not fail with `Voice input is disabled`.
5. Confirm normal mode test uses saved `streamingMode: chunked-fallback` in debug logs or by re-opening settings.
6. In advanced mode, choose `Realtime`, save, and test against an unsupported endpoint; UI should show the clearer `实时识别连接失败...chunked-fallback 后重试` message.
7. Confirm no `src/config/asr.json` appears in `git status --short`.

If manual verification finds a concrete bug, fix only the bug, rerun `npm test` and `npm run build`, and commit with:

```bash
git add <fixed-files>
git commit -m "fix(voice): stabilize simplified asr settings"
```

---

## Self-Review Checklist

- Spec coverage:
  - Advanced toggle: Task 2.
  - Default hidden advanced fields: Task 2.
  - Normal-mode `chunked-fallback`: Tasks 1 and 2.
  - Save before recognition test: Task 3.
  - Realtime failure copy: Task 3.
  - Documentation updates: Task 4.
- Placeholder scan:
  - No TBD/TODO placeholders remain.
  - Every code-changing step includes exact code or exact replacement text.
- Type consistency:
  - `advancedSettingsEnabled` is added to `ASRConfig`, defaults, normalizer, settings UI, and docs.
  - `getDefaultASRAdvancedFields()` fields match `collectASRConfig()` output names.
  - Test assertions reference exact DOM IDs produced by Task 2.
- Verification:
  - Every implementation task runs `npm test` and `npm run build`.
  - Final task includes `git diff --check` and manual app verification.
