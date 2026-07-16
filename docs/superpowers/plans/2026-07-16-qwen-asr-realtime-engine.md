# Qwen ASR Realtime Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated Qwen-ASR realtime WebSocket provider so 阿里百炼 / Qwen-ASR no longer goes through the OpenAI `/audio/transcriptions` fallback path that returns 404.

**Architecture:** Keep the existing `OpenAICompatibleASREngine` for OpenAI-compatible ASR. Add `QwenASRRealtimeEngine` for the Qwen-ASR WebSocket protocol, selected by `ASRConfig.provider === 'qwen-asr-realtime'`. Settings stay simple: provider preset and Base URL remain visible; advanced settings keep path/streaming/cache details.

**Tech Stack:** Electron main process, TypeScript strict mode, `ws` Node WebSocket client for handshake headers, existing dependency-free `scripts/voice-input-contract.test.js`, existing `npm test` / `npm run build`.

## Global Constraints

- Do not route Qwen-ASR through OpenAI `/audio/transcriptions`.
- Qwen-ASR uses WebSocket URL `wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=<model_name>` by default.
- Qwen-ASR authorization must be sent in WebSocket handshake headers as `Authorization: Bearer <apiKey>`.
- Use Manual mode for current push-to-talk / settings recognition-test flow by sending `session.update` with `session.turn_detection: null`.
- Parse Qwen-ASR `conversation.item.input_audio_transcription.text` as partial text and `conversation.item.input_audio_transcription.completed` as final text.
- Keep OpenAI default behavior unchanged.
- Required verification: `npm test`, `npm run build`, `git diff --check`.

---

## File Structure

- Modify `package.json` / `package-lock.json`: add runtime dependency `ws` and dev type dependency `@types/ws`.
- Modify `src/core/asr-config.ts`: add provider `qwen-asr-realtime`, preset `qwen-asr`, and runtime field `workspaceId`.
- Create `src/core/asr-qwen-realtime.ts`: Qwen-ASR WebSocket URL/header helpers, event normalizer, Manual mode event helpers, and `QwenASRRealtimeEngine`.
- Modify `src/core/asr-engine.ts`: dispatch `qwen-asr-realtime` to `QwenASRRealtimeEngine`.
- Modify `src/config/asr.example.json`: include safe `workspaceId` and keep API key empty.
- Modify `src/main/settings.html`: add Qwen-ASR preset, Workspace ID field, and collect/save/load it.
- Modify `scripts/voice-input-contract.test.js`: add contract tests for Qwen provider config, URL/header helpers, event normalization, and factory selection.
- Modify `PROJECT_INDEX.md`, `VERSION.md`, and ASR docs/plan: document Qwen-ASR dedicated engine and 404 root cause.

---

## Task 1: Add Qwen-ASR config contract and dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/voice-input-contract.test.js`
- Modify: `src/core/asr-config.ts`
- Modify: `src/config/asr.example.json`

**Interfaces:**
- Produces `ASRProvider = 'openai-compatible' | 'qwen-asr-realtime'`.
- Produces `ASRProviderPreset = 'openai' | 'aliyun-bailian' | 'qwen-asr' | 'custom-openai-compatible'`.
- Produces `ASRConfig.workspaceId: string`.
- Produces `ASR_PROVIDER_PRESETS['qwen-asr']` with provider `qwen-asr-realtime`, Base URL `wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`, realtime path `/api-ws/v1/realtime`, streaming mode `realtime`, empty model.

- [ ] **Step 1: Install WebSocket dependency**

Run:

```bash
npm install ws
npm install --save-dev @types/ws
```

Expected: `package.json` and `package-lock.json` include `ws` and `@types/ws`.

- [ ] **Step 2: Add failing config tests**

In `scripts/voice-input-contract.test.js`, extend ASR preset tests with assertions that `ASR_PROVIDER_PRESETS['qwen-asr']` exists, has `provider === 'qwen-asr-realtime'`, includes the workspace placeholder Base URL, uses `/api-ws/v1/realtime`, and keeps `apiKey` empty.

- [ ] **Step 3: Run test to verify RED**

Run:

```bash
npm test
```

Expected: FAIL because `qwen-asr` preset/provider are missing.

- [ ] **Step 4: Extend config types and defaults**

In `src/core/asr-config.ts`:

- add `qwen-asr-realtime` to `ASRProvider`.
- add `qwen-asr` to `ASRProviderPreset`.
- add `workspaceId: string` to `ASRConfig`.
- add `workspaceId: ''` to `DEFAULT_ASR_CONFIG`.
- normalize `workspaceId` with `normalizeString(raw.workspaceId, DEFAULT_ASR_CONFIG.workspaceId)`.
- add `qwen-asr` preset.
- preserve `workspaceId` in `applyASRProviderPreset`.

- [ ] **Step 5: Update safe example config**

Add this field to `src/config/asr.example.json`:

```json
"workspaceId": ""
```

Keep `apiKey` empty.

- [ ] **Step 6: Run verification**

Run:

```bash
npm test
npm run build
```

Expected: PASS.

---

## Task 2: Add Qwen-ASR realtime engine

**Files:**
- Create: `src/core/asr-qwen-realtime.ts`
- Modify: `src/core/asr-engine.ts`
- Modify: `scripts/voice-input-contract.test.js`

**Interfaces:**
- Produces `createQwenASRRealtimeUrl(config: ASRConfig): string`.
- Produces `createQwenASRHeaders(config: ASRConfig): Record<string, string>`.
- Produces `createQwenManualSessionUpdateEvent(): object`.
- Produces `normalizeQwenASREvent(raw: unknown, sessionId: string): ASRTranscriptEvent | null`.
- Produces `QwenASRRealtimeEngine implements ASREngine`.

- [ ] **Step 1: Add failing engine helper tests**

Add tests asserting:

- URL replaces `{WorkspaceId}` and appends `?model=<model>`.
- headers include `Authorization: Bearer <apiKey>` and `X-DashScope-WorkSpace` when `workspaceId` is set.
- manual session update returns `{ type: 'session.update', session: { turn_detection: null } }`.
- Qwen text event normalizes to partial.
- Qwen completed event normalizes to final.
- `createASREngine({ provider: 'qwen-asr-realtime', ...DEFAULT_ASR_CONFIG })` returns provider `qwen-asr-realtime`.

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
npm test
```

Expected: FAIL because `dist/core/asr-qwen-realtime.js` is missing.

- [ ] **Step 3: Implement `src/core/asr-qwen-realtime.ts`**

Implementation requirements:

- Import `WebSocket` from `ws`.
- Build URL from `baseUrl`, `workspaceId`, `realtimePath`, and `model`.
- Pass headers to WebSocket constructor.
- On open, send Manual mode session update.
- For each audio chunk, send `input_audio_buffer.append` with base64 audio.
- After chunks, send `input_audio_buffer.commit`, then `session.finish`.
- Yield partial/final/error events from Qwen server events.
- Close socket after `session.finished` or final event timeout.

- [ ] **Step 4: Wire factory**

In `src/core/asr-engine.ts`, import `QwenASRRealtimeEngine` and return it for `config.provider === 'qwen-asr-realtime'`.

- [ ] **Step 5: Run verification**

Run:

```bash
npm test
npm run build
```

Expected: PASS.

---

## Task 3: Update settings UI and docs

**Files:**
- Modify: `src/main/settings.html`
- Modify: `scripts/voice-input-contract.test.js`
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`
- Modify: `docs/superpowers/specs/2026-07-16-asr-settings-simplification-design.md`
- Modify: `docs/superpowers/plans/2026-07-16-asr-settings-simplification.md`

**Interfaces:**
- Settings produces `workspaceId` in collected ASR config.
- Settings contains `qwen-asr` preset option and note.

- [ ] **Step 1: Add failing settings tests**

Assert `settings.html` contains:

- `<option value="qwen-asr">Qwen-ASR 实时识别</option>`.
- `id="asrWorkspaceId"`.
- a note mentioning `wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`.
- `workspaceId: document.getElementById('asrWorkspaceId').value.trim()`.

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
npm test
```

Expected: FAIL because settings UI lacks Qwen fields.

- [ ] **Step 3: Update settings markup and JS**

- Add Qwen preset option.
- Add Workspace ID field near Base URL.
- Add Qwen preset definition in `asrProviderPresets`.
- Load `config.workspaceId`.
- Apply Qwen preset without filling API key.
- Collect `workspaceId`.

- [ ] **Step 4: Update docs**

Document that Qwen-ASR uses a dedicated WebSocket engine and does not use `/audio/transcriptions`.

- [ ] **Step 5: Run final verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: PASS / no whitespace errors.

- [ ] **Step 6: Commit and push**

Run:

```bash
git add package.json package-lock.json src/core/asr-config.ts src/core/asr-engine.ts src/core/asr-qwen-realtime.ts src/config/asr.example.json src/main/settings.html scripts/voice-input-contract.test.js PROJECT_INDEX.md VERSION.md docs/superpowers/specs/2026-07-16-asr-settings-simplification-design.md docs/superpowers/plans/2026-07-16-asr-settings-simplification.md docs/superpowers/plans/2026-07-16-qwen-asr-realtime-engine.md
git commit -m "feat(voice): add qwen asr realtime engine"
git push origin master
```

---

## Self-Review

- Spec coverage: Qwen-ASR gets a dedicated provider, URL/header helpers, Manual mode event flow, settings fields, tests, docs.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: `qwen-asr`, `qwen-asr-realtime`, `workspaceId`, helper names, and settings IDs match across tasks.
