# Screen Pointer Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight wheel-based screen-change signal so active screen target pointer sessions cancel when the user scrolls during locating, moving, or pointing.

**Architecture:** Keep `ScreenTargetPointer` as the only owner of pointer session cancellation. Add a renderer-to-main `screen-wheel` IPC path through preload, then let main call the existing `ScreenTargetPointer.cancel('screen-changed')`. Preserve the existing window-title checks and keep screenshot fingerprinting as a documented future enhancement.

**Tech Stack:** Electron 42, TypeScript 6, CommonJS, renderer IIFE script, Electron preload `contextBridge`, main-process `ipcMain`, existing `ScreenTargetPointer` session/cancel mechanism.

## Global Constraints

- First implementation only triggers from `.`-prefixed explicit screen analysis requests.
- Ordinary chat natural-language triggering is intentionally deferred.
- Do not add automatic clicking, automatic scrolling, automatic retry, or background screenshot monitoring.
- Do not implement screenshot fingerprint or image diff in this plan.
- Do not use global mouse hooks to detect external scrollbar dragging.
- Do not change Vision locating, coordinate mapping, pointer offsets, or MoveController behavior.
- Wheel detection must not treat pet movement, point visual changes, or normal pet animations as screen changes.
- The existing screen-changed copy remains: `屏幕变了，我刚才看到的位置可能不准啦。你重新发一次「.帮我指出xxx」吧。`
- Each implementation task must update docs or leave a follow-up docs task; each task ends with `npm run build`, `npm test`, and a git commit.

---

## File Structure

- Modify: `src/main/preload.ts`
  - Add `sendScreenWheel(): void` to the `window.companion` bridge.
- Modify: `src/main/main.ts`
  - Add `ipcMain.on('screen-wheel', ...)` and delegate to `screenTargetPointer?.cancel('screen-changed')`.
- Modify: `src/renderer/renderer.ts`
  - Add a throttled document-level `wheel` listener that calls `window.companion.sendScreenWheel()`.
- Modify: `PROJECT_INDEX.md`
  - Document the `screen-wheel` IPC channel and lightweight screen stability boundary.
- Modify: `VERSION.md`
  - Add an Unreleased entry for wheel-based screen pointer cancellation.
- Inspect: `docs/superpowers/specs/2026-07-15-screen-pointer-stability-design.md`
  - Source of truth for scope and non-goals.

---

### Task 1: Add wheel IPC from renderer to main

**Files:**
- Modify: `src/main/preload.ts`
- Modify: `src/main/main.ts`
- Modify: `src/renderer/renderer.ts`

**Interfaces:**
- Produces: `window.companion.sendScreenWheel(): void`
- Produces: IPC channel `screen-wheel`
- Consumes: `ScreenTargetPointer.cancel(reason: 'screen-changed')`

- [ ] **Step 1: Add preload bridge**

In `src/main/preload.ts`, inside `contextBridge.exposeInMainWorld('companion', { ... })`, add `sendScreenWheel` near the other one-way renderer-to-main senders such as `sendCursorMove` / `sendDragStart`:

```ts
  sendScreenWheel: () => {
    ipcRenderer.send('screen-wheel');
  },
```

Expected surrounding shape:

```ts
contextBridge.exposeInMainWorld('companion', {
  sendCursorMove: (data: { x: number; y: number }) => {
    ipcRenderer.send('cursor-move', data);
  },
  sendScreenWheel: () => {
    ipcRenderer.send('screen-wheel');
  },
  sendDragStart: () => {
    ipcRenderer.send('drag-start');
  },
```

- [ ] **Step 2: Add main IPC handler**

In `src/main/main.ts`, inside `setupIPC()`, add this handler near `cursor-move` or the drag handlers:

```ts
  ipcMain.on('screen-wheel', () => {
    screenTargetPointer?.cancel('screen-changed');
  });
```

This is safe when no pointer session is active because `ScreenTargetPointer.cancel()` returns early for `done` and `cancelled` states.

- [ ] **Step 3: Add throttled wheel listener in renderer**

In `src/renderer/renderer.ts`, add these variables near the other interaction state variables:

```ts
  var lastScreenWheelSentAt = 0;
  var SCREEN_WHEEL_THROTTLE_MS = 300;
```

Add this setup function near `setupCursorTracking()` or `setupClickThrough()`:

```ts
  function setupScreenWheelDetection(): void {
    document.addEventListener('wheel', function () {
      var now = Date.now();
      if (now - lastScreenWheelSentAt < SCREEN_WHEEL_THROTTLE_MS) return;
      lastScreenWheelSentAt = now;
      // @ts-ignore
      window.companion.sendScreenWheel();
    }, { passive: true });
  }
```

Then call it from `init()` after `setupCursorTracking()`:

```ts
    setupCursorTracking();
    setupScreenWheelDetection();
    setupChatInput();
```

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: PASS. `tsc` completes successfully.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
```

Expected: PASS. Current project test command runs `npm run build` and `node scripts/voice-input-contract.test.js`; expected output includes `voice-input-contract tests passed`.

- [ ] **Step 6: Manual smoke check**

Run the app and verify:

1. Send `.帮我指出搜索框在哪`.
2. Wait until the pet is locating, moving, or pointing.
3. Scroll the mouse wheel while the session is active.
4. Expected: current pointing session cancels and shows `屏幕变了，我刚才看到的位置可能不准啦。你重新发一次「.帮我指出xxx」吧。`.
5. Scroll the mouse wheel when no pointer session is active.
6. Expected: no screen-changed bubble appears.

If manual app launch is not available in the implementation environment, record that it was skipped and rely on build/tests plus code review.

- [ ] **Step 7: Commit**

```bash
git add src/main/preload.ts src/main/main.ts src/renderer/renderer.ts
git commit -m "feat: cancel screen pointer on wheel"
```

---

### Task 2: Document wheel-based screen stability

**Files:**
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`
- Inspect: `docs/superpowers/specs/2026-07-15-screen-pointer-stability-design.md`

**Interfaces:**
- Consumes: IPC channel `screen-wheel`
- Consumes: `ScreenTargetPointer.cancel('screen-changed')`
- Produces: project documentation for wheel-based cancellation and deferred screenshot fingerprinting

- [ ] **Step 1: Update `PROJECT_INDEX.md` AI system note**

In `PROJECT_INDEX.md`, find the `### AI 系统` section and the existing `屏幕目标指示` bullet. Replace it with this text, preserving nearby bullets:

```md
- **屏幕目标指示**：`.` 屏幕分析入口中命中明确“指出/在哪/帮我找”等关键词时，`ChatManager` 委托 `ScreenTargetPointer` 调用 Vision 结构化定位；置信度足够时通过 `MoveController` 把桌宠移动到目标旁边，并发送 `point-visual` 指向差分。指向 session 期间会通过前台窗口变化和 renderer `screen-wheel` 滚轮事件取消旧坐标，普通聊天自然语言自动触发与截图指纹检测暂缓，避免隐私、误触发和桌宠自身动画误判问题。
```

- [ ] **Step 2: Update `PROJECT_INDEX.md` renderer-to-main IPC table**

In `PROJECT_INDEX.md`, under `### 渲染 → 主`, add this row near `cursor-move` / `drag-start`:

```md
| screen-wheel | - | 屏幕目标指示稳定性信号：renderer 捕获滚轮后通知主进程取消 active pointing session |
```

- [ ] **Step 3: Update `VERSION.md`**

In `VERSION.md`, under `## Unreleased` if present, add:

```md
- 屏幕目标指示稳定性：新增 renderer 滚轮信号取消 active pointing session，保持截图指纹和全局滚动条拖动检测为后续增强
```

If the file currently has a `## v0.3.0` section before `## Unreleased`, keep the existing structure and insert the entry into `## Unreleased` rather than moving release entries.

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: PASS. `tsc` completes successfully.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
```

Expected: PASS. Output includes `voice-input-contract tests passed`.

- [ ] **Step 6: Inspect working tree**

Run:

```bash
git status --short
```

Expected for this task before commit: only `PROJECT_INDEX.md` and `VERSION.md` are modified by this task. If unrelated pre-existing files are present, do not add them.

- [ ] **Step 7: Commit documentation**

```bash
git add PROJECT_INDEX.md VERSION.md
git commit -m "docs: document screen pointer wheel stability"
```

---

## Manual Verification Checklist

Run after both tasks are complete:

- [ ] `npm run build` passes.
- [ ] `npm test` passes.
- [ ] `.总结这个页面` still goes through ordinary screen analysis.
- [ ] `.帮我指出搜索框在哪` still enters target pointer flow.
- [ ] Wheel scroll during locating/moving/pointing cancels the active session with the screen-changed message.
- [ ] Wheel scroll when no pointer session is active does not show the screen-changed message.
- [ ] Dragging the pet still cancels with `好啦好啦，我不挡你~`.
- [ ] No screenshot fingerprinting, global mouse hook, automatic click, automatic scroll, automatic retry, or ordinary-chat screen trigger is introduced.

---

## Self-Review

- Spec coverage: Task 1 implements renderer wheel detection, preload bridge, main IPC, and reuse of `ScreenTargetPointer.cancel('screen-changed')`. Task 2 documents the IPC and deferred screenshot fingerprint/global hook scope.
- Placeholder scan: No TBD/TODO placeholders remain; every code change step includes exact snippets and commands.
- Type consistency: `sendScreenWheel`, `screen-wheel`, and `cancel('screen-changed')` are named consistently across renderer, preload, main, and documentation.
