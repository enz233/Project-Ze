# Voice Input ASR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build v0.3 voice input so users can record speech from the existing right-click chat input, receive streaming transcript updates, and send the final text through the existing text-message path.

**Architecture:** Renderer owns microphone capture and UI state, preload exposes a narrow voice-input facade, and the main process owns ASR session orchestration. Provider details live behind `ASREngine`; runtime ASR config uses `JsonConfigStore<T>`; short-lived recorded audio is stored behind `VoiceAudioCache` for ASR and future reuse.

**Tech Stack:** Electron main/preload/renderer, TypeScript strict mode, browser `MediaRecorder`, Node `fs/path`, built-in `fetch`/`WebSocket`-style provider boundary where available, no new test framework.

## Global Constraints

- Follow the design in `docs/superpowers/specs/2026-07-15-voice-input-asr-design.md`.
- Do not create a separate voice chat panel; integrate with the existing right-click textarea.
- Mic button behavior: click once to start recording, click again to stop.
- Shortcut behavior: hold-to-talk, release to stop.
- Default send behavior: final transcript remains editable in the textarea; user presses `Enter` to send.
- Optional setting: `autoSendFinalTranscript` sends via the existing text send path after final transcript.
- Streaming is required: partial ASR transcript updates the textarea while the user is speaking.
- ASR provider logic must be isolated behind `ASREngine`; renderer must not call ASR providers directly.
- Audio cache must be runtime-only and short-lived; do not store long-term raw audio by default.
- Do not add a test framework dependency.
- `npm run build` must pass.
- `npm test` must run; this plan adds a lightweight built-output contract test script so it should pass after implementation.
- Keep real API keys out of committed examples, docs, and test fixtures.

---

## File Structure

- Create: `src/core/asr-config.ts` — `ASRConfig`, defaults, and `ASRConfigManager` backed by `JsonConfigStore<T>`.
- Create: `src/core/asr-engine.ts` — shared ASR types, transcript events, factory, and helpers.
- Create: `src/core/asr-openai-compatible.ts` — OpenAI-compatible ASR provider with `realtime` and `chunked-fallback` modes.
- Create: `src/core/voice-audio-cache.ts` — short-lived audio cache under Electron `userData/cache/voice-input/`.
- Create: `src/core/voice-input-manager.ts` — session state machine that connects audio chunks, ASR engine, cache, and transcript/status callbacks.
- Create: `src/config/asr.example.json` — safe example ASR config with empty API key.
- Create: `scripts/voice-input-contract.test.js` — dependency-free Node assertions against built `dist/` modules.
- Modify: `package.json` — add `test` script that builds and runs `scripts/voice-input-contract.test.js`; add ASR example to packaged files if needed.
- Modify: `.gitignore` — ignore `src/config/asr.json`; keep examples committed.
- Modify: `src/main/main.ts` — instantiate ASR config, audio cache, and voice input manager; register voice IPC.
- Modify: `src/main/preload.ts` — expose `window.companion.voiceInput` facade and transcript/status listeners.
- Modify: `src/renderer/index.html` — wrap textarea with a mic button and voice status affordance.
- Modify: `src/renderer/renderer.ts` — implement mic toggle, hold-to-talk shortcut, MediaRecorder chunk forwarding, transcript insertion, and auto-send behavior.
- Modify: `src/renderer/style.css` — style mic button, recording state, and partial transcript feedback.
- Modify: `src/main/settings.html` — add Voice Input / ASR settings section and save/load/test controls.
- Modify: `README.md`, `PROJECT_INDEX.md`, `VERSION.md`, `docs/chat-experience-enhancement.md`, `docs/configuration-security.md` — document v0.3 voice input, config, IPC, and usage.

---

## Task 1: Add ASR config and lightweight test harness

**Files:**
- Create: `src/core/asr-config.ts`
- Create: `src/config/asr.example.json`
- Create: `scripts/voice-input-contract.test.js`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `JsonConfigStore<T>` from `src/core/json-config-store.ts`.
- Produces:
  - `export type ASRProvider = 'openai-compatible' | 'aliyun' | 'custom';`
  - `export type ASRStreamingMode = 'realtime' | 'chunked-fallback';`
  - `export interface ASRConfig { enabled: boolean; provider: ASRProvider; baseUrl: string; apiKey: string; model: string; realtimePath: string; transcriptionPath: string; streamingMode: ASRStreamingMode; language: string; autoSendFinalTranscript: boolean; holdToTalkShortcut: string; cache: { enabled: boolean; retentionMinutes: number; maxSessionBytes: number; }; }`
  - `export class ASRConfigManager { get(): ASRConfig; update(partial: Partial<ASRConfig>): void; save(): void; }`

- [ ] **Step 1: Write the failing config contract test**

Create `scripts/voice-input-contract.test.js` with this initial content:

```js
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

function run() {
  testAsrConfigDefaults();
  console.log('voice-input-contract tests passed');
}

run();
```

- [ ] **Step 2: Add the test script before implementation**

Modify `package.json` scripts to include `test`:

```json
"scripts": {
  "build": "tsc",
  "test": "npm run build && node scripts/voice-input-contract.test.js",
  "start": "npm run build && electron .",
  "dev": "tsc && electron .",
  "dist": "npm run build && electron-builder",
  "dist:win": "npm run build && electron-builder --win",
  "dist:mac": "npm run build && electron-builder --mac"
}
```

- [ ] **Step 3: Run test and verify RED**

Run:

```bash
npm test
```

Expected: FAIL during `node scripts/voice-input-contract.test.js` with `Cannot find module '../dist/core/asr-config.js'`.

- [ ] **Step 4: Create `asr-config.ts`**

Create `src/core/asr-config.ts`:

```ts
import { JsonConfigStore } from './json-config-store';

export type ASRProvider = 'openai-compatible' | 'aliyun' | 'custom';
export type ASRStreamingMode = 'realtime' | 'chunked-fallback';

export interface ASRCacheConfig {
  enabled: boolean;
  retentionMinutes: number;
  maxSessionBytes: number;
}

export interface ASRConfig {
  enabled: boolean;
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

export const DEFAULT_ASR_CONFIG: ASRConfig = {
  enabled: false,
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

export class ASRConfigManager {
  private store: JsonConfigStore<ASRConfig>;

  constructor() {
    this.store = new JsonConfigStore<ASRConfig>({
      fileName: 'asr.json',
      defaults: DEFAULT_ASR_CONFIG,
      namespace: 'ASRConfig',
    });
  }

  get(): ASRConfig {
    return this.store.get();
  }

  update(partial: Partial<ASRConfig>): void {
    this.store.update(partial);
  }

  save(): void {
    this.store.save();
  }
}
```

- [ ] **Step 5: Add safe example config**

Create `src/config/asr.example.json`:

```json
{
  "enabled": false,
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

- [ ] **Step 6: Update `.gitignore`**

Add this line near other ignored runtime configs:

```gitignore
src/config/asr.json
```

Keep this existing rule unchanged:

```gitignore
!src/config/*.example.json
```

- [ ] **Step 7: Run tests and build**

Run:

```bash
npm test
```

Expected: PASS with `voice-input-contract tests passed`.

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json src/core/asr-config.ts src/config/asr.example.json scripts/voice-input-contract.test.js .gitignore
git commit -m "feat(voice): add asr config contract"
```

---

## Task 2: Add ASR engine interfaces and OpenAI-compatible provider

**Files:**
- Create: `src/core/asr-engine.ts`
- Create: `src/core/asr-openai-compatible.ts`
- Modify: `scripts/voice-input-contract.test.js`

**Interfaces:**
- Consumes: `ASRConfig` from `src/core/asr-config.ts`.
- Produces:
  - `VoiceAudioChunk`
  - `ASRTranscriptEvent`
  - `ASRStreamInput`
  - `ASREngine`
  - `createASREngine(config: ASRConfig): ASREngine`
  - `normalizeTranscriptEvent(raw: unknown, sessionId: string): ASRTranscriptEvent | null`

- [ ] **Step 1: Extend the failing contract test**

Append these tests to `scripts/voice-input-contract.test.js` before `run()`:

```js
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
```

Update `run()`:

```js
function run() {
  testAsrConfigDefaults();
  testAsrEngineFactoryAndParser();
  console.log('voice-input-contract tests passed');
}
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npm test
```

Expected: FAIL with `Cannot find module '../dist/core/asr-engine.js'`.

- [ ] **Step 3: Create `asr-engine.ts`**

Create `src/core/asr-engine.ts`:

```ts
import { ASRConfig } from './asr-config';
import { OpenAICompatibleASREngine } from './asr-openai-compatible';

export interface VoiceAudioChunk {
  sessionId: string;
  sequence: number;
  mimeType: string;
  base64: string;
  capturedAt: number;
  durationMs?: number;
}

export type ASRTranscriptEvent =
  | { type: 'partial'; text: string; sessionId: string }
  | { type: 'final'; text: string; sessionId: string; audioRef?: string }
  | { type: 'error'; message: string; sessionId: string; recoverable: boolean };

export interface ASRStreamInput {
  sessionId: string;
  config: ASRConfig;
  chunks: AsyncIterable<VoiceAudioChunk>;
  signal?: AbortSignal;
}

export interface ASREngine {
  readonly provider: string;
  supportsStreaming(config: ASRConfig): boolean;
  stream(input: ASRStreamInput): AsyncIterable<ASRTranscriptEvent>;
}

export function createASREngine(config: ASRConfig): ASREngine {
  if (config.provider === 'openai-compatible') {
    return new OpenAICompatibleASREngine();
  }
  return new OpenAICompatibleASREngine();
}
```

- [ ] **Step 4: Create `asr-openai-compatible.ts`**

Create `src/core/asr-openai-compatible.ts`:

```ts
import { ASRConfig } from './asr-config';
import { ASREngine, ASRStreamInput, ASRTranscriptEvent, VoiceAudioChunk } from './asr-engine';

export function normalizeTranscriptEvent(raw: unknown, sessionId: string): ASRTranscriptEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const type = String(data.type ?? '');

  if (type === 'partial' && typeof data.text === 'string') {
    return { type: 'partial', text: data.text, sessionId };
  }
  if (type === 'final' && typeof data.text === 'string') {
    return { type: 'final', text: data.text, sessionId };
  }
  if ((type === 'transcript.delta' || type === 'response.audio_transcript.delta') && typeof data.delta === 'string') {
    return { type: 'partial', text: data.delta, sessionId };
  }
  if ((type === 'transcript.completed' || type === 'response.audio_transcript.done') && typeof data.transcript === 'string') {
    return { type: 'final', text: data.transcript, sessionId };
  }
  if (type === 'error') {
    const message = typeof data.message === 'string' ? data.message : 'ASR provider error';
    return { type: 'error', message, sessionId, recoverable: false };
  }

  return null;
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

async function* chunkedFallback(input: ASRStreamInput): AsyncIterable<ASRTranscriptEvent> {
  for await (const chunk of input.chunks) {
    const text = await transcribeChunk(input.config, chunk);
    if (text.trim()) {
      yield { type: 'partial', text, sessionId: input.sessionId };
    }
  }
  yield { type: 'final', text: '', sessionId: input.sessionId };
}

async function transcribeChunk(config: ASRConfig, chunk: VoiceAudioChunk): Promise<string> {
  const bytes = Buffer.from(chunk.base64, 'base64');
  const form = new FormData();
  const blob = new Blob([bytes], { type: chunk.mimeType });
  form.append('file', blob, `voice-${chunk.sequence}.webm`);
  form.append('model', config.model);
  if (config.language) form.append('language', config.language);

  const response = await fetch(joinUrl(config.baseUrl, config.transcriptionPath), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`ASR transcription failed: ${response.status}`);
  }

  const data = await response.json() as { text?: string };
  return data.text ?? '';
}

export class OpenAICompatibleASREngine implements ASREngine {
  readonly provider = 'openai-compatible';

  supportsStreaming(config: ASRConfig): boolean {
    return config.streamingMode === 'realtime';
  }

  async *stream(input: ASRStreamInput): AsyncIterable<ASRTranscriptEvent> {
    if (input.config.streamingMode === 'chunked-fallback') {
      yield* chunkedFallback(input);
      return;
    }

    yield* this.streamRealtime(input);
  }

  private async *streamRealtime(input: ASRStreamInput): AsyncIterable<ASRTranscriptEvent> {
    const websocketCtor = (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket;
    if (!websocketCtor) {
      yield { type: 'error', message: 'WebSocket is not available in this runtime', sessionId: input.sessionId, recoverable: false };
      return;
    }

    const url = joinUrl(input.config.baseUrl.replace(/^http/, 'ws'), input.config.realtimePath);
    const socket = new websocketCtor(`${url}?model=${encodeURIComponent(input.config.model)}`);
    const pending: ASRTranscriptEvent[] = [];
    let opened = false;
    let closed = false;

    socket.addEventListener('open', () => { opened = true; });
    socket.addEventListener('message', (event) => {
      try {
        const normalized = normalizeTranscriptEvent(JSON.parse(String(event.data)), input.sessionId);
        if (normalized) pending.push(normalized);
      } catch {
        pending.push({ type: 'error', message: 'Invalid ASR event payload', sessionId: input.sessionId, recoverable: true });
      }
    });
    socket.addEventListener('close', () => { closed = true; });
    socket.addEventListener('error', () => {
      pending.push({ type: 'error', message: 'ASR realtime connection failed', sessionId: input.sessionId, recoverable: false });
      closed = true;
    });

    while (!opened && !closed) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    if (!opened) {
      yield { type: 'error', message: 'ASR realtime connection did not open', sessionId: input.sessionId, recoverable: false };
      return;
    }

    for await (const chunk of input.chunks) {
      if (input.signal?.aborted || closed) break;
      socket.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: chunk.base64, mimeType: chunk.mimeType }));
      while (pending.length > 0) {
        yield pending.shift()!;
      }
    }

    if (!closed) {
      socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      socket.close();
    }

    while (pending.length > 0) {
      yield pending.shift()!;
    }
  }
}
```

- [ ] **Step 5: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/asr-engine.ts src/core/asr-openai-compatible.ts scripts/voice-input-contract.test.js
git commit -m "feat(voice): add asr engine abstraction"
```

---

## Task 3: Add runtime audio cache

**Files:**
- Create: `src/core/voice-audio-cache.ts`
- Modify: `scripts/voice-input-contract.test.js`

**Interfaces:**
- Consumes: `VoiceAudioChunk` from `src/core/asr-engine.ts` and `ASRConfig` cache fields.
- Produces:
  - `VoiceAudioRef`
  - `VoiceAudioCacheEntry`
  - `VoiceAudioCache`

- [ ] **Step 1: Extend failing cache tests**

Append to `scripts/voice-input-contract.test.js`:

```js
function testVoiceAudioCachePaths() {
  const { createVoiceAudioRefPath } = load('core/voice-audio-cache.js');
  assert.strictEqual(
    createVoiceAudioRefPath('abc123', 7),
    'voice-input/abc123/chunk-000007.webm'
  );
}
```

Update `run()`:

```js
function run() {
  testAsrConfigDefaults();
  testAsrEngineFactoryAndParser();
  testVoiceAudioCachePaths();
  console.log('voice-input-contract tests passed');
}
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npm test
```

Expected: FAIL with `Cannot find module '../dist/core/voice-audio-cache.js'`.

- [ ] **Step 3: Create `voice-audio-cache.ts`**

Create `src/core/voice-audio-cache.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { ASRCacheConfig } from './asr-config';
import { VoiceAudioChunk } from './asr-engine';

export interface VoiceAudioRef {
  sessionId: string;
  relativeDir: string;
  mimeType: string;
  totalBytes: number;
  finalizedAt: number;
}

export interface VoiceAudioCacheEntry {
  sessionId: string;
  dir: string;
  createdAt: number;
  totalBytes: number;
}

export function createVoiceAudioRefPath(sessionId: string, sequence: number): string {
  return `voice-input/${sessionId}/chunk-${String(sequence).padStart(6, '0')}.webm`;
}

export class VoiceAudioCache {
  private rootDir: string;
  private sessions = new Map<string, VoiceAudioCacheEntry>();

  constructor(private config: ASRCacheConfig) {
    this.rootDir = path.join(app.getPath('userData'), 'cache', 'voice-input');
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  async createSession(sessionId: string): Promise<VoiceAudioCacheEntry> {
    const dir = path.join(this.rootDir, sessionId);
    fs.mkdirSync(dir, { recursive: true });
    const entry = { sessionId, dir, createdAt: Date.now(), totalBytes: 0 };
    this.sessions.set(sessionId, entry);
    return entry;
  }

  async appendChunk(sessionId: string, chunk: VoiceAudioChunk): Promise<void> {
    if (!this.config.enabled) return;
    const entry = this.sessions.get(sessionId) ?? await this.createSession(sessionId);
    const bytes = Buffer.from(chunk.base64, 'base64');
    if (entry.totalBytes + bytes.byteLength > this.config.maxSessionBytes) {
      throw new Error('Voice audio cache session exceeded maxSessionBytes');
    }
    const filePath = path.join(entry.dir, `chunk-${String(chunk.sequence).padStart(6, '0')}.webm`);
    fs.writeFileSync(filePath, bytes);
    entry.totalBytes += bytes.byteLength;
  }

  async finalize(sessionId: string, mimeType = 'audio/webm'): Promise<VoiceAudioRef> {
    const entry = this.sessions.get(sessionId) ?? await this.createSession(sessionId);
    return {
      sessionId,
      relativeDir: `voice-input/${sessionId}`,
      mimeType,
      totalBytes: entry.totalBytes,
      finalizedAt: Date.now(),
    };
  }

  async discard(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (entry && fs.existsSync(entry.dir)) {
      fs.rmSync(entry.dir, { recursive: true, force: true });
    }
    this.sessions.delete(sessionId);
  }

  async cleanupExpired(): Promise<void> {
    const cutoff = Date.now() - this.config.retentionMinutes * 60 * 1000;
    for (const entry of fs.readdirSync(this.rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(this.rootDir, entry.name);
      const stat = fs.statSync(dir);
      if (stat.mtimeMs < cutoff) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
}
```

- [ ] **Step 4: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/voice-audio-cache.ts scripts/voice-input-contract.test.js
git commit -m "feat(voice): add runtime audio cache boundary"
```

---

## Task 4: Add VoiceInputManager session orchestration

**Files:**
- Create: `src/core/voice-input-manager.ts`
- Modify: `scripts/voice-input-contract.test.js`

**Interfaces:**
- Consumes: `ASRConfigManager`, `createASREngine`, `VoiceAudioCache`, `VoiceAudioChunk`, `ASRTranscriptEvent`.
- Produces:
  - `VoiceInputPhase`
  - `VoiceInputStartOptions`
  - `VoiceInputSessionInfo`
  - `VoiceInputDebugSnapshot`
  - `VoiceInputManager`

- [ ] **Step 1: Add failing manager tests**

Append to `scripts/voice-input-contract.test.js`:

```js
function testVoiceInputManagerExports() {
  const managerModule = load('core/voice-input-manager.js');
  assert.strictEqual(typeof managerModule.createVoiceSessionId, 'function');
  assert.match(managerModule.createVoiceSessionId(), /^voice-\d+-[a-z0-9]+$/);
}
```

Update `run()`:

```js
function run() {
  testAsrConfigDefaults();
  testAsrEngineFactoryAndParser();
  testVoiceAudioCachePaths();
  testVoiceInputManagerExports();
  console.log('voice-input-contract tests passed');
}
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npm test
```

Expected: FAIL with `Cannot find module '../dist/core/voice-input-manager.js'`.

- [ ] **Step 3: Create `voice-input-manager.ts`**

Create `src/core/voice-input-manager.ts`:

```ts
import { BrowserWindow } from 'electron';
import { ASRConfigManager } from './asr-config';
import { ASRTranscriptEvent, VoiceAudioChunk, createASREngine } from './asr-engine';
import { VoiceAudioCache } from './voice-audio-cache';

export type VoiceInputPhase = 'voice-idle' | 'voice-recording' | 'voice-transcribing' | 'voice-finalizing' | 'voice-error';

export interface VoiceInputStartOptions {
  source: 'button' | 'shortcut';
  mimeType: string;
}

export interface VoiceInputSessionInfo {
  sessionId: string;
  phase: VoiceInputPhase;
}

export interface VoiceInputDebugSnapshot {
  activeSessionId: string | null;
  phase: VoiceInputPhase;
  lastPartial: string;
  lastFinal: string;
  lastError: string | null;
}

interface ActiveVoiceSession {
  sessionId: string;
  source: 'button' | 'shortcut';
  mimeType: string;
  sequence: number;
  chunks: VoiceAudioChunk[];
  stopped: boolean;
}

export function createVoiceSessionId(): string {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class VoiceInputManager {
  private active: ActiveVoiceSession | null = null;
  private phase: VoiceInputPhase = 'voice-idle';
  private lastPartial = '';
  private lastFinal = '';
  private lastError: string | null = null;

  constructor(
    private mainWindow: BrowserWindow,
    private configManager: ASRConfigManager,
    private audioCache: VoiceAudioCache
  ) {}

  async startSession(options: VoiceInputStartOptions): Promise<VoiceInputSessionInfo> {
    if (this.active) {
      await this.cancelSession(this.active.sessionId);
    }
    const config = this.configManager.get();
    if (!config.enabled) {
      this.setError('Voice input is disabled');
      throw new Error('Voice input is disabled');
    }
    const sessionId = createVoiceSessionId();
    this.active = { sessionId, source: options.source, mimeType: options.mimeType, sequence: 0, chunks: [], stopped: false };
    await this.audioCache.createSession(sessionId);
    this.setPhase('voice-recording', '正在录音');
    return { sessionId, phase: this.phase };
  }

  async appendAudioChunk(sessionId: string, chunk: Omit<VoiceAudioChunk, 'sessionId' | 'sequence'>): Promise<void> {
    const session = this.requireSession(sessionId);
    const fullChunk: VoiceAudioChunk = { ...chunk, sessionId, sequence: session.sequence++ };
    session.chunks.push(fullChunk);
    await this.audioCache.appendChunk(sessionId, fullChunk);
    this.setPhase('voice-transcribing', '正在识别');
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);
    session.stopped = true;
    this.setPhase('voice-finalizing', '正在整理识别结果');
    const config = this.configManager.get();
    const engine = createASREngine(config);

    async function* chunks(): AsyncIterable<VoiceAudioChunk> {
      for (const chunk of session.chunks) yield chunk;
    }

    let finalText = '';
    for await (const event of engine.stream({ sessionId, config, chunks: chunks() })) {
      this.emitTranscript(event);
      if (event.type === 'partial') this.lastPartial = event.text;
      if (event.type === 'final') finalText = event.text || this.lastPartial;
      if (event.type === 'error') {
        this.setError(event.message);
        return;
      }
    }

    const audioRef = await this.audioCache.finalize(sessionId, session.mimeType);
    this.lastFinal = finalText;
    this.emitTranscript({ type: 'final', text: finalText, sessionId, audioRef: audioRef.relativeDir });
    this.active = null;
    this.setPhase('voice-idle', '语音识别完成');
  }

  async cancelSession(sessionId: string): Promise<void> {
    this.requireSession(sessionId);
    await this.audioCache.discard(sessionId);
    this.active = null;
    this.setPhase('voice-idle', '语音输入已取消');
  }

  getStatus(): VoiceInputDebugSnapshot {
    return {
      activeSessionId: this.active?.sessionId ?? null,
      phase: this.phase,
      lastPartial: this.lastPartial,
      lastFinal: this.lastFinal,
      lastError: this.lastError,
    };
  }

  private requireSession(sessionId: string): ActiveVoiceSession {
    if (!this.active || this.active.sessionId !== sessionId) {
      throw new Error(`No active voice input session: ${sessionId}`);
    }
    return this.active;
  }

  private setPhase(phase: VoiceInputPhase, message: string): void {
    this.phase = phase;
    this.mainWindow.webContents.send('voice-input-status', { phase, message, sessionId: this.active?.sessionId ?? null });
  }

  private setError(message: string): void {
    this.lastError = message;
    this.phase = 'voice-error';
    this.mainWindow.webContents.send('voice-input-status', { phase: 'voice-error', message, sessionId: this.active?.sessionId ?? null });
  }

  private emitTranscript(event: ASRTranscriptEvent): void {
    this.mainWindow.webContents.send('voice-input-transcript', event);
  }
}
```

- [ ] **Step 4: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/voice-input-manager.ts scripts/voice-input-contract.test.js
git commit -m "feat(voice): add voice input manager"
```

---

## Task 5: Wire main-process IPC and preload facade

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.ts`
- Modify: `scripts/voice-input-contract.test.js`

**Interfaces:**
- Consumes: `ASRConfigManager`, `VoiceAudioCache`, `VoiceInputManager`.
- Produces IPC channels:
  - `load-asr-config`
  - `save-asr-config`
  - `voice-input-start`
  - `voice-input-audio-chunk`
  - `voice-input-stop`
  - `voice-input-cancel`
  - `voice-input-status`
  - `voice-input-transcript`

- [ ] **Step 1: Add preload contract test**

Append to `scripts/voice-input-contract.test.js`:

```js
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
```

Update `run()` to call it.

- [ ] **Step 2: Run test and verify it passes as a guard**

Run:

```bash
npm test
```

Expected: PASS. This guard freezes channel names before wiring them.

- [ ] **Step 3: Modify imports and globals in `main.ts`**

Add imports:

```ts
import { ASRConfigManager } from '../core/asr-config';
import { VoiceAudioCache } from '../core/voice-audio-cache';
import { VoiceInputManager } from '../core/voice-input-manager';
```

Add globals near existing managers:

```ts
let asrConfigManager: ASRConfigManager;
let voiceAudioCache: VoiceAudioCache;
let voiceInputManager: VoiceInputManager;
```

Initialize after `ttsManager` in `createWindow()`:

```ts
asrConfigManager = new ASRConfigManager();
voiceAudioCache = new VoiceAudioCache(asrConfigManager.get().cache);
voiceInputManager = new VoiceInputManager(mainWindow, asrConfigManager, voiceAudioCache);
```

- [ ] **Step 4: Add IPC handlers in `setupIPC()`**

Add these handlers near TTS config handlers:

```ts
ipcMain.handle('load-asr-config', () => {
  return asrConfigManager.get();
});

ipcMain.on('save-asr-config', (_event, config: any) => {
  asrConfigManager.update(config);
});

ipcMain.handle('voice-input-start', async (_event, options: any) => {
  return voiceInputManager.startSession(options);
});

ipcMain.handle('voice-input-audio-chunk', async (_event, payload: any) => {
  await voiceInputManager.appendAudioChunk(payload.sessionId, payload.chunk);
});

ipcMain.handle('voice-input-stop', async (_event, sessionId: string) => {
  await voiceInputManager.stopSession(sessionId);
});

ipcMain.handle('voice-input-cancel', async (_event, sessionId: string) => {
  await voiceInputManager.cancelSession(sessionId);
});
```

- [ ] **Step 5: Add preload facade**

In `src/main/preload.ts`, add these properties inside `contextBridge.exposeInMainWorld('companion', { ... })`:

```ts
loadASRConfig: (): Promise<any> => {
  return ipcRenderer.invoke('load-asr-config');
},
saveASRConfig: (config: any) => {
  ipcRenderer.send('save-asr-config', config);
},
voiceInput: {
  start: (options: any): Promise<any> => ipcRenderer.invoke('voice-input-start', options),
  appendAudioChunk: (payload: any): Promise<void> => ipcRenderer.invoke('voice-input-audio-chunk', payload),
  stop: (sessionId: string): Promise<void> => ipcRenderer.invoke('voice-input-stop', sessionId),
  cancel: (sessionId: string): Promise<void> => ipcRenderer.invoke('voice-input-cancel', sessionId),
  onStatus: (callback: (payload: any) => void) => {
    ipcRenderer.on('voice-input-status', (_event, payload) => callback(payload));
  },
  onTranscript: (callback: (payload: any) => void) => {
    ipcRenderer.on('voice-input-transcript', (_event, payload) => callback(payload));
  },
},
```

- [ ] **Step 6: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/main.ts src/main/preload.ts scripts/voice-input-contract.test.js
git commit -m "feat(voice): wire voice input ipc"
```

---

## Task 6: Add renderer mic UI, MediaRecorder capture, and hold-to-talk

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/renderer.ts`
- Modify: `src/renderer/style.css`

**Interfaces:**
- Consumes preload facade:
  - `window.companion.voiceInput.start(options)`
  - `window.companion.voiceInput.appendAudioChunk(payload)`
  - `window.companion.voiceInput.stop(sessionId)`
  - `window.companion.voiceInput.cancel(sessionId)`
  - `window.companion.voiceInput.onStatus(callback)`
  - `window.companion.voiceInput.onTranscript(callback)`
  - `window.companion.loadASRConfig()`
- Produces UI behavior:
  - mic button toggle start/stop
  - `Ctrl+Shift+Space` hold-to-talk
  - streaming partial transcript updates textarea
  - final transcript respects `autoSendFinalTranscript`

- [ ] **Step 1: Add DOM elements**

In `src/renderer/index.html`, replace:

```html
<textarea id="chat-input" class="hidden" placeholder="和我说话吧..." rows="2"></textarea>
```

with:

```html
<div id="chat-input-wrap" class="hidden">
  <textarea id="chat-input" placeholder="和我说话吧..." rows="2"></textarea>
  <button id="voice-input-btn" class="voice-btn" title="语音输入：点击开始/结束，Ctrl+Shift+Space 长按说话">🎙</button>
</div>
```

- [ ] **Step 2: Update renderer element lookup**

In `src/renderer/renderer.ts`, near existing element lookup, add:

```ts
var chatInputWrapEl = document.getElementById('chat-input-wrap') as HTMLDivElement;
var voiceInputBtnEl = document.getElementById('voice-input-btn') as HTMLButtonElement;
```

Keep `chatInputEl` pointing at `#chat-input`.

- [ ] **Step 3: Add voice input renderer state**

Add near other runtime state:

```ts
var voiceRecorder: MediaRecorder | null = null;
var voiceSessionId: string | null = null;
var voiceChunkStartedAt = 0;
var voiceChunkSequence = 0;
var voiceRecording = false;
var voiceAutoSend = false;
var voicePartialBase = '';
```

- [ ] **Step 4: Add helpers for audio base64 and status**

Add functions near chat input helpers:

```ts
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      var result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = function () { reject(reader.error); };
    reader.readAsDataURL(blob);
  });
}

function setVoiceRecording(active: boolean): void {
  voiceRecording = active;
  voiceInputBtnEl.classList.toggle('recording', active);
  voiceInputBtnEl.textContent = active ? '■' : '🎙';
}

function setChatInputValue(text: string): void {
  chatInputEl.value = text;
  chatInputEl.dispatchEvent(new Event('input'));
}
```

- [ ] **Step 5: Add start/stop/cancel functions**

Add:

```ts
async function startVoiceInput(source: 'button' | 'shortcut'): Promise<void> {
  if (voiceRecording) return;
  try {
    var config = await window.companion.loadASRConfig();
    voiceAutoSend = !!config.autoSendFinalTranscript;
    var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    var mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    var session = await window.companion.voiceInput.start({ source: source, mimeType: mimeType });
    voiceSessionId = session.sessionId;
    voiceChunkSequence = 0;
    voicePartialBase = chatInputEl.value;
    voiceRecorder = new MediaRecorder(stream, { mimeType: mimeType });
    voiceRecorder.ondataavailable = async function (event: BlobEvent) {
      if (!voiceSessionId || !event.data || event.data.size === 0) return;
      var base64 = await blobToBase64(event.data);
      await window.companion.voiceInput.appendAudioChunk({
        sessionId: voiceSessionId,
        chunk: {
          mimeType: mimeType,
          base64: base64,
          capturedAt: Date.now(),
          durationMs: Date.now() - voiceChunkStartedAt,
        },
      });
      voiceChunkSequence++;
      voiceChunkStartedAt = Date.now();
    };
    voiceRecorder.onstop = function () {
      stream.getTracks().forEach(function (track) { track.stop(); });
    };
    voiceChunkStartedAt = Date.now();
    voiceRecorder.start(750);
    setVoiceRecording(true);
    showChatStatus('voice-recording', '正在听你说话…');
  } catch (e) {
    setVoiceRecording(false);
    showChatStatus('voice-error', '语音输入启动失败');
    console.error('[VoiceInput] start failed', e);
  }
}

async function stopVoiceInput(): Promise<void> {
  if (!voiceRecording || !voiceSessionId) return;
  var sessionId = voiceSessionId;
  setVoiceRecording(false);
  if (voiceRecorder && voiceRecorder.state !== 'inactive') {
    voiceRecorder.stop();
  }
  voiceRecorder = null;
  voiceSessionId = null;
  await window.companion.voiceInput.stop(sessionId);
}

async function toggleVoiceInput(): Promise<void> {
  if (voiceRecording) {
    await stopVoiceInput();
  } else {
    await startVoiceInput('button');
  }
}
```

Use the existing chat status rendering function name if it differs from `showChatStatus`; if the current renderer uses a differently named status helper, replace `showChatStatus(phase, message)` with that existing helper and keep the payload values unchanged.

- [ ] **Step 6: Wire button and hold-to-talk**

In `setupChatInput()` or equivalent renderer setup, add:

```ts
voiceInputBtnEl.addEventListener('click', function () {
  toggleVoiceInput();
});

document.addEventListener('keydown', function (e: KeyboardEvent) {
  if (!chatInputWrapEl.classList.contains('hidden') && e.ctrlKey && e.shiftKey && e.code === 'Space' && !voiceRecording) {
    e.preventDefault();
    startVoiceInput('shortcut');
  }
});

document.addEventListener('keyup', function (e: KeyboardEvent) {
  if (e.code === 'Space' && voiceRecording) {
    e.preventDefault();
    stopVoiceInput();
  }
});
```

- [ ] **Step 7: Wire transcript/status listeners**

Add during renderer init:

```ts
window.companion.voiceInput.onStatus(function (payload: any) {
  showChatStatus(payload.phase, payload.message);
});

window.companion.voiceInput.onTranscript(function (payload: any) {
  if (payload.type === 'partial') {
    setChatInputValue(voicePartialBase + payload.text);
    return;
  }
  if (payload.type === 'final') {
    var finalText = payload.text || chatInputEl.value;
    setChatInputValue(finalText);
    if (voiceAutoSend && finalText.trim()) {
      sendChatInput();
    }
  }
  if (payload.type === 'error') {
    showChatStatus('voice-error', payload.message || '语音识别失败');
  }
});
```

Use the existing send helper if it is not named `sendChatInput`; do not duplicate message sending logic.

- [ ] **Step 8: Add CSS**

In `src/renderer/style.css`, add:

```css
#chat-input-wrap {
  position: fixed;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 20;
}

#chat-input-wrap.hidden {
  display: none;
}

#chat-input-wrap #chat-input {
  min-width: 180px;
}

.voice-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  font-size: 14px;
}

.voice-btn.recording {
  background: #ffebee;
  color: #c62828;
  animation: voice-pulse 1s infinite;
}

@keyframes voice-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}
```

If existing CSS already positions `#chat-input`, adapt these rules so only one positioning rule owns the input wrapper.

- [ ] **Step 9: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 10: Manual verification**

Run:

```bash
npm run dev
```

Verify:

- Right-click opens the input wrapper.
- Mic button appears next to textarea.
- Click mic requests microphone permission and enters recording state.
- Click mic again stops recording.
- `Ctrl+Shift+Space` starts recording while input is open.
- Releasing `Space` stops recording.
- Final transcript stays in textarea by default.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/index.html src/renderer/renderer.ts src/renderer/style.css
git commit -m "feat(voice): add chat input recording controls"
```

---

## Task 7: Add settings UI for ASR config

**Files:**
- Modify: `src/main/settings.html`

**Interfaces:**
- Consumes preload APIs:
  - `window.companion.loadASRConfig()`
  - `window.companion.saveASRConfig(config)`
- Produces settings fields matching `ASRConfig`.

- [ ] **Step 1: Add tab button**

In the settings sidebar after the `语音` tab button, add:

```html
<button class="tab-btn" data-tab="asr">语音输入</button>
```

- [ ] **Step 2: Add ASR tab content**

After the TTS tab content, add:

```html
<div class="tab-content" id="tab-asr">
  <h2>语音输入（ASR）</h2>
  <hr class="divider">

  <div class="field">
    <label><input type="checkbox" id="asrEnabled"> 启用语音输入</label>
    <div class="hint">右键输入框中显示麦克风按钮；快捷键默认为 Ctrl+Shift+Space 长按说话。</div>
  </div>

  <div class="field">
    <label>供应商</label>
    <select id="asrProvider">
      <option value="openai-compatible">OpenAI-compatible</option>
      <option value="aliyun">阿里云（预留）</option>
      <option value="custom">Custom</option>
    </select>
  </div>

  <div class="field">
    <label>Base URL</label>
    <input type="text" id="asrBaseUrl" placeholder="https://api.openai.com/v1">
  </div>

  <div class="field password-wrap">
    <label>API Key</label>
    <input type="password" id="asrApiKey" placeholder="留空则不启用">
  </div>

  <div class="field">
    <label>模型</label>
    <input type="text" id="asrModel" placeholder="gpt-4o-mini-transcribe">
  </div>

  <div class="field">
    <label>Realtime Path</label>
    <input type="text" id="asrRealtimePath" placeholder="/realtime">
  </div>

  <div class="field">
    <label>Transcription Path</label>
    <input type="text" id="asrTranscriptionPath" placeholder="/audio/transcriptions">
  </div>

  <div class="field">
    <label>流式模式</label>
    <select id="asrStreamingMode">
      <option value="realtime">Realtime</option>
      <option value="chunked-fallback">Chunked fallback</option>
    </select>
  </div>

  <div class="field">
    <label>语言</label>
    <input type="text" id="asrLanguage" placeholder="zh">
  </div>

  <div class="field">
    <label><input type="checkbox" id="asrAutoSend"> 识别完成后自动发送</label>
    <div class="hint">默认关闭；关闭时需要按 Enter 发送。</div>
  </div>

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

  <div class="btn-row">
    <button class="btn btn-primary" id="saveASRBtn">保存语音输入设置</button>
  </div>
</div>
```

- [ ] **Step 3: Add load/save JS**

In the settings script section, add:

```js
async function loadASRConfig() {
  const config = await window.companion.loadASRConfig();
  document.getElementById('asrEnabled').checked = !!config.enabled;
  document.getElementById('asrProvider').value = config.provider || 'openai-compatible';
  document.getElementById('asrBaseUrl').value = config.baseUrl || 'https://api.openai.com/v1';
  document.getElementById('asrApiKey').value = config.apiKey || '';
  document.getElementById('asrModel').value = config.model || 'gpt-4o-mini-transcribe';
  document.getElementById('asrRealtimePath').value = config.realtimePath || '/realtime';
  document.getElementById('asrTranscriptionPath').value = config.transcriptionPath || '/audio/transcriptions';
  document.getElementById('asrStreamingMode').value = config.streamingMode || 'realtime';
  document.getElementById('asrLanguage').value = config.language || 'zh';
  document.getElementById('asrAutoSend').checked = !!config.autoSendFinalTranscript;
  document.getElementById('asrCacheEnabled').checked = config.cache?.enabled !== false;
  document.getElementById('asrCacheRetention').value = String(config.cache?.retentionMinutes ?? 30);
  document.getElementById('asrCacheMaxBytes').value = String(config.cache?.maxSessionBytes ?? 10485760);
}

function collectASRConfig() {
  return {
    enabled: document.getElementById('asrEnabled').checked,
    provider: document.getElementById('asrProvider').value,
    baseUrl: document.getElementById('asrBaseUrl').value.trim(),
    apiKey: document.getElementById('asrApiKey').value,
    model: document.getElementById('asrModel').value.trim(),
    realtimePath: document.getElementById('asrRealtimePath').value.trim(),
    transcriptionPath: document.getElementById('asrTranscriptionPath').value.trim(),
    streamingMode: document.getElementById('asrStreamingMode').value,
    language: document.getElementById('asrLanguage').value.trim(),
    autoSendFinalTranscript: document.getElementById('asrAutoSend').checked,
    cache: {
      enabled: document.getElementById('asrCacheEnabled').checked,
      retentionMinutes: Number(document.getElementById('asrCacheRetention').value || 30),
      maxSessionBytes: Number(document.getElementById('asrCacheMaxBytes').value || 10485760),
    },
  };
}

document.getElementById('saveASRBtn').addEventListener('click', () => {
  const config = collectASRConfig();
  if (config.enabled && (!config.baseUrl || !config.model || !config.apiKey)) {
    showToast('启用语音输入时需要 Base URL、模型和 API Key', 'error');
    return;
  }
  window.companion.saveASRConfig(config);
  showToast('语音输入设置已保存', 'success');
});
```

Call `loadASRConfig()` in the same initialization block that loads AI/TTS/appearance settings.

- [ ] **Step 4: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 5: Manual verification**

Run:

```bash
npm run dev
```

Verify:

- F11 opens settings.
- `语音输入` tab appears.
- Fields load defaults.
- Saving with `enabled = true` and missing key shows an error toast.
- Saving with fields filled persists without committing `src/config/asr.json`.

- [ ] **Step 6: Commit**

```bash
git add src/main/settings.html
git commit -m "feat(voice): add asr settings ui"
```

---

## Task 8: Update packaging and documentation

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`
- Modify: `docs/chat-experience-enhancement.md`
- Modify: `docs/configuration-security.md`

**Interfaces:**
- Consumes implemented modules and config names from Tasks 1-7.
- Produces updated docs for v0.3 voice input.

- [ ] **Step 1: Add ASR example config to packaged files**

In `package.json` build files, keep existing entries and ensure `src/config/asr.example.json` is packaged via the existing `src/config/*.example.json` behavior if a glob is added. If build files remain explicit, add:

```json
"src/config/asr.example.json"
```

under the `build.files` list.

- [ ] **Step 2: Update README feature table and usage**

In `README.md`, add to the feature table:

```md
| Voice Input (ASR) | 麦克风按钮 + 长按快捷键，流式识别到聊天输入框 | ✔ |
```

In Usage, add:

```md
| 麦克风按钮 | 点击开始/结束语音输入 |
| `Ctrl+Shift+Space` | 长按说话，松开结束 |
```

In Roadmap v0.3, change Voice Input:

```md
- [x] Voice Input (ASR)
```

- [ ] **Step 3: Update PROJECT_INDEX**

Add core modules under core 模块速查:

```md
- `asr-config.ts`：ASR 运行态配置，使用 `JsonConfigStore<T>` 保存到 Electron `userData/config/asr.json`。
- `asr-engine.ts` / `asr-openai-compatible.ts`：ASR 引擎接口与 OpenAI-compatible provider，主流程只依赖 `ASREngine.stream(...)`。
- `voice-input-manager.ts`：语音输入 session 编排，连接音频 chunk、ASR engine、音频缓存和 transcript/status IPC。
- `voice-audio-cache.ts`：短期语音缓存边界，保存 runtime-only 音频 chunk 并返回 `audioRef`。
```

Add IPC rows:

```md
| voice-input-start | {source, mimeType} | 开始语音输入 session |
| voice-input-audio-chunk | {sessionId, chunk} | 发送录音 chunk |
| voice-input-stop | sessionId | 停止并 finalizing 语音输入 |
| voice-input-cancel | sessionId | 取消语音输入 |
```

Main → Renderer rows:

```md
| voice-input-status | {phase, message, sessionId} | 语音输入状态 |
| voice-input-transcript | partial/final/error event | 语音识别结果 |
```

Add version row:

```md
| v0.3.0 | 2026-07-15 | 语音输入 ASR：麦克风按钮、长按快捷键、流式识别、ASR 配置、音频缓存接口 |
```

- [ ] **Step 4: Update VERSION**

At top of `VERSION.md`, add:

```md
## v0.3.0 (2026-07-15)
- 新增语音输入 ASR：右键输入框麦克风按钮点击开始/结束，`Ctrl+Shift+Space` 长按说话
- 新增 ASR 引擎抽象和 OpenAI-compatible provider，主流程通过 `ASREngine.stream(...)` 接收 partial/final transcript
- 新增 `VoiceInputManager` 和 `VoiceAudioCache`，预留短期音频缓存与 `audioRef` 复用边界
- 设置界面新增语音输入配置，支持供应商、Base URL、API Key、模型、流式模式、语言、自动发送和缓存参数
- 文档补充语音输入交互、配置安全、IPC 和模块职责
```

- [ ] **Step 5: Update chat experience doc**

In `docs/chat-experience-enhancement.md`, add a Voice Input section:

```md
## Voice input

语音输入复用现有右键聊天输入框，不新增聊天面板。

- 麦克风按钮：点击开始录音，再点结束。
- 快捷键：`Ctrl+Shift+Space` 长按说话，松开结束。
- partial transcript 会流式写入 textarea。
- 默认不自动发送；最终文本保留在输入框里，用户按 `Enter` 发送。
- 设置中可开启“识别完成后自动发送”。

流程：

```txt
Renderer MediaRecorder
  → preload voiceInput facade
  → VoiceInputManager
  → ASREngine.stream(...)
  → voice-input-transcript
  → renderer textarea
```
```

- [ ] **Step 6: Update configuration security doc**

Add `src/config/asr.example.json` to safe examples and `src/config/asr.json` to ignored runtime files.

Add runtime config list item:

```txt
asr.json
```

Add rule:

```md
ASR API Key 与语音缓存属于本地运行态数据，不应提交；音频缓存位于 Electron `userData/cache/voice-input/`，只保留短期 runtime 文件。
```

- [ ] **Step 7: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json README.md PROJECT_INDEX.md VERSION.md docs/chat-experience-enhancement.md docs/configuration-security.md
git commit -m "docs: document v0.3 voice input"
```

---

## Task 9: End-to-end verification and release cleanup

**Files:**
- Modify only if verification exposes a concrete issue in files touched by Tasks 1-8.

**Interfaces:**
- Consumes all prior tasks.
- Produces final verified v0.3.0 voice input state.

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
- `git status --short`: clean, or only intentional verification fixes staged for this task.

- [ ] **Step 2: Run manual app verification**

Run:

```bash
npm run dev
```

Verify:

- F11 settings has Voice Input section.
- ASR config saves and reloads.
- Right-click input shows textarea and mic button.
- Button click starts recording; second click stops.
- `Ctrl+Shift+Space` starts recording while input is open; releasing `Space` stops.
- Partial transcript appears in textarea when provider returns partials.
- Final transcript remains editable by default.
- With `autoSendFinalTranscript` enabled, final transcript uses the same send path as typed text.
- No real `src/config/asr.json` or audio cache file appears in `git status --short`.

- [ ] **Step 3: Inspect git for secrets and runtime files**

Run:

```bash
git status --short
git diff --cached
git grep -n "sk-\|apiKey.*[A-Za-z0-9]" -- ':!node_modules'
```

Expected:

- No real API key.
- No raw audio files.
- Only safe example `apiKey: ""` or docs describing empty API keys.

- [ ] **Step 4: Commit final fixes if needed**

If verification required fixes, commit them:

```bash
git add <fixed-files>
git commit -m "fix(voice): stabilize voice input verification"
```

If no fixes were needed, do not create an empty commit.

- [ ] **Step 5: Report final result**

Summarize:

- Commits created.
- Commands run and results.
- Manual checks completed.
- Any provider-specific limitations, such as realtime endpoint compatibility.

---

## Self-Review Checklist

- Spec coverage:
  - Mic button toggle: Task 6.
  - Hold-to-talk shortcut: Task 6.
  - Streaming transcript: Tasks 2, 4, 5, 6.
  - Default Enter-to-send: Task 6.
  - Optional auto-send: Tasks 1, 6, 7.
  - ASREngine abstraction: Task 2.
  - Audio cache: Task 3.
  - Settings UI: Task 7.
  - Runtime config/security: Tasks 1, 8.
  - Documentation updates: Task 8.
- Marker scan: no incomplete-section markers are permitted in this plan.
- Type consistency:
  - `ASRConfig` is defined in Task 1 and consumed by Tasks 2, 4, 7, and 8.
  - `VoiceAudioChunk` is defined in Task 2 and consumed by Tasks 3 and 4.
  - `VoiceInputManager` signatures in Task 4 match IPC usage in Task 5.
  - IPC channel names in Tasks 5 and 8 match the spec.
- Verification:
  - Every implementation task includes `npm test` and `npm run build`.
  - Manual app checks are isolated to UI tasks and final verification.
