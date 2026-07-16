# FunASR Local ASR Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a FunASR local runtime ASR provider that connects to a user-started local WebSocket service and routes recognized Chinese speech into the existing voice input flow.

**Architecture:** Keep the current `VoiceInputManager` and `ASREngine.stream(...)` boundary. Add a new `funasr-local-runtime` provider, a focused `FunASRLocalEngine`, settings-page preset/validation/help text, and PCM16 routing for settings recognition tests and main chat voice input. Project-Ze remains a client only; FunASR installation, model download, and service startup stay outside the app.

**Tech Stack:** Electron main/preload/settings renderer, TypeScript strict mode, existing `ws` dependency, browser Web Audio PCM16 capture already used for Qwen-ASR, dependency-free `scripts/voice-input-contract.test.js`, existing `npm test` / `npm run build` / `git diff --check`.

## Global Constraints

- Do not modify existing Qwen-ASR and OpenAI-compatible ASR behavior.
- FunASR first version only connects to a user-started local runtime WebSocket service.
- Do not install Docker, Python, FunASR, model files, or runtime dependencies.
- Do not download models.
- Do not start, restart, or daemonize any FunASR service process.
- Default FunASR Base URL is `ws://127.0.0.1:10096`.
- FunASR Base URL must start with `ws://` or `wss://`.
- FunASR provider does not require API Key.
- FunASR provider does not require model.
- FunASR model, VAD, punctuation, 2pass mode, and hotwords are decided by the FunASR runtime server.
- FunASR main chat and settings 10-second recognition test use PCM16 16kHz chunks with MIME `audio/pcm;rate=16000`.
- Continue reusing `VoiceInputManager`, `ASREngine.stream(...)`, existing `voice-input-*` IPC channels, renderer textarea partial/final update, and Enter send path.
- Settings must clearly state that Project-Ze will not automatically install FunASR, download models, or start Docker/Python processes.
- Settings must warn that remote FunASR URLs are advanced usage and may receive microphone audio.
- Required verification: `npm test`, `npm run build`, `git diff --check`, and `node scripts/voice-input-contract.test.js`.

---

## File Structure

- Modify `src/core/asr-config.ts`: add `funasr-local-runtime`, preset `funasr-local`, default URL, provider inference, and normal-mode realtime preservation for FunASR.
- Create `src/core/asr-funasr-local.ts`: focused FunASR WebSocket client helpers, event normalizer, and `FunASRLocalEngine`.
- Modify `src/core/asr-engine.ts`: dispatch `funasr-local-runtime` to `FunASRLocalEngine`.
- Modify `src/main/preload.ts`: expose `window.companion.testASRConnection(config)` for settings-page connection testing.
- Modify `src/main/main.ts`: register `test-asr-connection` IPC and test the selected ASR engine from main process.
- Modify `src/main/settings.html`: add FunASR preset mirror, ASR connection-test button, explicit help text, provider-specific validation, and FunASR PCM recognition branch.
- Modify `src/renderer/renderer.ts`: route `funasr-local-runtime` through the existing PCM16 voice-recorder path while preserving OpenAI `MediaRecorder` fallback.
- Modify `scripts/voice-input-contract.test.js`: add contract tests for config, engine helpers, factory selection, settings source, IPC exposure, and renderer PCM routing.
- Create `docs/funasr-local-asr.md`: user-facing FunASR local setup and troubleshooting doc.
- Modify `PROJECT_INDEX.md`: record FunASR provider and ASR docs location.
- Modify `VERSION.md`: add Unreleased FunASR local ASR entry.

---

## Task 1: Add FunASR config contract and preset

**Files:**
- Modify: `scripts/voice-input-contract.test.js`
- Modify: `src/core/asr-config.ts`

**Interfaces:**
- Produces `ASRProvider = 'openai-compatible' | 'qwen-asr-realtime' | 'funasr-local-runtime'`.
- Produces `ASRProviderPreset = 'openai' | 'aliyun-bailian' | 'qwen-asr' | 'funasr-local' | 'custom-openai-compatible'`.
- Produces `ASR_PROVIDER_PRESETS['funasr-local']` with:
  - `label: 'FunASR 本地识别'`
  - `provider: 'funasr-local-runtime'`
  - `baseUrl: 'ws://127.0.0.1:10096'`
  - `model: ''`
  - `realtimePath: ''`
  - `transcriptionPath: ''`
  - `streamingMode: 'realtime'`
  - `language: 'zh'`
- Produces `inferASRProviderPreset(config)` returning `funasr-local` when `config.provider === 'funasr-local-runtime'`.
- Produces normal-mode defaults that keep `streamingMode: 'realtime'` for `qwen-asr` and `funasr-local`.

- [ ] **Step 1: Add failing contract test for FunASR config**

In `scripts/voice-input-contract.test.js`, inside `testAsrProviderPresetsAndApply()`, add these assertions after the existing Qwen assertions:

```js
  assert.strictEqual(ASR_PROVIDER_PRESETS['funasr-local'].label, 'FunASR 本地识别');
  assert.strictEqual(ASR_PROVIDER_PRESETS['funasr-local'].provider, 'funasr-local-runtime');
  assert.strictEqual(ASR_PROVIDER_PRESETS['funasr-local'].baseUrl, 'ws://127.0.0.1:10096');
  assert.strictEqual(ASR_PROVIDER_PRESETS['funasr-local'].streamingMode, 'realtime');
  assert.strictEqual(ASR_PROVIDER_PRESETS['funasr-local'].language, 'zh');
  assert.strictEqual(ASR_PROVIDER_PRESETS['funasr-local'].model, '');
  assert.match(ASR_PROVIDER_PRESETS['funasr-local'].note, /不会自动安装 FunASR/);
```

Still in `testAsrProviderPresetsAndApply()`, after the OpenAI engine assertion, add:

```js
  const funasrApplied = applyASRProviderPreset(config, 'funasr-local');
  assert.strictEqual(funasrApplied.providerPreset, 'funasr-local');
  assert.strictEqual(funasrApplied.provider, 'funasr-local-runtime');
  assert.strictEqual(funasrApplied.baseUrl, 'ws://127.0.0.1:10096');
  assert.strictEqual(funasrApplied.model, '');
  assert.strictEqual(funasrApplied.streamingMode, 'realtime');
```

Inside `testAsrProviderPresetInferenceAndNormalMode()`, add this block near the Qwen normalization checks:

```js
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
```

- [ ] **Step 2: Run contract test to verify RED**

Run:

```bash
node scripts/voice-input-contract.test.js
```

Expected: FAIL with an assertion or TypeError showing `ASR_PROVIDER_PRESETS['funasr-local']` is missing.

- [ ] **Step 3: Extend ASR provider and preset types**

In `src/core/asr-config.ts`, replace the provider and preset type lines with:

```ts
export type ASRProvider = 'openai-compatible' | 'qwen-asr-realtime' | 'funasr-local-runtime';
export type ASRProviderPreset = 'openai' | 'aliyun-bailian' | 'qwen-asr' | 'funasr-local' | 'custom-openai-compatible';
```

- [ ] **Step 4: Add FunASR provider preset**

In `ASR_PROVIDER_PRESETS`, insert this entry immediately after the `qwen-asr` entry:

```ts
  'funasr-local': {
    id: 'funasr-local',
    label: 'FunASR 本地识别',
    provider: 'funasr-local-runtime',
    baseUrl: 'ws://127.0.0.1:10096',
    model: '',
    realtimePath: '',
    transcriptionPath: '',
    streamingMode: 'realtime',
    language: 'zh',
    note: 'FunASR 本地识别连接用户已启动的本机 runtime WebSocket 服务；Project-Ze 不会自动安装 FunASR、下载模型或启动 Docker/Python 进程。',
  },
```

- [ ] **Step 5: Accept and infer FunASR provider**

In `isASRProvider()`, replace the return expression with:

```ts
  return value === 'openai-compatible'
    || value === 'qwen-asr-realtime'
    || value === 'funasr-local-runtime';
```

In `inferASRProviderPreset()`, add this line after the Qwen line:

```ts
  if (config.provider === 'funasr-local-runtime') return 'funasr-local';
```

- [ ] **Step 6: Preserve realtime in normal mode for FunASR**

In `applyNormalModeAdvancedDefaults()`, replace the `streamingMode` assignment with:

```ts
    streamingMode: providerPreset === 'qwen-asr' || providerPreset === 'funasr-local'
      ? preset.streamingMode
      : DEFAULT_ASR_CONFIG.streamingMode,
```

- [ ] **Step 7: Run verification for Task 1**

Run:

```bash
node scripts/voice-input-contract.test.js
npm run build
```

Expected: contract test may still fail only if later tests load missing FunASR engine tests from subsequent tasks. Build should pass for config-only changes.

- [ ] **Step 8: Commit Task 1**

```bash
git add scripts/voice-input-contract.test.js src/core/asr-config.ts
git commit -m "feat(voice): add funasr asr config preset"
```

---

## Task 2: Add FunASR engine helper contract and pure helpers

**Files:**
- Modify: `scripts/voice-input-contract.test.js`
- Create: `src/core/asr-funasr-local.ts`

**Interfaces:**
- Produces `createFunASRLocalUrl(config: ASRConfig): string`.
- Produces `createFunASRStartEvent(config: ASRConfig): { mode: '2pass'; chunk_size: number[]; chunk_interval: number; wav_name: string; is_speaking: true; hotwords: string; itn: true }`.
- Produces `createFunASREndEvent(): { is_speaking: false }`.
- Produces `normalizeFunASREvent(raw: unknown, sessionId: string): ASRTranscriptEvent | null`.
- Produces `FunASRLocalEngine` skeleton with `readonly provider = 'funasr-local-runtime'` and `supportsStreaming(): true`.

- [ ] **Step 1: Add failing helper tests**

In `scripts/voice-input-contract.test.js`, add this function after the Qwen helper tests:

```js
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
```

Call it in the runner section:

```js
testFunASRLocalEngineHelpers();
```

- [ ] **Step 2: Run build and test to verify RED**

Run:

```bash
npm run build
node scripts/voice-input-contract.test.js
```

Expected: FAIL because `dist/core/asr-funasr-local.js` does not exist.

- [ ] **Step 3: Create FunASR helper file**

Create `src/core/asr-funasr-local.ts` with this initial content:

```ts
import WebSocket from 'ws';
import { ASRConfig } from './asr-config';
import { ASREngine, ASRStreamInput, ASRTranscriptEvent } from './asr-engine';

const FUNASR_POLL_INTERVAL_MS = 20;
const FUNASR_FINAL_GRACE_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStringField(data: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const value = data[name];
    if (typeof value === 'string') return value;
  }
  return '';
}

function isFinalMode(mode: string): boolean {
  return mode === '2pass-offline' || mode === 'offline' || mode === 'final';
}

export function createFunASRLocalUrl(config: ASRConfig): string {
  const baseUrl = config.baseUrl.trim();
  if (!baseUrl) {
    throw new Error('FunASR Base URL 不能为空');
  }
  if (!baseUrl.startsWith('ws://') && !baseUrl.startsWith('wss://')) {
    throw new Error('FunASR Base URL 必须以 ws:// 或 wss:// 开头');
  }
  return new URL(baseUrl).toString();
}

export function createFunASRStartEvent(_config: ASRConfig): {
  mode: '2pass';
  chunk_size: number[];
  chunk_interval: number;
  wav_name: string;
  is_speaking: true;
  hotwords: string;
  itn: true;
} {
  return {
    mode: '2pass',
    chunk_size: [5, 10, 5],
    chunk_interval: 10,
    wav_name: 'project-ze',
    is_speaking: true,
    hotwords: '',
    itn: true,
  };
}

export function createFunASREndEvent(): { is_speaking: false } {
  return { is_speaking: false };
}

export function normalizeFunASREvent(raw: unknown, sessionId: string): ASRTranscriptEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const message = getStringField(data, ['error', 'message']);
  if (message) {
    return { type: 'error', message, sessionId, recoverable: false };
  }

  const text = getStringField(data, ['text', 'sentence', 'result']).trim();
  if (!text) return null;

  const mode = getStringField(data, ['mode', 'type']);
  const isFinal = data.is_final === true || data.final === true || isFinalMode(mode);
  return isFinal
    ? { type: 'final', text, sessionId }
    : { type: 'partial', text, sessionId };
}

function isTerminalEvent(event: ASRTranscriptEvent): boolean {
  return event.type === 'final' || event.type === 'error';
}

async function* drainFunASREvents(
  pending: ASRTranscriptEvent[],
  isClosed: () => boolean,
  timeoutMs: number = FUNASR_FINAL_GRACE_MS,
): AsyncIterable<ASRTranscriptEvent> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline || pending.length > 0) {
    while (pending.length > 0) {
      const event = pending.shift()!;
      yield event;
      if (isTerminalEvent(event)) return;
    }
    if (isClosed()) return;
    await sleep(FUNASR_POLL_INTERVAL_MS);
  }
}

export class FunASRLocalEngine implements ASREngine {
  readonly provider = 'funasr-local-runtime';

  supportsStreaming(_config: ASRConfig): boolean {
    return true;
  }

  async *stream(_input: ASRStreamInput): AsyncIterable<ASRTranscriptEvent> {
    throw new Error('FunASRLocalEngine.stream is wired in Task 3');
  }
}

export const __funasrTestInternals = {
  drainFunASREvents,
  isTerminalEvent,
  WebSocket,
};
```

- [ ] **Step 4: Run verification for Task 2**

Run:

```bash
npm run build
node scripts/voice-input-contract.test.js
```

Expected: PASS for helper tests. Later factory tests are not added yet.

- [ ] **Step 5: Commit Task 2**

```bash
git add scripts/voice-input-contract.test.js src/core/asr-funasr-local.ts
git commit -m "feat(voice): add funasr local engine helpers"
```

---

## Task 3: Wire FunASR engine factory and streaming implementation

**Files:**
- Modify: `scripts/voice-input-contract.test.js`
- Modify: `src/core/asr-engine.ts`
- Modify: `src/core/asr-funasr-local.ts`

**Interfaces:**
- Consumes helpers from Task 2.
- Produces `createASREngine(config).provider === 'funasr-local-runtime'` for FunASR configs.
- Produces `FunASRLocalEngine.stream(input)` that:
  - validates URL;
  - opens a WebSocket;
  - sends `createFunASRStartEvent(config)` on open;
  - sends each PCM chunk as binary Buffer decoded from `chunk.base64`;
  - sends `createFunASREndEvent()` after input chunks end;
  - yields normalized partial/final/error events;
  - closes the socket after terminal event, timeout, disconnect, or abort.

- [ ] **Step 1: Add failing factory contract test**

In `scripts/voice-input-contract.test.js`, inside `testAsrProviderPresetsAndApply()`, after the existing OpenAI engine assertion and after `funasrApplied` from Task 1, add:

```js
  const funasrEngine = createASREngine(funasrApplied);
  assert.strictEqual(funasrEngine.provider, 'funasr-local-runtime');
  assert.strictEqual(funasrEngine.supportsStreaming(funasrApplied), true);
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
npm run build
node scripts/voice-input-contract.test.js
```

Expected: FAIL with `Unsupported ASR provider: funasr-local-runtime`.

- [ ] **Step 3: Wire engine factory**

In `src/core/asr-engine.ts`, add import:

```ts
import { FunASRLocalEngine } from './asr-funasr-local';
```

Update `createASREngine(config)` by adding this branch after Qwen:

```ts
  if (config.provider === 'funasr-local-runtime') {
    return new FunASRLocalEngine();
  }
```

- [ ] **Step 4: Replace FunASR stream skeleton with implementation**

In `src/core/asr-funasr-local.ts`, replace the `stream()` method with:

```ts
  async *stream(input: ASRStreamInput): AsyncIterable<ASRTranscriptEvent> {
    let url: string;
    try {
      url = createFunASRLocalUrl(input.config);
    } catch (error) {
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'FunASR Base URL 无效',
        sessionId: input.sessionId,
        recoverable: false,
      };
      return;
    }

    const pending: ASRTranscriptEvent[] = [];
    let opened = false;
    let closed = false;
    const socket = new WebSocket(url);

    socket.on('open', () => {
      opened = true;
      socket.send(JSON.stringify(createFunASRStartEvent(input.config)));
    });
    socket.on('message', (data) => {
      try {
        const normalized = normalizeFunASREvent(JSON.parse(data.toString()), input.sessionId);
        if (normalized) pending.push(normalized);
      } catch {
        pending.push({
          type: 'error',
          message: 'Invalid FunASR event payload',
          sessionId: input.sessionId,
          recoverable: true,
        });
      }
    });
    socket.on('close', () => { closed = true; });
    socket.on('error', (error) => {
      pending.push({
        type: 'error',
        message: error.message || 'FunASR 本地服务连接失败：请确认 FunASR runtime 已启动，端口与 Base URL 一致，并且 WebSocket 服务可访问。',
        sessionId: input.sessionId,
        recoverable: false,
      });
      closed = true;
    });

    while (!opened && !closed && !input.signal?.aborted) {
      await sleep(FUNASR_POLL_INTERVAL_MS);
    }

    if (!opened) {
      while (pending.length > 0) yield pending.shift()!;
      if (!input.signal?.aborted) {
        yield {
          type: 'error',
          message: 'FunASR 本地服务连接失败：请确认 FunASR runtime 已启动，端口与 Base URL 一致，并且 WebSocket 服务可访问。',
          sessionId: input.sessionId,
          recoverable: false,
        };
      }
      return;
    }

    for await (const chunk of input.chunks) {
      if (input.signal?.aborted || closed) break;
      socket.send(Buffer.from(chunk.base64, 'base64'));
      while (pending.length > 0) yield pending.shift()!;
    }

    let terminalReceived = false;
    if (!closed && !input.signal?.aborted) {
      socket.send(JSON.stringify(createFunASREndEvent()));
      for await (const event of drainFunASREvents(pending, () => closed || Boolean(input.signal?.aborted))) {
        terminalReceived = terminalReceived || isTerminalEvent(event);
        yield event;
      }
      if (!closed) socket.close();
    }

    while (pending.length > 0) {
      const event = pending.shift()!;
      terminalReceived = terminalReceived || isTerminalEvent(event);
      yield event;
    }

    if (!terminalReceived && !input.signal?.aborted) {
      yield {
        type: 'error',
        message: 'FunASR 未返回识别文本，请确认服务模式、音频格式和模型配置',
        sessionId: input.sessionId,
        recoverable: false,
      };
    }
  }
```

- [ ] **Step 5: Run verification for Task 3**

Run:

```bash
npm run build
node scripts/voice-input-contract.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add scripts/voice-input-contract.test.js src/core/asr-engine.ts src/core/asr-funasr-local.ts
git commit -m "feat(voice): wire funasr local engine"
```

---

## Task 4: Add ASR connection-test IPC

**Files:**
- Modify: `scripts/voice-input-contract.test.js`
- Modify: `src/main/preload.ts`
- Modify: `src/main/main.ts`
- Modify: `src/core/asr-funasr-local.ts`

**Interfaces:**
- Produces `window.companion.testASRConnection(config): Promise<{ success: boolean; message: string }>`.
- Produces IPC channel `test-asr-connection`.
- Produces `testFunASRLocalConnection(config: ASRConfig): Promise<{ success: boolean; message: string }>` in `src/core/asr-funasr-local.ts`.

- [ ] **Step 1: Add failing IPC contract test**

In `scripts/voice-input-contract.test.js`, add this function near other source-string tests:

```js
function testASRConnectionTestIPCContract() {
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'preload.ts'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.ts'), 'utf8');
  assert.match(preload, /testASRConnection: \(config: any\): Promise<any> =>/);
  assert.match(preload, /ipcRenderer\.invoke\('test-asr-connection', config\)/);
  assert.match(main, /ipcMain\.handle\('test-asr-connection'/);
  assert.match(main, /testFunASRLocalConnection/);
}
```

Call it in the runner:

```js
testASRConnectionTestIPCContract();
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node scripts/voice-input-contract.test.js
```

Expected: FAIL because `testASRConnection` IPC is missing.

- [ ] **Step 3: Add preload bridge method**

In `src/main/preload.ts`, add this method next to `saveASRConfig`:

```ts
  testASRConnection: (config: any): Promise<any> => {
    return ipcRenderer.invoke('test-asr-connection', config);
  },
```

- [ ] **Step 4: Add FunASR connection helper**

In `src/core/asr-funasr-local.ts`, add this function before the class:

```ts
export async function testFunASRLocalConnection(config: ASRConfig): Promise<{ success: boolean; message: string }> {
  return await new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket;
    try {
      socket = new WebSocket(createFunASRLocalUrl(config));
    } catch (error) {
      resolve({
        success: false,
        message: error instanceof Error ? error.message : 'FunASR Base URL 无效',
      });
      return;
    }

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.close();
      resolve({
        success: false,
        message: 'FunASR 本地服务连接失败：请确认 FunASR runtime 已启动，端口与 Base URL 一致，并且 WebSocket 服务可访问。',
      });
    }, 3_000);

    socket.on('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.close();
      resolve({ success: true, message: 'FunASR 本地服务连接成功' });
    });

    socket.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        success: false,
        message: error.message || 'FunASR 本地服务连接失败：请确认 FunASR runtime 已启动，端口与 Base URL 一致，并且 WebSocket 服务可访问。',
      });
    });
  });
}
```

- [ ] **Step 5: Register main-process IPC**

In `src/main/main.ts`, add import:

```ts
import { testFunASRLocalConnection } from '../core/asr-funasr-local';
```

Add this handler after `save-asr-config` and before `voice-input-start`:

```ts
  ipcMain.handle('test-asr-connection', async (_event, config: any) => {
    const current = asrConfigManager.get();
    const merged = { ...current, ...config };
    if (merged.provider === 'funasr-local-runtime') {
      return await testFunASRLocalConnection(merged);
    }
    return {
      success: false,
      message: '当前 ASR provider 暂不支持独立连接测试，请使用“测试语音识别 10 秒”。',
    };
  });
```

- [ ] **Step 6: Run verification for Task 4**

Run:

```bash
npm run build
node scripts/voice-input-contract.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add scripts/voice-input-contract.test.js src/main/preload.ts src/main/main.ts src/core/asr-funasr-local.ts
git commit -m "feat(voice): add asr connection test ipc"
```

---

## Task 5: Add FunASR settings preset, validation, and help text

**Files:**
- Modify: `scripts/voice-input-contract.test.js`
- Modify: `src/main/settings.html`

**Interfaces:**
- Consumes `window.companion.testASRConnection(config)` from Task 4.
- Produces settings option `<option value="funasr-local">FunASR 本地识别</option>`.
- Produces settings `asrProviderPresets['funasr-local']` mirror.
- Produces `isFunASRConfig(config): boolean`.
- Produces validation matrix:
  - OpenAI-compatible: requires Base URL, API Key, model.
  - Qwen-ASR: requires Base URL, Workspace ID, API Key, model.
  - FunASR: requires Base URL only, with `ws://` or `wss://`.
- Produces ASR-specific connection-test button `asrConnectionTestBtn`.

- [ ] **Step 1: Add failing settings contract test**

In `scripts/voice-input-contract.test.js`, add this function near the settings HTML tests:

```js
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
```

Call it in the runner:

```js
testSettingsFunASRLocalProviderContract();
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node scripts/voice-input-contract.test.js
```

Expected: FAIL because settings has no FunASR option or help text.

- [ ] **Step 3: Add FunASR option and ASR connection-test button**

In `src/main/settings.html`, add this option after Qwen:

```html
<option value="funasr-local">FunASR 本地识别</option>
```

In the ASR test button row around `asrMicTestBtn` and `asrRecognitionTestBtn`, change it to:

```html
<div class="btn-row">
  <button class="btn btn-secondary" id="asrMicTestBtn">测试麦克风音量</button>
  <button class="btn btn-secondary" id="asrConnectionTestBtn">测试 ASR 连接</button>
  <button class="btn btn-primary" id="asrRecognitionTestBtn">测试语音识别 10 秒</button>
</div>
```

- [ ] **Step 4: Add FunASR preset mirror**

In the `var asrProviderPresets = { ... }` object, add this entry after `qwen-asr`:

```js
      'funasr-local': {
        label: 'FunASR 本地识别',
        provider: 'funasr-local-runtime',
        baseUrl: 'ws://127.0.0.1:10096',
        model: '',
        realtimePath: '',
        transcriptionPath: '',
        streamingMode: 'realtime',
        language: 'zh',
        note: 'FunASR 本地识别不会调用云端 API，但需要你先在本机启动 FunASR runtime WebSocket 服务。Project-Ze 第一版只负责连接该服务，不会自动安装 FunASR、下载模型或启动 Docker/Python 进程。远程 FunASR 地址是高级用法，可能接收麦克风音频。',
      },
```

- [ ] **Step 5: Add FunASR helper functions**

Near `isQwenASRRecognitionConfig(config)`, add:

```js
    function isFunASRConfig(config) {
      return config && config.provider === 'funasr-local-runtime';
    }

    function isLocalRealtimePCMRecognitionConfig(config) {
      return isQwenASRRecognitionConfig(config) || isFunASRConfig(config);
    }

    function validateFunASRBaseUrl(config) {
      if (!isFunASRConfig(config)) return '';
      if (!config.baseUrl) return 'FunASR Base URL 不能为空';
      if (!config.baseUrl.startsWith('ws://') && !config.baseUrl.startsWith('wss://')) {
        return 'FunASR Base URL 必须以 ws:// 或 wss:// 开头';
      }
      if (!config.baseUrl.includes('127.0.0.1') && !config.baseUrl.includes('localhost')) {
        return '远程 FunASR 地址是高级用法，可能接收麦克风音频；请确认服务授权和网络安全。';
      }
      return '';
    }
```

- [ ] **Step 6: Update field validation**

In `getMissingASREnabledFields(config)`, replace the body with:

```js
      const missing = [];
      if (!config.baseUrl) missing.push('Base URL');
      if (config.provider === 'qwen-asr-realtime' && !config.workspaceId) missing.push('Workspace ID');
      if (config.provider !== 'funasr-local-runtime' && !config.apiKey) missing.push('API Key');
      if (config.provider !== 'funasr-local-runtime' && !config.model) missing.push('模型');
      return missing;
```

In `validateASRRecognitionTestConfig(config)`, after the Qwen mismatch check and before missing field handling, add:

```js
      const funasrUrlWarning = validateFunASRBaseUrl(config);
      if (funasrUrlWarning) {
        const isRemoteWarning = funasrUrlWarning.indexOf('远程 FunASR 地址') >= 0;
        setASRValidationMessage(funasrUrlWarning, isRemoteWarning ? 'warning' : 'error');
        showToast(funasrUrlWarning, isRemoteWarning ? 'warning' : 'error');
        if (!isRemoteWarning) return false;
      }
```

- [ ] **Step 7: Add ASR connection-test click handler**

Near the `asrRecognitionTestBtn` event listener, add:

```js
    document.getElementById('asrConnectionTestBtn').addEventListener('click', async function() {
      const btn = this;
      const config = collectASRConfig();
      const missing = getMissingASREnabledFields(config);
      if (missing.length > 0) {
        const message = 'ASR 连接测试缺少 ' + missing.join(' / ');
        setASRValidationMessage(message);
        showToast(message, 'error');
        return;
      }
      const funasrUrlWarning = validateFunASRBaseUrl(config);
      if (funasrUrlWarning && funasrUrlWarning.indexOf('远程 FunASR 地址') < 0) {
        setASRValidationMessage(funasrUrlWarning);
        showToast(funasrUrlWarning, 'error');
        return;
      }
      if (!window.companion || !window.companion.testASRConnection) {
        showToast('当前环境不支持 ASR 连接测试', 'error');
        return;
      }
      btn.disabled = true;
      btn.textContent = '测试中...';
      try {
        const result = await window.companion.testASRConnection(config);
        showToast(result.message || (result.success ? 'ASR 连接成功' : 'ASR 连接失败'), result.success ? 'success' : 'error');
      } catch (error) {
        showToast(error && error.message ? error.message : 'ASR 连接测试失败', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '测试 ASR 连接';
      }
    });
```

- [ ] **Step 8: Show explicit FunASR help text**

Add this HTML block below the ASR provider preset field:

```html
<div class="hint" id="funasrLocalHint" style="display: none; margin-top: 8px;">
  FunASR 本地识别不会调用云端 API，但需要你先在本机启动 FunASR runtime WebSocket 服务。默认连接地址：ws://127.0.0.1:10096。Project-Ze 第一版只负责连接该服务，不会自动安装 FunASR、下载模型或启动 Docker/Python 进程。请先按 FunASR 文档启动 runtime 服务，然后点击“测试 ASR 连接”或“测试语音识别 10 秒”。远程 FunASR 地址是高级用法，可能接收麦克风音频。
</div>
```

In `applySelectedASRPreset()`, after setting provider/base/model fields, add:

```js
      const funasrHint = document.getElementById('funasrLocalHint');
      if (funasrHint) funasrHint.style.display = preset.provider === 'funasr-local-runtime' ? 'block' : 'none';
```

- [ ] **Step 9: Run verification for Task 5**

Run:

```bash
node scripts/voice-input-contract.test.js
npm run build
```

Expected: PASS.

- [ ] **Step 10: Commit Task 5**

```bash
git add scripts/voice-input-contract.test.js src/main/settings.html
git commit -m "feat(settings): add funasr local asr preset"
```

---

## Task 6: Route settings 10-second recognition test through PCM for FunASR

**Files:**
- Modify: `scripts/voice-input-contract.test.js`
- Modify: `src/main/settings.html`

**Interfaces:**
- Consumes `isLocalRealtimePCMRecognitionConfig(config)` from Task 5.
- Produces settings recognition test branch that sends `audio/pcm;rate=16000` for Qwen and FunASR.
- Preserves existing `MediaRecorder` webm/opus path for OpenAI-compatible providers.

- [ ] **Step 1: Add failing settings PCM contract test**

In `scripts/voice-input-contract.test.js`, add this function near Qwen recognition tests:

```js
function testSettingsFunASRRecognitionTestUsesPCM() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'settings.html'), 'utf8');
  assert.match(html, /function isLocalRealtimePCMRecognitionConfig\(config\)/);
  assert.match(html, /isQwenASRRecognitionConfig\(config\) \|\| isFunASRConfig\(config\)/);
  assert.match(html, /if \(isLocalRealtimePCMRecognitionConfig\(config\)\)/);
  assert.match(html, /audio\/pcm;rate=16000/);
  assert.match(html, /MediaRecorder\.isTypeSupported\('audio\/webm;codecs=opus'\)/);
}
```

Call it in the runner:

```js
testSettingsFunASRRecognitionTestUsesPCM();
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node scripts/voice-input-contract.test.js
```

Expected: FAIL because recognition test still branches only on Qwen.

- [ ] **Step 3: Rename recognition test helper call without renaming the function**

In `startASRRecognitionTest()`, replace:

```js
        if (isQwenASRRecognitionConfig(config)) {
```

with:

```js
        if (isLocalRealtimePCMRecognitionConfig(config)) {
```

Keep the existing `startQwenPCMRecognitionTest(...)` function name for this task to minimize churn. It already sends `audio/pcm;rate=16000` and can be reused by FunASR.

- [ ] **Step 4: Run verification for Task 6**

Run:

```bash
node scripts/voice-input-contract.test.js
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add scripts/voice-input-contract.test.js src/main/settings.html
git commit -m "feat(settings): test funasr recognition with pcm"
```

---

## Task 7: Route main chat FunASR voice input through PCM

**Files:**
- Modify: `scripts/voice-input-contract.test.js`
- Modify: `src/renderer/renderer.ts`

**Interfaces:**
- Produces `isLocalRealtimePCMVoiceConfig(config): boolean`.
- Reuses existing `createQwenPCMVoiceRecorder(stream, sessionId)` for both Qwen and FunASR without renaming it in this task.
- Preserves `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')` fallback for OpenAI-compatible providers.

- [ ] **Step 1: Add failing renderer PCM contract test**

In `scripts/voice-input-contract.test.js`, add this function near existing renderer voice tests:

```js
function testRendererFunASRMainVoiceUsesPCM() {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.ts'), 'utf8');
  assert.match(renderer, /function isLocalRealtimePCMVoiceConfig\(config: any\): boolean/);
  assert.match(renderer, /isQwenASRVoiceConfig\(config\) \|\| config\.provider === 'funasr-local-runtime'/);
  assert.match(renderer, /var localRealtimePCMVoiceInput = isLocalRealtimePCMVoiceConfig\(config\)/);
  assert.match(renderer, /if \(isLocalRealtimePCMVoiceConfig\(config\)\)/);
  assert.match(renderer, /mimeType: 'audio\/pcm;rate=16000'/);
  assert.match(renderer, /MediaRecorder\.isTypeSupported\('audio\/webm;codecs=opus'\)/);
}
```

Call it in the runner:

```js
testRendererFunASRMainVoiceUsesPCM();
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node scripts/voice-input-contract.test.js
```

Expected: FAIL because renderer only checks `isQwenASRVoiceConfig(config)`.

- [ ] **Step 3: Add local realtime PCM helper**

In `src/renderer/renderer.ts`, immediately after `isQwenASRVoiceConfig(config)`, add:

```ts
  function isLocalRealtimePCMVoiceConfig(config: any): boolean {
    return isQwenASRVoiceConfig(config) || config.provider === 'funasr-local-runtime';
  }
```

- [ ] **Step 4: Use helper in `startVoiceInput()`**

In `startVoiceInput()`, replace:

```ts
      var qwenVoiceInput = isQwenASRVoiceConfig(config);
      startupIsQwen = qwenVoiceInput;
      var mimeType = qwenVoiceInput
```

with:

```ts
      var localRealtimePCMVoiceInput = isLocalRealtimePCMVoiceConfig(config);
      startupIsQwen = isQwenASRVoiceConfig(config);
      var mimeType = localRealtimePCMVoiceInput
```

Replace the recorder branch:

```ts
      if (isQwenASRVoiceConfig(config)) {
```

with:

```ts
      if (isLocalRealtimePCMVoiceConfig(config)) {
```

Do not change `MediaRecorder` code below this branch.

- [ ] **Step 5: Run verification for Task 7**

Run:

```bash
node scripts/voice-input-contract.test.js
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add scripts/voice-input-contract.test.js src/renderer/renderer.ts
git commit -m "feat(voice): route funasr main input through pcm"
```

---

## Task 8: Add FunASR user docs and project index updates

**Files:**
- Create: `docs/funasr-local-asr.md`
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`
- Optional Modify: `docs/qwen-asr-configuration.md`

**Interfaces:**
- Produces a user-facing FunASR setup/troubleshooting doc.
- Documents that Project-Ze does not install, download, or start FunASR.
- Documents default URL `ws://127.0.0.1:10096`.
- Documents no API Key/model requirement.
- Documents PCM16 16kHz and common failures.

- [ ] **Step 1: Write FunASR local ASR doc**

Create `docs/funasr-local-asr.md` with:

```markdown
# FunASR 本地语音识别配置说明

日期：2026-07-16

本文说明 Project-Ze 如何连接用户已启动的 FunASR runtime WebSocket 服务。

## 边界

Project-Ze 第一版只负责连接 FunASR runtime，不会自动安装 FunASR、下载模型或启动 Docker/Python 进程。

FunASR 的模型、VAD、标点、2pass 模式和热词由 FunASR runtime 服务端配置。Project-Ze 只发送麦克风音频并接收识别文本。

## 设置页填写方式

F11 打开设置页，进入“语音输入（ASR）”：

1. 勾选“启用语音输入”。
2. 供应商预设选择“FunASR 本地识别”。
3. Base URL 使用默认值：`ws://127.0.0.1:10096`。
4. API Key 不需要填写。
5. 模型不需要填写；模型由 FunASR runtime 服务端决定。
6. 点击“测试 ASR 连接”。
7. 点击“测试语音识别 10 秒”。
8. 返回主窗口后，使用麦克风按钮或 `Ctrl+Shift+Space` 长按说话。

## 音频格式

Project-Ze 对 FunASR 发送 PCM16 little-endian、16kHz 音频 chunk，MIME 为 `audio/pcm;rate=16000`。

## 常见问题

### FunASR 本地服务连接失败

请确认：

- FunASR runtime WebSocket 服务已经启动。
- 服务端口与 Base URL 一致，默认是 `10096`。
- Docker 已映射端口。
- 启动的是 online/2pass WebSocket 实时服务，而不是只处理文件的 offline 转写服务。
- Windows 防火墙没有拦截本机连接。

### FunASR 未返回识别文本

请确认：

- 麦克风输入有声音。
- FunASR runtime 接收 PCM16 16kHz 音频。
- 服务端模型已加载完成。
- 服务端模式会返回实时或最终文本。

### 使用远程 FunASR URL

远程 FunASR 地址是高级用法。远程服务可能接收麦克风音频，请自行确认服务授权、网络安全和隐私边界。
```

- [ ] **Step 2: Update `PROJECT_INDEX.md`**

In the `core 模块速查` ASR line, append FunASR information so the line reads:

```markdown
- `asr-engine.ts` / `asr-openai-compatible.ts` / `asr-qwen-realtime.ts` / `asr-funasr-local.ts`：ASR 引擎接口与 provider 实现，主流程只依赖 `ASREngine.stream(...)`；OpenAI、阿里百炼 / DashScope、自定义 OpenAI-compatible 预设复用 OpenAI-compatible 引擎，Qwen-ASR 实时识别使用专用 WebSocket 引擎和 `Authorization` 握手请求头；FunASR 本地识别连接用户已启动的本机 runtime WebSocket 服务，默认 `ws://127.0.0.1:10096`，不要求 API Key/模型，也不自动安装、下载模型或启动服务；配置方式见 `docs/qwen-asr-configuration.md` 和 `docs/funasr-local-asr.md`，当前 Qwen/FunASR 实时路径都会发送 PCM16 16kHz 音频。
```

- [ ] **Step 3: Update `VERSION.md`**

Under `## Unreleased`, add this bullet near existing ASR bullets:

```markdown
- ASR FunASR 本地识别：新增 `funasr-local-runtime` provider，默认连接 `ws://127.0.0.1:10096` 的用户自启动 FunASR runtime WebSocket 服务；设置页明确说明 Project-Ze 不自动安装 FunASR、下载模型或启动 Docker/Python 进程，FunASR 不要求 API Key/模型，并复用 PCM16 16kHz 语音输入路径。
```

- [ ] **Step 4: Add optional cross-link in Qwen doc**

At the end of `docs/qwen-asr-configuration.md`, add:

```markdown
## 相关本地 ASR 方案

如果你希望使用本机 FunASR runtime，而不是阿里云 Qwen-ASR WebSocket 服务，请查看 `docs/funasr-local-asr.md`。FunASR 本地识别不要求 API Key 或模型字段，但需要你先手动启动 FunASR runtime 服务。
```

- [ ] **Step 5: Run docs verification**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 6: Commit Task 8**

```bash
git add docs/funasr-local-asr.md PROJECT_INDEX.md VERSION.md docs/qwen-asr-configuration.md
git commit -m "docs: document funasr local asr"
```

---

## Task 9: Final verification and handoff report

**Files:**
- No planned source changes.
- Read verification output only.

**Interfaces:**
- Produces final verification status for the user.
- Records whether manual FunASR runtime verification was executed.

- [ ] **Step 1: Run full automated tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Run direct contract test**

Run:

```bash
node scripts/voice-input-contract.test.js
```

Expected: PASS.

- [ ] **Step 4: Run diff check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Check git status**

Run:

```bash
git status --short
```

Expected: clean except for pre-existing unrelated `.superpowers/sdd/progress.md` if it remains modified from before FunASR work.

- [ ] **Step 6: Prepare user report**

Report in Chinese:

```markdown
已完成 FunASR 本地 ASR provider 实现。

自动验证：
- npm test: PASS
- npm run build: PASS
- node scripts/voice-input-contract.test.js: PASS
- git diff --check: PASS

手动验证：
- 如果本机已启动 FunASR runtime：说明设置页“测试 ASR 连接”和“测试语音识别 10 秒”的结果。
- 如果未启动 FunASR runtime：说明未执行真实识别，只完成自动合同/构建验证。

边界：Project-Ze 不会自动安装 FunASR、下载模型或启动 Docker/Python 进程；需要用户先启动 FunASR runtime 服务。
```

- [ ] **Step 7: Commit verification note only if files changed**

If verification required fixing files, commit those fixes with a focused message. If no files changed, do not create an empty commit.

---

## Plan Self-Review

- Spec coverage: provider/config covered by Task 1; engine helpers and stream covered by Tasks 2-3; settings text/validation/connection test covered by Tasks 4-6; main chat PCM route covered by Task 7; docs and changelog covered by Task 8; final verification covered by Task 9.
- Placeholder scan: no TBD, TODO, or unspecified implementation steps remain. Each code-changing step includes concrete code or exact edit instructions.
- Type consistency: provider is consistently `funasr-local-runtime`; preset is consistently `funasr-local`; default URL is consistently `ws://127.0.0.1:10096`; MIME is consistently `audio/pcm;rate=16000`.
- Boundary check: no task installs, downloads, starts, restarts, or bundles FunASR runtime or models.
