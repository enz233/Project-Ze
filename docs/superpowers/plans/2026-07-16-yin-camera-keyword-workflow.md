# yin Camera Keyword Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selectively merge the `origin/yin` camera-aware workflow, `*` camera command, camera natural-language intents, and screen keyword recognition into the current Project-Ze codebase without touching Operation Guide.

**Architecture:** Keep current Project-Ze v0.3.2 as the base. Pull only camera/screen workflow changes from `origin/yin`, adapting them into the existing Intent Router, Response Workflow, Camera Awareness, main/preload/renderer IPC, and contract-test structure. Tool modules produce short-lived observations; `ChatManager.respondFromWorkflow(...)` remains the final user-visible reply boundary.

**Tech Stack:** Electron main/preload/renderer, TypeScript core modules, browser `getUserMedia`, optional browser `FaceDetector`, OpenAI-compatible Vision calls, Node contract tests in `scripts/*.test.js`, Git.

## Global Constraints

- Use Chinese for user-facing progress and summaries.
- Prefer project documents before source files; when modifying an existing module, first read the relevant documentation or ask the user.
- Do not directly run `git merge origin/yin`.
- Do not restore, continue, or refactor Operation Guide in this plan.
- Do not overwrite current v0.3.2 modules with `yin` files blindly; compare and adapt.
- Do not auto-click, auto-type, inject keyboard/mouse input, or add overlay arrows/rings.
- Do not enable camera or background detection by default.
- Do not save camera images to disk, upload continuous video, identify identity, or infer sensitive attributes.
- Do not write raw camera/screen observations to long-term memory by default.
- Preserve the existing uncommitted `.superpowers/sdd/progress.md` change unless the user explicitly approves including it in a commit.
- After each completed task, update relevant docs if behavior changed and commit only that task's files.

---

## File Structure

### New files

- `src/core/camera-awareness-background-runner.ts`
  - Owns background camera polling orchestration in core-safe form.
  - Does not call Electron or `getUserMedia` directly.
  - Requests a single frame through an injected callback and submits it to `CameraAwarenessManager.processBackgroundFrame(...)`.

- `src/core/local-face-presence-detector.ts`
  - Defines local face presence detector interfaces and Shape Detection API adapter.
  - Provides a noop fallback for unsupported environments.
  - This is a contract-tested interface for future local detection; runtime foreground gate may use renderer-side `FaceDetector` directly.

- `scripts/local-face-presence-detector-contract.test.js`
  - Verifies `local-face-presence-detector.ts` behavior with fake detectors and noop fallback.

### Existing files to modify after reading docs

Read these docs before touching the corresponding existing modules:

- `docs/camera-awareness-core.md` before modifying `src/core/camera-awareness-*`, `src/core/vision-image-analyzer.ts`, camera IPC, settings, or renderer camera capture.
- `docs/intent-router.md` before modifying `src/core/intent-*`.
- `docs/response-workflow-orchestrator.md` before modifying `src/core/response-workflow-*`, `src/core/chat-manager.ts`, or `src/core/screen-target-pointer.ts`.
- `docs/superpowers/specs/2026-07-16-yin-camera-keyword-workflow-design.md` before any task in this plan.

Planned existing-file responsibilities:

- `src/core/camera-awareness-types.ts`
  - Extend frame source, IPC constants, foreground face gate metadata, reasons, and config types.

- `src/core/camera-awareness-config.ts`
  - Add foreground gate defaults and config normalization/migration.

- `src/core/camera-awareness-manager.ts`
  - Add foreground gate handling and background error recording.

- `src/core/vision-image-analyzer.ts`
  - Add camera prompt analysis, camera visual query, prompt builders, reply cleaners, and background-face prompt guidance.

- `src/core/intent-types.ts`
  - Add `camera_visual_query` intent.

- `src/core/intent-classifier.ts`
  - Add camera visual query rules and screen-summary keyword rules with correct priority.

- `src/core/intent-router.ts`
  - Add required capabilities for `camera_visual_query`.

- `src/core/intent-executor.ts`
  - Dispatch `cameraVisualQuery` handler.

- `src/core/response-workflow-types.ts`
  - Add camera workflow response and observation types.

- `src/core/response-workflow-orchestrator.ts`
  - Convert screen/camera tool results into workflow context and call chat responder.

- `src/core/chat-manager.ts`
  - Add `*` camera command path, camera prompt analyzer injection, and workflow final-response handling without duplicate bubbles.

- `src/core/screen-target-pointer.ts`
  - Add `suppressResultBubble` option for workflow-controlled final wording.

- `src/main/main.ts`
  - Wire background runner, camera prompt capture, camera intent capture, camera visual workflow, debug logging, and runner sync on config update.

- `src/main/preload.ts`
  - Expose camera capture request/submit APIs for prompt and background frames.

- `src/main/settings.html`
  - Stop owning background polling; let main runner own it.
  - Keep settings test and preview behavior.

- `src/renderer/renderer.ts`
  - Capture one-shot camera frames for prompt/background/intent-command sources, close tracks, optionally run foreground face gate for background frames.

- `scripts/camera-awareness-contract.test.js`
  - Cover background runner, IPC constants, foreground gate, prompt helpers, and debug wiring.

- `scripts/intent-router-contract.test.js`
  - Cover camera visual query and screen keyword routing.

- `scripts/response-workflow-contract.test.js`
  - Cover screen and camera workflow response paths.

- `README.md`, `PROJECT_INDEX.md`, `VERSION.md`, `docs/camera-awareness-core.md`, `docs/response-workflow-orchestrator.md`, `docs/intent-router.md`
  - Update user-visible commands, architecture index, release notes, and module docs.

---

### Task 1: Bring in new camera foundation files and contract tests

**Files:**
- Create: `src/core/camera-awareness-background-runner.ts`
- Create: `src/core/local-face-presence-detector.ts`
- Create: `scripts/local-face-presence-detector-contract.test.js`
- Modify: `scripts/camera-awareness-contract.test.js`

**Interfaces:**
- Consumes: existing `CameraAwarenessConfig`, `CameraAwarenessSnapshot`, `CameraFrameInput`, and `CameraAwarenessManager.processBackgroundFrame(frame)`.
- Produces:
  - `CameraAwarenessBackgroundRunner` class with constructor `{ getConfig, requestFrame, processFrame, recordError, getNow?, setTimer?, clearTimer? }` compatible with main-process wiring.
  - `LocalFacePresenceDetector` interface with `isAvailable(): Promise<boolean>` and `detect(frame: unknown): Promise<LocalFacePresenceResult>`.

- [ ] **Step 1: Read required docs before source changes**

Run:

```bash
# Read these using the Read tool, not shell cat:
# docs/superpowers/specs/2026-07-16-yin-camera-keyword-workflow-design.md
# docs/camera-awareness-core.md
```

Expected: You understand current camera core boundary and confirm Operation Guide is out of scope.

- [ ] **Step 2: Copy only new files from `origin/yin`**

Run:

```bash
git checkout origin/yin -- src/core/camera-awareness-background-runner.ts src/core/local-face-presence-detector.ts scripts/local-face-presence-detector-contract.test.js
```

Expected: the three files become untracked/modified in the working tree; no existing module is overwritten.

- [ ] **Step 3: Inspect copied public interfaces**

Run:

```bash
git diff -- src/core/camera-awareness-background-runner.ts src/core/local-face-presence-detector.ts scripts/local-face-presence-detector-contract.test.js
```

Expected: new files only. Confirm no imports reference Operation Guide.

- [ ] **Step 4: Write failing camera runner contract in `scripts/camera-awareness-contract.test.js`**

Append/merge checks equivalent to this exact block, adapted to the current helper style in that file:

```js
const runnerSource = fs.readFileSync(path.join(root, 'src/core/camera-awareness-background-runner.ts'), 'utf8');
assertIncludes(runnerSource, 'export class CameraAwarenessBackgroundRunner', 'background runner class should be exported');
assertIncludes(runnerSource, 'sync()', 'background runner should expose sync()');
assertIncludes(runnerSource, 'requestFrame', 'background runner should request frames through injected callback');
assertIncludes(runnerSource, 'processFrame', 'background runner should process returned frames through injected callback');
assertIncludes(runnerSource, 'recordError', 'background runner should record capture errors without changing presence state');
```

- [ ] **Step 5: Run the focused tests and verify expected failure or pass**

Run:

```bash
node scripts/local-face-presence-detector-contract.test.js
node scripts/camera-awareness-contract.test.js
```

Expected: `local-face-presence-detector` passes after copy. `camera-awareness-contract` may fail because existing types/config do not yet include all referenced runner/gate symbols; failures are acceptable and become Task 2 inputs.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git status --short
git add src/core/camera-awareness-background-runner.ts src/core/local-face-presence-detector.ts scripts/local-face-presence-detector-contract.test.js scripts/camera-awareness-contract.test.js
git commit -m "feat: add camera background runner foundation"
```

Expected: commit succeeds and does not include `.superpowers/sdd/progress.md`.

---

### Task 2: Extend camera types, config, manager, and Vision analyzer

**Files:**
- Modify: `src/core/camera-awareness-types.ts`
- Modify: `src/core/camera-awareness-config.ts`
- Modify: `src/core/camera-awareness-manager.ts`
- Modify: `src/core/vision-image-analyzer.ts`
- Modify: `scripts/camera-awareness-contract.test.js`

**Interfaces:**
- Consumes: Task 1 runner and current camera manager.
- Produces:
  - `CameraFrameSource = 'settings-test' | 'background' | 'chat-command' | 'intent-command'`.
  - `CameraForegroundFaceGateResult` metadata on background frames.
  - Config fields `foregroundFaceGateEnabled`, `foregroundFaceMinHeightRatio`, `foregroundFaceMinAreaRatio`.
  - `CameraAwarenessManager.recordBackgroundError(error: unknown): CameraAwarenessSnapshot`.
  - `VisionImageAnalyzer.analyzeCameraPrompt(frame, prompt)` and `VisionImageAnalyzer.analyzeCameraVisualQuery(frame, userText)`.

- [ ] **Step 1: Read required docs and compare `yin` diff**

Run:

```bash
git diff master...origin/yin -- src/core/camera-awareness-types.ts src/core/camera-awareness-config.ts src/core/camera-awareness-manager.ts src/core/vision-image-analyzer.ts scripts/camera-awareness-contract.test.js
```

Expected: see only camera-related diffs; do not apply Operation Guide changes.

- [ ] **Step 2: Add failing contract checks for camera sources and foreground gate**

Add checks in `scripts/camera-awareness-contract.test.js`:

```js
assertIncludes(typesSource, "'chat-command'", 'camera frame source should include chat-command for * prompt analysis');
assertIncludes(typesSource, "'intent-command'", 'camera frame source should include intent-command for intent workflow capture');
assertIncludes(typesSource, 'foregroundFaceGate', 'camera frame input should allow foreground face gate metadata');
assertIncludes(configSource, 'foregroundFaceGateEnabled', 'config should include foreground face gate switch');
assertIncludes(configSource, 'foregroundFaceMinHeightRatio', 'config should include foreground face height threshold');
assertIncludes(configSource, 'foregroundFaceMinAreaRatio', 'config should include foreground face area threshold');
assertIncludes(managerSource, 'recordBackgroundError', 'manager should record background capture errors');
assertIncludes(visionSource, 'analyzeCameraPrompt', 'vision analyzer should support * camera prompt analysis');
assertIncludes(visionSource, 'analyzeCameraVisualQuery', 'vision analyzer should support natural-language camera visual queries');
```

- [ ] **Step 3: Run test to verify it fails before implementation**

Run:

```bash
node scripts/camera-awareness-contract.test.js
```

Expected: FAIL with missing `chat-command`, `intent-command`, foreground gate, or analyzer method text.

- [ ] **Step 4: Implement minimal adapted changes from `origin/yin`**

Use the `origin/yin` versions as reference, but manually merge into current files. Preserve current names and existing v0.3.2 behavior. Required exact defaults:

```ts
foregroundFaceGateEnabled: true,
foregroundFaceMinHeightRatio: 0.05,
foregroundFaceMinAreaRatio: 0.0012,
```

Required behavior:

```ts
// Background-only gate rule:
// - if frame.source !== 'background', ignore foregroundFaceGate
// - if gate says no sufficiently large foreground face, return absent/no_person_visible without calling Vision
// - if gate unavailable/error/uncertain, continue existing Vision path
```

Required prompt constraints for camera visual query and prompt analysis:

```txt
Do not identify the person. Do not infer age, gender, race, ethnicity, health, or sensitive attributes. Do not describe private background details unless directly relevant to the user's explicit question. Return concise, helpful Chinese text.
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node scripts/camera-awareness-contract.test.js
node scripts/local-face-presence-detector-contract.test.js
```

Expected: both PASS.

- [ ] **Step 6: Build TypeScript**

Run:

```bash
npm run build
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git status --short
git add src/core/camera-awareness-types.ts src/core/camera-awareness-config.ts src/core/camera-awareness-manager.ts src/core/vision-image-analyzer.ts scripts/camera-awareness-contract.test.js
git commit -m "feat: extend camera awareness workflow core"
```

Expected: commit excludes `.superpowers/sdd/progress.md`.

---

### Task 3: Add camera and screen intent classification contracts

**Files:**
- Modify: `src/core/intent-types.ts`
- Modify: `src/core/intent-classifier.ts`
- Modify: `src/core/intent-router.ts`
- Modify: `src/core/intent-executor.ts`
- Modify: `scripts/intent-router-contract.test.js`

**Interfaces:**
- Consumes: current Intent Router architecture.
- Produces:
  - intent type `camera_visual_query`.
  - executor handler key `cameraVisualQuery`.
  - capability requirement for camera visual query: `camera_frame`, `vision`, `llm`.
  - screen summary keyword routing for explicit screen phrases and short screen-context phrases.

- [ ] **Step 1: Read required docs and compare `yin` diff**

Use Read tool for `docs/intent-router.md`, then run:

```bash
git diff master...origin/yin -- src/core/intent-types.ts src/core/intent-classifier.ts src/core/intent-router.ts src/core/intent-executor.ts scripts/intent-router-contract.test.js
```

Expected: identify camera visual and screen keyword changes.

- [ ] **Step 2: Add failing contract cases**

In `scripts/intent-router-contract.test.js`, add cases equivalent to:

```js
assertIntent('看看我在不在', 'camera_check_once');
assertIntent('检测一下摄像头状态', 'camera_check_once');
assertIntent('看看我手里拿的是什么', 'camera_visual_query');
assertIntent('镜头里有什么', 'camera_visual_query');
assertIntent('看看我今天穿的衣服是什么颜色', 'camera_visual_query');
assertIntent('看看屏幕', 'screen_summary');
assertIntent('看一下当前屏幕', 'screen_summary');
assertIntent('你看看这个', 'screen_summary');
assertIntent('这是什么意思', 'screen_summary');
assertIntent('上面写了什么', 'screen_summary');
assertIntent('截个屏看看', 'screen_summary');
assertIntent('帮我找下载按钮', 'screen_target_pointer');
```

Also add source-text checks if the script is static-text based:

```js
assertIncludes(intentTypesSource, 'camera_visual_query', 'intent types should include camera_visual_query');
assertIncludes(intentRouterSource, 'camera_frame', 'camera visual query should require camera frame capability');
assertIncludes(intentExecutorSource, 'cameraVisualQuery', 'intent executor should dispatch camera visual query handler');
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
node scripts/intent-router-contract.test.js
```

Expected: FAIL before implementation for missing `camera_visual_query` or screen keyword routes.

- [ ] **Step 4: Implement classifier and router changes**

Rules to implement exactly:

```txt
Camera priority:
- Text containing 镜头, 摄像头, 我在不在, 我是不是在镜头, 手里拿, 我穿, 衣服颜色 routes to camera intent.
- Presence phrases route to camera_check_once.
- Open visual camera questions route to camera_visual_query.

Screen priority:
- Text containing 屏幕, 桌面, 页面, 窗口, 截图 routes to screen_summary unless it is a target-pointer phrase.
- Short phrases 你看看这个, 这是什么意思, 上面写了什么 route to screen_summary.

Target priority:
- Existing 帮我找, 指出, 在哪 target phrases keep routing to screen_target_pointer.
```

Add `camera_visual_query` capabilities in router:

```ts
['camera_frame', 'vision', 'llm']
```

Add executor dispatch handler name:

```ts
cameraVisualQuery
```

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
node scripts/intent-router-contract.test.js
npm run build
```

Expected: both PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add src/core/intent-types.ts src/core/intent-classifier.ts src/core/intent-router.ts src/core/intent-executor.ts scripts/intent-router-contract.test.js
git commit -m "feat: route camera and screen keyword intents"
```

Expected: commit only intent-related files.

---

### Task 4: Extend Response Workflow for camera observations

**Files:**
- Modify: `src/core/response-workflow-types.ts`
- Modify: `src/core/response-workflow-orchestrator.ts`
- Modify: `src/core/screen-target-pointer.ts`
- Modify: `src/core/chat-manager.ts`
- Modify: `scripts/response-workflow-contract.test.js`

**Interfaces:**
- Consumes: Task 2 analyzer outputs and Task 3 intents.
- Produces:
  - workflow response types `camera_check_once_response` and `camera_visual_query_response`.
  - observation types `camera_presence` and `camera_visual`.
  - `ScreenTargetPointer.handle(..., { suppressResultBubble: true })` support.
  - `ChatManager.respondFromWorkflow(context)` as the single final wording path for workflow observations.

- [ ] **Step 1: Read docs and compare `yin` diff**

Use Read tool for `docs/response-workflow-orchestrator.md`, then run:

```bash
git diff master...origin/yin -- src/core/response-workflow-types.ts src/core/response-workflow-orchestrator.ts src/core/screen-target-pointer.ts src/core/chat-manager.ts scripts/response-workflow-contract.test.js
```

Expected: identify camera observation and duplicate-bubble prevention changes.

- [ ] **Step 2: Add failing workflow contracts**

In `scripts/response-workflow-contract.test.js`, add static or behavioral checks equivalent to:

```js
assertIncludes(typesSource, 'camera_check_once_response', 'workflow types should include camera check response');
assertIncludes(typesSource, 'camera_visual_query_response', 'workflow types should include camera visual query response');
assertIncludes(typesSource, 'camera_presence', 'workflow observations should include camera presence');
assertIncludes(typesSource, 'camera_visual', 'workflow observations should include camera visual');
assertIncludes(orchestratorSource, 'respondFromWorkflow', 'orchestrator should delegate final wording to chat responder');
assertIncludes(orchestratorSource, 'camera_presence', 'orchestrator should build camera presence observations');
assertIncludes(orchestratorSource, 'camera_visual', 'orchestrator should build camera visual observations');
assertIncludes(screenTargetPointerSource, 'suppressResultBubble', 'screen target pointer should allow workflow to suppress old result bubble');
assertIncludes(chatManagerSource, 'respondFromWorkflow', 'chat manager should expose workflow reply entry');
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
node scripts/response-workflow-contract.test.js
```

Expected: FAIL before implementation for missing camera workflow strings.

- [ ] **Step 4: Implement workflow types and orchestrator changes**

Required observation shape semantics:

```ts
// camera_presence observation includes presence, confidence, affect, reason, checkedAt
// camera_visual observation includes userText, answer/summary text, confidence or reason when available
// raw imageBase64 is not included in WorkflowResponseContext
```

Required final reply boundary:

```txt
ResponseWorkflowOrchestrator builds WorkflowResponseContext and calls ChatManager.respondFromWorkflow(...). Screen/camera modules do not send final user wording directly when workflow owns the response.
```

Add `suppressResultBubble` option to screen target pointer so workflow can avoid duplicate result bubbles.

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
node scripts/response-workflow-contract.test.js
npm run build
```

Expected: both PASS.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add src/core/response-workflow-types.ts src/core/response-workflow-orchestrator.ts src/core/screen-target-pointer.ts src/core/chat-manager.ts scripts/response-workflow-contract.test.js
git commit -m "feat: add camera response workflow"
```

Expected: commit only workflow-related files.

---

### Task 5: Wire main, preload, settings, and renderer camera capture

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/main/settings.html`
- Modify: `src/renderer/renderer.ts`
- Modify: `scripts/camera-awareness-contract.test.js`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces:
  - main-process `CameraAwarenessBackgroundRunner` instance.
  - prompt capture request/submit bridge for `*` command.
  - intent-command frame capture bridge for natural-language camera intents.
  - background frame capture request/submit bridge with optional foreground face gate metadata.
  - settings save triggers runner sync; settings page no longer owns persistent background interval.

- [ ] **Step 1: Read docs and compare `yin` diff**

Use Read tool for `docs/camera-awareness-core.md`, then run:

```bash
git diff master...origin/yin -- src/main/main.ts src/main/preload.ts src/main/settings.html src/renderer/renderer.ts scripts/camera-awareness-contract.test.js
```

Expected: understand IPC names, request maps, and renderer capture flow.

- [ ] **Step 2: Add failing IPC/capture contract checks**

Add checks in `scripts/camera-awareness-contract.test.js`:

```js
assertIncludes(preloadSource, 'onBackgroundCaptureRequest', 'preload should expose background capture request listener');
assertIncludes(preloadSource, 'submitBackgroundFrame', 'preload should expose background frame submitter');
assertIncludes(preloadSource, 'onPromptCaptureRequest', 'preload should expose prompt capture request listener');
assertIncludes(preloadSource, 'submitPromptFrame', 'preload should expose prompt frame submitter');
assertIncludes(mainSource, 'CameraAwarenessBackgroundRunner', 'main should instantiate background runner');
assertIncludes(mainSource, 'requestCameraIntentFrame', 'main should request intent-command camera frames');
assertIncludes(mainSource, 'cameraVisualQuery', 'main should wire camera visual query handler');
assertIncludes(rendererSource, 'intent-command', 'renderer should support intent-command camera frame source');
assertIncludes(rendererSource, 'foregroundFaceGate', 'renderer should attach foreground face gate metadata for background frames');
assertIncludes(settingsSource, 'backgroundDetectionEnabled', 'settings should still save background detection config');
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
node scripts/camera-awareness-contract.test.js
```

Expected: FAIL for missing IPC/capture wiring.

- [ ] **Step 4: Implement main/preload/renderer/settings wiring**

Required capture behavior:

```txt
- renderer opens camera only for one frame for chat-command, intent-command, and background requests.
- renderer closes all media tracks after drawing frame.
- background captures may attach foregroundFaceGate metadata.
- prompt/intent captures do not use foregroundFaceGate as a blocker.
- main maps requestId to pending Promise and times out capture failures.
- main calls CameraAwarenessManager.recordBackgroundError(...) when background capture fails.
- settings page saves config; main runner owns repeated scheduling.
```

Required debug output semantics:

```txt
[CameraAwareness] person: yes | state: present | reason: person_visible | source: background | face: yes height 5.6%, area 0.14% | confidence: 92%
[CameraAwareness] capture failed | state: present | error: permission denied
```

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
node scripts/camera-awareness-contract.test.js
npm run build
```

Expected: both PASS.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add src/main/main.ts src/main/preload.ts src/main/settings.html src/renderer/renderer.ts scripts/camera-awareness-contract.test.js
git commit -m "feat: wire camera capture workflow"
```

Expected: commit only IPC/UI wiring and related test.

---

### Task 6: Add `*` command path and final integration behavior

**Files:**
- Modify: `src/core/chat-manager.ts`
- Modify: `src/main/main.ts`
- Modify: `scripts/camera-awareness-contract.test.js`
- Modify: `scripts/response-workflow-contract.test.js`

**Interfaces:**
- Consumes: Task 2 analyzer, Task 4 workflow, Task 5 camera capture bridge.
- Produces:
  - `ChatManager.setCameraPromptAnalyzer(...)` or equivalent injection.
  - `*` message branch that requests `chat-command` frame and sends camera prompt analysis through final user-visible reply path.

- [ ] **Step 1: Compare relevant `yin` diff**

Run:

```bash
git diff master...origin/yin -- src/core/chat-manager.ts src/main/main.ts scripts/camera-awareness-contract.test.js scripts/response-workflow-contract.test.js
```

Expected: identify `*` branch and analyzer injection without copying unrelated chat behavior.

- [ ] **Step 2: Add failing tests for `*` command path**

Add checks:

```js
assertIncludes(chatManagerSource, "startsWith('*')", 'chat manager should recognize * camera command');
assertIncludes(chatManagerSource, 'setCameraPromptAnalyzer', 'chat manager should accept camera prompt analyzer injection');
assertIncludes(mainSource, 'setCameraPromptAnalyzer', 'main should inject camera prompt analyzer into chat manager');
assertIncludes(mainSource, 'chat-command', 'main prompt analyzer should request chat-command camera frames');
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
node scripts/camera-awareness-contract.test.js
node scripts/response-workflow-contract.test.js
```

Expected: FAIL before implementation if `*` path is absent.

- [ ] **Step 4: Implement `*` command path**

Required semantics:

```txt
- `*` alone means a short friendly camera prompt.
- `*文本` uses 文本 as the user prompt for the captured frame.
- It records an interaction type equivalent to camera-analysis if current memory API supports it.
- If Vision is not configured or capture fails, show a concise actionable error.
- It must not start background detection.
- It must not write raw image data to memory.
```

- [ ] **Step 5: Run integration tests and build**

Run:

```bash
node scripts/camera-awareness-contract.test.js
node scripts/response-workflow-contract.test.js
npm run build
```

Expected: all PASS.

- [ ] **Step 6: Commit Task 6**

Run:

```bash
git add src/core/chat-manager.ts src/main/main.ts scripts/camera-awareness-contract.test.js scripts/response-workflow-contract.test.js
git commit -m "feat: add camera prompt command"
```

Expected: commit only `*` command integration files.

---

### Task 7: Update documentation and package test coverage

**Files:**
- Modify: `README.md`
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`
- Modify: `docs/camera-awareness-core.md`
- Modify: `docs/intent-router.md`
- Modify: `docs/response-workflow-orchestrator.md`
- Modify: `package.json` if and only if tests added in this plan are not already included in `npm test`.

**Interfaces:**
- Consumes: completed runtime behavior from Tasks 1-6.
- Produces: accurate user and maintainer documentation.

- [ ] **Step 1: Compare `yin` docs but do not copy blindly**

Run:

```bash
git diff master...origin/yin -- README.md docs/camera-awareness-core.md package.json
```

Expected: identify relevant user docs and `npm test` additions.

- [ ] **Step 2: Update README usage table**

Add or update rows equivalent to:

```md
| `*` 开头消息 | 摄像头单帧分析；可直接输入 `*` 或 `*看看我手里拿的是什么` |
| 自然语言“看看屏幕/你看看这个/这是什么意思” | 触发屏幕总结 workflow |
| 自然语言“看看我在不在/镜头里有什么” | 用户主动触发摄像头单帧检查或视觉查询 |
```

- [ ] **Step 3: Update PROJECT_INDEX module notes**

Update camera, intent, response workflow, main/preload/renderer notes with exact status:

```md
- `camera-awareness-background-runner.ts`：主进程注入取帧回调的后台低频检测调度器，设置启用后按间隔请求 renderer 单帧，不直接打开摄像头。
- `local-face-presence-detector.ts`：本地人脸存在检测接口与 Shape Detection API 适配器；不做身份识别或敏感属性推断。
- `Intent Router`：支持摄像头人在/不在检查、摄像头视觉查询，以及“看看屏幕/你看看这个”等屏幕总结关键词。
- `Response Workflow Orchestrator`：支持 screen_summary、screen_target_pointer、camera_presence、camera_visual observation 统一回复。
```

- [ ] **Step 4: Update VERSION Unreleased**

Add bullets:

```md
- 摄像头关键词 workflow：新增 `*` 摄像头单帧命令、自然语言摄像头人在/不在检查、摄像头视觉查询，并将摄像头 observation 接入 Response Workflow 统一生成 Ze 风格回复。
- 屏幕识别关键词增强：自然语言“看看屏幕 / 你看看这个 / 这是什么意思 / 上面写了什么 / 截图分析”等可进入屏幕总结 workflow。
- 摄像头后台低频检测收束到主进程 runner，并新增后台前景人脸 gate 与终端 debug 输出；默认仍关闭，不保存图片，不做身份识别。
```

- [ ] **Step 5: Update module docs**

Update:

```txt
docs/camera-awareness-core.md
docs/intent-router.md
docs/response-workflow-orchestrator.md
```

Required content:

```md
- camera frame sources include settings-test, background, chat-command, intent-command.
- background runner owns repeated scheduling; settings page does not.
- foreground face gate only affects background frames.
- camera_visual_query and camera_check_once require explicit user intent and camera_frame permission.
- workflow observations are short-lived and raw images are not stored.
```

- [ ] **Step 6: Ensure `npm test` includes new tests**

Check `package.json`. If `scripts/local-face-presence-detector-contract.test.js` is not included, update test script so it runs. Keep existing tests.

Expected `npm test` includes at least:

```json
"test": "npm run build && node scripts/voice-input-contract.test.js && node scripts/screen-fingerprint-contract.test.js && node scripts/screen-capture-frame-contract.test.js && node scripts/screen-pointer-debug-contract.test.js && node scripts/screen-vision-request-contract.test.js && node scripts/point-visual-guard-contract.test.js && node scripts/intent-router-contract.test.js && node scripts/response-workflow-contract.test.js && node scripts/camera-awareness-contract.test.js && node scripts/local-face-presence-detector-contract.test.js"
```

If current ordering differs, preserve current tests and add missing camera tests at the end.

- [ ] **Step 7: Run full validation**

Run:

```bash
npm run build
npm test
node scripts/camera-awareness-contract.test.js
node scripts/local-face-presence-detector-contract.test.js
node scripts/intent-router-contract.test.js
node scripts/response-workflow-contract.test.js
```

Expected: all PASS.

- [ ] **Step 8: Commit Task 7**

Run:

```bash
git add README.md PROJECT_INDEX.md VERSION.md docs/camera-awareness-core.md docs/intent-router.md docs/response-workflow-orchestrator.md package.json
git commit -m "docs: document camera keyword workflow"
```

Expected: commit docs and optional package test update only.

---

### Task 8: Final verification and git hygiene

**Files:**
- Modify only if verification reveals documentation mismatch.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: final verified state with no accidental Operation Guide or `.superpowers/sdd/progress.md` commit.

- [ ] **Step 1: Check final diff and history**

Run:

```bash
git status --short
git log --oneline -10
git diff --name-only origin/yin -- docs src scripts package.json README.md PROJECT_INDEX.md VERSION.md
```

Expected:

```txt
- git status may still show .superpowers/sdd/progress.md as modified.
- No Operation Guide source files are modified by this plan.
- Recent commits are task-sized and camera/workflow focused.
```

- [ ] **Step 2: Run final verification**

Run:

```bash
npm run build
npm test
```

Expected: both PASS.

- [ ] **Step 3: Optional app smoke test if environment allows**

Run:

```bash
npm start
```

Expected: Electron starts. Manual checks:

```txt
- `*` asks for camera permission and returns a camera analysis or configuration error.
- “看看我在不在” routes to one-shot camera check.
- “看看我手里拿的是什么” routes to camera visual query.
- “看看屏幕” routes to screen summary.
- “帮我找下载按钮” still routes to screen target pointer.
```

If the app cannot be smoke-tested in the current environment, record that it was skipped and why in the final user summary.

- [ ] **Step 4: Final docs consistency check**

Run:

```bash
git grep -n "Operation Guide" -- README.md PROJECT_INDEX.md VERSION.md docs | head -20
git grep -n "camera_visual_query\|chat-command\|intent-command\|foregroundFaceGate\|\*`" -- README.md PROJECT_INDEX.md VERSION.md docs/camera-awareness-core.md docs/intent-router.md docs/response-workflow-orchestrator.md
```

Expected: Operation Guide references remain only existing paused-status documentation; camera docs mention new features.

- [ ] **Step 5: Commit any verification doc correction**

Only if Step 4 required corrections:

```bash
git add README.md PROJECT_INDEX.md VERSION.md docs/camera-awareness-core.md docs/intent-router.md docs/response-workflow-orchestrator.md
git commit -m "docs: correct camera workflow verification notes"
```

Expected: no commit if no corrections were needed.

---

## Self-Review

### Spec coverage

- `*` camera command: Task 6, documented in Task 7.
- Natural-language camera check: Task 3 classification, Task 5 frame capture, Task 4 workflow.
- Natural-language camera visual query: Task 2 analyzer, Task 3 classification, Task 4 workflow, Task 5 wiring.
- Screen keyword recognition: Task 3 classification, Task 4 workflow coverage, Task 7 docs.
- Response Workflow final reply boundary: Task 4 and Task 6.
- Background runner: Task 1 foundation, Task 5 wiring, Task 7 docs.
- Foreground face gate: Task 2 core, Task 5 renderer metadata, Task 7 docs.
- Privacy constraints: Global Constraints, Task 2 prompt constraints, Task 5 capture behavior, Task 7 docs.
- Operation Guide exclusion: Global Constraints, Task 8 git hygiene.
- Git hygiene and existing `.superpowers/sdd/progress.md`: Global Constraints, each commit step, Task 8.

### Placeholder scan

No placeholder markers or unspecified edge-handling steps remain. Each task has concrete files, commands, expected outcomes, and commit messages.

### Type consistency

The plan consistently uses:

- `camera_visual_query` for the new intent.
- `cameraVisualQuery` for executor handler injection.
- `camera_check_once_response` and `camera_visual_query_response` for workflow response types.
- `camera_presence` and `camera_visual` for workflow observations.
- `chat-command`, `intent-command`, `background`, and `settings-test` for camera frame sources.
- `foregroundFaceGate` for background face gate metadata.
