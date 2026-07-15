# ASR Settings Test Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a settings-page microphone volume meter and a separate real 10-second ASR recognition test, while making main-window hold-to-talk feedback more obvious.

**Architecture:** The settings page owns local microphone capture for both tests. Local volume testing uses only `getUserMedia` + `AudioContext` and never calls ASR. The 10-second recognition test reuses the existing `window.companion.voiceInput` facade and existing main-process `VoiceInputManager`; no new ASR provider or config schema is introduced.

**Tech Stack:** Electron settings HTML, browser `navigator.mediaDevices.getUserMedia`, `AudioContext` / `AnalyserNode`, `MediaRecorder`, existing preload `window.companion.voiceInput`, TypeScript build, dependency-free Node contract test.

## Global Constraints

- Do not add a new ASR provider or provider-specific Aliyun engine.
- Do not change provider presets or ASR config file shape.
- Do not auto-send test transcripts to chat.
- Do not write test transcripts into the main chat textarea.
- Do not store long-term test audio.
- Do not add wake-word or continuous monitoring.
- Reuse the existing `window.companion.voiceInput` IPC facade for ASR recognition tests.
- The local microphone volume test must not call ASR APIs and must not save audio.
- The 10-second recognition test calls the current ASR provider configuration and must clearly warn that it may produce an API call.
- Existing unrelated worktree changes, especially move/point files, must not be committed with this feature.
- Required verification: `npm test` and `npm run build`.

---

## File Structure

- Modify `src/main/settings.html`: add the ASR test UI, local microphone/audio helpers, 10-second recognition test flow, validation messages, and settings-page transcript listeners.
- Modify `src/renderer/renderer.ts`: only adjust main-window voice status copy so hold-to-talk feels active; do not change provider or IPC flow.
- Modify `scripts/voice-input-contract.test.js`: update the settings HTML contract so it asserts the new test controls and keeps the existing ASR preset contract compatible.
- No new source files are required.

---

## Task 1: Add settings-page ASR test UI and contract coverage

**Files:**
- Modify: `src/main/settings.html`
- Modify: `scripts/voice-input-contract.test.js`

**Interfaces:**
- Consumes existing ASR settings DOM IDs: `asrEnabled`, `asrBaseUrl`, `asrApiKey`, `asrModel`, `asrValidationMessage`.
- Produces new DOM IDs:
  - `asrMicStatus`
  - `asrMicLevelBar`
  - `asrMicLevelText`
  - `asrMicTestBtn`
  - `asrRecognitionProgressBar`
  - `asrRecognitionProgressText`
  - `asrRecognitionTestBtn`
  - `asrRecognitionResult`

- [ ] **Step 1: Extend the settings HTML contract test**

In `scripts/voice-input-contract.test.js`, inside `testSettingsAsrPresetContractMatchesCoreDefinitions()`, after the existing ASR preset assertions, add these assertions:

```js
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
  assert.match(html, /测试麦克风音量/);
  assert.match(html, /测试语音识别 10 秒/);
  assert.match(html, /可能产生 API 调用/);
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test
```

Expected: FAIL in `testSettingsAsrPresetContractMatchesCoreDefinitions()` because the new ASR test controls are not present.

- [ ] **Step 3: Add the ASR test panel markup**

In `src/main/settings.html`, inside `#tab-asr`, insert this section after the language field and before the auto-send field:

```html
      <h2 style="margin-top: 20px;">语音输入测试</h2>
      <hr class="divider">
      <div class="hint" style="margin-bottom: 10px; color: #666;">
        麦克风音量测试只检查本地输入；语音识别测试会录音约 10 秒并调用当前 ASR 配置，可能产生 API 调用。
      </div>

      <div class="field">
        <label>麦克风音量</label>
        <div id="asrMicStatus" class="hint">未开始测试</div>
        <div style="height: 10px; background: #e0e0e0; border-radius: 999px; overflow: hidden; margin-top: 6px;">
          <div id="asrMicLevelBar" style="height: 100%; width: 0%; background: #6aa3ff; transition: width 0.08s linear;"></div>
        </div>
        <div class="hint" id="asrMicLevelText">音量：0%</div>
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary" id="asrMicTestBtn">测试麦克风音量</button>
        <button class="btn btn-primary" id="asrRecognitionTestBtn">测试语音识别 10 秒</button>
      </div>

      <div class="field" style="margin-top: 12px;">
        <label>识别测试进度</label>
        <div style="height: 8px; background: #e0e0e0; border-radius: 999px; overflow: hidden;">
          <div id="asrRecognitionProgressBar" style="height: 100%; width: 0%; background: #81c784; transition: width 0.1s linear;"></div>
        </div>
        <div class="hint" id="asrRecognitionProgressText">未开始</div>
      </div>

      <div class="field">
        <label>识别结果</label>
        <textarea id="asrRecognitionResult" rows="4" readonly placeholder="测试识别到的文字会显示在这里"></textarea>
      </div>
```

- [ ] **Step 4: Run the contract test and build**

Run:

```bash
npm test
npm run build
```

Expected: PASS with `voice-input-contract tests passed`; TypeScript build passes.

- [ ] **Step 5: Commit only Task 1 files**

Before committing, inspect status and make sure no move/point files are staged:

```bash
git status --short
git add src/main/settings.html scripts/voice-input-contract.test.js
git commit -m "feat(voice): add asr settings test panel ui"
```

---

## Task 2: Implement local microphone volume test

**Files:**
- Modify: `src/main/settings.html`

**Interfaces:**
- Consumes DOM IDs from Task 1: `asrMicStatus`, `asrMicLevelBar`, `asrMicLevelText`, `asrMicTestBtn`.
- Produces settings-page functions:
  - `startASRMicMeter(): Promise<void>`
  - `stopASRMicMeter(): void`
  - `updateASRMicMeter(): void`
  - `setASRMicLevel(level: number): void`
  - `setASRMicStatus(message: string, isError?: boolean): void`

- [ ] **Step 1: Add mic meter state and helpers**

In `src/main/settings.html`, near other settings-page runtime state such as camera preview state, add:

```js
    let asrMicStream = null;
    let asrMicAudioContext = null;
    let asrMicAnalyser = null;
    let asrMicFrame = null;
    let asrMicLevelData = null;
```

Then add these functions near `debugASRSettings()`:

```js
    function setASRMicStatus(message, isError) {
      const el = document.getElementById('asrMicStatus');
      if (!el) return;
      el.textContent = message;
      el.style.color = isError ? '#c62828' : '#666';
    }

    function setASRMicLevel(level) {
      const normalized = Math.max(0, Math.min(1, level || 0));
      const percent = Math.round(normalized * 100);
      document.getElementById('asrMicLevelBar').style.width = percent + '%';
      document.getElementById('asrMicLevelText').textContent = '音量：' + percent + '%';
    }

    function updateASRMicMeter() {
      if (!asrMicAnalyser || !asrMicLevelData) return;
      asrMicAnalyser.getByteTimeDomainData(asrMicLevelData);
      let sum = 0;
      for (let i = 0; i < asrMicLevelData.length; i++) {
        const centered = (asrMicLevelData[i] - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / asrMicLevelData.length);
      setASRMicLevel(Math.min(1, rms * 4));
      asrMicFrame = requestAnimationFrame(updateASRMicMeter);
    }

    async function startASRMicMeter() {
      if (asrMicStream) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setASRMicStatus('当前环境不支持麦克风访问', true);
        return;
      }
      try {
        asrMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        asrMicAudioContext = new AudioContextCtor();
        asrMicAnalyser = asrMicAudioContext.createAnalyser();
        asrMicAnalyser.fftSize = 1024;
        asrMicLevelData = new Uint8Array(asrMicAnalyser.fftSize);
        asrMicAudioContext.createMediaStreamSource(asrMicStream).connect(asrMicAnalyser);
        document.getElementById('asrMicTestBtn').textContent = '停止麦克风测试';
        setASRMicStatus('正在监听麦克风，请说话…', false);
        updateASRMicMeter();
      } catch (error) {
        setASRMicStatus('麦克风启动失败：' + (error && error.message ? error.message : String(error)), true);
        stopASRMicMeter();
      }
    }

    function stopASRMicMeter() {
      if (asrMicFrame) cancelAnimationFrame(asrMicFrame);
      asrMicFrame = null;
      if (asrMicStream) {
        asrMicStream.getTracks().forEach(track => track.stop());
      }
      asrMicStream = null;
      if (asrMicAudioContext) {
        asrMicAudioContext.close().catch(() => {});
      }
      asrMicAudioContext = null;
      asrMicAnalyser = null;
      asrMicLevelData = null;
      setASRMicLevel(0);
      document.getElementById('asrMicTestBtn').textContent = '测试麦克风音量';
      setASRMicStatus('未开始测试', false);
    }
```

- [ ] **Step 2: Wire the mic test button**

Near other ASR event listeners, add:

```js
    document.getElementById('asrMicTestBtn').addEventListener('click', async function() {
      if (asrMicStream) {
        stopASRMicMeter();
        return;
      }
      await startASRMicMeter();
    });
```

- [ ] **Step 3: Run verification**

Run:

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 4: Manual check**

Run:

```bash
npm run dev
```

Open F11 settings, click `测试麦克风音量`, speak, and confirm the meter changes. Click again and confirm it resets.

- [ ] **Step 5: Commit only Task 2 files**

```bash
git status --short
git add src/main/settings.html
git commit -m "feat(voice): add local asr microphone meter"
```

---

## Task 3: Implement 10-second ASR recognition test

**Files:**
- Modify: `src/main/settings.html`

**Interfaces:**
- Consumes existing preload APIs:
  - `window.companion.voiceInput.start(options): Promise<{ sessionId: string }>`
  - `window.companion.voiceInput.appendAudioChunk(payload): Promise<void>`
  - `window.companion.voiceInput.stop(sessionId): Promise<void>`
  - `window.companion.voiceInput.cancel(sessionId): Promise<void>`
  - `window.companion.voiceInput.onStatus(callback)`
  - `window.companion.voiceInput.onTranscript(callback)`
- Consumes Task 2 helpers: `startASRMicMeter()`, `stopASRMicMeter()`, `setASRMicStatus()`.
- Produces settings-page functions:
  - `blobToBase64ForASRTest(blob: Blob): Promise<string>`
  - `setASRRecognitionProgress(percent: number, message: string): void`
  - `validateASRRecognitionTestConfig(config: any): boolean`
  - `startASRRecognitionTest(): Promise<void>`
  - `stopASRRecognitionTest(cancel?: boolean): Promise<void>`

- [ ] **Step 1: Add recognition test state**

In `src/main/settings.html`, near the mic meter state, add:

```js
    const ASR_RECOGNITION_TEST_MS = 10000;
    let asrRecognitionRecorder = null;
    let asrRecognitionStream = null;
    let asrRecognitionSessionId = null;
    let asrRecognitionStartedAt = 0;
    let asrRecognitionProgressTimer = null;
    let asrRecognitionChunkStartedAt = 0;
    let asrRecognitionUploads = [];
    let asrRecognitionRunning = false;
```

- [ ] **Step 2: Add result/progress helpers**

Add near the ASR helper functions:

```js
    function blobToBase64ForASRTest(blob) {
      return new Promise(function(resolve, reject) {
        const reader = new FileReader();
        reader.onload = function() {
          const result = String(reader.result || '');
          resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = function() { reject(reader.error); };
        reader.readAsDataURL(blob);
      });
    }

    function setASRRecognitionProgress(percent, message) {
      const bounded = Math.max(0, Math.min(100, percent || 0));
      document.getElementById('asrRecognitionProgressBar').style.width = bounded + '%';
      document.getElementById('asrRecognitionProgressText').textContent = message;
    }

    function setASRRecognitionResult(text) {
      document.getElementById('asrRecognitionResult').value = text || '';
    }

    function appendASRRecognitionResult(text) {
      const resultEl = document.getElementById('asrRecognitionResult');
      resultEl.value = text || resultEl.value;
    }

    function validateASRRecognitionTestConfig(config) {
      if (!config.enabled) {
        setASRValidationMessage('语音输入未开启：请先勾选启用语音输入并保存配置');
        showToast('请先启用语音输入并保存配置', 'error');
        return false;
      }
      const missing = getMissingASREnabledFields(config);
      if (missing.length > 0) {
        const message = '语音输入未开启：缺少 ' + missing.join(' / ');
        setASRValidationMessage(message);
        showToast(message, 'error');
        return false;
      }
      setASRValidationMessage('');
      return true;
    }
```

- [ ] **Step 3: Add start/stop recognition test functions**

Add:

```js
    async function startASRRecognitionTest() {
      if (asrRecognitionRunning) return;
      const config = collectASRConfig();
      if (!validateASRRecognitionTestConfig(config)) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setASRMicStatus('当前环境不支持麦克风访问', true);
        return;
      }

      try {
        asrRecognitionRunning = true;
        asrRecognitionUploads = [];
        setASRRecognitionResult('');
        setASRRecognitionProgress(0, '请说话… 0%');
        document.getElementById('asrRecognitionTestBtn').textContent = '停止识别测试';

        asrRecognitionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        await startASRMicMeter();

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        const session = await window.companion.voiceInput.start({ source: 'settings-test', mimeType });
        asrRecognitionSessionId = session.sessionId;
        asrRecognitionRecorder = new MediaRecorder(asrRecognitionStream, { mimeType });
        asrRecognitionChunkStartedAt = Date.now();

        asrRecognitionRecorder.ondataavailable = function(event) {
          if (!asrRecognitionSessionId || !event.data || event.data.size === 0) return;
          const sessionId = asrRecognitionSessionId;
          const capturedAt = Date.now();
          const durationMs = capturedAt - asrRecognitionChunkStartedAt;
          const upload = blobToBase64ForASRTest(event.data).then(function(base64) {
            return window.companion.voiceInput.appendAudioChunk({
              sessionId,
              chunk: { mimeType, base64, capturedAt, durationMs },
            });
          }).catch(function(error) {
            setASRMicStatus('语音测试分片发送失败：' + (error && error.message ? error.message : String(error)), true);
          });
          asrRecognitionUploads.push(upload);
          asrRecognitionChunkStartedAt = Date.now();
        };

        asrRecognitionStartedAt = Date.now();
        asrRecognitionProgressTimer = setInterval(function() {
          const elapsed = Date.now() - asrRecognitionStartedAt;
          const percent = Math.min(100, Math.round(elapsed / ASR_RECOGNITION_TEST_MS * 100));
          setASRRecognitionProgress(percent, percent < 100 ? '请说话… ' + percent + '%' : '正在识别…');
        }, 100);

        asrRecognitionRecorder.start(750);
        setASRMicStatus('正在录音测试，请说话…', false);
        setTimeout(function() {
          stopASRRecognitionTest(false);
        }, ASR_RECOGNITION_TEST_MS);
      } catch (error) {
        setASRMicStatus('语音识别测试启动失败：' + (error && error.message ? error.message : String(error)), true);
        await stopASRRecognitionTest(true);
      }
    }

    async function stopASRRecognitionTest(cancel) {
      if (!asrRecognitionRunning && !asrRecognitionSessionId) return;
      const sessionId = asrRecognitionSessionId;
      asrRecognitionRunning = false;
      document.getElementById('asrRecognitionTestBtn').textContent = '测试语音识别 10 秒';
      if (asrRecognitionProgressTimer) clearInterval(asrRecognitionProgressTimer);
      asrRecognitionProgressTimer = null;

      if (asrRecognitionRecorder && asrRecognitionRecorder.state !== 'inactive') {
        await new Promise(function(resolve) {
          const recorder = asrRecognitionRecorder;
          recorder.onstop = function() { resolve(); };
          recorder.stop();
        });
      }
      asrRecognitionRecorder = null;

      if (asrRecognitionStream) {
        asrRecognitionStream.getTracks().forEach(track => track.stop());
      }
      asrRecognitionStream = null;
      stopASRMicMeter();

      await Promise.all(asrRecognitionUploads);
      asrRecognitionUploads = [];

      if (sessionId) {
        if (cancel) {
          await window.companion.voiceInput.cancel(sessionId);
          setASRRecognitionProgress(0, '已取消');
        } else {
          setASRRecognitionProgress(100, '正在识别…');
          await window.companion.voiceInput.stop(sessionId);
        }
      }
      asrRecognitionSessionId = null;
    }
```

- [ ] **Step 4: Wire button and transcript listeners**

Near the settings event listeners, add:

```js
    document.getElementById('asrRecognitionTestBtn').addEventListener('click', async function() {
      if (asrRecognitionRunning) {
        await stopASRRecognitionTest(true);
        return;
      }
      await startASRRecognitionTest();
    });
```

Near initialization, after `loadASRConfig();`, register transcript listeners once:

```js
    window.companion.voiceInput.onStatus(function(payload) {
      if (!asrRecognitionSessionId || payload.sessionId !== asrRecognitionSessionId) return;
      if (payload.phase === 'voice-error') {
        setASRMicStatus(payload.message || '语音识别失败', true);
      } else if (payload.message) {
        setASRMicStatus(payload.message, false);
      }
    });

    window.companion.voiceInput.onTranscript(function(payload) {
      if (!asrRecognitionSessionId || payload.sessionId !== asrRecognitionSessionId) return;
      if (payload.type === 'partial') {
        appendASRRecognitionResult(payload.text);
      } else if (payload.type === 'final') {
        const finalText = payload.text || document.getElementById('asrRecognitionResult').value || '未识别到文字';
        setASRRecognitionResult(finalText);
        setASRRecognitionProgress(100, '识别完成');
        setASRMicStatus('识别完成', false);
      } else if (payload.type === 'error') {
        setASRMicStatus(payload.message || '语音识别失败', true);
        setASRRecognitionProgress(100, '识别失败');
      }
    });
```

- [ ] **Step 5: Run verification**

Run:

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 6: Manual checks**

Run:

```bash
npm run dev
```

Manual checks:

1. Incomplete ASR config + `测试语音识别 10 秒` shows validation and does not start.
2. Complete ASR config starts a 10-second progress bar.
3. Speaking updates the volume meter.
4. The result box shows partial/final transcript or a provider error.
5. No main chat message is sent.

- [ ] **Step 7: Commit only Task 3 files**

```bash
git status --short
git add src/main/settings.html
git commit -m "feat(voice): add asr recognition test"
```

---

## Task 4: Improve main-window hold-to-talk status copy

**Files:**
- Modify: `src/renderer/renderer.ts`

**Interfaces:**
- Consumes existing renderer functions: `startVoiceInput`, `stopVoiceInput`, `setVoiceRecording`, `updateChatStatus`.
- Produces no new exported interfaces.

- [ ] **Step 1: Update recording copy**

In `src/renderer/renderer.ts`, inside `startVoiceInput()`, replace:

```ts
updateChatStatus({ phase: 'voice-recording', message: '正在听你说话…' });
```

with:

```ts
updateChatStatus({ phase: 'voice-recording', message: '正在录音，请说话…' });
```

- [ ] **Step 2: Add finalizing copy when stopping**

In `stopVoiceInput()`, immediately after `setVoiceRecording(false);`, add:

```ts
updateChatStatus({ phase: 'voice-finalizing', message: '正在识别…' });
```

- [ ] **Step 3: Run verification**

Run:

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 4: Commit only Task 4 files**

```bash
git status --short
git add src/renderer/renderer.ts
git commit -m "fix(voice): clarify hold to talk status"
```

---

## Self-Review Checklist

- Spec coverage:
  - Local microphone volume test: Task 1 UI + Task 2 behavior.
  - 10-second ASR recognition test: Task 1 UI + Task 3 behavior.
  - Status/progress/live volume/recognized text: Tasks 1-3.
  - Main-window clearer recording/finalizing status: Task 4.
  - Reuse existing `window.companion.voiceInput`: Task 3.
  - No new provider/config schema: all tasks modify only settings UI and renderer copy.
- Placeholder scan: no TBD/TODO/implement-later placeholders are present.
- Type/name consistency:
  - DOM IDs in Task 1 match helper usage in Tasks 2-3.
  - Recognition source is exactly `'settings-test'`.
  - Test duration is exactly `ASR_RECOGNITION_TEST_MS = 10000`.
- Commit hygiene:
  - Every task explicitly stages only ASR-related files.
  - Existing non-ASR worktree changes must remain unstaged.
