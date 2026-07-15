# ASR Provider Presets Final Review Fix Report

## Status
Completed final review fixes for ASR Provider Presets and validated with tests/build.

## Files changed
- `scripts/voice-input-contract.test.js`
  - Added contract coverage for legacy ASR config inference, invalid preset fallback, preset key persistence, settings.html/static preset drift, disabled actual-engine select, auto-apply preset change behavior, and chunked fallback final transcript concatenation.
- `src/core/asr-config.ts`
  - Added `normalizeASRConfigForLoad` and `inferASRProviderPreset` for backward-compatible legacy config loading.
  - Made `applyASRProviderPreset` fall back to OpenAI on unknown preset input.
  - Made applied config persist the selected preset key instead of trusting duplicated `definition.id`.
  - Removed redundant preserved-field reassignments after `...config`.
  - Derived `DEFAULT_ASR_CONFIG` preset-managed connection fields from `ASR_PROVIDER_PRESETS.openai` while preserving `enabled:false` and `autoSendFinalTranscript:false`.
- `src/core/json-config-store.ts`
  - Added optional normalizer hook so ASR config loads can infer missing/legacy fields without changing other config stores.
- `src/core/asr-openai-compatible.ts`
  - Fixed chunked fallback to accumulate chunk transcripts and emit final concatenated transcript.
- `src/main/settings.html`
  - Disabled the single-option actual engine select while preserving id `asrProvider` and programmatic `.value` behavior.
  - Changed ASR provider preset selection to auto-apply non-secret recommended fields on change; API key remains untouched.
- `.superpowers/sdd/final-review-fix-report.md`
  - This report.

## Commit hash
Pending at report write time; final commit created after this report.

## Commands run / results
- `npm --prefix /c/Users/25623/Desktop/AItest/AI_pet/code/.claude/worktrees/asr-provider-presets test`
  - Initial RED run failed as expected because `normalizeASRConfigForLoad` did not exist.
  - Final run passed: `voice-input-contract tests passed`.
- `npm --prefix /c/Users/25623/Desktop/AItest/AI_pet/code/.claude/worktrees/asr-provider-presets run build`
  - Passed: TypeScript build completed.
- `git -C /c/Users/25623/Desktop/AItest/AI_pet/code/.claude/worktrees/asr-provider-presets status --short`
  - Showed modified source/test files plus existing untracked `.superpowers/sdd/task-*`/`progress.md` files.
- `Glob src/config/asr.json`
  - No runtime `src/config/asr.json` found.

## Self-review
- Backward compatibility: configs missing `providerPreset` infer `openai` only when preset-managed fields match OpenAI; otherwise they infer `custom-openai-compatible`, preventing custom endpoints from being silently relabeled/resaved as OpenAI.
- Invalid preset safety: unknown runtime preset input now falls back to OpenAI instead of throwing from undefined definition access.
- Drift safety: settings.html remains static, but contract tests now compare its preset options/default values/streaming modes against `ASR_PROVIDER_PRESETS` and assert the key UX hooks.
- UX mismatch: selecting a preset now immediately applies non-secret recommended fields, preventing `providerPreset='aliyun-bailian'` from being saved with stale OpenAI endpoint/model/path values.
- Secrets: presets and UI changes never fill API keys; tests use dummy values only.
- Engine scope: no dedicated Aliyun ASR engine was added; Aliyun remains OpenAI-compatible with chunked fallback and no hardcoded ASR model.
- IPC/capture scope: renderer mic capture, IPC names, and VoiceInputManager were not changed.

## Concerns
- `npm` emits existing warnings about unknown `electron_mirror` / `electron-mirror` config; tests/build still pass.
- Existing untracked `.superpowers/sdd/progress.md` and `.superpowers/sdd/task-*.md` files were present before this fix and are not part of the functional source changes.
