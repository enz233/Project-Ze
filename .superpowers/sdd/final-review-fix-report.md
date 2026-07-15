# ASR Provider Presets Final Review Fix Report

## Status
Completed re-review fixes for ASR Provider Presets and validated with tests/build.

## Files changed
- `src/main/settings.html`
  - Changed ASR config load fallback from `||` to nullish/preset-aware defaults so intentional empty strings, especially Aliyun/custom `model: ''`, stay empty.
- `src/core/asr-openai-compatible.ts`
  - Added `joinTranscriptParts` smart boundary joining for chunked fallback final transcripts.
  - Changed chunked fallback transcription failures into ASR `{ type: 'error', recoverable: false }` events instead of rejected streams.
- `src/core/asr-config.ts`
  - Hardened ASR normalization with provider/streamingMode/key/string/boolean/cache validation.
  - Deep-merged cache defaults.
  - Inferred `custom-openai-compatible` when a non-custom preset key has mismatched managed fields.
  - Switched preset guard to `hasOwnProperty`.
  - Preserved `enabled:false` and `autoSendFinalTranscript:false` defaults.
- `src/core/json-config-store.ts`
  - Made `update()` normalize the merged value before saving, preserving nested defaults through normalizer hooks.
- `scripts/voice-input-contract.test.js`
  - Added/strengthened coverage for settings fallback, managed-field mismatch inference, empty Aliyun model preservation, ASR type/cache hardening, JsonConfigStore update normalization, chunk smart joining, and chunk error events.
- `.superpowers/sdd/final-review-fix-report.md`
  - This report.

## Commit hash
Pending before commit; final commit hash recorded by git after this report is staged.

## Commands run / results
- `npm test`
  - Passed: TypeScript build completed and `voice-input-contract tests passed`.
  - One intermediate run failed while adding the JsonConfigStore contract test because the Electron/fs test mock intercepted module source reads; fixed the test harness mock and reran successfully.
- `npm run build`
  - Passed: TypeScript build completed.
- `git status --short`
  - Showed modified source/test/report files plus pre-existing untracked `.superpowers/sdd/progress.md` and `.superpowers/sdd/task-*.md` files.

## Tests added
- Preset normalization infers custom when non-custom preset managed fields mismatch.
- Aliyun preset with intentional empty model remains valid and empty.
- ASR normalizer validates provider/streamingMode/string/boolean/cache fields and deep-merges cache defaults.
- JsonConfigStore `update()` normalizes merged values and keeps nested defaults.
- settings.html contract asserts preset field values and nullish `config.model ?? preset.model` fallback.
- chunked fallback smart-joins Chinese, English, punctuation, and mixed alphanumeric boundaries.
- chunked fallback HTTP errors yield ASR error events.

## Self-review
- Did not add a dedicated 阿里百炼 ASR engine.
- Did not hardcode an unverified 百炼 ASR model.
- Did not fill API keys; tests only use dummy keys.
- Kept `enabled:false` and `autoSendFinalTranscript:false` defaults.
- Did not change renderer mic capture or IPC names.
- JsonConfigStore normalization is generic and opt-in-compatible with existing normalizer hooks.
- The smart join intentionally inserts spaces only between ASCII alphanumeric boundaries to avoid changing CJK/punctuation concatenation.

## Concerns
- `npm` still emits existing warnings about unknown `electron_mirror` / `electron-mirror` config; tests/build pass.
- Existing untracked `.superpowers/sdd/progress.md` and `.superpowers/sdd/task-*.md` files were present at task start and were left uncommitted.
