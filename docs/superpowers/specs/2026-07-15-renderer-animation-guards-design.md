# Renderer Animation Guards Bugfix Design

## Context

The main architecture follow-up refactors are complete: TTS engines, JSON config storage, AI memory storage, and bubble orchestration now have clearer boundaries. The current project index still lists several medium-priority renderer animation bugs:

- blink `isBlinking` may block visual state updates
- lonely exit animation closures may use stale state
- bubble fade's internal 500ms timeout cannot be cancelled
- `sleepyAnimRunning` may get stuck

These are visible UX correctness issues in the renderer layer. They are smaller and more concrete than starting another broad architecture split, so the next bounded iteration should fix renderer animation guard behavior without redesigning layout or changing main-process contracts.

## Goals

- Make renderer animation guard flags self-healing so transient animation state cannot permanently block visual updates.
- Prevent stale delayed callbacks from applying old lonely/sleepy/bubble state after the current visual state has changed.
- Ensure bubble fade/hide timers can be cancelled when a newer bubble appears.
- Preserve existing visual design, sprite names, CSS classes, IPC channels, state definitions, and timing intent.
- Keep changes local to renderer animation/control-flow code unless verification exposes a direct compile issue.
- Update `PROJECT_INDEX.md` so fixed known issues are removed or marked resolved.

## Non-goals

- Do not redesign sprite assets, CSS animation names, or layout.
- Do not change main-process state transition rules.
- Do not change IPC channel names or payload shapes.
- Do not rewrite the renderer into modules or a framework.
- Do not change chat, TTS, proactive reaction, or config behavior.
- Do not add a new test framework in this iteration.

## Proposed approach

Use a small renderer-local guard pattern:

1. Track timeout handles for delayed visual cleanup and bubble fade cleanup.
2. Clear the previous timeout before scheduling a new one for the same concern.
3. When a delayed callback fires, re-check the current state or generation token before mutating DOM/classes/flags.
4. Add small reset paths so guard flags such as `isBlinking` and `sleepyAnimRunning` cannot remain true after state changes or interrupted animations.

The key idea is not to change animation intent, but to make delayed callbacks conditional on the state that created them still being current.

## Components

### Renderer animation guards

Responsibility: protect `renderer.ts` from stale timeout/animation callbacks.

The implementation should inspect and adjust only the relevant renderer code paths:

- blink scheduling and `isBlinking`
- sleepy animation guard and `sleepyAnimRunning`
- lonely animation exit callbacks
- bubble hide/fade timeout handling

The plan should name exact functions and variables after a targeted read of `src/renderer/renderer.ts`.

### Project index

Responsibility: reflect that the known medium-priority animation guard issues have been addressed.

After implementation, `PROJECT_INDEX.md` should either remove the fixed bullets from the known issue list or move them into a short resolved note, without overstating unrelated fixes.

## Error handling and edge cases

- If a state changes while a timeout is pending, the pending callback must not apply visual classes for the old state.
- If a new bubble appears while an old fade timeout is pending, the old timeout must not hide the new bubble.
- If blink is interrupted by state change, `isBlinking` should be reset or ignored so `updateVisual` can proceed.
- If sleepy animation is interrupted, `sleepyAnimRunning` should not remain true indefinitely.
- If the relevant DOM element is missing, existing renderer behavior should be preserved; do not introduce new crashes.

## Testing and verification

Required verification for the implementation plan:

- `npm run build` must pass.
- `npm test` should be run. If the project still has no test script, record the exact `Missing script: "test"` result and do not claim tests passed.
- Verify by targeted search/diff review that only renderer animation/bubble guard code and `PROJECT_INDEX.md` changed.
- Verify `show-bubble`, TTS playback, proactive reaction, and main-process IPC files are unchanged unless a compile error directly requires a fix.
- Verify `PROJECT_INDEX.md` no longer lists the fixed animation guard issues as unresolved.

## Implementation notes

Implemented in `src/renderer/renderer.ts`:

- Added generation guards for blink, sleepy, lonely and bubble/subtitle timeout chains.
- Blink frame callbacks now check generation/current state before mutating sprites, and `stopBlinkAnim()` resets stale `isBlinking` state.
- Sleepy animation callbacks now run through one guarded scheduler; `stopSleepyAnim()` invalidates old callbacks, clears the active timeout and resets `sleepyAnimRunning`.
- Lonely enter/exit callbacks now invalidate old animation chains and avoid applying stale exit targets after a newer state arrives.
- Bubble and subtitle fade/hide callbacks now share generation checks so old hide timers cannot hide newer content.

Verification recorded during implementation:

- `npm run build` passed.
- `npm test` was run as required; project has no test script, so npm reported `Missing script: "test"`.
- Targeted diff review was limited to `src/renderer/renderer.ts`, `PROJECT_INDEX.md` and this design note.

## Commit strategy

Recommended implementation commits:

1. `fix: harden renderer animation guards`
2. `docs: update renderer known issues`

If the code change is tiny, the documentation update may be a separate commit for review clarity.

## Success criteria

- Renderer delayed animation callbacks do not apply stale visual state.
- Bubble hide/fade timeouts are cancellable and cannot hide newer bubbles.
- Blink and sleepy guard flags cannot permanently block future visual updates.
- Build verification passes, and missing test script status is recorded honestly if unchanged.
- `PROJECT_INDEX.md` accurately reflects the remaining known issues.
