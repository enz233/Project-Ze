# Camera Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight optional camera awareness module that captures low-resolution camera frames, reuses the existing Vision image-analysis path, detects user presence plus light affect hints, and optionally triggers a gentle returned-user response.

**Architecture:** Renderer/settings owns camera permission and frame capture with `getUserMedia`; main/core owns config, Vision parsing, state, and proactive handoff. Keep this non-core and small: reuse existing OpenAI-compatible Vision settings from `AIConfigManager`, add focused camera contracts, and avoid a new provider system or continuous video pipeline.

**Tech Stack:** Electron 42, TypeScript 6, CommonJS, browser `navigator.mediaDevices.getUserMedia`, settings-window renderer script, Electron IPC, existing OpenAI-compatible Vision Chat Completions, `JsonConfigStore<T>`, existing `BubbleOrchestrator`, dependency-free Node contract tests.

## Global Constraints

- Follow the design in `docs/superpowers/specs/2026-07-15-camera-awareness-design.md`.
- The module is not core; keep implementation lightweight and avoid broad refactors.
- Default camera awareness is off: `enabled: false` and `backgroundDetectionEnabled: false`.
- Reuse existing Vision configuration (`visionApiKey`, `visionBaseURL`, `visionModel`) instead of adding a new provider or API-key section.
- Do not save camera images or videos to disk.
- Do not continuously upload video; capture low-resolution single frames only.
- Do not identify the user or judge age, gender, race, or other sensitive attributes.
- Light affect is coarse only: `positive`, `neutral`, `low_energy`, `unclear`.
- `detectOnce` is settings-only and must not trigger a bubble or proactive cooldown.
- Only background `absent -> present` may trigger a gentle returned response, and it must go through `BubbleOrchestrator` / `BubbleManager` gating.
- Do not add dependencies or a new test framework.
- Every implementation task ends with `npm run build`, `npm test`, and a git commit.

---

## File Structure

- Create: `src/core/camera-awareness-types.ts`
  - Shared config, frame, result, snapshot, error, and event types.
- Create: `src/core/camera-awareness-config.ts`
  - `DEFAULT_CAMERA_AWARENESS_CONFIG` and `CameraAwarenessConfigManager` backed by `JsonConfigStore<T>`.
- Create: `src/core/vision-image-analyzer.ts`
  - Tiny Vision image helper that reuses existing `AIConfigManager` Vision settings and parses camera awareness JSON.
- Create: `src/core/camera-awareness-manager.ts`
  - State machine, `detectOnce`, `processBackgroundFrame`, returned-event/bubble handoff, and debug snapshot.
- Create: `scripts/camera-awareness-contract.test.js`
  - Dependency-free tests against built `dist/` modules.
- Modify: `package.json`
  - Run both voice-input and camera-awareness contract tests.
- Modify: `src/main/main.ts`
  - Instantiate config/analyzer/manager and register IPC handlers.
- Modify: `src/main/preload.ts`
  - Expose `window.companion.cameraAwareness` facade.
- Modify: `src/main/settings.html`
  - Add sidebar tab, settings section, camera capture helper, config save/load, immediate detection, and background timer.
- Modify: `PROJECT_INDEX.md`
  - Document camera awareness modules and IPC channels.
- Modify: `VERSION.md`
  - Add Unreleased entry.
- Create: `docs/camera-awareness.md`
  - User/developer documentation for settings, interfaces, privacy boundaries, and troubleshooting.

---

### Task 1: Add camera awareness contracts, config, Vision analyzer, and contract tests

**Files:**
- Create: `src/core/camera-awareness-types.ts`
- Create: `src/core/camera-awareness-config.ts`
- Create: `src/core/vision-image-analyzer.ts`
- Create: `scripts/camera-awareness-contract.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `JsonConfigStore<T>` from `src/core/json-config-store.ts`.
- Consumes: `AIConfigManager` and existing Vision fields from `src/core/ai-config.ts`.
- Produces: `DEFAULT_CAMERA_AWARENESS_CONFIG: CameraAwarenessConfig`.
- Produces: `CameraAwarenessConfigManager.get(): CameraAwarenessConfig` and `update(partial: Partial<CameraAwarenessConfig>): void`.
- Produces: `VisionImageAnalyzer.detectCameraAwareness(frame, options): Promise<CameraAwarenessDetectionResult>`.
- Produces: `parseCameraAwarenessResponse(raw: string, checkedAt?: number): CameraAwarenessDetectionResult` for deterministic tests and manager use.

- [ ] **Step 1: Write the failing camera contract test**

Create `scripts/camera-awareness-contract.test.js`:

```js
const assert = require('assert');

function load(modulePath) {
  return require(`../dist/${modulePath}`);
}

function testCameraConfigDefaults() {
  const { DEFAULT_CAMERA_AWARENESS_CONFIG } = load('core/camera-awareness-config.js');
  assert.deepStrictEqual(DEFAULT_CAMERA_AWARENESS_CONFIG, {
    enabled: false,
    backgroundDetectionEnabled: false,
    lightAffectEnabled: true,
    detectionIntervalMs: 60 * 1000,
    absentAfterMs: 120 * 1000,
    minConfidence: 0.65,
    returnedReactionEnabled: true,
    debugPreviewEnabled: false,
  });
}

function testCameraParserAcceptsValidJson() {
  const { parseCameraAwarenessResponse } = load('core/vision-image-analyzer.js');
  const result = parseCameraAwarenessResponse(
    '{"presence":"present","confidence":0.9,"affect":"neutral","reason":"person_visible"}',
    1234
  );
  assert.deepStrictEqual(result, {
    presence: 'present',
    confidence: 0.9,
    affect: 'neutral',
    reason: 'person_visible',
    checkedAt: 1234,
  });
}

function testCameraParserExtractsJsonFromText() {
  const { parseCameraAwarenessResponse } = load('core/vision-image-analyzer.js');
  const result = parseCameraAwarenessResponse(
    '结果如下：\n```json\n{"presence":"absent","confidence":0.78,"reason":"no_person_visible"}\n```',
    5678
  );
  assert.deepStrictEqual(result, {
    presence: 'absent',
    confidence: 0.78,
    affect: 'unclear',
    reason: 'no_person_visible',
    checkedAt: 5678,
  });
}

function testCameraParserFallsBackOnInvalidJson() {
  const { parseCameraAwarenessResponse } = load('core/vision-image-analyzer.js');
  const result = parseCameraAwarenessResponse('not json', 9999);
  assert.deepStrictEqual(result, {
    presence: 'uncertain',
    confidence: 0,
    affect: 'unclear',
    reason: 'api_error',
    checkedAt: 9999,
  });
}

function testTypeConstants() {
  const types = load('core/camera-awareness-types.js');
  assert.deepStrictEqual(types.CAMERA_AWARENESS_IPC, {
    getConfig: 'camera-awareness:get-config',
    updateConfig: 'camera-awareness:update-config',
    detectOnce: 'camera-awareness:detect-once',
    processBackgroundFrame: 'camera-awareness:process-background-frame',
    getSnapshot: 'camera-awareness:get-snapshot',
  });
}

function run() {
  testCameraConfigDefaults();
  testCameraParserAcceptsValidJson();
  testCameraParserExtractsJsonFromText();
  testCameraParserFallsBackOnInvalidJson();
  testTypeConstants();
  console.log('camera-awareness-contract tests passed');
}

run();
```

- [ ] **Step 2: Update package test script so the new failing test runs**

Modify `package.json` script from:

```json
"test": "npm run build && node scripts/voice-input-contract.test.js"
```

to:

```json
"test": "npm run build && node scripts/voice-input-contract.test.js && node scripts/camera-awareness-contract.test.js"
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
npm test
```

Expected: build succeeds or reaches test stage, then FAIL with module not found for `../dist/core/camera-awareness-config.js` or `../dist/core/vision-image-analyzer.js`.

- [ ] **Step 4: Add shared camera awareness types**

Create `src/core/camera-awareness-types.ts`:

```ts
export type CameraAwarenessStatus = 'present' | 'absent' | 'uncertain' | 'unavailable';
export type CameraPresence = 'present' | 'absent' | 'uncertain';
export type CameraAffect = 'positive' | 'neutral' | 'low_energy' | 'unclear';

export type CameraAwarenessReason =
  | 'person_visible'
  | 'no_person_visible'
  | 'too_dark'
  | 'camera_blocked'
  | 'image_unclear'
  | 'api_error';

export type CameraAwarenessErrorCode =
  | 'camera_permission_denied'
  | 'camera_not_found'
  | 'capture_failed'
  | 'vision_unavailable'
  | 'vision_parse_failed'
  | 'disabled';

export interface CameraAwarenessConfig {
  enabled: boolean;
  backgroundDetectionEnabled: boolean;
  lightAffectEnabled: boolean;
  detectionIntervalMs: number;
  absentAfterMs: number;
  minConfidence: number;
  returnedReactionEnabled: boolean;
  debugPreviewEnabled: boolean;
}

export interface CameraFrameInput {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  capturedAt: number;
  source: 'settings-test' | 'background';
}

export interface CameraAwarenessDetectOptions {
  lightAffectEnabled: boolean;
  minConfidence: number;
}

export interface CameraAwarenessDetectionResult {
  presence: CameraPresence;
  confidence: number;
  affect?: CameraAffect;
  reason: CameraAwarenessReason;
  checkedAt: number;
}

export interface CameraAwarenessSnapshot {
  status: CameraAwarenessStatus;
  lastDetection: CameraAwarenessDetectionResult | null;
  lastChangedAt: number | null;
  lastReturnedAt: number | null;
  backgroundDetectionRunning: boolean;
  lastError?: string;
}

export interface CameraAwarenessEvent {
  type: 'user_returned';
  source: 'camera_awareness';
  affect?: CameraAffect;
  confidence: number;
  occurredAt: number;
}

export const CAMERA_AWARENESS_IPC = {
  getConfig: 'camera-awareness:get-config',
  updateConfig: 'camera-awareness:update-config',
  detectOnce: 'camera-awareness:detect-once',
  processBackgroundFrame: 'camera-awareness:process-background-frame',
  getSnapshot: 'camera-awareness:get-snapshot',
} as const;
```

- [ ] **Step 5: Add config manager**

Create `src/core/camera-awareness-config.ts`:

```ts
import { JsonConfigStore } from './json-config-store';
import { CameraAwarenessConfig } from './camera-awareness-types';

export const DEFAULT_CAMERA_AWARENESS_CONFIG: CameraAwarenessConfig = {
  enabled: false,
  backgroundDetectionEnabled: false,
  lightAffectEnabled: true,
  detectionIntervalMs: 60 * 1000,
  absentAfterMs: 120 * 1000,
  minConfidence: 0.65,
  returnedReactionEnabled: true,
  debugPreviewEnabled: false,
};

export class CameraAwarenessConfigManager {
  private store: JsonConfigStore<CameraAwarenessConfig>;

  constructor() {
    this.store = new JsonConfigStore<CameraAwarenessConfig>({
      fileName: 'camera-awareness.json',
      defaults: DEFAULT_CAMERA_AWARENESS_CONFIG,
      namespace: 'CameraAwarenessConfig',
    });
  }

  get(): CameraAwarenessConfig {
    return this.store.get();
  }

  update(partial: Partial<CameraAwarenessConfig>): void {
    this.store.update(this.normalize(partial));
  }

  private normalize(partial: Partial<CameraAwarenessConfig>): Partial<CameraAwarenessConfig> {
    const normalized = { ...partial };

    if (typeof normalized.detectionIntervalMs === 'number') {
      normalized.detectionIntervalMs = Math.max(30 * 1000, Math.min(5 * 60 * 1000, normalized.detectionIntervalMs));
    }
    if (typeof normalized.absentAfterMs === 'number') {
      normalized.absentAfterMs = Math.max(60 * 1000, Math.min(5 * 60 * 1000, normalized.absentAfterMs));
    }
    if (typeof normalized.minConfidence === 'number') {
      normalized.minConfidence = Math.max(0, Math.min(1, normalized.minConfidence));
    }

    return normalized;
  }
}
```

- [ ] **Step 6: Add Vision image analyzer and parser**

Create `src/core/vision-image-analyzer.ts`:

```ts
import { AIConfigManager } from './ai-config';
import {
  CameraAffect,
  CameraAwarenessDetectOptions,
  CameraAwarenessDetectionResult,
  CameraAwarenessReason,
  CameraFrameInput,
  CameraPresence,
} from './camera-awareness-types';

const PRESENCE_VALUES: CameraPresence[] = ['present', 'absent', 'uncertain'];
const AFFECT_VALUES: CameraAffect[] = ['positive', 'neutral', 'low_energy', 'unclear'];
const REASON_VALUES: CameraAwarenessReason[] = [
  'person_visible',
  'no_person_visible',
  'too_dark',
  'camera_blocked',
  'image_unclear',
  'api_error',
];

interface VisionChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class VisionImageAnalyzer {
  constructor(private configManager: AIConfigManager) {}

  async detectCameraAwareness(
    frame: CameraFrameInput,
    options: CameraAwarenessDetectOptions
  ): Promise<CameraAwarenessDetectionResult> {
    const config = this.configManager.get();
    if (!config.visionApiKey || !config.visionBaseURL || !config.visionModel) {
      return {
        presence: 'uncertain',
        confidence: 0,
        affect: 'unclear',
        reason: 'api_error',
        checkedAt: Date.now(),
      };
    }

    const dataUri = toDataUri(frame);
    const prompt = buildCameraAwarenessPrompt(options.lightAffectEnabled);

    try {
      const response = await fetch(`${config.visionBaseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.visionApiKey}`,
        },
        body: JSON.stringify({
          model: config.visionModel,
          messages: [
            {
              role: 'system',
              content: '你是 Project-Ze 的轻量摄像头感知分析器。只输出 JSON，不输出解释。',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: dataUri, detail: 'low' } },
              ],
            },
          ],
          max_tokens: 300,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[VisionImageAnalyzer] Vision API 请求失败 (${response.status}): ${error}`);
        return {
          presence: 'uncertain',
          confidence: 0,
          affect: 'unclear',
          reason: 'api_error',
          checkedAt: Date.now(),
        };
      }

      const data = await response.json() as VisionChatCompletionResponse;
      return parseCameraAwarenessResponse(data.choices?.[0]?.message?.content ?? '', Date.now());
    } catch (error: any) {
      console.error('[VisionImageAnalyzer] 摄像头感知分析失败:', error.message);
      return {
        presence: 'uncertain',
        confidence: 0,
        affect: 'unclear',
        reason: 'api_error',
        checkedAt: Date.now(),
      };
    }
  }
}

export function toDataUri(frame: CameraFrameInput): string {
  if (frame.imageBase64.startsWith('data:')) return frame.imageBase64;
  return `data:${frame.mimeType};base64,${frame.imageBase64}`;
}

export function buildCameraAwarenessPrompt(lightAffectEnabled: boolean): string {
  const affectInstruction = lightAffectEnabled
    ? '- 如果用户可见，affect 可为 positive / neutral / low_energy / unclear。affect 是非常粗略的陪伴线索，不是情绪诊断。'
    : '- 不要判断状态线索；affect 固定为 unclear。';

  return `你会收到一张低分辨率摄像头单帧。请只做 Project-Ze 桌宠的轻量陪伴判断。

只输出 JSON：
{"presence":"present|absent|uncertain","confidence":0到1,"affect":"positive|neutral|low_energy|unclear","reason":"person_visible|no_person_visible|too_dark|camera_blocked|image_unclear"}

规则：
- presence 只判断画面中是否有真实用户可见。
- 如果看不清、太暗、遮挡、无法判断，返回 uncertain。
${affectInstruction}
- 不识别身份。
- 不判断年龄、性别、种族等敏感属性。
- 不描述外貌和环境。
- 不输出 JSON 以外的内容。`;
}

export function parseCameraAwarenessResponse(raw: string, checkedAt: number = Date.now()): CameraAwarenessDetectionResult {
  try {
    const parsed = JSON.parse(extractJsonObject(raw));
    const presence = normalizeEnum<CameraPresence>(parsed.presence, PRESENCE_VALUES, 'uncertain');
    const confidence = normalizeConfidence(parsed.confidence);
    const affect = normalizeEnum<CameraAffect>(parsed.affect, AFFECT_VALUES, 'unclear');
    const reason = normalizeEnum<CameraAwarenessReason>(parsed.reason, REASON_VALUES, 'api_error');

    return { presence, confidence, affect, reason, checkedAt };
  } catch (_error) {
    return {
      presence: 'uncertain',
      confidence: 0,
      affect: 'unclear',
      reason: 'api_error',
      checkedAt,
    };
  }
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return extractJsonObject(fenced[1]);

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);

  throw new Error('No JSON object found');
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}
```

- [ ] **Step 7: Run tests and verify Task 1 passes**

Run:

```bash
npm test
```

Expected: PASS with both lines:

```text
voice-input-contract tests passed
camera-awareness-contract tests passed
```

- [ ] **Step 8: Commit Task 1**

```bash
git add package.json scripts/camera-awareness-contract.test.js src/core/camera-awareness-types.ts src/core/camera-awareness-config.ts src/core/vision-image-analyzer.ts
git commit -m "feat: add camera awareness contracts"
```

---

### Task 2: Add CameraAwarenessManager state machine and returned-event handoff

**Files:**
- Create: `src/core/camera-awareness-manager.ts`
- Modify: `scripts/camera-awareness-contract.test.js`

**Interfaces:**
- Consumes: `CameraAwarenessConfigManager.get()` and `update()` from Task 1.
- Consumes: `VisionImageAnalyzer.detectCameraAwareness(frame, options)` from Task 1.
- Produces: `CameraAwarenessManager.detectOnce(frame): Promise<CameraAwarenessDetectionResult>`.
- Produces: `CameraAwarenessManager.processBackgroundFrame(frame): Promise<CameraAwarenessSnapshot>`.
- Produces: `CameraAwarenessManager.getSnapshot(): CameraAwarenessSnapshot`.
- Optional dependency consumed later: `BubbleOrchestrator.tryShowProactive(text, source)`.

- [ ] **Step 1: Extend the contract test for manager behavior**

Append this code to `scripts/camera-awareness-contract.test.js` before `run()`:

```js
async function testCameraAwarenessManagerStateMachine() {
  const { CameraAwarenessManager } = load('core/camera-awareness-manager.js');
  const { DEFAULT_CAMERA_AWARENESS_CONFIG } = load('core/camera-awareness-config.js');

  let now = 10_000;
  const detections = [];
  const bubbles = [];
  const configManager = {
    get: () => ({ ...DEFAULT_CAMERA_AWARENESS_CONFIG, enabled: true, backgroundDetectionEnabled: true, absentAfterMs: 1000 }),
    update: () => {},
  };
  const visionAnalyzer = {
    detectCameraAwareness: async () => detections.shift(),
  };
  const bubbleOrchestrator = {
    tryShowProactive: (text, source) => {
      bubbles.push({ text, source });
      return true;
    },
  };

  const manager = new CameraAwarenessManager(configManager, visionAnalyzer, {
    bubbleOrchestrator,
    now: () => now,
  });
  const frame = { imageBase64: 'AAAA', mimeType: 'image/jpeg', width: 320, height: 180, capturedAt: now, source: 'background' };

  detections.push({ presence: 'present', confidence: 0.9, affect: 'neutral', reason: 'person_visible', checkedAt: now });
  let snapshot = await manager.processBackgroundFrame(frame);
  assert.strictEqual(snapshot.status, 'present');
  assert.strictEqual(bubbles.length, 0);

  now += 500;
  detections.push({ presence: 'absent', confidence: 0.9, affect: 'unclear', reason: 'no_person_visible', checkedAt: now });
  snapshot = await manager.processBackgroundFrame(frame);
  assert.strictEqual(snapshot.status, 'present');

  now += 700;
  detections.push({ presence: 'absent', confidence: 0.9, affect: 'unclear', reason: 'no_person_visible', checkedAt: now });
  snapshot = await manager.processBackgroundFrame(frame);
  assert.strictEqual(snapshot.status, 'absent');

  now += 100;
  detections.push({ presence: 'present', confidence: 0.92, affect: 'positive', reason: 'person_visible', checkedAt: now });
  snapshot = await manager.processBackgroundFrame(frame);
  assert.strictEqual(snapshot.status, 'present');
  assert.strictEqual(bubbles.length, 1);
  assert.deepStrictEqual(bubbles[0], { text: '回来啦，看起来状态不错～', source: 'camera_awareness' });
  assert.strictEqual(snapshot.lastReturnedAt, now);
}

async function testDetectOnceDoesNotTriggerBubble() {
  const { CameraAwarenessManager } = load('core/camera-awareness-manager.js');
  const { DEFAULT_CAMERA_AWARENESS_CONFIG } = load('core/camera-awareness-config.js');

  const bubbles = [];
  const configManager = {
    get: () => ({ ...DEFAULT_CAMERA_AWARENESS_CONFIG, enabled: true, backgroundDetectionEnabled: true }),
    update: () => {},
  };
  const visionAnalyzer = {
    detectCameraAwareness: async () => ({ presence: 'present', confidence: 0.95, affect: 'positive', reason: 'person_visible', checkedAt: 1 }),
  };
  const manager = new CameraAwarenessManager(configManager, visionAnalyzer, {
    bubbleOrchestrator: { tryShowProactive: (text, source) => { bubbles.push({ text, source }); return true; } },
    now: () => 1,
  });

  const frame = { imageBase64: 'AAAA', mimeType: 'image/jpeg', width: 320, height: 180, capturedAt: 1, source: 'settings-test' };
  const result = await manager.detectOnce(frame);
  assert.strictEqual(result.presence, 'present');
  assert.strictEqual(manager.getSnapshot().status, 'unavailable');
  assert.strictEqual(bubbles.length, 0);
}
```

Update the `run()` function to call the new async tests:

```js
async function run() {
  testCameraConfigDefaults();
  testCameraParserAcceptsValidJson();
  testCameraParserExtractsJsonFromText();
  testCameraParserFallsBackOnInvalidJson();
  testTypeConstants();
  await testCameraAwarenessManagerStateMachine();
  await testDetectOnceDoesNotTriggerBubble();
  console.log('camera-awareness-contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test
```

Expected: FAIL with module not found for `../dist/core/camera-awareness-manager.js`.

- [ ] **Step 3: Implement CameraAwarenessManager**

Create `src/core/camera-awareness-manager.ts`:

```ts
import { CameraAwarenessConfigManager } from './camera-awareness-config';
import {
  CameraAwarenessConfig,
  CameraAwarenessDetectionResult,
  CameraAwarenessSnapshot,
  CameraFrameInput,
} from './camera-awareness-types';
import { VisionImageAnalyzer } from './vision-image-analyzer';

interface ProactiveBubblePort {
  tryShowProactive(text: string, source?: string): boolean;
}

export interface CameraAwarenessManagerOptions {
  bubbleOrchestrator?: ProactiveBubblePort;
  now?: () => number;
}

export class CameraAwarenessManager {
  private snapshot: CameraAwarenessSnapshot = {
    status: 'unavailable',
    lastDetection: null,
    lastChangedAt: null,
    lastReturnedAt: null,
    backgroundDetectionRunning: false,
  };
  private lastSeenAt: number | null = null;
  private now: () => number;
  private bubbleOrchestrator?: ProactiveBubblePort;

  constructor(
    private configManager: Pick<CameraAwarenessConfigManager, 'get' | 'update'>,
    private visionAnalyzer: Pick<VisionImageAnalyzer, 'detectCameraAwareness'>,
    options: CameraAwarenessManagerOptions = {}
  ) {
    this.now = options.now ?? (() => Date.now());
    this.bubbleOrchestrator = options.bubbleOrchestrator;
  }

  getConfig(): CameraAwarenessConfig {
    return this.configManager.get();
  }

  updateConfig(partial: Partial<CameraAwarenessConfig>): CameraAwarenessConfig {
    this.configManager.update(partial);
    const config = this.configManager.get();
    if (!config.enabled || !config.backgroundDetectionEnabled) {
      this.snapshot.backgroundDetectionRunning = false;
    }
    return config;
  }

  async detectOnce(frame: CameraFrameInput): Promise<CameraAwarenessDetectionResult> {
    const config = this.configManager.get();
    if (!config.enabled) {
      const disabled = this.createDisabledResult();
      this.snapshot = { ...this.snapshot, lastDetection: disabled, lastError: 'disabled' };
      return disabled;
    }

    const result = await this.detect(frame, config);
    this.snapshot = { ...this.snapshot, lastDetection: result, lastError: result.reason === 'api_error' ? 'vision_unavailable' : undefined };
    return result;
  }

  async processBackgroundFrame(frame: CameraFrameInput): Promise<CameraAwarenessSnapshot> {
    const config = this.configManager.get();
    this.snapshot.backgroundDetectionRunning = Boolean(config.enabled && config.backgroundDetectionEnabled);

    if (!config.enabled || !config.backgroundDetectionEnabled) {
      this.snapshot = {
        ...this.snapshot,
        status: 'unavailable',
        backgroundDetectionRunning: false,
        lastError: 'disabled',
      };
      return this.snapshot;
    }

    const result = await this.detect(frame, config);
    this.applyDetection(result, config);
    return this.getSnapshot();
  }

  getSnapshot(): CameraAwarenessSnapshot {
    return { ...this.snapshot };
  }

  stop(): void {
    this.snapshot = {
      ...this.snapshot,
      status: 'unavailable',
      backgroundDetectionRunning: false,
    };
  }

  private async detect(frame: CameraFrameInput, config: CameraAwarenessConfig): Promise<CameraAwarenessDetectionResult> {
    try {
      return await this.visionAnalyzer.detectCameraAwareness(frame, {
        lightAffectEnabled: config.lightAffectEnabled,
        minConfidence: config.minConfidence,
      });
    } catch (error: any) {
      return {
        presence: 'uncertain',
        confidence: 0,
        affect: 'unclear',
        reason: 'api_error',
        checkedAt: this.now(),
      };
    }
  }

  private applyDetection(result: CameraAwarenessDetectionResult, config: CameraAwarenessConfig): void {
    const previousStatus = this.snapshot.status;
    const now = this.now();
    let nextStatus = previousStatus;

    if (result.presence === 'present' && result.confidence >= config.minConfidence) {
      nextStatus = 'present';
      this.lastSeenAt = now;
      if (previousStatus === 'absent' && config.returnedReactionEnabled) {
        this.emitReturned(result, now);
      }
    } else if (result.presence === 'absent') {
      if (this.lastSeenAt !== null && now - this.lastSeenAt >= config.absentAfterMs) {
        nextStatus = 'absent';
      } else if (previousStatus === 'unavailable' || previousStatus === 'uncertain') {
        nextStatus = 'uncertain';
      }
    } else if (previousStatus === 'unavailable') {
      nextStatus = 'uncertain';
    }

    this.snapshot = {
      ...this.snapshot,
      status: nextStatus,
      lastDetection: result,
      lastChangedAt: nextStatus !== previousStatus ? now : this.snapshot.lastChangedAt,
      backgroundDetectionRunning: true,
      lastError: result.reason === 'api_error' ? 'vision_unavailable' : undefined,
    };
  }

  private emitReturned(result: CameraAwarenessDetectionResult, occurredAt: number): void {
    const text = selectReturnedText(result.affect ?? 'unclear');
    const delivered = this.bubbleOrchestrator?.tryShowProactive(text, 'camera_awareness') ?? false;
    if (delivered) {
      this.snapshot.lastReturnedAt = occurredAt;
    }
  }

  private createDisabledResult(): CameraAwarenessDetectionResult {
    return {
      presence: 'uncertain',
      confidence: 0,
      affect: 'unclear',
      reason: 'api_error',
      checkedAt: this.now(),
    };
  }
}

export function selectReturnedText(affect: string): string {
  switch (affect) {
    case 'positive':
      return '回来啦，看起来状态不错～';
    case 'low_energy':
      return '回来啦，慢慢来就好。';
    case 'neutral':
      return '回来啦。';
    default:
      return '回来啦。';
  }
}
```

- [ ] **Step 4: Run tests and verify Task 2 passes**

Run:

```bash
npm test
```

Expected: PASS with `camera-awareness-contract tests passed`.

- [ ] **Step 5: Commit Task 2**

```bash
git add scripts/camera-awareness-contract.test.js src/core/camera-awareness-manager.ts
git commit -m "feat: add camera awareness manager"
```

---

### Task 3: Wire main/preload IPC and settings UI capture flow

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/main/settings.html`
- Modify: `scripts/camera-awareness-contract.test.js`

**Interfaces:**
- Consumes: `CameraAwarenessConfigManager`, `VisionImageAnalyzer`, `CameraAwarenessManager` from Tasks 1-2.
- Produces renderer facade:
  - `window.companion.cameraAwareness.getConfig(): Promise<CameraAwarenessConfig>`
  - `window.companion.cameraAwareness.updateConfig(partial): Promise<CameraAwarenessConfig>`
  - `window.companion.cameraAwareness.detectOnce(frame): Promise<CameraAwarenessDetectionResult>`
  - `window.companion.cameraAwareness.processBackgroundFrame(frame): Promise<CameraAwarenessSnapshot>`
  - `window.companion.cameraAwareness.getSnapshot(): Promise<CameraAwarenessSnapshot>`

- [ ] **Step 1: Extend contract test for IPC names**

Append this test to `scripts/camera-awareness-contract.test.js`:

```js
function testCameraIpcChannelNames() {
  const { CAMERA_AWARENESS_IPC } = load('core/camera-awareness-types.js');
  assert.strictEqual(CAMERA_AWARENESS_IPC.getConfig, 'camera-awareness:get-config');
  assert.strictEqual(CAMERA_AWARENESS_IPC.updateConfig, 'camera-awareness:update-config');
  assert.strictEqual(CAMERA_AWARENESS_IPC.detectOnce, 'camera-awareness:detect-once');
  assert.strictEqual(CAMERA_AWARENESS_IPC.processBackgroundFrame, 'camera-awareness:process-background-frame');
  assert.strictEqual(CAMERA_AWARENESS_IPC.getSnapshot, 'camera-awareness:get-snapshot');
}
```

Call it from `run()` after `testTypeConstants()`:

```js
testCameraIpcChannelNames();
```

- [ ] **Step 2: Run tests before wiring**

Run:

```bash
npm test
```

Expected: PASS. This test locks channel names before main/preload wiring.

- [ ] **Step 3: Wire core instances in `main.ts`**

Add imports near existing core imports:

```ts
import { CameraAwarenessConfigManager } from '../core/camera-awareness-config';
import { CameraAwarenessManager } from '../core/camera-awareness-manager';
import { CAMERA_AWARENESS_IPC, CameraFrameInput } from '../core/camera-awareness-types';
import { VisionImageAnalyzer } from '../core/vision-image-analyzer';
```

Add module-level variables near `voiceInputManager`:

```ts
let cameraAwarenessConfigManager: CameraAwarenessConfigManager;
let visionImageAnalyzer: VisionImageAnalyzer;
let cameraAwarenessManager: CameraAwarenessManager;
```

Instantiate after `screenAnalyzer = new ScreenAnalyzer(aiConfigManager);` and after `bubbleOrchestrator` exists:

```ts
visionImageAnalyzer = new VisionImageAnalyzer(aiConfigManager);
cameraAwarenessConfigManager = new CameraAwarenessConfigManager();
cameraAwarenessManager = new CameraAwarenessManager(
  cameraAwarenessConfigManager,
  visionImageAnalyzer,
  { bubbleOrchestrator }
);
```

- [ ] **Step 4: Add IPC handlers in `setupIPC()`**

Add after the screen-analysis IPC block or before TTS IPC:

```ts
  ipcMain.handle(CAMERA_AWARENESS_IPC.getConfig, () => {
    return cameraAwarenessManager?.getConfig();
  });

  ipcMain.handle(CAMERA_AWARENESS_IPC.updateConfig, (_event, partial: any) => {
    return cameraAwarenessManager?.updateConfig(partial);
  });

  ipcMain.handle(CAMERA_AWARENESS_IPC.detectOnce, async (_event, frame: CameraFrameInput) => {
    if (!cameraAwarenessManager) {
      return {
        presence: 'uncertain',
        confidence: 0,
        affect: 'unclear',
        reason: 'api_error',
        checkedAt: Date.now(),
      };
    }
    return await cameraAwarenessManager.detectOnce(frame);
  });

  ipcMain.handle(CAMERA_AWARENESS_IPC.processBackgroundFrame, async (_event, frame: CameraFrameInput) => {
    if (!cameraAwarenessManager) {
      return {
        status: 'unavailable',
        lastDetection: null,
        lastChangedAt: null,
        lastReturnedAt: null,
        backgroundDetectionRunning: false,
        lastError: 'camera_awareness_uninitialized',
      };
    }
    return await cameraAwarenessManager.processBackgroundFrame(frame);
  });

  ipcMain.handle(CAMERA_AWARENESS_IPC.getSnapshot, () => {
    return cameraAwarenessManager?.getSnapshot() ?? {
      status: 'unavailable',
      lastDetection: null,
      lastChangedAt: null,
      lastReturnedAt: null,
      backgroundDetectionRunning: false,
      lastError: 'camera_awareness_uninitialized',
    };
  });
```

- [ ] **Step 5: Expose preload camera facade**

In `src/main/preload.ts`, add inside the `contextBridge.exposeInMainWorld('companion', { ... })` object, near ASR/TTS config methods:

```ts
  cameraAwareness: {
    getConfig: (): Promise<any> => ipcRenderer.invoke('camera-awareness:get-config'),
    updateConfig: (partial: any): Promise<any> => ipcRenderer.invoke('camera-awareness:update-config', partial),
    detectOnce: (frame: any): Promise<any> => ipcRenderer.invoke('camera-awareness:detect-once', frame),
    processBackgroundFrame: (frame: any): Promise<any> => ipcRenderer.invoke('camera-awareness:process-background-frame', frame),
    getSnapshot: (): Promise<any> => ipcRenderer.invoke('camera-awareness:get-snapshot'),
  },
```

- [ ] **Step 6: Add settings sidebar tab and HTML section**

In `src/main/settings.html`, add a sidebar button after the screen analysis tab:

```html
<button class="tab-btn" data-tab="camera">摄像头感知</button>
```

Add this tab content after the screen analysis section and before TTS:

```html
<div class="tab-content" id="tab-camera">
  <h2>摄像头感知</h2>
  <hr class="divider">
  <div class="hint" style="margin-bottom: 12px; color: #666;">
    可选的轻量陪伴能力：截取低分辨率单帧，复用当前图片分析配置判断你是否在镜头前。
  </div>

  <div class="field">
    <label><input type="checkbox" id="cameraAwarenessEnabled"> 启用摄像头感知</label>
    <div class="hint">默认关闭。开启后才允许手动检测或后台低频检测。</div>
  </div>

  <div class="field">
    <label><input type="checkbox" id="cameraBackgroundEnabled"> 后台低频检测</label>
    <div class="hint">按设定间隔短暂获取单帧，不连续录制视频。</div>
  </div>

  <div class="field">
    <label><input type="checkbox" id="cameraLightAffectEnabled"> 轻量状态线索</label>
    <div class="hint">只使用 positive / neutral / low_energy / unclear 调整陪伴语气。</div>
  </div>

  <div class="field">
    <label>检测间隔</label>
    <select id="cameraDetectionIntervalMs">
      <option value="30000">30 秒</option>
      <option value="60000">1 分钟</option>
      <option value="180000">3 分钟</option>
      <option value="300000">5 分钟</option>
    </select>
  </div>

  <div class="field">
    <label>离开判定</label>
    <select id="cameraAbsentAfterMs">
      <option value="60000">1 分钟</option>
      <option value="120000">2 分钟</option>
      <option value="300000">5 分钟</option>
    </select>
  </div>

  <div class="field">
    <label><input type="checkbox" id="cameraReturnedReactionEnabled"> 回来时轻柔回应</label>
    <div class="hint">只在后台检测确认从“离开”变为“回来”时触发，并经过气泡冷却。</div>
  </div>

  <div class="field">
    <label><input type="checkbox" id="cameraDebugPreviewEnabled"> 调试预览</label>
    <div class="hint">仅在设置页显示最近一次低分辨率预览，不保存到磁盘。</div>
  </div>

  <div class="btn-row">
    <button class="btn btn-primary" id="saveCameraAwarenessBtn">保存摄像头设置</button>
    <button class="btn btn-secondary" id="testCameraAwarenessBtn">立即检测一次</button>
  </div>

  <div class="field" style="margin-top: 16px;">
    <label>检测结果</label>
    <div id="cameraAwarenessResult" class="hint" style="color:#555;">未检测</div>
    <img id="cameraAwarenessPreview" alt="摄像头调试预览" style="display:none; max-width: 100%; margin-top: 8px; border:1px solid #ddd; border-radius:6px;" />
  </div>
</div>
```

- [ ] **Step 7: Add settings JS helpers**

At the bottom script area of `src/main/settings.html`, add these helper functions near other config helpers. If the file already has a `DOMContentLoaded` initializer, call `loadCameraAwarenessConfig()` from it and wire button listeners there.

```html
<script>
let cameraAwarenessTimer = null;

function getCameraAwarenessForm() {
  return {
    enabled: document.getElementById('cameraAwarenessEnabled').checked,
    backgroundDetectionEnabled: document.getElementById('cameraBackgroundEnabled').checked,
    lightAffectEnabled: document.getElementById('cameraLightAffectEnabled').checked,
    detectionIntervalMs: Number(document.getElementById('cameraDetectionIntervalMs').value),
    absentAfterMs: Number(document.getElementById('cameraAbsentAfterMs').value),
    minConfidence: 0.65,
    returnedReactionEnabled: document.getElementById('cameraReturnedReactionEnabled').checked,
    debugPreviewEnabled: document.getElementById('cameraDebugPreviewEnabled').checked,
  };
}

function setCameraAwarenessForm(config) {
  document.getElementById('cameraAwarenessEnabled').checked = Boolean(config.enabled);
  document.getElementById('cameraBackgroundEnabled').checked = Boolean(config.backgroundDetectionEnabled);
  document.getElementById('cameraLightAffectEnabled').checked = config.lightAffectEnabled !== false;
  document.getElementById('cameraDetectionIntervalMs').value = String(config.detectionIntervalMs || 60000);
  document.getElementById('cameraAbsentAfterMs').value = String(config.absentAfterMs || 120000);
  document.getElementById('cameraReturnedReactionEnabled').checked = config.returnedReactionEnabled !== false;
  document.getElementById('cameraDebugPreviewEnabled').checked = Boolean(config.debugPreviewEnabled);
  updateCameraAwarenessTimer(config);
}

async function loadCameraAwarenessConfig() {
  if (!window.companion?.cameraAwareness) return;
  const config = await window.companion.cameraAwareness.getConfig();
  setCameraAwarenessForm(config);
}

async function saveCameraAwarenessConfig() {
  const config = await window.companion.cameraAwareness.updateConfig(getCameraAwarenessForm());
  setCameraAwarenessForm(config);
  showToast('摄像头感知设置已保存', 'success');
}

async function captureCameraFrame(source) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('当前环境不支持摄像头访问');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 320, height: 180 },
    audio: false,
  });

  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.onloadeddata = () => resolve();
    });

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    const base64 = dataUrl.split(',')[1] || '';

    if (document.getElementById('cameraDebugPreviewEnabled').checked) {
      const preview = document.getElementById('cameraAwarenessPreview');
      preview.src = dataUrl;
      preview.style.display = 'block';
    } else {
      const preview = document.getElementById('cameraAwarenessPreview');
      preview.removeAttribute('src');
      preview.style.display = 'none';
    }

    return {
      imageBase64: base64,
      mimeType: 'image/jpeg',
      width: canvas.width,
      height: canvas.height,
      capturedAt: Date.now(),
      source,
    };
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}

function formatCameraAwarenessResult(result) {
  const presenceText = {
    present: '有人在',
    absent: '未看到人',
    uncertain: '不确定',
  }[result.presence] || '不确定';
  const affectText = result.affect ? `，状态线索：${result.affect}` : '';
  return `${presenceText}（置信度 ${Number(result.confidence || 0).toFixed(2)}${affectText}，原因：${result.reason || 'unknown'}）`;
}

async function testCameraAwarenessOnce() {
  const resultEl = document.getElementById('cameraAwarenessResult');
  resultEl.textContent = '检测中...';
  try {
    const frame = await captureCameraFrame('settings-test');
    const result = await window.companion.cameraAwareness.detectOnce(frame);
    resultEl.textContent = formatCameraAwarenessResult(result);
  } catch (error) {
    resultEl.textContent = '检测失败：' + error.message;
  }
}

function updateCameraAwarenessTimer(config) {
  if (cameraAwarenessTimer) {
    clearInterval(cameraAwarenessTimer);
    cameraAwarenessTimer = null;
  }
  if (!config.enabled || !config.backgroundDetectionEnabled) return;

  cameraAwarenessTimer = setInterval(async () => {
    try {
      const frame = await captureCameraFrame('background');
      const snapshot = await window.companion.cameraAwareness.processBackgroundFrame(frame);
      if (snapshot.lastDetection) {
        document.getElementById('cameraAwarenessResult').textContent = formatCameraAwarenessResult(snapshot.lastDetection);
      }
    } catch (error) {
      document.getElementById('cameraAwarenessResult').textContent = '后台检测失败：' + error.message;
    }
  }, config.detectionIntervalMs || 60000);
}
</script>
```

If `settings.html` already has a single `<script>` block, do not add a second conflicting block. Instead paste the functions into the existing script and add these listener calls in its existing initialization block:

```js
document.getElementById('saveCameraAwarenessBtn')?.addEventListener('click', saveCameraAwarenessConfig);
document.getElementById('testCameraAwarenessBtn')?.addEventListener('click', testCameraAwarenessOnce);
loadCameraAwarenessConfig();
```

- [ ] **Step 8: Run build and tests**

Run:

```bash
npm run build
npm test
```

Expected: both PASS. If TypeScript reports duplicate `<script>`-scoped declarations in `settings.html`, move helpers into the existing script rather than creating a second script block.

- [ ] **Step 9: Manual settings smoke test**

Run:

```bash
npm run build
npm start
```

Expected manual behavior:

1. Press `F11` to open settings.
2. Sidebar contains `摄像头感知`.
3. The tab loads saved/default settings.
4. Clicking `立即检测一次` asks for camera permission.
5. If permission is granted and Vision config is valid, result text changes from `检测中...` to `有人在` / `未看到人` / `不确定`.
6. If permission is denied, result text begins with `检测失败：`.
7. Close the app after smoke test.

- [ ] **Step 10: Commit Task 3**

```bash
git add scripts/camera-awareness-contract.test.js src/main/main.ts src/main/preload.ts src/main/settings.html
git commit -m "feat: wire camera awareness settings"
```

---

### Task 4: Document camera awareness and update project indexes

**Files:**
- Create: `docs/camera-awareness.md`
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`

**Interfaces:**
- Consumes: implemented module names and IPC channels from Tasks 1-3.
- Produces: user/developer documentation for settings, config defaults, IPC, privacy boundaries, and troubleshooting.

- [ ] **Step 1: Create module documentation**

Create `docs/camera-awareness.md`:

```markdown
# Camera Awareness 摄像头感知

Camera Awareness 是 Project-Ze 的可选轻量陪伴模块。它通过设置页或后台低频检测截取低分辨率摄像头单帧，复用现有 Vision 图片分析配置，判断用户是否在镜头前，并可选返回粗粒度状态线索。

## 能力边界

支持：

- 判断 `present` / `absent` / `uncertain`。
- 可选轻量状态线索：`positive` / `neutral` / `low_energy` / `unclear`。
- 设置页“立即检测一次”。
- 用户明确开启后的后台低频检测。
- 后台检测确认 `absent -> present` 后，触发低优先级回来气泡。

不支持：

- 不连续录制或上传视频。
- 不保存摄像头图片到磁盘。
- 不做人脸身份识别。
- 不判断年龄、性别、种族等敏感属性。
- 不做医学、心理或精细情绪诊断。
- 不把摄像头画面写入长期记忆。

## 设置项

运行态配置保存在 Electron `userData/config/camera-awareness.json`，默认值：

```ts
{
  enabled: false,
  backgroundDetectionEnabled: false,
  lightAffectEnabled: true,
  detectionIntervalMs: 60000,
  absentAfterMs: 120000,
  minConfidence: 0.65,
  returnedReactionEnabled: true,
  debugPreviewEnabled: false
}
```

## 模块

- `src/core/camera-awareness-types.ts`：共享类型和 IPC 常量。
- `src/core/camera-awareness-config.ts`：配置默认值和持久化。
- `src/core/vision-image-analyzer.ts`：复用 Vision 配置分析摄像头单帧。
- `src/core/camera-awareness-manager.ts`：检测入口、状态机和回来事件。
- `src/main/settings.html`：摄像头设置、立即检测、后台低频取帧。

## IPC

renderer -> main：

- `camera-awareness:get-config`
- `camera-awareness:update-config`
- `camera-awareness:detect-once`
- `camera-awareness:process-background-frame`
- `camera-awareness:get-snapshot`

`detect-once` 只用于设置页测试，不触发气泡。`process-background-frame` 会更新状态机，并可能在 `absent -> present` 时触发回来回应。

## Vision 配置

摄像头感知复用“屏幕分析”的 Vision API 配置：

- Vision API Key
- Vision API 地址
- Vision 模型

如果这些配置为空或不可用，摄像头感知会返回 `uncertain`，原因通常为 `api_error`。

## 调试

1. 打开设置页 `F11`。
2. 进入“摄像头感知”。
3. 开启“启用摄像头感知”。
4. 点击“立即检测一次”。
5. 查看检测结果文本。
6. 若需要查看低分辨率帧，开启“调试预览”。预览只显示在设置页，不保存到磁盘。

## 常见问题

### 摄像头权限被拒绝

在系统设置或浏览器权限中允许应用访问摄像头，然后重新点击“立即检测一次”。

### 一直显示不确定

检查屏幕分析 Vision 配置是否可用；确认环境光线足够；确认摄像头没有被遮挡。

### 后台没有回应

确认同时开启了“启用摄像头感知”“后台低频检测”和“回来时轻柔回应”。回应仍会经过气泡状态门禁和冷却，如果 Ze 正在拖拽、睡觉或短时间刚说过话，可能不会显示。
```

- [ ] **Step 2: Update `PROJECT_INDEX.md`**

Apply these edits:

1. In `core 模块速查`, add:

```markdown
- `camera-awareness-types.ts` / `camera-awareness-config.ts` / `camera-awareness-manager.ts`：可选摄像头感知模块，负责低频单帧存在检测、轻量状态线索、状态机和回来事件；默认关闭，复用 Vision 图片分析配置。
- `vision-image-analyzer.ts`：轻量图片 Vision 复用层，当前用于摄像头感知单帧结构化判断。
```

2. In `IPC 通道一览` renderer -> main table, add:

```markdown
| camera-awareness:get-config | - | 读取摄像头感知配置 |
| camera-awareness:update-config | Partial<CameraAwarenessConfig> | 更新摄像头感知配置 |
| camera-awareness:detect-once | CameraFrameInput | 设置页立即检测一次，不触发气泡 |
| camera-awareness:process-background-frame | CameraFrameInput | 后台低频检测帧，更新状态机 |
| camera-awareness:get-snapshot | - | 获取摄像头感知状态快照 |
```

3. In `常见修改场景`, add:

```markdown
### 修改摄像头感知
- 配置默认值：`src/core/camera-awareness-config.ts`
- 状态机和回来事件：`src/core/camera-awareness-manager.ts`
- Vision 结构化解析：`src/core/vision-image-analyzer.ts`
- 设置页 UI 和单帧采集：`src/main/settings.html`
- 模块说明：`docs/camera-awareness.md`
```

- [ ] **Step 3: Update `VERSION.md`**

Add under `## Unreleased`:

```markdown
- 新增摄像头感知设计与实现：设置页可选开启，支持低分辨率单帧检测、轻量状态线索、后台低频检测和回来时轻柔回应；复用现有 Vision 图片分析配置，不保存摄像头图片或视频
```

- [ ] **Step 4: Run docs grep and tests**

Run:

```bash
npm run build
npm test
```

Expected: PASS.

Run:

```bash
node -e "const fs=require('fs'); const files=['docs/camera-awareness.md','docs/superpowers/plans/2026-07-15-camera-awareness.md','PROJECT_INDEX.md','VERSION.md']; const patterns=['TO'+'DO','TB'+'D','待'+'定','未'+'定']; let bad=false; for (const file of files) { if (!fs.existsSync(file)) continue; const text=fs.readFileSync(file,'utf8'); text.split(/\r?\n/).forEach((line,i)=>{ if (patterns.some((p)=>line.includes(p))) { console.log(`${file}:${i+1}:${line}`); bad=true; } }); } process.exit(bad ? 1 : 0);"
```

Expected: no output.

- [ ] **Step 5: Commit Task 4**

```bash
git add docs/camera-awareness.md PROJECT_INDEX.md VERSION.md
git commit -m "docs: document camera awareness module"
```

---

## Final Verification

After all tasks are complete, run:

```bash
git status --short
npm run build
npm test
```

Expected:

```text
# git status has no output
# npm run build exits 0
# npm test exits 0 and prints:
voice-input-contract tests passed
camera-awareness-contract tests passed
```

Manual smoke test:

```bash
npm start
```

Expected:

1. Main pet window opens.
2. `F11` opens settings.
3. “摄像头感知” tab exists.
4. “立即检测一次” requests camera permission and shows a result or a clear permission/API error.
5. Closing/reopening settings preserves camera awareness config.

## Implementation Notes

- If `settings.html` has an existing script block, merge all camera helper functions into it instead of creating a second independent initialization path.
- If `ScreenAnalyzer` later gains a reusable image-analysis helper, `VisionImageAnalyzer` can delegate to it. Do not block this implementation on a broader `ScreenAnalyzer` refactor.
- If Vision API response format varies, keep parsing conservative: invalid JSON becomes `uncertain` with `api_error`, not a thrown app-level crash.
- Background detection runs only while settings window exists in this first implementation because frame capture lives in settings renderer. A future task can move background capture to a hidden renderer if always-on background awareness is desired without the settings window.
