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
