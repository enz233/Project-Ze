# Aliyun TTS Endpoint Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复阿里云百炼 TTS 默认不可用问题，并允许用户在设置页配置阿里云 TTS endpoint path，以便默认使用新版 MultiModalConversation，也能尝试其它路径。

**Architecture:** 保持现有 TTS 架构：`TTSManager` 负责队列、字幕和播放；`TTSAliyun` 只负责 HTTP 合成并返回 base64 音频。新增 `aliyunEndpointPath` 配置，由 `TTSAliyun` 将 `aliyunBaseURL` 和 `aliyunEndpointPath` 规范拼接成最终请求 URL。

**Tech Stack:** Electron 42、TypeScript 6、CommonJS、浏览器内联设置页脚本、原生 `fetch`、现有 `JsonConfigStore<T>` 配置存储。

## Global Constraints

- 默认阿里云 Base URL 必须是 `https://dashscope.aliyuncs.com/api/v1`。
- 默认 endpoint path 必须是 `/services/aigc/multimodal-generation/generation`。
- 必须支持 `qwen3-tts-vd-2026-01-26` 等自定义 vd 模型名。
- 必须支持自定义设计音色 ID，通过现有阿里云自定义音色字段配置。
- 本次不实现 WebSocket 实时 TTS。
- 本次不改动 `TTSManager`、renderer 播放链路、队列和字幕逻辑。
- 旧 `text2audio/generation` 只作为可配置路径供用户尝试，不承诺官方仍可用。

---

## File Structure

- Modify: `src/core/tts-config.ts`
  - Responsibility: 定义 `TTSConfig` 字段和默认值。新增 `aliyunEndpointPath`，修正 `aliyunBaseURL` 默认值。
- Modify: `src/core/tts-aliyun.ts`
  - Responsibility: 阿里云 HTTP TTS 合成。新增 endpoint URL 拼接逻辑，默认使用 MultiModalConversation endpoint，移除不确定的 `parameters.format`。
- Modify: `src/config/tts.example.json`
  - Responsibility: 提供安全的 TTS 示例配置。同步新增 `aliyunEndpointPath` 和正确默认 Base URL。
- Modify: `src/main/settings.html`
  - Responsibility: 设置页。阿里云配置区新增“接口路径”输入框，加载/保存 `aliyunEndpointPath`，更新 Base URL placeholder。

---

### Task 1: Add Aliyun endpoint path to config defaults

**Files:**
- Modify: `src/core/tts-config.ts`
- Modify: `src/config/tts.example.json`

**Interfaces:**
- Consumes: Existing `TTSConfig` interface and `DEFAULT_CONFIG` from `src/core/tts-config.ts`.
- Produces: `TTSConfig.aliyunEndpointPath: string`, consumed by `TTSAliyun` and settings page save/load.

- [ ] **Step 1: Update `TTSConfig` interface**

In `src/core/tts-config.ts`, change the Aliyun section from:

```ts
  // 阿里云百炼 TTS
  aliyunApiKey: string;
  aliyunBaseURL: string;
  aliyunModel: string;
  aliyunVoice: string;
  aliyunLanguage: string;
```

to:

```ts
  // 阿里云百炼 TTS
  aliyunApiKey: string;
  aliyunBaseURL: string;
  aliyunEndpointPath: string;
  aliyunModel: string;
  aliyunVoice: string;
  aliyunLanguage: string;
```

- [ ] **Step 2: Update `DEFAULT_CONFIG` values**

In `src/core/tts-config.ts`, change:

```ts
  aliyunApiKey: '',
  aliyunBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  aliyunModel: 'qwen3-tts-flash',
  aliyunVoice: 'Cherry',
  aliyunLanguage: 'auto',
```

to:

```ts
  aliyunApiKey: '',
  aliyunBaseURL: 'https://dashscope.aliyuncs.com/api/v1',
  aliyunEndpointPath: '/services/aigc/multimodal-generation/generation',
  aliyunModel: 'qwen3-tts-flash',
  aliyunVoice: 'Cherry',
  aliyunLanguage: 'auto',
```

- [ ] **Step 3: Update example config**

In `src/config/tts.example.json`, change the Aliyun block from:

```json
  "aliyunApiKey": "",
  "aliyunBaseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  "aliyunModel": "qwen3-tts-flash",
  "aliyunVoice": "Cherry",
  "aliyunLanguage": "auto"
```

to:

```json
  "aliyunApiKey": "",
  "aliyunBaseURL": "https://dashscope.aliyuncs.com/api/v1",
  "aliyunEndpointPath": "/services/aigc/multimodal-generation/generation",
  "aliyunModel": "qwen3-tts-flash",
  "aliyunVoice": "Cherry",
  "aliyunLanguage": "auto"
```

- [ ] **Step 4: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: build may fail because `TTSAliyun` has not consumed the new field yet only if strict unused checks exist; in current project it should pass or fail only on unrelated existing errors. Record the exact result.

- [ ] **Step 5: Commit config changes**

Run:

```bash
git add src/core/tts-config.ts src/config/tts.example.json
git commit -m "feat: add aliyun tts endpoint path config"
```

Expected: commit succeeds.

---

### Task 2: Use configurable endpoint path in Aliyun TTS engine

**Files:**
- Modify: `src/core/tts-aliyun.ts`

**Interfaces:**
- Consumes: `TTSConfig.aliyunBaseURL: string`, `TTSConfig.aliyunEndpointPath: string`, `TTSConfig.aliyunModel: string`, `TTSConfig.aliyunVoice: string`, `TTSConfig.aliyunLanguage: string`.
- Produces: `TTSAliyun.synthesize(text: string): Promise<TTSAudioResult>` behavior that requests `joinUrl(aliyunBaseURL, aliyunEndpointPath)` and returns `{ base64, mimeType: 'audio/wav' }`.

- [ ] **Step 1: Replace the file header comment**

In `src/core/tts-aliyun.ts`, replace the existing top comment with:

```ts
/**
 * 阿里云百炼 TTS 引擎
 *
 * 调用阿里云百炼 qwen3-tts 系列非实时语音合成模型。
 * 默认 API: POST {baseURL}/services/aigc/multimodal-generation/generation
 * 格式：DashScope MultiModalConversation。
 *
 * 支持：
 * - qwen3-tts-flash（系统音色）
 * - qwen3-tts-instruct-flash（指令控制，需服务端支持）
 * - qwen3-tts-vd-*（设计音色，voice 填实际设计音色 ID）
 */
```

- [ ] **Step 2: Add URL join helper inside `TTSAliyun` class**

Inside `export class TTSAliyun implements TTSEngine {`, after the constructor, add:

```ts
  private buildUrl(): string {
    const baseURL = (this.config.aliyunBaseURL || 'https://dashscope.aliyuncs.com/api/v1').replace(/\/+$/, '');
    const endpointPath = (this.config.aliyunEndpointPath || '/services/aigc/multimodal-generation/generation').replace(/^\/+/, '');
    return `${baseURL}/${endpointPath}`;
  }
```

This makes all of these produce the same final URL:

```text
https://dashscope.aliyuncs.com/api/v1 + /services/aigc/multimodal-generation/generation
https://dashscope.aliyuncs.com/api/v1/ + services/aigc/multimodal-generation/generation
```

- [ ] **Step 3: Use `buildUrl()` and remove hard-coded endpoint**

In `synthesize`, replace:

```ts
    // DashScope MultiModalConversation 端点
    const baseURL = this.config.aliyunBaseURL || 'https://dashscope.aliyuncs.com/api/v1';
    const url = baseURL + '/services/aigc/multimodal-generation/generation';
    const voice = this.config.aliyunVoice || 'Cherry';
```

with:

```ts
    const url = this.buildUrl();
    const voice = this.config.aliyunVoice || 'Cherry';
```

- [ ] **Step 4: Remove uncertain `parameters.format` from request body**

In `synthesize`, replace:

```ts
    const body: any = {
      model: this.config.aliyunModel || 'qwen3-tts-flash',
      input: {
        text: text,
        voice: voice,
      },
      parameters: {
        format: 'wav',
      },
    };
```

with:

```ts
    const body: any = {
      model: this.config.aliyunModel || 'qwen3-tts-flash',
      input: {
        text: text,
        voice: voice,
      },
    };
```

- [ ] **Step 5: Keep language append logic unchanged**

Confirm this block remains after body creation:

```ts
    if (this.config.aliyunLanguage && this.config.aliyunLanguage !== 'auto') {
      body.input.language_type = this.config.aliyunLanguage;
    }
```

- [ ] **Step 6: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS. If it fails, fix only errors caused by this task.

- [ ] **Step 7: Commit engine changes**

Run:

```bash
git add src/core/tts-aliyun.ts
git commit -m "fix: use configurable aliyun tts endpoint path"
```

Expected: commit succeeds.

---

### Task 3: Add endpoint path field to settings UI

**Files:**
- Modify: `src/main/settings.html`

**Interfaces:**
- Consumes: `window.companion.loadTTSConfig()` returning a config that may include `aliyunEndpointPath`.
- Produces: `window.companion.saveTTSConfig(config)` receiving `config.aliyunEndpointPath` from input `#aliyunEndpointPath`.

- [ ] **Step 1: Add endpoint path input after Aliyun Base URL input**

In `src/main/settings.html`, find:

```html
        <div class="field">
          <label>API 地址</label>
          <input type="text" id="aliyunBaseURL" placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions" />
        </div>
```

Replace it with:

```html
        <div class="field">
          <label>API 地址</label>
          <input type="text" id="aliyunBaseURL" placeholder="https://dashscope.aliyuncs.com/api/v1" />
        </div>
        <div class="field">
          <label>接口路径</label>
          <input type="text" id="aliyunEndpointPath" placeholder="/services/aigc/multimodal-generation/generation" />
          <div class="hint">默认新版 MultiModalConversation；如需尝试历史接口可填 /services/aigc/text2audio/generation</div>
        </div>
```

- [ ] **Step 2: Load endpoint path from config**

In `loadTTSConfig`, find:

```js
      document.getElementById('aliyunApiKey').value = config.aliyunApiKey || '';
      document.getElementById('aliyunBaseURL').value = config.aliyunBaseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
      var aliyunModel = config.aliyunModel || 'qwen3-tts-flash';
```

Replace it with:

```js
      document.getElementById('aliyunApiKey').value = config.aliyunApiKey || '';
      document.getElementById('aliyunBaseURL').value = config.aliyunBaseURL || 'https://dashscope.aliyuncs.com/api/v1';
      document.getElementById('aliyunEndpointPath').value = config.aliyunEndpointPath || '/services/aigc/multimodal-generation/generation';
      var aliyunModel = config.aliyunModel || 'qwen3-tts-flash';
```

- [ ] **Step 3: Save endpoint path into config**

In `saveTTSConfig`, find:

```js
        aliyunApiKey: getVal('aliyunApiKey'),
        aliyunBaseURL: getVal('aliyunBaseURL', 'https://dashscope.aliyuncs.com'),
        aliyunModel: getVal('aliyunModel') === '_custom' ? getVal('aliyunCustomModel') : getVal('aliyunModel', 'qwen3-tts-flash'),
```

Replace it with:

```js
        aliyunApiKey: getVal('aliyunApiKey'),
        aliyunBaseURL: getVal('aliyunBaseURL', 'https://dashscope.aliyuncs.com/api/v1'),
        aliyunEndpointPath: getVal('aliyunEndpointPath', '/services/aigc/multimodal-generation/generation'),
        aliyunModel: getVal('aliyunModel') === '_custom' ? getVal('aliyunCustomModel') : getVal('aliyunModel', 'qwen3-tts-flash'),
```

- [ ] **Step 4: Add vd model option for convenience**

In the Aliyun model select, find:

```html
            <option value="qwen3-tts-flash">qwen3-tts-flash</option>
            <option value="qwen3-tts-instruct-flash">qwen3-tts-instruct-flash（指令控制）</option>
            <option value="_custom">自定义...</option>
```

Replace it with:

```html
            <option value="qwen3-tts-flash">qwen3-tts-flash</option>
            <option value="qwen3-tts-instruct-flash">qwen3-tts-instruct-flash（指令控制）</option>
            <option value="qwen3-tts-vd-2026-01-26">qwen3-tts-vd-2026-01-26（设计音色）</option>
            <option value="_custom">自定义...</option>
```

The existing custom model input still supports future vd model names.

- [ ] **Step 5: Update custom voice placeholder**

Find:

```html
            <input type="text" id="aliyunCustomVoice" placeholder="输入自定义音色名" />
```

Replace it with:

```html
            <input type="text" id="aliyunCustomVoice" placeholder="输入自定义音色名或设计音色 ID" />
```

- [ ] **Step 6: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS. The settings page is static HTML copied by Electron packaging and not TypeScript-checked, but the build confirms TS changes still pass.

- [ ] **Step 7: Commit settings UI changes**

Run:

```bash
git add src/main/settings.html
git commit -m "feat: expose aliyun tts endpoint path setting"
```

Expected: commit succeeds.

---

### Task 4: Final verification and usage note

**Files:**
- Inspect: `src/core/tts-config.ts`
- Inspect: `src/core/tts-aliyun.ts`
- Inspect: `src/config/tts.example.json`
- Inspect: `src/main/settings.html`
- Optional modify: `VERSION.md` only if project convention requires documenting this patch before release.

**Interfaces:**
- Consumes: All prior tasks.
- Produces: Verified working tree and user-facing usage instructions.

- [ ] **Step 1: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 2: Inspect diff for accidental playback changes**

Run:

```bash
git diff HEAD~3..HEAD -- src/core/tts-manager.ts src/core/tts-engine.ts src/main/preload.ts src/renderer/renderer.ts
```

Expected: no diff output, because this feature must not alter playback, queue, IPC, or renderer behavior.

- [ ] **Step 3: Inspect final Aliyun config defaults**

Run:

```bash
git diff HEAD~3..HEAD -- src/core/tts-config.ts src/config/tts.example.json
```

Expected: the diff shows `aliyunBaseURL` as `https://dashscope.aliyuncs.com/api/v1` and `aliyunEndpointPath` as `/services/aigc/multimodal-generation/generation` in both files.

- [ ] **Step 4: Inspect final Aliyun request body**

Run:

```bash
git diff HEAD~3..HEAD -- src/core/tts-aliyun.ts
```

Expected: the diff shows `buildUrl()`, no hard-coded `/services/aigc/multimodal-generation/generation` concatenation in `synthesize`, and no default `parameters: { format: 'wav' }` block.

- [ ] **Step 5: Provide usage instructions to user**

Tell the user:

```markdown
阿里云 TTS 现在这样配置：

- API 地址：`https://dashscope.aliyuncs.com/api/v1`
- 接口路径：`/services/aigc/multimodal-generation/generation`
- 普通模型：`qwen3-tts-flash`
- 普通音色：`Cherry`

如果要试 vd：

- 模型：`qwen3-tts-vd-2026-01-26`
- 音色：选择“自定义...”，填你的设计音色 ID

如果要试历史路径：

- 接口路径改成：`/services/aigc/text2audio/generation`
```

- [ ] **Step 6: Commit optional docs/version update only if edited**

If `VERSION.md` or another docs file was edited, run:

```bash
git add VERSION.md
git commit -m "docs: note aliyun tts endpoint path setting"
```

Expected: commit succeeds. If no docs/version file was edited, skip this step and state it was skipped.

---

## Self-Review

- Spec coverage: Task 1 covers config defaults and example; Task 2 covers URL construction, request body, response preservation, and vd compatibility; Task 3 covers settings page load/save and UI; Task 4 covers verification and usage instructions.
- Placeholder scan: No `TBD`, `TODO`, “similar to”, or unspecified implementation steps remain.
- Type consistency: The new property name is consistently `aliyunEndpointPath` across `TTSConfig`, default config, example JSON, settings load/save, and `TTSAliyun`.
