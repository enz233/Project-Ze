# AI Memory Storage Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract chat-history persistence from `AIMemory` into a focused `ChatHistoryStore` while preserving current memory behavior and public APIs.

**Architecture:** `AIMemory` remains the compatibility facade used by `ChatManager`, `ObserverManager`, debug IPC, and proactive systems. A new `ChatHistoryStore` owns only `chat-history.json` path construction, load/save, message append, counter reset, and recent-message reads. Summary generation, relationship tracking, habit tracking, app usage, and prompt rendering remain in `AIMemory`.

**Tech Stack:** Electron main process runtime config directory, TypeScript, Node `fs` / `path`, existing `ChatMessage` type from `src/core/ai-service.ts`.

## Global Constraints

- Start AIMemory layering with a small, safe storage extraction.
- Introduce a `ChatHistoryStore` responsible for chat-history JSON persistence and basic history operations.
- Keep `AIMemory` as the compatibility facade for existing callers in this iteration.
- Preserve current chat history file name, runtime location, message shape, summary cadence, relationship updates, and prompt behavior.
- Reuse `JsonConfigStore<T>` where appropriate for object-shaped JSON persistence.
- Do not fully split all AIMemory responsibilities in one iteration.
- Do not change chat prompt wording, memory summary cadence, or relationship scoring.
- Do not redesign the debug window or settings UI.
- Do not change IPC contracts.
- Do not migrate or rewrite existing user memory files beyond normal read/merge/write behavior.
- Do not introduce a database, schema validation library, or async storage layer.
- `npm run build` must pass.
- Run `npm test`; if it reports `Missing script: "test"`, record that exact result and do not claim tests passed.

---

## File Structure

- Create: `src/core/chat-history-store.ts` — focused chat-history persistence and basic history list operations.
- Modify: `src/core/ai-memory.ts` — keep public `AIMemory` API while delegating history persistence to `ChatHistoryStore`.
- Modify: `PROJECT_INDEX.md` — document the new storage seam.

`ChatHistoryStore` will not use `JsonConfigStore<T>` in this first extraction because the existing `AIMemory` constructor receives an explicit `configDir` from `AIConfigManager.getConfigDir()`. Keeping that constructor path preserves the exact runtime location. `JsonConfigStore<T>` remains appropriate for managers that already own `userData/config` internally.

---

## Task 1: Add `ChatHistoryStore` and delegate `AIMemory` history operations

**Files:**
- Create: `src/core/chat-history-store.ts`
- Modify: `src/core/ai-memory.ts`

**Interfaces:**
- Consumes: existing `configDir: string` passed into `new AIMemory(configDir)` and `ChatMessage` from `src/core/ai-service.ts`.
- Produces:
  - `export interface HistoryMessage { role: 'user' | 'assistant'; content: string; timestamp: number; }`
  - `export interface HistoryData { messages: HistoryMessage[]; sinceLastSummary: number; }`
  - `export class ChatHistoryStore { constructor(configDir: string); getData(): HistoryData; setData(data: HistoryData): void; addMessage(role, content): void; getRecentMessages(count): ChatMessage[]; getHistoryCount(): number; shouldSummarize(threshold): boolean; resetSinceLastSummary(): void; save(): void; }`
  - `AIMemory` with unchanged public methods: `addMessage`, `getRecentMessages`, `getHistoryCount`, `clearAll`, `shouldSummarize`, `buildSummaryMessages`, `applySummary`, `saveHistory`, and all existing memory/relationship/prompt methods.

- [ ] **Step 1: Create `ChatHistoryStore`**

Create `src/core/chat-history-store.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { ChatMessage } from './ai-service';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface HistoryData {
  messages: HistoryMessage[];
  sinceLastSummary: number;
}

export class ChatHistoryStore {
  private historyPath: string;
  private history: HistoryData;

  constructor(configDir: string) {
    this.historyPath = path.join(configDir, 'chat-history.json');
    this.history = this.load();
  }

  getData(): HistoryData {
    return this.history;
  }

  setData(data: HistoryData): void {
    this.history = data;
  }

  addMessage(role: 'user' | 'assistant', content: string): void {
    this.history.messages.push({
      role,
      content,
      timestamp: Date.now(),
    });
    this.history.sinceLastSummary++;
    this.save();
  }

  getRecentMessages(count: number): ChatMessage[] {
    const messages = this.history.messages;
    const start = Math.max(0, messages.length - count);
    return messages.slice(start).map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  getHistoryCount(): number {
    return this.history.messages.length;
  }

  shouldSummarize(threshold: number): boolean {
    return this.history.sinceLastSummary >= threshold;
  }

  resetSinceLastSummary(): void {
    this.history.sinceLastSummary = 0;
  }

  save(): void {
    try {
      const dir = path.dirname(this.historyPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2), 'utf-8');
    } catch (e) {
      console.error('[AIMemory] 保存历史失败:', e);
    }
  }

  private load(): HistoryData {
    try {
      if (fs.existsSync(this.historyPath)) {
        const raw = fs.readFileSync(this.historyPath, 'utf-8');
        const data = JSON.parse(raw);
        return {
          messages: Array.isArray(data.messages) ? data.messages : [],
          sinceLastSummary: data.sinceLastSummary || 0,
        };
      }
    } catch (e) {
      console.error('[AIMemory] 加载历史失败:', e);
    }
    return { messages: [], sinceLastSummary: 0 };
  }
}
```

- [ ] **Step 2: Update `AIMemory` imports and history fields**

In `src/core/ai-memory.ts`, keep existing `fs` and `path` imports because memory profile persistence still uses them.

Add:

```ts
import { ChatHistoryStore, HistoryData } from './chat-history-store';
```

Delete the local `HistoryMessage` and `HistoryData` interface declarations from `src/core/ai-memory.ts`.

Replace these fields:

```ts
private historyPath: string;
private memoryPath: string;
private history: HistoryData;
private memory: MemoryData;
```

with:

```ts
private historyStore: ChatHistoryStore;
private memoryPath: string;
private memory: MemoryData;
```

- [ ] **Step 3: Update `AIMemory` constructor**

Replace the constructor body:

```ts
constructor(configDir: string) {
  this.historyPath = path.join(configDir, 'chat-history.json');
  this.memoryPath = path.join(configDir, 'ai-memory.json');
  this.history = this.loadHistory();
  this.memory = this.loadMemory();
}
```

with:

```ts
constructor(configDir: string) {
  this.historyStore = new ChatHistoryStore(configDir);
  this.memoryPath = path.join(configDir, 'ai-memory.json');
  this.memory = this.loadMemory();
}
```

- [ ] **Step 4: Remove local history persistence implementation**

Delete the private `loadHistory(): HistoryData` method from `src/core/ai-memory.ts`.

Replace `saveHistory()` with:

```ts
saveHistory(): void {
  this.historyStore.save();
}
```

- [ ] **Step 5: Delegate simple history operations**

Replace `addMessage`, `getRecentMessages`, `getHistoryCount`, and the history part of `clearAll` with:

```ts
addMessage(role: 'user' | 'assistant', content: string): void {
  this.historyStore.addMessage(role, content);
  this.memory.totalMessages++;
}

getRecentMessages(count: number): ChatMessage[] {
  return this.historyStore.getRecentMessages(count);
}

getHistoryCount(): number {
  return this.historyStore.getHistoryCount();
}

clearAll(): void {
  this.historyStore.setData({ messages: [], sinceLastSummary: 0 });
  this.memory = this.createDefaultMemory();
  this.saveHistory();
  this.saveMemory();
}
```

- [ ] **Step 6: Delegate summary counter operations while preserving prompt text**

Replace `shouldSummarize()` with:

```ts
shouldSummarize(): boolean {
  return this.historyStore.shouldSummarize(SUMMARY_THRESHOLD);
}
```

In `applySummary(summary: string)`, replace:

```ts
this.history.sinceLastSummary = 0;
```

with:

```ts
this.historyStore.resetSinceLastSummary();
```

Do not change the Chinese summary system prompt text in `buildSummaryMessages()`.

- [ ] **Step 7: Update startup/shutdown history length checks**

In `summarizeOnStartup(aiService: any)`, replace:

```ts
if (this.history.messages.length < 5) return;
```

with:

```ts
if (this.getHistoryCount() < 5) return;
```

In `summarizeOnShutdown(aiService: any)`, replace:

```ts
if (this.history.messages.length < 5) return;
if (this.history.sinceLastSummary < 5) return;
```

with:

```ts
if (this.getHistoryCount() < 5) return;
if (!this.historyStore.shouldSummarize(5)) return;
```

- [ ] **Step 8: Run build**

Run:

```bash
npm run build
```

Expected: `tsc` exits 0. Fix only TypeScript errors caused by the history extraction.

- [ ] **Step 9: Verify callers still use `AIMemory` facade**

Run:

```bash
git grep -n "ChatHistoryStore\|new AIMemory\|AIMemory" -- src
```

Expected:

- `ChatHistoryStore` appears in `src/core/chat-history-store.ts` and `src/core/ai-memory.ts`.
- Existing callers such as `chat-manager.ts`, `observer-manager.ts`, and `proactive-reaction-system.ts` still use `AIMemory`.
- No caller outside `ai-memory.ts` constructs `ChatHistoryStore`.

- [ ] **Step 10: Verify history file name and prompt-sensitive lines**

Run:

```bash
git grep -n "chat-history.json\|SUMMARY_THRESHOLD\|SUMMARY_REQUEST_COUNT\|MAX_SUMMARY_LENGTH\|对话摘要助手\|好感度曲线" -- src/core/ai-memory.ts src/core/chat-history-store.ts
```

Expected:

- `chat-history.json` appears in `src/core/chat-history-store.ts`.
- Summary constants and prompt text remain in `src/core/ai-memory.ts`.
- Relationship scoring comments/logic remain in `src/core/ai-memory.ts`.

- [ ] **Step 11: Commit Task 1**

Run:

```bash
git add src/core/chat-history-store.ts src/core/ai-memory.ts
git commit -m "refactor: add chat history store"
```

---

## Task 2: Update architecture notes and run final verification

**Files:**
- Modify: `PROJECT_INDEX.md`

**Interfaces:**
- Consumes: `ChatHistoryStore` from Task 1 and unchanged `AIMemory` facade.
- Produces: project documentation that records the new AI memory storage boundary.

- [ ] **Step 1: Update core module list in `PROJECT_INDEX.md`**

In `PROJECT_INDEX.md`, add this item near the existing AI memory/core module bullets:

```md
- `chat-history-store.ts`：聊天历史持久化边界，负责 `chat-history.json` 的读写、最近消息读取和摘要计数；`ai-memory.ts` 仍作为记忆 facade 负责摘要、关系、习惯和 prompt 组装。
```

- [ ] **Step 2: Update AI memory architecture note**

In `PROJECT_INDEX.md`, update the memory bullet under `### AI 系统` to this wording:

```md
- **记忆**：`AIMemory` 作为兼容 facade，负责摘要、关系数值、轻量互动习惯、常用应用和 Prompt 记忆渲染；聊天历史持久化已下沉到 `ChatHistoryStore`，运行时仍写入 Electron `userData/config/chat-history.json`。
```

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: `tsc` exits 0.

- [ ] **Step 4: Run npm test and record exact status**

Run:

```bash
npm test
```

Expected for the current project unless a test script was added:

```text
npm error Missing script: "test"
```

Record this as “test script missing” and do not report tests as passing. If a test script exists, it must pass before continuing.

- [ ] **Step 5: Run final memory-boundary verification commands**

Run:

```bash
git grep -n "ChatHistoryStore\|new AIMemory\|AIMemory" -- src
git grep -n "chat-history.json\|SUMMARY_THRESHOLD\|SUMMARY_REQUEST_COUNT\|MAX_SUMMARY_LENGTH\|对话摘要助手\|好感度曲线" -- src/core/ai-memory.ts src/core/chat-history-store.ts
git diff --check
```

Expected:

- `ChatHistoryStore` appears only in `src/core/chat-history-store.ts` and `src/core/ai-memory.ts`.
- Existing callers still use `AIMemory`.
- `chat-history.json` is preserved in `ChatHistoryStore`.
- Summary constants, summary prompt text, and relationship scoring logic remain in `AIMemory`.
- `git diff --check` reports no whitespace errors. CRLF warnings are acceptable on Windows.

- [ ] **Step 6: Run final status check**

Run:

```bash
git status --short
```

Expected: only `PROJECT_INDEX.md` is modified before the docs commit.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add PROJECT_INDEX.md
git commit -m "docs: update ai memory architecture notes"
```

## Self-Review

Spec coverage:

- `ChatHistoryStore` introduced: Task 1.
- `AIMemory` remains compatibility facade: Task 1 delegates only history storage; existing callers remain on `AIMemory` and Task 2 verifies this.
- Chat history file name and runtime location preserved: Task 1 keeps `configDir/chat-history.json` in `ChatHistoryStore`.
- Summary cadence, relationship updates, and prompt behavior preserved: Task 1 keeps constants/prompt/scoring in `AIMemory`; Task 2 verifies sensitive strings.
- Debug window, settings UI, IPC, database/schema/async storage remain unchanged: no such files or dependencies are in the task file lists.
- Documentation update: Task 2.
- Build and npm test status: Task 2 final verification.

Placeholder scan: no unfinished placeholder markers remain. Every code-changing step includes exact code or exact replacement snippets.

Type consistency:

- `HistoryMessage` and `HistoryData` are exported by `chat-history-store.ts` and `HistoryData` is imported by `ai-memory.ts` only for `setData` shape if needed.
- `ChatHistoryStore` methods used by `AIMemory` match their definitions: `addMessage`, `getRecentMessages`, `getHistoryCount`, `shouldSummarize`, `resetSinceLastSummary`, `setData`, and `save`.
- `AIMemory` public methods keep their existing names and signatures.
