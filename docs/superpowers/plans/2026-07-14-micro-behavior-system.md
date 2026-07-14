# Micro Behavior System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configuration-driven micro behavior interface so proactive reactions can express themselves as light actions, bubbles, both, or silent records.

**Architecture:** Keep `ProactiveReactionSystem` responsible for deciding whether a proactive candidate exists, add `MicroBehaviorManager` to decide how that candidate should be expressed, and keep `BubbleManager` as the final bubble gate. Main process sends `micro-behavior` IPC payloads to the renderer; the renderer applies temporary CSS classes without changing the canonical state machine.

**Tech Stack:** Electron, TypeScript strict mode, CommonJS, JSON config imports, browser DOM/CSS animations, existing `npm run build` verification.

## Global Constraints

- Do not add real animation assets in this iteration.
- Do not add voice input in this iteration.
- Do not add camera access in this iteration.
- Do not add new third-party animation libraries.
- Do not change proactive candidate generation rules.
- `state_hint` must not force `StateManager` transitions in this first version.
- The build command is `npm run build`.
- Keep Electron preload boundaries: renderer receives behavior through `contextBridge`, not direct Node APIs.

---

## File Structure

- Create `src/config/micro-behaviors.json`: default micro behavior config and reason mapping.
- Create `src/core/micro-behavior-manager.ts`: public types, config normalization, decision/result/debug snapshot, IPC dispatch.
- Modify `src/core/observer-manager.ts`: inject `MicroBehaviorManager`, run it after proactive candidate creation, gate AI wording/bubble display by decision result.
- Modify `src/main/main.ts`: initialize `MicroBehaviorManager`, pass it into `ObserverManager`, expose debug snapshot in `get-chat-info`.
- Modify `src/main/preload.ts`: expose `onMicroBehavior(callback)`.
- Modify `src/renderer/renderer.ts`: listen for `micro-behavior`, apply temporary visual classes, tolerate unknown payloads.
- Modify `src/renderer/style.css`: define light CSS animations/classes for pause, wiggle, lean, and state hint.
- Modify `package.json`: include `src/config/micro-behaviors.json` in packaged files.

---

### Task 1: Add Micro Behavior Config and Manager

**Files:**
- Create: `src/config/micro-behaviors.json`
- Create: `src/core/micro-behavior-manager.ts`

**Interfaces:**
- Consumes: `ProactiveCandidate`, `ProactiveReason` from `src/core/proactive-reaction-system.ts`; `StateId` from `src/core/types.ts`; `BrowserWindow` from Electron.
- Produces:
  - `type MicroBehaviorType = 'none' | 'pause' | 'wiggle' | 'lean' | 'state_hint' | 'bubble_delay'`
  - `interface MicroBehaviorPayload`
  - `interface MicroBehaviorDecision`
  - `interface MicroBehaviorResult`
  - `interface MicroBehaviorDebugSnapshot`
  - `class MicroBehaviorManager`
  - `evaluate(candidate: ProactiveCandidate): MicroBehaviorDecision`
  - `perform(decision: MicroBehaviorDecision): MicroBehaviorResult`
  - `performForCandidate(candidate: ProactiveCandidate): MicroBehaviorResult`
  - `getDebugSnapshot(): MicroBehaviorDebugSnapshot`

- [ ] **Step 1: Create the config file**

Create `src/config/micro-behaviors.json` with this content:

```json
{
  "enabled": true,
  "defaultBehavior": {
    "behavior": "pause",
    "durationMs": 700,
    "showBubble": true,
    "bubbleDelayMs": 0,
    "intensity": 0.5,
    "direction": "center"
  },
  "reasonMap": {
    "work_to_rest": {
      "behavior": "state_hint",
      "state": "comfortable",
      "durationMs": 1800,
      "showBubble": true,
      "bubbleDelayMs": 300,
      "intensity": 0.6,
      "direction": "center"
    },
    "rest_to_work": {
      "behavior": "lean",
      "durationMs": 900,
      "showBubble": true,
      "bubbleDelayMs": 200,
      "intensity": 0.6,
      "direction": "center"
    },
    "long_focus": {
      "behavior": "state_hint",
      "state": "curious",
      "durationMs": 1600,
      "showBubble": true,
      "bubbleDelayMs": 600,
      "intensity": 0.5,
      "direction": "center"
    },
    "returning_from_idle": {
      "behavior": "wiggle",
      "durationMs": 800,
      "showBubble": true,
      "bubbleDelayMs": 100,
      "intensity": 0.7,
      "direction": "center"
    },
    "meaningful_app_switch": {
      "behavior": "pause",
      "durationMs": 600,
      "showBubble": false,
      "bubbleDelayMs": 0,
      "intensity": 0.4,
      "direction": "center"
    },
    "recent_interaction_followup": {
      "behavior": "lean",
      "durationMs": 700,
      "showBubble": true,
      "bubbleDelayMs": 150,
      "intensity": 0.5,
      "direction": "center"
    }
  }
}
```

- [ ] **Step 2: Create the manager implementation**

Create `src/core/micro-behavior-manager.ts` with this implementation:

```ts
import { BrowserWindow } from 'electron';
import { ProactiveCandidate, ProactiveReason } from './proactive-reaction-system';
import { StateId } from './types';
import { getLogger } from './logger';
import microBehaviorConfig from '../config/micro-behaviors.json';

export type MicroBehaviorType = 'none' | 'pause' | 'wiggle' | 'lean' | 'state_hint' | 'bubble_delay';
export type MicroBehaviorDirection = 'left' | 'right' | 'up' | 'down' | 'center';
export type MicroBehaviorDecisionSource = 'reason_map' | 'default' | 'disabled' | 'invalid';

export interface MicroBehaviorPayload {
  id: string;
  behavior: MicroBehaviorType;
  durationMs: number;
  intensity?: number;
  direction?: MicroBehaviorDirection;
  state?: StateId;
}

export interface MicroBehaviorDecision {
  reason: ProactiveReason;
  behavior: MicroBehaviorType;
  durationMs: number;
  showBubble: boolean;
  bubbleDelayMs: number;
  state?: StateId;
  intensity?: number;
  direction?: MicroBehaviorDirection;
  source: MicroBehaviorDecisionSource;
}

export interface MicroBehaviorResult {
  decision: MicroBehaviorDecision;
  performed: boolean;
  shouldShowBubble: boolean;
  bubbleDelayMs: number;
  message: string;
}

export interface MicroBehaviorDebugSnapshot {
  enabled: boolean;
  lastDecision: MicroBehaviorDecision | null;
  lastResult: MicroBehaviorResult | null;
  recentBehaviors: Array<{
    time: string;
    reason: ProactiveReason;
    behavior: MicroBehaviorType;
    showBubble: boolean;
    success: boolean;
    source: MicroBehaviorDecisionSource;
  }>;
}

interface MicroBehaviorRule {
  behavior: MicroBehaviorType;
  durationMs?: number;
  showBubble?: boolean;
  bubbleDelayMs?: number;
  state?: StateId;
  intensity?: number;
  direction?: MicroBehaviorDirection;
}

interface MicroBehaviorConfig {
  enabled: boolean;
  defaultBehavior: MicroBehaviorRule;
  reasonMap: Partial<Record<ProactiveReason, MicroBehaviorRule>>;
}

const CONFIG = microBehaviorConfig as MicroBehaviorConfig;
const KNOWN_BEHAVIORS: MicroBehaviorType[] = ['none', 'pause', 'wiggle', 'lean', 'state_hint', 'bubble_delay'];
const KNOWN_DIRECTIONS: MicroBehaviorDirection[] = ['left', 'right', 'up', 'down', 'center'];

export class MicroBehaviorManager {
  private mainWindow: BrowserWindow;
  private lastDecision: MicroBehaviorDecision | null = null;
  private lastResult: MicroBehaviorResult | null = null;
  private recentBehaviors: MicroBehaviorDebugSnapshot['recentBehaviors'] = [];

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  evaluate(candidate: ProactiveCandidate): MicroBehaviorDecision {
    if (!CONFIG.enabled) {
      return this.createDecision(candidate.reason, { behavior: 'none', showBubble: true }, 'disabled');
    }

    const mapped = CONFIG.reasonMap[candidate.reason];
    if (mapped) {
      return this.createDecision(candidate.reason, mapped, 'reason_map');
    }

    return this.createDecision(candidate.reason, CONFIG.defaultBehavior, 'default');
  }

  perform(decision: MicroBehaviorDecision): MicroBehaviorResult {
    this.lastDecision = decision;

    const performed = this.sendPayload(decision);
    const result: MicroBehaviorResult = {
      decision,
      performed,
      shouldShowBubble: decision.showBubble,
      bubbleDelayMs: decision.bubbleDelayMs,
      message: performed ? 'micro behavior sent' : 'micro behavior skipped',
    };

    this.lastResult = result;
    this.recordRecent(decision, performed);
    getLogger().log('observer', `[MicroBehavior] ${decision.reason} -> ${decision.behavior}, bubble=${decision.showBubble}, performed=${performed}`);
    return result;
  }

  performForCandidate(candidate: ProactiveCandidate): MicroBehaviorResult {
    return this.perform(this.evaluate(candidate));
  }

  getDebugSnapshot(): MicroBehaviorDebugSnapshot {
    return {
      enabled: CONFIG.enabled,
      lastDecision: this.lastDecision,
      lastResult: this.lastResult,
      recentBehaviors: [...this.recentBehaviors],
    };
  }

  private createDecision(
    reason: ProactiveReason,
    rule: Partial<MicroBehaviorRule>,
    source: MicroBehaviorDecisionSource
  ): MicroBehaviorDecision {
    const fallback = CONFIG.defaultBehavior || { behavior: 'pause', durationMs: 700, showBubble: true, bubbleDelayMs: 0 };
    const behavior = this.normalizeBehavior(rule.behavior || fallback.behavior);
    const direction = this.normalizeDirection(rule.direction || fallback.direction || 'center');
    const valid = behavior !== null && direction !== null;

    if (!valid) {
      return {
        reason,
        behavior: 'none',
        durationMs: 0,
        showBubble: true,
        bubbleDelayMs: 0,
        source: 'invalid',
      };
    }

    return {
      reason,
      behavior,
      durationMs: this.normalizeMs(rule.durationMs ?? fallback.durationMs, 700),
      showBubble: rule.showBubble ?? fallback.showBubble ?? true,
      bubbleDelayMs: this.normalizeMs(rule.bubbleDelayMs ?? fallback.bubbleDelayMs, 0),
      state: rule.state || fallback.state,
      intensity: this.normalizeIntensity(rule.intensity ?? fallback.intensity),
      direction,
      source,
    };
  }

  private sendPayload(decision: MicroBehaviorDecision): boolean {
    if (decision.behavior === 'none') return false;
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return false;

    const payload: MicroBehaviorPayload = {
      id: `${Date.now()}-${decision.reason}`,
      behavior: decision.behavior,
      durationMs: decision.durationMs,
      intensity: decision.intensity,
      direction: decision.direction,
      state: decision.state,
    };

    this.mainWindow.webContents.send('micro-behavior', payload);
    return true;
  }

  private recordRecent(decision: MicroBehaviorDecision, success: boolean): void {
    this.recentBehaviors.unshift({
      time: new Date().toISOString(),
      reason: decision.reason,
      behavior: decision.behavior,
      showBubble: decision.showBubble,
      success,
      source: decision.source,
    });
    this.recentBehaviors = this.recentBehaviors.slice(0, 20);
  }

  private normalizeBehavior(value: unknown): MicroBehaviorType | null {
    return typeof value === 'string' && KNOWN_BEHAVIORS.includes(value as MicroBehaviorType)
      ? value as MicroBehaviorType
      : null;
  }

  private normalizeDirection(value: unknown): MicroBehaviorDirection | null {
    return typeof value === 'string' && KNOWN_DIRECTIONS.includes(value as MicroBehaviorDirection)
      ? value as MicroBehaviorDirection
      : null;
  }

  private normalizeMs(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  private normalizeIntensity(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.max(0, Math.min(1, value));
  }
}
```

- [ ] **Step 3: Run build to catch type/config errors**

Run:

```bash
npm run build
```

Expected: TypeScript compiles, or the only failures are directly related to newly added type names/imports and must be fixed before continuing.

- [ ] **Step 4: Commit Task 1**

```bash
git add src/config/micro-behaviors.json src/core/micro-behavior-manager.ts
git commit -m "feat: add micro behavior manager"
```

---

### Task 2: Wire Micro Behaviors into Observer Flow

**Files:**
- Modify: `src/core/observer-manager.ts`
- Modify: `src/main/main.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MicroBehaviorManager.performForCandidate(candidate): MicroBehaviorResult` from Task 1.
- Produces:
  - `ObserverManager` constructor accepts `microBehaviorManager: MicroBehaviorManager`.
  - `get-chat-info` returns `microBehavior` debug snapshot.
  - Packaged app includes `src/config/micro-behaviors.json`.

- [ ] **Step 1: Modify ObserverManager imports and constructor**

In `src/core/observer-manager.ts`, add this import:

```ts
import { MicroBehaviorManager } from './micro-behavior-manager';
```

Add this private field:

```ts
private microBehaviorManager: MicroBehaviorManager;
```

Change the constructor signature to include the new dependency after `proactiveReactionSystem`:

```ts
constructor(
  mainWindow: BrowserWindow,
  aiService: AIService,
  emotionSystem: EmotionSystem,
  stateManager: StateManager,
  memory: AIMemory,
  screenAnalyzer: ScreenAnalyzer,
  configManager: AIConfigManager,
  bubbleManager: BubbleManager,
  proactiveReactionSystem: ProactiveReactionSystem,
  microBehaviorManager: MicroBehaviorManager
) {
```

Inside the constructor body, after assigning `this.proactiveReactionSystem`, add:

```ts
this.microBehaviorManager = microBehaviorManager;
```

- [ ] **Step 2: Replace candidate delivery logic**

In `collectAndAnalyze()`, replace the block from `const text = await this.resolveCandidateText(candidate, snapshot);` through the `else` logging branch with this exact logic:

```ts
const behaviorResult = this.microBehaviorManager.performForCandidate(candidate);

let shown = false;
let text = '';
if (behaviorResult.shouldShowBubble) {
  text = await this.resolveCandidateText(candidate, snapshot);
  if (text && behaviorResult.bubbleDelayMs > 0) {
    await this.delay(behaviorResult.bubbleDelayMs);
  }
  if (text) {
    shown = this.bubbleManager.tryShowProactiveBubble(text, candidate.reason);
  }
}

if (shown || behaviorResult.performed) {
  this.proactiveReactionSystem.markDelivered(candidate, text || candidate.message);
} else {
  getLogger().log('observer', `[Proactive] output blocked: ${candidate.reason}`);
}
```

Add this private helper near `resolveCandidateText()`:

```ts
private delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

- [ ] **Step 3: Instantiate manager in main process**

In `src/main/main.ts`, add import:

```ts
import { MicroBehaviorManager } from '../core/micro-behavior-manager';
```

Add module variable:

```ts
let microBehaviorManager: MicroBehaviorManager;
```

After `proactiveReactionSystem = new ProactiveReactionSystem(chatManager.getMemory());`, add:

```ts
microBehaviorManager = new MicroBehaviorManager(mainWindow);
```

Change the `ObserverManager` constructor call to pass the manager:

```ts
observerManager = new ObserverManager(
  mainWindow, aiService, chatManager.getEmotionUpdater().getEmotionSystem(),
  stateManager, chatManager.getMemory(), screenAnalyzer, aiConfigManager,
  bubbleManager, proactiveReactionSystem, microBehaviorManager
);
```

- [ ] **Step 4: Add debug snapshot to get-chat-info**

In `src/main/main.ts`, inside the object returned by `ipcMain.handle('get-chat-info', ...)`, add:

```ts
microBehavior: microBehaviorManager?.getDebugSnapshot() || null,
```

The returned object should include both `proactive` and `microBehavior`.

- [ ] **Step 5: Package the new config**

In `package.json`, add this line to `build.files` immediately after `src/config/proactive-reactions.json`:

```json
"src/config/micro-behaviors.json",
```

- [ ] **Step 6: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/core/observer-manager.ts src/main/main.ts package.json
git commit -m "feat: wire micro behaviors into observer"
```

---

### Task 3: Add Renderer IPC and Light Visual Behaviors

**Files:**
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/renderer.ts`
- Modify: `src/renderer/style.css`

**Interfaces:**
- Consumes: main-process `micro-behavior` IPC payload from Task 1.
- Produces:
  - `window.companion.onMicroBehavior(callback)` preload API.
  - Renderer function `playMicroBehavior(payload)`.
  - CSS classes `micro-pause`, `micro-wiggle`, `micro-lean-*`, `micro-state-hint`.

- [ ] **Step 1: Expose preload listener**

In `src/main/preload.ts`, add this API near the other `on...` listeners:

```ts
onMicroBehavior: (callback: (payload: any) => void) => {
  ipcRenderer.on('micro-behavior', (_event, payload) => callback(payload));
},
```

- [ ] **Step 2: Add renderer listener**

In `src/renderer/renderer.ts`, inside `setupStateListeners()` after the `onShowBubble` listener, add:

```ts
// 主进程发来的轻量微行为
// @ts-ignore
window.companion.onMicroBehavior(function (payload: any) {
  playMicroBehavior(payload);
});
```

- [ ] **Step 3: Add renderer behavior functions**

In `src/renderer/renderer.ts`, add these functions before `setSprite()`:

```ts
  var microBehaviorTimer: ReturnType<typeof setTimeout> | null = null;

  function playMicroBehavior(payload: any): void {
    if (!payload || typeof payload.behavior !== 'string') return;
    var behavior = payload.behavior;
    var durationMs = typeof payload.durationMs === 'number' && payload.durationMs >= 0 ? payload.durationMs : 700;
    var direction = typeof payload.direction === 'string' ? payload.direction : 'center';

    clearMicroBehaviorClasses();

    if (behavior === 'none') return;
    if (behavior === 'pause') {
      companionEl.classList.add('micro-pause');
    } else if (behavior === 'wiggle') {
      companionEl.classList.add('micro-wiggle');
    } else if (behavior === 'lean') {
      companionEl.classList.add('micro-lean-' + direction);
    } else if (behavior === 'state_hint') {
      companionEl.classList.add('micro-state-hint');
      if (payload.state === 'curious') companionEl.classList.add('micro-state-curious');
      if (payload.state === 'comfortable') companionEl.classList.add('micro-state-comfortable');
    } else if (behavior === 'bubble_delay') {
      companionEl.classList.add('micro-pause');
    } else {
      console.log('[MicroBehavior] unknown behavior:', behavior);
      return;
    }

    if (microBehaviorTimer) clearTimeout(microBehaviorTimer);
    microBehaviorTimer = setTimeout(function () {
      clearMicroBehaviorClasses();
    }, durationMs);
  }

  function clearMicroBehaviorClasses(): void {
    companionEl.classList.remove(
      'micro-pause',
      'micro-wiggle',
      'micro-lean-left',
      'micro-lean-right',
      'micro-lean-up',
      'micro-lean-down',
      'micro-lean-center',
      'micro-state-hint',
      'micro-state-curious',
      'micro-state-comfortable'
    );
    if (microBehaviorTimer) {
      clearTimeout(microBehaviorTimer);
      microBehaviorTimer = null;
    }
  }
```

- [ ] **Step 4: Add CSS animations**

Append this to `src/renderer/style.css` after the existing state animations and before the bubble styles:

```css
/* 主动回应微行为：短暂停顿 */
@keyframes micro-pause {
  0%, 100% { transform: translateX(-50%) scale(1); filter: none; }
  45% { transform: translateX(-50%) scale(0.985); filter: brightness(0.98); }
}

#companion.micro-pause {
  animation: micro-pause 0.7s ease-in-out;
}

/* 主动回应微行为：轻微晃动 */
@keyframes micro-wiggle {
  0%, 100% { transform: translateX(-50%) rotate(0deg); }
  20% { transform: translateX(-50%) rotate(-3deg); }
  40% { transform: translateX(-50%) rotate(3deg); }
  60% { transform: translateX(-50%) rotate(-2deg); }
  80% { transform: translateX(-50%) rotate(2deg); }
}

#companion.micro-wiggle {
  animation: micro-wiggle 0.8s ease-in-out;
}

/* 主动回应微行为：探头/靠近 */
@keyframes micro-lean-center {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50% { transform: translateX(-50%) translateY(-6px) scale(1.02); }
}

@keyframes micro-lean-left {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50% { transform: translateX(calc(-50% - 8px)) translateY(-3px) rotate(-2deg); }
}

@keyframes micro-lean-right {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50% { transform: translateX(calc(-50% + 8px)) translateY(-3px) rotate(2deg); }
}

@keyframes micro-lean-up {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50% { transform: translateX(-50%) translateY(-8px); }
}

@keyframes micro-lean-down {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50% { transform: translateX(-50%) translateY(5px); }
}

#companion.micro-lean-center { animation: micro-lean-center 0.8s ease-in-out; }
#companion.micro-lean-left { animation: micro-lean-left 0.8s ease-in-out; }
#companion.micro-lean-right { animation: micro-lean-right 0.8s ease-in-out; }
#companion.micro-lean-up { animation: micro-lean-up 0.8s ease-in-out; }
#companion.micro-lean-down { animation: micro-lean-down 0.8s ease-in-out; }

/* 主动回应微行为：状态提示，不接管主状态机 */
@keyframes micro-state-hint {
  0%, 100% { transform: translateX(-50%) scale(1); filter: none; }
  50% { transform: translateX(-50%) scale(1.015); filter: brightness(1.04); }
}

#companion.micro-state-hint {
  animation: micro-state-hint 1.2s ease-in-out;
}

#companion.micro-state-curious {
  transform-origin: 50% 90%;
}

#companion.micro-state-comfortable {
  transform-origin: 50% 100%;
}
```

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/main/preload.ts src/renderer/renderer.ts src/renderer/style.css
git commit -m "feat: render micro behaviors"
```

---

### Task 4: Final Verification and Documentation Update

**Files:**
- Modify: `docs/proactive-reaction-component.md`

**Interfaces:**
- Consumes: micro behavior interfaces from Tasks 1-3.
- Produces: developer-facing docs describing how proactive candidates map to micro behaviors.

- [ ] **Step 1: Update proactive reaction documentation**

Append this section to `docs/proactive-reaction-component.md`:

```md
## Micro behavior handoff

主动回应候选现在可以交给 `MicroBehaviorManager` 映射为轻量微行为。

主流程：

```txt
ObserverManager
  → ContextCollector.collect()
  → ProactiveReactionSystem.evaluateComponent(snapshot)
  → MicroBehaviorManager.performForCandidate(candidate)
  → optional AI wording if bubble is allowed
  → BubbleManager.tryShowProactiveBubble(...) if needed
```

核心文件：

- [src/core/micro-behavior-manager.ts](src/core/micro-behavior-manager.ts)
- [src/config/micro-behaviors.json](src/config/micro-behaviors.json)

第一版微行为只通过 IPC 和 CSS 做轻量表现，不新增素材，也不接管 `StateManager` 状态。

支持的行为：

- `none`：仅记录。
- `pause`：短暂停顿。
- `wiggle`：轻微晃动。
- `lean`：轻微偏移/探头。
- `state_hint`：状态感提示。
- `bubble_delay`：延迟气泡。
```

- [ ] **Step 2: Run full build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short
```

Expected: only `docs/proactive-reaction-component.md` modified before final commit, or no unexpected files after commits.

- [ ] **Step 4: Commit docs**

```bash
git add docs/proactive-reaction-component.md
git commit -m "docs: document micro behavior handoff"
```

- [ ] **Step 5: Final status check**

Run:

```bash
git status --short && git log --oneline -5
```

Expected: clean working tree and recent commits include:

```txt
docs: document micro behavior handoff
feat: render micro behaviors
feat: wire micro behaviors into observer
feat: add micro behavior manager
```

---

## Self-Review

Spec coverage:

- Config-driven micro behavior system: Task 1.
- Active candidate to behavior mapping: Task 1 and Task 2.
- Bubble/action/silent expression: Task 1 and Task 2.
- Debug snapshot: Task 1 and Task 2.
- IPC payload and preload API: Task 3.
- Renderer CSS-only behavior: Task 3.
- Packaging config: Task 2.
- Documentation: Task 4.

Placeholder scan:

- No `TBD` placeholders.
- No undefined task references.
- Every code-changing step includes exact code or exact target replacement.

Type consistency:

- `MicroBehaviorType`, `MicroBehaviorDirection`, `MicroBehaviorDecision`, `MicroBehaviorResult`, and `MicroBehaviorDebugSnapshot` are defined in Task 1 and reused consistently.
- `performForCandidate(candidate): MicroBehaviorResult` is the single Observer integration point.
- `microBehavior` is the debug key returned by `get-chat-info`.
