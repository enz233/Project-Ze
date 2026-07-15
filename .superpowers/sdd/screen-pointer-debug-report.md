# Screen Pointer Debug Instrumentation Report

Status: DONE

## Purpose

Added diagnostic logs for the screen target pointer movement and screen-change decision chain, so runtime behavior can be diagnosed from logs before changing movement logic.

## Modified files

- `src/core/screen-analyzer.ts`
  - Logs available display/source metadata during capture.
  - Logs selected capture frame metadata: source display id/name, origin, screen size, image size.
  - Logs Vision structured locate result.
  - Logs screenshot point to screen coordinate mapping, including scale factors.

- `src/core/screen-target-pointer.ts`
  - Logs pointer session start: session id, normalized message, active window title, current pet window bounds.
  - Logs locate response and frame metadata.
  - Logs screen-change cancellation after locate/move.
  - Logs pose selection inputs: target screen point, pet bounds, window center, delta, selected pose.
  - Logs final move target: screen point, pose, pointer offset, computed top-left, current bounds.
  - Logs move result and active-window title after move.
  - Logs cancellation reason/state.
  - Logs polling monitor title changes.

## Verification

Command:

```bash
npm --prefix C:/Users/25623/Desktop/AItest/AI_pet/code run build
```

Result: PASS. `tsc` completed successfully.

Note: npm printed the existing warning about unknown project config `electron_mirror`.

## How to use

Run the app, trigger a pointer request such as:

```text
.帮我指出下载按钮在哪
```

Then check logs for these tags:

- `[ScreenAnalyzer][debug] capture sources`
- `[ScreenAnalyzer][debug] capture frame`
- `[ScreenAnalyzer][debug] locate result`
- `[ScreenAnalyzer][debug] map point to screen`
- `[ScreenTargetPointer][debug] session start`
- `[ScreenTargetPointer][debug] located`
- `[ScreenTargetPointer][debug] choose pose`
- `[ScreenTargetPointer][debug] move target`
- `[ScreenTargetPointer][debug] move finished`
- `[ScreenTargetPointer][debug] screen changed after locate`
- `[ScreenTargetPointer][debug] screen changed after move`
- `[ScreenTargetPointer][debug] screen monitor changed`

These logs should identify whether the issue is from Vision point selection, coordinate mapping, pose/pointer offset, movement clamp, or screen-change detection.

## Concerns

- This task intentionally adds diagnostics only; it does not change movement or screen-change behavior.
- Debug logs are verbose and should be removed or gated after the root cause is confirmed.
