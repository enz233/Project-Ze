# TTS Engine Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract provider-specific TTS synthesis behind a shared `TTSEngine` interface and factory while preserving current playback behavior.

**Architecture:** `TTSManager` remains the orchestration entry point for config, translation, segment sequencing, Electron IPC playback, stop, and `playbackId` completion. Provider files implement a small Electron-free `TTSEngine` boundary and return `TTSAudioResult` objects. A single `createTTSEngine(config)` factory owns provider selection.

**Tech Stack:** Electron main process, TypeScript, Node Buffer, browser-compatible `fetch`, current provider files under `src/core/tts-*.ts`.

## Global Constraints

- Keep `TTSManager` as the only orchestration entry point for chat and app code.
- Separate provider-specific audio synthesis from Electron playback, subtitles, stop handling, and `playbackId` coordination.
- Do not redesign the TTS settings UI.
- Do not add a new TTS provider.
- Do not change the renderer/preload playback IPC contract except if a compile issue exposes a mismatch.
- Do not change chat response segmentation or `<item>` parsing.
- Do not introduce a full test framework in this iteration.
- `npm run build` must pass.
- Run `npm test`; if it reports `Missing script: "test"`, record that exact result and do not claim tests passed.

---

## File Structure

- Create: `src/core/tts-engine.ts` — shared `TTSAudioResult`, `TTSEngine`, and `createTTSEngine(config)` factory.
- Modify: `src/core/tts-api.ts` — make `TTSApi` implement `TTSEngine` and return `{ base64 }`.
- Modify: `src/core/tts-gpt-sovits.ts` — make `TTSGptSoVits` implement `TTSEngine` and return `{ base64 }`.
- Modify: `src/core/tts-mimo.ts` — make `TTSMiMo` implement `TTSEngine` and keep provider base64 parsing inside the engine.
- Modify: `src/core/tts-aliyun.ts` — make `TTSAliyun` implement `TTSEngine` and keep provider base64 / URL parsing inside the engine.
- Modify: `src/core/tts-manager.ts` — remove provider imports and provider selection branches; use `createTTSEngine(config)` for synth/test while preserving playback IPC and `playbackId` behavior.
- Modify: `PROJECT_INDEX.md` — update TTS architecture notes after code changes.

---

## Task 1: Introduce the TTS engine interface and factory

**Files:**
- Create: `src/core/tts-engine.ts`
- Modify: `src/core/tts-api.ts`
- Modify: `src/core/tts-gpt-sovits.ts`
- Modify: `src/core/tts-mimo.ts`
- Modify: `src/core/tts-aliyun.ts`

**Interfaces:**
- Consumes: `TTSConfig` and current provider classes from `src/core/tts-config.ts`, `src/core/tts-api.ts`, `src/core/tts-gpt-sovits.ts`, `src/core/tts-mimo.ts`, and `src/core/tts-aliyun.ts`.
- Produces:
  - `export interface TTSAudioResult { base64: string; mimeType?: string; }`
  - `export interface TTSEngine { synthesize(text: string): Promise<TTSAudioResult>; test(): Promise<boolean>; }`
  - `export function createTTSEngine(config: TTSConfig): TTSEngine`

- [ ] **Step 1: Add `tts-engine.ts` with interface and factory**

Create `src/core/tts-engine.ts` with exactly this structure:

```ts
import { TTSConfig } from './tts-config';
import { TTSGptSoVits } from './tts-gpt-sovits';
import { TTSApi } from './tts-api';
import { TTSMiMo } from './tts-mimo';
import { TTSAliyun } from './tts-aliyun';

export interface TTSAudioResult {
  base64: string;
  mimeType?: string;
}

export interface TTSEngine {
  synthesize(text: string): Promise<TTSAudioResult>;
  test(): Promise<boolean>;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64');
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bytes = Buffer.from(base64, 'base64');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export function createTTSEngine(config: TTSConfig): TTSEngine {
  if (config.mode === 'gpt-sovits') {
    return new TTSGptSoVits(config);
  }
  if (config.mode === 'mimo') {
    return new TTSMiMo(config);
  }
  if (config.mode === 'aliyun') {
    return new TTSAliyun(config);
  }
  return new TTSApi(config);
}
```

- [ ] **Step 2: Update `TTSApi` to implement `TTSEngine`**

In `src/core/tts-api.ts`, replace the imports with:

```ts
import { TTSConfig } from './tts-config';
import { TTSAudioResult, TTSEngine, arrayBufferToBase64 } from './tts-engine';
```

Change the class declaration to:

```ts
export class TTSApi implements TTSEngine {
```

Change the synthesize signature and return value from `ArrayBuffer` to `TTSAudioResult`:

```ts
/** 合成语音，返回音频 base64 */
async synthesize(text: string): Promise<TTSAudioResult> {
  const url = `${this.config.ttsBaseURL}/audio/speech`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.ttsApiKey}`,
    },
    body: JSON.stringify({
      model: this.config.ttsModel,
      input: text,
      voice: this.config.ttsVoice,
      speed: this.config.ttsSpeed,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TTS API 请求失败 (${response.status}): ${error}`);
  }

  return { base64: arrayBufferToBase64(await response.arrayBuffer()), mimeType: 'audio/wav' };
}
```

Leave `test()` in the same class and keep its existing behavior.

- [ ] **Step 3: Update `TTSGptSoVits` to implement `TTSEngine`**

In `src/core/tts-gpt-sovits.ts`, replace the imports with:

```ts
import { TTSConfig } from './tts-config';
import { TTSAudioResult, TTSEngine, arrayBufferToBase64 } from './tts-engine';
```

Change the class declaration to:

```ts
export class TTSGptSoVits implements TTSEngine {
```

Change the synthesize signature and final return to:

```ts
/** 合成语音，返回音频 base64 */
async synthesize(text: string): Promise<TTSAudioResult> {
  const url = `${this.config.gptSovitsURL}/tts`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: text,
      text_language: this.config.gptSovitsTextLang,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GPT-SoVITS 请求失败 (${response.status}): ${error}`);
  }

  return { base64: arrayBufferToBase64(await response.arrayBuffer()), mimeType: 'audio/wav' };
}
```

Leave `test()` in the same class and keep its existing behavior.

- [ ] **Step 4: Update `TTSMiMo` to implement `TTSEngine`**

In `src/core/tts-mimo.ts`, replace the imports with:

```ts
import { TTSConfig } from './tts-config';
import { TTSAudioResult, TTSEngine } from './tts-engine';
```

Change the class declaration to:

```ts
export class TTSMiMo implements TTSEngine {
```

Change the synthesize signature and the final base64 conversion block to:

```ts
/** 合成语音，返回音频 base64 */
async synthesize(text: string): Promise<TTSAudioResult> {
  const url = `${this.config.mimoBaseURL}/chat/completions`;

  const body: any = {
    model: this.config.mimoModel || 'mimo-v2.5-tts',
    messages: [
      { role: 'user', content: this.config.mimoVoiceDesign || '' },
      { role: 'assistant', content: text },
    ],
    audio: {
      format: 'wav',
    },
  };

  if (this.config.mimoModel === 'mimo-v2.5-tts' && this.config.mimoVoice) {
    body.audio.voice = this.config.mimoVoice;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': this.config.mimoApiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`MiMo TTS 请求失败 (${response.status}): ${error}`);
  }

  const data = await response.json() as any;
  const audioBase64 = data.choices?.[0]?.message?.audio?.data;
  if (!audioBase64) {
    throw new Error('MiMo TTS 未返回音频数据');
  }

  return { base64: audioBase64, mimeType: 'audio/wav' };
}
```

Leave `test()` in the same class and keep its existing behavior.

- [ ] **Step 5: Update `TTSAliyun` to implement `TTSEngine`**

In `src/core/tts-aliyun.ts`, replace the imports with:

```ts
import { TTSConfig } from './tts-config';
import { TTSAudioResult, TTSEngine, arrayBufferToBase64 } from './tts-engine';
```

Change the class declaration to:

```ts
export class TTSAliyun implements TTSEngine {
```

Change the synthesize signature to:

```ts
async synthesize(text: string): Promise<TTSAudioResult> {
```

Inside `if (audio.data)`, replace the manual decode block with:

```ts
return { base64: audio.data, mimeType: 'audio/wav' };
```

Inside `if (audio.url)`, replace the return with:

```ts
return { base64: arrayBufferToBase64(await audioResponse.arrayBuffer()), mimeType: 'audio/wav' };
```

Leave `test()` in the same class and keep its existing behavior.

- [ ] **Step 6: Run build and fix import/type errors only**

Run:

```bash
npm run build
```

Expected: it may fail because `TTSManager` still expects `ArrayBuffer`. Fix only provider-file import/type errors in this task. If the only remaining errors are in `src/core/tts-manager.ts` because it still consumes `ArrayBuffer`, leave those for Task 2 and record them in the task report.

- [ ] **Step 7: Commit Task 1 if build passes or only Task 2 errors remain**

If `npm run build` passes, commit:

```bash
git add src/core/tts-engine.ts src/core/tts-api.ts src/core/tts-gpt-sovits.ts src/core/tts-mimo.ts src/core/tts-aliyun.ts
git commit -m "refactor: introduce tts engine interface"
```

If build fails only because `TTSManager` still expects `ArrayBuffer`, still commit the provider/interface changes with the same message, and record the exact remaining `TTSManager` errors in the report so Task 2 can resolve them.

---

## Task 2: Move `TTSManager` synthesis and test paths to the factory

**Files:**
- Modify: `src/core/tts-manager.ts`

**Interfaces:**
- Consumes: `createTTSEngine(config): TTSEngine` and `TTSAudioResult` from `src/core/tts-engine.ts`.
- Produces: `TTSManager` with provider selection delegated to `createTTSEngine(config)` and playback still owned by `TTSManager`.

- [ ] **Step 1: Update `TTSManager` imports**

In `src/core/tts-manager.ts`, replace provider imports:

```ts
import { TTSGptSoVits } from './tts-gpt-sovits';
import { TTSApi } from './tts-api';
import { TTSMiMo } from './tts-mimo';
import { TTSAliyun } from './tts-aliyun';
```

with:

```ts
import { TTSAudioResult, createTTSEngine } from './tts-engine';
```

Keep the Electron, config, and AI imports unchanged.

- [ ] **Step 2: Change `speak()` to play `TTSAudioResult`**

In `speak(text: string)`, keep the current flow and replace only the local naming if needed:

```ts
const audio = await this.synthesize(ttsText, config);
if (audio) {
  await this.play(audio, subtitleText);
}
```

Expected behavior: TTS disabled still returns immediately; synthesis failure still falls through to the catch/log path or returns `null`; playback still uses subtitles.

- [ ] **Step 3: Change `speakAll()` to use `TTSAudioResult`**

In `speakAll(texts: string[])`, keep the current parallel prepare/parallel synthesize/sequential play structure. Ensure this block remains equivalent:

```ts
const audioPromises = prepared.map(p => this.synthesize(p.ttsText, config));
const audioResults = await Promise.all(audioPromises);

for (let i = 0; i < audioResults.length; i++) {
  if (!this.isSpeaking) {
    console.log('[TTS] speakAll interrupted');
    break;
  }
  if (audioResults[i]) {
    await this.play(audioResults[i]!, prepared[i].subtitleText);
    playedAny = true;
  }
  if (i < audioResults.length - 1 && this.isSpeaking) {
    await this.delay(800 + Math.random() * 400);
  }
}
```

- [ ] **Step 4: Replace `synthesize()` provider branches with factory call**

Replace the entire private `synthesize` method with:

```ts
/** 根据配置选择引擎并合成 */
private async synthesize(text: string, config: TTSConfig): Promise<TTSAudioResult | null> {
  try {
    const engine = createTTSEngine(config);
    return await engine.synthesize(text);
  } catch (error: any) {
    console.error('[TTS] 合成失败:', error.message);
    return null;
  }
}
```

- [ ] **Step 5: Change `play()` to consume `TTSAudioResult` and keep IPC unchanged**

Replace the `play` signature:

```ts
private play(audioData: ArrayBuffer, text: string): Promise<void> {
```

with:

```ts
private play(audio: TTSAudioResult, text: string): Promise<void> {
```

Inside `play`, replace:

```ts
const base64 = Buffer.from(audioData).toString('base64');
```

with:

```ts
const base64 = audio.base64;
```

Do not change these lines except if formatting requires it:

```ts
const playbackId = String(++this.playbackSeq);
this.mainWindow.webContents.send('tts-play', base64, text, playbackId);
timeout = setTimeout(cleanup, 30000);
```

- [ ] **Step 6: Replace `test()` provider branches with factory call**

Replace the provider-selection block inside `test()` with:

```ts
const engine = createTTSEngine(config);
const ok = await engine.test();
```

Keep the returned messages exactly:

```ts
return ok
  ? { success: true, message: 'TTS 连接成功' }
  : { success: false, message: 'TTS 连接失败' };
```

Keep the catch return exactly:

```ts
return { success: false, message: 'TTS 测试失败: ' + error.message };
```

- [ ] **Step 7: Run build**

Run:

```bash
npm run build
```

Expected: `tsc` exits 0. Fix TypeScript errors in TTS files only. Do not edit renderer/preload unless the compiler reports a mismatch directly caused by this task.

- [ ] **Step 8: Verify provider selection moved out of `TTSManager`**

Run:

```bash
git grep -n "new TTSGptSoVits\|new TTSApi\|new TTSMiMo\|new TTSAliyun\|config.mode ===" -- src/core/tts-manager.ts src/core/tts-engine.ts
```

Expected:

- `src/core/tts-manager.ts` has no matches for provider constructors or `config.mode ===`.
- `src/core/tts-engine.ts` contains the provider constructor selection.

- [ ] **Step 9: Verify provider engines remain Electron-free**

Run:

```bash
git grep -n "from 'electron'\|BrowserWindow\|ipcMain\|webContents\|tts-play\|tts-playback-done" -- src/core/tts-api.ts src/core/tts-gpt-sovits.ts src/core/tts-mimo.ts src/core/tts-aliyun.ts src/core/tts-engine.ts
```

Expected: no matches.

- [ ] **Step 10: Verify playback IPC still exists only in orchestration/bridge files**

Run:

```bash
git grep -n "tts-play\|tts-playback-done\|playbackId" -- src/core/tts-manager.ts src/main/preload.ts src/renderer/renderer.ts
```

Expected: matches remain in `TTSManager`, preload, and renderer. The `TTSManager` send call still sends `base64`, `text`, and `playbackId`.

- [ ] **Step 11: Commit Task 2**

Run:

```bash
git add src/core/tts-manager.ts src/core/tts-engine.ts src/core/tts-api.ts src/core/tts-gpt-sovits.ts src/core/tts-mimo.ts src/core/tts-aliyun.ts
git commit -m "refactor: move tts synthesis behind engines"
```

---

## Task 3: Update architecture notes and run final verification

**Files:**
- Modify: `PROJECT_INDEX.md`
- Modify: `docs/superpowers/plans/2026-07-15-tts-engine-interface.md` only if verification notes in this plan need correction after implementation.

**Interfaces:**
- Consumes: final TTS architecture from Tasks 1-2.
- Produces: documentation that reflects `TTSEngine` / `createTTSEngine(config)` and final verification evidence.

- [ ] **Step 1: Update `PROJECT_INDEX.md` TTS module description**

In `PROJECT_INDEX.md`, find the core module list item for TTS and replace it with:

```md
- `tts-manager.ts` / `tts-engine.ts` / `tts-*.ts`：TTS 编排、统一引擎接口与各供应商合成实现；`TTSManager` 负责播放/字幕/停止/`playbackId`，供应商文件只负责语音合成。
```

- [ ] **Step 2: Add a short TTS architecture note**

In the `### AI 系统` or nearby architecture section of `PROJECT_INDEX.md`, add this paragraph after the existing TTS or 情境化主动回应 notes:

```md
- **TTS 架构**：`TTSManager` 保持唯一编排入口，读取配置并调用 `createTTSEngine(config)` 获取供应商引擎；供应商引擎实现 `TTSEngine.synthesize(text)` 并返回 base64 音频，Electron 播放、字幕、停止和 `playbackId` 完成确认仍只在 `TTSManager`、preload 和 renderer 链路中处理。
```

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: `tsc` exits 0.

- [ ] **Step 4: Run npm test and record exact status**

Run:

```bash
npm test
```

Expected for the current project unless a test script was added:

```text
npm error Missing script: "test"
```

Record this as “test script missing” and do not report tests as passing. If a test script exists, it must pass before continuing.

- [ ] **Step 5: Run final architecture verification commands**

Run:

```bash
git grep -n "new TTSGptSoVits\|new TTSApi\|new TTSMiMo\|new TTSAliyun\|config.mode ===" -- src/core/tts-manager.ts src/core/tts-engine.ts
git grep -n "from 'electron'\|BrowserWindow\|ipcMain\|webContents\|tts-play\|tts-playback-done" -- src/core/tts-api.ts src/core/tts-gpt-sovits.ts src/core/tts-mimo.ts src/core/tts-aliyun.ts src/core/tts-engine.ts
git grep -n "tts-play\|tts-playback-done\|playbackId" -- src/core/tts-manager.ts src/main/preload.ts src/renderer/renderer.ts
```

Expected:

- Provider construction and `config.mode ===` appear only in `src/core/tts-engine.ts`.
- Provider engine/interface files do not import Electron playback APIs and do not mention playback IPC channel names.
- Playback IPC and `playbackId` still appear in `TTSManager`, preload, and renderer.

- [ ] **Step 6: Run final status check**

Run:

```bash
git status --short
git diff --check
```

Expected: only intended documentation changes are unstaged before the commit; `git diff --check` reports no whitespace errors. CRLF warnings on Windows are acceptable.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add PROJECT_INDEX.md docs/superpowers/plans/2026-07-15-tts-engine-interface.md
git commit -m "docs: update tts engine architecture notes"
```

If `docs/superpowers/plans/2026-07-15-tts-engine-interface.md` has no implementation-time changes, omit it from `git add` and commit only `PROJECT_INDEX.md`.

## Self-Review

Spec coverage:

- `TTSManager` remains orchestration entry point: Task 2 keeps config, translation, sequencing, playback, stop, and `playbackId` in `TTSManager`.
- Provider-specific synthesis separated: Task 1 updates provider files to implement `TTSEngine`; Task 2 removes provider branches from `TTSManager`.
- `TTSEngine` and factory introduced: Task 1 defines both in `src/core/tts-engine.ts`.
- Playback behavior preserved: Task 2 explicitly preserves IPC send shape and timeout logic; Task 3 verifies `playbackId` flow.
- Settings UI, providers, chat segmentation, and test framework are unchanged: listed as global constraints and not included in task file lists.
- Verification required by spec: Task 2 and Task 3 include build, provider selection search, Electron-free engine search, IPC flow search, and npm test status.

Placeholder scan: no unfinished placeholder markers remain. Every code-changing step includes exact code or exact replacement snippets.

Type consistency:

- `TTSAudioResult`, `TTSEngine`, and `createTTSEngine(config)` are defined in Task 1 and consumed with matching names in Task 2.
- Provider `synthesize(text)` return type is consistently `Promise<TTSAudioResult>`.
- `TTSManager.play(audio, text)` consumes `TTSAudioResult`, matching Task 2 synthesis output.
