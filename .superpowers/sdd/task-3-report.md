status: DONE

commits:
- f234776b937963f9bda6109382ff2ec31b147c51 feat(voice): wire funasr local engine

files changed:
- C:/Users/25623/Desktop/AItest/AI_pet/code/.claude/worktrees/funasr-local-asr/scripts/voice-input-contract.test.js
- C:/Users/25623/Desktop/AItest/AI_pet/code/.claude/worktrees/funasr-local-asr/src/core/asr-engine.ts
- C:/Users/25623/Desktop/AItest/AI_pet/code/.claude/worktrees/funasr-local-asr/src/core/asr-funasr-local.ts

tests run with results:
- npm run build && node scripts/voice-input-contract.test.js
  - RED: build passed; contract test failed as expected with `Unsupported ASR provider: funasr-local-runtime`.
  - GREEN: build passed; contract test passed with `voice-input-contract tests passed`.

self-review notes:
- Followed the Task 3 brief and TDD sequence: added factory contract assertion first, verified the expected RED failure, then wired factory dispatch and replaced the FunASR stream skeleton.
- FunASR stream now validates ws/wss Base URL via existing helper, opens a WebSocket, sends start/end events, sends PCM chunks decoded from base64 as binary buffers, normalizes server messages, drains terminal events, and yields configured errors for invalid payloads, connection failure, timeout/missing transcription, and invalid URL.
- Did not modify settings UI, renderer routing, docs outside this required report, IPC, Qwen-ASR behavior, or OpenAI-compatible ASR behavior.
- Commit includes exactly the three Task 3 code/test files requested.

concerns:
- `npm run build` emits an existing npm warning: `Unknown project config "electron_mirror"`; build and tests still pass.
- Working tree had a pre-existing uncommitted modification in `.superpowers/sdd/task-2-report.md`; it was not touched or committed by this task.

---

## Task 3 review fix report — 2026-07-16

status: DONE

changes:
- Added bounded FunASR WebSocket open timeout and ensured sockets are closed on timeout or abort before open.
- Ensured abort during/after streaming closes the socket and does not send the end event after cancellation.
- Wrapped FunASR start/chunk/end sends so synchronous send failures become queued ASR error events instead of escaping the async generator.
- Prevented duplicate pre-open fatal connection errors and extracted the repeated connection failure message into a constant.
- Updated terminal detection so recoverable invalid payload errors do not stop draining before a later final event.
- Added focused fake-socket contract coverage for open timeout, abort before open, abort after open, send failure, duplicate pre-open failure, and recoverable invalid payload behavior.

tests:
- `npm run build && node scripts/voice-input-contract.test.js` — PASS (`voice-input-contract tests passed`; npm still warns about existing `electron_mirror` config).

commit:
- 2c17d31f645e2832b2a622d1c097ce14b231916f

concerns:
- Existing uncommitted `.superpowers/sdd/task-2-report.md` remains untouched and excluded from this fix.

---

## Task 3 remaining Important fix report — 2026-07-16

status: DONE

changes:
- Added contract coverage proving a FunASR start-event send failure is yielded promptly even when the microphone chunk iterable never yields.
- Drained already-queued fatal start-send errors immediately after the socket opens, before awaiting audio chunks.
- Confirmed start-send failure closes the fake socket and yields a non-recoverable ASR error.

red/green:
- RED: `npm run build && node scripts/voice-input-contract.test.js` failed with `Timed out waiting for start send failure`.
- GREEN: `npm run build && node scripts/voice-input-contract.test.js` passed with `voice-input-contract tests passed`.

commit:
- bc5c506e9d0ba36e9a7909fa57ef803aabecdbb0

concerns:
- Existing npm warning remains: `Unknown project config "electron_mirror"`; build and tests pass.
- Existing uncommitted `.superpowers/sdd/task-2-report.md` remains untouched and excluded from this fix.
