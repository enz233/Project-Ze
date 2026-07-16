# Operation Guide Fusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working minimal Project-Chen Operation Guide feature inside Project-Ze without replacing existing screen, voice, camera, memory, TTS, or packaging modules.

**Architecture:** Add a focused `operation-guide-*` core domain, route explicit guide intents through the existing Intent Router and Intent Executor, and reuse current `ScreenTargetPointer` for locating and pointing at each step. The first implementation must produce a real start/next/reidentify/exit loop with fallback planning, then add a small settings/config and renderer panel layer without importing Project-Chen MIDL peripherals.

**Tech Stack:** Electron 42, TypeScript 6, CommonJS, existing `JsonConfigStore<T>`, existing Intent Router, existing `ScreenTargetPointer`, Node contract tests under `scripts/` after `npm run build`.

## Global Constraints

- Work from current Project-Ze v0.3.2 as the stable base.
- Do not replace `ScreenAnalyzer`, `ScreenTargetPointer`, `MoveController`, `IntentRouter`, `ResponseWorkflowOrchestrator`, `ChatManager`, ASR, TTS, Camera Awareness, Memory, packaging, or installer modules.
- Do not migrate Project-Chen MIDL README positioning, Algorithm 3, self-elevation, `start.exe`, visibility watchdog, green-build scripts, global hooks, wheel IPC, automatic clicking, automatic input, red circles, rectangles, or overlay arrows.
- Operation Guide must be a real functional loop: enable/configure, start from explicit text or settings test input, generate plan or fallback, point to current target, next, reidentify, exit.
- API keys and runtime guide config must live under Electron `userData/config`, not in the repository.
- Search results, planner raw output, screenshots, and screen observations are untrusted short-lived runtime data and must not be saved to long-term memory.
- Prefer docs and existing project index first; read source only when needed for exact integration.
- Update documentation and commit after implementation.

---

## File Structure

Create:

- `src/core/operation-guide-types.ts` — shared Operation Guide data model.
- `src/core/operation-guide-intent.ts` — pure natural-language parsing helpers.
- `src/core/operation-guide-config.ts` — `JsonConfigStore`-based runtime config manager and normalization.
- `src/core/operation-guide-planner.ts` — fallback plan builder, guide plan JSON parser, optional OpenAI-compatible planner call.
- `src/core/operation-guide-progress-evaluator.ts` — safe progress JSON parser and future evaluator contract.
- `src/core/operation-guide-manager.ts` — state machine, session guard, step pointing orchestration.
- `scripts/operation-guide-contract.test.js` — contract tests for domain parsing, planner, config normalization, and manager state.
- `docs/operation-guide.md` — user/developer documentation.

Modify:

- `src/core/intent-types.ts` — add guide intent kinds, capability, and `operationGuide` decision payload.
- `src/core/intent-classifier.ts` — call guide intent helpers before screen/chat rules.
- `src/core/intent-router.ts` — add guide capability gating and disabled-by-default option.
- `src/core/intent-executor.ts` — add guide handlers.
- `src/core/chat-manager.ts` — ensure guide intents can route before normal chat AI config blocks fallback-only guide flows, or document if not needed after main IPC integration.
- `src/main/main.ts` — instantiate config/manager, wire intent handlers, add IPC, emit snapshots.
- `src/main/preload.ts` — expose `window.companion.operationGuide` API.
- `src/main/settings.html` — add minimal Operation Guide settings section.
- `src/renderer/index.html` — add guide panel markup.
- `src/renderer/renderer.ts` — render snapshots and handle guide panel buttons/click-through.
- `src/renderer/style.css` — style guide panel without broad pointer capture.
- `scripts/intent-router-contract.test.js` — add intent/router/executor guide coverage.
- `package.json` — include `operation-guide-contract.test.js` in `npm test`.
- `README.md`, `PROJECT_INDEX.md`, `VERSION.md` — document Unreleased Operation Guide.

---

### Task 1: Operation Guide Pure Domain and Tests

**Files:**
- Create: `src/core/operation-guide-types.ts`
- Create: `src/core/operation-guide-intent.ts`
- Create: `src/core/operation-guide-planner.ts`
- Create: `src/core/operation-guide-progress-evaluator.ts`
- Create: `scripts/operation-guide-contract.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `OperationGuideAction`, `OperationGuideStep`, `OperationGuidePlan`, `OperationGuideSnapshot`.
  - `extractOperationGuideSoftwareName(text: string): string | null`.
  - `getOperationGuideControlCommand(text: string): 'next' | 'reidentify' | 'exit' | null`.
  - `buildFallbackPlan(softwareName: string): OperationGuidePlan`.
  - `parseGuidePlan(raw: string, fallbackSoftwareName: string): OperationGuidePlan`.
  - `parseProgressEvaluation(raw: string): OperationGuideProgressEvaluation`.

- [ ] **Step 1: Write failing contract tests**

Create `scripts/operation-guide-contract.test.js` with tests like:

```js
const assert = require('assert');
const { buildFallbackPlan, parseGuidePlan } = require('../dist/core/operation-guide-planner');
const { extractOperationGuideSoftwareName, getOperationGuideControlCommand } = require('../dist/core/operation-guide-intent');
const { parseProgressEvaluation } = require('../dist/core/operation-guide-progress-evaluator');

function testNaturalGuideIntentStartsGuide() {
  assert.strictEqual(extractOperationGuideSoftwareName('/guide Codex'), 'Codex');
  assert.strictEqual(extractOperationGuideSoftwareName('我想下载 Steam，下一步怎么做？'), 'Steam');
  assert.strictEqual(extractOperationGuideSoftwareName('帮我安装 Claude 客户端'), 'Claude 客户端');
  assert.strictEqual(extractOperationGuideSoftwareName('怎么配置 VS Code'), 'VS Code');
  assert.strictEqual(extractOperationGuideSoftwareName('今天聊聊 Steam 新闻'), null);
}

function testGuideControlCommands() {
  assert.strictEqual(getOperationGuideControlCommand('我完成了'), 'next');
  assert.strictEqual(getOperationGuideControlCommand('下一步'), 'next');
  assert.strictEqual(getOperationGuideControlCommand('重新识别'), 'reidentify');
  assert.strictEqual(getOperationGuideControlCommand('没指准'), 'reidentify');
  assert.strictEqual(getOperationGuideControlCommand('退出教程'), 'exit');
  assert.strictEqual(getOperationGuideControlCommand('停止指引'), 'exit');
  assert.strictEqual(getOperationGuideControlCommand('我想下载 Steam'), null);
}

function testParseGuidePlanFromJsonEnvelope() {
  const raw = 'Here is JSON:\n' + JSON.stringify({
    softwareName: 'Claude',
    sourceSummary: 'official docs',
    steps: [
      { id: 'a', action: 'click', target: 'Download button', instruction: 'Click Download.', expectedChange: 'Download page opens' },
      { id: 'b', action: 'invalid-action', target: 'Email input', instruction: 'Type your email.' },
      { id: 'c', action: 'click', instruction: 'Missing target.' }
    ]
  });
  const plan = parseGuidePlan(raw, 'Fallback');
  assert.strictEqual(plan.softwareName, 'Claude');
  assert.strictEqual(plan.steps.length, 2);
  assert.strictEqual(plan.steps[1].action, 'click');
}

function testFallbackPlan() {
  const plan = buildFallbackPlan('Steam');
  assert.strictEqual(plan.softwareName, 'Steam');
  assert.ok(plan.steps.length >= 4);
  assert.ok(plan.steps.length <= 12);
  assert.ok(plan.steps.every(step => step.target && step.instruction));
  assert.ok(plan.steps.some(step => step.instruction.includes('Steam')));
}

function testParseProgressEvaluation() {
  const result = parseProgressEvaluation('{"completed":true,"confidence":1.2,"currentStage":"下载页","nextTargetVisible":true,"reason":"看到安装按钮"}');
  assert.strictEqual(result.completed, true);
  assert.strictEqual(result.confidence, 1);
  assert.strictEqual(result.currentStage, '下载页');
  assert.strictEqual(result.nextTargetVisible, true);
  const fallback = parseProgressEvaluation('not json');
  assert.deepStrictEqual(fallback, { completed: false, confidence: 0, currentStage: '', nextTargetVisible: false, reason: 'Unable to parse progress evaluation.' });
}

testNaturalGuideIntentStartsGuide();
testGuideControlCommands();
testParseGuidePlanFromJsonEnvelope();
testFallbackPlan();
testParseProgressEvaluation();
console.log('operation-guide-contract tests passed');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && node scripts/operation-guide-contract.test.js`

Expected: FAIL because `dist/core/operation-guide-*` modules do not exist.

- [ ] **Step 3: Implement pure domain files**

Implement `operation-guide-types.ts` with exact exported interfaces from the spec.

Implement `operation-guide-intent.ts` with conservative regexes:

```ts
export type OperationGuideControlCommand = 'next' | 'reidentify' | 'exit';

export function getOperationGuideControlCommand(text: string): OperationGuideControlCommand | null {
  const normalized = normalizeGuideText(text);
  if (/^(我)?(完成了|已完成|下一步|继续|好了)$/.test(normalized)) return 'next';
  if (/^(重新识别|再识别一下|没指准|指错了|重试)$/.test(normalized)) return 'reidentify';
  if (/^(退出教程|结束教程|停止指引|退出指引|取消指引)$/.test(normalized)) return 'exit';
  return null;
}

export function extractOperationGuideSoftwareName(text: string): string | null {
  const normalized = normalizeGuideText(text).replace(/^\./, '').trim();
  const slash = normalized.match(/^\/guide\s+(.+)$/i);
  if (slash) return cleanGoal(slash[1]);
  const patterns = [
    /我想(?:下载|安装|设置|配置|注册|登录)\s*([^，。！？?]+?)(?:，?下一步.*)?$/,
    /帮我(?:下载|安装|设置|配置|注册|登录)\s*([^，。！？?]+?)(?:，?下一步.*)?$/,
    /(?:怎么下载|怎么安装|怎么设置|怎么配置|如何下载|如何安装|如何设置|如何配置)\s*([^，。！？?]+?)$/
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return cleanGoal(match[1]);
  }
  return null;
}

function normalizeGuideText(text: string): string {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function cleanGoal(goal: string): string | null {
  const cleaned = goal.replace(/^(一下|一个)/, '').replace(/(吧|呀|呢|吗|么)$/g, '').trim();
  return cleaned.length >= 2 ? cleaned : null;
}
```

Implement `operation-guide-planner.ts` with `extractJsonObject()`, action sanitization, step filtering, and fallback plan.

Implement `operation-guide-progress-evaluator.ts` with JSON extraction, boolean normalization, confidence clamping, and safe fallback.

- [ ] **Step 4: Add test script**

Modify `package.json` test script by appending:

```json
" && node scripts/operation-guide-contract.test.js"
```

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: existing tests pass plus `operation-guide-contract tests passed`.

- [ ] **Step 6: Commit**

```bash
git add src/core/operation-guide-types.ts src/core/operation-guide-intent.ts src/core/operation-guide-planner.ts src/core/operation-guide-progress-evaluator.ts scripts/operation-guide-contract.test.js package.json
git commit -m "feat: add operation guide domain contracts"
```

---

### Task 2: Config and Manager State Machine

**Files:**
- Create: `src/core/operation-guide-config.ts`
- Create: `src/core/operation-guide-manager.ts`
- Modify: `scripts/operation-guide-contract.test.js`

**Interfaces:**
- Consumes: Task 1 domain types and planner helpers.
- Produces:
  - `OperationGuideConfigManager` with `get(): OperationGuideConfig`, `update(partial): Promise<OperationGuideConfig>`.
  - `normalizeOperationGuideConfig(input: Partial<OperationGuideConfig>): OperationGuideConfig`.
  - `OperationGuideManager` with `start`, `next`, `reidentify`, `exit`, `getSnapshot`, `isActive`.

- [ ] **Step 1: Add failing manager/config tests**

Append to `scripts/operation-guide-contract.test.js`:

```js
const { normalizeOperationGuideConfig } = require('../dist/core/operation-guide-config');
const { OperationGuideManager } = require('../dist/core/operation-guide-manager');

async function testConfigNormalize() {
  const config = normalizeOperationGuideConfig({ enabled: true, searchEnabled: 'yes', maxTokens: 999999, apiKey: ' secret ' });
  assert.strictEqual(config.enabled, true);
  assert.strictEqual(config.searchEnabled, true);
  assert.strictEqual(config.maxTokens <= 12000, true);
  assert.strictEqual(config.apiKey, 'secret');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(config, 'unknown'), false);
}

async function testManagerStateMachine() {
  const calls = [];
  const manager = new OperationGuideManager({
    getConfig: () => ({ enabled: true, searchEnabled: false, baseUrl: '', apiKey: '', model: '', maxTokens: 2000, systemPrompt: '', lastTargetSoftware: '' }),
    plan: async goal => buildFallbackPlan(goal),
    point: async request => { calls.push(request); return { ok: true, message: 'pointed' }; },
    emitSnapshot: () => undefined,
  });
  await manager.start({ goal: 'Steam', source: 'test' });
  assert.strictEqual(manager.getSnapshot().active, true);
  assert.strictEqual(manager.getSnapshot().status, 'waiting');
  assert.strictEqual(calls[0].target.includes('Steam') || calls[0].instruction.includes('Steam'), true);
  const before = manager.getSnapshot().currentIndex;
  await manager.reidentify();
  assert.strictEqual(manager.getSnapshot().currentIndex, before);
  await manager.next();
  assert.strictEqual(manager.getSnapshot().currentIndex, before + 1);
  manager.exit();
  assert.strictEqual(manager.getSnapshot().active, false);
}

async function runAsyncTests() {
  await testConfigNormalize();
  await testManagerStateMachine();
}

runAsyncTests().then(() => console.log('operation-guide async contract tests passed'));
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run build && node scripts/operation-guide-contract.test.js`

Expected: FAIL because config and manager modules do not exist.

- [ ] **Step 3: Implement config**

Create `operation-guide-config.ts` using `JsonConfigStore<T>` and a pure `normalizeOperationGuideConfig()`.

Defaults:

```ts
export const DEFAULT_OPERATION_GUIDE_CONFIG: OperationGuideConfig = {
  enabled: false,
  searchEnabled: false,
  baseUrl: '',
  apiKey: '',
  model: '',
  maxTokens: 4000,
  systemPrompt: '',
  lastTargetSoftware: '',
};
```

- [ ] **Step 4: Implement manager**

Implement dependencies as an injected interface:

```ts
export interface OperationGuideManagerDeps {
  getConfig: () => OperationGuideConfig;
  plan: (goal: string, config: OperationGuideConfig) => Promise<OperationGuidePlan>;
  point: (request: { target: string; instruction: string; step: OperationGuideStep }) => Promise<{ ok: boolean; message: string }>;
  emitSnapshot?: (snapshot: OperationGuideSnapshot) => void;
}
```

Manager rules:

- `start()` exits previous session, increments session id, sets `planning`, builds plan, points first step.
- `next()` increments if active and not completed; completed when index reaches total.
- `reidentify()` points current step without changing index.
- `exit()` clears active state and emits idle snapshot.
- Every async continuation checks session id.

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/operation-guide-config.ts src/core/operation-guide-manager.ts scripts/operation-guide-contract.test.js
git commit -m "feat: add operation guide manager"
```

---

### Task 3: Intent Router and Executor Integration

**Files:**
- Modify: `src/core/intent-types.ts`
- Modify: `src/core/intent-classifier.ts`
- Modify: `src/core/intent-router.ts`
- Modify: `src/core/intent-executor.ts`
- Modify: `scripts/intent-router-contract.test.js`

**Interfaces:**
- Consumes: Task 1 `operation-guide-intent.ts`.
- Produces:
  - Intent kinds `operation_guide_start`, `operation_guide_next`, `operation_guide_reidentify`, `operation_guide_exit`.
  - Capability `operation_guide`.
  - `IntentOperationGuideDecision { command: 'start' | 'next' | 'reidentify' | 'exit'; goal?: string }`.

- [ ] **Step 1: Add failing intent tests**

Extend `scripts/intent-router-contract.test.js` with tests for:

```js
assert.strictEqual(classifier.classify({ text: '/guide Codex', source: 'chat', userInitiated: true }).intent, 'operation_guide_start');
assert.strictEqual(decision.operationGuide.goal, 'Codex');
assert.ok(decision.requiredCapabilities.includes('operation_guide'));
assert.ok(decision.requiredCapabilities.includes('screen_capture'));
```

Add router disabled/enabled tests:

```js
const denied = router.route({ text: '/guide Codex', source: 'chat', userInitiated: true });
assert.strictEqual(denied.permission.allowed, false);
assert.match(denied.permission.reason, /operation guide is disabled/i);
```

Add executor dispatch tests for four handlers.

- [ ] **Step 2: Run failing tests**

Run: `npm run build && node scripts/intent-router-contract.test.js`

Expected: FAIL for missing intent kinds/capability.

- [ ] **Step 3: Implement types**

Modify `intent-types.ts`:

```ts
export type IntentKind = ... | 'operation_guide_start' | 'operation_guide_next' | 'operation_guide_reidentify' | 'operation_guide_exit';
export type IntentCapability = ... | 'operation_guide';
export interface IntentOperationGuideDecision { command: 'start' | 'next' | 'reidentify' | 'exit'; goal?: string; }
export interface IntentDecision { ... operationGuide?: IntentOperationGuideDecision; }
```

- [ ] **Step 4: Implement classifier rules**

In `intent-classifier.ts`, import guide helpers and add rule order:

1. Guide control command.
2. Guide start.
3. Existing screen/camera/chat rules.

For start/next/reidentify:

```ts
requiredCapabilities: ['operation_guide', 'screen_capture', 'vision', 'move_pointer']
```

For exit:

```ts
requiredCapabilities: ['operation_guide']
```

Do not allow LLM fallback to create guide intent in this task.

- [ ] **Step 5: Implement router gating**

Add `operationGuideEnabled?: () => boolean` to router options, default false.

Reject operation guide intents before capability checks when disabled.

Allow `operation_guide` capability only if request is `userInitiated`, decision is `explicit`, and `operationGuideEnabled()` is true.

- [ ] **Step 6: Implement executor handlers**

Add `operationGuideStart`, `operationGuideNext`, `operationGuideReidentify`, `operationGuideExit` handler fields and switch cases.

- [ ] **Step 7: Run tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/core/intent-types.ts src/core/intent-classifier.ts src/core/intent-router.ts src/core/intent-executor.ts scripts/intent-router-contract.test.js
git commit -m "feat: route operation guide intents"
```

---

### Task 4: Main Process Runtime Wiring and Minimal IPC

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/core/chat-manager.ts` if needed after reading current flow.

**Interfaces:**
- Consumes: Tasks 2 and 3.
- Produces:
  - Main process `OperationGuideManager` instance.
  - Preload namespace `window.companion.operationGuide` with `start`, `next`, `reidentify`, `exit`, `getSnapshot`, `onSnapshot`.

- [ ] **Step 1: Inspect only exact integration points**

Read current constructors and IPC setup sections in:

- `src/main/main.ts`
- `src/main/preload.ts`
- `src/core/chat-manager.ts`

Do not read unrelated modules.

- [ ] **Step 2: Wire manager dependencies**

In `main.ts`, construct manager after current `screenTargetPointer` exists:

```ts
const operationGuideManager = new OperationGuideManager({
  getConfig: () => operationGuideConfigManager.get(),
  plan: async (goal, config) => planOperationGuide(goal, config),
  point: async ({ target, instruction, step }) => {
    const phrase = `.帮我指出 ${target}`;
    const result = await screenTargetPointer.handle(phrase, { suppressResultBubble: true });
    return { ok: result.handled && result.success !== false, message: result.message || instruction };
  },
  emitSnapshot: snapshot => mainWindow?.webContents.send('operation-guide:snapshot', snapshot),
});
```

Use actual method/result names from current `ScreenTargetPointer` after reading.

- [ ] **Step 3: Wire executor handlers**

Pass handlers to `IntentExecutor`:

```ts
operationGuideStart: async routed => operationGuideManager.start({ goal: routed.decision.operationGuide?.goal || routed.request.text, source: 'intent', requestText: routed.request.text }),
operationGuideNext: async () => operationGuideManager.next(),
operationGuideReidentify: async () => operationGuideManager.reidentify(),
operationGuideExit: async () => operationGuideManager.exit(),
```

- [ ] **Step 4: Add IPC**

Add `ipcMain.handle` channels:

- `operation-guide:start`
- `operation-guide:next`
- `operation-guide:reidentify`
- `operation-guide:exit`
- `operation-guide:get-snapshot`

Each channel calls the manager. Do not accept arbitrary paths or config writes in this task.

- [ ] **Step 5: Add preload API**

Expose:

```ts
operationGuide: {
  start: (goal: string) => ipcRenderer.invoke('operation-guide:start', goal),
  next: () => ipcRenderer.invoke('operation-guide:next'),
  reidentify: () => ipcRenderer.invoke('operation-guide:reidentify'),
  exit: () => ipcRenderer.invoke('operation-guide:exit'),
  getSnapshot: () => ipcRenderer.invoke('operation-guide:get-snapshot'),
  onSnapshot: (callback) => { ipcRenderer.on('operation-guide:snapshot', listener); return () => ipcRenderer.removeListener(...); }
}
```

- [ ] **Step 6: Ensure chat flow can reach guide**

If current `ChatManager.sendMessage()` checks AI config before `IntentRouter`, move only the intent routing call before the AI config check. Keep ordinary chat behavior unchanged.

- [ ] **Step 7: Build**

Run: `npm run build`

Expected: TypeScript build passes.

- [ ] **Step 8: Commit**

```bash
git add src/main/main.ts src/main/preload.ts src/core/chat-manager.ts
git commit -m "feat: wire operation guide runtime"
```

---

### Task 5: Settings and Renderer Guide Panel

**Files:**
- Modify: `src/core/operation-guide-config.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/main/settings.html`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/renderer.ts`
- Modify: `src/renderer/style.css`

**Interfaces:**
- Consumes: Task 4 IPC.
- Produces:
  - Config IPC `operation-guide:get-config`, `operation-guide:update-config`.
  - Settings UI for enabled/search/API/model/target test.
  - Renderer guide panel with three buttons.

- [ ] **Step 1: Add config IPC**

In `main.ts`:

```ts
ipcMain.handle('operation-guide:get-config', () => operationGuideConfigManager.get());
ipcMain.handle('operation-guide:update-config', async (_event, partial) => operationGuideConfigManager.update(partial));
```

`OperationGuideConfigManager.update()` must normalize and whitelist.

- [ ] **Step 2: Extend preload API**

Add:

```ts
getConfig: () => ipcRenderer.invoke('operation-guide:get-config'),
updateConfig: (partial) => ipcRenderer.invoke('operation-guide:update-config', partial),
```

- [ ] **Step 3: Add settings section**

In `settings.html`, add a compact “分步指引” section following existing settings style. Fields:

- enabled checkbox
- searchEnabled checkbox
- baseUrl input
- apiKey password input
- model input
- maxTokens number input
- systemPrompt textarea
- target software test input
- save button
- start test button

Implement JS helpers:

```js
async function loadOperationGuideConfig() { ... }
function collectOperationGuideConfig() { return { enabled, searchEnabled, baseUrl, apiKey, model, maxTokens, systemPrompt }; }
async function saveOperationGuideConfig() { await window.companion.operationGuide.updateConfig(collectOperationGuideConfig()); }
async function startOperationGuideTest() { await saveOperationGuideConfig(); await window.companion.operationGuide.start(target); }
```

- [ ] **Step 4: Add renderer panel markup**

In `index.html`, add inside the main app root:

```html
<div id="guide-panel" class="guide-panel hidden" aria-live="polite">
  <div class="guide-panel__title" id="guide-title">分步指引</div>
  <div class="guide-panel__progress" id="guide-progress"></div>
  <div class="guide-panel__message" id="guide-message"></div>
  <div class="guide-panel__actions">
    <button id="guide-next" type="button">我完成了</button>
    <button id="guide-reidentify" type="button">重新识别</button>
    <button id="guide-exit" type="button">退出</button>
  </div>
</div>
```

- [ ] **Step 5: Add renderer behavior**

In `renderer.ts`, add state handling:

```ts
let pointerInsideGuidePanel = false;

function renderGuideSnapshot(snapshot) {
  const panel = document.getElementById('guide-panel');
  if (!panel) return;
  if (!snapshot || !snapshot.active) { panel.classList.add('hidden'); pointerInsideGuidePanel = false; return; }
  panel.classList.remove('hidden');
  document.getElementById('guide-title').textContent = snapshot.softwareName ? `分步指引：${snapshot.softwareName}` : '分步指引';
  document.getElementById('guide-progress').textContent = `${snapshot.currentIndex + 1}/${snapshot.totalSteps}`;
  document.getElementById('guide-message').textContent = snapshot.message || snapshot.currentStep?.instruction || '';
}
```

Buttons use `pointerdown`:

```ts
guideNext.addEventListener('pointerdown', event => { event.preventDefault(); window.companion.operationGuide.next(); });
```

Panel mouse/pointer enters call existing `sendMouseEnter`; leaves release only when not over chat/input/companion.

- [ ] **Step 6: Add CSS**

In `style.css`, add compact styles:

```css
.guide-panel { position: fixed; top: 8px; left: 8px; right: 8px; z-index: 30; pointer-events: auto; }
.guide-panel.hidden { display: none; pointer-events: none; }
.guide-panel__actions button { min-height: 28px; }
```

Do not set `pointer-events:auto` on the entire body.

- [ ] **Step 7: Build and smoke**

Run: `npm run build`

Expected: PASS.

Manual smoke if app can run: F11 settings opens; Operation Guide panel buttons respond; right-click chat and mic still clickable.

- [ ] **Step 8: Commit**

```bash
git add src/core/operation-guide-config.ts src/main/main.ts src/main/preload.ts src/main/settings.html src/renderer/index.html src/renderer/renderer.ts src/renderer/style.css
git commit -m "feat: add operation guide settings and panel"
```

---

### Task 6: Documentation, Verification, and Final Commit

**Files:**
- Create: `docs/operation-guide.md`
- Modify: `README.md`
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`

**Interfaces:**
- Consumes: implemented runtime behavior.
- Produces: user/developer docs and final verification record.

- [ ] **Step 1: Write `docs/operation-guide.md`**

Include:

- What Operation Guide does.
- How to enable it.
- Supported inputs: `/guide Codex`, “帮我安装 Steam”, “我完成了”, “重新识别”, “退出教程”.
- Config fields and API key storage boundary.
- Privacy/safety boundary: no auto click/input, no screenshots in long-term memory, no MIDL peripherals.
- Troubleshooting: planner missing, target not found, panel buttons, fallback plan.

- [ ] **Step 2: Update README**

Add a Features row for Operation Guide and Usage rows for `/guide` and controls.

Add architecture node:

```txt
├─ OperationGuideManager                       分步指引状态机，复用屏幕目标指向能力
```

Add Unreleased roadmap item.

- [ ] **Step 3: Update PROJECT_INDEX**

Add core module bullets for `operation-guide-*` and IPC channel rows for guide operations.

- [ ] **Step 4: Update VERSION**

Under Unreleased add:

```md
- Operation Guide 最小可用融合：新增独立分步指引领域层、配置、Intent Router 接入、运行态状态机、设置入口和主窗口 guide panel；复用现有 ScreenTargetPointer/MoveController，不迁移 Project-Chen MIDL 打包、自提权或 Algorithm 3。
```

- [ ] **Step 5: Run full verification**

Run:

```bash
npm test
npm run build
```

Expected: PASS. If a command fails, record exact failing command and output summary, fix, rerun.

- [ ] **Step 6: Check git diff**

Run: `git status --short`

Expected: only intended files changed.

- [ ] **Step 7: Commit docs/final changes**

```bash
git add README.md PROJECT_INDEX.md VERSION.md docs/operation-guide.md
git commit -m "docs: document operation guide integration"
```

If prior tasks already committed all code, this is final docs commit. If final fixes remain, include them in a separate `fix: stabilize operation guide integration` commit.

---

## Self-Review Notes

- Spec coverage: tasks cover domain model, intent parsing, config, planner/fallback, manager, router/executor, IPC, settings, renderer panel, docs, tests, and final commits.
- Explicit exclusions are preserved: no Project-Chen screen replacement, Algorithm 3, self-elevation, start wrapper, global hooks, auto click/input, or overlay.
- Type consistency: public functions in Task 1 are consumed by Tasks 2 and 3; manager public API is consumed by Task 4; IPC is consumed by Task 5.
- Test integration: `operation-guide-contract.test.js` must be added to `package.json`, so `npm test` covers it.
