# Eight Direction Point Visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the eight PNG files in `src/assets/sprites/point/` to show a direction-matched point visual for screen target pointer sessions, then automatically restore the normal visual after about 7 seconds without moving back.

**Architecture:** Keep `ScreenTargetPointer` as the owner of screen target session state and point pose selection. Extend its pose type from four directions to eight directions, update pose selection to use angle buckets, and let renderer load `src/assets/sprites/point/<direction>.png` through the existing `point-visual` IPC. Keep cancellation and restoration idempotent.

**Tech Stack:** Electron 42, TypeScript 6, CommonJS, existing `ScreenTargetPointer`, existing renderer IIFE in `src/renderer/renderer.ts`, existing `point-visual` IPC.

## Global Constraints

- Use方案 A：在现有 point-visual 链路上扩展八方向映射，不新增大型 `PointPoseController`。
- Use these directions: `right`, `right_down`, `down`, `left_down`, `left`, `left_up`, `up`, `right_up`.
- Use these existing assets from `src/assets/sprites/point/`: `left_up.png`, `up.png`, `right_up.png`, `left.png`, `right.png`, `left_down.png`, `down.png`, `right_down.png`.
- Point visual hold duration is `7000ms`.
- After the hold duration, restore the normal visual only; do not move the pet back.
- New point request, drag, cancellation, or another visual owner must clear old point visual and timers.
- Do not add automatic click, automatic scroll, automatic retry, screenshot monitoring, wheel IPC, global hooks, candidate confirmation UI, or ordinary-chat natural-language triggering.
- Keep ordinary `.总结这个页面` screen analysis unaffected.
- Prefer reading docs and minimal source slices only.
- End implementation with project docs update, `npm run build`, `npm test`, and git commit.

## 2026-07-16 follow-up: point visual guard fix

Runtime issue: point pose should remain visible for `7000ms`, but renderer-side idle/blink/sleepy sprite updates could call `setSprite()` directly and replace the image before the `ScreenTargetPointer` hold timer fired. The fix adds an explicit renderer sprite guard: while `isPointVisualActive` is true, only `point-*` sprites and dragged fallback sprites may update the image; ordinary state sprites are blocked until `point-visual` sends `active:false`. `scripts/point-visual-guard-contract.test.js` covers the `7000ms` duration constant and the block/allow matrix.

---

## File Structure

- Modify: `src/core/screen-target-pointer.ts`
  - Owns `PointerPose`, `PointVisualEvent`, direction choice, point offsets, and hold duration.
  - Extends four old `point-*` poses to eight `point-*` poses.
- Modify: `src/renderer/renderer.ts`
  - Accepts eight `point-*` pose names from `point-visual` IPC.
  - Maps `point-right_down` to `src/assets/sprites/point/right_down.png` by changing point sprite folder handling.
  - Keeps fallback to dragged direction sprites if a point asset fails to load.
- Modify: `PROJECT_INDEX.md`
  - Documents eight-direction point visual and 7-second restore behavior.
- Modify: `VERSION.md`
  - Adds an Unreleased note for eight-direction point visuals.
- Inspect only: `docs/superpowers/specs/2026-07-15-eight-direction-point-visual-design.md`
  - Source of truth for scope and non-goals.

---

### Task 1: Extend ScreenTargetPointer to eight point poses

**Files:**
- Modify: `src/core/screen-target-pointer.ts`

**Interfaces:**
- Produces: `PointerPose = 'point-right' | 'point-right_down' | 'point-down' | 'point-left_down' | 'point-left' | 'point-left_up' | 'point-up' | 'point-right_up'`
- Produces: `PointVisualEvent.pose?: PointerPose`
- Produces: `POINT_HOLD_MS = 7000`
- Produces: `choosePose(screenPoint: { x: number; y: number }): PointerPoseConfig`

- [ ] **Step 1: Update pose type and hold duration**

In `src/core/screen-target-pointer.ts`, replace the current pose type and hold duration:

```ts
export type PointerPose = 'point-right' | 'point-left' | 'point-up' | 'point-down';
```

with:

```ts
export type PointerPose =
  | 'point-right'
  | 'point-right_down'
  | 'point-down'
  | 'point-left_down'
  | 'point-left'
  | 'point-left_up'
  | 'point-up'
  | 'point-right_up';
```

Then replace:

```ts
const POINT_HOLD_MS = 5000;
```

with:

```ts
const POINT_HOLD_MS = 7000;
```

- [ ] **Step 2: Extend `DEFAULT_POSES`**

In `src/core/screen-target-pointer.ts`, replace the whole `DEFAULT_POSES` constant with:

```ts
const DEFAULT_POSES: Record<PointerPose, PointerPoseConfig> = {
  'point-right': { pose: 'point-right', pointerOffset: { x: 220, y: 135 } },
  'point-right_down': { pose: 'point-right_down', pointerOffset: { x: 210, y: 210 } },
  'point-down': { pose: 'point-down', pointerOffset: { x: 125, y: 235 } },
  'point-left_down': { pose: 'point-left_down', pointerOffset: { x: 40, y: 210 } },
  'point-left': { pose: 'point-left', pointerOffset: { x: 30, y: 135 } },
  'point-left_up': { pose: 'point-left_up', pointerOffset: { x: 40, y: 60 } },
  'point-up': { pose: 'point-up', pointerOffset: { x: 125, y: 35 } },
  'point-right_up': { pose: 'point-right_up', pointerOffset: { x: 210, y: 60 } },
};
```

These offsets are conservative first-pass estimates matching a roughly 250px pet window. Later visual tuning should only edit this table.

- [ ] **Step 3: Replace `choosePose()` with angle bucket selection**

In `src/core/screen-target-pointer.ts`, replace the entire `choosePose()` method with:

```ts
  private choosePose(screenPoint: { x: number; y: number }): PointerPoseConfig {
    const bounds = this.mainWindow.getBounds();
    const windowCenterX = bounds.x + bounds.width / 2;
    const windowCenterY = bounds.y + bounds.height / 2;
    const dx = screenPoint.x - windowCenterX;
    const dy = screenPoint.y - windowCenterY;
    const poseKey = this.poseFromDelta(dx, dy);
    const pose = DEFAULT_POSES[poseKey];

    console.log('[ScreenTargetPointer][debug] choose pose:', {
      screenPoint,
      windowBounds: bounds,
      windowCenter: { x: windowCenterX, y: windowCenterY },
      delta: { x: dx, y: dy },
      angleDegrees: Number.isFinite(dx) && Number.isFinite(dy) ? Math.atan2(dy, dx) * 180 / Math.PI : null,
      pose,
    });

    return pose;
  }

  private poseFromDelta(dx: number, dy: number): PointerPose {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 'point-right';
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return 'point-right';

    const normalizedDegrees = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    if (normalizedDegrees < 22.5 || normalizedDegrees >= 337.5) return 'point-right';
    if (normalizedDegrees < 67.5) return 'point-right_down';
    if (normalizedDegrees < 112.5) return 'point-down';
    if (normalizedDegrees < 157.5) return 'point-left_down';
    if (normalizedDegrees < 202.5) return 'point-left';
    if (normalizedDegrees < 247.5) return 'point-left_up';
    if (normalizedDegrees < 292.5) return 'point-up';
    return 'point-right_up';
  }
```

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: PASS. TypeScript accepts the expanded pose type and helper method.

---

### Task 2: Update renderer point visual loading and fallback

**Files:**
- Modify: `src/renderer/renderer.ts`

**Interfaces:**
- Consumes: `point-visual` payload `{ active: boolean; pose?: string; reason?: string }`
- Consumes: eight pose strings from Task 1.
- Produces: renderer loads `SPRITE_DIR + 'point/' + <direction> + '.png'` when sprite name starts with `point-`.

- [ ] **Step 1: Replace point pose validation in `updatePointVisual()`**

In `src/renderer/renderer.ts`, inside `updatePointVisual(payload: any)`, replace:

```ts
    var pose = payload.pose || 'point-right';
    if (pose !== 'point-left' && pose !== 'point-right' && pose !== 'point-up' && pose !== 'point-down') {
      pose = 'point-right';
    }
```

with:

```ts
    var pose = normalizePointPose(payload.pose);
```

- [ ] **Step 2: Add point pose normalization and fallback helpers**

In `src/renderer/renderer.ts`, replace the existing `fallbackSpriteForPose()` function with this full block:

```ts
  function normalizePointPose(pose: any): string {
    if (pose === 'point-right') return 'point-right';
    if (pose === 'point-right_down') return 'point-right_down';
    if (pose === 'point-down') return 'point-down';
    if (pose === 'point-left_down') return 'point-left_down';
    if (pose === 'point-left') return 'point-left';
    if (pose === 'point-left_up') return 'point-left_up';
    if (pose === 'point-up') return 'point-up';
    if (pose === 'point-right_up') return 'point-right_up';
    return 'point-right';
  }

  function fallbackSpriteForPose(pose: string): string {
    if (pose === 'point-left' || pose === 'point-left_up' || pose === 'point-left_down') return 'dragged_left';
    if (pose === 'point-up' || pose === 'point-right_up') return 'dragged_up';
    if (pose === 'point-down' || pose === 'point-right_down') return 'dragged_down';
    return 'dragged_right';
  }
```

This keeps old fallback behavior available if any new point asset fails to load.

- [ ] **Step 3: Change point sprite folder mapping**

In `src/renderer/renderer.ts`, inside `setSprite(name: string, fallback?: string, force?: boolean)`, replace:

```ts
    else if (name.indexOf('point') === 0) folder = 'basic/point';
```

with:

```ts
    else if (name.indexOf('point') === 0) folder = 'point';
```

This makes `setSprite('point-right_down')` load `src/assets/sprites/point/point-right_down.png` by default, so Task 2 must also add the filename conversion in Step 4.

- [ ] **Step 4: Convert point pose names to asset file names**

In `src/renderer/renderer.ts`, inside `setSprite(name: string, fallback?: string, force?: boolean)`, replace:

```ts
    var path = SPRITE_DIR + folder + '/' + name + '.png';
```

with:

```ts
    var assetName = name;
    if (name.indexOf('point-') === 0) {
      assetName = name.slice('point-'.length);
    }
    var path = SPRITE_DIR + folder + '/' + assetName + '.png';
```

Examples after this change:

```text
point-right      -> src/assets/sprites/point/right.png
point-right_down -> src/assets/sprites/point/right_down.png
point-left_up    -> src/assets/sprites/point/left_up.png
```

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: PASS. Renderer TypeScript compiles.

---

### Task 3: Update project documentation

**Files:**
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`

**Interfaces:**
- Documents: `point-visual | {active, pose?, reason?}` supports eight `point-*` poses.
- Documents: point assets live in `src/assets/sprites/point/`.
- Documents: point visual auto-restores after about 7 seconds without moving back.

- [ ] **Step 1: Update `PROJECT_INDEX.md` core module note**

In `PROJECT_INDEX.md`, replace the existing `screen-target-pointer.ts` bullet with:

```md
- `screen-target-pointer.ts`：屏幕目标指示编排器，仅处理 `.` 显式屏幕分析中的“指出/在哪/帮我找”等请求，负责 Vision 定位结果校验、截图坐标映射、八方向 point 指向姿态选择、指向锚点换算、移动调用、屏幕变化取消和指向气泡。
```

- [ ] **Step 2: Update `PROJECT_INDEX.md` renderer sprite note**

In `PROJECT_INDEX.md`, under `### 渲染进程 renderer.ts`, replace the sprite-path note:

```md
- **精灵图路径**：`setSprite(name)` 自动根据名字前缀匹配子目录
```

with:

```md
- **精灵图路径**：`setSprite(name)` 自动根据名字前缀匹配子目录；`point-*` 会映射到 `src/assets/sprites/point/<direction>.png`，例如 `point-right_down` -> `point/right_down.png`
```

- [ ] **Step 3: Update `PROJECT_INDEX.md` AI system note**

In `PROJECT_INDEX.md`, replace the `屏幕目标指示` bullet under `### AI 系统` with:

```md
- **屏幕目标指示**：`.` 屏幕分析入口中命中明确“指出/在哪/帮我找”等关键词时，`ChatManager` 委托 `ScreenTargetPointer` 调用 Vision 结构化定位；置信度足够时通过 `MoveController` 把桌宠移动到目标旁边，并发送 `point-visual` 八方向指向差分。point 差分约 7 秒后只恢复普通视觉，不移动回原位；普通聊天自然语言自动触发暂缓，避免隐私和误触发问题。
```

- [ ] **Step 4: Update `PROJECT_INDEX.md` IPC row**

In `PROJECT_INDEX.md`, replace the `point-visual` IPC row with:

```md
| point-visual | {active, pose?, reason?} | 屏幕目标指示期间的八方向 point-* 指向差分，pose 可为 point-right / point-right_down / point-down / point-left_down / point-left / point-left_up / point-up / point-right_up，资源缺失时 renderer 回退到 dragged 方向差分 |
```

- [ ] **Step 5: Update `VERSION.md`**

In `VERSION.md`, under `## Unreleased`, add:

```md
- 屏幕目标指示视觉：使用 `src/assets/sprites/point/` 八方向 point 差分，按目标相对方向选择姿态，并在约 7 秒后只恢复普通视觉、不移动回原位
```

If `## Unreleased` does not exist, add it near the top before released sections:

```md
## Unreleased

- 屏幕目标指示视觉：使用 `src/assets/sprites/point/` 八方向 point 差分，按目标相对方向选择姿态，并在约 7 秒后只恢复普通视觉、不移动回原位
```

- [ ] **Step 6: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

---

### Task 4: Final verification and commit

**Files:**
- Verify: `src/core/screen-target-pointer.ts`
- Verify: `src/renderer/renderer.ts`
- Verify: `PROJECT_INDEX.md`
- Verify: `VERSION.md`
- Include untracked point assets: `src/assets/sprites/point/*.png`

**Interfaces:**
- Verifies: TypeScript build.
- Verifies: Existing contract tests.
- Produces: one implementation commit containing code, docs, and point assets.

- [ ] **Step 1: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 2: Run tests**

Run:

```bash
npm test
```

Expected: PASS. Current test script should print:

```text
voice-input-contract tests passed
```

If additional tests are already present in the current branch, they must pass too.

- [ ] **Step 3: Inspect working tree**

Run:

```bash
git status --short
```

Expected: changes include this feature's code/docs plus `src/assets/sprites/point/`. If unrelated pre-existing changes remain, do not overwrite or stage them unless they are required for this feature.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add src/core/screen-target-pointer.ts src/renderer/renderer.ts PROJECT_INDEX.md VERSION.md src/assets/sprites/point
git commit -m "feat: add eight direction point visual"
```

Expected: commit succeeds.

---

## Final Verification Checklist

- [ ] `npm run build` passes.
- [ ] `npm test` passes.
- [ ] `src/assets/sprites/point/` eight PNG files are tracked by git.
- [ ] `ScreenTargetPointer` can emit all eight point poses.
- [ ] Renderer accepts all eight point poses.
- [ ] `point-right_down` maps to `src/assets/sprites/point/right_down.png`, not `src/assets/sprites/point/point-right_down.png`.
- [ ] Point visual hold duration is `7000ms`.
- [ ] Clearing point visual is idempotent.
- [ ] No click, scroll, retry, screenshot monitoring, wheel IPC, global hook, candidate confirmation UI, or ordinary-chat trigger is introduced.

---

## Self-Review

- Spec coverage: Task 1 implements eight-direction pose selection and 7-second hold. Task 2 implements renderer support and asset mapping. Task 3 documents the behavior. Task 4 verifies and commits code/docs/assets.
- Placeholder scan: No TBD/TODO placeholders remain; every implementation step includes exact paths, code replacements, commands, and expected results.
- Type consistency: `PointerPose`, `PointVisualEvent.pose`, `DEFAULT_POSES`, `poseFromDelta()`, and renderer `normalizePointPose()` use matching `point-*` names. Asset filenames are converted from `point-right_down` to `right_down.png` in renderer.
