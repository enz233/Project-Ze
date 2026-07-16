# Qwen-ASR Lightweight PCM Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Qwen-ASR main chat voice input send PCM16 16kHz chunks instead of webm/opus, while keeping OpenAI-compatible ASR unchanged.

**Architecture:** Add a lightweight Qwen branch inside the existing renderer voice input path. When the loaded ASR config has `provider === 'qwen-asr-realtime'`, use Web Audio PCM capture and the existing `voiceInput.appendAudioChunk` IPC; otherwise keep the existing `MediaRecorder` path. Update contract tests and docs only for this focused behavior.

**Tech Stack:** Electron renderer TypeScript-in-IIFE style, Web Audio API, existing ASR IPC, Node contract tests in `scripts/voice-input-contract.test.js`, existing `npm test` / `npm run build`.

## Global Constraints

- Do not modify ASR IPC channel names.
- Do not modify `VoiceInputManager` or ASR engine factory for this lightweight fix.
- Do not change OpenAI-compatible ASR behavior.
- Qwen-ASR main chat chunks must use `mimeType: 'audio/pcm;rate=16000'`.
- Keep code in the surrounding renderer style: IIFE functions, `var` in existing nearby code, minimal comments.
- Required verification: `npm test`, `npm run build`, `git diff --check`.

---

## File Structure

- Modify `src/renderer/renderer.ts`: add focused Qwen PCM helper functions near existing voice input code and branch `startVoiceInput()` to use them for `qwen-asr-realtime`.
- Modify `scripts/voice-input-contract.test.js`: add lightweight assertions that the main renderer voice path contains the Qwen PCM branch and preserves MediaRecorder fallback.
- Modify `docs/qwen-asr-configuration.md`: document that both settings test and main chat Qwen path send PCM16 16kHz.
- Modify `PROJECT_INDEX.md`: record the Qwen main voice input PCM behavior.
- Modify `VERSION.md`: add Unreleased fix note.

---

## Task 1: Add lightweight renderer contract coverage

**Files:**
- Modify: `scripts/voice-input-contract.test.js`

**Interfaces:**
- Consumes: existing contract test style using `fs.readFileSync` / `assert.match` against `src/renderer/renderer.ts` and `src/main/settings.html`.
- Produces: test coverage requiring these renderer strings/functions:
  - `function isQwenASRVoiceConfig(config)`
  - `function createQwenPCMVoiceRecorder(stream, sessionId)`
  - `mimeType: 'audio/pcm;rate=16000'`
  - `if (isQwenASRVoiceConfig(config))`
  - existing `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')`

- [x] **Step 1: Locate renderer contract test area**

Open only `scripts/voice-input-contract.test.js` and find the existing settings/renderer assertions around ASR recognition and voice input. Keep the new test near other voice input contract assertions.

- [x] **Step 2: Add failing test**

Add this function near the existing HTML/renderer contract tests:

```js
function testRendererQwenMainVoiceUsesPCM() {
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.ts'), 'utf8');
  assert.match(renderer, /function isQwenASRVoiceConfig\(config\)/);
  assert.match(renderer, /function createQwenPCMVoiceRecorder\(stream, sessionId\)/);
  assert.match(renderer, /if \(isQwenASRVoiceConfig\(config\)\)/);
  assert.match(renderer, /mimeType: 'audio\/pcm;rate=16000'/);
  assert.match(renderer, /语音 PCM 分片发送失败/);
  assert.match(renderer, /MediaRecorder\.isTypeSupported\('audio\/webm;codecs=opus'\)/);
}
```

Then call it in the main test runner area with the other synchronous contract tests:

```js
testRendererQwenMainVoiceUsesPCM();
```

- [x] **Step 3: Run test to verify RED**

Run:

```bash
npm test
```

Expected: FAIL because `renderer.ts` does not yet contain `isQwenASRVoiceConfig` or `createQwenPCMVoiceRecorder`.

- [x] **Step 4: Commit test only**

```bash
git add scripts/voice-input-contract.test.js
git commit -m "test(voice): cover qwen main pcm input"
```

---

## Task 2: Implement Qwen PCM main voice input path

**Files:**
- Modify: `src/renderer/renderer.ts`

**Interfaces:**
- Consumes: existing globals in `renderer.ts`:
  - `voicePendingChunkUploads: Promise<unknown>[]`
  - `voiceChunkStartedAt: number`
  - `voiceSessionId: string | null`
  - `blobToBase64(blob): Promise<string>`
  - `window.companion.voiceInput.start(options)`
  - `window.companion.voiceInput.appendAudioChunk(payload)`
- Produces:
  - `isQwenASRVoiceConfig(config): boolean`
  - `resampleVoiceFloat32ToTargetRate(samples: Float32Array, sourceRate: number, targetRate: number): Float32Array`
  - `encodeVoicePCM16Base64(samples: Float32Array): string`
  - `createQwenPCMVoiceRecorder(stream: MediaStream, sessionId: string): { state: string; onstop: null | (() => void); stop: () => void }`

- [x] **Step 1: Add Qwen helper functions before `startVoiceInput()`**

In `src/renderer/renderer.ts`, insert these helpers immediately before `async function startVoiceInput(source: 'button' | 'shortcut' = 'button')`:

```ts
  function isQwenASRVoiceConfig(config: any): boolean {
    return config && config.provider === 'qwen-asr-realtime';
  }

  function resampleVoiceFloat32ToTargetRate(samples: Float32Array, sourceRate: number, targetRate: number): Float32Array {
    if (!samples || sourceRate === targetRate) return samples || new Float32Array(0);
    var ratio = sourceRate / targetRate;
    var outputLength = Math.max(1, Math.round(samples.length / ratio));
    var output = new Float32Array(outputLength);
    for (var i = 0; i < outputLength; i++) {
      var sourceIndex = Math.min(samples.length - 1, Math.round(i * ratio));
      output[i] = samples[sourceIndex] || 0;
    }
    return output;
  }

  function encodeVoicePCM16Base64(samples: Float32Array): string {
    var buffer = new ArrayBuffer(samples.length * 2);
    var view = new DataView(buffer);
    for (var i = 0; i < samples.length; i++) {
      var sample = Math.max(-1, Math.min(1, samples[i] || 0));
      view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    var bytes = new Uint8Array(buffer);
    var binary = '';
    var batchSize = 0x8000;
    for (var j = 0; j < bytes.length; j += batchSize) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(j, j + batchSize)));
    }
    return btoa(binary);
  }

  function createQwenPCMVoiceRecorder(stream: MediaStream, sessionId: string): { state: string; onstop: null | (() => void); stop: () => void } {
    var AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) throw new Error('当前环境不支持 Qwen-ASR PCM 音频采集');
    var audioContext = new AudioContextCtor();
    var source = audioContext.createMediaStreamSource(stream);
    var processor = audioContext.createScriptProcessor(4096, 1, 1);
    var targetRate = 16000;
    var pendingSamples: Float32Array[] = [];
    var lastFlushAt = Date.now();
    var chunkStartedAt = Date.now();

    function flushPCMChunk(force: boolean): void {
      if (!force && Date.now() - lastFlushAt < 250) return;
      if (pendingSamples.length === 0) return;
      var sourceRate = audioContext.sampleRate || targetRate;
      var totalLength = pendingSamples.reduce(function(sum, part) { return sum + part.length; }, 0);
      var combined = new Float32Array(totalLength);
      var offset = 0;
      pendingSamples.forEach(function(part) {
        combined.set(part, offset);
        offset += part.length;
      });
      pendingSamples = [];
      lastFlushAt = Date.now();
      var capturedAt = Date.now();
      var durationMs = capturedAt - chunkStartedAt;
      chunkStartedAt = capturedAt;
      var pcm = resampleVoiceFloat32ToTargetRate(combined, sourceRate, targetRate);
      var base64 = encodeVoicePCM16Base64(pcm);
      var upload = window.companion.voiceInput.appendAudioChunk({
        sessionId: sessionId,
        chunk: { mimeType: 'audio/pcm;rate=16000', base64: base64, capturedAt: capturedAt, durationMs: durationMs },
      }).catch(function (e: any) {
        updateChatStatus({ phase: 'voice-error', message: '语音 PCM 分片发送失败' });
        console.error('[VoiceInput] append PCM chunk failed', e);
      });
      voicePendingChunkUploads.push(upload);
    }

    processor.onaudioprocess = function(event: AudioProcessingEvent) {
      var input = event.inputBuffer.getChannelData(0);
      pendingSamples.push(new Float32Array(input));
      flushPCMChunk(false);
    };
    source.connect(processor);
    processor.connect(audioContext.destination);

    return {
      state: 'recording',
      onstop: null,
      stop: function() {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        flushPCMChunk(true);
        processor.disconnect();
        source.disconnect();
        audioContext.close().catch(function() {});
        if (typeof this.onstop === 'function') this.onstop();
      },
    };
  }
```

- [x] **Step 2: Branch `startVoiceInput()` for Qwen config**

Inside `startVoiceInput()`, replace the existing MediaRecorder setup block after `voiceHoldToTalkShortcut = ...` with this structure. Keep the surrounding config loading and error handling unchanged:

```ts
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      var qwenVoiceInput = isQwenASRVoiceConfig(config);
      var mimeType = qwenVoiceInput
        ? 'audio/pcm;rate=16000'
        : (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm');
      // @ts-ignore
      var session = await window.companion.voiceInput.start({ source: source, mimeType: mimeType });
      voiceSessionId = session.sessionId;
      voiceLastSessionId = session.sessionId;
      voiceChunkSequence = 0;
      voicePendingChunkUploads = [];
      voicePartialBase = chatInputEl.value;
      voiceChunkStartedAt = Date.now();

      if (qwenVoiceInput) {
        voiceRecorder = createQwenPCMVoiceRecorder(stream, session.sessionId) as any;
        setVoiceRecording(true);
        updateChatStatus({ phase: 'voice-recording', message: '正在录音（PCM16 16kHz），请说话…' });
        return;
      }

      voiceRecorder = new MediaRecorder(stream, { mimeType: mimeType });
      voiceRecorder.ondataavailable = function (event: BlobEvent) {
        if (!voiceSessionId || !event.data || event.data.size === 0) return;
        var chunkSessionId = voiceSessionId;
        var chunkCapturedAt = Date.now();
        var chunkDurationMs = chunkCapturedAt - voiceChunkStartedAt;
        var upload = blobToBase64(event.data).then(function (base64) {
          // @ts-ignore
          return window.companion.voiceInput.appendAudioChunk({
            sessionId: chunkSessionId,
            chunk: {
              mimeType: mimeType,
              base64: base64,
              capturedAt: chunkCapturedAt,
              durationMs: chunkDurationMs,
            },
          });
        }).catch(function (e) {
          updateChatStatus({ phase: 'voice-error', message: '语音分片发送失败' });
          console.error('[VoiceInput] append chunk failed', e);
        });
        voicePendingChunkUploads.push(upload);
        voiceChunkSequence++;
        voiceChunkStartedAt = Date.now();
      };
      voiceRecorder.onstop = function () {
        stream.getTracks().forEach(function (track) { track.stop(); });
      };
      voiceRecorder.start(750);
      setVoiceRecording(true);
      updateChatStatus({ phase: 'voice-recording', message: '正在录音，请说话…' });
```

- [x] **Step 3: Ensure Qwen recorder releases microphone tracks on stop**

In the Qwen branch from Step 2, immediately after creating the Qwen recorder, assign an `onstop` handler:

```ts
        voiceRecorder.onstop = function () {
          stream.getTracks().forEach(function (track) { track.stop(); });
        };
```

The final Qwen branch should be:

```ts
      if (qwenVoiceInput) {
        voiceRecorder = createQwenPCMVoiceRecorder(stream, session.sessionId) as any;
        voiceRecorder.onstop = function () {
          stream.getTracks().forEach(function (track) { track.stop(); });
        };
        setVoiceRecording(true);
        updateChatStatus({ phase: 'voice-recording', message: '正在录音（PCM16 16kHz），请说话…' });
        return;
      }
```

- [x] **Step 4: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

- [x] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [x] **Step 6: Commit implementation**

```bash
git add src/renderer/renderer.ts scripts/voice-input-contract.test.js
git commit -m "fix(voice): send pcm for qwen main asr"
```

---

## Task 3: Update documentation and final verification

**Files:**
- Modify: `docs/qwen-asr-configuration.md`
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`
- Modify: `docs/superpowers/plans/2026-07-16-qwen-asr-lightweight-pcm.md`

**Interfaces:**
- Consumes: implemented behavior from Task 2.
- Produces: docs stating Qwen-ASR settings test and main chat voice input both send PCM16 16kHz.

- [x] **Step 1: Update Qwen configuration doc**

In `docs/qwen-asr-configuration.md`, update the troubleshooting section line that currently says the settings page test sends PCM16. Replace it with wording that states both settings test and main chat Qwen path send PCM16:

```md
3. 设置页的 Qwen-ASR 识别测试和主聊天 Qwen-ASR 语音输入都会绕过浏览器 `MediaRecorder` 的 `audio/webm;codecs=opus`，改用 Web Audio 采集并发送 `audio/pcm;rate=16000` PCM16 小端音频，避免实时 ASR 模型因 webm/opus 不兼容而只结束会话、不返回文本。
```

- [x] **Step 2: Update project index**

In `PROJECT_INDEX.md`, update the ASR engine bullet to mention the lightweight PCM main-entry behavior:

```md
- `asr-engine.ts` / `asr-openai-compatible.ts` / `asr-qwen-realtime.ts`：ASR 引擎接口与 provider 实现，主流程只依赖 `ASREngine.stream(...)`；OpenAI、阿里百炼 / DashScope、自定义 OpenAI-compatible 预设复用 OpenAI-compatible 引擎，Qwen-ASR 实时识别使用专用 WebSocket 引擎和 `Authorization` 握手请求头；配置方式见 `docs/qwen-asr-configuration.md`，当前 Qwen final/completed 事件会在 `session.finish` 后保留 15 秒等待窗口，设置页测试和主聊天语音入口都会向 Qwen 发送 PCM16 16kHz 音频。
```

- [x] **Step 3: Update version notes**

In `VERSION.md`, under `Unreleased`, add this bullet near the ASR bullets:

```md
- Qwen-ASR 主聊天语音输入改用 Web Audio PCM16 16kHz 分片，避免实时 ASR 模型因 webm/opus 输入不兼容而连接结束但无识别文本。
```

- [x] **Step 4: Mark this plan task checkboxes as completed as you execute**

Update `docs/superpowers/plans/2026-07-16-qwen-asr-lightweight-pcm.md` so the executed task checkboxes reflect the completed state.

- [x] **Step 5: Run final verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: PASS for tests and build; no output from `git diff --check`.

- [x] **Step 6: Commit docs and plan**

```bash
git add docs/qwen-asr-configuration.md PROJECT_INDEX.md VERSION.md docs/superpowers/plans/2026-07-16-qwen-asr-lightweight-pcm.md
git commit -m "docs: document qwen asr pcm main input"
```

---

## Self-Review

- Spec coverage: Task 1 covers lightweight contract tests; Task 2 implements Qwen main PCM input and preserves MediaRecorder fallback; Task 3 updates docs and performs final verification.
- Placeholder scan: no TBD/TODO placeholders; every code-changing step includes exact code or exact replacement text.
- Type consistency: helper names match across tests and implementation: `isQwenASRVoiceConfig`, `createQwenPCMVoiceRecorder`, `resampleVoiceFloat32ToTargetRate`, `encodeVoicePCM16Base64`.
- Scope check: plan stays focused on lightweight Qwen main-entry PCM fix and does not touch ASR IPC, VoiceInputManager, or engine factory.
