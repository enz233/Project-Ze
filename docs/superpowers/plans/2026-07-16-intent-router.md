# Intent Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Intent Router layer that classifies multimodal user requests, applies privacy gates, records debug decisions, and prepares thin execution dispatch to existing Project-Ze modules.

**Architecture:** Add focused core files under `src/core/`: stable intent types, a rule-first classifier with a validated LLM fallback adapter, a router with local permission policy and debug ring buffer, and a thin executor that delegates to injected handlers. Keep current modules authoritative: ChatManager, ScreenAnalyzer, ScreenTargetPointer, CameraAwarenessManager, BubbleOrchestrator and config managers retain their business logic.

**Tech Stack:** Electron + TypeScript strict CommonJS, Node `assert` contract tests under `scripts/`, TypeScript build via `npm run build`.

## Global Constraints

- 优先通过项目文档理解现状，只在任务需要时读取少量相关源码。
- 普通聊天和 ASR 文本允许自然语言触发屏幕总结/目标指示，但必须是明确请求。
- LLM fallback 只能建议结构化意图；本地 Router 权限策略决定能否执行。
- 摄像头第一版只允许明确请求的一次性检测；不做持续后台视频分析、身份识别、敏感属性判断、医学/心理诊断或保存图像/视频。
- Executor 只做薄分发，不迁移 ScreenAnalyzer、ScreenTargetPointer、CameraAwarenessManager 或 ChatManager 的核心职责。
- 任务完成后更新项目文档并提交 git。
- 当前测试入口是 `npm test`：先 `npm run build`，再运行 `scripts/*.test.js` 契约测试。

---

## File Structure

Create:

- `src/core/intent-types.ts` — one source of truth for intent source/kind/capability enums, request/decision/permission/execution/debug interfaces, and small helper guards.
- `src/core/intent-classifier.ts` — pure rule-first classifier plus optional LLM fallback adapter and JSON validation.
- `src/core/intent-router.ts` — classifier orchestration, permission policy, debug ring buffer, and routed decision API.
- `src/core/intent-executor.ts` — thin handler-based dispatcher for allowed routed decisions.
- `scripts/intent-router-contract.test.js` — Node contract tests for classifier, router, fallback validation and executor dispatch.
- `docs/intent-router.md` — maintainer-facing module note with first-version boundaries and privacy policy.

Modify:

- `package.json` — add `scripts/intent-router-contract.test.js` to `npm test` after existing contract tests.
- `PROJECT_INDEX.md` — add core module quick-reference entries for the new intent files and a short architecture note.
- `VERSION.md` — add Unreleased entry for Intent Router design/first implementation.
- Later integration tasks may modify `src/main/main.ts`, `src/main/preload.ts`, `src/main/debug.html`, and `src/core/chat-manager.ts`; only do so after Tasks 1-4 are green.

---

### Task 1: Intent Types and Rule Classifier

**Files:**
- Create: `src/core/intent-types.ts`
- Create: `src/core/intent-classifier.ts`
- Create: `scripts/intent-router-contract.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: no new internal interfaces.
- Produces:
  - `class IntentClassifier { constructor(options?: IntentClassifierOptions); classify(request: IntentRequest): Promise<IntentDecision>; }`
  - `interface IntentClassifierOptions { llmFallback?: IntentLlmFallback; enableLlmFallback?: boolean; lowConfidenceThreshold?: number; }`
  - `type IntentLlmFallback = (request: IntentRequest, draft: IntentDecision) => Promise<unknown>`
  - `function isSensitiveCapability(capability: IntentCapability): boolean`

- [ ] **Step 1: Write failing classifier tests**

Create `scripts/intent-router-contract.test.js` with this initial content:

```js
const assert = require('assert');

function load(modulePath) {
  return require(`../dist/${modulePath}`);
}

async function testRuleClassifierNormalChatDoesNotNeedSensitiveCapabilities() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier();

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '你好，今天状态怎么样？',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'normal_chat');
  assert.strictEqual(decision.explicitness, 'implicit');
  assert.deepStrictEqual(decision.requiredCapabilities, ['llm']);
  assert.strictEqual(decision.usedLlmFallback, false);
}

async function testRuleClassifierScreenSummaryFromNaturalLanguage() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier();

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '帮我看看这个页面在讲什么',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'screen_summary');
  assert.strictEqual(decision.explicitness, 'explicit');
  assert.ok(decision.confidence >= 0.8);
  assert.deepStrictEqual(decision.requiredCapabilities, ['screen_capture', 'vision', 'llm']);
}

async function testRuleClassifierScreenTargetExtractsTarget() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier();

  const decision = await classifier.classify({
    source: 'voice_asr',
    text: '指出下载按钮在哪',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'screen_target_pointer');
  assert.strictEqual(decision.target, '下载按钮');
  assert.deepStrictEqual(decision.requiredCapabilities, ['screen_capture', 'vision', 'move_pointer']);
}

async function testRuleClassifierCameraCheckIsExplicitOneShot() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier();

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '检测一下摄像头状态',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'camera_check_once');
  assert.strictEqual(decision.explicitness, 'explicit');
  assert.deepStrictEqual(decision.requiredCapabilities, ['camera_frame']);
}

async function run() {
  await testRuleClassifierNormalChatDoesNotNeedSensitiveCapabilities();
  await testRuleClassifierScreenSummaryFromNaturalLanguage();
  await testRuleClassifierScreenTargetExtractsTarget();
  await testRuleClassifierCameraCheckIsExplicitOneShot();
  console.log('intent-router contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Add test to package script**

Modify `package.json` test script from:

```json
"test": "npm run build && node scripts/voice-input-contract.test.js && node scripts/screen-fingerprint-contract.test.js && node scripts/screen-capture-frame-contract.test.js"
```

to:

```json
"test": "npm run build && node scripts/voice-input-contract.test.js && node scripts/screen-fingerprint-contract.test.js && node scripts/screen-capture-frame-contract.test.js && node scripts/intent-router-contract.test.js"
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
npm test
```

Expected: `npm run build` fails with missing `src/core/intent-classifier.ts`, or `node scripts/intent-router-contract.test.js` fails with `Cannot find module '../dist/core/intent-classifier.js'`.

- [ ] **Step 4: Implement `intent-types.ts`**

Create `src/core/intent-types.ts`:

```ts
export type IntentSource =
  | 'text_chat'
  | 'voice_asr'
  | 'screen_dot'
  | 'camera_awareness'
  | 'proactive_context'
  | 'debug_panel';

export type IntentKind =
  | 'normal_chat'
  | 'screen_summary'
  | 'screen_target_pointer'
  | 'camera_check_once'
  | 'voice_input_help'
  | 'settings_debug_help'
  | 'proactive_explain'
  | 'proactive_control'
  | 'unknown';

export type IntentCapability =
  | 'llm'
  | 'screen_capture'
  | 'vision'
  | 'camera_frame'
  | 'move_pointer'
  | 'config_read'
  | 'config_write'
  | 'bubble'
  | 'tts';

export type IntentExplicitness = 'explicit' | 'implicit' | 'ambiguous';
export type IntentPermissionStatus = 'allowed' | 'denied' | 'needs_confirmation';
export type IntentExecutionStatus = 'handled' | 'skipped' | 'failed';

export interface IntentRequest {
  source: IntentSource;
  text?: string;
  userInitiated: boolean;
  screenExplicitlyRequested?: boolean;
  cameraExplicitlyRequested?: boolean;
  metadata?: Record<string, unknown>;
}

export interface IntentDecision {
  intent: IntentKind;
  confidence: number;
  reason: string;
  explicitness: IntentExplicitness;
  requiredCapabilities: IntentCapability[];
  usedLlmFallback: boolean;
  target?: string;
}

export interface IntentPermissionResult {
  status: IntentPermissionStatus;
  reason: string;
  deniedCapabilities: IntentCapability[];
}

export interface IntentRoutedDecision {
  request: IntentRequest;
  decision: IntentDecision;
  permission: IntentPermissionResult;
}

export interface IntentExecutionResult {
  status: IntentExecutionStatus;
  message?: string;
  error?: string;
  debug?: Record<string, unknown>;
}

export interface IntentDebugRecord {
  occurredAt: string;
  source: IntentSource;
  textSummary: string;
  intent: IntentKind;
  confidence: number;
  reason: string;
  usedLlmFallback: boolean;
  requiredCapabilities: IntentCapability[];
  permissionStatus: IntentPermissionStatus;
  permissionReason: string;
  deniedCapabilities: IntentCapability[];
  executorStatus?: IntentExecutionStatus;
  executorMessage?: string;
  executorError?: string;
}

export interface IntentDebugSnapshot {
  recent: IntentDebugRecord[];
}

export function isSensitiveCapability(capability: IntentCapability): boolean {
  return capability === 'screen_capture'
    || capability === 'vision'
    || capability === 'camera_frame'
    || capability === 'move_pointer'
    || capability === 'config_write';
}

export function summarizeIntentText(text: string | undefined, maxLength = 80): string {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}
```

- [ ] **Step 5: Implement `intent-classifier.ts`**

Create `src/core/intent-classifier.ts`:

```ts
import {
  IntentCapability,
  IntentDecision,
  IntentExplicitness,
  IntentKind,
  IntentRequest,
} from './intent-types';

export type IntentLlmFallback = (request: IntentRequest, draft: IntentDecision) => Promise<unknown>;

export interface IntentClassifierOptions {
  llmFallback?: IntentLlmFallback;
  enableLlmFallback?: boolean;
  lowConfidenceThreshold?: number;
}

interface ParsedFallback {
  intent?: unknown;
  confidence?: unknown;
  reason?: unknown;
  target?: unknown;
  explicitness?: unknown;
  requires?: unknown;
}

const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.55;
const INTENT_KINDS: IntentKind[] = [
  'normal_chat',
  'screen_summary',
  'screen_target_pointer',
  'camera_check_once',
  'voice_input_help',
  'settings_debug_help',
  'proactive_explain',
  'proactive_control',
  'unknown',
];
const EXPLICITNESS_VALUES: IntentExplicitness[] = ['explicit', 'implicit', 'ambiguous'];
const CAPABILITIES: IntentCapability[] = [
  'llm',
  'screen_capture',
  'vision',
  'camera_frame',
  'move_pointer',
  'config_read',
  'config_write',
  'bubble',
  'tts',
];

export class IntentClassifier {
  private readonly llmFallback?: IntentLlmFallback;
  private readonly enableLlmFallback: boolean;
  private readonly lowConfidenceThreshold: number;

  constructor(options: IntentClassifierOptions = {}) {
    this.llmFallback = options.llmFallback;
    this.enableLlmFallback = options.enableLlmFallback ?? Boolean(options.llmFallback);
    this.lowConfidenceThreshold = options.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE_THRESHOLD;
  }

  async classify(request: IntentRequest): Promise<IntentDecision> {
    const draft = this.classifyByRules(request);
    if (!this.shouldUseLlmFallback(request, draft)) return draft;

    try {
      const raw = await this.llmFallback?.(request, draft);
      const parsed = this.normalizeFallback(raw, draft);
      return { ...parsed, usedLlmFallback: true };
    } catch (error) {
      return {
        ...draft,
        reason: `${draft.reason}; LLM fallback failed: ${error instanceof Error ? error.message : String(error)}`,
        usedLlmFallback: true,
      };
    }
  }

  private classifyByRules(request: IntentRequest): IntentDecision {
    const text = normalizeText(request.text);
    if (!text) return decision('unknown', 0.2, 'empty input', 'ambiguous', [], false);

    if (matchesAny(text, ['你刚才为什么突然说话', '为什么突然说话', '为什么提醒我', '为什么主动提醒'])) {
      return decision('proactive_explain', 0.9, 'user asks why the companion proactively spoke', 'explicit', ['config_read'], false);
    }

    if (matchesAny(text, ['先别主动提醒', '关闭主动提醒', '暂停主动提醒', '别主动提醒'])) {
      return decision('proactive_control', 0.86, 'user explicitly asks to control proactive reminders', 'explicit', ['config_write'], false);
    }

    if (matchesAny(text, ['语音识别没反应', '麦克风没反应', 'asr 出问题', '语音输入没反应', '语音识别好像没反应'])) {
      return decision('voice_input_help', 0.88, 'user asks for voice input diagnostics', 'explicit', ['config_read'], false);
    }

    if (matchesAny(text, ['设置在哪', '打开设置', '调试帮助', 'debug 面板', '配置帮助'])) {
      return decision('settings_debug_help', 0.76, 'user asks for settings or debug help', 'explicit', ['config_read'], false);
    }

    if (matchesAny(text, ['检测一下摄像头状态', '看一下摄像头状态', '摄像头感知有没有工作', '看看我在不在', '检测一下我在不在'])) {
      return decision('camera_check_once', 0.9, 'user explicitly requests one camera awareness check', 'explicit', ['camera_frame'], false);
    }

    const target = extractTarget(text);
    if (target) {
      return decision('screen_target_pointer', 0.88, `user asks to locate target: ${target}`, 'explicit', ['screen_capture', 'vision', 'move_pointer'], false, target);
    }

    if (request.source === 'screen_dot' || matchesAny(text, ['帮我看看这个页面', '看看这个页面', '分析屏幕', '当前页面讲什么', '屏幕上是什么', '这个页面在讲什么'])) {
      return decision('screen_summary', 0.86, 'user explicitly requests current screen summary', 'explicit', ['screen_capture', 'vision', 'llm'], false);
    }

    if (matchesAny(text, ['这里', '这个', '页面', '按钮', '摄像头', '主动', '语音', '设置'])) {
      return decision('unknown', 0.45, 'contextual words present but no safe rule matched', 'ambiguous', [], false);
    }

    return decision('normal_chat', 0.72, 'no multimodal intent matched', 'implicit', ['llm'], false);
  }

  private shouldUseLlmFallback(request: IntentRequest, draft: IntentDecision): boolean {
    if (!this.enableLlmFallback || !this.llmFallback) return false;
    if (draft.confidence >= this.lowConfidenceThreshold && draft.intent !== 'unknown') return false;
    return matchesAny(normalizeText(request.text), ['这里', '这个', '页面', '按钮', '摄像头', '主动', '语音', '设置']);
  }

  private normalizeFallback(raw: unknown, draft: IntentDecision): IntentDecision {
    const value: ParsedFallback = typeof raw === 'string' ? JSON.parse(raw) : (raw as ParsedFallback);
    const intent = INTENT_KINDS.includes(value.intent as IntentKind) ? value.intent as IntentKind : draft.intent;
    const confidence = typeof value.confidence === 'number' && Number.isFinite(value.confidence)
      ? Math.max(0, Math.min(1, value.confidence))
      : draft.confidence;
    const explicitness = EXPLICITNESS_VALUES.includes(value.explicitness as IntentExplicitness)
      ? value.explicitness as IntentExplicitness
      : draft.explicitness;
    const requiredCapabilities = Array.isArray(value.requires)
      ? value.requires.filter((capability): capability is IntentCapability => CAPABILITIES.includes(capability as IntentCapability))
      : draft.requiredCapabilities;
    const target = typeof value.target === 'string' && value.target.trim() ? value.target.trim() : draft.target;

    if (intent === 'screen_target_pointer' && !target) {
      return decision('unknown', 0.2, 'LLM fallback requested target pointer without target', 'ambiguous', [], true);
    }

    return {
      intent,
      confidence,
      reason: typeof value.reason === 'string' && value.reason.trim() ? value.reason.trim() : draft.reason,
      explicitness,
      requiredCapabilities,
      usedLlmFallback: true,
      ...(target ? { target } : {}),
    };
  }
}

function decision(
  intent: IntentKind,
  confidence: number,
  reason: string,
  explicitness: IntentExplicitness,
  requiredCapabilities: IntentCapability[],
  usedLlmFallback: boolean,
  target?: string
): IntentDecision {
  return { intent, confidence, reason, explicitness, requiredCapabilities, usedLlmFallback, ...(target ? { target } : {}) };
}

function normalizeText(text: string | undefined): string {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern.toLowerCase()));
}

function extractTarget(text: string): string | undefined {
  const normalized = normalizeText(text);
  const locateWords = ['指出', '在哪', '哪里', '帮我找', '找到'];
  if (!locateWords.some((word) => normalized.includes(word))) return undefined;

  const knownTargets = ['下载按钮', '登录按钮', '注册按钮', '关闭按钮', '提交按钮', '确认按钮', '取消按钮', '搜索框', '输入框', '链接'];
  const known = knownTargets.find((target) => normalized.includes(target));
  if (known) return known;

  const match = normalized.match(/(?:指出|帮我找|找到)([^，。！？?]{1,24})/);
  if (match?.[1]) return match[1].replace(/在哪|在哪里|位置/g, '').trim() || undefined;
  return undefined;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
npm test
```

Expected: all existing tests pass and output includes `intent-router contract tests passed`.

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/intent-router-contract.test.js src/core/intent-types.ts src/core/intent-classifier.ts
git commit -m "feat: add intent classifier contracts"
```

---

### Task 2: Router Permission Gate and Debug Snapshot

**Files:**
- Create: `src/core/intent-router.ts`
- Modify: `scripts/intent-router-contract.test.js`

**Interfaces:**
- Consumes:
  - `IntentClassifier.classify(request: IntentRequest): Promise<IntentDecision>`
  - Types from `intent-types.ts`
- Produces:
  - `class IntentRouter { constructor(options?: IntentRouterOptions); route(request: IntentRequest): Promise<IntentRoutedDecision>; getDebugSnapshot(): IntentDebugSnapshot; recordExecution(result: IntentExecutionResult): void; }`
  - `interface IntentRouterOptions { classifier?: IntentClassifier; cameraEnabled?: () => boolean; debugLimit?: number; }`

- [ ] **Step 1: Add failing router tests**

Append these tests before `run()` in `scripts/intent-router-contract.test.js`:

```js
async function testRouterAllowsExplicitScreenSummaryFromTextChat() {
  const { IntentRouter } = load('core/intent-router.js');
  const router = new IntentRouter();

  const routed = await router.route({
    source: 'text_chat',
    text: '帮我看看这个页面',
    userInitiated: true,
  });

  assert.strictEqual(routed.decision.intent, 'screen_summary');
  assert.strictEqual(routed.permission.status, 'allowed');
}

async function testRouterDeniesAmbiguousSensitiveFallback() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const { IntentRouter } = load('core/intent-router.js');
  const classifier = new IntentClassifier({
    enableLlmFallback: true,
    llmFallback: async () => ({
      intent: 'camera_check_once',
      confidence: 0.9,
      reason: 'bad fallback tries camera without explicit request',
      explicitness: 'ambiguous',
      requires: ['camera_frame'],
    }),
  });
  const router = new IntentRouter({ classifier, cameraEnabled: () => true });

  const routed = await router.route({
    source: 'text_chat',
    text: '这个好像有点怪',
    userInitiated: true,
  });

  assert.strictEqual(routed.decision.intent, 'camera_check_once');
  assert.strictEqual(routed.permission.status, 'denied');
  assert.match(routed.permission.reason, /explicit/);
}

async function testRouterRequiresCameraConfigForCameraCheck() {
  const { IntentRouter } = load('core/intent-router.js');
  const router = new IntentRouter({ cameraEnabled: () => false });

  const routed = await router.route({
    source: 'text_chat',
    text: '检测一下摄像头状态',
    userInitiated: true,
  });

  assert.strictEqual(routed.decision.intent, 'camera_check_once');
  assert.strictEqual(routed.permission.status, 'denied');
  assert.match(routed.permission.reason, /camera awareness is disabled/);
}

async function testRouterRecordsDebugSnapshot() {
  const { IntentRouter } = load('core/intent-router.js');
  const router = new IntentRouter({ debugLimit: 2 });

  await router.route({ source: 'text_chat', text: '你好', userInitiated: true });
  await router.route({ source: 'text_chat', text: '帮我看看这个页面', userInitiated: true });
  await router.route({ source: 'voice_asr', text: '指出下载按钮', userInitiated: true });

  const snapshot = router.getDebugSnapshot();
  assert.strictEqual(snapshot.recent.length, 2);
  assert.strictEqual(snapshot.recent[0].intent, 'screen_summary');
  assert.strictEqual(snapshot.recent[1].intent, 'screen_target_pointer');
  assert.strictEqual(snapshot.recent[1].permissionStatus, 'allowed');
}
```

Update `run()` to include these calls after Task 1 tests:

```js
  await testRouterAllowsExplicitScreenSummaryFromTextChat();
  await testRouterDeniesAmbiguousSensitiveFallback();
  await testRouterRequiresCameraConfigForCameraCheck();
  await testRouterRecordsDebugSnapshot();
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test
```

Expected: failure with `Cannot find module '../dist/core/intent-router.js'`.

- [ ] **Step 3: Implement `intent-router.ts`**

Create `src/core/intent-router.ts`:

```ts
import { IntentClassifier } from './intent-classifier';
import {
  IntentCapability,
  IntentDebugRecord,
  IntentDebugSnapshot,
  IntentDecision,
  IntentExecutionResult,
  IntentPermissionResult,
  IntentRequest,
  IntentRoutedDecision,
  isSensitiveCapability,
  summarizeIntentText,
} from './intent-types';

export interface IntentRouterOptions {
  classifier?: IntentClassifier;
  cameraEnabled?: () => boolean;
  debugLimit?: number;
}

const DEFAULT_DEBUG_LIMIT = 10;

export class IntentRouter {
  private readonly classifier: IntentClassifier;
  private readonly cameraEnabled: () => boolean;
  private readonly debugLimit: number;
  private readonly recent: IntentDebugRecord[] = [];

  constructor(options: IntentRouterOptions = {}) {
    this.classifier = options.classifier ?? new IntentClassifier();
    this.cameraEnabled = options.cameraEnabled ?? (() => false);
    this.debugLimit = options.debugLimit ?? DEFAULT_DEBUG_LIMIT;
  }

  async route(request: IntentRequest): Promise<IntentRoutedDecision> {
    const decision = await this.classifier.classify(request);
    const permission = this.applyPermissionPolicy(request, decision);
    const routed = { request, decision, permission };
    this.recordRoute(routed);
    return routed;
  }

  getDebugSnapshot(): IntentDebugSnapshot {
    return { recent: this.recent.map((record) => ({ ...record, requiredCapabilities: [...record.requiredCapabilities], deniedCapabilities: [...record.deniedCapabilities] })) };
  }

  recordExecution(result: IntentExecutionResult): void {
    const last = this.recent[this.recent.length - 1];
    if (!last) return;
    last.executorStatus = result.status;
    last.executorMessage = result.message;
    last.executorError = result.error;
  }

  private applyPermissionPolicy(request: IntentRequest, decision: IntentDecision): IntentPermissionResult {
    const deniedCapabilities: IntentCapability[] = [];

    for (const capability of decision.requiredCapabilities) {
      if (!this.isCapabilityAllowed(request, decision, capability)) deniedCapabilities.push(capability);
    }

    if (deniedCapabilities.length > 0) {
      return {
        status: 'denied',
        reason: this.denialReason(request, decision, deniedCapabilities),
        deniedCapabilities,
      };
    }

    if (decision.intent === 'proactive_control' && decision.requiredCapabilities.includes('config_write')) {
      return {
        status: 'needs_confirmation',
        reason: 'proactive reminder changes require explicit confirmation before writing config',
        deniedCapabilities: [],
      };
    }

    return { status: 'allowed', reason: 'intent is allowed by local privacy policy', deniedCapabilities: [] };
  }

  private isCapabilityAllowed(request: IntentRequest, decision: IntentDecision, capability: IntentCapability): boolean {
    if (!isSensitiveCapability(capability)) return true;

    if (capability === 'screen_capture' || capability === 'vision' || capability === 'move_pointer') {
      if (request.source === 'screen_dot') return decision.explicitness !== 'ambiguous';
      return request.userInitiated && decision.explicitness === 'explicit';
    }

    if (capability === 'camera_frame') {
      return request.userInitiated && decision.explicitness === 'explicit' && this.cameraEnabled();
    }

    if (capability === 'config_write') {
      return request.userInitiated && decision.explicitness === 'explicit';
    }

    return false;
  }

  private denialReason(request: IntentRequest, decision: IntentDecision, deniedCapabilities: IntentCapability[]): string {
    if (deniedCapabilities.includes('camera_frame') && !this.cameraEnabled()) {
      return 'camera awareness is disabled; one-shot camera checks cannot run';
    }
    if (decision.explicitness !== 'explicit') {
      return 'sensitive capabilities require explicit user intent';
    }
    if (!request.userInitiated) {
      return 'sensitive capabilities require a user-initiated request';
    }
    return `blocked sensitive capabilities: ${deniedCapabilities.join(', ')}`;
  }

  private recordRoute(routed: IntentRoutedDecision): void {
    this.recent.push({
      occurredAt: new Date().toISOString(),
      source: routed.request.source,
      textSummary: summarizeIntentText(routed.request.text),
      intent: routed.decision.intent,
      confidence: routed.decision.confidence,
      reason: routed.decision.reason,
      usedLlmFallback: routed.decision.usedLlmFallback,
      requiredCapabilities: [...routed.decision.requiredCapabilities],
      permissionStatus: routed.permission.status,
      permissionReason: routed.permission.reason,
      deniedCapabilities: [...routed.permission.deniedCapabilities],
    });
    while (this.recent.length > this.debugLimit) this.recent.shift();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test
```

Expected: PASS and `intent-router contract tests passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/intent-router-contract.test.js src/core/intent-router.ts
git commit -m "feat: add intent router permission gate"
```

---

### Task 3: LLM Fallback Validation Contracts

**Files:**
- Modify: `scripts/intent-router-contract.test.js`
- Modify: `src/core/intent-classifier.ts`

**Interfaces:**
- Consumes:
  - `IntentClassifierOptions.llmFallback`
- Produces:
  - Validated fallback behavior: invalid JSON, invalid enum, low confidence, missing target never executes sensitive capability by accident.

- [ ] **Step 1: Add failing LLM fallback validation tests**

Append these tests before `run()`:

```js
async function testLlmFallbackCanClassifyAmbiguousPageRequest() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier({
    enableLlmFallback: true,
    llmFallback: async () => JSON.stringify({
      intent: 'screen_summary',
      confidence: 0.81,
      reason: '用户用“这里”指代当前页面并要求解释',
      explicitness: 'explicit',
      requires: ['screen_capture', 'vision', 'llm'],
    }),
  });

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '这里帮我看一下',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'screen_summary');
  assert.strictEqual(decision.usedLlmFallback, true);
  assert.deepStrictEqual(decision.requiredCapabilities, ['screen_capture', 'vision', 'llm']);
}

async function testLlmFallbackMissingTargetDowngradesToUnknown() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier({
    enableLlmFallback: true,
    llmFallback: async () => ({
      intent: 'screen_target_pointer',
      confidence: 0.9,
      reason: 'missing target should be unsafe',
      explicitness: 'explicit',
      requires: ['screen_capture', 'vision', 'move_pointer'],
    }),
  });

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '这个按钮帮我看看',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'unknown');
  assert.deepStrictEqual(decision.requiredCapabilities, []);
}

async function testLlmFallbackInvalidJsonFallsBackToDraft() {
  const { IntentClassifier } = load('core/intent-classifier.js');
  const classifier = new IntentClassifier({
    enableLlmFallback: true,
    llmFallback: async () => '{not json',
  });

  const decision = await classifier.classify({
    source: 'text_chat',
    text: '这个设置帮我看一下',
    userInitiated: true,
  });

  assert.strictEqual(decision.intent, 'unknown');
  assert.strictEqual(decision.usedLlmFallback, true);
  assert.match(decision.reason, /LLM fallback failed/);
}
```

Update `run()`:

```js
  await testLlmFallbackCanClassifyAmbiguousPageRequest();
  await testLlmFallbackMissingTargetDowngradesToUnknown();
  await testLlmFallbackInvalidJsonFallsBackToDraft();
```

- [ ] **Step 2: Run tests**

Run:

```bash
npm test
```

Expected before fixes: the first test may pass; missing target or invalid JSON behavior should reveal any unsafe normalization. If all pass with Task 1 code, continue to Step 4.

- [ ] **Step 3: Tighten fallback confidence if needed**

If low-confidence LLM results are currently accepted, edit `normalizeFallback` in `src/core/intent-classifier.ts` so a fallback result below `lowConfidenceThreshold` becomes `unknown` with no capabilities:

```ts
    if (confidence < this.lowConfidenceThreshold && intent !== 'normal_chat') {
      return decision('unknown', confidence, 'LLM fallback confidence below safe threshold', 'ambiguous', [], true);
    }
```

Place it after `confidence` and `target` are computed, before the final return. Keep the existing missing-target guard.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/intent-router-contract.test.js src/core/intent-classifier.ts
git commit -m "test: cover intent llm fallback validation"
```

---

### Task 4: Thin Intent Executor

**Files:**
- Create: `src/core/intent-executor.ts`
- Modify: `scripts/intent-router-contract.test.js`

**Interfaces:**
- Consumes:
  - `IntentRoutedDecision` from `intent-router.ts`
- Produces:
  - `class IntentExecutor { constructor(handlers: IntentExecutorHandlers); execute(routed: IntentRoutedDecision): Promise<IntentExecutionResult>; }`
  - `interface IntentExecutorHandlers { normalChat?: Handler; screenSummary?: Handler; screenTargetPointer?: Handler; cameraCheckOnce?: Handler; voiceInputHelp?: Handler; settingsDebugHelp?: Handler; proactiveExplain?: Handler; proactiveControl?: Handler; }`
  - `type IntentExecutorHandler = (routed: IntentRoutedDecision) => Promise<IntentExecutionResult> | IntentExecutionResult`

- [ ] **Step 1: Add failing executor tests**

Append these tests before `run()`:

```js
async function testExecutorDispatchesAllowedScreenTarget() {
  const { IntentRouter } = load('core/intent-router.js');
  const { IntentExecutor } = load('core/intent-executor.js');
  const router = new IntentRouter();
  const calls = [];
  const executor = new IntentExecutor({
    screenTargetPointer: async (routed) => {
      calls.push(routed.decision.target);
      return { status: 'handled', message: 'pointed' };
    },
  });

  const routed = await router.route({ source: 'text_chat', text: '指出下载按钮', userInitiated: true });
  const result = await executor.execute(routed);

  assert.strictEqual(result.status, 'handled');
  assert.deepStrictEqual(calls, ['下载按钮']);
}

async function testExecutorSkipsDeniedDecision() {
  const { IntentRouter } = load('core/intent-router.js');
  const { IntentExecutor } = load('core/intent-executor.js');
  const router = new IntentRouter({ cameraEnabled: () => false });
  const executor = new IntentExecutor({
    cameraCheckOnce: async () => ({ status: 'handled', message: 'should not run' }),
  });

  const routed = await router.route({ source: 'text_chat', text: '检测一下摄像头状态', userInitiated: true });
  const result = await executor.execute(routed);

  assert.strictEqual(result.status, 'skipped');
  assert.match(result.message, /denied/);
}

async function testExecutorReportsMissingHandler() {
  const { IntentRouter } = load('core/intent-router.js');
  const { IntentExecutor } = load('core/intent-executor.js');
  const router = new IntentRouter();
  const executor = new IntentExecutor({});

  const routed = await router.route({ source: 'text_chat', text: '帮我看看这个页面', userInitiated: true });
  const result = await executor.execute(routed);

  assert.strictEqual(result.status, 'skipped');
  assert.match(result.message, /No executor handler/);
}
```

Update `run()`:

```js
  await testExecutorDispatchesAllowedScreenTarget();
  await testExecutorSkipsDeniedDecision();
  await testExecutorReportsMissingHandler();
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test
```

Expected: `Cannot find module '../dist/core/intent-executor.js'`.

- [ ] **Step 3: Implement executor**

Create `src/core/intent-executor.ts`:

```ts
import { IntentExecutionResult, IntentKind, IntentRoutedDecision } from './intent-types';

export type IntentExecutorHandler = (routed: IntentRoutedDecision) => Promise<IntentExecutionResult> | IntentExecutionResult;

export interface IntentExecutorHandlers {
  normalChat?: IntentExecutorHandler;
  screenSummary?: IntentExecutorHandler;
  screenTargetPointer?: IntentExecutorHandler;
  cameraCheckOnce?: IntentExecutorHandler;
  voiceInputHelp?: IntentExecutorHandler;
  settingsDebugHelp?: IntentExecutorHandler;
  proactiveExplain?: IntentExecutorHandler;
  proactiveControl?: IntentExecutorHandler;
}

export class IntentExecutor {
  constructor(private readonly handlers: IntentExecutorHandlers) {}

  async execute(routed: IntentRoutedDecision): Promise<IntentExecutionResult> {
    if (routed.permission.status === 'denied') {
      return { status: 'skipped', message: `Intent denied: ${routed.permission.reason}` };
    }
    if (routed.permission.status === 'needs_confirmation') {
      return { status: 'skipped', message: `Intent needs confirmation: ${routed.permission.reason}` };
    }

    const handler = this.getHandler(routed.decision.intent);
    if (!handler) {
      return { status: 'skipped', message: `No executor handler for intent ${routed.decision.intent}` };
    }

    try {
      return await handler(routed);
    } catch (error) {
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private getHandler(intent: IntentKind): IntentExecutorHandler | undefined {
    switch (intent) {
      case 'normal_chat': return this.handlers.normalChat;
      case 'screen_summary': return this.handlers.screenSummary;
      case 'screen_target_pointer': return this.handlers.screenTargetPointer;
      case 'camera_check_once': return this.handlers.cameraCheckOnce;
      case 'voice_input_help': return this.handlers.voiceInputHelp;
      case 'settings_debug_help': return this.handlers.settingsDebugHelp;
      case 'proactive_explain': return this.handlers.proactiveExplain;
      case 'proactive_control': return this.handlers.proactiveControl;
      case 'unknown': return undefined;
      default: return undefined;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/intent-router-contract.test.js src/core/intent-executor.ts
git commit -m "feat: add intent executor dispatcher"
```

---

### Task 5: Main-Process Debug Snapshot Exposure

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/main/debug.html`
- Modify: `scripts/intent-router-contract.test.js` only if an IPC contract helper already exists; otherwise rely on build.

**Interfaces:**
- Consumes:
  - `IntentRouter.getDebugSnapshot(): IntentDebugSnapshot`
- Produces:
  - IPC channel: `intent-router:get-debug-snapshot`
  - Preload API: `window.companion.intentRouter.getDebugSnapshot(): Promise<IntentDebugSnapshot>`

- [ ] **Step 1: Inspect only the small relevant snippets**

Read these targeted sections:

```bash
# Use Read tool, not shell cat:
# src/main/main.ts around existing ipcMain.handle debug/settings/camera handlers
# src/main/preload.ts around window.companion API exposure
# src/main/debug.html around existing card rendering and polling code
```

Expected: identify where to add one IPC handler, one preload method, and one Debug card section. Do not refactor unrelated debug UI.

- [ ] **Step 2: Instantiate router in main process**

In `src/main/main.ts`, add imports:

```ts
import { IntentRouter } from '../core/intent-router';
import { IntentClassifier } from '../core/intent-classifier';
```

Add module-level variable near other managers:

```ts
let intentRouter: IntentRouter;
```

Inside the existing app initialization block, after `cameraAwarenessManager` is created, initialize:

```ts
  intentRouter = new IntentRouter({
    classifier: new IntentClassifier(),
    cameraEnabled: () => Boolean(cameraAwarenessManager?.getConfig()?.enabled),
  });
```

If `getConfig()` returns a Promise in current source, use a synchronous boolean closure backed by a local flag updated in the camera config update handler instead. Do not make `cameraEnabled` async.

- [ ] **Step 3: Add IPC handler**

In the existing `setupIPC()` area of `src/main/main.ts`, add:

```ts
  ipcMain.handle('intent-router:get-debug-snapshot', async () => {
    return intentRouter?.getDebugSnapshot() ?? { recent: [] };
  });
```

- [ ] **Step 4: Expose preload API**

In `src/main/preload.ts`, add a nested API under `window.companion`:

```ts
intentRouter: {
  getDebugSnapshot: () => ipcRenderer.invoke('intent-router:get-debug-snapshot'),
},
```

If `Window` typing is declared in the same file, add:

```ts
intentRouter: {
  getDebugSnapshot: () => Promise<any>;
};
```

Use `any` only in preload typing if existing APIs use `any`; otherwise import `IntentDebugSnapshot` as a type.

- [ ] **Step 5: Add Debug panel card**

In `src/main/debug.html`, add a small card near existing Proactive / Camera / logs cards:

```html
<section class="card">
  <h2>Intent Router</h2>
  <div id="intent-router-debug" class="muted">暂无 intent 决策</div>
</section>
```

Add JS polling/rendering function near existing debug refresh functions:

```js
async function refreshIntentRouterDebug() {
  const el = document.getElementById('intent-router-debug');
  if (!el || !window.companion || !window.companion.intentRouter) return;
  try {
    const snapshot = await window.companion.intentRouter.getDebugSnapshot();
    const recent = Array.isArray(snapshot && snapshot.recent) ? snapshot.recent : [];
    if (recent.length === 0) {
      el.textContent = '暂无 intent 决策';
      return;
    }
    el.innerHTML = recent.slice().reverse().map((item) => `
      <div class="debug-row">
        <strong>${escapeHtml(item.intent || 'unknown')}</strong>
        <span>${escapeHtml(item.source || '')}</span>
        <span>${Math.round((item.confidence || 0) * 100)}%</span>
        <div>${escapeHtml(item.reason || '')}</div>
        <div>permission: ${escapeHtml(item.permissionStatus || '')} — ${escapeHtml(item.permissionReason || '')}</div>
      </div>
    `).join('');
  } catch (error) {
    el.textContent = `Intent Router debug 读取失败：${error && error.message ? error.message : error}`;
  }
}
```

If `escapeHtml` already exists, reuse it. If not, add:

```js
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

Call `refreshIntentRouterDebug()` in the same interval or refresh loop as other debug sections.

- [ ] **Step 6: Build and test**

Run:

```bash
npm test
```

Expected: TypeScript compiles and all contract tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/main.ts src/main/preload.ts src/main/debug.html
git commit -m "feat: expose intent router debug snapshot"
```

---

### Task 6: Minimal Chat/ASR Routing Hook for Screen Intents

**Files:**
- Modify: `src/core/chat-manager.ts`
- Modify: `src/main/main.ts`
- Test: `npm test`

**Interfaces:**
- Consumes:
  - `IntentRouter.route(request)`
  - `IntentExecutor.execute(routed)`
  - Existing `ScreenAnalyzer` and `ScreenTargetPointer` public methods discovered in current source.
- Produces:
  - Natural-language chat/ASR text can route explicit screen summary and target pointer intents.

- [ ] **Step 1: Inspect only current ChatManager screen entry points**

Read targeted portions of `src/core/chat-manager.ts`:

```bash
# Use Read tool around constructor, user-message entry method, existing '.' screen analysis path,
# and setScreenTargetPointer method. Do not read entire file unless these snippets are insufficient.
```

Expected: identify the method that receives user text and the existing method/path for screen analysis and target pointer. Keep old paths intact.

- [ ] **Step 2: Add optional router/executor dependencies**

In `src/core/chat-manager.ts`, import types/classes:

```ts
import { IntentRouter } from './intent-router';
import { IntentExecutor } from './intent-executor';
import { IntentRequest } from './intent-types';
```

Add private optional fields:

```ts
private intentRouter?: IntentRouter;
private intentExecutor?: IntentExecutor;
```

Add setter:

```ts
setIntentRouter(intentRouter: IntentRouter, intentExecutor: IntentExecutor): void {
  this.intentRouter = intentRouter;
  this.intentExecutor = intentExecutor;
}
```

- [ ] **Step 3: Add routing guard method**

Add a private method to `ChatManager`:

```ts
private async tryHandleIntent(text: string, source: 'text_chat' | 'voice_asr'): Promise<boolean> {
  if (!this.intentRouter || !this.intentExecutor) return false;
  const request: IntentRequest = { source, text, userInitiated: true };
  const routed = await this.intentRouter.route(request);
  if (routed.decision.intent === 'normal_chat' || routed.decision.intent === 'unknown') return false;
  const result = await this.intentExecutor.execute(routed);
  this.intentRouter.recordExecution(result);
  return result.status === 'handled';
}
```

If current ChatManager has no way to distinguish ASR from typed text, pass `'text_chat'` for the first integration and leave ASR-specific source for a later caller update. Do not invent broad renderer changes in this task.

- [ ] **Step 4: Call routing guard before normal LLM chat**

At the beginning of the method that handles user text, after empty-string validation and before building normal LLM messages, add:

```ts
    if (await this.tryHandleIntent(message, 'text_chat')) {
      return;
    }
```

Use the current parameter name instead of `message` if different.

- [ ] **Step 5: Wire executor handlers in main process**

In `src/main/main.ts`, import:

```ts
import { IntentExecutor } from '../core/intent-executor';
```

Add module-level variable:

```ts
let intentExecutor: IntentExecutor;
```

After `screenAnalyzer`, `screenTargetPointer`, and `cameraAwarenessManager` are initialized, create:

```ts
  intentExecutor = new IntentExecutor({
    screenSummary: async (routed) => {
      const prompt = routed.request.text || '请总结当前屏幕';
      const result = await screenAnalyzer.analyze(prompt);
      return { status: 'handled', message: typeof result === 'string' ? result : JSON.stringify(result) };
    },
    screenTargetPointer: async (routed) => {
      const target = routed.decision.target || routed.request.text || '';
      const handled = await screenTargetPointer.handleRequest(target);
      return { status: handled ? 'handled' : 'skipped', message: handled ? 'target pointer handled' : 'target pointer did not find a target' };
    },
    cameraCheckOnce: async () => ({
      status: 'skipped',
      message: '摄像头一次性检测需要设置页提供当前帧；第一版对话入口只完成权限路由，不自动打开摄像头。',
    }),
    voiceInputHelp: async () => ({ status: 'handled', message: '请检查语音输入是否启用、API Key/Base URL/模型是否已配置，并查看 Debug 日志中的 voice-input 状态。' }),
    proactiveExplain: async () => ({ status: 'handled', message: '可以在 Debug 面板查看最近主动回应和 Intent Router 决策。' }),
    proactiveControl: async () => ({ status: 'skipped', message: '主动提醒开关需要二次确认后写入配置，本轮不静默修改。' }),
  });
```

Then after `chatManager` is constructed and `screenTargetPointer` is set, call:

```ts
  chatManager.setIntentRouter(intentRouter, intentExecutor);
```

Important: adjust `screenAnalyzer.analyze(...)` and `screenTargetPointer.handleRequest(...)` to the exact public method names found in Step 1. If ScreenTargetPointer exposes a different method, use that method and keep the same handler result shape.

- [ ] **Step 6: Build to catch API mismatch**

Run:

```bash
npm run build
```

Expected: TypeScript errors reveal exact method-name mismatches if Step 5 used the wrong public method.

- [ ] **Step 7: Fix only method-name/type mismatches**

If build reports `Property 'handleRequest' does not exist`, inspect the small public method area of `src/core/screen-target-pointer.ts` and replace the handler call with the existing method. Do not refactor ScreenTargetPointer internals.

- [ ] **Step 8: Run full tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/core/chat-manager.ts src/main/main.ts
git commit -m "feat: route explicit screen intents from chat"
```

---

### Task 7: Documentation Update

**Files:**
- Create: `docs/intent-router.md`
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`

**Interfaces:**
- Consumes: implementation from Tasks 1-6.
- Produces: documented module boundary, privacy policy and maintainer index.

- [ ] **Step 1: Create maintainer doc**

Create `docs/intent-router.md`:

```md
# Intent Router

Intent Router is Project-Ze's first multimodal intent boundary. It normalizes typed chat, ASR text, explicit screen requests, camera-awareness events, proactive context events, and debug-panel actions into a structured intent decision.

## First-version boundary

The first version is rule-first and privacy-gated:

- Normal chat remains normal chat.
- Explicit natural-language requests such as “帮我看看这个页面” can route to screen summary.
- Explicit target requests such as “指出下载按钮” can route to screen target pointer.
- Camera checks are one-shot only and require explicit user intent plus camera-awareness configuration.
- LLM fallback may suggest an intent, but local permission policy decides whether sensitive capabilities can run.

## Files

- `src/core/intent-types.ts`: shared request, decision, permission, execution and debug types.
- `src/core/intent-classifier.ts`: rule-first classifier and validated LLM fallback adapter.
- `src/core/intent-router.ts`: permission gate and recent decision debug buffer.
- `src/core/intent-executor.ts`: thin handler-based dispatcher into existing modules.

## Privacy policy

Sensitive capabilities include screen capture, vision, camera frame access, pointer movement and config writes. These require explicit user intent when invoked from normal chat or ASR. Proactive context events cannot trigger screen capture, pointer movement or config writes.

The router does not save camera images or videos and does not perform identity recognition, sensitive-attribute inference, medical judgment or psychological diagnosis.

## Debugging

`IntentRouter.getDebugSnapshot()` returns the recent decision ring buffer. The Debug panel reads it through `intent-router:get-debug-snapshot` and displays source, intent, confidence, reason, capabilities, permission status and executor result.
```

- [ ] **Step 2: Update PROJECT_INDEX**

Add to the `core 模块速查` section in `PROJECT_INDEX.md`:

```md
- `intent-types.ts`：多模态意图入口的稳定类型边界，定义输入来源、intent、能力需求、权限结果、执行结果和 Debug 记录。
- `intent-classifier.ts`：规则优先的意图分类器，覆盖普通聊天、屏幕总结、目标指示、摄像头一次性检测、语音/设置/主动回应帮助，并为 LLM fallback 提供结构化校验边界。
- `intent-router.ts`：Intent Router 主入口，应用屏幕/摄像头/移动/配置写入等隐私权限策略，并维护最近 intent 决策快照。
- `intent-executor.ts`：薄分发层，根据已授权 intent 调用现有 ChatManager、ScreenAnalyzer、ScreenTargetPointer、CameraAwarenessManager 或诊断 helper。
```

Add one sentence near the active-response / AI system architecture section:

```md
- **Intent Router（Unreleased）**：普通聊天和 ASR 文本可在明确请求时路由到屏幕总结或目标指示；LLM fallback 只建议结构化意图，最终是否允许截图、摄像头、移动或写配置由本地权限策略决定。
```

- [ ] **Step 3: Update VERSION**

Add under `## Unreleased` in `VERSION.md`:

```md
- Intent Router：新增多模态任务入口统一化边界，支持规则优先的意图分类、LLM fallback 校验接口、屏幕/摄像头/移动/配置写入权限闸门、最近 intent 决策 Debug 快照和薄执行分发层
```

- [ ] **Step 4: Run docs whitespace check and tests**

Run:

```bash
git diff --check
npm test
```

Expected: no whitespace errors; tests pass.

- [ ] **Step 5: Commit**

```bash
git add docs/intent-router.md PROJECT_INDEX.md VERSION.md
git commit -m "docs: document intent router boundary"
```

---

### Task 8: Final Verification and Cleanup

**Files:**
- No source changes expected unless verification reveals a defect.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: clean working tree except user-owned unrelated changes.

- [ ] **Step 1: Run full validation**

Run:

```bash
npm test
git diff --check
git status --short
```

Expected:

- `npm test` passes.
- `git diff --check` has no output.
- `git status --short` is clean except pre-existing user changes such as `M start.bat` if still present.

- [ ] **Step 2: If tests fail, fix only the failing task area**

Use the failing test name to identify the task that introduced it:

- Intent classifier/router/executor contract failure -> Tasks 1-4 files only.
- Build failure in main/preload/debug -> Task 5 or Task 6 files only.
- Documentation whitespace -> Task 7 files only.

After the fix, rerun:

```bash
npm test
git diff --check
```

Expected: PASS and no whitespace output.

- [ ] **Step 3: Final summary**

Report to the user:

```md
完成：Intent Router 第一版已实现并验证。

验证：
- `npm test` 通过
- `git diff --check` 通过

主要变化：
- 新增 intent types/classifier/router/executor
- 普通聊天明确请求可路由到屏幕总结/目标指示
- 高隐私能力受本地权限策略约束
- Debug 面板可查看最近 intent 决策
- 文档已更新
```

Do not claim camera continuous analysis or broad LLM autonomy was implemented.
