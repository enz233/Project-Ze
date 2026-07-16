# Chat Bubble Long Reply Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chat replies split into natural short bubbles, with step/list replies shown as one step per bubble.

**Architecture:** Add a focused pure TypeScript splitter module and contract test it before wiring it into `ChatManager`. Keep renderer bubble display unchanged; `ChatManager` remains the only place that turns model text into bubble/TTS segments.

**Tech Stack:** Electron + TypeScript + CommonJS build, Node `assert` contract tests, existing `npm run build` / `npm test` pipeline.

## Global Constraints

- Prefer project docs for context; avoid reading broad source files unless needed.
- Do not change renderer bubble layout, position, style, or 3-second auto-hide behavior.
- Keep existing `<item>` response format, TTS fallback, chat history, and Response Workflow output chain intact.
- Ordinary chat should remain short and companion-like; do not introduce long-form chat UI.
- Target bubble length is about 36-48 Chinese characters; hard fallback max is 64 JavaScript characters.
- Step/list content should split one step/list item per bubble when at least two step boundaries are detected.
- Complete task updates must include documentation and git commits.

---

## File Structure

- Create `src/core/chat-bubble-splitter.ts`
  - Pure helper responsible only for splitting a single text item into bubble-sized strings.
  - Exports `splitBubbleText(text: string, options?: SplitBubbleTextOptions): string[]`.
  - No Electron, AI, TTS, or memory dependencies.

- Create `scripts/chat-bubble-splitter-contract.test.js`
  - Node contract tests against built `dist/core/chat-bubble-splitter.js`.
  - Covers normal sentence splitting, step/list splitting, fallback text, and hard-cut fallback.

- Modify `src/core/chat-manager.ts`
  - Import `splitBubbleText`.
  - Replace current fixed `splitText(t, 30)` path with the new helper.
  - Update `RESPONSE_FORMAT_PROMPT` copy so the model proactively emits one natural unit per `<item>` and one step per `<item>`.
  - Remove the old private `splitText` method after the new helper is wired.

- Modify `package.json`
  - Add `node scripts/chat-bubble-splitter-contract.test.js` to the `test` script after `npm run build` and near other contract tests.

- Modify `PROJECT_INDEX.md`
  - Update AI system notes and/or `chat-manager.ts` quick reference to mention semantic bubble splitting and step-per-bubble behavior.

- Modify `VERSION.md`
  - Add an Unreleased bullet for chat long reply bubble splitting.

---

### Task 1: Add Pure Chat Bubble Splitter

**Files:**
- Create: `src/core/chat-bubble-splitter.ts`
- Create: `scripts/chat-bubble-splitter-contract.test.js`
- Modify: `package.json:6-13`

**Interfaces:**
- Consumes: raw model item text as `string`.
- Produces:
  - `interface SplitBubbleTextOptions { targetLength?: number; maxLength?: number }`
  - `function splitBubbleText(text: string, options?: SplitBubbleTextOptions): string[]`
  - Returned array contains trimmed non-empty bubble strings.

- [ ] **Step 1: Write the failing contract test**

Create `scripts/chat-bubble-splitter-contract.test.js` with this content:

```js
const assert = require('assert');

function load(modulePath) {
  return require(`../dist/${modulePath}`);
}

function assertMaxLength(parts, maxLength) {
  for (const part of parts) {
    assert.ok(part.length <= maxLength, `${part} length ${part.length} > ${maxLength}`);
  }
}

function testNaturalSentenceSplitting() {
  const { splitBubbleText } = load('core/chat-bubble-splitter.js');
  const parts = splitBubbleText('我先帮你看一下这个页面。这里信息有点多，我会慢慢说清楚。你不用急。');

  assert.deepStrictEqual(parts, [
    '我先帮你看一下这个页面。',
    '这里信息有点多，我会慢慢说清楚。你不用急。',
  ]);
  assertMaxLength(parts, 64);
}

function testNumberedStepsSplitOneStepPerBubble() {
  const { splitBubbleText } = load('core/chat-bubble-splitter.js');
  const parts = splitBubbleText('1. 先打开设置页。2. 找到语音输入区域。3. 点一下测试按钮。');

  assert.deepStrictEqual(parts, [
    '1. 先打开设置页。',
    '2. 找到语音输入区域。',
    '3. 点一下测试按钮。',
  ]);
}

function testChineseStepLabelsSplitOneStepPerBubble() {
  const { splitBubbleText } = load('core/chat-bubble-splitter.js');
  const parts = splitBubbleText('第一步：先确认麦克风权限。第二步：再按住快捷键说话。');

  assert.deepStrictEqual(parts, [
    '第一步：先确认麦克风权限。',
    '第二步：再按住快捷键说话。',
  ]);
}

function testBulletListSplitsOneItemPerBubble() {
  const { splitBubbleText } = load('core/chat-bubble-splitter.js');
  const parts = splitBubbleText('- 先看右上角的按钮\n- 再点下载\n- 最后确认弹窗');

  assert.deepStrictEqual(parts, [
    '- 先看右上角的按钮',
    '- 再点下载',
    '- 最后确认弹窗',
  ]);
}

function testDoesNotOversplitShortNaturalItem() {
  const { splitBubbleText } = load('core/chat-bubble-splitter.js');
  const parts = splitBubbleText('可以呀，我来帮你看看。');

  assert.deepStrictEqual(parts, ['可以呀，我来帮你看看。']);
}

function testHardCutsLongTextWithoutPunctuation() {
  const { splitBubbleText } = load('core/chat-bubble-splitter.js');
  const text = '这是一段没有任何标点的超长文本'.repeat(6);
  const parts = splitBubbleText(text, { maxLength: 24, targetLength: 18 });

  assert.ok(parts.length > 1);
  assertMaxLength(parts, 24);
  assert.strictEqual(parts.join(''), text);
}

function run() {
  testNaturalSentenceSplitting();
  testNumberedStepsSplitOneStepPerBubble();
  testChineseStepLabelsSplitOneStepPerBubble();
  testBulletListSplitsOneItemPerBubble();
  testDoesNotOversplitShortNaturalItem();
  testHardCutsLongTextWithoutPunctuation();
  console.log('chat bubble splitter contract tests passed');
}

run();
```

- [ ] **Step 2: Add the test command to package.json**

Modify the `test` script in `package.json` so it includes the new contract test immediately after `npm run build`:

```json
"test": "npm run build && node scripts/chat-bubble-splitter-contract.test.js && node scripts/voice-input-contract.test.js && node scripts/screen-fingerprint-contract.test.js && node scripts/screen-capture-frame-contract.test.js && node scripts/screen-pointer-debug-contract.test.js && node scripts/screen-vision-request-contract.test.js && node scripts/point-visual-guard-contract.test.js && node scripts/intent-router-contract.test.js && node scripts/response-workflow-contract.test.js"
```

- [ ] **Step 3: Run the new test to verify it fails**

Run:

```bash
npm run build && node scripts/chat-bubble-splitter-contract.test.js
```

Expected: FAIL with a module-not-found error for `../dist/core/chat-bubble-splitter.js`.

- [ ] **Step 4: Implement the splitter module**

Create `src/core/chat-bubble-splitter.ts` with this content:

```ts
export interface SplitBubbleTextOptions {
  targetLength?: number;
  maxLength?: number;
}

const DEFAULT_TARGET_LENGTH = 44;
const DEFAULT_MAX_LENGTH = 64;

const STEP_MARKER_PATTERN = /(?:^|\n|\s)(?:\d+[.、）)]|（\d+）|步骤\s*(?:\d+|[一二三四五六七八九十]+)[:：]|第[一二三四五六七八九十]+步[:：]|[-•])\s*/g;
const STRONG_BOUNDARY_PATTERN = /([。！？!?；;])/;
const WEAK_BOUNDARY_PATTERN = /([，,、：:])/;

export function splitBubbleText(text: string, options: SplitBubbleTextOptions = {}): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const targetLength = options.targetLength ?? DEFAULT_TARGET_LENGTH;
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;

  const stepParts = splitByStepMarkers(normalized);
  if (stepParts.length >= 2) {
    return stepParts.flatMap(part => splitNonStepText(part, targetLength, maxLength));
  }

  return splitNonStepText(normalized, targetLength, maxLength);
}

function splitByStepMarkers(text: string): string[] {
  const matches = Array.from(text.matchAll(STEP_MARKER_PATTERN));
  if (matches.length < 2) return [text];

  const parts: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
    const part = text.slice(start, end).trim();
    if (part) parts.push(part);
  }

  return parts.length >= 2 ? parts : [text];
}

function splitNonStepText(text: string, targetLength: number, maxLength: number): string[] {
  const paragraphParts = text
    .split(/\n+/)
    .map(part => part.trim())
    .filter(Boolean);

  const parts = paragraphParts.length > 1 ? paragraphParts : [text.trim()];
  return packChunks(
    parts.flatMap(part => splitByBoundary(part, STRONG_BOUNDARY_PATTERN))
      .flatMap(part => part.length > maxLength ? splitByBoundary(part, WEAK_BOUNDARY_PATTERN) : [part])
      .flatMap(part => hardCut(part, maxLength)),
    targetLength,
    maxLength
  );
}

function splitByBoundary(text: string, boundaryPattern: RegExp): string[] {
  const tokens = text.split(boundaryPattern).filter(token => token.length > 0);
  const parts: string[] = [];
  let current = '';

  for (const token of tokens) {
    current += token;
    if (boundaryPattern.test(token)) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = '';
    }
  }

  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);
  return parts.length > 0 ? parts : [text.trim()];
}

function hardCut(text: string, maxLength: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed ? [trimmed] : [];

  const parts: string[] = [];
  for (let i = 0; i < trimmed.length; i += maxLength) {
    parts.push(trimmed.slice(i, i + maxLength));
  }
  return parts;
}

function packChunks(chunks: string[], targetLength: number, maxLength: number): string[] {
  const result: string[] = [];
  let current = '';

  for (const chunk of chunks.map(c => c.trim()).filter(Boolean)) {
    if (!current) {
      current = chunk;
      continue;
    }

    const merged = current + chunk;
    if (merged.length <= targetLength || (current.length < targetLength && merged.length <= maxLength)) {
      current = merged;
      continue;
    }

    result.push(current);
    current = chunk;
  }

  if (current) result.push(current);
  return result.length > 0 ? result : chunks;
}
```

- [ ] **Step 5: Run the new test to verify it passes**

Run:

```bash
npm run build && node scripts/chat-bubble-splitter-contract.test.js
```

Expected: PASS and prints `chat bubble splitter contract tests passed`.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json src/core/chat-bubble-splitter.ts scripts/chat-bubble-splitter-contract.test.js
git commit -m "feat(chat): add bubble text splitter"
```

---

### Task 2: Wire Splitter Into ChatManager and Prompt

**Files:**
- Modify: `src/core/chat-manager.ts:1-20`
- Modify: `src/core/chat-manager.ts:234-260`
- Modify: `src/core/chat-manager.ts:322-364`
- Modify: `src/core/chat-manager.ts:560-568`
- Test: `scripts/chat-bubble-splitter-contract.test.js`

**Interfaces:**
- Consumes: `splitBubbleText(text: string): string[]` from `src/core/chat-bubble-splitter.ts`.
- Produces: `ChatManager.deliverAssistantResponse(...)` uses semantic bubble splitting for both TTS and non-TTS paths.

- [ ] **Step 1: Add a contract test for `<item>`-style content expectations**

Append this test function to `scripts/chat-bubble-splitter-contract.test.js` before `run()`:

```js
function testModelPackedMultipleStepsStillSplits() {
  const { splitBubbleText } = load('core/chat-bubble-splitter.js');
  const parts = splitBubbleText('可以，1. 先打开设置。2. 再找到聊天配置。');

  assert.deepStrictEqual(parts, [
    '1. 先打开设置。',
    '2. 再找到聊天配置。',
  ]);
}
```

Then call it inside `run()`:

```js
  testModelPackedMultipleStepsStillSplits();
```

- [ ] **Step 2: Run test to verify current splitter behavior**

Run:

```bash
npm run build && node scripts/chat-bubble-splitter-contract.test.js
```

Expected: if the helper already drops the leading conversational prefix when steps are present, PASS; if it returns an extra `可以，`, FAIL. If it fails, adjust `splitByStepMarkers()` so step splitting starts from the first detected step marker and ignores leading preface text shorter than 12 characters.

Use this replacement for `splitByStepMarkers()` if needed:

```ts
function splitByStepMarkers(text: string): string[] {
  const matches = Array.from(text.matchAll(STEP_MARKER_PATTERN));
  if (matches.length < 2) return [text];

  const firstStart = matches[0].index ?? 0;
  const leading = text.slice(0, firstStart).trim();
  const parts: string[] = [];

  if (leading.length >= 12) {
    parts.push(leading);
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
    const part = text.slice(start, end).trim();
    if (part) parts.push(part);
  }

  return parts.length >= 2 ? parts : [text];
}
```

- [ ] **Step 3: Import the splitter in ChatManager**

At the top of `src/core/chat-manager.ts`, add this import near the other core imports:

```ts
import { splitBubbleText } from './chat-bubble-splitter';
```

- [ ] **Step 4: Replace fixed 30-character split logic**

In `deliverAssistantResponse(...)`, replace this block:

```ts
    const texts: string[] = [];
    for (const t of rawTexts) {
      if (t.length > 30) {
        const parts = this.splitText(t, 30);
        texts.push(...parts);
      } else {
        texts.push(t);
      }
    }
```

with:

```ts
    const texts = rawTexts.flatMap(t => splitBubbleText(t));
```

- [ ] **Step 5: Remove the old private splitText method**

Delete the entire old method from `src/core/chat-manager.ts`:

```ts
  /** 拆分长文本，按标点或字数拆分 */
  private splitText(text: string, maxLen: number): string[] {
    const parts: string[] = [];
    // 先按中文标点拆分
    const sentences = text.split(/([。！？，；：、\n])/);
    let current = '';
    for (const s of sentences) {
      if (current.length + s.length > maxLen && current.length > 0) {
        parts.push(current.trim());
        current = '';
      }
      current += s;
    }
    if (current.trim()) {
      parts.push(current.trim());
    }
    // 如果还有超长的，硬切
    const result: string[] = [];
    for (const p of parts) {
      if (p.length > maxLen) {
        for (let i = 0; i < p.length; i += maxLen) {
          result.push(p.slice(i, i + maxLen));
        }
      } else {
        result.push(p);
      }
    }
    return result.length > 0 ? result : [text];
  }
```

- [ ] **Step 6: Update RESPONSE_FORMAT_PROMPT**

Replace the prompt at the bottom of `src/core/chat-manager.ts` with:

```ts
/** 回复格式提示词 */
const RESPONSE_FORMAT_PROMPT = `回复格式要求：
你需要使用xml格式输出回复。每个回复用<item>标签包裹。
每个<item>只放一个自然语义单元，像一个短气泡里说的一句话。
如果回答包含步骤、清单或操作顺序，请把每一步单独放进一个<item>，不要把多个步骤塞进同一个<item>。
以下是普通回复例子:
<item>今天天气真好呀~</item>
<item>你在做什么呢？</item>

以下是步骤回复例子:
<item>第一步，先打开设置页。</item>
<item>第二步，找到语音输入区域。</item>
<item>第三步，点一下测试按钮。</item>

你的回复要简短可爱，一般1-3句话就好。`;
```

- [ ] **Step 7: Run focused verification**

Run:

```bash
npm run build && node scripts/chat-bubble-splitter-contract.test.js
```

Expected: PASS and prints `chat bubble splitter contract tests passed`.

- [ ] **Step 8: Run full test suite**

Run:

```bash
npm test
```

Expected: build passes and all contract tests pass, including `chat bubble splitter contract tests passed` and the existing response workflow contract tests.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/core/chat-manager.ts scripts/chat-bubble-splitter-contract.test.js
git commit -m "feat(chat): use semantic bubble splitting"
```

---

### Task 3: Update Project Documentation

**Files:**
- Modify: `PROJECT_INDEX.md:124-128`
- Modify: `PROJECT_INDEX.md:203-207`
- Modify: `VERSION.md:5-21`

**Interfaces:**
- Consumes: implemented `splitBubbleText(...)` behavior and prompt changes from Tasks 1-2.
- Produces: docs describing current chat bubble splitting behavior for future agents.

- [ ] **Step 1: Update AI system note in PROJECT_INDEX**

In `PROJECT_INDEX.md`, replace the current AI system bullet:

```md
- **对话**：流式调用，解析 `<item>` 标签逐条显示气泡
```

with:

```md
- **对话**：流式调用，解析 `<item>` 标签逐条显示气泡；聊天回复会经过语义气泡拆分兜底，普通长句按自然标点拆成短气泡，步骤/清单类内容按“一步一个气泡”显示
```

- [ ] **Step 2: Update common modification scenario in PROJECT_INDEX**

Under `### 修改 AI 行为`, replace:

```md
- 回复格式：`chat-manager.ts` 的 RESPONSE_FORMAT_PROMPT
```

with:

```md
- 回复格式：`chat-manager.ts` 的 RESPONSE_FORMAT_PROMPT；长回复气泡拆分规则在 `chat-bubble-splitter.ts`
```

- [ ] **Step 3: Add VERSION Unreleased bullet**

In `VERSION.md`, add this bullet near the top of the `## Unreleased` list:

```md
- 聊天气泡长回复拆分优化：回复格式提示词要求短气泡和步骤一泡一步，新增语义气泡拆分兜底，普通长句按自然标点拆分，步骤/清单类内容按项显示，避免固定 30 字符机械切碎。
```

- [ ] **Step 4: Run documentation-adjacent verification**

Run:

```bash
npm test
```

Expected: build and all contract tests pass. Documentation edits should not affect runtime, so any failure means a previous code change regressed.

- [ ] **Step 5: Commit Task 3**

```bash
git add PROJECT_INDEX.md VERSION.md
git commit -m "docs(chat): document bubble splitting behavior"
```

---

### Task 4: Final Verification and Cleanup

**Files:**
- Inspect: `git status`
- No required source modifications unless verification exposes an issue.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified working tree with commits and no uncommitted task changes except unrelated pre-existing user work.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS. Confirm these lines appear among the output:

```text
chat bubble splitter contract tests passed
response-workflow contract tests passed
```

- [ ] **Step 2: Check git status**

Run:

```bash
git status --short
```

Expected: no uncommitted changes from this task. Pre-existing unrelated changes may still appear; do not stage or commit them.

- [ ] **Step 3: If verification required fixes, commit them**

Only if Step 1 or Step 2 found task-related issues and you fixed them, commit the exact files touched:

```bash
git add src/core/chat-bubble-splitter.ts src/core/chat-manager.ts scripts/chat-bubble-splitter-contract.test.js package.json PROJECT_INDEX.md VERSION.md
git commit -m "fix(chat): stabilize bubble splitting"
```

Expected: commit succeeds, or Git reports nothing to commit if no fixes were needed.

- [ ] **Step 4: Report final outcome**

Final response should include:

```md
完成：聊天长回复现在会语义拆成短气泡，步骤/清单会一步一泡。
验证：`npm test` 通过。
提交：列出本计划产生的 commit hash 和标题。
```

---

## Self-Review Notes

- Spec coverage: prompt update is Task 2; local semantic splitter is Tasks 1-2; tests are Tasks 1-2; documentation is Task 3; final verification is Task 4.
- Placeholder scan: no unresolved placeholders or vague implementation steps; code-changing steps include exact code blocks.
- Type consistency: `splitBubbleText(text: string, options?: SplitBubbleTextOptions): string[]` is defined in Task 1 and consumed unchanged in Task 2.
