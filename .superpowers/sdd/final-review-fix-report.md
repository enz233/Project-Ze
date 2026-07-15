# Final Review Fix Report

Date: 2026-07-15

## Files changed

- `src/core/asr-openai-compatible.ts` — added realtime auth via WebSocket subprotocol plus initial auth/session message; kept chunked fallback bearer auth.
- `src/core/asr-engine.ts` — reject unsupported ASR providers instead of silently routing through OpenAI-compatible engine.
- `src/core/voice-audio-cache.ts` — added active cache policy update method.
- `src/main/main.ts` — refresh active voice cache config on ASR save and notify renderer of updated ASR config.
- `src/main/preload.ts` — exposed ASR config update event to renderer.
- `src/main/settings.html` — hid unsupported ASR providers and validates provider/cache numeric fields before saving.
- `src/renderer/renderer.ts` — consumes saved hold-to-talk shortcut, refreshes it after settings save, and checks ASR enabled before requesting microphone permission.
- `scripts/voice-input-contract.test.js` — covered unsupported provider rejection.
- `docs/superpowers/specs/2026-07-15-voice-input-asr-design.md` — documented supported provider scope and realtime WebSocket auth limitation.
- `package.json` — bumped version to 0.3.0.
- `package-lock.json` — bumped root package version to 0.3.0.

## Commands and results

- `npm run build` — passed.
- `npm run build && npm test` — passed; `voice-input-contract tests passed`.
- `npm run build` — passed.
- `git diff --check` — passed.
- `git status --short` — showed expected modified files before commit.

NPM emitted existing config warnings for `electron_mirror` / `electron-mirror`; they did not fail verification.

## Commit

- Commit hash: `35f476e`
- Commit message: `fix(voice): stabilize voice input verification`

## Limitations

- Browser/Electron WebSocket clients still cannot set arbitrary HTTP `Authorization` upgrade headers. Realtime auth now uses the OpenAI-compatible `openai-insecure-api-key.<key>` subprotocol plus an initial `session.auth` message; endpoints requiring header-only upgrade auth need chunked fallback or a future provider-specific Node-side socket implementation.
- ASR settings currently expose only OpenAI-compatible provider selection until additional provider engines are implemented.

---

## Final re-review fix — post-commit realtime drain

Date: 2026-07-15

### Files changed

- `src/core/asr-openai-compatible.ts` — after `input_audio_buffer.commit`, waits briefly for provider final/error/close events before local close, drains pending events during that grace period, and still closes locally after timeout to avoid hanging. Existing realtime subprotocol auth and initial `session.auth` behavior are preserved.
- `scripts/voice-input-contract.test.js` — added lightweight contract coverage for terminal-event classification and a fake WebSocket stream that emits a final transcript after commit.

### Commands and results

- `npm test` — passed; `voice-input-contract tests passed`.
- `npm run build` — passed.

NPM emitted existing config warnings for `electron_mirror` / `electron-mirror`; they did not fail verification.
