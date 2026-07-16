# Task 9 final-fix report

Date: 2026-07-16

## Changes

- `VoiceInputManager.stopSession()` now continues after recoverable ASR errors and still finalizes later final transcripts.
- `testFunASRLocalConnection()` now closes the WebSocket before resolving on error and reuses the shared FunASR connection failure message constant.
- Renderer local realtime PCM startup failures now include the thrown error message for FunASR as well as Qwen, while preserving cleanup.
- Settings/core preset parity now includes `funasr-local`.
- Removed dead Qwen-only settings recognition-test branch after the shared local PCM path.
- Removed duplicate FunASR hint display mutation in settings preset application.
- Removed unused `__funasrTestInternals` export.

## Tests

- `npm run build` passed.
- `node scripts/voice-input-contract.test.js` passed.
- `npm test` passed.
- `git diff --check` passed with only the pre-existing LF-to-CRLF warning for `.superpowers/sdd/progress.md`.

## Commits

- `c8d9358` fix: handle FunASR recoverable ASR errors
- included in final commit: fix: keep recoverable ASR UI errors non-terminal

## Final re-review UI consumer fix

Date: 2026-07-16

### Changes

- Main chat transcript consumer treats `payload.type === 'error' && payload.recoverable === true` as a non-terminal warning and preserves `voiceLastSessionId` for later final/partial events.
- Settings recognition-test transcript consumer treats recoverable errors as non-terminal status and preserves `asrRecognitionSessionId`; non-recoverable errors keep existing failed/terminal behavior.
- Added focused source contract assertions for renderer and settings recoverable-error handling.

### Tests

- `npm test` passed.
- `npm run build` passed.
- `node scripts/voice-input-contract.test.js` passed.
- `git diff --check` passed.

## Remaining FunASR correctness fixes

Date: 2026-07-16

### Changes

- Settings recognition test no longer requires `MediaRecorder` for local PCM providers (Qwen-ASR/FunASR); MediaRecorder remains required for non-local PCM/chunked providers.
- `normalizeFunASREvent()` now prefers transcript text over informational `message` fields while preserving true `error`/message-only payloads as fatal errors.
- `FunASRLocalEngine.stream()` discards queued late socket errors after a terminal final transcript so successful recognition is not converted to failure.
- FunASR preset/application/load collection clears API Key and model so local FunASR config does not persist stale cloud credentials; non-FunASR presets retain existing key behavior.
- Settings ASR connection test now validates FunASR Base URL only for FunASR and returns the unsupported independent-test message for other providers instead of missing API key/model validation.
- Added contract coverage for all above cases.

### Tests

- `npm test` passed.
- `npm run build` passed.
- `node scripts/voice-input-contract.test.js` passed.
- `git diff --check` passed with only LF-to-CRLF warning for `src/core/asr-funasr-local.ts`.
