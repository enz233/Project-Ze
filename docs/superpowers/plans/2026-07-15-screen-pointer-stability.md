# Screen Pointer Stability Fingerprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight screenshot fingerprint stability check so screen target pointer sessions cancel before moving when the screen visibly changes during Vision locating.

**Architecture:** Keep `ScreenTargetPointer` as the owner of session cancellation. Add a small pure `screen-fingerprint` utility for low-resolution grayscale fingerprints, let `ScreenAnalyzer.captureScreenFrame()` attach a fingerprint to each frame, then let `ScreenTargetPointer` take one extra frame after Vision returns and compare the two fingerprints before moving.

**Tech Stack:** Electron 42, TypeScript 6, CommonJS, `desktopCapturer` / Electron `NativeImage`, existing `ScreenAnalyzer`, existing `ScreenTargetPointer`, Node contract tests in `scripts/*.test.js`.

## Global Constraints

- Only handle `.`-prefixed explicit screen target pointer requests already routed through `ScreenTargetPointer`.
- Use Vision-before / Vision-after screenshot fingerprint comparison only.
- First version uses a conservative threshold: `diff >= 0.20` cancels, `diff < 0.20` continues.
- Do not add wheel IPC, renderer wheel listeners, global mouse hooks, global keyboard hooks, or continuous screenshot monitoring.
- Do not exclude the pet window area in this round.
- Do not poll during moving or pointing.
- Do not change Vision locating prompt semantics, coordinate mapping behavior, pointer offsets, MoveController movement behavior, automatic click/scroll/retry behavior, or ordinary-chat natural-language triggering.
- If fingerprint generation or comparison fails, continue the existing pointer flow instead of cancelling.
- Each task should end with `npm run build`, `npm test`, and a git commit.

---

## File Structure

- Create: `src/core/screen-fingerprint.ts`
  - Owns the pure `ScreenFingerprint` type, default constants, fingerprint creation from low-resolution bitmap data, and fingerprint diff comparison.
  - Has no Electron imports so it can be tested from plain Node after `npm run build`.
- Modify: `src/core/screen-analyzer.ts`
  - Adds `fingerprint?: ScreenFingerprint` to `ScreenCaptureFrame`.
  - Creates a fingerprint from the already-captured screen thumbnail during `captureScreenFrame()`.
- Modify: `src/core/screen-target-pointer.ts`
  - After Vision returns and the locate result is valid, captures one more frame and compares fingerprints before computing/moving to the target.
  - Cancels with existing `screen-changed` handling only when diff is `>= 0.20`.
- Create: `scripts/screen-fingerprint-contract.test.js`
  - Tests the pure fingerprint utility without Electron runtime.
- Modify: `package.json`
  - Adds the new contract test to `npm test`.
- Modify: `PROJECT_INDEX.md`
  - Documents the lightweight fingerprint screen stability boundary and confirms wheel IPC/global hooks are not used.
- Modify: `VERSION.md`
  - Adds an Unreleased entry for fingerprint-based pre-move cancellation.
- Inspect only: `docs/superpowers/specs/2026-07-15-screen-pointer-stability-design.md`
  - Source of truth for scope and non-goals.

---

### Task 1: Add pure screenshot fingerprint utility

**Files:**
- Create: `src/core/screen-fingerprint.ts`
- Create: `scripts/screen-fingerprint-contract.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `ScreenFingerprint`
- Produces: `SCREEN_FINGERPRINT_WIDTH = 16`
- Produces: `SCREEN_FINGERPRINT_HEIGHT = 9`
- Produces: `SCREEN_FINGERPRINT_CHANGE_THRESHOLD = 0.20`
- Produces: `createScreenFingerprintFromBitmap(bitmap: Buffer | Uint8Array, width: number, height: number, channels?: number): ScreenFingerprint | null`
- Produces: `compareScreenFingerprints(a?: ScreenFingerprint | null, b?: ScreenFingerprint | null): number | null`

- [ ] **Step 1: Create the contract test**

Create `scripts/screen-fingerprint-contract.test.js` with this complete content:

```js
const assert = require('assert');
const {
  SCREEN_FINGERPRINT_CHANGE_THRESHOLD,
  createScreenFingerprintFromBitmap,
  compareScreenFingerprints,
} = require('../dist/core/screen-fingerprint');

function rgba(width, height, fill) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = fill.r;
    out[i * 4 + 1] = fill.g;
    out[i * 4 + 2] = fill.b;
    out[i * 4 + 3] = fill.a == null ? 255 : fill.a;
  }
  return out;
}

function splitFrame(width, height) {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const value = x < width / 2 ? 0 : 255;
      out[offset] = value;
      out[offset + 1] = value;
      out[offset + 2] = value;
      out[offset + 3] = 255;
    }
  }
  return out;
}

const black = createScreenFingerprintFromBitmap(rgba(16, 9, { r: 0, g: 0, b: 0 }), 16, 9);
const blackAgain = createScreenFingerprintFromBitmap(rgba(16, 9, { r: 0, g: 0, b: 0 }), 16, 9);
const white = createScreenFingerprintFromBitmap(rgba(16, 9, { r: 255, g: 255, b: 255 }), 16, 9);
const split = createScreenFingerprintFromBitmap(splitFrame(16, 9), 16, 9);

assert(black, 'black fingerprint should be created');
assert(white, 'white fingerprint should be created');
assert.strictEqual(black.width, 16);
assert.strictEqual(black.height, 9);
assert.strictEqual(black.values.length, 16 * 9);
assert.strictEqual(compareScreenFingerprints(black, blackAgain), 0);
assert(compareScreenFingerprints(black, white) >= 0.99, 'black vs white should be near-max diff');
assert(compareScreenFingerprints(black, split) >= SCREEN_FINGERPRINT_CHANGE_THRESHOLD, 'split frame should exceed change threshold');
assert.strictEqual(createScreenFingerprintFromBitmap(Buffer.alloc(3), 16, 9), null, 'invalid bitmap length should return null');
assert.strictEqual(compareScreenFingerprints(black, null), null, 'missing fingerprint should return null diff');
assert.strictEqual(compareScreenFingerprints({ width: 1, height: 1, values: [0] }, black), null, 'mismatched dimensions should return null diff');

console.log('screen-fingerprint-contract tests passed');
```

- [ ] **Step 2: Update `package.json` test script**

In `package.json`, replace the current `test` script:

```json
"test": "npm run build && node scripts/voice-input-contract.test.js"
```

with:

```json
"test": "npm run build && node scripts/voice-input-contract.test.js && node scripts/screen-fingerprint-contract.test.js"
```

- [ ] **Step 3: Run the new test to verify it fails before implementation**

Run:

```bash
npm test
```

Expected: FAIL after build because `../dist/core/screen-fingerprint` does not exist yet. The existing voice-input contract may pass before the failure.

- [ ] **Step 4: Create `src/core/screen-fingerprint.ts`**

Create `src/core/screen-fingerprint.ts` with this complete content:

```ts
export interface ScreenFingerprint {
  width: number;
  height: number;
  values: number[];
}

export const SCREEN_FINGERPRINT_WIDTH = 16;
export const SCREEN_FINGERPRINT_HEIGHT = 9;
export const SCREEN_FINGERPRINT_CHANNELS = 4;
export const SCREEN_FINGERPRINT_CHANGE_THRESHOLD = 0.20;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function createScreenFingerprintFromBitmap(
  bitmap: Buffer | Uint8Array,
  width: number,
  height: number,
  channels = SCREEN_FINGERPRINT_CHANNELS
): ScreenFingerprint | null {
  if (!bitmap || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  if (!Number.isInteger(channels) || channels < 3) return null;

  const expectedLength = width * height * channels;
  if (bitmap.length < expectedLength) return null;

  const values: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * channels;
      const r = bitmap[offset] ?? 0;
      const g = bitmap[offset + 1] ?? 0;
      const b = bitmap[offset + 2] ?? 0;
      values.push(clamp01((r + g + b) / (255 * 3)));
    }
  }

  return { width, height, values };
}

export function compareScreenFingerprints(
  a?: ScreenFingerprint | null,
  b?: ScreenFingerprint | null
): number | null {
  if (!a || !b) return null;
  if (a.width !== b.width || a.height !== b.height) return null;
  if (a.values.length !== b.values.length) return null;
  if (a.values.length === 0) return null;

  let total = 0;
  for (let i = 0; i < a.values.length; i++) {
    const left = clamp01(a.values[i]);
    const right = clamp01(b.values[i]);
    total += Math.abs(left - right);
  }

  return total / a.values.length;
}
```

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: PASS. TypeScript emits `dist/core/screen-fingerprint.js`.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test
```

Expected: PASS. Output includes both:

```text
voice-input-contract tests passed
screen-fingerprint-contract tests passed
```

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add package.json src/core/screen-fingerprint.ts scripts/screen-fingerprint-contract.test.js
git commit -m "feat: add screen fingerprint utility"
```

---

### Task 2: Attach fingerprints to captured screen frames

**Files:**
- Modify: `src/core/screen-analyzer.ts`

**Interfaces:**
- Consumes: `ScreenFingerprint`
- Consumes: `SCREEN_FINGERPRINT_WIDTH`
- Consumes: `SCREEN_FINGERPRINT_HEIGHT`
- Consumes: `createScreenFingerprintFromBitmap(bitmap, width, height): ScreenFingerprint | null`
- Produces: `ScreenCaptureFrame.fingerprint?: ScreenFingerprint`

- [ ] **Step 1: Add imports to `src/core/screen-analyzer.ts`**

At the top of `src/core/screen-analyzer.ts`, replace:

```ts
import { desktopCapturer, screen } from 'electron';
import { AIConfigManager } from './ai-config';
```

with:

```ts
import { desktopCapturer, screen } from 'electron';
import { AIConfigManager } from './ai-config';
import {
  SCREEN_FINGERPRINT_HEIGHT,
  SCREEN_FINGERPRINT_WIDTH,
  ScreenFingerprint,
  createScreenFingerprintFromBitmap,
} from './screen-fingerprint';
```

- [ ] **Step 2: Extend `ScreenCaptureFrame`**

In `src/core/screen-analyzer.ts`, replace the existing interface:

```ts
export interface ScreenCaptureFrame {
  imageDataUri: string;
  origin: { x: number; y: number };
  screenSize: { width: number; height: number };
  imageSize: { width: number; height: number };
}
```

with:

```ts
export interface ScreenCaptureFrame {
  imageDataUri: string;
  origin: { x: number; y: number };
  screenSize: { width: number; height: number };
  imageSize: { width: number; height: number };
  fingerprint?: ScreenFingerprint;
}
```

- [ ] **Step 3: Create fingerprint inside `captureScreenFrame()`**

In `src/core/screen-analyzer.ts`, inside `captureScreenFrame()`, replace this block:

```ts
      const matchedDisplay = displays.find((display) => String(display.id) === String(matchedSource.display_id)) ?? primaryDisplay;
      const resized = matchedSource.thumbnail.resize({ width: 1280, height: 720 });
      const imageSize = resized.getSize();
      const base64 = resized.toPNG().toString('base64');
      const frame = {
        imageDataUri: `data:image/png;base64,${base64}`,
        origin: { x: matchedDisplay.bounds.x, y: matchedDisplay.bounds.y },
        screenSize: { width: matchedDisplay.bounds.width, height: matchedDisplay.bounds.height },
        imageSize: { width: imageSize.width, height: imageSize.height },
      };
```

with:

```ts
      const matchedDisplay = displays.find((display) => String(display.id) === String(matchedSource.display_id)) ?? primaryDisplay;
      const resized = matchedSource.thumbnail.resize({ width: 1280, height: 720 });
      const fingerprintImage = matchedSource.thumbnail.resize({
        width: SCREEN_FINGERPRINT_WIDTH,
        height: SCREEN_FINGERPRINT_HEIGHT,
      });
      const fingerprintSize = fingerprintImage.getSize();
      const fingerprint = createScreenFingerprintFromBitmap(
        fingerprintImage.toBitmap(),
        fingerprintSize.width,
        fingerprintSize.height
      ) ?? undefined;
      const imageSize = resized.getSize();
      const base64 = resized.toPNG().toString('base64');
      const frame: ScreenCaptureFrame = {
        imageDataUri: `data:image/png;base64,${base64}`,
        origin: { x: matchedDisplay.bounds.x, y: matchedDisplay.bounds.y },
        screenSize: { width: matchedDisplay.bounds.width, height: matchedDisplay.bounds.height },
        imageSize: { width: imageSize.width, height: imageSize.height },
        fingerprint,
      };
```

- [ ] **Step 4: Add fingerprint debug metadata without logging values**

In `src/core/screen-analyzer.ts`, inside the existing `console.log('[ScreenAnalyzer][debug] capture frame:', { ... })`, replace:

```ts
        imageSize: frame.imageSize,
```

with:

```ts
        imageSize: frame.imageSize,
        fingerprint: frame.fingerprint
          ? { width: frame.fingerprint.width, height: frame.fingerprint.height, values: frame.fingerprint.values.length }
          : null,
```

This logs only shape metadata, not the fingerprint values.

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test
```

Expected: PASS. Output includes both contract test success lines.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add src/core/screen-analyzer.ts
git commit -m "feat: attach fingerprint to screen frames"
```

---

### Task 3: Cancel pointer session on pre-move fingerprint change

**Files:**
- Modify: `src/core/screen-target-pointer.ts`

**Interfaces:**
- Consumes: `ScreenCaptureFrame.fingerprint?: ScreenFingerprint`
- Consumes: `SCREEN_FINGERPRINT_CHANGE_THRESHOLD`
- Consumes: `compareScreenFingerprints(a, b): number | null`
- Consumes: `ScreenAnalyzer.captureScreenFrame(): Promise<ScreenCaptureFrame | null>`
- Produces: pre-move cancellation using existing `screenChangedResult(result)` when `diff >= 0.20`

- [ ] **Step 1: Add imports to `src/core/screen-target-pointer.ts`**

At the top of `src/core/screen-target-pointer.ts`, replace:

```ts
import { ScreenAnalyzer, ScreenTargetLocateResult } from './screen-analyzer';
```

with:

```ts
import { ScreenAnalyzer, ScreenCaptureFrame, ScreenTargetLocateResult } from './screen-analyzer';
import {
  SCREEN_FINGERPRINT_CHANGE_THRESHOLD,
  compareScreenFingerprints,
} from './screen-fingerprint';
```

- [ ] **Step 2: Add the pre-move fingerprint guard in `handle()`**

In `src/core/screen-target-pointer.ts`, inside `handle()`, find this existing block:

```ts
      const result = located.result;
      if (!this.canMove(result)) {
        const failureMessage = this.failureMessage(screenMessage, result);
        this.showBubble(failureMessage);
        this.finishSession();
        return { handled: true, moved: false, message: failureMessage, locateResult: result };
      }

      const screenPoint = this.screenAnalyzer.mapPointToScreen(located.frame, result.point!);
```

Replace it with:

```ts
      const result = located.result;
      if (!this.canMove(result)) {
        const failureMessage = this.failureMessage(screenMessage, result);
        this.showBubble(failureMessage);
        this.finishSession();
        return { handled: true, moved: false, message: failureMessage, locateResult: result };
      }

      if (await this.hasFingerprintChangedBeforeMove(id, located.frame)) {
        console.log('[ScreenTargetPointer][debug] screen changed before move:', { sessionId: id });
        return this.screenChangedResult(result);
      }

      if (!this.isCurrent(id)) {
        return this.cancelledResult('new-request');
      }

      const screenPoint = this.screenAnalyzer.mapPointToScreen(located.frame, result.point!);
```

- [ ] **Step 3: Add helper method `hasFingerprintChangedBeforeMove()`**

In `src/core/screen-target-pointer.ts`, add this method after `hasScreenChanged()` and before `successMessage()`:

```ts
  private async hasFingerprintChangedBeforeMove(sessionId: number, beforeFrame: ScreenCaptureFrame): Promise<boolean> {
    if (!beforeFrame.fingerprint) {
      console.log('[ScreenTargetPointer][debug] fingerprint skip: missing before fingerprint', { sessionId });
      return false;
    }

    const afterFrame = await this.screenAnalyzer.captureScreenFrame();
    if (!afterFrame?.fingerprint) {
      console.log('[ScreenTargetPointer][debug] fingerprint skip: missing after fingerprint', { sessionId });
      return false;
    }

    const diff = compareScreenFingerprints(beforeFrame.fingerprint, afterFrame.fingerprint);
    if (diff === null) {
      console.log('[ScreenTargetPointer][debug] fingerprint skip: incomparable fingerprints', {
        sessionId,
        before: { width: beforeFrame.fingerprint.width, height: beforeFrame.fingerprint.height, values: beforeFrame.fingerprint.values.length },
        after: { width: afterFrame.fingerprint.width, height: afterFrame.fingerprint.height, values: afterFrame.fingerprint.values.length },
      });
      return false;
    }

    const changed = diff >= SCREEN_FINGERPRINT_CHANGE_THRESHOLD;
    console.log('[ScreenTargetPointer][debug] fingerprint diff before move:', {
      sessionId,
      diff,
      threshold: SCREEN_FINGERPRINT_CHANGE_THRESHOLD,
      changed,
    });
    return changed;
  }
```

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
```

Expected: PASS. Output includes both contract test success lines.

- [ ] **Step 6: Manual smoke check if the app can be launched**

Run:

```bash
npm start
```

Manual checks:

1. Send `.帮我指出搜索框在哪` and keep the page still during Vision locating.
2. Expected: the pet can still move and show `point-visual` if Vision returns a valid high-confidence target.
3. Send `.帮我指出搜索框在哪` again, then visibly scroll or switch the page while Vision is waiting.
4. Expected: before moving, the session cancels and shows `屏幕变了，我刚才看到的位置可能不准啦。你重新发一次「.帮我指出xxx」吧。`.
5. Send `.总结这个页面`.
6. Expected: ordinary screen analysis still runs, not target pointer movement.

If app launch is not available in the environment, record in the final handoff that manual smoke was skipped and rely on build/tests plus code review.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add src/core/screen-target-pointer.ts
git commit -m "feat: cancel screen pointer on fingerprint change"
```

---

### Task 4: Update project documentation for fingerprint stability

**Files:**
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`
- Inspect: `docs/superpowers/specs/2026-07-15-screen-pointer-stability-design.md`

**Interfaces:**
- Documents: `ScreenCaptureFrame.fingerprint`
- Documents: Vision-before / Vision-after fingerprint diff with threshold `0.20`
- Documents: no wheel IPC, no global hooks, no continuous screenshot monitoring

- [ ] **Step 1: Update `PROJECT_INDEX.md` core module note**

In `PROJECT_INDEX.md`, find the `screen-analyzer.ts` bullet in `### core 模块速查` and replace it with:

```md
- `screen-analyzer.ts`：唯一屏幕截图与 Vision 分析服务；截图帧包含坐标映射元信息，并为屏幕目标指示提供低分辨率亮度 fingerprint，用于 Vision 定位前后的一次轻量屏幕变化判定。
```

- [ ] **Step 2: Update `PROJECT_INDEX.md` ScreenTargetPointer note**

In `PROJECT_INDEX.md`, find the `screen-target-pointer.ts` bullet in `### core 模块速查` and replace it with:

```md
- `screen-target-pointer.ts`：屏幕目标指示编排器，仅处理 `.` 显式屏幕分析中的“指出/在哪/帮我找”等请求，负责 Vision 定位结果校验、截图坐标映射、指向锚点换算、移动调用、屏幕变化取消和指向气泡；移动前会对 Vision 前后两帧 fingerprint 做一次保守 diff，明显变化时取消旧坐标。
```

- [ ] **Step 3: Update `PROJECT_INDEX.md` AI system note**

In `PROJECT_INDEX.md`, find the `屏幕目标指示` bullet under `### AI 系统` and replace it with:

```md
- **屏幕目标指示**：`.` 屏幕分析入口中命中明确“指出/在哪/帮我找”等关键词时，`ChatManager` 委托 `ScreenTargetPointer` 调用 Vision 结构化定位；置信度足够时通过 `MoveController` 把桌宠移动到目标旁边，并发送 `point-visual` 指向差分。指向 session 会保留前台窗口变化检测，并在 Vision 定位前后做一次低分辨率截图 fingerprint diff，若屏幕明显变化则取消旧坐标；普通聊天自然语言自动触发、wheel IPC、全局输入 hook 和持续截图监控暂缓，避免隐私、误触发和复杂度问题。
```

- [ ] **Step 4: Update `VERSION.md`**

In `VERSION.md`, under `## Unreleased`, add this bullet:

```md
- 屏幕目标指示稳定性：新增 Vision 定位前后一次轻量截图 fingerprint diff，屏幕明显变化时在移动前取消旧坐标；不引入 wheel IPC、全局输入 hook 或持续截图监控
```

If `## Unreleased` does not exist, add it near the top of the file before released version sections:

```md
## Unreleased

- 屏幕目标指示稳定性：新增 Vision 定位前后一次轻量截图 fingerprint diff，屏幕明显变化时在移动前取消旧坐标；不引入 wheel IPC、全局输入 hook 或持续截图监控
```

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Run tests**

Run:

```bash
npm test
```

Expected: PASS. Output includes both contract test success lines.

- [ ] **Step 7: Inspect working tree**

Run:

```bash
git status --short
```

Expected before commit: only `PROJECT_INDEX.md` and `VERSION.md` are modified by this task. If earlier tasks were not committed, commit them separately before this documentation commit.

- [ ] **Step 8: Commit Task 4**

Run:

```bash
git add PROJECT_INDEX.md VERSION.md
git commit -m "docs: document screen fingerprint stability"
```

---

## Final Verification Checklist

Run after all tasks are complete:

- [ ] `npm run build` passes.
- [ ] `npm test` passes and prints `voice-input-contract tests passed` and `screen-fingerprint-contract tests passed`.
- [ ] `.总结这个页面` still goes through ordinary screen analysis.
- [ ] `.帮我指出搜索框在哪` still enters target pointer flow.
- [ ] When the page stays still during Vision locating, target pointer flow can still move and point.
- [ ] When the page visibly changes during Vision locating, target pointer flow cancels before moving with the existing screen-changed message.
- [ ] Pointing-period scrolling remains a documented non-goal for this round.
- [ ] No wheel IPC, renderer wheel listener, global mouse hook, global keyboard hook, continuous screenshot monitoring, automatic click, automatic scroll, automatic retry, or ordinary-chat screen trigger is introduced.
- [ ] Work is committed in small commits, with documentation committed after implementation.

---

## Self-Review

- Spec coverage: Task 1 implements the low-resolution brightness fingerprint and `0.20` threshold. Task 2 attaches fingerprints to screenshot frames. Task 3 compares Vision-before and Vision-after frames before moving and cancels through existing screen-changed flow. Task 4 documents the final boundary and non-goals.
- Placeholder scan: No TBD/TODO placeholders remain. Every code step includes concrete code blocks, exact file paths, commands, and expected outcomes.
- Type consistency: `ScreenFingerprint`, `ScreenCaptureFrame.fingerprint`, `createScreenFingerprintFromBitmap`, `compareScreenFingerprints`, and `SCREEN_FINGERPRINT_CHANGE_THRESHOLD` are named consistently across all tasks.
