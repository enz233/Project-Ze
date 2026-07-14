# TTS Engine Interface Design

## Context

The architecture cleanup work is complete. Its deferred follow-up list identifies TTS engine interface extraction as a bounded refactor: define a common `TTSEngine` boundary, use a `createTTSEngine(config)` factory, and move provider-specific synthesis details out of `TTSManager` without changing visible playback behavior.

The previous iteration also fixed the TTS playback acknowledgement path so the renderer returns the same `playbackId` that the main process sends. This design preserves that playback chain and only reorganizes synthesis/provider responsibilities.

## Goals

- Keep `TTSManager` as the only orchestration entry point for chat and app code.
- Separate provider-specific audio synthesis from Electron playback, subtitles, stop handling, and `playbackId` coordination.
- Introduce a small `TTSEngine` interface that every provider implementation follows.
- Add a `createTTSEngine(config)` factory so provider selection is centralized.
- Preserve current visible behavior for TTS enablement, fallback to text display, subtitles, stop, and playback completion.
- Keep the refactor incremental and build-verifiable.

## Non-goals

- Do not redesign the TTS settings UI.
- Do not add a new TTS provider.
- Do not change the renderer/preload playback IPC contract except if a compile issue exposes a mismatch.
- Do not change chat response segmentation or `<item>` parsing.
- Do not introduce a full test framework in this iteration.

## Proposed approach

Use a shallow provider boundary:

```ts
export interface TTSAudioResult {
  base64: string;
  mimeType?: string;
}

export interface TTSEngine {
  synthesize(text: string): Promise<TTSAudioResult>;
}
```

Provider implementations should own only provider API details:

- request URL and headers
- request body shape
- response parsing
- provider-specific error messages
- conversion of provider response to base64 audio data

`TTSManager` should continue to own orchestration:

- reading current TTS config
- checking whether TTS is enabled
- splitting/scheduling multiple segments through `speakAll()`
- calling the selected engine
- sending `tts-play` with `base64`, subtitle text, and `playbackId`
- waiting for matching `tts-playback-done`
- timeout and stop behavior
- returning `false` so callers can fall back to text-only bubbles when synthesis/playback cannot proceed

## Components

### `TTSEngine` interface

Add a small interface module under `src/core/tts-engine.ts` or an equivalent focused file. The interface must be independent of Electron and must not import `BrowserWindow`, `ipcMain`, or renderer-facing types.

### Provider engines

Move existing provider synthesis logic into provider-specific classes or functions. If the current code already has provider-specific files, adapt them to implement `TTSEngine` rather than creating duplicate wrappers.

Provider engines may depend on the relevant config object, but should not read config files themselves. They receive already-loaded config from `TTSManager` or the factory.

### `createTTSEngine(config)` factory

Add one factory that selects the provider implementation from the current TTS config. Unknown or unsupported providers should return `null` or throw a controlled error that `TTSManager` converts into a normal TTS failure.

The factory is the only place that should switch on provider names.

### `TTSManager`

Refactor `TTSManager` so synthesis becomes:

```txt
load config → create engine → engine.synthesize(text) → play(result.base64, text, playbackId)
```

It should not contain provider-specific request/response branches after the refactor, except for compatibility glue that is explicitly temporary and documented.

## Data flow

```txt
ChatManager
→ TTSManager.speakAll(texts)
→ TTSManager.speak(text)
→ createTTSEngine(config)
→ TTSEngine.synthesize(text)
→ TTSManager.play(base64, text, playbackId)
→ preload/renderer playback
→ tts-playback-done(playbackId)
→ TTSManager resolves the matching segment
```

## Error handling

- If TTS is disabled, `TTSManager` returns the same value it returns today and does not create an engine.
- If provider config is incomplete, the engine or factory reports a controlled failure; `TTSManager` logs it and lets chat fall back to text display.
- If provider API calls fail, provider engines include enough context in thrown errors for logs without exposing secrets.
- If playback completion is not received, existing timeout protection remains in `TTSManager`.
- `stop()` remains an orchestration concern and must not move into provider engines.

## Testing and verification

Required verification for the implementation plan:

- `npm run build` must pass.
- `npm test` should be run. If the project still has no test script, record the exact `Missing script: "test"` result and do not claim tests passed.
- Verify by search that provider-specific fetch/response parsing has moved out of `TTSManager` or is explicitly documented as temporary compatibility code.
- Verify by search that provider engine files do not import Electron playback APIs.
- Verify by search that `tts-play`, `tts-playback-done`, and `playbackId` still flow through `TTSManager`, preload, and renderer.

## Commit strategy

Recommended implementation commits:

1. `refactor: introduce tts engine interface`
2. `refactor: move tts provider synthesis behind engines`
3. `docs: update tts architecture notes`

If the implementation is small, the first two commits may be combined, but documentation should remain easy to review.

## Success criteria

- `TTSManager` is easier to read because provider-specific synthesis is behind `TTSEngine`.
- Adding a future provider requires a new engine and a factory registration, not edits throughout playback orchestration.
- Current TTS playback, subtitles, stop behavior, and chat fallback behavior are preserved.
- Build verification passes and missing test script status is recorded honestly if unchanged.
