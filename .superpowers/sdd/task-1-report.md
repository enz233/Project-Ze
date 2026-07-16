# Task 1 Report: Operation Guide Pure Domain and Tests

## Status

DONE

Implemented Task 1 of Operation Guide Fusion: pure Operation Guide domain contracts, conservative intent parsing, fallback/JSON plan parsing, progress evaluation parsing, and contract test integration.

## Files changed

- `C:/Users/25623/Desktop/AItest/AI_pet/code/src/core/operation-guide-types.ts`
  - Added exported pure domain interfaces/types:
    - `OperationGuideAction`
    - `OperationGuideStep`
    - `OperationGuidePlan`
    - `OperationGuideSnapshot`
    - `OperationGuideProgressEvaluation`
- `C:/Users/25623/Desktop/AItest/AI_pet/code/src/core/operation-guide-intent.ts`
  - Added `extractOperationGuideSoftwareName(text: string): string | null`.
  - Added `getOperationGuideControlCommand(text: string): 'next' | 'reidentify' | 'exit' | null`.
  - Uses conservative regexes from the task brief.
- `C:/Users/25623/Desktop/AItest/AI_pet/code/src/core/operation-guide-planner.ts`
  - Added `buildFallbackPlan(softwareName: string): OperationGuidePlan`.
  - Added `parseGuidePlan(raw: string, fallbackSoftwareName: string): OperationGuidePlan`.
  - Includes JSON object extraction, action sanitization, step filtering, and fallback plan behavior.
- `C:/Users/25623/Desktop/AItest/AI_pet/code/src/core/operation-guide-progress-evaluator.ts`
  - Added `parseProgressEvaluation(raw: string): OperationGuideProgressEvaluation`.
  - Includes JSON extraction, boolean normalization, confidence clamping, and safe fallback.
- `C:/Users/25623/Desktop/AItest/AI_pet/code/scripts/operation-guide-contract.test.js`
  - Added contract tests from the Task 1 brief.
- `C:/Users/25623/Desktop/AItest/AI_pet/code/package.json`
  - Added `node scripts/operation-guide-contract.test.js` to `npm test`.
- `C:/Users/25623/Desktop/AItest/AI_pet/code/.superpowers/sdd/task-1-report.md`
  - Updated this report for Operation Guide Task 1.

No unrelated modules such as `ScreenAnalyzer`, `ScreenTargetPointer`, or `MoveController` were modified. No API keys or runtime config were added.

## Commits

- `a0179f2` feat: add operation guide domain contracts

## Tests run with outputs

### Red phase

Command:

```bash
npm run build && node scripts/operation-guide-contract.test.js
```

Output:

```text
npm warn Unknown project config "electron_mirror". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.

> project-ze@0.3.2 build
> tsc

node:internal/modules/cjs/loader:1459
  throw err;
  ^

Error: Cannot find module '../dist/core/operation-guide-planner'
Require stack:
- C:\Users\25623\Desktop\AItest\AI_pet\code\scripts\operation-guide-contract.test.js
...
code: 'MODULE_NOT_FOUND'
```

Expected failure confirmed: contract test failed because `dist/core/operation-guide-*` modules did not exist yet.

### Focused green check

Command:

```bash
npm run build && node scripts/operation-guide-contract.test.js
```

Output:

```text
npm warn Unknown project config "electron_mirror". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.

> project-ze@0.3.2 build
> tsc

operation-guide-contract tests passed
```

### Full test suite

Command:

```bash
npm test
```

Output:

```text
npm warn Unknown project config "electron_mirror". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.

> project-ze@0.3.2 test
> npm run build && node scripts/voice-input-contract.test.js && node scripts/screen-fingerprint-contract.test.js && node scripts/screen-capture-frame-contract.test.js && node scripts/screen-pointer-debug-contract.test.js && node scripts/screen-vision-request-contract.test.js && node scripts/point-visual-guard-contract.test.js && node scripts/screen-pointer-position-contract.test.js && node scripts/intent-router-contract.test.js && node scripts/response-workflow-contract.test.js && node scripts/operation-guide-contract.test.js

npm warn Unknown env config "electron-mirror". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
npm warn Unknown project config "electron_mirror". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.

> project-ze@0.3.2 build
> tsc

voice-input-contract tests passed
screen-fingerprint-contract tests passed
screen-capture-frame-contract tests passed
screen-pointer-debug-contract tests passed
screen-vision-request-contract tests passed
point-visual-guard-contract tests passed
screen-pointer-position-contract tests passed
intent-router contract tests passed
response-workflow contract tests passed
operation-guide-contract tests passed
```

Note: npm emitted existing configuration warnings for `electron_mirror` / `electron-mirror`; tests still passed.

## Self-review

- TDD followed for the new contract test:
  - Wrote `scripts/operation-guide-contract.test.js` first.
  - Verified expected red failure from missing `dist/core/operation-guide-*` modules.
  - Implemented minimal pure domain files to satisfy the contract.
  - Verified focused and full test suite green.
- Scope check:
  - Only Operation Guide pure domain files, one contract test, `package.json`, and this report were changed.
  - No existing screen, pointer, movement, voice, or runtime modules were replaced or modified.
  - No Project-Chen MIDL peripherals were added.
  - No secrets, API keys, or runtime config were committed.
- TypeScript strict build passes.
- `git diff --check` passed with no whitespace errors.

## Concerns

- npm reports pre-existing config warnings for `electron_mirror` / `electron-mirror`. They are outside Task 1 scope and did not fail the test suite.
- `OperationGuideAction` is intentionally limited to `click | type | wait | observe`; invalid actions are sanitized to `click` as required by the contract example.
