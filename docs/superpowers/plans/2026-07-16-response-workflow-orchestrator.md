# Response Workflow Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a response workflow layer so screen summary and screen target pointer results are passed to the chat model and shown through the normal chat bubble path without breaking existing screen, TTS, bubble, or intent modules.

**Architecture:** Add a small `ResponseWorkflowOrchestrator` and focused workflow types under `src/core/`. The orchestrator runs only already-authorized screen workflows, converts tool results into short-lived `WorkflowResponseContext`, and delegates final user-visible wording to `ChatManager.respondFromWorkflow(...)`. Existing modules keep their responsibilities: `IntentRouter` gates access, `ScreenAnalyzer` captures/analyzes, `ScreenTargetPointer` locates/moves/points, and `BubbleOrchestrator` only delivers bubbles.

**Tech Stack:** Electron + TypeScript CommonJS, Node `assert` contract tests in `scripts/`, existing `npm run build` and `npm test` verification.

## Global Constraints

- 优先通过项目文档理解现状，只在任务需要时读取少量相关源码。
- 屏幕总结和屏幕目标指向的最终用户回复必须统一经过聊天模型生成。
- LLM 不能直接决定截图、移动或绕过 Intent Router 权限闸门。
- 指向动作仍由 `ScreenTargetPointer` / `MoveController` 本地执行。
- 原始屏幕截图、原始 Vision 大段文本和结构化 observation 不默认进入长期记忆。
- 用户可见最终回复可以进入聊天历史。
- `BubbleOrchestrator` 只负责投递，不负责 LLM 内容生成。
- 保留旧屏幕输出兜底，避免新 workflow 失败时用户完全无反馈。
- 每个任务完成后运行相应验证并提交 git。
- 完成实现后更新项目文档并提交 git。

---

## File Structure

Create:

- `src/core/response-workflow-types.ts` — stable workflow request/context/result interfaces and small conversion helpers.
- `src/core/response-workflow-orchestrator.ts` — pure orchestration class that calls injected screen tools and injected chat responder.
- `scripts/response-workflow-contract.test.js` — Node contract tests covering privacy defaults, orchestration, chat responder delegation, and fallback behavior.
- `docs/response-workflow-orchestrator.md` — maintainer-facing architecture note for the new workflow boundary.

Modify:

- `src/core/chat-manager.ts` — add `respondFromWorkflow(context)`, extract shared assistant rendering/persistence helper, and route `.` screen requests through workflow when configured.
- `src/core/screen-target-pointer.ts` — add an option to suppress final result bubbles during workflow output while preserving progress/cancel bubbles.
- `src/core/intent-executor.ts` — no required type change; it already supports injected handlers and `IntentExecutionResult.debug`.
- `src/main/main.ts` — instantiate `ResponseWorkflowOrchestrator`, inject it into `ChatManager`, and route IntentExecutor screen handlers through it.
- `package.json` — add `scripts/response-workflow-contract.test.js` to `npm test`.
- `PROJECT_INDEX.md` — document the new workflow module and updated screen output route.
- `VERSION.md` — add an Unreleased note for response workflow orchestration.

---

### Task 1: Workflow Types and Pure Orchestrator

**Files:**
- Create: `src/core/response-workflow-types.ts`
- Create: `src/core/response-workflow-orchestrator.ts`
- Create: `scripts/response-workflow-contract.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes:
  - `ScreenAnalyzer.analyze(userMessage: string): Promise<string>`
  - `ScreenTargetPointer.handle(message: string, options?: { suppressResultBubble?: boolean }): Promise<ScreenTargetPointerResult>` after Task 2 adds the optional second parameter.
  - `ChatManager.respondFromWorkflow(context: WorkflowResponseContext): Promise<WorkflowChatResponseResult>` after Task 3 adds it.
- Produces:
  - `ResponseWorkflowKind`
  - `WorkflowObservation`
  - `WorkflowActionResult`
  - `WorkflowResponseContext`
  - `WorkflowExecutionResult`
  - `ResponseWorkflowRequest`
  - `ResponseWorkflowOrchestrator.run(request: ResponseWorkflowRequest): Promise<WorkflowExecutionResult>`

- [ ] **Step 1: Write failing response workflow contract tests**

Create `scripts/response-workflow-contract.test.js`:

```js
const assert = require('assert');

function load(modulePath) {
  return require(`../dist/${modulePath}`);
}

async function testScreenSummaryDelegatesFinalReplyToChatResponder() {
  const { ResponseWorkflowOrchestrator } = load('core/response-workflow-orchestrator.js');
  const calls = [];
  const orchestrator = new ResponseWorkflowOrchestrator({
    screenAnalyzer: {
      analyze: async (message) => {
        calls.push(['analyze', message]);
        return '当前页面是一个软件下载页，右上角有下载入口。';
      },
    },
    screenTargetPointer: {
      handle: async () => {
        throw new Error('pointer should not run for screen summary');
      },
    },
    chatResponder: {
      respondFromWorkflow: async (context) => {
        calls.push(['respondFromWorkflow', context]);
        return {
          fullResponse: '<item>我看到了，这是一个软件下载页面。</item>',
          visibleReplyProduced: true,
        };
      },
    },
  });

  const result = await orchestrator.run({
    workflow: 'screen_summary_response',
    source: 'screen_dot',
    userText: '.看看这个页面',
    toolText: '看看这个页面',
  });

  assert.strictEqual(result.status, 'handled');
  assert.strictEqual(result.visibleReplyProduced, true);
  assert.deepStrictEqual(calls[0], ['analyze', '看看这个页面']);
  assert.strictEqual(calls[1][0], 'respondFromWorkflow');
  assert.strictEqual(calls[1][1].privacy.persistRawObservations, false);
  assert.strictEqual(calls[1][1].privacy.allowVisibleReplyInHistory, true);
  assert.strictEqual(calls[1][1].observations[0].kind, 'screen_summary');
  assert.strictEqual(calls[1][1].observations[0].summary, '当前页面是一个软件下载页，右上角有下载入口。');
}

async function testScreenTargetPointerSuppressesDirectResultBubbleAndDelegatesToChat() {
  const { ResponseWorkflowOrchestrator } = load('core/response-workflow-orchestrator.js');
  const calls = [];
  const orchestrator = new ResponseWorkflowOrchestrator({
    screenAnalyzer: {
      analyze: async () => {
        throw new Error('summary should not run for pointer');
      },
    },
    screenTargetPointer: {
      handle: async (message, options) => {
        calls.push(['handle', message, options]);
        return {
          handled: true,
          moved: true,
          message: '这里是「下载按钮」。',
          locateResult: {
            found: true,
            label: '下载按钮',
            confidence: 0.88,
            point: { x: 100, y: 80 },
            reason: '目标在右上角。',
          },
        };
      },
    },
    chatResponder: {
      respondFromWorkflow: async (context) => {
        calls.push(['respondFromWorkflow', context]);
        return {
          fullResponse: '<item>我找到下载按钮啦，已经过去指给你看了。</item>',
          visibleReplyProduced: true,
        };
      },
    },
  });

  const result = await orchestrator.run({
    workflow: 'screen_target_pointer_response',
    source: 'screen_dot',
    userText: '.指出下载按钮',
    toolText: '指出下载按钮',
  });

  assert.strictEqual(result.status, 'handled');
  assert.strictEqual(result.visibleReplyProduced, true);
  assert.deepStrictEqual(calls[0], ['handle', '指出下载按钮', { suppressResultBubble: true }]);
  assert.strictEqual(calls[1][0], 'respondFromWorkflow');
  assert.strictEqual(calls[1][1].observations[0].kind, 'screen_target_pointer');
  assert.strictEqual(calls[1][1].observations[0].target, '下载按钮');
  assert.strictEqual(calls[1][1].actionResults[0].action, 'point_target');
  assert.strictEqual(calls[1][1].actionResults[0].status, 'completed');
}

async function testPointerCancellationBecomesCancelledActionResult() {
  const { ResponseWorkflowOrchestrator } = load('core/response-workflow-orchestrator.js');
  let workflowContext;
  const orchestrator = new ResponseWorkflowOrchestrator({
    screenAnalyzer: { analyze: async () => '' },
    screenTargetPointer: {
      handle: async () => ({
        handled: true,
        moved: false,
        message: '屏幕变了，我刚才看到的位置可能不准啦。',
        cancelReason: 'screen-changed',
      }),
    },
    chatResponder: {
      respondFromWorkflow: async (context) => {
        workflowContext = context;
        return {
          fullResponse: '<item>刚才屏幕变了，我怕指错，所以没有移动。</item>',
          visibleReplyProduced: true,
        };
      },
    },
  });

  const result = await orchestrator.run({
    workflow: 'screen_target_pointer_response',
    source: 'screen_dot',
    userText: '.指出搜索框',
    toolText: '指出搜索框',
  });

  assert.strictEqual(result.status, 'handled');
  assert.strictEqual(workflowContext.actionResults[0].status, 'cancelled');
  assert.strictEqual(workflowContext.actionResults[0].debugReason, 'screen-changed');
}

async function testChatResponderFailureReturnsFallbackResult() {
  const { ResponseWorkflowOrchestrator } = load('core/response-workflow-orchestrator.js');
  const orchestrator = new ResponseWorkflowOrchestrator({
    screenAnalyzer: { analyze: async () => '屏幕分析文本。' },
    screenTargetPointer: { handle: async () => ({ handled: false, moved: false, message: '' }) },
    chatResponder: {
      respondFromWorkflow: async () => {
        throw new Error('chat unavailable');
      },
    },
  });

  const result = await orchestrator.run({
    workflow: 'screen_summary_response',
    source: 'screen_dot',
    userText: '.看看屏幕',
    toolText: '看看屏幕',
  });

  assert.strictEqual(result.status, 'fallback');
  assert.strictEqual(result.visibleReplyProduced, false);
  assert.match(result.error, /chat unavailable/);
  assert.match(result.fallbackMessage, /屏幕结果已生成/);
}

async function run() {
  await testScreenSummaryDelegatesFinalReplyToChatResponder();
  await testScreenTargetPointerSuppressesDirectResultBubbleAndDelegatesToChat();
  await testPointerCancellationBecomesCancelledActionResult();
  await testChatResponderFailureReturnsFallbackResult();
  console.log('response-workflow contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Add contract test to package script**

Modify `package.json` so the `test` script becomes one line:

```json
"test": "npm run build && node scripts/voice-input-contract.test.js && node scripts/screen-fingerprint-contract.test.js && node scripts/screen-capture-frame-contract.test.js && node scripts/screen-pointer-debug-contract.test.js && node scripts/screen-vision-request-contract.test.js && node scripts/point-visual-guard-contract.test.js && node scripts/intent-router-contract.test.js && node scripts/response-workflow-contract.test.js"
```

- [ ] **Step 3: Run the new test and verify it fails for the right reason**

Run:

```bash
npm test
```

Expected: build or response workflow test fails because `dist/core/response-workflow-orchestrator.js` does not exist yet.

- [ ] **Step 4: Create workflow types**

Create `src/core/response-workflow-types.ts`:

```ts
import { IntentSource } from './intent-types';
import { ScreenTargetPointerResult } from './screen-target-pointer';

export type ResponseWorkflowKind = 'screen_summary_response' | 'screen_target_pointer_response';
export type WorkflowObservationKind = 'screen_summary' | 'screen_target_pointer';
export type WorkflowAction = 'none' | 'point_target';
export type WorkflowActionStatus = 'completed' | 'skipped' | 'failed' | 'cancelled';
export type WorkflowExecutionStatus = 'handled' | 'failed' | 'fallback';
export type WorkflowSource = Extract<IntentSource, 'screen_dot' | 'text_chat' | 'voice_asr'>;

export interface WorkflowObservation {
  kind: WorkflowObservationKind;
  source: WorkflowSource;
  userText: string;
  summary?: string;
  target?: string;
  found?: boolean;
  confidence?: number;
  reason?: string;
  warnings?: string[];
}

export interface WorkflowActionResult {
  action: WorkflowAction;
  status: WorkflowActionStatus;
  messageForModel: string;
  debugReason?: string;
}

export interface WorkflowResponseContext {
  workflow: ResponseWorkflowKind;
  userText: string;
  observations: WorkflowObservation[];
  actionResults: WorkflowActionResult[];
  privacy: {
    persistRawObservations: false;
    allowVisibleReplyInHistory: true;
  };
}

export interface WorkflowChatResponseResult {
  fullResponse: string;
  visibleReplyProduced: boolean;
}

export interface WorkflowExecutionResult {
  workflow: ResponseWorkflowKind;
  status: WorkflowExecutionStatus;
  visibleReplyProduced: boolean;
  debugSummary: string;
  error?: string;
  fallbackMessage?: string;
}

export interface ResponseWorkflowRequest {
  workflow: ResponseWorkflowKind;
  source: WorkflowSource;
  userText: string;
  toolText: string;
}

export interface ScreenSummaryTool {
  analyze(userMessage: string): Promise<string>;
}

export interface ScreenTargetPointerTool {
  handle(message: string, options?: { suppressResultBubble?: boolean }): Promise<ScreenTargetPointerResult>;
}

export interface WorkflowChatResponder {
  respondFromWorkflow(context: WorkflowResponseContext): Promise<WorkflowChatResponseResult>;
}

export function createWorkflowPrivacy(): WorkflowResponseContext['privacy'] {
  return {
    persistRawObservations: false,
    allowVisibleReplyInHistory: true,
  };
}

export function actionStatusFromPointerResult(result: ScreenTargetPointerResult): WorkflowActionStatus {
  if (result.cancelReason) return 'cancelled';
  if (!result.handled) return 'skipped';
  if (result.moved) return 'completed';
  if (result.locateResult && !result.moved) return 'skipped';
  return result.message ? 'failed' : 'skipped';
}
```

- [ ] **Step 5: Create pure orchestrator**

Create `src/core/response-workflow-orchestrator.ts`:

```ts
import {
  ResponseWorkflowRequest,
  ScreenSummaryTool,
  ScreenTargetPointerTool,
  WorkflowActionResult,
  WorkflowChatResponder,
  WorkflowExecutionResult,
  WorkflowObservation,
  WorkflowResponseContext,
  actionStatusFromPointerResult,
  createWorkflowPrivacy,
} from './response-workflow-types';

export interface ResponseWorkflowOrchestratorOptions {
  screenAnalyzer: ScreenSummaryTool;
  screenTargetPointer: ScreenTargetPointerTool;
  chatResponder: WorkflowChatResponder;
}

export class ResponseWorkflowOrchestrator {
  private readonly screenAnalyzer: ScreenSummaryTool;
  private readonly screenTargetPointer: ScreenTargetPointerTool;
  private readonly chatResponder: WorkflowChatResponder;

  constructor(options: ResponseWorkflowOrchestratorOptions) {
    this.screenAnalyzer = options.screenAnalyzer;
    this.screenTargetPointer = options.screenTargetPointer;
    this.chatResponder = options.chatResponder;
  }

  async run(request: ResponseWorkflowRequest): Promise<WorkflowExecutionResult> {
    try {
      const context = request.workflow === 'screen_summary_response'
        ? await this.buildScreenSummaryContext(request)
        : await this.buildScreenTargetPointerContext(request);

      try {
        const chatResult = await this.chatResponder.respondFromWorkflow(context);
        return {
          workflow: request.workflow,
          status: 'handled',
          visibleReplyProduced: chatResult.visibleReplyProduced,
          debugSummary: this.summarizeContext(context),
        };
      } catch (error: any) {
        return {
          workflow: request.workflow,
          status: 'fallback',
          visibleReplyProduced: false,
          debugSummary: this.summarizeContext(context),
          error: error?.message || String(error),
          fallbackMessage: this.fallbackMessageForContext(context),
        };
      }
    } catch (error: any) {
      return {
        workflow: request.workflow,
        status: 'failed',
        visibleReplyProduced: false,
        debugSummary: `${request.workflow} failed before chat response`,
        error: error?.message || String(error),
        fallbackMessage: '屏幕工作流执行失败了，你可以稍后再试一次。',
      };
    }
  }

  private async buildScreenSummaryContext(request: ResponseWorkflowRequest): Promise<WorkflowResponseContext> {
    const summary = await this.screenAnalyzer.analyze(request.toolText);
    const observation: WorkflowObservation = {
      kind: 'screen_summary',
      source: request.source,
      userText: request.userText,
      summary,
    };
    const action: WorkflowActionResult = {
      action: 'none',
      status: 'completed',
      messageForModel: '本地屏幕分析已经完成，请基于 summary 回复用户。',
    };
    return {
      workflow: request.workflow,
      userText: request.userText,
      observations: [observation],
      actionResults: [action],
      privacy: createWorkflowPrivacy(),
    };
  }

  private async buildScreenTargetPointerContext(request: ResponseWorkflowRequest): Promise<WorkflowResponseContext> {
    const pointerResult = await this.screenTargetPointer.handle(request.toolText, { suppressResultBubble: true });
    const locate = pointerResult.locateResult;
    const observation: WorkflowObservation = {
      kind: 'screen_target_pointer',
      source: request.source,
      userText: request.userText,
      target: locate?.label || request.toolText,
      found: locate?.found,
      confidence: locate?.confidence,
      reason: locate?.reason || pointerResult.message,
      warnings: pointerResult.cancelReason ? [pointerResult.cancelReason] : undefined,
    };
    const status = actionStatusFromPointerResult(pointerResult);
    const action: WorkflowActionResult = {
      action: 'point_target',
      status,
      messageForModel: this.pointerMessageForModel(pointerResult.moved, status, pointerResult.message),
      debugReason: pointerResult.cancelReason,
    };
    return {
      workflow: request.workflow,
      userText: request.userText,
      observations: [observation],
      actionResults: [action],
      privacy: createWorkflowPrivacy(),
    };
  }

  private pointerMessageForModel(moved: boolean, status: string, message: string): string {
    if (moved) return '已经移动到目标附近并切换 point visual 指向目标。';
    if (status === 'cancelled') return '目标指向流程已取消，没有移动。请按取消原因向用户简短解释。';
    if (status === 'skipped') return '没有执行移动。请说明目标未找到、不够明确或不适合指向。';
    return message || '目标指向流程失败，没有移动。';
  }

  private fallbackMessageForContext(context: WorkflowResponseContext): string {
    if (context.workflow === 'screen_summary_response') {
      return '屏幕结果已生成，但我刚才组织语言失败了。你可以再问我一次这个页面。';
    }
    return '我已经处理了屏幕指向请求，但刚才组织语言失败了。你可以再让我指一次。';
  }

  private summarizeContext(context: WorkflowResponseContext): string {
    const action = context.actionResults[0];
    const observation = context.observations[0];
    return `${context.workflow}:${observation.kind}:${action.status}`;
  }
}
```

- [ ] **Step 6: Run contract test and verify build failure points to the optional pointer parameter**

Run:

```bash
npm test
```

Expected: TypeScript build fails because `ScreenTargetPointer.handle` does not yet accept the optional `{ suppressResultBubble?: boolean }` parameter.

- [ ] **Step 7: Commit Task 1**

After the expected failure is observed and files are staged, commit the scaffolding and failing test if following strict TDD branch practice:

```bash
git add package.json scripts/response-workflow-contract.test.js src/core/response-workflow-types.ts src/core/response-workflow-orchestrator.ts
git commit -m "test: add response workflow contracts"
```

If the team prefers only green commits, defer this commit until Task 2 Step 5 when tests pass.

---

### Task 2: Suppress Direct Final Screen Pointer Bubbles for Workflow Runs

**Files:**
- Modify: `src/core/screen-target-pointer.ts`
- Test: `scripts/response-workflow-contract.test.js`

**Interfaces:**
- Consumes:
  - `ScreenTargetPointerResult`
- Produces:
  - `interface ScreenTargetPointerHandleOptions { suppressResultBubble?: boolean }`
  - `ScreenTargetPointer.handle(message: string, options?: ScreenTargetPointerHandleOptions): Promise<ScreenTargetPointerResult>`

- [ ] **Step 1: Add handle options interface**

In `src/core/screen-target-pointer.ts`, after `ScreenTargetPointerResult`, add:

```ts
export interface ScreenTargetPointerHandleOptions {
  suppressResultBubble?: boolean;
}
```

- [ ] **Step 2: Change handle signature and local helper**

Change:

```ts
async handle(message: string): Promise<ScreenTargetPointerResult> {
```

to:

```ts
async handle(message: string, options: ScreenTargetPointerHandleOptions = {}): Promise<ScreenTargetPointerResult> {
```

Inside `handle`, after `const id = this.startSession();`, add:

```ts
const showResultBubble = (text: string): void => {
  if (!options.suppressResultBubble) {
    this.showBubble(text);
  }
};
```

- [ ] **Step 3: Suppress only final result bubbles**

In `handle`, keep the progress bubble unchanged:

```ts
this.showBubble('我看看哦，先别动屏幕~');
```

Replace these final result bubble calls inside `handle`:

```ts
this.showBubble(failureMessage);
```

with:

```ts
showResultBubble(failureMessage);
```

Replace:

```ts
this.showBubble(messageText);
```

in the `moveResult.cancelled` branch with:

```ts
showResultBubble(messageText);
```

Replace:

```ts
this.showBubble(successMessage);
```

with:

```ts
showResultBubble(successMessage);
```

Replace the catch branch final bubble:

```ts
this.showBubble(messageText);
```

with:

```ts
showResultBubble(messageText);
```

Do not change `cancel(reason)` behavior in this task. Drag-start/manual cancellation outside workflow should still show its existing short feedback.

- [ ] **Step 4: Run response workflow contract test**

Run:

```bash
npm test
```

Expected: `response-workflow contract tests passed`, or the next failure points to missing ChatManager workflow integration that is covered in Task 3.

- [ ] **Step 5: Commit Task 1 and Task 2 if not already committed**

Use one green commit if Task 1 was not committed separately:

```bash
git add package.json scripts/response-workflow-contract.test.js src/core/response-workflow-types.ts src/core/response-workflow-orchestrator.ts src/core/screen-target-pointer.ts
git commit -m "feat: add response workflow orchestrator"
```

If Task 1 was already committed, use:

```bash
git add src/core/screen-target-pointer.ts
git commit -m "refactor: allow workflow-controlled pointer replies"
```

---

### Task 3: ChatManager Workflow Response Entry

**Files:**
- Modify: `src/core/chat-manager.ts`
- Test: `npm test`

**Interfaces:**
- Consumes:
  - `WorkflowResponseContext`
  - `WorkflowChatResponseResult`
- Produces:
  - `ChatManager.respondFromWorkflow(context: WorkflowResponseContext): Promise<WorkflowChatResponseResult>`
  - `ChatManager.setResponseWorkflowOrchestrator(orchestrator: ResponseWorkflowOrchestrator): void` in Task 4

- [ ] **Step 1: Add imports**

In `src/core/chat-manager.ts`, add imports near the other core imports:

```ts
import { WorkflowChatResponseResult, WorkflowResponseContext } from './response-workflow-types';
import { ResponseWorkflowOrchestrator } from './response-workflow-orchestrator';
```

- [ ] **Step 2: Add workflow orchestrator field**

Inside `ChatManager`, after `private intentExecutor?: IntentExecutor;`, add:

```ts
private responseWorkflowOrchestrator?: ResponseWorkflowOrchestrator;
```

- [ ] **Step 3: Extract shared assistant response delivery helper**

Add this private method before `summarizeAsync()`:

```ts
private async deliverAssistantResponse(fullResponse: string, interactionType: string, interactionText: string): Promise<void> {
  const parsedItems = this.parseResponse(fullResponse);
  const rawTexts = parsedItems.length > 0 ? parsedItems : [fullResponse || ''];
  const texts: string[] = [];
  for (const t of rawTexts) {
    if (t.length > 30) {
      const parts = this.splitText(t, 30);
      texts.push(...parts);
    } else {
      texts.push(t);
    }
  }

  this.memory.addMessage('assistant', fullResponse);
  this.memory.recordInteraction(interactionType, interactionText, this.stateManager.getCurrentState());

  const ttsEnabled = this.ttsManager?.isEnabled() ?? false;
  if (ttsEnabled && this.ttsManager) {
    const ttsTexts = texts.map(t => t.slice(0, 200));
    this.sendChatStatus('speaking', '播放回复中...');
    const played = await this.ttsManager.speakAll(ttsTexts);
    if (!played) {
      await this.showTextSequence(texts);
    }
  } else {
    await this.showTextSequence(texts);
  }
}
```

- [ ] **Step 4: Replace duplicate normal chat delivery block**

In `sendMessage`, replace the block from:

```ts
// 解析响应并拆分长文本
const parsedItems = this.parseResponse(fullResponse);
```

through:

```ts
} else {
  await this.showTextSequence(texts);
}
```

with:

```ts
await this.deliverAssistantResponse(fullResponse, 'chat', userMessage);
this.memory.changeAffection(0.3);
this.memory.changeFamiliarity(0.1);
```

Remove the now-duplicated old `recordInteraction('chat', ...)`, TTS, and showTextSequence lines from that replaced section.

- [ ] **Step 5: Add workflow prompt builder and responder**

Add these methods before `tryHandleIntent(...)`:

```ts
async respondFromWorkflow(context: WorkflowResponseContext): Promise<WorkflowChatResponseResult> {
  if (!this.configManager.isValid()) {
    throw new Error('AI 未配置');
  }

  const config = this.configManager.get();
  const systemPrompt = this.memory.buildSystemPrompt(
    config.systemPrompt,
    RESPONSE_FORMAT_PROMPT,
    this.buildWorkflowStatusPrompt(context)
  );
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...this.memory.getRecentMessages(Math.max(0, config.historyMaxLength - 1)),
    { role: 'user', content: this.buildWorkflowUserPrompt(context) },
  ];

  const fullResponse = await this.aiService.chatStream(messages, (_chunk, _total) => {});
  if (context.privacy.allowVisibleReplyInHistory) {
    this.memory.addMessage('user', context.userText);
  }
  await this.deliverAssistantResponse(fullResponse, `workflow-${context.workflow.replace(/_/g, '-')}`, context.userText);

  if (this.memory.shouldSummarize()) {
    this.summarizeAsync();
  }

  return {
    fullResponse,
    visibleReplyProduced: true,
  };
}

private buildWorkflowStatusPrompt(context: WorkflowResponseContext): string {
  const currentState = this.stateManager.getCurrentState();
  const observationLines = context.observations.map((observation, index) => {
    const parts = [
      `观察${index + 1}: ${observation.kind}`,
      observation.target ? `目标=${observation.target}` : '',
      typeof observation.found === 'boolean' ? `found=${observation.found}` : '',
      typeof observation.confidence === 'number' ? `confidence=${observation.confidence.toFixed(2)}` : '',
      observation.reason ? `原因=${observation.reason}` : '',
      observation.summary ? `摘要=${observation.summary.slice(0, 500)}` : '',
      observation.warnings?.length ? `警告=${observation.warnings.join(',')}` : '',
    ].filter(Boolean);
    return parts.join('；');
  });
  const actionLines = context.actionResults.map((action, index) => (
    `动作${index + 1}: ${action.action} / ${action.status}；${action.messageForModel}${action.debugReason ? `；原因=${action.debugReason}` : ''}`
  ));

  return [
    `当前状态：${currentState}`,
    '这是一个屏幕工作流回复。下面的工具结果只用于本轮回复，不要声称执行未发生的动作。',
    '如果动作已 completed，可以自然说明已经指给用户看。',
    '如果动作 skipped、failed 或 cancelled，简短说明原因，并建议用户重新描述或重试。',
    '不要输出内部 JSON，不要主动暴露置信度数字，除非用户明确询问。',
    ...observationLines,
    ...actionLines,
  ].join('\n');
}

private buildWorkflowUserPrompt(context: WorkflowResponseContext): string {
  return [
    `用户原始请求：${context.userText}`,
    '请基于上面的屏幕工作流结果回复用户。',
  ].join('\n');
}
```

- [ ] **Step 6: Add orchestrator setter**

Near `setIntentRouter(...)`, add:

```ts
setResponseWorkflowOrchestrator(orchestrator: ResponseWorkflowOrchestrator): void {
  this.responseWorkflowOrchestrator = orchestrator;
}
```

- [ ] **Step 7: Run build and tests**

Run:

```bash
npm test
```

Expected: TypeScript build passes and all contract tests pass, except direct screen routes are not yet wired through workflow in runtime. Runtime wiring is Task 4.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/core/chat-manager.ts
git commit -m "feat: add workflow chat response entry"
```

---

### Task 4: Wire Dot-Screen and Intent Screen Paths Through Workflow

**Files:**
- Modify: `src/core/chat-manager.ts`
- Modify: `src/main/main.ts`
- Test: `npm test`

**Interfaces:**
- Consumes:
  - `ResponseWorkflowOrchestrator.run(request)`
  - `ChatManager.setResponseWorkflowOrchestrator(orchestrator)`
- Produces:
  - Runtime behavior: screen summary and target pointer final replies are model-generated through `respondFromWorkflow`.

- [ ] **Step 1: Route `.` screen branch through workflow when available**

In `ChatManager.sendMessage`, inside the `if (userMessage.startsWith('.'))` block, replace the pointer branch and screen summary branch with this workflow-first version:

```ts
if (this.responseWorkflowOrchestrator) {
  const workflow = this.screenTargetPointer?.isPointerRequest(screenMessage)
    ? 'screen_target_pointer_response'
    : 'screen_summary_response';
  const workflowResult = await this.responseWorkflowOrchestrator.run({
    workflow,
    source: 'screen_dot',
    userText: userMessage,
    toolText: screenMessage,
  });
  if (workflowResult.status === 'handled') {
    this.memory.recordInteraction(
      workflow === 'screen_target_pointer_response' ? 'screen-target-pointer' : 'screen-analysis',
      screenMessage,
      this.stateManager.getCurrentState()
    );
    return;
  }
  if (workflowResult.fallbackMessage) {
    this.sendBubble(workflowResult.fallbackMessage);
  }
  return;
}

if (this.screenTargetPointer?.isPointerRequest(screenMessage)) {
  const pointerResult = await this.screenTargetPointer.handle(screenMessage);
  const assistantMessage = pointerResult.message || '屏幕指示请求已取消';
  this.memory.addMessage('user', userMessage);
  this.memory.addMessage('assistant', assistantMessage);
  this.memory.recordInteraction('screen-target-pointer', screenMessage, this.stateManager.getCurrentState());
  return;
}

this.sendBubble('正在看屏幕...');
const screenResult = await this.screenAnalyzer.analyze(screenMessage);
this.sendBubble(screenResult);
this.memory.addMessage('user', userMessage);
this.memory.addMessage('assistant', screenResult);
this.memory.recordInteraction('screen-analysis', screenMessage, this.stateManager.getCurrentState());
return;
```

This keeps the old direct output path as fallback when no workflow orchestrator has been injected.

- [ ] **Step 2: Update IntentExecutor screen handlers in main process**

In `src/main/main.ts`, add import:

```ts
import { ResponseWorkflowOrchestrator } from '../core/response-workflow-orchestrator';
```

Add module-level variable near `let intentExecutor: IntentExecutor;`:

```ts
let responseWorkflowOrchestrator: ResponseWorkflowOrchestrator;
```

After `chatManager.setScreenTargetPointer(screenTargetPointer);`, instantiate and inject:

```ts
responseWorkflowOrchestrator = new ResponseWorkflowOrchestrator({
  screenAnalyzer,
  screenTargetPointer,
  chatResponder: chatManager,
});
chatManager.setResponseWorkflowOrchestrator(responseWorkflowOrchestrator);
```

Then replace the existing `screenSummary` handler:

```ts
screenSummary: async (routed) => {
  const prompt = routed.request.text || '请总结当前屏幕';
  const result = await screenAnalyzer.analyze(prompt);
  return { status: 'handled', message: typeof result === 'string' ? result : JSON.stringify(result) };
},
```

with:

```ts
screenSummary: async (routed) => {
  const prompt = routed.request.text || '请总结当前屏幕';
  const result = await responseWorkflowOrchestrator.run({
    workflow: 'screen_summary_response',
    source: routed.request.source === 'voice_asr' ? 'voice_asr' : 'text_chat',
    userText: routed.request.text || prompt,
    toolText: prompt,
  });
  return {
    status: result.status === 'handled' ? 'handled' : 'failed',
    message: result.status === 'handled' ? '' : result.fallbackMessage,
    error: result.error,
    debug: { workflow: result.workflow, debugSummary: result.debugSummary },
  };
},
```

Replace the existing `screenTargetPointer` handler:

```ts
screenTargetPointer: async (routed) => {
  const target = routed.decision.target || routed.request.text || '';
  const pointerMessage = routed.request.text || target;
  const result = await screenTargetPointer.handle(pointerMessage);
  return {
    status: result.handled ? 'handled' : 'skipped',
    message: result.handled ? 'target pointer handled' : 'target pointer did not find a target',
  };
},
```

with:

```ts
screenTargetPointer: async (routed) => {
  const target = routed.decision.target || routed.request.text || '';
  const pointerMessage = routed.request.text || target;
  const result = await responseWorkflowOrchestrator.run({
    workflow: 'screen_target_pointer_response',
    source: routed.request.source === 'voice_asr' ? 'voice_asr' : 'text_chat',
    userText: routed.request.text || pointerMessage,
    toolText: pointerMessage,
  });
  return {
    status: result.status === 'handled' ? 'handled' : 'failed',
    message: result.status === 'handled' ? '' : result.fallbackMessage,
    error: result.error,
    debug: { workflow: result.workflow, debugSummary: result.debugSummary },
  };
},
```

- [ ] **Step 3: Adjust ChatManager intent assistant suppression**

In `tryHandleIntent`, keep the existing behavior of not showing an extra bubble for handled target pointer. Extend it to suppress handled screen summary too, because the workflow already produced the chat bubble.

Replace:

```ts
const shouldSuppressAssistantMessage =
  routed.decision.intent === 'screen_target_pointer' &&
  routed.permission.status === 'allowed' &&
  result.status === 'handled';
```

with:

```ts
const shouldSuppressAssistantMessage =
  (routed.decision.intent === 'screen_target_pointer' || routed.decision.intent === 'screen_summary') &&
  routed.permission.status === 'allowed' &&
  result.status === 'handled';
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

Expected: build and all contract tests pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/core/chat-manager.ts src/main/main.ts
git commit -m "feat: route screen responses through workflow"
```

---

### Task 5: Documentation and Final Verification

**Files:**
- Create: `docs/response-workflow-orchestrator.md`
- Modify: `PROJECT_INDEX.md`
- Modify: `VERSION.md`

**Interfaces:**
- Consumes:
  - Implemented `ResponseWorkflowOrchestrator`
  - Implemented `ChatManager.respondFromWorkflow`
- Produces:
  - Maintainer documentation for the new workflow boundary.

- [ ] **Step 1: Create maintainer workflow doc**

Create `docs/response-workflow-orchestrator.md`:

```md
# Response Workflow Orchestrator

Response Workflow Orchestrator is the boundary that turns already-authorized tool results into normal chat-model replies.

## Current scope

The first implementation handles:

- `screen_summary_response`
- `screen_target_pointer_response`

It does not classify intent and does not grant permissions. `IntentRouter` still owns classification and privacy gates.

## Runtime flow

```txt
IntentRouter / . screen entry
  -> ResponseWorkflowOrchestrator
  -> ScreenAnalyzer or ScreenTargetPointer
  -> WorkflowResponseContext
  -> ChatManager.respondFromWorkflow(...)
  -> normal <item> chat bubbles / TTS fallback
```

## Privacy rule

Raw screen observations are short-lived workflow context. They are not saved to long-term memory by default. The final user-visible model reply may be saved to chat history.

## Module boundaries

- `ScreenAnalyzer` owns screenshot and Vision analysis.
- `ScreenTargetPointer` owns target locating, stability checks, movement, and point visual.
- `ChatManager` owns model wording, `<item>` parsing, TTS fallback, and chat history.
- `BubbleOrchestrator` owns bubble delivery only.
```

- [ ] **Step 2: Update PROJECT_INDEX core module quick reference**

In `PROJECT_INDEX.md`, under the `core 模块速查` list, add these bullets near the intent/screen/chat entries:

```md
- `response-workflow-types.ts` / `response-workflow-orchestrator.ts`（Unreleased）：已授权工具结果到统一聊天模型输出的工作流边界；第一版接入屏幕总结和屏幕目标指向，把 `ScreenAnalyzer` / `ScreenTargetPointer` 的结构化结果转为短期 `WorkflowResponseContext`，再调用 `ChatManager.respondFromWorkflow(...)` 生成 `<item>` 气泡回复。原始屏幕 observation 不默认进入长期记忆。
- `intent-*.ts`（Unreleased）：多模态入口意图分类、权限闸门、debug 快照和薄执行分发；屏幕相关 allowed intent 会进入 Response Workflow，而不是由屏幕模块直接生成最终用户回复。
```

Also update the existing `屏幕目标指示` note so its last sentence includes:

```md
Unreleased 的 Response Workflow 接入后，目标定位和移动仍由 `ScreenTargetPointer` 执行，但最终说明文案通过 `ChatManager.respondFromWorkflow(...)` 统一生成聊天气泡。
```

- [ ] **Step 3: Update VERSION.md**

In `VERSION.md`, add an Unreleased bullet:

```md
- Response Workflow Orchestrator：屏幕总结和屏幕目标指向结果先转为短期 workflow context，再交给聊天模型生成统一 `<item>` 气泡回复；原始屏幕 observation 不默认进入长期记忆。
```

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run build
npm test
git status --short
```

Expected:

- `npm run build` exits 0.
- `npm test` exits 0 and includes `response-workflow contract tests passed`.
- `git status --short` shows only intended doc/code files plus any pre-existing unrelated files. The pre-existing unrelated file `docs/superpowers/plans/2026-07-16-qwen-asr-realtime-engine.md` may still be untracked and must not be included unless the user explicitly asks.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/response-workflow-orchestrator.md PROJECT_INDEX.md VERSION.md
git commit -m "docs: document response workflow orchestration"
```

- [ ] **Step 6: Final review summary**

Report:

```md
Implemented Response Workflow Orchestrator.

Verification:
- npm run build: passed
- npm test: passed

Commits:
- <commit hash> feat: add response workflow orchestrator
- <commit hash> feat: add workflow chat response entry
- <commit hash> feat: route screen responses through workflow
- <commit hash> docs: document response workflow orchestration

Note: pre-existing unrelated untracked file remains untouched: docs/superpowers/plans/2026-07-16-qwen-asr-realtime-engine.md
```

## Plan Self-Review

Spec coverage:

- Screen summary final reply through chat model: Task 1, Task 3, Task 4.
- Screen target pointer final reply through chat model: Task 1, Task 2, Task 3, Task 4.
- Existing action ownership preserved in `ScreenTargetPointer`: Task 2 and Task 4.
- Intent Router still gates access: Task 4 wires only allowed executor handlers and does not move permission checks.
- Raw observations not saved to long-term memory: Task 1 privacy type, Task 3 `respondFromWorkflow` only saves user-visible request/reply.
- BubbleOrchestrator remains delivery-only: Task 2 suppresses final direct pointer result bubble only for workflow runs; Task 3 keeps ChatManager as visible output path.
- Documentation and project index updates: Task 5.

Placeholder scan:

- The plan avoids open-ended implementation placeholders and provides exact code for new test, new types, new orchestrator, ChatManager methods, main wiring, and docs.

Type consistency:

- `WorkflowResponseContext`, `WorkflowChatResponseResult`, `ResponseWorkflowRequest`, and `ResponseWorkflowOrchestrator.run(...)` are defined in Task 1 and reused with the same names in Tasks 3 and 4.
- `ScreenTargetPointer.handle(message, options)` is defined in Task 2 and consumed in Task 1 orchestrator implementation.
- `ChatManager.respondFromWorkflow(context)` is defined in Task 3 and consumed by Task 1 orchestrator through `WorkflowChatResponder`.
